/** 解析 driver JWT payload（仅用于读取 sub） */
export function parseJwtPayload(token) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '==='.slice((base64.length + 3) % 4)
    const json = atob(padded)
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function parseDriverIdFromToken(token) {
  const p = parseJwtPayload(token)
  if (!p || p.sub == null) return null
  const n = Number(p.sub)
  return Number.isFinite(n) ? n : null
}
