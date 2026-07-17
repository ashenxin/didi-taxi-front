import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const frontRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const backendRoot = path.resolve(frontRoot, '../didi-taxi')

const contracts = [
  ['POST', '/app/api/v1/auth/login-sms', 'didi-passenger-h5', '/app/api/v1/auth/login-sms'],
  ['POST', '/app/api/v1/orders', 'didi-passenger-h5', "postJson('/app/api/v1/orders'"],
  ['GET', '/app/api/v1/orders/{orderNo}', 'didi-passenger-h5', "getJson('/app/api/v1/orders/'"],
  ['POST', '/app/api/v1/orders/{orderNo}/cancel', 'didi-passenger-h5', '/cancel`'],
  ['GET', '/app/api/v1/settings/profile', 'didi-passenger-h5', '/app/api/v1/settings/profile'],
  ['POST', '/app/api/v1/settings/account-cancel/confirm', 'didi-passenger-h5', '/app/api/v1/settings/account-cancel/confirm'],
  ['GET', '/app/api/v1/wallet/coupons/claimable', 'didi-passenger-h5', '/app/api/v1/wallet/coupons/claimable'],
  ['POST', '/app/api/v1/wallet/coupons/claim', 'didi-passenger-h5', '/app/api/v1/wallet/coupons/claim'],
  ['POST', '/app/api/v1/benefits/sign-in', 'didi-passenger-h5', '/app/api/v1/benefits/sign-in'],

  ['POST', '/driver/api/v1/auth/login-sms', 'didi-driver-h5', '/driver/api/v1/auth/login-sms'],
  ['POST', '/driver/api/v1/drivers/{driverId}/online', 'didi-driver-h5', '/online`'],
  ['POST', '/driver/api/v1/drivers/{driverId}/heartbeat', 'didi-driver-h5', '/heartbeat`'],
  ['GET', '/driver/api/v1/orders/assigned', 'didi-driver-h5', '/driver/api/v1/orders/assigned'],
  ['POST', '/driver/api/v1/orders/{orderNo}/accept', 'didi-driver-h5', '/accept`'],
  ['POST', '/driver/api/v1/orders/{orderNo}/finish', 'didi-driver-h5', "postTripAction('/finish'"],
  ['GET', '/driver/api/v1/team-change/belonging', 'didi-driver-h5', '/driver/api/v1/team-change/belonging'],
  ['POST', '/driver/api/v1/team-change-requests', 'didi-driver-h5', "postJson('/driver/api/v1/team-change-requests'"],

  ['POST', '/admin/api/v1/auth/login', 'didi-Vue', '/admin/api/v1/auth/login'],
  ['GET', '/admin/api/v1/orders', 'didi-Vue', '/admin/api/v1/orders?'],
  ['GET', '/admin/api/v1/capacity/drivers/{driverId}', 'didi-Vue', '/capacity/drivers/${driverId}'],
  ['POST', '/admin/api/v1/capacity/team-change-requests/{id}/approve', 'didi-Vue', '/approve`'],
  ['GET', '/admin/api/v1/pricing/fare-rules/{id}/coupons', 'didi-Vue', '/pricing/fare-rules/${id}/coupons?'],
  ['POST', '/admin/api/v1/pricing/fare-rules/{id}/coupons/{templateId}/publish', 'didi-Vue', '/publish`'],
  ['GET', '/admin/api/v1/system/admin-users', 'didi-Vue', "const BASE = '/admin/api/v1/system/admin-users'"],
]

function filesUnder(root, predicate) {
  const out = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) out.push(...filesUnder(full, predicate))
    else if (predicate(full)) out.push(full)
  }
  return out
}

function normalizeRoute(route) {
  const clean = route.replace(/\?.*$/, '').replace(/\/+/g, '/').replace(/\/$/, '') || '/'
  return clean.replace(/\{[^}]+\}/g, '{}')
}

const backendRoutes = new Set()
for (const file of filesUnder(backendRoot, (f) => f.endsWith('Controller.java'))) {
  const source = fs.readFileSync(file, 'utf8')
  const classAt = source.indexOf('public class ')
  if (classAt < 0) continue
  const beforeClass = source.slice(0, classAt)
  const prefixMatches = [...beforeClass.matchAll(/@RequestMapping\(\s*"([^"]*)"/g)]
  const prefix = prefixMatches.at(-1)?.[1] || ''
  const methods = source.slice(classAt)
  for (const match of methods.matchAll(/@(Get|Post|Put|Delete|Patch)Mapping(?:\s*\(\s*"([^"]*)")?/g)) {
    const method = match[1].toUpperCase()
    backendRoutes.add(`${method} ${normalizeRoute(`${prefix}${match[2] || ''}`)}`)
  }
}

const appSources = new Map()
for (const app of ['didi-passenger-h5', 'didi-driver-h5', 'didi-Vue']) {
  const files = filesUnder(path.join(frontRoot, app, 'src'), (f) => /\.(js|vue|ts|tsx)$/.test(f))
  appSources.set(app, files.map((f) => fs.readFileSync(f, 'utf8')).join('\n'))
}

const errors = []
for (const [method, route, app, needle] of contracts) {
  const key = `${method} ${normalizeRoute(route)}`
  if (!backendRoutes.has(key)) errors.push(`后端缺少契约：${key}`)
  if (!appSources.get(app).includes(needle)) errors.push(`${app} 未找到调用证据：${method} ${route}`)
}

const allFrontSource = [...appSources.values()].join('\n')
for (const forbidden of ['/app/api/v1/profile/', '/app/api/v1/coupons/', '/admin/api/v1/coupons/templates', 'X-User-Id']) {
  if (allFrontSource.includes(forbidden)) errors.push(`前端仍包含禁用契约：${forbidden}`)
}
const driverEnv = fs.readFileSync(path.join(frontRoot, 'didi-driver-h5/.env.development'), 'utf8')
if (/VITE_DRIVER_WS_BASE_URL\s*=\s*ws:\/\/127\.0\.0\.1:8101/.test(driverEnv)) {
  errors.push('司机开发环境 WebSocket 仍直连 8101，未统一经过网关')
}
if (!appSources.get('didi-passenger-h5').includes('@click="placeOrder"')) {
  errors.push('乘客首页没有绑定真实下单入口 @click="placeOrder"')
}

if (errors.length) {
  console.error(errors.map((item) => `- ${item}`).join('\n'))
  process.exit(1)
}

console.log(`API contract check passed: ${contracts.length} frontend usages match backend Controller routes.`)
