<script setup>
import { computed, onBeforeUnmount, onMounted, ref, unref, watch } from 'vue'
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
const countdownNowMs = ref(Date.now())
const onlineLoading = ref(false)
/** 运力 monitor_status：0 未听单，1 听单中，2 服务中等；null 表示尚未拉取 */
const monitorStatus = ref(null)
const monitorStatusLoading = ref(false)
const acceptLoading = ref(null)
/** 拒单中的订单号 */
const rejectLoading = ref(null)
const wsLog = ref([])
const wsConnected = ref(false)
let wsPingTimer = null
let listeningHeartbeatTimer = null
let listeningHeartbeatInFlight = false
let wsReconnectTimer = null
let countdownTimer = null
let wsReconnectAttempt = 0
let wsConnGeneration = 0
let wsShouldReconnect = false
const ENABLE_WS_ASSIGNED = true
const WS_RECONNECT_MAX_MS = 30_000
const WS_PING_MS = 15_000
const LISTENING_HEARTBEAT_MS = 15_000
const LISTENING_INTENT_KEY = 'didi_driver_listening_intent_driver_id'
const assignedDetailCache = new Map()
const reasonSheetShow = ref(false)
const reasonSheetTitle = ref('')
let reasonSheetResolver = null

/** 拒单 / 司机取消（到达前）共用原因码，与后端约定单选 */
const DRIVER_REASON_SHEET = [
  { name: '距离太远', code: 'TOO_FAR' },
  { name: '临时无法接单', code: 'TEMPORARILY_UNAVAILABLE' },
  { name: '车辆问题', code: 'VEHICLE_ISSUE' },
  { name: '其他', code: 'OTHER' },
]
const reasonSheetActions = DRIVER_REASON_SHEET.map((r) => ({ name: r.name, code: r.code }))
let wsConn = null

const pageTitle = computed(() => (authed.value ? '司机工作台' : '司机登录'))
const view = ref('home') // home | teamChangeApply | teamChangeStatus

const driverId = computed(() => parseDriverIdFromToken(getToken()))

function hasListeningIntent() {
  const id = driverId.value
  return Boolean(id) && sessionStorage.getItem(LISTENING_INTENT_KEY) === String(id)
}

function setListeningIntent(enabled) {
  const id = driverId.value
  if (enabled && id) {
    sessionStorage.setItem(LISTENING_INTENT_KEY, String(id))
  } else {
    sessionStorage.removeItem(LISTENING_INTENT_KEY)
  }
}

function stopListeningHeartbeat() {
  if (listeningHeartbeatTimer) {
    clearInterval(listeningHeartbeatTimer)
    listeningHeartbeatTimer = null
  }
}

async function sendListeningHeartbeat() {
  const id = driverId.value
  if (!id || !authed.value || !hasListeningIntent() || listeningHeartbeatInFlight) return
  listeningHeartbeatInFlight = true
  const body = {}
  try {
    try {
      const { lat, lng } = await getCurrentLatLng()
      body.lat = lat
      body.lng = lng
    } catch {
      // 定位失败时仍续 Presence，避免短暂定位问题导致司机被误清理。
    }
    await postJson(`/driver/api/v1/drivers/${id}/heartbeat`, body)
  } catch (e) {
    maybeDropToLogin(e)
  } finally {
    listeningHeartbeatInFlight = false
  }
}

function startListeningHeartbeat() {
  stopListeningHeartbeat()
  if (!hasListeningIntent()) return
  void sendListeningHeartbeat()
  listeningHeartbeatTimer = setInterval(() => {
    void sendListeningHeartbeat()
  }, LISTENING_HEARTBEAT_MS)
}

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
  if (monitorStatus.value === 2) return '服务中'
  if (monitorStatus.value === 0 || monitorStatus.value === 1) return '可接单'
  return teamChangeBelongingLoading.value ? '同步中' : '未知'
})

const assignedCount = computed(() => assigned.value?.length || 0)

const realtimeConnectionText = computed(() => {
  if (wsConnected.value) return '已连接'
  return '连接中'
})

