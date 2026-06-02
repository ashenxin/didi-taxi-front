<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { showConfirmDialog, showToast } from 'vant'

import { API_BASE_URL, getJson, postJson } from './api/http'
import { passengerWsStreamUrl, resolvePassengerWsOrigin, tryParseEnvelope } from './utils/passengerOrderWs'
import { useAuth } from './features/auth/useAuth'
import {
  CANCEL_BY_SYSTEM,
  formatOrderStatus,
  isTerminalOrderStatus,
  orderStatusCode,
  passengerCanCancel,
} from './utils/orderStatus'

const themeVars = {
  primaryColor: '#1989fa',
  successColor: '#07c160',
  radiusMd: '12px',
  buttonRadius: '999px',
  cellGroupInsetPadding: '0 12px',
  cellFontSize: '15px',
  cellTextColor: '#323233',
  navBarIconColor: '#1989fa',
}

const CITY_NAME_MAP = {
  '330100': '杭州',
}

const PRODUCT_NAME_MAP = {
  ECONOMY: '快车',
  COMFORT: '专车',
}

const fixed = reactive({
  provinceCode: '330000',
  cityCode: '330100',
  productCode: 'ECONOMY',
  origin: {
    name: '杭州火车东站',
    address: '浙江省杭州市上城区全福桥路2号杭州东站',
    /** WGS84，与 BFF 派单 GEO 一致；有 lat/lng 时服务端可直接按上车点做最近司机匹配 */
    lat: 30.2525,
    lng: 120.2156,
  },
  dest: {
    name: '龙翔桥地铁站',
    address: '浙江省杭州市上城区湖滨街道龙翔桥地铁站',
    lat: 30.2635,
    lng: 120.1655,
  },
})

const loading = ref(false)
const lastRequest = ref(null)
const lastResponse = ref(null)
const lastError = ref(null)

const trackingOrderNo = ref('')
const liveOrderDetail = ref(null)
let orderPollTimer = null

const POLL_MS_FAST = 2000
/** 设为 false 则仅 HTTP 轮询（可与后端 passenger.ws.enabled 同时对齐关闭）。 */
const WS_ENABLED =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_PASSENGER_WS_ENABLED !== 'false'
const WS_PING_MS = 25_000

const wsConnected = ref(false)
const passengerHomeTab = ref('home')
const rideSheetLift = ref(0)
const rideSheetMaxLift = ref(0)

const RIDE_SHEET_BASE_HEIGHT = 300
const RIDE_SHEET_TOP_GAP = 18
const RIDE_SHEET_NAV_HEIGHT = 50
let rideSheetDragStartY = 0
let rideSheetDragStartLift = 0
let rideSheetDragging = false

let orderSocket = null
let wsPingInterval = null
let wsReconnectTimeout = null
let detailDebounceTimeout = null
let wsReconnectAttempt = 0
let lastHandledSeqByOrderNo = {}
/** 防止「主动关旧连换小票」时旧 socket 的 close 再去调度重连，导致周期性误打 ws-token */
let wsConnGeneration = 0

const {
  authed,
  authTab,
  phone,
  password,
  smsCode,
  smsSending,
  smsSendDisabled,
  smsSendButtonType,
  smsSendButtonText,
  smsHint,
  authLoading,
  authError,
  sendSms,
  loginSms,
  loginPassword,
  logout,
  maybeDropToLogin,
  switchLoginMode,
} = useAuth()

watch(authed, (v) => {
  if (v) {
    passengerHomeTab.value = 'home'
  }
})

/** 仅反映 POST 下单接口返回体里的 status，不随后续轮询更新 */
const createStatusText = computed(() => formatOrderStatus(lastResponse.value?.status))
const liveStatusCode = computed(() => orderStatusCode(liveOrderDetail.value?.status))

/**
 * 主展示用状态：跟踪中同一单时以轮询为准；调试区第一行仍为「接口返回时」的固定快照。
 */
const displayOrderStatus = computed(() => {
  const tracking = trackingOrderNo.value
  if (tracking && liveOrderDetail.value?.orderNo === tracking) {
    return liveOrderDetail.value.status
  }
  if (!tracking && liveOrderDetail.value?.orderNo) {
    return liveOrderDetail.value.status
  }
  return lastResponse.value?.status
})
const displayStatusText = computed(() => formatOrderStatus(displayOrderStatus.value))
const displayStatusCode = computed(() => orderStatusCode(displayOrderStatus.value))
const isReDispatching = computed(() => {
  const d = liveOrderDetail.value
  if (!trackingOrderNo.value || !d) return false
  return orderStatusCode(d.status) === 0 && d.reDispatching === true
})
const displayStatusTextFinal = computed(() => (isReDispatching.value ? '正在为您重新派单' : displayStatusText.value))
const showCancelOrder = computed(() => {
  if (!trackingOrderNo.value) return false
  const c = liveStatusCode.value
  if (c === undefined || c === null) return true
  return passengerCanCancel(c)
})

