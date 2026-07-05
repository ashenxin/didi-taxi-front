<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { showConfirmDialog, showToast } from 'vant'

import { API_BASE_URL, getJson, postJson } from './api/http'
import { passengerWsStreamUrl, resolvePassengerWsOrigin, tryParseEnvelope } from './utils/passengerOrderWs'
import { useAuth } from './features/auth/useAuth'
import { createIdempotencyKey } from './utils/idempotency'
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
let pendingCreateOrderAttempt = null

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
const myOrderType = ref('ALL')
const myOrderPageNo = ref(1)
const myOrderLoading = ref(false)
const myOrderError = ref('')
const myOrderPage = ref({
  list: [],
  total: 0,
  pageNo: 1,
  pageSize: 10,
  type: 'ALL',
})
/** 个人中心子页面：main 只展示入口，orders 与 settings 点击后再下钻。 */
const profileView = ref('main')
const settingsProfile = ref(null)
const settingsLoading = ref(false)
const settingsError = ref('')
/** 更换手机号只输入新手机号验证码；当前手机号由登录态 customerId 在服务端校验。 */
const phoneChangeForm = reactive({
  newPhone: '',
  code: '',
  sending: false,
  submitting: false,
  hint: '',
})
/** 注销账号需要当前手机号验证码和显式确认；提交成功后本地立即退出登录。 */
const accountCancelForm = reactive({
  code: '',
  confirm: false,
  sending: false,
  submitting: false,
  hint: '',
})

const RIDE_SHEET_BASE_HEIGHT = 300
const RIDE_SHEET_TOP_GAP = 18
const RIDE_SHEET_NAV_HEIGHT = 50
const MY_ORDER_PAGE_SIZE = 10
const MY_ORDER_TYPES = [
  { code: 'ALL', label: '全部' },
  { code: 'TO_DEPART', label: '待出发' },
  { code: 'REFUND_CANCEL', label: '退款与取消' },
]
const WALLET_ENTRIES = [
  { key: 'passwordless', title: '免密支付设置', desc: '开启后行程结束自动扣款', icon: '免' },
  { key: 'bank-card', title: '银行卡', desc: '管理常用银行卡与支付卡', icon: '卡' },
  { key: 'coupon', title: '优惠券', desc: '查看可用出行优惠', icon: '券' },
  { key: 'loan', title: '借钱', desc: '额度与借款服务入口', icon: '借' },
  { key: 'car-insurance', title: '车险', desc: '车主保障与保险服务', icon: '险' },
]
const AUTO_PAY_CHANNELS = [
  { channel: 'ALIPAY', name: '支付宝', desc: '适合常用支付宝出行扣款' },
  { channel: 'WECHAT', name: '微信', desc: '适合常用微信支付自动扣款' },
]
const walletSummary = ref(null)
const walletAgreements = ref([])
const walletCoupons = ref({ list: [], total: 0, pageNo: 1, pageSize: 20 })
const walletLoading = ref(false)
const walletError = ref('')
const walletActionLoading = ref('')
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
  clearLocalSession,
  maybeDropToLogin,
  switchLoginMode,
} = useAuth()

watch(authed, (v) => {
  if (v) {
    passengerHomeTab.value = 'home'
  } else {
    resetMyOrders()
  }
})