const workState = computed(() => {
  if (trip.activeTripOrderNo) return 'trip'
  if (assignedCount.value > 0) return 'assigned'
  if (monitorStatus.value === 1) return 'listening'
  if (monitorStatus.value === 2) return 'busy'
  return 'offline'
})

const workStateTitle = computed(() => {
  if (workState.value === 'trip') return '行程进行中'
  if (workState.value === 'assigned') return `${assignedCount.value} 笔待确认指派`
  if (workState.value === 'listening') return '听单中'
  if (workState.value === 'busy') return '服务中'
  return '未上线听单'
})

const workStateHint = computed(() => {
  if (workState.value === 'trip') return '按行程状态推进，到达、开始和完单都在下方操作。'
  if (workState.value === 'assigned') return '请确认乘客行程信息，接单或拒单后会立即同步后端。'
  if (workState.value === 'listening') return '暂无新指派，保持页面打开可接收 WebSocket 推送。'
  if (workState.value === 'busy') return '后端标记服务中，当前不会继续派新单。'
  return '上线后会请求定位，用于附近派单和司机池 GEO 写入。'
})

const workStateTagType = computed(() => {
  if (workState.value === 'assigned') return 'warning'
  if (workState.value === 'trip' || workState.value === 'listening') return 'success'
  if (workState.value === 'busy') return 'primary'
  return 'default'
})

function firstText(...values) {
  const hit = values.find((v) => v != null && String(v).trim())
  return hit == null ? '' : String(hit)
}

function placeText(place) {
  if (!place) return ''
  if (typeof place === 'string') return place
  return firstText(place.name, place.address, place.poiName)
}

function assignedPickupText(item) {
  return firstText(placeText(item?.pickup), placeText(item?.origin), item?.originAddress, item?.startAddress, item?.fromAddress)
}

function assignedDestText(item) {
  return firstText(
    placeText(item?.destination),
    placeText(item?.dest),
    item?.destAddress,
    item?.destinationAddress,
    item?.endAddress,
    item?.toAddress,
  )
}

function assignedDistanceText(item) {
  const meters = item?.distanceMeters ?? item?.distance ?? item?.driverDistanceMeters
  const n = Number(meters)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n >= 1000) return `${(n / 1000).toFixed(1)} km`
  return `${Math.round(n)} m`
}

function assignedFareText(item) {
  const amount = item?.estimatedFare ?? item?.estimateAmount ?? item?.fareAmount ?? item?.amount
  if (amount == null || amount === '') return ''
  const n = Number(amount)
  if (!Number.isNaN(n)) return `¥${n.toFixed(2)}`
  return String(amount)
}

function parseTimeMs(v) {
  if (!v) return NaN
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v))
  const ms = d.getTime()
  return Number.isFinite(ms) ? ms : NaN
}

function offerCountdownSeconds(item) {
  const expiresAtMs = parseTimeMs(item?.offerExpiresAt)
  if (!Number.isFinite(expiresAtMs)) return null
  return Math.max(0, Math.ceil((expiresAtMs - countdownNowMs.value) / 1000))
}

function offerCountdownText(item) {
  const seconds = offerCountdownSeconds(item)
  if (seconds == null) return '等待后端确认窗口'
  if (seconds <= 0) return '已超时，等待系统释放'
  return `${seconds}s 后自动拒单`
}

function isOfferExpired(item) {
  const seconds = offerCountdownSeconds(item)
  return seconds != null && seconds <= 0
}

function offerCountdownStyle(item) {
  const seconds = offerCountdownSeconds(item)
  if (seconds == null) return { '--offer-countdown-progress': '0%' }
  const pct = Math.max(0, Math.min(100, (seconds / 30) * 100))
  return { '--offer-countdown-progress': `${pct}%` }
}

function mergeAssignedDetail(item, detail) {
  if (!detail) return item
  return {
    ...item,
    originAddress: item?.originAddress ?? detail.originAddress,
    destAddress: item?.destAddress ?? detail.destAddress,
    estimatedFare: item?.estimatedFare ?? detail.estimatedAmount,
    estimateAmount: item?.estimateAmount ?? detail.estimatedAmount,
    status: item?.status ?? detail.status,
  }
}