/**
 * 立即下单是否应禁用：有「跟踪中」订单且状态未达终态（非 FINISHED/CANCELLED），或状态尚未拉回。
 * 仅刷新页面会清空本地跟踪态；若服务端仍有进行中单，依赖 POST 409 兜底。
 */
const placeOrderBlock = computed(() => {
  if (!trackingOrderNo.value) {
    return { disabled: false, hint: '' }
  }
  const c = displayStatusCode.value
  if (c === undefined || c === null) {
    return { disabled: true, hint: '正在同步订单状态，暂不可重复下单' }
  }
  if (isTerminalOrderStatus(c)) {
    return { disabled: false, hint: '' }
  }
  return {
    disabled: true,
    hint: '您还有一单未完成，请等行程结束或取消该单后，再下新单',
  }
})

const placeOrderDisabled = computed(
  () => loading.value || (authed.value && placeOrderBlock.value.disabled),
)

/** 主按钮禁用态：优先展示当前订单状态（如「派单中」），避免整段流程只看见「您还有一单未完成」 */
const placeOrderButtonText = computed(() => {
  if (loading.value) return '正在下单…'
  if (!authed.value || !placeOrderBlock.value.disabled) return '立即下单'
  const h = placeOrderBlock.value.hint || ''
  if (h.includes('同步')) return '正在同步订单…'
  const label = displayStatusText.value
  if (label && label !== '-') return label
  return '您还有一单未完成'
})
const callButtonText = computed(() => {
  if (loading.value) return '正在呼叫…'
  if (authed.value && placeOrderBlock.value.disabled) return placeOrderButtonText.value
  return '立即呼叫'
})
const activeOrderDetail = computed(() => liveOrderDetail.value || lastResponse.value || {})
const visibleOrderNo = computed(() => trackingOrderNo.value || activeOrderDetail.value?.orderNo || '')
const trackingStatusCode = computed(() => displayStatusCode.value)
const trackingHeadline = computed(() => {
  const c = trackingStatusCode.value
  if (isReDispatching.value) return '正在重新为你寻找车辆'
  if (c === 0) return '正在为你寻找车辆'
  if (c === 1 || c === 7) return '已派单，等待司机确认'
  if (c === 2) return '司机已接单'
  if (c === 3) return '司机已到达上车点'
  if (c === 4) return '行程进行中'
  if (c === 5) return '行程已完成'
  if (c === 6) return '订单已取消'
  return displayStatusTextFinal.value || '订单处理中'
})
const trackingSubtitle = computed(() => {
  const c = trackingStatusCode.value
  if (c === 0 || isReDispatching.value) return '请稍候，系统正在匹配附近司机'
  if (c === 1 || c === 7) return '司机确认后会进入接驾阶段'
  if (c === 2) return '请在上车点等待司机接驾'
  if (c === 3) return '司机已到达，请尽快上车'
  if (c === 4) return '祝你一路顺利'
  if (c === 5) return '感谢乘坐，欢迎再次呼叫'
  if (c === 6) {
    const reason = activeOrderDetail.value?.cancelReason
    return typeof reason === 'string' && reason.trim() ? reason.trim() : '本次订单已结束'
  }
  return wsConnected.value ? '实时推送已连接，变更时自动同步' : `实时连接不可用，每 ${pollSecondsLabel.value} 秒刷新状态`
})
const driverSummary = computed(() => {
  const d = activeOrderDetail.value || {}
  const driver = d.assignedDriver || d.driver || {}
  const name = driver.driverName || driver.name || d.driverName
  const phone = driver.driverPhone || driver.phone || d.driverPhone
  const carNo = driver.carNo || d.carNo
  const eta = driver.etaSeconds ?? d.etaSeconds
  return {
    name: name || '',
    phone: phone || '',
    carNo: carNo || '',
    etaText: eta != null && eta !== '' ? `预计 ${Math.max(1, Math.ceil(Number(eta) / 60))} 分钟到达` : '',
  }
})
const fareText = computed(() => {
  const d = activeOrderDetail.value || {}
  const amount = d.estimatedAmount ?? d.estimateAmount ?? d.finalAmount
  if (amount == null || amount === '') return ''
  const n = Number(amount)
  return Number.isNaN(n) ? String(amount) : `¥${n.toFixed(2)}`
})
const trackingSteps = computed(() => {
  const c = trackingStatusCode.value
  const done = (code) => c != null && c >= code && c !== 6
  return [
    { key: 'dispatch', label: isReDispatching.value ? '重新派单' : '派单', active: c === 0 || c === 1 || c === 7, done: done(2) },
    { key: 'accepted', label: '接单', active: c === 2, done: done(3) },
    { key: 'arrived', label: '到达', active: c === 3, done: done(4) },
    { key: 'trip', label: c === 5 ? '完成' : '行程', active: c === 4 || c === 5, done: c === 5 },
  ]
})
const trackingCardClass = computed(() => ({
  'ride-order-card--terminal': isTerminalOrderStatus(trackingStatusCode.value),
  'ride-order-card--cancelled': trackingStatusCode.value === 6,
}))

