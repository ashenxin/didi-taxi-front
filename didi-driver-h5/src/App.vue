<script setup>
import { computed, ref, unref } from 'vue'

import { API_BASE_URL, getJson, getToken, postJson } from './api/http'
import { useAuth } from './features/auth/useAuth'
import { useDriverActiveTrip } from './features/trip/useDriverActiveTrip'
import { parseDriverIdFromToken } from './utils/jwt'
import { formatAssignedItemStatus } from './utils/orderStatus'
import { nextTripAction, tripStatusLabel } from './utils/tripStatus'

const themeVars = {
  primaryColor: '#2563eb',
  successColor: '#07c160',
  dangerColor: '#ee0a24',
  radiusMd: '12px',
  buttonRadius: '999px',
  cellFontSize: '15px',
  cellGroupInsetPadding: '0 12px',
  navBarIconColor: '#2563eb',
}

const {
  authed,
  authTab,
  showRegister,
  phone,
  password,
  smsCode,
  authLoading,
  smsSending,
  smsHint,
  authError,
  openRegister,
  backToLogin,
  sendSms,
  loginSms,
  loginPassword,
  registerSms,
  registerPassword,
  logout,
  maybeDropToLogin,
} = useAuth()

const assignedLoading = ref(false)
const assigned = ref([])
const assignedError = ref('')
const onlineLoading = ref(false)
const acceptLoading = ref(null)
const wsLog = ref([])
let wsConn = null

const pageTitle = computed(() => (authed.value ? '司机工作台' : '司机登录'))

const driverId = computed(() => parseDriverIdFromToken(getToken()))

const trip = useDriverActiveTrip(driverId, {
  getJson,
  postJson,
  maybeDropToLogin,
  authed,
})

/** 订单行：reactive 内嵌 ref，脚本里用 unref 与模板一致 */
function tripRow() {
  return unref(trip.activeTrip)
}

/** van-steps：接单→到达→行程→完单 */
const tripStepActive = computed(() => {
  const raw = tripRow()?.status
  const s = raw == null ? NaN : Number(raw)
  if (Number.isNaN(s) || s === 6) return 0
  if (s >= 5) return 3
  if (s === 4) return 3
  if (s === 3) return 2
  if (s === 2) return 1
  return 0
})

/** 当前可点的行程动作（与 order-service status 对齐） */
const tripActionKey = computed(() => nextTripAction(tripRow()?.status))

