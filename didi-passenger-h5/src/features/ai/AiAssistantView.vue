<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { showConfirmDialog, showToast } from 'vant'

import { createIdempotencyKey } from '../../utils/idempotency'
import { getToken } from '../../api/http'
import { createAiConversation, listAiMessages, streamAiMessage, streamAiPlaceChoice,
  streamAiRouteCheckChoice } from './aiConversationApi'

const emit = defineEmits(['back', 'unauthorized'])

const draft = ref('')
const conversationNo = ref(storedConversationNo())
const messages = ref([])
const conversationElement = ref(null)
const isSending = ref(false)
const historyLoading = ref(false)
const historyError = ref('')
const hasMoreHistory = ref(false)
const historyCursor = ref(null)
const notice = ref('')
const currentTime = ref(Date.now())
let createKey = null
let pendingAttempt = null
let activeController = null
let nextLocalId = 0
let choiceClock = null

const suggestions = [
  '帮我规划从德清高速路口到西溪湿地的路线',
  '从杭州东站到西溪湿地怎么走？',
]
const canSend = computed(() => !!draft.value.trim() && !isSending.value && !historyLoading.value && !pendingAttempt)
const visibleMessages = computed(() => [...messages.value].sort((left, right) => {
  if (left.sequenceNo != null && right.sequenceNo != null) return left.sequenceNo - right.sequenceNo
  if (left.sequenceNo != null) return -1
  if (right.sequenceNo != null) return 1
  return left.localId - right.localId
}))
const latestAssistant = computed(() => [...visibleMessages.value].reverse().find((item) => item.role === 'ASSISTANT'))
const showConfirmShortcut = computed(() =>
  !isSending.value && !pendingAttempt && latestAssistant.value?.content?.trim().endsWith('对吗？'),
)
const activePlaceChoices = computed(() => {
  const choices = latestAssistant.value?.payload?.placeChoices
  if (latestAssistant.value?.messageType !== 'PLACE_CHOICES' || !choices?.taskNo
    || !Array.isArray(choices.choices) || !choices.choices.length) return null
  return choices
})
const activeRouteCheckChoices = computed(() => {
  const choices = latestAssistant.value?.payload?.routeCheckChoices
  if (latestAssistant.value?.messageType !== 'ROUTE_CHECK_CHOICES' || !choices?.taskNo
    || !Array.isArray(choices.choices) || choices.choices.length < 2) return null
  return choices
})

function choiceExpired(choices) {
  return !choices?.expiresAt || Date.parse(choices.expiresAt) <= currentTime.value
}

function choiceExpiredHint(choices) {
  return choices?.flow === 'CURRENT_ROUTE_CHECK'
    ? '核查地点选项已过期，请重新发起当前路线核查。'
    : '选项已过期，请重新描述起点和终点。'
}

function routeCheckChoiceExpiredHint() {
  return '这组核查方式选项已过期，请重新询问当前路线。'
}

function userContent(message) {
  if (!message.content?.startsWith('已选择地点（PC-')) return message.content
  const id = message.content.slice('已选择地点（'.length, -1)
  const selected = messages.value.flatMap((entry) => entry.payload?.placeChoices?.choices || [])
    .find((choice) => choice.placeChoiceId === id)
  return selected ? `已选择地点：${selected.name}${selected.city ? `（${selected.city}）` : ''}` : '已选择地点'
}

/** 只记住当前登录令牌对应的会话号；消息正文始终从后端读取。 */
function conversationStorageKey() {
  const token = getToken()
  if (!token) return null
  let fingerprint = 2166136261
  for (let index = 0; index < token.length; index += 1) {
    fingerprint = Math.imul(fingerprint ^ token.charCodeAt(index), 16777619)
  }
  return `didi_passenger_ai_conversation:${fingerprint >>> 0}`
}

function storedConversationNo() {
  try {
    const key = conversationStorageKey()
    return key ? sessionStorage.getItem(key) || '' : ''
  } catch {
    return ''
  }
}

function rememberConversation(number) {
  try {
    const key = conversationStorageKey()
    if (key) sessionStorage.setItem(key, number)
  } catch {
    // 浏览器禁止会话存储时，当前页面仍可正常使用。
  }
}

