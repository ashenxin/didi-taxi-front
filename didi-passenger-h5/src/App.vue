<script setup>
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { showConfirmDialog, showToast } from 'vant'

import { API_BASE_URL, getJson, postJson } from './api/http'
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
const POLL_MS = 2000

/** 仅反映 POST 下单接口返回体里的 status，不随后续轮询更新 */
const createStatusText = computed(() => formatOrderStatus(lastResponse.value?.status))
const liveStatusText = computed(() => formatOrderStatus(liveOrderDetail.value?.status))
const liveStatusCode = computed(() => orderStatusCode(liveOrderDetail.value?.status))

/**
 * 主展示用状态：跟踪中同一单时以轮询为准；调试区第一行仍为「接口返回时」的固定快照。
 */
const displayOrderStatus = computed(() => {
  const tracking = trackingOrderNo.value
  if (tracking && liveOrderDetail.value?.orderNo === tracking) {
    return liveOrderDetail.value.status
  }
  return lastResponse.value?.status
})
const displayStatusText = computed(() => formatOrderStatus(displayOrderStatus.value))
const displayStatusCode = computed(() => orderStatusCode(displayOrderStatus.value))
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
  return { disabled: true, hint: '当前有进行中的订单，请等待完单或取消后再下单' }
})

const placeOrderDisabled = computed(
  () => loading.value || (authed.value && placeOrderBlock.value.disabled),
)

const cancelLoading = ref(false)
const cancelReason = ref('')

function stopPollTimer() {
  if (orderPollTimer) {
    clearInterval(orderPollTimer)
    orderPollTimer = null
  }
}

function stopOrderPoll() {
  stopPollTimer()
  trackingOrderNo.value = ''
  liveOrderDetail.value = null
}

async function fetchOrderDetailOnce() {
  if (!trackingOrderNo.value) return
  try {
    const prevCode = orderStatusCode(liveOrderDetail.value?.status)
    const data = await getJson('/app/api/v1/orders/' + encodeURIComponent(trackingOrderNo.value))
    liveOrderDetail.value = data
    const code = orderStatusCode(data?.status)
    if (code === 5 || code === 6) {
      stopPollTimer()
    }
    if (prevCode !== 6 && code === 6 && data?.cancelBy === CANCEL_BY_SYSTEM) {
      const msg =
        typeof data?.cancelReason === 'string' && data.cancelReason.trim()
          ? data.cancelReason.trim()
          : '当前暂无车辆可用，请稍后重试'
      showToast({ type: 'fail', message: msg, duration: 4500 })
    }
  } catch (e) {
    maybeDropToLogin(e)
  }
}

function startOrderPoll(orderNo) {
  stopOrderPoll()
  if (!orderNo) return
  trackingOrderNo.value = orderNo
  fetchOrderDetailOnce()
  orderPollTimer = setInterval(fetchOrderDetailOnce, POLL_MS)
}

onBeforeUnmount(() => stopPollTimer())

const {
  authed,
  authTab,
  phone,
  password,
  smsCode,
  smsSending,
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
    const data = await postJson('/app/api/v1/orders', payload)
    lastResponse.value = data
    if (data?.orderNo) startOrderPoll(data.orderNo)
  } catch (e) {
    lastError.value = e?.message || String(e)
    if (e?.code === 409) {
      showToast({ type: 'fail', message: e.message || '您已有进行中的订单' })
    }
    maybeDropToLogin(e)
  } finally {
    loading.value = false
  }
}

function logoutAll() {
  stopOrderPoll()
  logout()
  lastError.value = null
  lastResponse.value = null
  lastRequest.value = null
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
    await fetchOrderDetailOnce()
    showToast({ type: 'success', message: '已提交取消' })
  } catch (e) {
    maybeDropToLogin(e)
    showToast({ type: 'fail', message: e?.message || String(e) })
  } finally {
    cancelLoading.value = false
  }
}
</script>