function needsAssignedDetail(item) {
  return item?.orderNo && (!assignedPickupText(item) || !assignedDestText(item) || !assignedFareText(item))
}

async function hydrateAssignedDetails(raw) {
  const list = toVisibleAssignedList(raw)
  return Promise.all(
    list.map(async (item) => {
      if (!needsAssignedDetail(item)) return item
      const orderNo = String(item.orderNo)
      const cached = assignedDetailCache.get(orderNo)
      if (cached) return mergeAssignedDetail(item, cached)
      try {
        const detail = await getJson('/driver/api/v1/orders/' + encodeURIComponent(orderNo))
        assignedDetailCache.set(orderNo, detail)
        return mergeAssignedDetail(item, detail)
      } catch {
        return item
      }
    }),
  )
}

function toVisibleAssignedList(raw) {
  const list = Array.isArray(raw) ? raw : []
  return list.filter((item) => isPendingAssignListStatus(item?.status))
}

function setAssignedList(raw, { preservePendingConfirm = false } = {}) {
  const next = toVisibleAssignedList(raw)
  if (!preservePendingConfirm) {
    assigned.value = next
    return
  }
  const currentByOrderNo = new Map((assigned.value || []).map((item) => [item?.orderNo, item]))
  assigned.value = next.map((item) => {
    const current = currentByOrderNo.get(item?.orderNo)
    if (current?.status === 'PENDING_DRIVER_CONFIRM' && item?.status === 'ASSIGNED') {
      return { ...item, ...current }
    }
    return item
  })
}

function shortOrderNo(orderNo) {
  if (!orderNo) return '-'
  const s = String(orderNo)
  return s.length > 12 ? `${s.slice(0, 6)}...${s.slice(-6)}` : s
}

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

/**
 * 已在听单中时静默补一次上线 + 坐标，解决：Redis GEO TTL 过期、刷新页面后库表仍为听单但司机不在池内，导致第二次下单无法迟滞匹配。
 */
async function reseedListeningGeoQuiet(force = false) {
  const id = driverId.value
  if (!id || (!force && monitorStatus.value !== 1)) return
  try {
    const body = { online: true }
    try {
      const { lat, lng } = await getCurrentLatLng()
      body.lat = lat
      body.lng = lng
    } catch {
      /* 无坐标则仍发 online，仅无法写 GEO（与手动上线一致） */
    }
    await postJson(`/driver/api/v1/drivers/${id}/online`, body)
    monitorStatus.value = 1
    setListeningIntent(true)
    startListeningHeartbeat()
    await loadAssigned(true)
  } catch (e) {
    maybeDropToLogin(e)
  }
}

async function loadListeningStatus() {
  const id = driverId.value
  if (!id) return
  monitorStatusLoading.value = true
  try {
    const data = await getJson(`/driver/api/v1/drivers/${id}/listening-status`)
    const ms = data?.monitorStatus
    if (ms != null && !Number.isNaN(Number(ms))) {
      monitorStatus.value = Number(ms)
      if (Number(ms) === 1) {
        setListeningIntent(true)
        void reseedListeningGeoQuiet()
      }
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
    if (v) {
      loadListeningStatus()
      loadTeamChangeBelonging()
      loadAssigned(true)
      connectDriverWs()
    } else {
      monitorStatus.value = null
      stopListeningHeartbeat()
      disconnectWs()
    }
  },
  { immediate: true },
)

function apiBaseToWsBase(base) {
  const b = base.replace(/\/$/, '')
  if (b.startsWith('https://')) return 'wss://' + b.slice(8)
  return 'ws://' + b.replace(/^http:\/\//, '')
}

function resolveDriverWsBaseUrl() {
  const fromEnv = import.meta?.env?.VITE_DRIVER_WS_BASE_URL
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/$/, '')
  }
  // 默认沿用 API_BASE_URL；若它指向网关且网关未做 WS 转发，可在 .env.development 配置 VITE_DRIVER_WS_BASE_URL
  return apiBaseToWsBase(API_BASE_URL)
}