const cancelLoading = ref(false)
const cancelReason = ref('')

function clearWsTimers() {
  if (wsPingInterval) {
    clearInterval(wsPingInterval)
    wsPingInterval = null
  }
  if (wsReconnectTimeout) {
    clearTimeout(wsReconnectTimeout)
    wsReconnectTimeout = null
  }
  if (detailDebounceTimeout) {
    clearTimeout(detailDebounceTimeout)
    detailDebounceTimeout = null
  }
}

function closeOrderSocket(reason) {
  clearWsTimers()
  if (orderSocket) {
    try {
      orderSocket.close(4000, reason || 'client')
    } catch {
      /* ignore */
    }
    orderSocket = null
  }
  wsConnected.value = false
}

function nextWsBackoffMs() {
  const cap = 45_000
  const step = Math.min(cap, 2000 * 2 ** wsReconnectAttempt)
  wsReconnectAttempt += 1
  return Math.floor(step + Math.random() * 800)
}

function scheduleDebouncedFetchDetail() {
  if (detailDebounceTimeout) clearTimeout(detailDebounceTimeout)
  detailDebounceTimeout = setTimeout(() => {
    detailDebounceTimeout = null
    fetchOrderDetailOnce()
  }, 300)
}

function handleWsMessage(ev) {
  const env = tryParseEnvelope(ev.data)
  if (!env || env.type !== 'ORDER_CHANGED') return
  const ono = env.data?.orderNo
  const seq = env.data?.seq
  if (!ono || ono !== trackingOrderNo.value) return
  if (typeof seq === 'number' && Number.isFinite(seq)) {
    const prev = lastHandledSeqByOrderNo[ono] ?? 0
    if (seq <= prev) return
    lastHandledSeqByOrderNo[ono] = seq
  }
  scheduleDebouncedFetchDetail()
}

function restartOrderPoll(intervalMs) {
  if (orderPollTimer) {
    clearInterval(orderPollTimer)
    orderPollTimer = null
  }
  orderPollTimer = setInterval(fetchOrderDetailOnce, intervalMs)
}

/** WS 断线或不可用时才用短间隔轮询；WS 正常时由推送触发 HTTP 详情对齐。 */
function useFastPoll() {
  restartOrderPoll(POLL_MS_FAST)
}

async function openOrderWebSocket() {
  if (!WS_ENABLED || !authed.value || !trackingOrderNo.value) return
  const snapshotNo = trackingOrderNo.value

  wsConnGeneration += 1
  const connGen = wsConnGeneration

  closeOrderSocket('reopen')
  let wsToken
  try {
    const data = await postJson('/app/api/v1/auth/ws-token', {})
    wsToken = data?.accessToken
  } catch (e) {
    wsConnected.value = false
    if (e?.code === 503 || (e?.message || '').includes('实时通道')) {
      return
    }
    maybeDropToLogin(e)
    return
  }
  if (!wsToken || trackingOrderNo.value !== snapshotNo) return
  const wsOrigin = resolvePassengerWsOrigin(API_BASE_URL)
  const url = passengerWsStreamUrl(wsOrigin, wsToken)
  const sock = new WebSocket(url)
  orderSocket = sock

  sock.addEventListener('open', () => {
    if (trackingOrderNo.value !== snapshotNo) {
      try {
        sock.close()
      } catch {
        /* ignore */
      }
      return
    }
    wsConnected.value = true
    wsReconnectAttempt = 0
    clearWsTimers()
    stopPollTimer()
    scheduleDebouncedFetchDetail()
    wsPingInterval = setInterval(() => {
      try {
        if (orderSocket && orderSocket.readyState === WebSocket.OPEN) {
          orderSocket.send('ping')
        }
      } catch {
        /* ignore */
      }
    }, WS_PING_MS)
  })

  sock.addEventListener('message', handleWsMessage)

  sock.addEventListener('error', () => {
    wsConnected.value = false
    useFastPoll()
  })

  sock.addEventListener('close', () => {
    if (connGen !== wsConnGeneration) return
    if (orderSocket === sock) {
      orderSocket = null
    }
    wsConnected.value = false
    clearWsTimers()
    useFastPoll()
    if (!trackingOrderNo.value || !authed.value) return
    if (trackingOrderNo.value !== snapshotNo) return
    const c = orderStatusCode(liveOrderDetail.value?.status)
    if (c === 5 || c === 6) return
    wsReconnectTimeout = setTimeout(() => openOrderWebSocket(), nextWsBackoffMs())
  })
}