function forgetConversation() {
  try {
    const key = conversationStorageKey()
    if (key) sessionStorage.removeItem(key)
  } catch {
    // 会话存储不可用时无需额外处理。
  }
}

function scrollToLatest() {
  nextTick(() => conversationElement.value?.scrollTo({
    top: conversationElement.value.scrollHeight,
    behavior: 'smooth',
  }))
}

function formatDuration(seconds) {
  const minutes = Math.ceil(Number(seconds) / 60)
  if (!Number.isFinite(minutes) || minutes < 0) return '—'
  if (minutes < 60) return `约 ${minutes} 分钟`
  return `约 ${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`
}

function formatDistance(meters) {
  const distance = Number(meters)
  if (!Number.isFinite(distance) || distance < 0) return '—'
  return `${(distance / 1000).toFixed(1)} 公里`
}

function routeCardOf(message) {
  const payload = message.payload || {}
  return payload.routeCard || (payload.routeRef ? payload : null)
}

function parseHistoryPayload(payloadJson) {
  if (!payloadJson) return null
  try {
    const payload = JSON.parse(payloadJson)
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null
  } catch {
    return null
  }
}

function mergeHistory(views) {
  for (const view of views) {
    if (!view?.messageNo || !view.role) continue
    const payload = parseHistoryPayload(view.payloadJson)
    const current = messages.value.find((message) => message.messageNo === view.messageNo)
      || (view.role === 'USER' && view.clientMessageNo
        ? messages.value.find((message) => message.role === 'USER'
          && message.clientMessageNo === view.clientMessageNo)
        : null)
      || (view.role === 'USER' && view.requestNo
        ? messages.value.find((message) => message.role === 'USER' && message.requestNo === view.requestNo)
        : null)
    if (current) {
      current.messageNo = view.messageNo
      current.requestNo = view.requestNo
      if (view.role === 'USER' && view.clientMessageNo) current.clientMessageNo = view.clientMessageNo
      current.sequenceNo = view.sequenceNo
      current.createdAt = view.createdAt
      if (view.role === 'ASSISTANT' && !current.routeCard) {
        current.payload = payload
        current.routeCard = routeCardOf({ payload })
        current.routePreview = routePreview(current.routeCard)
      }
    } else {
      const card = routeCardOf({ payload })
      messages.value.push({
        localId: ++nextLocalId,
        messageNo: view.messageNo,
        requestNo: view.requestNo,
        clientMessageNo: view.role === 'USER' ? view.clientMessageNo : null,
        sequenceNo: view.sequenceNo,
        role: view.role,
        messageType: view.messageType,
        content: view.content,
        status: view.role === 'USER' ? 'done' : view.status,
        payload,
        routeCard: card,
        routePreview: routePreview(card),
        createdAt: view.createdAt,
      })
    }
  }

  // 断流早于 turn.started 时先用客户端幂等键找回 requestNo，再核对该轮最终回复。
  if (pendingAttempt) {
    const attempt = messages.value.find((message) => message.localId === pendingAttempt.localId)
    const reply = attempt?.requestNo && messages.value.find((message) =>
      message.role === 'ASSISTANT' && message.requestNo === attempt.requestNo)
    if (reply) {
      updateUser(attempt.localId, {
        status: reply.status === 'FAILED' ? 'failed' : 'done',
        error: reply.status === 'FAILED' ? reply.content : '',
      })
      pendingAttempt = null
      notice.value = ''
    }
  }
}

async function refreshHistory() {
  if (!conversationNo.value || historyLoading.value || isSending.value) return
  historyLoading.value = true
  historyError.value = ''
  try {
    const page = await listAiMessages(conversationNo.value)
    mergeHistory(page.messages)
    hasMoreHistory.value = page.hasMore
    historyCursor.value = page.messages[0]?.sequenceNo ?? null
    scrollToLatest()
  } catch (error) {
    if (error?.httpStatus === 401 || Number(error?.code) === 401) {
      emit('unauthorized', error)
    } else if (error?.httpStatus === 404) {
      forgetConversation()
      conversationNo.value = ''
      messages.value = []
      pendingAttempt = null
      hasMoreHistory.value = false
      historyCursor.value = null
      historyError.value = '这段会话已无法查看，请开始新对话。'
    } else {
      historyError.value = error?.message || '历史记录加载失败'
    }
  } finally {
    historyLoading.value = false
  }
}