watch(passengerHomeTab, (tab) => {
  if (tab === 'profile' && authed.value) {
    if (profileView.value === 'orders') {
      loadMyOrders()
    } else if (['settings', 'phone-change', 'account-cancel'].includes(profileView.value)) {
      loadSettingsProfile()
    } else if (profileView.value === 'wallet') {
      loadWalletSummary()
    } else if (profileView.value === 'wallet-autopay') {
      loadWalletAutoPay()
    } else if (profileView.value === 'wallet-coupons') {
      loadWalletCoupons()
    }
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
const myOrders = computed(() => (Array.isArray(myOrderPage.value?.list) ? myOrderPage.value.list : []))
const myOrderTotal = computed(() => Number(myOrderPage.value?.total || 0))
const myOrderTotalPages = computed(() => Math.max(1, Math.ceil(myOrderTotal.value / MY_ORDER_PAGE_SIZE)))
const myOrderHasPrev = computed(() => myOrderPageNo.value > 1)
const myOrderHasNext = computed(() => myOrderPageNo.value < myOrderTotalPages.value)
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
  const requestFingerprint = JSON.stringify(payload)
  if (!pendingCreateOrderAttempt || pendingCreateOrderAttempt.requestFingerprint !== requestFingerprint) {
    pendingCreateOrderAttempt = {
      key: createIdempotencyKey(),
      requestFingerprint,
    }
  }

  try {
    // 当前 H5/MVP 以一步下单为权威入口；/orders/create 仅保留为兼容/后续演进。
    const data = await postJson('/app/api/v1/orders', payload, {
      headers: { 'Idempotency-Key': pendingCreateOrderAttempt.key },
    })
    pendingCreateOrderAttempt = null
    lastResponse.value = data
    if (data?.orderNo) startOrderPoll(data.orderNo)
  } catch (e) {
    // 未收到服务端响应时保留 key，避免用户重试造成重复下单；明确响应则结束本次尝试。
    if (e?.httpStatus > 0) pendingCreateOrderAttempt = null
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

function resetSettingsForms() {
  settingsError.value = ''
  phoneChangeForm.newPhone = ''
  phoneChangeForm.code = ''
  phoneChangeForm.sending = false
  phoneChangeForm.submitting = false
  phoneChangeForm.hint = ''
  accountCancelForm.code = ''
  accountCancelForm.confirm = false
  accountCancelForm.sending = false
  accountCancelForm.submitting = false
  accountCancelForm.hint = ''
}

/** 设置页每次进入都重新拉取账号摘要，避免更换手机号后展示旧脱敏号码。 */
async function loadSettingsProfile() {
  if (!authed.value) return
  settingsLoading.value = true
  settingsError.value = ''
  try {
    settingsProfile.value = await getJson('/app/api/v1/settings/profile')
  } catch (e) {
    maybeDropToLogin(e)
    settingsError.value = e?.message || String(e)
  } finally {
    settingsLoading.value = false
  }
}

function openSettingsHome() {
  profileView.value = 'settings'
  resetSettingsForms()
  loadSettingsProfile()
}

function openMyOrders() {
  profileView.value = 'orders'
  loadMyOrders({ resetPage: true })
}

function openWallet() {
  profileView.value = 'wallet'
  loadWalletSummary()
}

function openWalletEntry(entry) {
  if (entry.key === 'passwordless') {
    profileView.value = 'wallet-autopay'
    loadWalletAutoPay()
    return
  }
  if (entry.key === 'coupon') {
    profileView.value = 'wallet-coupons'
    loadWalletCoupons()
    return
  }
  showFeatureTodo(entry.title)
}

function backToWalletHome() {
  profileView.value = 'wallet'
  loadWalletSummary()
}

function walletAgreement(channel) {
  return walletAgreements.value.find((item) => item.channel === channel) || null
}

function walletStatusText(status) {
  const map = {
    ACTIVE: '已开通',
    SIGNING: '签约中',
    CLOSED: '已关闭',
    FAILED: '签约失败',
  }
  return map[status] || status || '未开通'
}

function couponStatusText(status) {
  const map = {
    UNUSED: '未使用',
    LOCKED: '已锁定',
    USED: '已使用',
    EXPIRED: '已过期',
    INVALID: '已失效',
  }
  return map[status] || status || '-'
}

function formatMoney(v) {
  const n = Number(v || 0)
  return Number.isFinite(n) ? n.toFixed(2) : '0.00'
}

async function loadWalletSummary() {
  if (!authed.value) return
  walletLoading.value = true
  walletError.value = ''
  try {
    walletSummary.value = await getJson('/app/api/v1/wallet/summary')
  } catch (e) {
    maybeDropToLogin(e)
    walletError.value = e?.message || String(e)
  } finally {
    walletLoading.value = false
  }
}

async function loadWalletAutoPay() {
  if (!authed.value) return
  walletLoading.value = true
  walletError.value = ''
  try {
    walletAgreements.value = await getJson('/app/api/v1/wallet/auto-pay/agreements')
  } catch (e) {
    maybeDropToLogin(e)
    walletError.value = e?.message || String(e)
  } finally {
    walletLoading.value = false
  }
}

async function signAutoPay(channel) {
  walletActionLoading.value = `sign-${channel}`
  try {
    await postJson('/app/api/v1/wallet/auto-pay/agreements/sign', {
      channel,
      signScene: 'PASSENGER_WALLET',
    })
    showToast({ type: 'success', message: '已开通免密支付' })
    await loadWalletAutoPay()
  } catch (e) {
    maybeDropToLogin(e)
    showToast({ type: 'fail', message: e?.message || String(e) })
  } finally {
    walletActionLoading.value = ''
  }
}

async function setDefaultAutoPay(agreementId) {
  walletActionLoading.value = `default-${agreementId}`
  try {
    await postJson(`/app/api/v1/wallet/auto-pay/agreements/${agreementId}/default`)
    showToast({ type: 'success', message: '已设为默认' })
    await loadWalletAutoPay()
  } catch (e) {
    maybeDropToLogin(e)
    showToast({ type: 'fail', message: e?.message || String(e) })
  } finally {
    walletActionLoading.value = ''
  }
}

async function closeAutoPay(agreementId) {
  walletActionLoading.value = `close-${agreementId}`
  try {
    await postJson(`/app/api/v1/wallet/auto-pay/agreements/${agreementId}/close`)
    showToast({ type: 'success', message: '已关闭' })
    await loadWalletAutoPay()
  } catch (e) {
    maybeDropToLogin(e)
    showToast({ type: 'fail', message: e?.message || String(e) })
  } finally {
    walletActionLoading.value = ''
  }
}

async function loadWalletCoupons() {
  if (!authed.value) return
  walletLoading.value = true
  walletError.value = ''
  try {
    walletCoupons.value = await getJson('/app/api/v1/wallet/coupons?pageNo=1&pageSize=20')
  } catch (e) {
    maybeDropToLogin(e)
    walletError.value = e?.message || String(e)
  } finally {
    walletLoading.value = false
  }
}

function openPhoneChange() {
  profileView.value = 'phone-change'
  phoneChangeForm.hint = ''
  phoneChangeForm.code = ''
  loadSettingsProfile()
}

function openAccountCancel() {
  profileView.value = 'account-cancel'
  accountCancelForm.hint = ''
  accountCancelForm.code = ''
  accountCancelForm.confirm = false
  loadSettingsProfile()
}

function backToProfileMain() {
  profileView.value = 'main'
  resetSettingsForms()
  walletError.value = ''
}

function backToSettingsHome() {
  profileView.value = 'settings'
  resetSettingsForms()
  loadSettingsProfile()
}

async function sendPhoneChangeSms() {
  phoneChangeForm.hint = ''
  phoneChangeForm.sending = true
  try {
    const data = await postJson('/app/api/v1/settings/phone-change/sms/send', {
      newPhone: phoneChangeForm.newPhone,
    })
    if (data?.mockCode) {
      phoneChangeForm.code = data.mockCode
      phoneChangeForm.hint = '验证码已发送，已为本地 mock 自动填入'
    } else {
      phoneChangeForm.hint = '验证码已发送'
    }
  } catch (e) {
    maybeDropToLogin(e)
    phoneChangeForm.hint = e?.message || String(e)
  } finally {
    phoneChangeForm.sending = false
  }
}

async function confirmPhoneChange() {
  phoneChangeForm.hint = ''
  phoneChangeForm.submitting = true
  try {
    await postJson('/app/api/v1/settings/phone-change/confirm', {
      newPhone: phoneChangeForm.newPhone,
      code: phoneChangeForm.code,
    })
    showToast({ type: 'success', message: '手机号已更换，请重新登录' })
    // 服务端已提升 tokenVersion；本地同步清理，避免继续用旧手机号身份操作。
    stopOrderPoll()
    clearLocalSession()
  } catch (e) {
    maybeDropToLogin(e)
    phoneChangeForm.hint = e?.message || String(e)
  } finally {
    phoneChangeForm.submitting = false
  }
}

async function sendAccountCancelSms() {
  accountCancelForm.hint = ''
  accountCancelForm.sending = true
  try {
    const data = await postJson('/app/api/v1/settings/account-cancel/sms/send', {})
    if (data?.mockCode) {
      accountCancelForm.code = data.mockCode
      accountCancelForm.hint = `验证码已发送至 ${data.maskedPhone || '当前手机号'}，已为本地 mock 自动填入`
    } else {
      accountCancelForm.hint = `验证码已发送至 ${data?.maskedPhone || '当前手机号'}`
    }
  } catch (e) {
    maybeDropToLogin(e)
    accountCancelForm.hint = e?.message || String(e)
  } finally {
    accountCancelForm.sending = false
  }
}

async function confirmAccountCancel() {
  if (!accountCancelForm.confirm) {
    accountCancelForm.hint = '请先确认注销风险'
    return
  }
  try {
    await showConfirmDialog({
      title: '确认注销账号',
      message: '注销后当前账号无法继续登录，用户端不再展示原账号订单记录。',
      confirmButtonText: '确认注销',
      cancelButtonText: '再想想',
      confirmButtonColor: '#ee0a24',
    })
  } catch {
    return
  }
  accountCancelForm.hint = ''
  accountCancelForm.submitting = true
  try {
    await postJson('/app/api/v1/settings/account-cancel/confirm', {
      code: accountCancelForm.code,
      confirm: accountCancelForm.confirm,
    })
    showToast({ type: 'success', message: '账号已注销' })
    // 注销后历史订单仍在后台保留，但用户端当前会话必须马上结束。
    stopOrderPoll()
    clearLocalSession()
  } catch (e) {
    maybeDropToLogin(e)
    accountCancelForm.hint = e?.message || String(e)
  } finally {
    accountCancelForm.submitting = false
  }
}

function resetMyOrders() {
  myOrderPageNo.value = 1
  myOrderType.value = 'ALL'
  myOrderError.value = ''
  profileView.value = 'main'
  settingsProfile.value = null
  resetSettingsForms()
  myOrderPage.value = {
    list: [],
    total: 0,
    pageNo: 1,
    pageSize: MY_ORDER_PAGE_SIZE,
    type: 'ALL',
  }
}

async function loadMyOrders({ resetPage = false } = {}) {
  if (!authed.value) return
  if (resetPage) myOrderPageNo.value = 1
  myOrderLoading.value = true
  myOrderError.value = ''
  try {
    const params = new URLSearchParams({
      type: myOrderType.value,
      pageNo: String(myOrderPageNo.value),
      pageSize: String(MY_ORDER_PAGE_SIZE),
    })
    const data = await getJson(`/app/api/v1/orders?${params.toString()}`)
    myOrderPage.value = {
      list: Array.isArray(data?.list) ? data.list : [],
      total: Number(data?.total || 0),
      pageNo: Number(data?.pageNo || myOrderPageNo.value),
      pageSize: Number(data?.pageSize || MY_ORDER_PAGE_SIZE),
      type: data?.type || myOrderType.value,
    }
    myOrderPageNo.value = myOrderPage.value.pageNo
  } catch (e) {
    maybeDropToLogin(e)
    myOrderError.value = e?.message || String(e)
  } finally {
    myOrderLoading.value = false
  }
}

function switchMyOrderType(type) {
  if (!type || myOrderType.value === type) return
  myOrderType.value = type
  loadMyOrders({ resetPage: true })
}

function changeMyOrderPage(step) {
  const next = myOrderPageNo.value + step
  if (next < 1 || next > myOrderTotalPages.value) return
  myOrderPageNo.value = next
  loadMyOrders()
}

function orderRouteText(order) {
  const origin = order?.originAddress || order?.origin?.address || order?.origin?.name || '上车点'
  const dest = order?.destAddress || order?.dest?.address || order?.dest?.name || '目的地'
  return { origin, dest }
}

function orderAmountText(order) {
  const amount = order?.finalAmount ?? order?.estimatedAmount ?? order?.estimateAmount
  if (amount == null || amount === '') return '金额待同步'
  const n = Number(amount)
  return Number.isNaN(n) ? String(amount) : `¥${n.toFixed(2)}`
}

function orderTimeText(order) {
  const raw =
    order?.timestamps?.createdAt ||
    order?.createdAt ||
    order?.createTime ||
    order?.createdTime
  if (!raw) return '时间待同步'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return String(raw)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function orderActions(order) {
  const actions = Array.isArray(order?.actions) ? order.actions : []
  if (actions.length > 0) return actions
  return [
    { code: 'APPLY_INVOICE', label: '申请开票', disabled: true },
    { code: 'RETURN_TRIP', label: '呼叫返程', disabled: true },
    { code: 'RATE', label: '评价', disabled: true },
  ]
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

        <section v-else-if="passengerHomeTab === 'profile'" class="profile-page">
          <header class="profile-hero">
            <div>
              <span class="profile-hero__eyebrow">个人中心</span>
              <h1>我的出行</h1>
              <p>查看行程记录、订单状态和后续服务入口</p>
            </div>
            <button class="profile-hero__avatar" type="button" @click="showFeatureTodo('个人资料')">我</button>
          </header>

          <template v-if="profileView === 'main'">
            <section class="profile-card profile-service-card">
              <button class="profile-service-entry" type="button" @click="openMyOrders">
                <span>我的订单</span>
                <em>查看行程记录、订单状态 ›</em>
              </button>
              <button class="profile-service-entry" type="button" @click="openSettingsHome">
                <span>设置</span>
                <em>更换手机号、注销账号 ›</em>
              </button>
              <button class="profile-service-entry" type="button" @click="openWallet">
                <span>我的钱包</span>
                <em>支付、卡券、金融服务 ›</em>
              </button>
              <button class="profile-service-entry" type="button" @click="showFeatureTodo('客服中心')">
                <span>客服中心</span>
                <em>订单问题、发票咨询 ›</em>
              </button>
              <van-button type="primary" plain round block @click="logoutAll">
                退出登录
              </van-button>
            </section>
          </template>

          <template v-else-if="profileView === 'orders'">
            <section class="profile-card profile-orders">
              <div class="settings-head">
                <button type="button" @click="backToProfileMain">‹</button>
                <strong>我的订单</strong>
              </div>
              <div class="profile-section-head">
                <div>
                  <span>全部行程</span>
                  <strong>{{ myOrderTotal }} 单</strong>
                </div>
                <button type="button" :disabled="myOrderLoading" @click="loadMyOrders()">
                  {{ myOrderLoading ? '刷新中' : '刷新' }}
                </button>
              </div>

              <div class="my-order-tabs" role="tablist" aria-label="订单类型">
                <button
                  v-for="type in MY_ORDER_TYPES"
                  :key="type.code"
                  type="button"
                  role="tab"
                  :aria-selected="myOrderType === type.code"
                  :class="{ 'my-order-tabs__item--active': myOrderType === type.code }"
                  class="my-order-tabs__item"
                  @click="switchMyOrderType(type.code)"
                >
                  {{ type.label }}
                </button>
              </div>

              <div v-if="myOrderLoading && myOrders.length === 0" class="my-order-loading">
                <van-loading size="22px" color="#04a7df">订单加载中</van-loading>
              </div>
              <van-notice-bar
                v-else-if="myOrderError"
                color="#ee0a24"
                background="#fff1f0"
                left-icon="warning-o"
                :text="myOrderError"
                wrapable
                :scrollable="false"
              />
              <van-empty
                v-else-if="myOrders.length === 0"
                image="search"
                description="暂无符合条件的订单"
              />

              <div v-else class="my-order-list">
                <article v-for="order in myOrders" :key="order.orderNo" class="my-order-card">
                  <div class="my-order-card__top">
                    <div>
                      <span>{{ orderTimeText(order) }}</span>
                      <strong>{{ formatOrderStatus(order.status) }}</strong>
                    </div>
                    <em>{{ orderAmountText(order) }}</em>
                  </div>

                  <div class="my-order-route">
                    <div>
                      <i class="my-order-route__dot my-order-route__dot--start" />
                      <span>{{ orderRouteText(order).origin }}</span>
                    </div>
                    <div>
                      <i class="my-order-route__dot my-order-route__dot--dest" />
                      <span>{{ orderRouteText(order).dest }}</span>
                    </div>
                  </div>

                  <div class="my-order-card__meta">
                    <span class="order-no-mono">{{ order.orderNo || '订单号待同步' }}</span>
                    <span v-if="order.driver?.driverName || order.driver?.name">
                      {{ order.driver.driverName || order.driver.name }}
                    </span>
                  </div>

                  <div class="my-order-actions">
                    <button
                      v-for="action in orderActions(order)"
                      :key="action.code"
                      type="button"
                      :disabled="action.disabled !== false"
                      @click="showFeatureTodo(action.label)"
                    >
                      {{ action.label }}
                    </button>
                  </div>
                </article>

                <div class="my-order-pager">
                  <button type="button" :disabled="!myOrderHasPrev || myOrderLoading" @click="changeMyOrderPage(-1)">
                    上一页
                  </button>
                  <span>第 {{ myOrderPageNo }} / {{ myOrderTotalPages }} 页</span>
                  <button type="button" :disabled="!myOrderHasNext || myOrderLoading" @click="changeMyOrderPage(1)">
                    下一页
                  </button>
                </div>
              </div>
            </section>
          </template>

          <template v-else-if="profileView === 'wallet'">
            <section class="profile-card wallet-card">
              <div class="settings-head">
                <button type="button" @click="backToProfileMain">‹</button>
                <strong>我的钱包</strong>
              </div>
              <p v-if="walletError" class="settings-hint">{{ walletError }}</p>
              <div class="wallet-summary">
                <div>
                  <span>可用优惠</span>
                  <strong>{{ walletSummary?.availableCouponCount ?? '-' }} 张</strong>
                </div>
                <div>
                  <span>默认支付</span>
                  <strong>{{ walletSummary?.defaultAutoPayAgreement?.channelName || '未设置' }}</strong>
                </div>
              </div>
              <div class="wallet-entry-list" aria-label="我的钱包功能列表">
                <button
                  v-for="entry in WALLET_ENTRIES"
                  :key="entry.key"
                  class="wallet-entry"
                  type="button"
                  @click="openWalletEntry(entry)"
                >
                  <span class="wallet-entry__icon">{{ entry.icon }}</span>
                  <span class="wallet-entry__body">
                    <strong>{{ entry.title }}</strong>
                    <em>{{ entry.desc }}</em>
                  </span>
                  <span class="wallet-entry__arrow">›</span>
                </button>
              </div>
            </section>
          </template>

          <template v-else-if="profileView === 'wallet-autopay'">
            <section class="profile-card wallet-card">
              <div class="settings-head">
                <button type="button" @click="backToWalletHome">‹</button>
                <strong>免密支付设置</strong>
              </div>
              <p v-if="walletError" class="settings-hint">{{ walletError }}</p>
              <div class="wallet-entry-list">
                <article v-for="item in AUTO_PAY_CHANNELS" :key="item.channel" class="wallet-pay-row">
                  <span class="wallet-entry__icon">{{ item.name.slice(0, 1) }}</span>
                  <span class="wallet-entry__body">
                    <strong>{{ item.name }}</strong>
                    <em>{{ item.desc }}</em>
                    <em>{{ walletStatusText(walletAgreement(item.channel)?.status) }}</em>
                  </span>
                  <span v-if="walletAgreement(item.channel)?.defaulted" class="wallet-badge">默认</span>
                  <div class="wallet-row-actions">
                    <button
                      v-if="!walletAgreement(item.channel) || walletAgreement(item.channel)?.status === 'CLOSED'"
                      type="button"
                      :disabled="walletActionLoading === `sign-${item.channel}`"
                      @click="signAutoPay(item.channel)"
                    >
                      开通
                    </button>
                    <button
                      v-else-if="!walletAgreement(item.channel)?.defaulted"
                      type="button"
                      :disabled="walletActionLoading === `default-${walletAgreement(item.channel)?.agreementId}`"
                      @click="setDefaultAutoPay(walletAgreement(item.channel).agreementId)"
                    >
                      设默认
                    </button>
                    <button
                      v-if="walletAgreement(item.channel)?.status === 'ACTIVE'"
                      type="button"
                      :disabled="walletActionLoading === `close-${walletAgreement(item.channel)?.agreementId}`"
                      @click="closeAutoPay(walletAgreement(item.channel).agreementId)"
                    >
                      关闭
                    </button>
                  </div>
                </article>
              </div>
            </section>
          </template>

          <template v-else-if="profileView === 'wallet-coupons'">
            <section class="profile-card wallet-card">
              <div class="settings-head">
                <button type="button" @click="backToWalletHome">‹</button>
                <strong>优惠券</strong>
              </div>
              <p v-if="walletError" class="settings-hint">{{ walletError }}</p>
              <div v-if="!walletCoupons.list?.length" class="settings-summary">
                <span>{{ walletLoading ? '正在加载优惠券' : '暂无优惠券' }}</span>
                <strong>{{ walletCoupons.total || 0 }} 张</strong>
              </div>
              <div v-else class="wallet-coupon-list">
                <article v-for="coupon in walletCoupons.list" :key="coupon.couponId" class="wallet-coupon">
                  <div>
                    <strong>{{ coupon.couponName }}</strong>
                    <span>满 {{ formatMoney(coupon.thresholdAmount) }} 可用</span>
                  </div>
                  <div>
                    <strong>-{{ formatMoney(coupon.discountAmount) }}</strong>
                    <span>{{ couponStatusText(coupon.status) }}</span>
                  </div>
                </article>
              </div>
            </section>
          </template>

          <template v-else-if="profileView === 'settings'">
            <section class="profile-card settings-card">
              <div class="settings-head">
                <button type="button" @click="backToProfileMain">‹</button>
                <strong>设置</strong>
              </div>
              <van-loading v-if="settingsLoading" size="22px" color="#04a7df">加载中</van-loading>
              <van-notice-bar
                v-else-if="settingsError"
                color="#ee0a24"
                background="#fff1f0"
                left-icon="warning-o"
                :text="settingsError"
                wrapable
                :scrollable="false"
              />
              <div v-else class="settings-summary">
                <span>当前手机号</span>
                <strong>{{ settingsProfile?.maskedPhone || '未同步' }}</strong>
              </div>
              <button class="settings-entry" type="button" @click="openPhoneChange">
                <span>更换手机号</span>
                <em>不会影响历史订单 ›</em>
              </button>
              <button class="settings-entry settings-entry--danger" type="button" @click="openAccountCancel">
                <span>注销账号</span>
                <em>需无进行中订单 ›</em>
              </button>
            </section>
          </template>

          <template v-else-if="profileView === 'phone-change'">
            <section class="profile-card settings-card">
              <div class="settings-head">
                <button type="button" @click="backToSettingsHome">‹</button>
                <strong>更换手机号</strong>
              </div>
              <div class="settings-summary">
                <span>当前手机号</span>
                <strong>{{ settingsProfile?.maskedPhone || '未同步' }}</strong>
              </div>
              <p class="settings-note">当前手机号由系统自动校验。更换成功后需使用新手机号重新登录，历史订单和账号资料会保留。</p>
              <van-cell-group inset>
                <van-field
                  v-model="phoneChangeForm.newPhone"
                  label="新手机号"
                  placeholder="请输入新手机号"
                  type="tel"
                  maxlength="11"
                  clearable
                />
                <van-field
                  v-model="phoneChangeForm.code"
                  label="验证码"
                  placeholder="请输入验证码"
                  maxlength="6"
                  clearable
                >
                  <template #button>
                    <van-button size="small" type="primary" :loading="phoneChangeForm.sending" @click="sendPhoneChangeSms">
                      发送验证码
                    </van-button>
                  </template>
                </van-field>
              </van-cell-group>
              <p v-if="phoneChangeForm.hint" class="settings-hint">{{ phoneChangeForm.hint }}</p>
              <van-button type="primary" round block :loading="phoneChangeForm.submitting" @click="confirmPhoneChange">
                确认更换
              </van-button>
            </section>
          </template>

          <template v-else-if="profileView === 'account-cancel'">
            <section class="profile-card settings-card settings-card--danger">
              <div class="settings-head">
                <button type="button" @click="backToSettingsHome">‹</button>
                <strong>注销账号</strong>
              </div>
              <div class="settings-risk">
                <strong>注销前请确认</strong>
                <p>账号注销后，用户端不再展示该账号的历史订单；后台会继续保留历史订单记录。</p>
                <p>该手机号可重新注册为新账号，但不会继承原账号订单。</p>
                <p>若当前存在进行中订单，请先完成或取消订单后再注销。</p>
              </div>
              <van-cell-group inset>
                <van-field
                  v-model="accountCancelForm.code"
                  label="验证码"
                  placeholder="发送至当前绑定手机号"
                  maxlength="6"
                  clearable
                >
                  <template #button>
                    <van-button size="small" type="primary" :loading="accountCancelForm.sending" @click="sendAccountCancelSms">
                      发送验证码
                    </van-button>
                  </template>
                </van-field>
                <van-checkbox v-model="accountCancelForm.confirm" shape="square" class="settings-confirm">
                  我已了解注销影响并确认注销
                </van-checkbox>
              </van-cell-group>
              <p v-if="accountCancelForm.hint" class="settings-hint">{{ accountCancelForm.hint }}</p>
              <van-button type="danger" round block :loading="accountCancelForm.submitting" @click="confirmAccountCancel">
                确认注销账号
              </van-button>
            </section>
          </template>
        </section>

        <section v-else class="passenger-tab-placeholder">
          <div class="placeholder-card">
            <div class="placeholder-card__icon">
              {{ passengerHomeTab === 'coupon' ? '券' : '福' }}
            </div>
            <h2>{{ passengerHomeTab === 'coupon' ? '券包' : '福利' }}</h2>
            <p>更多权益正在准备中</p>
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
