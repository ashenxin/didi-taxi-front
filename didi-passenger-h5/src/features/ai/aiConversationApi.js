import { API_BASE_URL, clearToken, getJson, getToken, postJson } from '../../api/http'
import { createSseParser } from './sseParser'

const BASE_PATH = '/app/api/v1/ai/conversations'

function apiError(message, extra = {}) {
  return Object.assign(new Error(message), extra)
}

export async function createAiConversation(idempotencyKey) {
  const result = await postJson(BASE_PATH, {}, {
    headers: { 'Idempotency-Key': idempotencyKey },
  })
  if (!result?.conversationNo) throw apiError('创建客服会话失败：缺少会话编号')
  return result.conversationNo
}

/** 最新页优先；beforeSequence 仅用于向前读取更早的消息。 */
export async function listAiMessages(conversationNo, { limit = 20, beforeSequence } = {}) {
  const query = new URLSearchParams({ limit: String(limit) })
  if (beforeSequence != null) query.set('beforeSequence', String(beforeSequence))
  const result = await getJson(
    `${BASE_PATH}/${encodeURIComponent(conversationNo)}/messages?${query}`,
  )
  if (!Array.isArray(result?.messages) || typeof result.hasMore !== 'boolean') {
    throw apiError('客服历史记录格式不正确，请稍后重试')
  }
  return result
}

async function responseError(response) {
  let body
  try {
    body = await response.json()
  } catch {
    body = null
  }
  if (response.status === 401 || Number(body?.code) === 401) clearToken()
  return apiError(body?.msg || body?.message || `客服请求失败（${response.status}）`, {
    code: body?.code,
    httpStatus: response.status,
  })
}

/** 完整内容事件已经持久化；turn.completed 用来确认流正常结束。 */
export async function streamAiMessage({ conversationNo, content, idempotencyKey, signal, onEvent }) {
  return streamRequest({
    path: `${BASE_PATH}/${encodeURIComponent(conversationNo)}/messages/stream`,
    body: { content }, idempotencyKey, signal, onEvent,
  })
}

export async function streamAiPlaceChoice({ conversationNo, taskNo, placeChoiceId,
  expectedRequestVersion, choiceName, choiceCity, idempotencyKey, signal, onEvent }) {
  return streamRequest({
    path: `${BASE_PATH}/${encodeURIComponent(conversationNo)}/route-tasks/${encodeURIComponent(taskNo)}/place-choice/stream`,
    body: { placeChoiceId, expectedRequestVersion, choiceName, choiceCity },
    idempotencyKey, signal, onEvent,
  })
}

export async function streamAiRouteCheckChoice({ conversationNo, taskNo, checkMode,
  expectedRequestVersion, choiceLabel, idempotencyKey, signal, onEvent }) {
  return streamRequest({
    path: `${BASE_PATH}/${encodeURIComponent(conversationNo)}/route-check-tasks/${encodeURIComponent(taskNo)}/mode-choice/stream`,
    body: { checkMode, expectedRequestVersion, choiceLabel },
    idempotencyKey, signal, onEvent,
  })
}

async function streamRequest({ path, body, idempotencyKey, signal, onEvent }) {
  const token = getToken()
  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'Idempotency-Key': idempotencyKey,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    },
  )

  if (!response.ok) throw await responseError(response)
  if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) {
    throw apiError('客服没有返回流式响应，请检查网关与后端接口')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const result = { started: false, contentReceived: false, completed: false, failure: null }
  const parser = createSseParser((name, data) => {
    if (name === 'turn.started') result.started = true
    if (name === 'answer.completed' || name === 'route.card' || name === 'place.choices'
      || name === 'route-check.choices') result.contentReceived = true
    if (name === 'turn.completed') result.completed = true
    if (name === 'turn.failed') result.failure = data
    onEvent(name, data)
  })

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      parser.feed(decoder.decode(value, { stream: true }))
    }
    parser.feed(decoder.decode())
    parser.finish()
    return result
  } finally {
    reader.releaseLock()
  }
}