async function loadOlderHistory() {
  if (!conversationNo.value || historyLoading.value || !hasMoreHistory.value || historyCursor.value == null) return
  const element = conversationElement.value
  const previousHeight = element?.scrollHeight || 0
  const previousTop = element?.scrollTop || 0
  historyLoading.value = true
  historyError.value = ''
  try {
    const page = await listAiMessages(conversationNo.value, { beforeSequence: historyCursor.value })
    mergeHistory(page.messages)
    hasMoreHistory.value = page.hasMore && page.messages.length > 0
    historyCursor.value = page.messages[0]?.sequenceNo ?? historyCursor.value
    await nextTick()
    if (element) element.scrollTop = previousTop + element.scrollHeight - previousHeight
  } catch (error) {
    if (error?.httpStatus === 401 || Number(error?.code) === 401) emit('unauthorized', error)
    else historyError.value = error?.message || '更早的记录加载失败'
  } finally {
    historyLoading.value = false
  }
}

/** 只根据本次后端折线绘制几何预览，不添加道路或途经点事实。 */
function routePreview(card) {
  const points = card?.route?.polyline?.filter((point) =>
    point?.longitude != null && point?.latitude != null
    && Number.isFinite(Number(point.longitude)) && Number.isFinite(Number(point.latitude))) || []
  if (points.length < 2) return null

  const meanLatitude = points.reduce((sum, point) => sum + Number(point.latitude), 0) / points.length
  const longitudeScale = Math.max(0.1, Math.cos(meanLatitude * Math.PI / 180))
  const projected = points.map((point) => ({
    x: Number(point.longitude) * longitudeScale,
    y: Number(point.latitude),
  }))
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const point of projected) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  }
  const spanX = Math.max(maxX - minX, 0.00001)
  const spanY = Math.max(maxY - minY, 0.00001)
  const scale = Math.min(292 / spanX, 132 / spanY)
  const left = (340 - spanX * scale) / 2
  const top = (180 - spanY * scale) / 2
  const coordinates = projected.map((point) => ({
    x: left + (point.x - minX) * scale,
    y: 180 - top - (point.y - minY) * scale,
  }))
  return {
    points: coordinates.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' '),
    origin: coordinates[0],
    destination: coordinates.at(-1),
  }
}

function updateUser(localId, fields) {
  const item = messages.value.find((message) => message.localId === localId)
  if (item) Object.assign(item, fields)
}

function addAssistant(event) {
  const reply = event?.assistantMessage
  if (!reply?.content) return
  if (reply.messageNo && messages.value.some((item) => item.messageNo === reply.messageNo)) return
  const card = routeCardOf(reply)
  messages.value.push({
    localId: ++nextLocalId,
    messageNo: reply.messageNo,
    role: 'ASSISTANT',
    content: reply.content,
    payload: reply.payload || null,
    routeCard: card,
    routePreview: routePreview(card),
    messageType: reply.messageType,
    createdAt: reply.createdAt,
  })
  scrollToLatest()
}

async function ensureConversation() {
  if (conversationNo.value) return conversationNo.value
  createKey ||= createIdempotencyKey()
  const number = await createAiConversation(createKey)
  conversationNo.value = number
  rememberConversation(number)
  createKey = null
  return number
}