function apiBaseToWsBase(base) {
  const b = base.replace(/\/$/, '')
  if (b.startsWith('https://')) return 'wss://' + b.slice(8)
  return 'ws://' + b.replace(/^http:\/\//, '')
}

async function loadAssigned() {
  assignedLoading.value = true
  assignedError.value = ''
  try {
    assigned.value = (await getJson('/driver/api/v1/orders/assigned')) || []
  } catch (e) {
    assignedError.value = e?.message || String(e)
    maybeDropToLogin(e)
  } finally {
    assignedLoading.value = false
  }
}

async function setOnline(online) {
  const id = driverId.value
  if (!id) {
    assignedError.value = '无法解析司机 ID（请重新登录）'
    return
  }
  onlineLoading.value = true
  assignedError.value = ''
  try {
    await postJson(`/driver/api/v1/drivers/${id}/online`, { online })
  } catch (e) {
    assignedError.value = e?.message || String(e)
    maybeDropToLogin(e)
  } finally {
    onlineLoading.value = false
  }
}

async function acceptOrder(orderNo) {
  const id = driverId.value
  if (!id || !orderNo) return
  acceptLoading.value = orderNo
  assignedError.value = ''
  try {
    await postJson(`/driver/api/v1/orders/${encodeURIComponent(orderNo)}/accept`, { driverId: id })
    await loadAssigned()
    trip.beginFollowingOrder(orderNo)
  } catch (e) {
    assignedError.value = e?.message || String(e)
    maybeDropToLogin(e)
  } finally {
    acceptLoading.value = null
  }
}

async function connectDriverWs() {
  assignedError.value = ''
  wsLog.value = []
  try {
    const data = await postJson('/driver/api/v1/auth/ws-token', {})
    const wsTok = data?.accessToken
    if (!wsTok) {
      assignedError.value = '未拿到 WS token'
      return
    }
    if (wsConn) {
      wsConn.close()
      wsConn = null
    }
    const url = `${apiBaseToWsBase(API_BASE_URL)}/driver/ws/v1/stream?token=${encodeURIComponent(wsTok)}`
    wsConn = new WebSocket(url)
    wsConn.onopen = () => {
      wsLog.value = [...wsLog.value, '[open]']
    }
    wsConn.onmessage = (ev) => {
      wsLog.value = [...wsLog.value, `[msg] ${ev.data}`]
    }
    wsConn.onerror = () => {
      wsLog.value = [...wsLog.value, '[error]']
    }
    wsConn.onclose = (ev) => {
      wsLog.value = [...wsLog.value, `[close] code=${ev.code}`]
      wsConn = null
    }
  } catch (e) {
    assignedError.value = e?.message || String(e)
    maybeDropToLogin(e)
  }
}

function disconnectWs() {
  if (wsConn) {
    wsConn.close()
    wsConn = null
  }
}

async function logoutAll() {
  disconnectWs()
  trip.clearActiveTrip()
  assigned.value = []
  assignedError.value = ''
  wsLog.value = []
  await logout()
}

</script>

<template>
  <van-config-provider :theme-vars="themeVars">
    <div class="page page--driver">
      <van-nav-bar class="app-nav" :title="pageTitle" :border="false" safe-area-inset-top>
        <template #right>
          <span class="nav-eyebrow">联调工具</span>
        </template>
      </van-nav-bar>

      <div class="hero-strip">
        <div class="hero-strip__inner">
          <div class="hero-strip__icon" aria-hidden="true">🧭</div>
          <div class="hero-strip__text">
            <div class="hero-strip__title">{{ authed ? '听单 · 行程 · 完单' : '司机账号登录' }}</div>
            <div class="hero-strip__sub">
              {{ authed ? '上线后可刷新指派单；行程面板与订单服务状态同步' : '支持验证码 / 密码；注册需短信校验' }}
            </div>
          </div>
        </div>
      </div>

      <main class="page-main">
        <van-notice-bar
          v-if="!authed"
          left-icon="info-o"
          :text="`网关 ${API_BASE_URL}`"
          wrapable
          :scrollable="false"
        />

        <van-cell-group v-if="!authed" inset :title="showRegister ? '注册' : '登录'" class="section-gap">
          <van-tabs v-model:active="authTab" shrink animated>
            <van-tab title="验证码" name="sms">
              <van-field v-model="phone" label="手机号" type="tel" maxlength="11" placeholder="手机号" clearable />
              <van-field v-model="smsCode" center clearable label="验证码" placeholder="验证码">
                <template #button>
                  <van-button size="small" type="primary" :loading="smsSending" @click="sendSms">
                    {{ smsSending ? '发送中' : '发送' }}
                  </van-button>
                </template>
              </van-field>
              <p v-if="smsHint" class="van-field__error-message auth-hint-center">
                {{ smsHint }}
              </p>
              <div style="padding: 8px 16px 16px">
                <van-button
                  v-if="!showRegister"
                  block
                  round
                  type="primary"
                  native-type="button"
                  :loading="authLoading"
                  @click="loginSms"
                >
                  验证码登录
                </van-button>
                <van-button
                  v-else
                  block
                  round
                  type="primary"
                  native-type="button"
                  :loading="authLoading"
                  @click="registerSms"
                >
                  验证码注册
                </van-button>
              </div>
            </van-tab>
            <van-tab title="密码" name="pwd">
              <van-field v-model="phone" label="手机号" type="tel" maxlength="11" placeholder="手机号" clearable />
              <van-field v-model="password" type="password" label="密码" placeholder="密码" />
              <p class="auth-tip">若未设置密码，可改用验证码或先注册。</p>
              <template v-if="showRegister">
                <van-field v-model="smsCode" center clearable label="验证码" placeholder="验证码">
                  <template #button>
                    <van-button size="small" type="primary" :loading="smsSending" @click="sendSms">
                      {{ smsSending ? '发送中' : '发送' }}
                    </van-button>
                  </template>
                </van-field>
                <p v-if="smsHint" class="van-field__error-message auth-hint-center">
                  {{ smsHint }}
                </p>
              </template>
              <div style="padding: 8px 16px 16px">
                <van-button
                  v-if="!showRegister"
                  block
                  round
                  type="primary"
                  native-type="button"
                  :loading="authLoading"
                  @click="loginPassword"
                >
                  密码登录
                </van-button>
                <van-button
                  v-else
                  block
                  round
                  type="primary"
                  native-type="button"
                  :loading="authLoading"
                  @click="registerPassword"
                >
                  密码注册
                </van-button>
              </div>
            </van-tab>
          </van-tabs>
          <van-notice-bar
            v-if="authError"
            color="#ee0a24"
            background="#fef0f0"
            left-icon="warning-o"
            :text="authError"
            wrapable
            :scrollable="false"
          />
          <van-cell>
            <template #value>
              <div class="auth-switch-row">
                <span class="auth-switch-row__label">{{ showRegister ? '已有账号？' : '没有账号？' }}</span>
                <van-button v-if="!showRegister" size="small" plain hairline type="primary" @click="openRegister">
                  去注册
                </van-button>
                <van-button v-else size="small" plain hairline type="primary" @click="backToLogin">
                  返回登录
                </van-button>
              </div>
            </template>
          </van-cell>
        </van-cell-group>

        <template v-else>
          <van-cell-group inset title="工作台">
            <van-cell>
              <template #title>
                <span class="token-hint">
                  Token 含 <code>tv</code> / <code>audit</code> ；退出会调用服务端作废会话。
                </span>
              </template>
            </van-cell>
          </van-cell-group>

          <div class="toolbar-panel section-gap">
            <div class="toolbar-row">
            <van-button type="primary" round :loading="onlineLoading" @click="setOnline(true)">
              {{ onlineLoading ? '…' : '上线听单' }}
            </van-button>
            <van-button type="warning" round plain :loading="onlineLoading" @click="setOnline(false)">
              {{ onlineLoading ? '…' : '下线' }}
            </van-button>
            <van-button round :loading="assignedLoading" @click="loadAssigned">
              {{ assignedLoading ? '加载中' : '刷新指派单' }}
            </van-button>
            <van-button round plain hairline type="danger" @click="logoutAll">退出登录</van-button>
            </div>
          </div>

          <van-empty
            v-if="assigned && assigned.length === 0 && !trip.activeTripOrderNo"
            image="search"
            description="暂无指派单（未派单或订单服务未启动时为空）"
          />

          <div v-else-if="assigned && assigned.length > 0" class="section-gap">
            <van-card v-for="item in assigned" :key="item.orderNo" class="assign-card">
              <template #title>
                <span class="mono-tight">{{ item.orderNo }}</span>
              </template>
              <template #tags>
                <van-tag
                  plain
                  :type="item.status === 'PENDING_DRIVER_CONFIRM' ? 'warning' : 'primary'"
                >
                  {{ formatAssignedItemStatus(item.status) }}
                </van-tag>
              </template>
              <template #desc>
                <div v-if="item.pickup?.name" class="assign-pickup">上车：{{ item.pickup.name }}</div>
                <div v-if="item.offerExpiresAt" class="assign-deadline">确认截止：{{ item.offerExpiresAt }}</div>
              </template>
              <template #footer>
                <van-button
                  type="primary"
                  size="small"
                  round
                  block
                  :loading="acceptLoading === item.orderNo"
                  @click="acceptOrder(item.orderNo)"
                >
                  {{ acceptLoading === item.orderNo ? '提交中…' : '确认接单' }}
                </van-button>
              </template>
            </van-card>
          </div>

          <van-cell-group v-if="trip.activeTripOrderNo" inset title="行程" class="trip-panel">
            <van-cell>
              <template #value>
                <van-button size="mini" plain hairline type="primary" @click="trip.dismissTripPanel">
                  关闭面板
                </van-button>
              </template>
              <template #title>
                <span class="mono-tight">{{ trip.activeTripOrderNo }}</span>
              </template>
              <template #label>
                <span class="trip-panel__poll-hint">
                  约每 {{ trip.POLL_MS / 1000 }}s 同步；完单或取消后停止轮询
                </span>
              </template>
            </van-cell>

            <van-cell v-if="trip.tripLoading && !trip.activeTrip" title="状态" value="加载订单…" />

            <template v-else-if="trip.activeTrip">
              <van-cell :title="tripStatusLabel(trip.activeTrip.status)">
                <template #value>
                  <span v-if="trip.activeTrip.status != null" class="trip-status-code">
                    status={{ trip.activeTrip.status }}
                  </span>
                </template>
              </van-cell>

              <div v-if="trip.activeTrip.status !== 6" style="padding: 12px 16px 4px">
                <van-steps :active="tripStepActive" active-color="#2563eb">
                  <van-step>接单</van-step>
                  <van-step>到达</van-step>
                  <van-step>开始行程</van-step>
                  <van-step>行程结束</van-step>
                </van-steps>
              </div>

              <van-cell
                v-if="trip.activeTrip.originAddress || trip.activeTrip.destAddress"
                title="路线"
              >
                <template #value>
                  <div class="trip-route-block">
                    <div v-if="trip.activeTrip.originAddress" class="trip-route-block__row">
                      <van-tag type="success" plain size="medium">起</van-tag>
                      {{ trip.activeTrip.originAddress }}
                    </div>
                    <div v-if="trip.activeTrip.destAddress" class="trip-route-block__row">
                      <van-tag type="warning" plain size="medium">终</van-tag>
                      {{ trip.activeTrip.destAddress }}
                    </div>
                  </div>
                </template>
              </van-cell>

              <van-notice-bar
                v-if="trip.activeTrip.status === 1 || trip.activeTrip.status === 7"
                color="#ed6a0c"
                background="#fff7e8"
                left-icon="clock-o"
                text="订单待确认接单，请回到上方指派单点击「确认接单」后再操作行程"
                wrapable
                :scrollable="false"
              />

              <div v-if="tripActionKey" class="trip-action-buttons">
                <van-button
                  v-if="tripActionKey === 'arrive'"
                  block
                  round
                  type="primary"
                  :loading="trip.tripActionLoading"
                  @click="trip.arrive"
                >
                  {{ trip.tripActionLoading ? '提交中…' : '到达上车点' }}
                </van-button>
                <van-button
                  v-if="tripActionKey === 'start'"
                  block
                  round
                  type="primary"
                  :loading="trip.tripActionLoading"
                  @click="trip.startTrip"
                >
                  {{ trip.tripActionLoading ? '提交中…' : '开始行程' }}
                </van-button>
                <template v-if="tripActionKey === 'finish'">
                  <van-field
                    v-model="trip.finishFinalAmount"
                    class="trip-finish-field"
                    label="实付"
                    placeholder="可选，不填用预估"
                    inputmode="decimal"
                    autocomplete="off"
                  />
                  <van-button
                    block
                    round
                    type="primary"
                    class="trip-finish-btn"
                    :loading="trip.tripActionLoading"
                    @click="trip.finishTrip"
                  >
                    {{ trip.tripActionLoading ? '提交中…' : '行程结束' }}
                  </van-button>
                </template>
              </div>
              <van-notice-bar
                v-else-if="trip.activeTrip.status === 5"
                color="#07c160"
                background="#f0fff4"
                left-icon="passed"
                text="本单已完成，可关闭面板或继续听单"
                :scrollable="false"
              />
              <van-notice-bar
                v-else-if="trip.activeTrip.status === 6"
                color="#ee0a24"
                background="#fef0f0"
                left-icon="close"
                text="本单已取消"
                :scrollable="false"
              />
            </template>

            <van-notice-bar
              v-if="trip.tripError"
              color="#ee0a24"
              background="#fef0f0"
              left-icon="warning-o"
              :text="trip.tripError"
              wrapable
              :scrollable="false"
            />
          </van-cell-group>

          <van-cell-group inset title="WebSocket（可选）" class="section-gap">
            <van-cell title="说明" value="先 ws-token 再连 /driver/ws/v1/stream" />
            <van-cell>
              <template #value>
                <div class="ws-actions">
                  <van-button size="small" round type="primary" @click="connectDriverWs">连接</van-button>
                  <van-button size="small" round plain @click="disconnectWs">断开</van-button>
                </div>
              </template>
            </van-cell>
            <pre v-if="wsLog.length" class="ws-log-pre">{{ wsLog.join('\n') }}</pre>
          </van-cell-group>

          <van-notice-bar
            v-if="assignedError"
            color="#ee0a24"
            background="#fef0f0"
            left-icon="warning-o"
            :text="assignedError"
            wrapable
            :scrollable="false"
            class="section-gap"
          />
        </template>
      </main>
    </div>
  </van-config-provider>
</template>