function stopWsPing() {
  if (wsPingTimer) {
    clearInterval(wsPingTimer)
    wsPingTimer = null
  }
}

function stopWsReconnect() {
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer)
    wsReconnectTimer = null
  }
}

function nextDriverWsBackoffMs() {
  const step = Math.min(WS_RECONNECT_MAX_MS, 2000 * 2 ** wsReconnectAttempt)
  wsReconnectAttempt += 1
  return Math.floor(step + Math.random() * 800)
}

function scheduleDriverWsReconnect(connGen) {
  stopWsReconnect()
  if (!wsShouldReconnect || !authed.value || connGen !== wsConnGeneration) return
  wsReconnectTimer = setTimeout(() => {
    wsReconnectTimer = null
    if (!wsShouldReconnect || !authed.value || connGen !== wsConnGeneration) return
    void connectDriverWs({ preserveLog: true })
  }, nextDriverWsBackoffMs())
}

function sendDriverWsPing(reason = 'timer') {
  try {
    if (wsConn && wsConn.readyState === WebSocket.OPEN) {
      wsConn.send('ping')
      return true
    }
  } catch {
    // ignore
  }
  if (reason !== 'timer') {
    wsConnected.value = false
  }
  return false
}

function startWsPing() {
  stopWsPing()
  if (!wsConn) return
  sendDriverWsPing('open')
  wsPingTimer = setInterval(() => {
    sendDriverWsPing('timer')
  }, WS_PING_MS)
}

function reviveDriverWs(reason = 'visibility') {
  if (!wsShouldReconnect || !authed.value) return
  if (sendDriverWsPing(reason)) return
  void connectDriverWs({ preserveLog: true })
}