async function performAttempt() {
  const attempt = pendingAttempt
  if (!attempt || isSending.value) return
  isSending.value = true
  notice.value = ''
  updateUser(attempt.localId, { status: 'sending', error: '' })
  activeController = new AbortController()
  try {
    const number = await ensureConversation()
    const request = attempt.kind === 'place-choice' ? streamAiPlaceChoice
      : attempt.kind === 'route-check-choice' ? streamAiRouteCheckChoice : streamAiMessage
    const result = await request({
      conversationNo: number,
      ...(attempt.kind === 'place-choice'
        ? { taskNo: attempt.taskNo, placeChoiceId: attempt.placeChoiceId,
          expectedRequestVersion: attempt.expectedRequestVersion,
          choiceName: attempt.choiceName, choiceCity: attempt.choiceCity }
        : attempt.kind === 'route-check-choice'
          ? { taskNo: attempt.taskNo, checkMode: attempt.checkMode,
            expectedRequestVersion: attempt.expectedRequestVersion,
            choiceLabel: attempt.choiceLabel }
        : { content: attempt.content }),
      idempotencyKey: attempt.key,
      signal: activeController.signal,
      onEvent(name, data) {
        if (name === 'turn.started') updateUser(attempt.localId, { requestNo: data.requestNo })
        if (name === 'answer.completed' || name === 'route.card' || name === 'place.choices'
          || name === 'route-check.choices') {
          addAssistant(data)
          updateUser(attempt.localId, { status: 'done' })
        }
        if (name === 'turn.failed') updateUser(attempt.localId, {
          status: 'failed', error: data.message || '客服暂时无法回答', requestNo: data.requestNo,
        })
      },
    })
    if (result.failure) {
      notice.value = result.failure.message || '客服暂时无法回答'
      pendingAttempt = null
    } else if (result.contentReceived) {
      pendingAttempt = null
    } else {
      updateUser(attempt.localId, {
        status: 'uncertain', error: '连接已结束，但还未收到完整回复。可用同一请求号重试。',
      })
      notice.value = '本轮结果未确认，请重试本条消息。'
    }
  } catch (error) {
    const item = messages.value.find((message) => message.localId === attempt.localId)
    if (item?.status === 'done') {
      pendingAttempt = null
    } else if (item?.status === 'failed') {
      pendingAttempt = null
      notice.value = item.error
    } else if (error?.httpStatus === 401 || Number(error?.code) === 401) {
      updateUser(attempt.localId, { status: 'failed', error: '登录已失效，请重新登录。' })
      pendingAttempt = null
      emit('unauthorized', error)
    } else if (error?.httpStatus === 400 || error?.httpStatus === 404) {
      updateUser(attempt.localId, { status: 'failed', error: error.message })
      pendingAttempt = null
      notice.value = error.message
    } else {
      updateUser(attempt.localId, {
        status: 'uncertain', error: error?.message || '连接中断，可重试本条消息。',
      })
      notice.value = '连接中断，重试会复用本条消息的幂等键。'
    }
  } finally {
    isSending.value = false
    activeController = null
    scrollToLatest()
    if (pendingAttempt?.localId === attempt.localId
      && messages.value.find((message) => message.localId === attempt.localId)?.status === 'uncertain') {
      refreshHistory()
    }
  }
}

function submit() {
  const content = draft.value.trim()
  if (!content || isSending.value || historyLoading.value || pendingAttempt) return
  if (content.length > 1000) {
    showToast('最多输入 1000 字')
    return
  }
  const localId = ++nextLocalId
  const key = createIdempotencyKey()
  messages.value.push({ localId, role: 'USER', content, clientMessageNo: key, status: 'sending', error: '' })
  pendingAttempt = { kind: 'text', localId, content, key }
  draft.value = ''
  scrollToLatest()
  performAttempt()
}

function selectPlace(choice) {
  const options = activePlaceChoices.value
  if (!options || choiceExpired(options) || isSending.value || historyLoading.value || pendingAttempt
    || !options.choices.some((item) => item.placeChoiceId === choice.placeChoiceId)) return
  const localId = ++nextLocalId
  const key = createIdempotencyKey()
  const content = `已选择地点：${choice.name}${choice.city ? `（${choice.city}）` : ''}`
  messages.value.push({ localId, role: 'USER', content, clientMessageNo: key,
    status: 'sending', error: '' })
  pendingAttempt = { kind: 'place-choice', localId, content, key,
    taskNo: options.taskNo, placeChoiceId: choice.placeChoiceId,
    expectedRequestVersion: options.requestVersion,
    choiceName: choice.name, choiceCity: choice.city || null }
  scrollToLatest()
  performAttempt()
}

