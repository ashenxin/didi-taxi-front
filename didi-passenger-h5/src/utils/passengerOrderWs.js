/**
 * 由 HTTP API 根地址推导 WS 同源根（或与 VITE_PASSENGER_WS_BASE_URL 覆盖）。
 * @param {string} apiBaseUrl 已无尾部斜杠的 API_BASE_URL
 */
export function resolvePassengerWsOrigin(apiBaseUrl) {
  const override = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PASSENGER_WS_BASE_URL) || ''
  if (override && String(override).trim()) {
    return String(override).trim().replace(/\/$/, '')
  }
  const raw = apiBaseUrl || ''
  try {
    const u = new URL(raw.includes('://') ? raw : `http://${raw}`)
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
    return u.origin
  } catch {
    return raw.replace(/^http/i, 'ws')
  }
}

export function passengerWsStreamUrl(wsOrigin, wsToken) {
  const tok = encodeURIComponent(wsToken || '')
  return `${wsOrigin}/app/ws/v1/stream?token=${tok}`
}

/** @returns {{ type?: string, data?: { orderNo?: string, seq?: number } } | null */
export function tryParseEnvelope(text) {
  if (!text || typeof text !== 'string') return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