function stopPollTimer() {
  if (orderPollTimer) {
    clearInterval(orderPollTimer)
    orderPollTimer = null
  }
}

function stopOrderPoll() {
  wsConnGeneration += 1
  closeOrderSocket('stop-tracking')
  wsReconnectAttempt = 0
  lastHandledSeqByOrderNo = {}
  stopPollTimer()
  trackingOrderNo.value = ''
  liveOrderDetail.value = null
}

function dismissOrderCard() {
  stopOrderPoll()
  lastResponse.value = null
}

function finishOrderTracking(reason = 'terminal') {
  stopPollTimer()
  wsConnGeneration += 1
  closeOrderSocket(reason)
  trackingOrderNo.value = ''
}

async function fetchOrderDetailOnce() {
  if (!trackingOrderNo.value) return
  try {
    const prevCode = orderStatusCode(liveOrderDetail.value?.status)
    const data = await getJson('/app/api/v1/orders/' + encodeURIComponent(trackingOrderNo.value))
    liveOrderDetail.value = data
    const code = orderStatusCode(data?.status)
    if (prevCode !== 6 && code === 6 && data?.cancelBy === CANCEL_BY_SYSTEM) {
      const msg =
        typeof data?.cancelReason === 'string' && data.cancelReason.trim()
          ? data.cancelReason.trim()
          : '当前暂无车辆可用，请稍后重试'
      showToast({ type: 'fail', message: msg, duration: 4500 })
    }
    if (code === 6) {
      dismissOrderCard()
      return
    }
    if (code === 5) {
      finishOrderTracking('terminal')
    }
  } catch (e) {
    maybeDropToLogin(e)
  }
}

async function fetchOrderDetailBeforeStop() {
  if (!trackingOrderNo.value) return null
  try {
    const data = await getJson('/app/api/v1/orders/' + encodeURIComponent(trackingOrderNo.value))
    liveOrderDetail.value = data
    return data
  } catch (e) {
    maybeDropToLogin(e)
    return null
  }
}

function startOrderPoll(orderNo) {
  stopOrderPoll()
  if (!orderNo) return
  wsReconnectAttempt = 0
  lastHandledSeqByOrderNo = {}
  trackingOrderNo.value = orderNo
  fetchOrderDetailOnce()
  useFastPoll()
  if (WS_ENABLED && authed.value) {
    queueMicrotask(() => openOrderWebSocket())
  }
}

const pollSecondsLabel = computed(() => POLL_MS_FAST / 1000)

function updateRideSheetMaxLift() {
  const h =
    typeof window !== 'undefined'
      ? window.visualViewport?.height || window.innerHeight || 0
      : 0
  rideSheetMaxLift.value = Math.max(
    0,
    Math.floor(h - RIDE_SHEET_TOP_GAP - RIDE_SHEET_NAV_HEIGHT - RIDE_SHEET_BASE_HEIGHT),
  )
  rideSheetLift.value = clampRideSheetLift(rideSheetLift.value)
}

onMounted(() => {
  updateRideSheetMaxLift()
  window.addEventListener('resize', updateRideSheetMaxLift)
  window.visualViewport?.addEventListener('resize', updateRideSheetMaxLift)
})

onBeforeUnmount(() => {
  stopOrderPoll()
  window.removeEventListener('resize', updateRideSheetMaxLift)
  window.visualViewport?.removeEventListener('resize', updateRideSheetMaxLift)
})

const cityName = computed(() => CITY_NAME_MAP[fixed.cityCode] || fixed.cityCode)
const productName = computed(() => PRODUCT_NAME_MAP[fixed.productCode] || fixed.productCode)

const summary = computed(() => ({
  origin: fixed.origin.address || fixed.origin.name,
  dest: fixed.dest.address || fixed.dest.name,
}))

async function placeOrder() {
  if (authed.value && placeOrderBlock.value.disabled) {
    showToast({ type: 'fail', message: placeOrderBlock.value.hint || '暂不可下单' })
    return
  }
  loading.value = true
  lastError.value = null
  lastResponse.value = null

  const payload = {
    provinceCode: fixed.provinceCode,
    cityCode: fixed.cityCode,
    productCode: fixed.productCode,
    origin: fixed.origin,
    dest: fixed.dest,
  }
  lastRequest.value = payload

  try {
    // 当前 H5/MVP 以一步下单为权威入口；/orders/create 仅保留为兼容/后续演进。
    const data = await postJson('/app/api/v1/orders', payload)
    lastResponse.value = data
    if (data?.orderNo) startOrderPoll(data.orderNo)
  } catch (e) {
    lastError.value = e?.message || String(e)
    if (e?.code === 409) {
      showToast({ type: 'fail', message: e.message || '您还有一单未完成，请先完单或取消后再试' })
    }
    maybeDropToLogin(e)
  } finally {
    loading.value = false
  }
}