function selectRouteCheckMode(choice) {
  const options = activeRouteCheckChoices.value
  if (!options || choiceExpired(options) || isSending.value || historyLoading.value || pendingAttempt
    || !options.choices.some((item) => item.choiceId === choice.choiceId)) return
  const localId = ++nextLocalId
  const key = createIdempotencyKey()
  const content = `我想确认：${choice.label}`
  messages.value.push({ localId, role: 'USER', content, clientMessageNo: key,
    status: 'sending', error: '' })
  pendingAttempt = { kind: 'route-check-choice', localId, content, key,
    taskNo: options.taskNo, checkMode: choice.choiceId,
    expectedRequestVersion: options.requestVersion, choiceLabel: choice.label }
  scrollToLatest()
  performAttempt()
}

function retry(localId) {
  if (pendingAttempt?.localId === localId) performAttempt()
}

function confirmEndpoints() {
  draft.value = '对'
  submit()
}

async function newConversation() {
  if (isSending.value || historyLoading.value) return
  if (messages.value.length) {
    try {
      await showConfirmDialog({
        title: '开始新对话？',
        message: '将切换到新对话，当前页面不再显示这段记录。',
        confirmButtonText: '新对话',
      })
    } catch {
      return
    }
  }
  conversationNo.value = ''
  forgetConversation()
  messages.value = []
  draft.value = ''
  notice.value = ''
  historyError.value = ''
  hasMoreHistory.value = false
  historyCursor.value = null
  createKey = null
  pendingAttempt = null
}

function back() {
  if (isSending.value) {
    showToast('客服正在处理，请等待本轮结束')
    return
  }
  emit('back')
}

onMounted(() => {
  choiceClock = window.setInterval(() => { currentTime.value = Date.now() }, 15000)
  if (conversationNo.value) refreshHistory()
})
onBeforeUnmount(() => {
  activeController?.abort()
  if (choiceClock) window.clearInterval(choiceClock)
})
</script>