async function loadAssigned(forceHttp = false) {
  if (ENABLE_WS_ASSIGNED && wsConnected.value && !forceHttp) {
    // WS 已接管 assigned 推送；派单变更后可用 forceHttp 立即与 HTTP 对齐
    return
  }
  assignedLoading.value = true
  assignedError.value = ''
  try {
    const raw = (await getJson('/driver/api/v1/orders/assigned')) || []
    setAssignedList(await hydrateAssignedDetails(raw))
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

async function onRefreshAssigned() {
  if (assignedLoading.value) return
  await loadAssigned(true)
}

async function setOnline(online) {
  const id = driverId.value
  if (!id) {
    assignedError.value = '无法解析司机 ID（请重新登录）'
    return
  }
  if (!online && isMonitorOffline.value) return
  const wasOrderListening = monitorStatus.value === 1
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
    setListeningIntent(online)
    if (online) startListeningHeartbeat()
    else stopListeningHeartbeat()
    if (online) {
      await loadAssigned(true)
    }
    if (online && body.lat != null && body.lng != null) {
      if (wasOrderListening) {
        showToast({ type: 'success', message: '位置已更新，已重新写入司机池' })
      } else {
        showToast({ type: 'success', message: '已上线，位置已上报' })
      }
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
    await loadAssigned(true)
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

async function pickDriverReasonCode(sheetTitle) {
  reasonSheetTitle.value = sheetTitle
  reasonSheetShow.value = true
  return new Promise((resolve) => {
    reasonSheetResolver = resolve
  })
}

function onReasonSheetSelect(action) {
  reasonSheetShow.value = false
  if (reasonSheetResolver) {
    reasonSheetResolver(action?.code ?? null)
    reasonSheetResolver = null
  }
}

function onReasonSheetCancel() {
  reasonSheetShow.value = false
  if (reasonSheetResolver) {
    reasonSheetResolver(null)
    reasonSheetResolver = null
  }
}

async function rejectOrder(orderNo) {
  const id = driverId.value
  if (!id || !orderNo) return
  const reasonCode = await pickDriverReasonCode('拒单原因')
  if (!reasonCode) return
  rejectLoading.value = orderNo
  assignedError.value = ''
  try {
    await postJson(`/driver/api/v1/orders/${encodeURIComponent(orderNo)}/reject`, {
      driverId: id,
      reasonCode,
    })
    await loadAssigned(true)
    showToast({ type: 'success', message: '已拒绝，订单已收回' })
  } catch (e) {
    assignedError.value = e?.message || String(e)
    if (isConflictError(e)) {
      showToast({ type: 'fail', message: e?.message || '操作冲突' })
    }
    maybeDropToLogin(e)
  } finally {
    rejectLoading.value = null
  }
}

async function driverCancelAcceptedTrip() {
  const st = tripRow()?.status
  if (st !== 2) return
  const reasonCode = await pickDriverReasonCode('取消原因（到达前）')
  if (!reasonCode) return
  try {
    await showConfirmDialog({
      title: '确认取消',
      message: '取消后订单将收回并重新派单。到达上车点后不可在此取消。',
    })
  } catch {
    return
  }
  await trip.cancelBeforeArrive(reasonCode)
  await loadAssigned(true)
}

async function connectDriverWs(options = {}) {
  if (!authed.value) return
  wsShouldReconnect = true
  wsConnGeneration += 1
  const connGen = wsConnGeneration
  stopWsReconnect()
  stopWsPing()
  if (wsConn) {
    try {
      wsConn.close(4000, 'reconnect')
    } catch {
      // ignore
    }
    wsConn = null
  }
  wsConnected.value = false
  assignedError.value = ''
  if (!options.preserveLog) wsLog.value = []
  try {
    const data = await postJson('/driver/api/v1/auth/ws-token', {})
    const wsTok = data?.accessToken
    if (!authed.value || !wsShouldReconnect || connGen !== wsConnGeneration) return
    if (!wsTok) {
      assignedError.value = '未拿到 WS token'
      await loadAssigned(true)
      scheduleDriverWsReconnect(connGen)
      return
    }
    const url = `${resolveDriverWsBaseUrl()}/driver/ws/v1/stream?token=${encodeURIComponent(wsTok)}`
    const sock = new WebSocket(url)
    wsConn = sock
    sock.onopen = () => {
      if (!authed.value || !wsShouldReconnect || connGen !== wsConnGeneration) {
        try {
          sock.close(4000, 'stale')
        } catch {
          // ignore
        }
        return
      }
      wsLog.value = [...wsLog.value, '[open]']
      wsConnected.value = true
      wsReconnectAttempt = 0
      startWsPing()
      // 后台页定时器可能被浏览器节流，服务端会因心跳超时将司机下线。
      // 若前端仍处于听单意图，重连成功后立即恢复 Presence 并重新写入 GEO。
      if (hasListeningIntent()) {
        startListeningHeartbeat()
        void reseedListeningGeoQuiet(true)
      }
    }
    sock.onmessage = (ev) => {
      if (connGen !== wsConnGeneration || wsConn !== sock) return
      const raw = ev?.data
      wsLog.value = [...wsLog.value, `[msg] ${raw}`]
      if (typeof raw === 'string' && raw.startsWith('{')) {
        try {
          const msg = JSON.parse(raw)
          if (msg?.type === 'ASSIGNED_LIST') {
            const list = msg?.data?.list || []
            void hydrateAssignedDetails(list).then((hydrated) => {
              if (connGen !== wsConnGeneration || wsConn !== sock) return
              setAssignedList(hydrated, { preservePendingConfirm: true })
            })
          }
        } catch {
          // ignore
        }
      }
    }
    sock.onerror = () => {
      if (connGen !== wsConnGeneration || wsConn !== sock) return
      wsLog.value = [...wsLog.value, '[error]']
      wsConnected.value = false
      void loadAssigned(true)
    }
    sock.onclose = (ev) => {
      if (connGen !== wsConnGeneration) return
      wsLog.value = [...wsLog.value, `[close] code=${ev.code}`]
      if (wsConn === sock) {
        wsConn = null
      }
      wsConnected.value = false
      stopWsPing()
      void loadAssigned(true)
      scheduleDriverWsReconnect(connGen)
    }
  } catch (e) {
    if (connGen !== wsConnGeneration) return
    assignedError.value = e?.message || String(e)
    wsConnected.value = false
    const dropped = maybeDropToLogin(e)
    if (!dropped) {
      await loadAssigned(true)
      scheduleDriverWsReconnect(connGen)
    }
  }
}

function disconnectWs() {
  wsShouldReconnect = false
  wsConnGeneration += 1
  stopWsReconnect()
  if (wsConn) {
    try {
      wsConn.close(4000, 'manual')
    } catch {
      // ignore
    }
    wsConn = null
  }
  wsConnected.value = false
  stopWsPing()
}

onBeforeUnmount(() => {
  window.removeEventListener('focus', reviveDriverWs)
  window.removeEventListener('online', reviveDriverWs)
  document.removeEventListener('visibilitychange', onDriverVisibilityChange)
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
  stopListeningHeartbeat()
  disconnectWs()
})

function onDriverVisibilityChange() {
  if (document.visibilityState === 'visible') {
    reviveDriverWs('visible')
    void sendListeningHeartbeat()
  }
}

onMounted(() => {
  window.addEventListener('focus', reviveDriverWs)
  window.addEventListener('online', reviveDriverWs)
  document.addEventListener('visibilitychange', onDriverVisibilityChange)
  countdownTimer = setInterval(() => {
    countdownNowMs.value = Date.now()
  }, 1000)
})

async function logoutAll() {
  try {
    await showConfirmDialog({
      title: '确认退出登录',
      message:
        '退出后，当前所有待接指派单将自动拒绝，乘客端会进入重新派单；效果与手动拒单相同（含一段时间内不再与同一乘客匹配）。已接单进行中的行程不会因此被取消。',
      confirmButtonText: '仍要退出',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  disconnectWs()
  setListeningIntent(false)
  stopListeningHeartbeat()
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
      <template v-if="!authed">
        <section class="driver-login-page">
          <div class="driver-login-visual" aria-hidden="true">
            <div class="driver-login-visual__road" />
            <div class="driver-login-visual__card driver-login-visual__card--top">听单</div>
            <div class="driver-login-visual__card driver-login-visual__card--bottom">接驾</div>
          </div>

          <div class="driver-login-brand">
            <div class="driver-login-brand__mark">司</div>
            <div>
              <div class="driver-login-brand__name">司机工作台</div>
              <div class="driver-login-brand__sub">登录后上线听单、处理指派与行程</div>
            </div>
          </div>

          <van-cell-group inset :title="showRegister ? '司机注册' : '司机登录'" class="driver-login-card">
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
                <div class="driver-login-submit-row">
                  <van-button
                    v-if="!showRegister"
                    block
                    type="primary"
                    native-type="button"
                    class="driver-login-submit-btn"
                    :loading="authLoading"
                    @click="loginSms"
                  >
                    登录并进入首页
                  </van-button>
                  <van-button
                    v-else
                    block
                    type="primary"
                    native-type="button"
                    class="driver-login-submit-btn"
                    :loading="authLoading"
                    @click="registerSms"
                  >
                    注册并进入首页
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
                <div class="driver-login-submit-row">
                  <van-button
                    v-if="!showRegister"
                    block
                    type="primary"
                    native-type="button"
                    class="driver-login-submit-btn"
                    :loading="authLoading"
                    @click="loginPassword"
                  >
                    登录并进入首页
                  </van-button>
                  <van-button
                    v-else
                    block
                    type="primary"
                    native-type="button"
                    class="driver-login-submit-btn"
                    :loading="authLoading"
                    @click="registerPassword"
                  >
                    注册并进入首页
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

          <div class="driver-login-footer">
            <span>网关</span>
            <span class="mono-tight">{{ API_BASE_URL }}</span>
          </div>
        </section>
      </template>

      <template v-else>
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

      <div class="driver-quick-actions">
        <van-button
          type="primary"
          round
          :loading="onlineLoading"
          :disabled="monitorStatusLoading || onlineLoading || monitorStatus === 2"
          @click="setOnline(true)"
        >
          {{ onlineLoading ? '处理中...' : monitorStatus === 1 ? '刷新位置' : '上线听单' }}
        </van-button>
        <van-button
          type="warning"
          round
          plain
          :loading="onlineLoading"
          :disabled="monitorStatusLoading || isMonitorOffline"
          @click="setOnline(false)"
        >
          下线
        </van-button>
        <button
          type="button"
          class="refresh-assigned-btn"
          :disabled="assignedLoading"
          @click="onRefreshAssigned"
          @touchend.prevent="onRefreshAssigned"
        >
          {{ assignedLoading ? '刷新中' : '刷新指派单' }}
        </button>
        <van-button round plain hairline type="danger" @click="logoutAll">退出登录</van-button>
      </div>

      <main class="page-main">
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
          <section class="driver-dashboard">
            <div class="driver-state-card">
              <div class="driver-state-card__top">
                <div>
                  <div class="driver-state-card__eyebrow">当前工作状态</div>
                  <h1 class="driver-state-card__title">{{ workStateTitle }}</h1>
                </div>
                <van-tag :type="workStateTagType" size="medium" plain>{{ monitorStatusText }}</van-tag>
              </div>
              <p class="driver-state-card__hint">{{ workStateHint }}</p>
              <div class="driver-state-grid">
                <div class="driver-state-grid__item">
                  <span>接单资格</span>
                  <strong>{{ acceptabilityText }}</strong>
                </div>
                <div class="driver-state-grid__item">
                  <span>待确认</span>
                  <strong>{{ assignedCount }}</strong>
                </div>
                <div class="driver-state-grid__item">
                  <span>实时连接</span>
                  <strong>{{ realtimeConnectionText }}</strong>
                </div>
              </div>
              <div class="driver-state-actions">
                <van-button
                  type="primary"
                  block
                  :loading="onlineLoading"
                  :disabled="monitorStatusLoading || onlineLoading || monitorStatus === 2"
                  @click="setOnline(true)"
                >
                  {{ onlineLoading ? '处理中...' : monitorStatus === 1 ? '刷新位置' : '上线听单' }}
                </van-button>
                <van-button
                  plain
                  block
                  type="warning"
                  :loading="onlineLoading"
                  :disabled="monitorStatusLoading || isMonitorOffline"
                  @click="setOnline(false)"
                >
                  下线
                </van-button>
              </div>
            </div>

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

            <section class="driver-section section-gap">
              <div class="driver-section__head">
                <div>
                  <div class="driver-section__label">接单操作</div>
                  <h2>乘客指派单</h2>
                </div>
                <button
                  type="button"
                  class="driver-refresh-btn"
                  :disabled="assignedLoading"
                  @click="onRefreshAssigned"
                  @touchend.prevent="onRefreshAssigned"
                >
                  {{ assignedLoading ? '刷新中' : '刷新' }}
                </button>
              </div>
              <van-notice-bar
                v-if="assigned.length > 1"
                left-icon="volume-o"
                color="#ed6a0c"
                background="#fff7e8"
                text="当前有多笔待确认；确认其中一单后，其余待确认订单将由系统自动取消。"
                wrapable
                :scrollable="false"
                class="assign-multi-hint"
              />
              <div v-if="assigned && assigned.length > 0" class="order-stack">
                <article v-for="item in assigned" :key="item.orderNo" class="driver-order-card">
                  <div class="driver-order-card__head">
                    <div>
                      <div class="driver-order-card__no">{{ shortOrderNo(item.orderNo) }}</div>
                      <div class="driver-order-card__sub mono-tight">{{ item.orderNo }}</div>
                    </div>
                    <van-tag plain :type="item.status === 'PENDING_DRIVER_CONFIRM' ? 'warning' : 'primary'">
                      {{ formatAssignedItemStatus(item.status) }}
                    </van-tag>
                  </div>
                  <div class="driver-order-route">
                    <div class="driver-order-route__row">
                      <span class="driver-order-route__dot driver-order-route__dot--start" />
                      <div>
                        <span>上车点</span>
                        <strong>{{ assignedPickupText(item) || '等待后端返回' }}</strong>
                      </div>
                    </div>
                    <div class="driver-order-route__row">
                      <span class="driver-order-route__dot driver-order-route__dot--end" />
                      <div>
                        <span>目的地</span>
                        <strong>{{ assignedDestText(item) || '乘客暂未填写' }}</strong>
                      </div>
                    </div>
                  </div>
                  <div class="driver-order-meta">
                    <span v-if="assignedDistanceText(item)">距你 {{ assignedDistanceText(item) }}</span>
                    <span v-if="assignedFareText(item)">预估 {{ assignedFareText(item) }}</span>
                    <span v-if="item.offerExpiresAt">截止 {{ fmtTime(item.offerExpiresAt) }}</span>
                  </div>
                  <div
                    v-if="item.status === 'PENDING_DRIVER_CONFIRM'"
                    class="driver-offer-countdown"
                    :class="{ 'driver-offer-countdown--expired': isOfferExpired(item) }"
                    :style="offerCountdownStyle(item)"
                  >
                    <div class="driver-offer-countdown__top">
                      <span>自动拒单倒计时</span>
                      <strong>{{ offerCountdownText(item) }}</strong>
                    </div>
                    <div class="driver-offer-countdown__bar" aria-hidden="true" />
                  </div>
                  <div class="driver-order-actions">
                    <van-button
                      plain
                      type="danger"
                      block
                      :loading="rejectLoading === item.orderNo"
                      :disabled="acceptLoading === item.orderNo || isOfferExpired(item)"
                      @click="rejectOrder(item.orderNo)"
                    >
                      {{ rejectLoading === item.orderNo ? '提交中...' : isOfferExpired(item) ? '等待释放' : '拒单' }}
                    </van-button>
                    <van-button
                      type="primary"
                      block
                      :loading="acceptLoading === item.orderNo"
                      :disabled="rejectLoading === item.orderNo || isOfferExpired(item)"
                      @click="acceptOrder(item.orderNo)"
                    >
                      {{ acceptLoading === item.orderNo ? '提交中...' : isOfferExpired(item) ? '已超时' : '确认接单' }}
                    </van-button>
                  </div>
                </article>
              </div>
              <van-empty
                v-else
                image="search"
                :description="trip.activeTripOrderNo ? '当前已有进行中行程，暂不接收新指派' : '暂无指派单，保持上线等待乘客下单'"
              />
            </section>

          <section v-if="trip.activeTripOrderNo" class="driver-section section-gap trip-panel">
            <div class="driver-section__head">
              <div>
                <div class="driver-section__label">行程操作</div>
                <h2>当前行程</h2>
              </div>
              <van-button size="small" plain hairline type="primary" @click="trip.dismissTripPanel">
                关闭
              </van-button>
            </div>
            <van-cell-group inset>
            <van-cell>
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

              <div v-if="trip.activeTrip.status === 2" class="trip-cancel-before-arrive">
                <van-button
                  block
                  round
                  plain
                  hairline
                  type="danger"
                  :loading="trip.tripActionLoading"
                  @click="driverCancelAcceptedTrip"
                >
                  取消订单（到达前）
                </van-button>
              </div>

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
          </section>

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
            <van-cell title="退出登录" label="拒绝待确认指派并作废当前会话" clickable @click="logoutAll">
              <template #icon>
                <van-icon name="revoke" class="my-cell-icon my-cell-icon--danger" />
              </template>
              <template #right-icon>
                <van-tag type="danger" plain>退出</van-tag>
              </template>
            </van-cell>
          </van-cell-group>
          </section>
          </template>

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
      </main>
      <van-action-sheet
        v-model:show="reasonSheetShow"
        :title="reasonSheetTitle"
        :actions="reasonSheetActions"
        cancel-text="关闭"
        close-on-click-action
        @select="onReasonSheetSelect"
        @cancel="onReasonSheetCancel"
        @click-overlay="onReasonSheetCancel"
      />
      </template>
    </div>
  </van-config-provider>
</template>
