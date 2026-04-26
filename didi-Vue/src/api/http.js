const DEFAULT_BASE_URL = 'http://127.0.0.1:18080'
const DEFAULT_TIMEOUT_MS = 15_000

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '')

const TOKEN_KEY = 'didi_admin_token'

export function getAdminToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setAdminToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export function clearAdminToken() {
  localStorage.removeItem(TOKEN_KEY)
}

function authHeaders() {
  const token = getAdminToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function redirectToLoginIfNeeded() {
  if (typeof window === 'undefined') return
  const path = window.location.pathname || ''
  if (path.endsWith('/login')) return
  const q = window.location.search || ''
  window.location.assign(`/login?redirect=${encodeURIComponent(path + q)}`)
}

function createApiError(message, extra = {}) {
  const err = new Error(message)
  err.name = 'ApiError'
  Object.assign(err, extra)
  return err
}

/** 与后端 ResponseVo.code 对齐（Jackson 可能序列化为数字或字符串） */
function isSuccessBusinessCode(code) {
  if (code === undefined || code === null) return false
  return code === 200 || code === '200' || Number(code) === 200
}

let unauthorizedHandler = null
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = typeof handler === 'function' ? handler : null
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
        ...authHeaders()
      }
    })
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId)
    // 浏览器网络层异常（如后端未启动/断网）默认是英文，统一降级中文提示
    if (error?.name === 'AbortError') {
      throw createApiError('请求超时，请稍后重试', { code: 'TIMEOUT', httpStatus: 0, cause: error })
    }
    throw createApiError('网络异常，请检查后端服务是否启动', { httpStatus: 0, cause: error })
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
  let result
  try {
    const text = await resp.text()
    result = text ? JSON.parse(text) : {}
  } catch (error) {
    if (!resp.ok) {
      throw createApiError(`服务异常（${resp.status}），请稍后重试`, { httpStatus: resp.status, cause: error })
    }
    throw createApiError('响应解析失败，请稍后重试', { httpStatus: resp.status, cause: error })
  }
  // admin-api：HTTP 状态码与 body.code 一致（400/404/500/502/504 等），错误时仍以 JSON 返回 ResponseVo
  if (resp.status === 401 || result.code === 401) {
    clearAdminToken()
    try {
      unauthorizedHandler?.()
    } catch {
      /* ignore */
    }
    redirectToLoginIfNeeded()
    throw createApiError(result.msg || '未登录或登录已失效', { code: 401, httpStatus: resp.status, data: result.data })
  }
  if (!resp.ok || !isSuccessBusinessCode(result.code)) {
    throw createApiError(result.msg || `服务异常（${resp.status}），请稍后重试`, {
      code: typeof result.code === 'undefined' ? undefined : result.code,
      httpStatus: resp.status,
      data: result.data
    })
  }
  return result.data
}

/**
 * @param {string} path
 * @param {object} [body] JSON 序列化；无 body 时传 undefined
 * @param {RequestInit} [options]
 */
export async function requestJsonPost(path, body, options = {}) {
  return requestJson(path, {
    ...options,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...authHeaders()
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
}

export async function requestJsonPut(path, body, options = {}) {
  return requestJson(path, {
    ...options,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...authHeaders()
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
}

export async function requestJsonDelete(path, options = {}) {
  return requestJson(path, {
    ...options,
    method: 'DELETE',
    headers: {
      ...(options.headers || {}),
      ...authHeaders()
    }
  })
}

// --- 统一命名（便于与 H5 两端对齐） ---
export const getJson = (path, options) => requestJson(path, { ...(options || {}), method: 'GET' })
export const postJson = (path, body, options) => requestJsonPost(path, body, options)
export const putJson = (path, body, options) => requestJsonPut(path, body, options)
export const deleteJson = (path, options) => requestJsonDelete(path, options)