<template>
  <section class="route-ai-page" aria-label="出行 AI 助手">
    <header class="route-ai-head">
      <button type="button" class="route-ai-back" aria-label="返回首页" @click="back">‹</button>
      <div class="route-ai-headline">
        <strong>出行 AI 助手</strong>
        <span>{{ conversationNo ? `会话 ${conversationNo}` : '说出起点和终点，开始规划' }}</span>
      </div>
      <div class="route-ai-head-actions">
        <button v-if="conversationNo" type="button" class="route-ai-history"
          :disabled="isSending || historyLoading" @click="refreshHistory">查看历史</button>
        <button type="button" class="route-ai-new" :disabled="isSending || historyLoading" @click="newConversation">新对话</button>
      </div>
    </header>

    <div ref="conversationElement" class="route-ai-conversation" role="log" aria-live="polite">
      <div class="route-ai-intro">
        <span class="route-ai-avatar" aria-hidden="true">✦</span>
        <div class="route-ai-bubble route-ai-bubble--intro">
          <strong>想怎么走，告诉我就行</strong>
          <p>先说清起点和终点。我会向你确认地点，再展示真实路线与预计时间。</p>
        </div>
      </div>

      <div v-if="hasMoreHistory" class="route-ai-history-more">
        <button type="button" :disabled="historyLoading || isSending" @click="loadOlderHistory">
          {{ historyLoading ? '加载中…' : '加载更早记录' }}
        </button>
      </div>
      <p v-if="historyError" class="route-ai-history-error" role="alert">{{ historyError }}</p>

      <div v-if="!messages.length" class="route-ai-suggestions">
        <button v-for="example in suggestions" :key="example" type="button" @click="draft = example">
          {{ example }}
        </button>
      </div>

      <template v-for="message in visibleMessages" :key="message.localId">
        <div v-if="message.role === 'USER'" class="route-ai-user-row">
          <div class="route-ai-bubble route-ai-bubble--user">{{ userContent(message) }}</div>
          <span class="route-ai-message-state">
            {{ message.status === 'sending' ? '正在处理…' : message.status === 'uncertain' ? '结果未确认' : '' }}
          </span>
          <p v-if="message.error" class="route-ai-message-error">{{ message.error }}</p>
          <button v-if="message.status === 'uncertain'" type="button" class="route-ai-retry" @click="retry(message.localId)">
            重试本条消息
          </button>
        </div>

        <div v-else class="route-ai-assistant-row">
          <span class="route-ai-avatar route-ai-avatar--small" aria-hidden="true">✦</span>
          <article class="route-ai-bubble route-ai-bubble--assistant">
            <p class="route-ai-answer">{{ message.content }}</p>
            <div v-if="message.payload?.placeChoices" class="route-ai-place-choices">
              <button v-for="choice in message.payload.placeChoices.choices" :key="choice.placeChoiceId"
                type="button" :disabled="message !== latestAssistant || choiceExpired(message.payload.placeChoices)
                  || isSending || historyLoading || !!pendingAttempt"
                @click="selectPlace(choice)">
                <strong>{{ choice.name }}</strong>
                <span>{{ [choice.city, choice.address, choice.type].filter(Boolean).join(' · ') }}</span>
              </button>
              <p v-if="message === latestAssistant && choiceExpired(message.payload.placeChoices)">
                {{ choiceExpiredHint(message.payload.placeChoices) }}
              </p>
            </div>
            <div v-if="message.payload?.routeCheckChoices" class="route-ai-place-choices">
              <button v-for="choice in message.payload.routeCheckChoices.choices" :key="choice.choiceId"
                type="button" :disabled="message !== latestAssistant
                  || choiceExpired(message.payload.routeCheckChoices)
                  || isSending || historyLoading || !!pendingAttempt"
                @click="selectRouteCheckMode(choice)">
                <strong>{{ choice.label }}</strong>
              </button>
              <p v-if="message === latestAssistant && choiceExpired(message.payload.routeCheckChoices)">
                {{ routeCheckChoiceExpiredHint() }}
              </p>
            </div>
            <template v-if="message.routeCard">
              <div class="route-ai-route-card">
                <div class="route-ai-route-title">
                  <span>地图推荐路线</span>
                  <strong>{{ message.routeCard.origin?.name }} → {{ message.routeCard.destination?.name }}</strong>
                </div>
                <svg v-if="message.routePreview" viewBox="0 0 340 180" role="img" aria-label="本次路线折线预览">
                  <path d="M0 45H340M0 90H340M0 135H340M85 0V180M170 0V180M255 0V180" class="route-ai-grid" />
                  <polyline :points="message.routePreview.points" class="route-ai-line-shadow" />
                  <polyline :points="message.routePreview.points" class="route-ai-line" />
                  <circle :cx="message.routePreview.origin.x" :cy="message.routePreview.origin.y" r="7" class="route-ai-start" />
                  <circle :cx="message.routePreview.destination.x" :cy="message.routePreview.destination.y" r="7" class="route-ai-end" />
                </svg>
                <div class="route-ai-route-metrics">
                  <span><strong>{{ formatDistance(message.routeCard.route?.distanceMeters) }}</strong>全程</span>
                  <span><strong>{{ formatDuration(message.routeCard.route?.durationSeconds) }}</strong>预计行驶</span>
                </div>
                <p v-if="message.routeCard.via?.name" class="route-ai-via">途经 {{ message.routeCard.via.name }}</p>
                <p v-if="!message.routePreview" class="route-ai-summary-hint">历史记录仅保存路线摘要；继续问路线时，客服会核对是否仍有效。</p>
              </div>
            </template>
            <small>内容由 AI 生成，路线信息以本次地图结果为准</small>
          </article>
        </div>
      </template>

      <div v-if="isSending" class="route-ai-working" role="status">正在查询地点与路线…</div>
      <div v-if="showConfirmShortcut" class="route-ai-confirm-shortcut">
        <button type="button" @click="confirmEndpoints">对，起终点正确</button>
      </div>
    </div>

    <p v-if="notice" class="route-ai-notice" role="alert">{{ notice }}</p>
    <form class="route-ai-composer" @submit.prevent="submit">
      <input v-model="draft" type="text" maxlength="1000" :disabled="isSending || historyLoading || !!pendingAttempt"
        placeholder="描述路线需求，例如：从德清到西溪湿地" aria-label="输入路线需求" />
      <button type="submit" :disabled="!canSend">{{ isSending ? '处理中' : '发送' }}</button>
    </form>
  </section>
