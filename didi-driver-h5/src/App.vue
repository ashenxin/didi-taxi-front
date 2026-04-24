<script setup>
import { computed, ref, unref, watch } from 'vue'
import { showConfirmDialog, showToast } from 'vant'

import { API_BASE_URL, getJson, getToken, postJson } from './api/http'
import { useAuth } from './features/auth/useAuth'
import { useDriverActiveTrip } from './features/trip/useDriverActiveTrip'
import { parseDriverIdFromToken } from './utils/jwt'
import { formatAssignedItemStatus, isPendingAssignListStatus } from './utils/orderStatus'
import { getCurrentLatLng } from './utils/geolocation'
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
/** 运力 monitor_status：0 未听单，1 听单中，2 服务中等；null 表示尚未拉取 */
const monitorStatus = ref(null)
const monitorStatusLoading = ref(false)
const acceptLoading = ref(null)
const wsLog = ref([])
let wsConn = null

const pageTitle = computed(() => (authed.value ? '司机工作台' : '司机登录'))
const view = ref('home') // home | teamChangeApply | teamChangeStatus

const driverId = computed(() => parseDriverIdFromToken(getToken()))

/** 与 order-service / driver-api 业务码 409 对齐（如服务中单再派、并发冲突） */
function isConflictError(e) {
  return e?.code === 409 || e?.httpStatus === 409
}

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

/** 听单中或服务中：不可再点「上线听单」 */
const isListeningOrBusy = computed(
  () => monitorStatus.value === 1 || monitorStatus.value === 2,
)
/** 已明确为未听单：不可再点「下线」 */
const isMonitorOffline = computed(() => monitorStatus.value === 0)

const monitorStatusText = computed(() => {
  const ms = monitorStatus.value
  if (ms == null) return '未知'
  if (ms === 0) return '未听单'
  if (ms === 1) return '听单中'
  if (ms === 2) return '服务中'
  return String(ms)
})

const acceptabilityText = computed(() => {
  const can = teamChangeBelonging.value?.canAcceptOrder
  if (typeof can === 'boolean') return can ? '可接单' : '不可接单'
  if (monitorStatus.value == null) return '未知'
  return '未知'
})

