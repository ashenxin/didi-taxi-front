/** order-service trip_order.status（司机行程侧） */
export const DRIVER_TRIP_STATUS = {
  2: { key: 'ACCEPTED', zh: '已接单', step: 1 },
  3: { key: 'ARRIVED', zh: '已到达上车点', step: 2 },
  4: { key: 'STARTED', zh: '行程中', step: 3 },
  5: { key: 'FINISHED', zh: '已完成', step: 4 },
  6: { key: 'CANCELLED', zh: '已取消', step: -1 },
}

export function tripStatusLabel(code) {
  if (code == null) return '未知'
  return DRIVER_TRIP_STATUS[code]?.zh ?? `状态(${code})`
}

/** 当前可点的下一步动作（status 为 order-service 数字码） */
export function nextTripAction(statusCode) {
  const s = statusCode == null ? null : Number(statusCode)
  if (Number.isNaN(s)) return null
  if (s === 2) return 'arrive'
  if (s === 3) return 'start'
  if (s === 4) return 'finish'
  return null
}
