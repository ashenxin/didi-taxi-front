const DEFAULT_BASE_URL = 'http://127.0.0.1:8080'
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '')

const TOKEN_KEY = 'didi_driver_token'

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
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function requestJson(path, options = {}) {
  let resp
  try {
    resp = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...authHeaders(),
      },
    })
  } catch (e) {
    throw new Error('网络异常，请检查后端服务是否启动')
  }

  const text = await resp.text()
  let json
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = { raw: text }
  }

  if (resp.status === 401 || json.code === 401) {
    clearToken()
    throw new Error(json.msg || '未登录或登录已失效')
  }
  if (!resp.ok || json.code !== 200) {
    throw new Error(json.msg || `请求失败（${resp.status}）`)
  }
  return json.data
}

export async function postJson(path, body) {
  return requestJson(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
}

export async function getJson(path) {
  return requestJson(path, { method: 'GET' })
}

