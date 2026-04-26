const DEFAULT_BASE_URL = 'http://127.0.0.1:18080'
const DEFAULT_TIMEOUT_MS = 15_000
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '')

const TOKEN_KEY = 'didi_driver_token'

import { parseDriverIdFromToken } from '../utils/jwt'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

function authHeaders() {
  const token = getToken()
  if (!token) return {}
  const driverId = parseDriverIdFromToken(token)
  return {
    Authorization: `Bearer ${token}`,
    ...(driverId != null ? { 'X-User-Id': String(driverId) } : {}),
  }
}

function createApiError(message, extra = {}) {
  const err = new Error(message)
  err.name = 'ApiError'
  Object.assign(err, extra)
  return err
}

export async function requestJson(path, options = {}) {
  let resp
  const { timeoutMs, ...fetchOptions } = options || {}
  let timeoutId = null
  let controller = null
  const signal = fetchOptions.signal
  if (!signal) {
    controller = new AbortController()
    fetchOptions.signal = controller.signal
    const ms = typeof timeoutMs === 'number' ? timeoutMs : DEFAULT_TIMEOUT_MS
    timeoutId = setTimeout(() => controller.abort(), ms)
  }

  try {
    resp = await fetch(`${API_BASE_URL}${path}`, {
      ...fetchOptions,
      headers: {
        ...(fetchOptions.headers || {}),
        ...authHeaders(),
      },
    })
  } catch (e) {
    if (timeoutId) clearTimeout(timeoutId)
    if (e?.name === 'AbortError') {
      throw createApiError('请求超时，请稍后重试', { code: 'TIMEOUT', httpStatus: 0, cause: e })
    }
    throw createApiError('网络异常，请检查后端服务是否启动', { httpStatus: 0, cause: e })
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }

  const text = await resp.text()
  let json
  try {
    json = text ? JSON.parse(text) : {}
  } catch (e) {
    if (!resp.ok) {
      throw createApiError(`服务异常（${resp.status}），请稍后重试`, { httpStatus: resp.status, raw: text, cause: e })
    }
    throw createApiError('响应解析失败，请稍后重试', { httpStatus: resp.status, raw: text, cause: e })
  }

  if (resp.status === 401 || json.code === 401) {
    clearToken()
    throw createApiError(json.msg || '未登录或登录已失效', { code: 401, httpStatus: resp.status, data: json.data })
  }
  if (!resp.ok || json.code !== 200) {
    throw createApiError(json.msg || `请求失败（${resp.status}）`, {
      code: typeof json.code === 'undefined' ? undefined : json.code,
      httpStatus: resp.status,
      raw: typeof json.raw === 'string' ? json.raw : undefined,
      data: json.data,
    })
  }
  return json.data
}

export async function getJson(path, options) {
  return requestJson(path, { ...(options || {}), method: 'GET' })
}

export async function postJson(path, body, options) {
  return requestJson(path, {
    ...(options || {}),
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...((options || {}).headers || {}) },
    body: JSON.stringify(body ?? {}),
  })
}

export async function putJson(path, body, options) {
  return requestJson(path, {
    ...(options || {}),
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...((options || {}).headers || {}) },
    body: JSON.stringify(body ?? {}),
  })
}

export async function deleteJson(path, options) {
  return requestJson(path, { ...(options || {}), method: 'DELETE' })
}