</template>

<style scoped>
.route-ai-page { position: relative; height: 100%; min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: linear-gradient(180deg, #e9f5ff, #f8fbff 210px, #f4f7fb); }
.route-ai-head { z-index: 2; display: grid; grid-template-columns: 44px 1fr auto; align-items: center; gap: 8px; padding: calc(11px + env(safe-area-inset-top)) 14px 11px; background: rgba(255,255,255,.92); box-shadow: 0 1px 0 rgba(15,35,72,.07); }
.route-ai-back { width: 40px; height: 40px; border: 0; border-radius: 13px; background: #edf3fa; color: #18365d; font-size: 30px; line-height: 1; }
.route-ai-headline { min-width: 0; display: grid; gap: 2px; text-align: center; }
.route-ai-headline strong { color: #16243b; font-size: 16px; }
.route-ai-headline span { overflow: hidden; color: #77869a; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.route-ai-head-actions { display: flex; align-items: center; gap: 6px; }
.route-ai-history { border: 0; border-radius: 14px; padding: 10px 9px; background: #e8f8f7; color: #168a80; font-size: 12px; font-weight: 700; white-space: nowrap; }
.route-ai-history:disabled { opacity: .5; }
.route-ai-new { border: 0; border-radius: 14px; padding: 10px 11px; background: #edf5ff; color: #176de7; font-size: 12px; font-weight: 700; }
.route-ai-new:disabled { opacity: .5; }
.route-ai-conversation { flex: 1; min-height: 0; overflow-y: auto; padding: 20px 15px 126px; box-sizing: border-box; }
.route-ai-intro, .route-ai-assistant-row { display: flex; align-items: flex-start; gap: 9px; margin-bottom: 18px; }
.route-ai-history-more { margin: 0 0 16px; text-align: center; }
.route-ai-history-more button { padding: 8px 13px; border: 1px solid #d6e6f8; border-radius: 999px; background: white; color: #32608f; font-size: 11px; }
.route-ai-history-more button:disabled { opacity: .5; }
.route-ai-history-error { margin: 0 0 16px; color: #ba4a37; text-align: center; font-size: 11px; }
.route-ai-avatar { flex: 0 0 auto; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 12px; background: linear-gradient(140deg, #30c9e5, #1970ed); color: white; box-shadow: 0 6px 16px rgba(23,106,230,.2); }
.route-ai-avatar--small { width: 30px; height: 30px; font-size: 13px; }
.route-ai-bubble { max-width: min(82%, 440px); padding: 12px 14px; border-radius: 5px 17px 17px; box-sizing: border-box; font-size: 14px; line-height: 1.6; word-break: break-word; }
.route-ai-bubble--intro, .route-ai-bubble--assistant { background: white; color: #25344a; box-shadow: 0 8px 24px rgba(37,81,130,.08); }
.route-ai-bubble--intro strong { font-size: 15px; color: #16243b; }
.route-ai-bubble--intro p { margin: 5px 0 0; color: #718096; font-size: 12px; }
.route-ai-suggestions { display: grid; gap: 9px; margin: 0 0 22px 43px; }
.route-ai-suggestions button { padding: 11px 13px; border: 1px solid #dbe9fa; border-radius: 13px; background: white; color: #32608f; text-align: left; font-size: 12px; }
.route-ai-user-row { display: flex; flex-direction: column; align-items: flex-end; margin: 0 0 17px 44px; }
.route-ai-bubble--user { max-width: 100%; border-radius: 17px 5px 17px 17px; background: linear-gradient(145deg, #2880f2, #1769e8); color: white; box-shadow: 0 8px 18px rgba(25,109,231,.18); white-space: pre-wrap; }
.route-ai-message-state { margin-top: 4px; color: #8190a2; font-size: 10px; }
.route-ai-message-state:empty { display: none; }
.route-ai-message-error { max-width: 82%; margin: 5px 0 0; color: #ba4a37; text-align: right; font-size: 11px; }
.route-ai-retry { margin-top: 7px; padding: 7px 12px; border: 1px solid #b7d4ff; border-radius: 999px; background: #fff; color: #176de7; font-size: 11px; font-weight: 700; }
.route-ai-answer { margin: 0; white-space: pre-wrap; }
.route-ai-place-choices { display: grid; gap: 8px; margin-top: 12px; }
.route-ai-place-choices button { display: grid; gap: 2px; width: 100%; padding: 10px 12px; border: 1px solid #cfe1f8; border-radius: 12px; background: #f7fbff; color: #1d385c; text-align: left; }
.route-ai-place-choices button span { color: #71859d; font-size: 11px; }
.route-ai-place-choices button:disabled { opacity: .5; }
.route-ai-place-choices p { margin: 0; color: #a64334; font-size: 11px; }
.route-ai-bubble--assistant { flex: 1; max-width: min(calc(100% - 40px), 490px); }
.route-ai-bubble--assistant small { display: block; margin-top: 10px; color: #9aa5b4; font-size: 10px; }
.route-ai-route-card { overflow: hidden; margin-top: 12px; border: 1px solid #e5edf5; border-radius: 15px; background: #f8fbff; }
.route-ai-route-title { display: grid; gap: 3px; padding: 11px 12px; }
.route-ai-route-title span { color: #2580dc; font-size: 10px; font-weight: 700; }
.route-ai-route-title strong { color: #172943; font-size: 13px; }
.route-ai-route-card svg { display: block; width: 100%; height: auto; background: linear-gradient(145deg, #e6f1fb, #edf8f1); }
.route-ai-grid { fill: none; stroke: #fff; stroke-width: 2; opacity: .7; }
.route-ai-line-shadow, .route-ai-line { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.route-ai-line-shadow { stroke: white; stroke-width: 9; }
.route-ai-line { stroke: #1675e8; stroke-width: 5; }
.route-ai-start { fill: #0fac88; stroke: white; stroke-width: 3; }
.route-ai-end { fill: #f46850; stroke: white; stroke-width: 3; }
.route-ai-route-metrics { display: flex; gap: 15px; padding: 11px 12px; background: white; }
.route-ai-route-metrics span { display: grid; gap: 1px; color: #8693a4; font-size: 10px; }
.route-ai-route-metrics strong { color: #1f304b; font-size: 13px; }
.route-ai-via, .route-ai-summary-hint { margin: 0; padding: 0 12px 11px; color: #698097; font-size: 11px; }
.route-ai-working { margin: 0 0 16px 43px; color: #6684a8; font-size: 12px; }
.route-ai-confirm-shortcut { margin: 0 0 18px 43px; }
.route-ai-confirm-shortcut button { padding: 9px 13px; border: 1px solid #b8d8ff; border-radius: 999px; background: white; color: #176de7; font-size: 12px; font-weight: 700; }
.route-ai-notice { position: absolute; right: 14px; bottom: calc(78px + env(safe-area-inset-bottom)); left: 14px; z-index: 3; margin: 0; padding: 9px 11px; border-radius: 10px; background: #fff1ed; color: #a64334; font-size: 11px; box-shadow: 0 4px 14px rgba(70,40,25,.08); }
.route-ai-composer { position: absolute; right: 12px; bottom: calc(11px + env(safe-area-inset-bottom)); left: 12px; z-index: 3; display: flex; gap: 8px; padding: 8px; border: 1px solid #e5edf6; border-radius: 21px; background: rgba(255,255,255,.97); box-shadow: 0 9px 30px rgba(25,50,85,.15); }
.route-ai-composer input { flex: 1; min-width: 0; padding: 0 8px; border: 0; outline: none; background: transparent; color: #172943; font-size: 13px; }
.route-ai-composer button { flex: 0 0 auto; min-width: 58px; height: 40px; border: 0; border-radius: 15px; background: #176de7; color: white; font-size: 13px; font-weight: 700; }
.route-ai-composer button:disabled { background: #cbd5e1; }
</style>