<template>
  <van-config-provider :theme-vars="themeVars">
    <div class="page page--passenger">
      <van-nav-bar
        class="app-nav"
        title="乘客出行"
        :border="false"
        safe-area-inset-top
      >
        <template #right>
          <span class="nav-eyebrow"> Demo · 东站→龙翔桥 </span>
        </template>
      </van-nav-bar>

      <div class="hero-strip">
        <div class="hero-strip__inner">
          <div class="hero-strip__icon" aria-hidden="true">🚕</div>
          <div class="hero-strip__text">
            <div class="hero-strip__title">一键叫车 · 实时行程</div>
            <div class="hero-strip__sub">
              登录后下单，订单状态将自动刷新直至完单或取消；示例行程已带起终点坐标，便于附近派单
            </div>
          </div>
        </div>
      </div>

      <main class="page-main page-main--grid">
        <div>
          <van-notice-bar
            v-if="!authed"
            left-icon="info-o"
            text="登录后可下单；首期支持验证码与密码登录。"
            wrapable
            :scrollable="false"
          />

          <van-cell-group v-if="!authed" inset class="section-gap" :title="authTab === 'sms' ? '验证码登录' : '密码登录'">
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
                    type="primary"
                    :loading="smsSending"
                    :disabled="smsSending"
                    @click="sendSms"
                  >
                    {{ smsSending ? '发送中' : '发送验证码' }}
                  </van-button>
                </template>
              </van-field>
              <p v-if="smsHint" class="van-field__error-message auth-hint-center">
                {{ smsHint }}
              </p>
              <div class="auth-submit-row">
                <van-button
                  class="auth-submit-btn"
                  type="primary"
                  native-type="button"
                  :loading="authLoading"
                  @click="loginSms"
                >
                  登录
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
              <div class="auth-submit-row">
                <van-button
                  class="auth-submit-btn"
                  type="primary"
                  native-type="button"
                  :loading="authLoading"
                  @click="loginPassword"
                >
                  登录
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

          <van-notice-bar
            v-if="trackingOrderNo && authed && liveStatusText && liveStatusText !== '-'"
            class="section-gap poll-status-bar"
            left-icon="replay"
            color="#1989fa"
            background="#ecf5ff"
            :text="`跟踪中 ${trackingOrderNo.slice(-8)} · ${liveStatusText}`"
            :scrollable="false"
          />
          <van-notice-bar
            v-if="authed && placeOrderBlock.disabled && placeOrderBlock.hint"
            class="section-gap"
            left-icon="warning-o"
            color="#ed6a0c"
            background="#fff7e8"
            :text="placeOrderBlock.hint"
            wrapable
            :scrollable="false"
          />

          <div class="map-wrap section-gap">
            <section class="map" aria-label="路线示意">
              <div class="map__grid" />
              <div class="map__overlay" />
              <div class="pin pin--origin" :title="fixed.origin.name">
                <div class="pin__label">起</div>
              </div>
              <div class="pin pin--dest" :title="fixed.dest.name">
                <div class="pin__label">终</div>
              </div>
              <div class="route" aria-hidden="true" />
              <div class="map__hint">
                <div class="hint-row">
                  <span class="hint-dot hint-dot--origin" />
                  <span class="hint-text">{{ summary.origin }}</span>
                </div>
                <div class="hint-row">
                  <span class="hint-dot hint-dot--dest" />
                  <span class="hint-text">{{ summary.dest }}</span>
                </div>
              </div>
            </section>
          </div>
        </div>

        <div>
          <van-cell-group inset title="确认行程">
            <van-cell title="城市" :value="`${cityName}（${fixed.cityCode}）`" />
            <van-cell title="产品线" :value="`${productName}（${fixed.productCode}）`" />
            <van-cell title="起点">
              <template #value>
                <div class="cell-stack">
                  <div class="cell-stack__title">{{ fixed.origin.name }}</div>
                  <div class="cell-stack__sub">{{ fixed.origin.address }}</div>
                </div>
              </template>
            </van-cell>
            <van-cell title="终点">
              <template #value>
                <div class="cell-stack">
                  <div class="cell-stack__title">{{ fixed.dest.name }}</div>
                  <div class="cell-stack__sub">{{ fixed.dest.address }}</div>
                </div>
              </template>
            </van-cell>
          </van-cell-group>

          <p class="hint-text-block">
            起终点为中文地址；passenger-api 会地理编码并驾车规划预估价。
          </p>

          <div class="action-row">
            <van-button
              type="primary"
              block
              round
              :loading="loading"
              :disabled="!authed || placeOrderDisabled"
              @click="placeOrder"
            >
              {{
                loading
                  ? '正在下单…'
                  : placeOrderBlock.disabled && authed
                    ? '进行中订单未完成'
                    : '立即下单'
              }}
            </van-button>
            <van-button
              v-if="authed"
              round
              plain
              hairline
              type="primary"
              @click="logoutAll"
            >
              退出
            </van-button>
          </div>
          <van-notice-bar
            v-if="!authed"
            class="notice-tight-top"
            color="#ed6a0c"
            background="#fff7e8"
            left-icon="lock"
            text="请先登录后再下单"
          />

          <van-cell-group v-if="lastRequest || lastResponse || lastError" inset title="调试信息" class="section-gap">
            <van-notice-bar v-if="lastError" color="#ee0a24" background="#fef0f0" :text="`请求失败：${lastError}`" />
            <van-cell v-if="lastResponse" title="下单响应">
              <template #value>
                <van-tag v-if="lastResponse?.orderNo" type="success" plain>成功</van-tag>
              </template>
              <template #label>
                <div v-if="createStatusText" class="order-status-line order-status-line--muted">
                  接口返回时状态（不随轮询更新）：
                  <span :class="{ 'status-pending': orderStatusCode(lastResponse?.status) === 7 }">
                    {{ createStatusText }}
                  </span>
                  <span v-if="orderStatusCode(lastResponse?.status) != null" class="status-code-muted">
                    （code={{ orderStatusCode(lastResponse?.status) }}）
                  </span>
                </div>
                <div v-if="displayStatusText && displayStatusText !== '-'" class="order-status-line">
                  {{ trackingOrderNo && liveOrderDetail ? '轮询最新状态' : '当前展示状态' }}：
                  <span :class="{ 'status-pending': displayStatusCode === 7 }">{{ displayStatusText }}</span>
                  <span v-if="displayStatusCode != null" class="status-code-muted">
                    （code={{ displayStatusCode }}）
                  </span>
                </div>
              </template>
            </van-cell>
            <van-collapse v-if="lastRequest" :border="false" class="debug-collapse">
              <van-collapse-item title="请求体" name="req">
                <pre class="mono-block">{{ JSON.stringify(lastRequest, null, 2) }}</pre>
                <p class="debug-endpoint-hint">POST {{ API_BASE_URL }}/app/api/v1/orders</p>
              </van-collapse-item>
            </van-collapse>
          </van-cell-group>

          <van-cell-group v-if="trackingOrderNo && authed" inset title="订单进度" class="section-gap">
            <van-cell title="轮询" :value="`约每 ${POLL_MS / 1000}s · 完单或取消后停止`" />
            <van-cell title="订单号">
              <template #value>
                <span class="order-no-mono">{{ trackingOrderNo }}</span>
              </template>
            </van-cell>
            <van-cell v-if="liveStatusText && liveStatusText !== '-'" title="状态">
              <template #value>
                <span :class="{ 'status-pending': liveStatusCode === 7 }">{{ liveStatusText }}</span>
              </template>
            </van-cell>
            <van-field
              v-if="showCancelOrder"
              v-model="cancelReason"
              label="取消原因"
              placeholder="选填，不填则为「乘客取消」"
              maxlength="120"
              show-word-limit
            />
            <div v-if="showCancelOrder" class="order-actions order-actions--end">
              <van-button
                size="small"
                round
                type="danger"
                plain
                :loading="cancelLoading"
                @click="cancelOrder"
              >
                取消订单
              </van-button>
            </div>
            <p v-if="showCancelOrder" class="cancel-hint">
              已接单后仍可取消；司机已到达或行程开始后需按平台规则（后端可能拒绝）。
            </p>
          </van-cell-group>
        </div>
      </main>

      <div class="footer-safe">
        <span>API</span>
        <span class="mono-inline">{{ API_BASE_URL }}</span>
      </div>
    </div>
  </van-config-provider>
</template>