function fmtTime(v) {
  if (!v) return '-'
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v))
  if (Number.isNaN(d.getTime())) return String(v)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`
}

function openTeamChange() {
  view.value = 'teamChangeApply'
}

function openTodo(name = '功能') {
  showToast({ message: `${name}：功能待开发`, duration: 1600 })
}

function backToHome() {
  view.value = 'home'
}

function openTeamChangeStatus() {
  view.value = 'teamChangeStatus'
}

const teamChangeLoading = ref(false)
const teamChangeCurrent = ref(null)
const teamChangeBelongingLoading = ref(false)
const teamChangeBelonging = ref(null)
const teamChangeSearchForm = ref({
  cityCode: '',
  companyKeyword: '',
  teamKeyword: '',
})
const teamChangeSearchLoading = ref(false)
const teamChangeCandidates = ref([])
const teamChangeSelected = ref(null)
const teamChangeReason = ref('')

async function loadTeamChangeCurrent() {
  const id = driverId.value
  if (!id) return
  teamChangeLoading.value = true
  try {
    teamChangeCurrent.value = await getJson('/driver/api/v1/team-change-requests/current')
  } catch (e) {
    maybeDropToLogin(e)
    showToast({ type: 'fail', message: e?.message || String(e) })
  } finally {
    teamChangeLoading.value = false
  }
}

async function loadTeamChangeBelonging() {
  const id = driverId.value
  if (!id) return
  teamChangeBelongingLoading.value = true
  try {
    teamChangeBelonging.value = await getJson('/driver/api/v1/team-change/belonging')
  } catch (e) {
    maybeDropToLogin(e)
    showToast({ type: 'fail', message: e?.message || String(e) })
  } finally {
    teamChangeBelongingLoading.value = false
  }
}

async function searchTeamChangeCompanies() {
  teamChangeSearchLoading.value = true
  try {
    const data = await getJson(
      `/driver/api/v1/capacity/companies/search?cityCode=${encodeURIComponent(
        teamChangeSearchForm.value.cityCode || '',
      )}&companyKeyword=${encodeURIComponent(teamChangeSearchForm.value.companyKeyword || '')}&teamKeyword=${encodeURIComponent(
        teamChangeSearchForm.value.teamKeyword || '',
      )}&pageNo=1&pageSize=10`,
    )
    teamChangeCandidates.value = data?.list || []
  } catch (e) {
    maybeDropToLogin(e)
    showToast({ type: 'fail', message: e?.message || String(e) })
  } finally {
    teamChangeSearchLoading.value = false
  }
}

function pickCandidate(item) {
  teamChangeSelected.value = item
}

async function openSubmitConfirm() {
  if (!teamChangeSelected.value?.companyId) {
    showToast({ type: 'fail', message: '请先选择目标车队' })
    return
  }
  try {
    await showConfirmDialog({
      title: '提交前强提醒',
      message:
        '提交后将暂停接单，直到审核通过，或你选择放弃换队并恢复接单。\n\n放弃换队恢复接单后，需要你重新上线听单。',
      confirmButtonText: '确认提交',
      cancelButtonText: '取消',
    })
    await submitTeamChange()
  } catch {
    // cancelled
  }
}

async function submitTeamChange() {
  if (!teamChangeSelected.value?.companyId) return
  const body = {
    toCompanyId: teamChangeSelected.value.companyId,
    requestReason: teamChangeReason.value || '',
  }
  teamChangeSearchLoading.value = true
  try {
    await postJson('/driver/api/v1/team-change-requests', body)
    showToast({ type: 'success', message: '已提交申请' })
    view.value = 'teamChangeStatus'
    await loadTeamChangeCurrent()
    await loadListeningStatus()
  } catch (e) {
    maybeDropToLogin(e)
    const msg = e?.message || String(e)
    showToast({ type: 'fail', message: msg })
  } finally {
    teamChangeSearchLoading.value = false
  }
}

async function cancelTeamChangeAndRestore() {
  const id = teamChangeCurrent.value?.id
  if (!id) return
  try {
    await showConfirmDialog({
      title: '确认操作',
      message: '确认撤销/放弃换队并恢复接单？\n\n恢复后需要重新上线听单。',
      confirmButtonText: '确认',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  teamChangeLoading.value = true
  try {
    await postJson(`/driver/api/v1/team-change-requests/${id}/cancel`, {})
    showToast({ type: 'success', message: '已恢复接单（请重新上线听单）' })
    await loadTeamChangeCurrent()
    await loadListeningStatus()
  } catch (e) {
    maybeDropToLogin(e)
    showToast({ type: 'fail', message: e?.message || String(e) })
  } finally {
    teamChangeLoading.value = false
  }
}

watch(
  [authed, view],
  ([a, v]) => {
    if (a && (v === 'teamChangeApply' || v === 'teamChangeStatus')) {
      loadTeamChangeCurrent()
      loadTeamChangeBelonging()
      if (v === 'teamChangeApply') {
        searchTeamChangeCompanies()
      }
    }
  },
  { immediate: true },
)

async function loadListeningStatus() {
  const id = driverId.value
  if (!id) return
  monitorStatusLoading.value = true
  try {
    const data = await getJson(`/driver/api/v1/drivers/${id}/listening-status`)
    const ms = data?.monitorStatus
    if (ms != null && !Number.isNaN(Number(ms))) {
      monitorStatus.value = Number(ms)
    }
  } catch (e) {
    assignedError.value = e?.message || String(e)
    maybeDropToLogin(e)
  } finally {
    monitorStatusLoading.value = false
  }
}

watch(
  authed,
  (v) => {
    if (v) loadListeningStatus()
    else monitorStatus.value = null
  },
  { immediate: true },
)

function apiBaseToWsBase(base) {
  const b = base.replace(/\/$/, '')
  if (b.startsWith('https://')) return 'wss://' + b.slice(8)
  return 'ws://' + b.replace(/^http:\/\//, '')
}

async function loadAssigned() {
  assignedLoading.value = true
  assignedError.value = ''
  try {
    const raw = (await getJson('/driver/api/v1/orders/assigned')) || []
    assigned.value = raw.filter((item) => isPendingAssignListStatus(item?.status))
    const tripSt = trip.activeTrip?.status
    if (tripSt === 5 || tripSt === 6) {
      trip.clearActiveTrip()
    }
  } catch (e) {
    assignedError.value = e?.message || String(e)
    if (isConflictError(e)) {
      showToast({ type: 'fail', message: e?.message || '操作冲突' })
    }
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
  if (online && isListeningOrBusy.value) return
  if (!online && isMonitorOffline.value) return
  onlineLoading.value = true
  assignedError.value = ''
  const body = { online }
  if (online) {
    try {
      const { lat, lng } = await getCurrentLatLng()
      body.lat = lat
      body.lng = lng
    } catch (e) {
      const hint = e?.message || String(e)
      showToast({
        type: 'fail',
        message: `未获取到位置（${hint}），已仅更新听单状态；附近派单需授权定位`,
        duration: 4000,
      })
    }
  }
  try {
    await postJson(`/driver/api/v1/drivers/${id}/online`, body)
    monitorStatus.value = online ? 1 : 0
    if (online) {
      await loadAssigned()
    }
    if (online && body.lat != null && body.lng != null) {
      showToast({ type: 'success', message: '已上线，位置已上报' })
    } else if (online) {
      showToast({ type: 'success', message: '已上线听单' })
    } else {
      showToast({ type: 'success', message: '已下线' })
    }
  } catch (e) {
    const msg = e?.message || String(e)
    assignedError.value = msg
    showToast({ type: 'fail', message: msg, duration: 2500 })
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
    showToast({ type: 'success', message: '已接单' })
  } catch (e) {
    assignedError.value = e?.message || String(e)
    if (isConflictError(e)) {
      showToast({ type: 'fail', message: e?.message || '操作冲突' })
    }
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
  monitorStatus.value = null
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
              {{
                authed
                  ? '可有多笔待确认；确认一单后其余待确认单由系统取消。服务中单不再派新单（乘客侧 409）'
                  : '支持验证码 / 密码；注册需短信校验'
              }}
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
          <template v-if="view !== 'home'">
            <van-cell-group inset :title="view === 'teamChangeApply' ? '更换车队' : '换队申请状态'" class="section-gap">
              <van-cell>
                <template #title>
                  <div class="teamchange-head">
                    <van-button size="small" plain hairline type="primary" @click="backToHome">返回首页</van-button>
                    <div style="flex: 1"></div>
                    <van-button
                      v-if="view === 'teamChangeApply'"
                      size="small"
                      plain
                      hairline
                      type="primary"
                      @click="openTeamChangeStatus"
                    >
                      查看状态
                    </van-button>
                    <van-button
                      v-else
                      size="small"
                      plain
                      hairline
                      type="primary"
                      @click="openTeamChange"
                    >
                      去申请
                    </van-button>
                  </div>
                </template>
              </van-cell>
            </van-cell-group>

            <!-- 申请页 -->
            <template v-if="view === 'teamChangeApply'">
              <van-cell-group inset title="当前归属（只读）" class="section-gap">
                <van-cell
                  title="城市"
                  :value="teamChangeBelongingLoading ? '加载中…' : teamChangeBelonging?.cityName || '（以档案为准）'"
                />
                <van-cell
                  title="公司/车队"
                  :value="
                    teamChangeBelongingLoading
                      ? '加载中…'
                      : teamChangeBelonging?.fromCompanyName
                        ? `${teamChangeBelonging?.fromCompanyName}${teamChangeBelonging?.fromTeamName ? ` / ${teamChangeBelonging?.fromTeamName}` : ''}`
                        : '（以运力为准）'
                  "
                />
                <van-cell title="状态" :value="`接单资格：${acceptabilityText}；听单：${monitorStatusText}`" />
              </van-cell-group>

              <van-cell-group inset title="目标车队（搜索 + 点选）" class="section-gap">
                <van-field v-model="teamChangeSearchForm.cityCode" label="城市编码" placeholder="可选，如 310000" clearable />
                <van-field v-model="teamChangeSearchForm.companyKeyword" label="公司关键字" placeholder="可选" clearable />
                <van-field v-model="teamChangeSearchForm.teamKeyword" label="车队关键字" placeholder="可选" clearable />
                <div style="padding: 8px 12px 12px">
                  <van-button block round type="primary" :loading="teamChangeSearchLoading" @click="searchTeamChangeCompanies">
                    {{ teamChangeSearchLoading ? '搜索中…' : '搜索' }}
                  </van-button>
                </div>
                <van-empty v-if="!teamChangeSearchLoading && (!teamChangeCandidates || teamChangeCandidates.length === 0)" description="暂无候选" />
                <van-cell
                  v-for="item in teamChangeCandidates"
                  :key="item.companyId"
                  clickable
                  :title="`${item.cityName || item.cityCode || ''} · ${item.companyName || ''}`"
                  :label="`${item.team || ''}（companyId=${item.companyId}）`"
                  @click="pickCandidate(item)"
                >
                  <template #right-icon>
                    <van-tag v-if="teamChangeSelected && teamChangeSelected.companyId === item.companyId" type="success" plain>已选</van-tag>
                    <van-tag v-else plain>选择</van-tag>
                  </template>
                </van-cell>
              </van-cell-group>

              <van-cell-group inset title="申请原因（可选）" class="section-gap">
                <van-field
                  v-model="teamChangeReason"
                  rows="3"
                  autosize
                  label="原因"
                  type="textarea"
                  maxlength="200"
                  show-word-limit
                  placeholder="0-200 字"
                />
              </van-cell-group>

              <van-notice-bar
                v-if="teamChangeCurrent && teamChangeCurrent.status === 'PENDING'"
                class="section-gap"
                left-icon="info-o"
                color="#ed6a0c"
                background="#fff7e8"
                text="你已经有一条待审核申请，建议去状态页查看。"
                wrapable
                :scrollable="false"
              />

              <div class="section-gap">
                <van-button
                  block
                  round
                  type="primary"
                  :disabled="teamChangeCurrent && teamChangeCurrent.status === 'PENDING'"
                  :loading="teamChangeSearchLoading"
                  @click="openSubmitConfirm"
                >
                  提交申请
                </van-button>
              </div>
            </template>

            <!-- 状态页 -->
            <template v-else>
              <van-cell-group inset title="当前/最新申请" class="section-gap">
                <van-empty v-if="!teamChangeCurrent" description="暂无申请" />
                <template v-else>
                  <van-cell title="状态" :value="teamChangeCurrent.status">
                    <template #right-icon>
                      <van-tag v-if="teamChangeCurrent.status === 'PENDING'" type="warning" plain>审核中</van-tag>
                      <van-tag v-else-if="teamChangeCurrent.status === 'REJECTED'" type="danger" plain>已拒绝</van-tag>
                      <van-tag v-else-if="teamChangeCurrent.status === 'APPROVED'" type="success" plain>已通过</van-tag>
                      <van-tag v-else plain>{{ teamChangeCurrent.status }}</van-tag>
                    </template>
                  </van-cell>
                  <van-cell title="from" :value="teamChangeCurrent.fromTeamName || teamChangeCurrent.fromCompanyId" />
                  <van-cell title="to" :value="teamChangeCurrent.toTeamName || teamChangeCurrent.toCompanyId" />
                  <van-cell title="提交时间" :value="fmtTime(teamChangeCurrent.requestedAt)" />
                  <van-cell title="原因" :value="teamChangeCurrent.requestReason || '（未填写）'" />
                  <van-cell v-if="teamChangeCurrent.reviewReason" title="拒绝原因" :value="teamChangeCurrent.reviewReason" />
                </template>
              </van-cell-group>

              <van-cell-group inset title="操作" class="section-gap">
                <van-cell>
                  <template #title>
                    <div class="teamchange-actions">
                      <van-button
                        v-if="teamChangeCurrent && (teamChangeCurrent.status === 'PENDING' || teamChangeCurrent.status === 'REJECTED')"
                        block
                        round
                        type="primary"
                        :loading="teamChangeLoading"
                        @click="cancelTeamChangeAndRestore"
                      >
                        {{ teamChangeCurrent.status === 'PENDING' ? '撤销申请并恢复接单' : '放弃换队并恢复接单' }}
                      </van-button>
                      <van-notice-bar
                        v-else-if="teamChangeCurrent && teamChangeCurrent.status === 'APPROVED'"
                        left-icon="passed"
                        color="#07c160"
                        background="#f0fff4"
                        text="已换队成功，请重新上线听单"
                        :scrollable="false"
                        wrapable
                      />
                      <van-notice-bar
                        v-else-if="teamChangeCurrent && teamChangeCurrent.status === 'CANCELLED'"
                        left-icon="info-o"
                        color="#1989fa"
                        background="#ecf5ff"
                        text="已放弃换队并恢复接单，请重新上线听单"
                        :scrollable="false"
                        wrapable
                      />
                      <van-button v-else block round plain type="primary" @click="openTeamChange">
                        再次申请（示意）
                      </van-button>
                    </div>
                  </template>
                </van-cell>
              </van-cell-group>
            </template>
          </template>

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

          <van-cell-group inset title="首页（登录后）" class="section-gap">
            <van-cell>
              <template #title>
                <div class="home-status-row">
                  <div class="home-status-row__left">
                    <span class="home-status-row__label">接单资格</span>
                    <van-tag type="success" plain>{{ acceptabilityText }}</van-tag>
                  </div>
                  <div class="home-status-row__right">
                    <span class="home-status-row__label">听单状态</span>
                    <van-tag type="primary" plain>{{ monitorStatusText }}</van-tag>
                  </div>
                </div>
              </template>
            </van-cell>
          </van-cell-group>

          <van-notice-bar
            class="section-gap"
            left-icon="location-o"
            color="#323233"
            background="#f7f8fa"
            text="上线听单将请求浏览器定位，用于附近派单（写入司机池 GEO）；拒绝权限仍可上线，但不参与距离匹配。"
            wrapable
            :scrollable="false"
          />

          <div class="toolbar-panel section-gap">
            <div class="toolbar-row">
            <van-button
              type="primary"
              round
              :loading="onlineLoading"
              :disabled="monitorStatusLoading || isListeningOrBusy"
              @click="setOnline(true)"
            >
              {{ onlineLoading ? '…' : '上线听单' }}
            </van-button>
            <van-button
              type="warning"
              round
              plain
              :loading="onlineLoading"
              :disabled="monitorStatusLoading || isMonitorOffline"
              @click="setOnline(false)"
            >
              {{ onlineLoading ? '…' : '下线' }}
            </van-button>
            <van-button round :loading="assignedLoading" @click="loadAssigned">
              {{ assignedLoading ? '加载中' : '刷新指派单' }}
            </van-button>
            <van-button round plain hairline type="danger" @click="logoutAll">退出登录</van-button>
            </div>
          </div>

          <van-cell-group inset title="更多功能入口" class="section-gap entry-grid">
            <van-grid :column-num="3" :border="false" clickable>
              <van-grid-item icon="balance-o" text="钱包（待开发）" @click="openTodo('钱包')" />
              <van-grid-item icon="records-o" text="行程记录（待开发）" @click="openTodo('行程记录')" />
              <van-grid-item icon="like-o" text="服务分（待开发）" @click="openTodo('服务分')" />
              <van-grid-item icon="setting-o" text="设置（待开发）" @click="openTodo('设置')" />
            </van-grid>
          </van-cell-group>

          <van-cell-group inset title="我的 / 设置" class="section-gap">
            <van-cell title="更换车队" label="提交申请 / 暂停接单 / 审核后生效" is-link clickable @click="openTeamChange">
              <template #icon>
                <van-icon name="exchange" class="my-cell-icon" />
              </template>
            </van-cell>
            <van-cell title="换队申请状态" label="查看审核进度 / 撤销并恢复接单" is-link clickable @click="openTeamChangeStatus">
              <template #icon>
                <van-icon name="notes-o" class="my-cell-icon" />
              </template>
            </van-cell>
            <van-cell title="其他功能" label="功能待开发" is-link clickable @click="openTodo('其他功能')">
              <template #icon>
                <van-icon name="apps-o" class="my-cell-icon" />
              </template>
            </van-cell>
          </van-cell-group>
          </template>

          <van-notice-bar
            v-if="trip.activeTripOrderNo && (!assigned || assigned.length === 0)"
            left-icon="info-o"
            color="#1989fa"
            background="#ecf5ff"
            text="暂无新指派单。已接单～行程中（ACCEPTED～STARTED）不会再派新单。"
            wrapable
            :scrollable="false"
            class="section-gap"
          />

          <van-empty
            v-if="assigned && assigned.length === 0 && !trip.activeTripOrderNo"
            image="search"
            description="暂无指派单（未派单或订单服务未启动时为空）"
          />

          <div v-else-if="assigned && assigned.length > 0" class="section-gap">
            <van-notice-bar
              v-if="assigned.length > 1"
              left-icon="volume-o"
              color="#ed6a0c"
              background="#fff7e8"
              text="当前有多笔待确认；确认其中一单后，其余 ASSIGNED / 待确认 订单将由系统自动取消。"
              wrapable
              :scrollable="false"
              class="assign-multi-hint"
            />
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