async function logoutAll() {
  stopOrderPoll()
  const hint = await logout()
  lastError.value = null
  lastResponse.value = null
  lastRequest.value = null
  if (hint) {
    showToast({ type: 'success', message: hint, duration: 3200 })
  }
}

async function cancelOrder() {
  const no = trackingOrderNo.value
  if (!no) return
  const c = liveStatusCode.value
  if (c != null && !passengerCanCancel(c)) return
  try {
    await showConfirmDialog({
      title: '取消订单',
      message: '确定取消本单？司机已接单时取消将通知订单服务。',
      confirmButtonText: '确定取消',
      cancelButtonText: '再想想',
      confirmButtonColor: '#ee0a24',
    })
  } catch {
    return
  }
  cancelLoading.value = true
  try {
    await postJson(`/app/api/v1/orders/${encodeURIComponent(no)}/cancel`, {
      cancelReason: cancelReason.value?.trim() || '乘客取消',
    })
    dismissOrderCard()
    showToast({ type: 'success', message: '已提交取消' })
  } catch (e) {
    maybeDropToLogin(e)
    showToast({ type: 'fail', message: e?.message || String(e) })
  } finally {
    cancelLoading.value = false
  }
}

function showFeatureTodo(name) {
  showToast({ message: `${name}：待开发`, duration: 1600 })
}

function clampRideSheetLift(v) {
  return Math.max(0, Math.min(rideSheetMaxLift.value, v))
}

function onRideSheetWheel(ev) {
  const el = ev.currentTarget
  const wantsExpand = ev.deltaY > 0 && rideSheetLift.value < rideSheetMaxLift.value
  const wantsCollapse = ev.deltaY < 0 && rideSheetLift.value > 0 && (!el || el.scrollTop <= 0)
  if (!wantsExpand && !wantsCollapse) return
  ev.preventDefault()
  rideSheetLift.value = clampRideSheetLift(rideSheetLift.value + ev.deltaY * 0.65)
}

function onRideSheetPointerDown(ev) {
  if (ev.pointerType === 'mouse' && ev.button !== 0) return
  rideSheetDragging = true
  rideSheetDragStartY = ev.clientY
  rideSheetDragStartLift = rideSheetLift.value
  ev.currentTarget?.setPointerCapture?.(ev.pointerId)
}

function onRideSheetPointerMove(ev) {
  if (!rideSheetDragging) return
  const dragUpDistance = rideSheetDragStartY - ev.clientY
  rideSheetLift.value = clampRideSheetLift(rideSheetDragStartLift + dragUpDistance)
}

function onRideSheetPointerEnd(ev) {
  if (!rideSheetDragging) return
  rideSheetDragging = false
  ev.currentTarget?.releasePointerCapture?.(ev.pointerId)
}
</script>

