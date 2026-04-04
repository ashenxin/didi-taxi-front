const DEFAULT_BASE_URL = 'http://127.0.0.1:8080'

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

export async function requestJson(path, options = {}) {
  let resp
  try {
    resp = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...authHeaders(),
        ...(options.headers || {})
      }
    })
  } catch (error) {
    // 浏览器网络层异常（如后端未启动/断网）默认是英文，统一降级中文提示
    throw new Error('网络异常，请检查后端服务是否启动')
  }
  let result
  try {
    const text = await resp.text()
    result = text ? JSON.parse(text) : {}
  } catch (error) {
    if (!resp.ok) {
      throw new Error(`服务异常（${resp.status}），请稍后重试`)
    }
    throw new Error('响应解析失败，请稍后重试')
  }
  // admin-api：HTTP 状态码与 body.code 一致（400/404/500/502/504 等），错误时仍以 JSON 返回 ResponseVo
  if (resp.status === 401 || result.code === 401) {
    clearAdminToken()
    redirectToLoginIfNeeded()
    throw new Error(result.msg || '未登录或登录已失效')
  }
  if (!resp.ok || result.code !== 200) {
    throw new Error(result.msg || `服务异常（${resp.status}），请稍后重试`)
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
      ...authHeaders(),
      ...(options.headers || {})
    },
    body: body === undefined ? '{}' : JSON.stringify(body)
  })
}

export async function requestJsonPut(path, body, options = {}) {
  return requestJson(path, {
    ...options,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(options.headers || {})
    },
    body: body === undefined ? '{}' : JSON.stringify(body)
  })
}

export async function requestJsonDelete(path, options = {}) {
  return requestJson(path, {
    ...options,
    method: 'DELETE',
    headers: {
      ...authHeaders(),
      ...(options.headers || {})
    }
  })
}