<template>
  <van-config-provider :theme-vars="themeVars">
    <div class="page page--passenger">
      <template v-if="!authed">
        <section class="login-page">
          <div class="login-visual" aria-hidden="true">
            <div class="login-visual__route" />
            <div class="login-visual__pin login-visual__pin--start">起</div>
            <div class="login-visual__pin login-visual__pin--end">终</div>
          </div>

          <div class="login-brand">
            <div class="login-brand__mark">行</div>
            <div>
              <div class="login-brand__name">乘客出行</div>
            </div>
          </div>

          <van-cell-group inset class="login-card" :title="authTab === 'sms' ? '验证码登录' : '密码登录'">
            <div v-if="authTab === 'sms'" class="auth-actions">
              <van-field
                v-model="phone"
                label="手机号"
                type="tel"
                maxlength="11"
                placeholder="请输入手机号"
                clearable
              />
              <van-field
                v-model="smsCode"
                center
                clearable
                label="验证码"
                placeholder="短信验证码"
              >
                <template #button>
                  <van-button
                    size="small"
                    :type="smsSendButtonType"
                    plain
                    hairline
                    :loading="smsSending"
                    :disabled="smsSendDisabled"
                    @click="sendSms"
                  >
                    {{ smsSendButtonText }}
                  </van-button>
                </template>
              </van-field>
              <p v-if="smsHint" class="van-field__error-message auth-hint-center">
                {{ smsHint }}
              </p>
              <div class="login-submit-row">
                <van-button
                  class="login-submit-btn"
                  type="primary"
                  block
                  native-type="button"
                  :loading="authLoading"
                  @click="loginSms"
                >
                  登录并进入首页
                </van-button>
              </div>
              <van-cell class="auth-mode-switch-cell" :border="false">
                <template #title>
                  <span class="auth-mode-hint">有固定密码？</span>
                </template>
                <template #value>
                  <van-button size="small" plain hairline type="primary" native-type="button" @click="switchLoginMode('pwd')">
                    切换密码登录
                  </van-button>
                </template>
              </van-cell>
            </div>

            <div v-else class="auth-actions">
              <van-field
                v-model="phone"
                label="手机号"
                type="tel"
                maxlength="11"
                placeholder="请输入手机号"
                clearable
              />
              <van-field
                v-model="password"
                type="password"
                label="密码"
                placeholder="请输入密码"
              />
              <p class="auth-tip">若该手机号未设置密码，会提示改用验证码登录。</p>
              <div class="login-submit-row">
                <van-button
                  class="login-submit-btn"
                  type="primary"
                  block
                  native-type="button"
                  :loading="authLoading"
                  @click="loginPassword"
                >
                  登录并进入首页
                </van-button>
              </div>
              <van-cell class="auth-mode-switch-cell" :border="false">
                <template #title>
                  <span class="auth-mode-hint">收不到短信？</span>
                </template>
                <template #value>
                  <van-button size="small" plain hairline type="primary" native-type="button" @click="switchLoginMode('sms')">
                    切换验证码登录
                  </van-button>
                </template>
              </van-cell>
            </div>

            <van-notice-bar
              v-if="authError"
              color="#ee0a24"
              background="#fef0f0"
              left-icon="warning-o"
              :text="authError"
              wrapable
              :scrollable="false"
            />
          </van-cell-group>

          <div class="login-footer">
            <span>API</span>
            <span class="mono-inline">{{ API_BASE_URL }}</span>
          </div>
        </section>
      </template>

      <template v-else>
      <main class="gaode-home">
        <section v-if="passengerHomeTab === 'home'" class="gaode-map-page">
          <div class="gaode-map">
            <div class="gaode-landmark gaode-landmark--station">杭州东站</div>
            <div class="gaode-landmark gaode-landmark--park">钱塘绿地</div>
            <div class="gaode-landmark gaode-landmark--mall">东站万象汇</div>
            <div class="gaode-road gaode-road--one" />
            <div class="gaode-road gaode-road--two" />
            <div class="gaode-road gaode-road--three" />
            <div class="gaode-road gaode-road--four" />
            <div class="gaode-road gaode-road--five" />
            <div class="gaode-road gaode-road--six" />
            <div class="gaode-river" />
            <span class="gaode-label gaode-label--one">新塘路</span>
            <span class="gaode-label gaode-label--two">环站东路</span>
            <span class="gaode-label gaode-label--three">天城路</span>
            <span class="gaode-label gaode-label--four">东宁路</span>
            <span class="gaode-poi gaode-poi--one">杭州东站东广场</span>
            <span class="gaode-poi gaode-poi--two">杭州东站西广场</span>
            <span class="gaode-poi gaode-poi--three">火车东站地铁站</span>
            <span class="gaode-poi gaode-poi--four">杭州东站汽车站</span>
            <div class="gaode-current-dot" aria-label="当前位置：杭州东站" />
            <div class="gaode-poi-card">
              <strong>杭州东站</strong>
              <span>›</span>
            </div>
            <div class="gaode-safety-card">
              <span class="gaode-safety-card__shield">✚</span>
              <span>安全出行，建议后排落座</span>
            </div>
          </div>

          <section
            class="ride-sheet"
            aria-label="叫车面板"
            :style="{
              '--ride-sheet-lift': `${rideSheetLift}px`,
              '--ride-sheet-base-height': `${RIDE_SHEET_BASE_HEIGHT}px`,
            }"
            @wheel="onRideSheetWheel"
          >
            <div
              class="ride-sheet__drag-handle"
              role="button"
              aria-label="拖动叫车面板"
              tabindex="0"
              @pointerdown="onRideSheetPointerDown"
              @pointermove.prevent="onRideSheetPointerMove"
              @pointerup="onRideSheetPointerEnd"
              @pointercancel="onRideSheetPointerEnd"
            />
            <div class="ride-sheet__tabs">
              <button class="ride-sheet__tab ride-sheet__tab--active" type="button">现在出发</button>
              <button class="ride-sheet__tab" type="button" @click="showFeatureTodo('特惠拼车')">特惠拼车</button>
            </div>
            <div class="ride-sheet__pickup">
              <span class="ride-dot ride-dot--start" />
              <strong>{{ fixed.origin.name }}</strong>
              <span>上车 ›</span>
            </div>
            <div class="ride-sheet__destination">
              <span class="ride-dot ride-dot--dest" />
              <strong>{{ fixed.dest.name }}</strong>
              <span>默认目的地</span>
            </div>
            <div class="ride-call-panel">
              <button
                class="ride-call-button"
                type="button"
                :disabled="placeOrderDisabled"
                @click="placeOrder"
              >
                <span class="ride-call-button__main">
                  <strong>{{ callButtonText }}</strong>
                  <em>{{ productName }}</em>
                </span>
                <small>{{ fixed.origin.name }} → {{ fixed.dest.name }}</small>
              </button>
              <p v-if="lastError" class="ride-call-error">{{ lastError }}</p>
              <div v-if="visibleOrderNo" class="ride-order-card" :class="trackingCardClass">
                <div class="ride-order-card__head">
                  <span>当前订单</span>
                  <strong>{{ displayStatusTextFinal }}</strong>
                </div>
                <div class="ride-order-card__status">
                  <strong>{{ trackingHeadline }}</strong>
                  <span>{{ trackingSubtitle }}</span>
                </div>
                <div class="ride-order-steps" aria-label="订单进度">
                  <span
                    v-for="step in trackingSteps"
                    :key="step.key"
                    :class="{
                      'ride-order-steps__item--active': step.active,
                      'ride-order-steps__item--done': step.done,
                    }"
                    class="ride-order-steps__item"
                  >
                    {{ step.label }}
                  </span>
                </div>
                <div class="ride-order-route">
                  <span>{{ fixed.origin.name }}</span>
                  <strong>→</strong>
                  <span>{{ fixed.dest.name }}</span>
                </div>
                <div v-if="driverSummary.name || driverSummary.carNo || driverSummary.etaText" class="ride-driver-card">
                  <div>
                    <strong>{{ driverSummary.name || '司机信息同步中' }}</strong>
                    <span>{{ driverSummary.etaText || '请留意司机接驾信息' }}</span>
                  </div>
                  <em v-if="driverSummary.carNo">{{ driverSummary.carNo }}</em>
                  <a v-if="driverSummary.phone" :href="`tel:${driverSummary.phone}`">联系司机</a>
                </div>
                <div class="ride-order-card__meta">
                  <span class="order-no-mono">{{ visibleOrderNo }}</span>
                  <em>{{ trackingOrderNo ? (wsConnected ? '推送触发状态同步' : `HTTP 兜底每 ${pollSecondsLabel} 秒刷新`) : '订单已结束' }}</em>
                </div>
                <div v-if="fareText" class="ride-order-card__fare">
                  <span>预估费用</span>
                  <strong>{{ fareText }}</strong>
                </div>
                <div class="ride-order-card__actions">
                  <button
                    v-if="showCancelOrder"
                    type="button"
                    :disabled="cancelLoading"
                    @click="cancelOrder"
                  >
                    {{ cancelLoading ? '取消中…' : '取消订单' }}
                  </button>
                  <button
                    v-else-if="isTerminalOrderStatus(trackingStatusCode)"
                    class="ride-order-card__secondary"
                    type="button"
                    @click="dismissOrderCard"
                  >
                    知道了
                  </button>
                </div>
              </div>
            </div>
            <div class="ride-actions">
              <button type="button" @click="showFeatureTodo('预约')">
                <span class="ride-actions__icon ride-actions__icon--mint">◷</span>
                <span>预约</span>
              </button>
              <button type="button" @click="showFeatureTodo('帮人叫车')">
                <span class="ride-actions__icon ride-actions__icon--blue">☝</span>
                <span>帮人叫车</span>
              </button>
              <button type="button" @click="showFeatureTodo('接送机')">
                <span class="ride-actions__icon ride-actions__icon--car">✈</span>
                <span>接送机</span>
              </button>
              <button type="button" @click="showFeatureTodo('顺风车')">
                <span class="ride-actions__icon ride-actions__icon--green">顺</span>
                <span>顺风车</span>
              </button>
            </div>

            <div class="ride-actions ride-actions--secondary">
              <button type="button" @click="showFeatureTodo('代驾')">
                <span class="ride-actions__icon ride-actions__icon--drive">◉</span>
                <span>代驾</span>
              </button>
              <button type="button" @click="showFeatureTodo('秒送')">
                <span class="ride-actions__icon ride-actions__icon--send">送</span>
                <span>秒送</span>
              </button>
              <button type="button" @click="showFeatureTodo('福利中心')">
                <span class="ride-actions__icon ride-actions__icon--money">¥</span>
                <span>福利中心</span>
              </button>
              <button type="button" @click="showFeatureTodo('助老打车')">
                <span class="ride-actions__icon ride-actions__icon--elder">●</span>
                <span>助老打车</span>
              </button>
            </div>

            <button class="task-card" type="button" @click="showFeatureTodo('完单任务')">
              <div class="task-card__head">
                <div>
                  <strong>完单得网易云音乐VIP月卡</strong>
                  <span>领取任务后7天内完成得奖励</span>
                </div>
                <span>查看更多任务 ›</span>
              </div>
              <div class="task-card__body">
                <div class="task-card__gift" />
                <div class="task-card__copy">
                  <strong>领任务后完3单立得</strong>
                  <span>千万首会员歌曲任你听</span>
                </div>
                <em>领任务</em>
              </div>
              <div class="task-card__progress">最多可完成2轮任务，当前第1轮</div>
            </button>

            <section class="promo-section">
              <div class="promo-section__title">活动专区</div>
              <div class="promo-grid">
                <button class="promo-mini promo-mini--warm" type="button" @click="showFeatureTodo('福利中心')">
                  <strong>福利中心</strong>
                  <span>天天有优惠</span>
                  <em>立即查看</em>
                </button>
                <button class="promo-big promo-big--green" type="button" @click="showFeatureTodo('顺风车')">
                  <strong>顺风车<br />出行有礼</strong>
                  <span>最高领10元顺风车立减券</span>
                  <em>立即查看</em>
                </button>
                <button class="promo-mini promo-mini--pink" type="button" @click="showFeatureTodo('里程商城')">
                  <strong>里程商城</strong>
                  <span>兑换惊喜好物</span>
                  <em>立即查看</em>
                </button>
              </div>
            </section>

            <section class="discount-pack">
              <div class="discount-pack__head">
                <strong>出行优惠套餐</strong>
                <button type="button" @click="showFeatureTodo('更多优惠套餐')">查看更多 ›</button>
              </div>
              <div class="discount-cards">
                <button type="button" @click="showFeatureTodo('省钱套餐')">
                  <strong>省钱套餐·100元券包</strong>
                  <span>单单享优惠</span>
                  <em>6.90元购买</em>
                </button>
                <button type="button" @click="showFeatureTodo('微博会员月卡')">
                  <strong>微博会员月卡+5元x4张</strong>
                  <span>专属明星装扮任你佩戴</span>
                  <em>20元购买</em>
                </button>
              </div>
            </section>

            <button class="green-banner" type="button" @click="showFeatureTodo('顺风车出行有礼')">
              <span>顺风车 出行有礼</span>
              <strong>GO</strong>
            </button>

            <section class="member-card">
              <div class="member-card__head">
                <strong>Lv3. 黄金会员</strong>
                <span>当前经验56，还需44升级白金</span>
              </div>
              <div class="checkin-row">
                <button type="button" @click="showFeatureTodo('签到')"><strong>3</strong><span>签到</span></button>
                <button type="button" @click="showFeatureTodo('第2天')"><strong>5</strong><span>第2天</span></button>
                <button type="button" @click="showFeatureTodo('第3天')"><strong>10</strong><span>第3天</span></button>
                <button type="button" @click="showFeatureTodo('第4天')"><strong>5</strong><span>第4天</span></button>
                <button type="button" @click="showFeatureTodo('第5天')"><strong>5</strong><span>第5天</span></button>
              </div>
            </section>
          </section>
        </section>

        <section v-else class="passenger-tab-placeholder">
          <div class="placeholder-card">
            <div class="placeholder-card__icon">
              {{ passengerHomeTab === 'coupon' ? '券' : passengerHomeTab === 'benefits' ? '福' : '我' }}
            </div>
            <h2>{{ passengerHomeTab === 'coupon' ? '券包' : passengerHomeTab === 'benefits' ? '福利' : '个人中心' }}</h2>
            <p>{{ passengerHomeTab === 'profile' ? '个人资料与设置暂未开放' : '更多权益正在准备中' }}</p>
            <van-button v-if="passengerHomeTab === 'profile'" type="primary" plain round @click="logoutAll">
              退出登录
            </van-button>
          </div>
        </section>
      </main>

      <nav class="passenger-tabbar" aria-label="底部导航">
        <button
          type="button"
          :class="{ 'passenger-tabbar__item--active': passengerHomeTab === 'home' }"
          class="passenger-tabbar__item"
          @click="passengerHomeTab = 'home'"
        >
          <span class="passenger-tabbar__icon">⌁</span>
          <span>首页</span>
        </button>
        <button
          type="button"
          :class="{ 'passenger-tabbar__item--active': passengerHomeTab === 'coupon' }"
          class="passenger-tabbar__item"
          @click="passengerHomeTab = 'coupon'"
        >
          <span class="passenger-tabbar__icon">▣</span>
          <span>券包</span>
        </button>
        <button
          type="button"
          :class="{ 'passenger-tabbar__item--active': passengerHomeTab === 'benefits' }"
          class="passenger-tabbar__item"
          @click="passengerHomeTab = 'benefits'"
        >
          <span class="passenger-tabbar__icon">♨</span>
          <span>福利</span>
        </button>
        <button
          type="button"
          :class="{ 'passenger-tabbar__item--active': passengerHomeTab === 'profile' }"
          class="passenger-tabbar__item"
          @click="passengerHomeTab = 'profile'"
        >
          <span class="passenger-tabbar__icon">♡</span>
          <span>个人中心</span>
        </button>
      </nav>
      </template>
    </div>
  </van-config-provider>
</template>
