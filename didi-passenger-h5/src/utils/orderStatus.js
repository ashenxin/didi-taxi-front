/** 与 order-service / passenger-api OrderStatus.code 对齐 */
export const ORDER_STATUS_ZH = {
  0: '已创建',
  1: '已派单',
  2: '已接单',
  3: '司机已到达',
  4: '行程中',
  5: '已完成',
  6: '已取消',
  7: '待司机确认',
}

/**
 * 从 BFF 的 status（{ code, zh } 或裸数字）取出数字码，供轮询停止条件、取消按钮等使用。
 * @param {object|number|null|undefined} status
 * @returns {number|null}
 */
export function orderStatusCode(status) {
  if (status == null) return null
  if (typeof status === 'object' && status.code != null && status.code !== '') {
    const n = Number(status.code)
    return Number.isNaN(n) ? null : n
  }
  if (typeof status === 'number') return Number.isNaN(status) ? null : status
  return null
}

/**
 * @param {object|number|null|undefined} status - BFF 枚举对象 { code, en, zh } 或数字
 */
export function formatOrderStatus(status) {
  if (status == null) return '-'
  if (typeof status === 'object') {
    if (typeof status.zh === 'string' && status.zh) return status.zh
    const c = orderStatusCode(status)
    if (c != null) return ORDER_STATUS_ZH[c] ?? `状态(${c})`
  }
  if (typeof status === 'number') return ORDER_STATUS_ZH[status] ?? `状态(${status})`
  return String(status)
}

/** 与 order-service 乘客取消一致：CREATED / ASSIGNED / PENDING_DRIVER_CONFIRM / ACCEPTED */
export function passengerCanCancel(statusCode) {
  const c = statusCode == null ? null : Number(statusCode)
  return c === 0 || c === 1 || c === 2 || c === 7
}

/** 已完单或已取消，可再次下单（与后端「进行中」定义一致） */
export function isTerminalOrderStatus(statusCode) {
  const c = statusCode == null ? null : Number(statusCode)
  return c === 5 || c === 6
}

/** 与 trip_order.cancel_by 一致：3=系统取消（如待派单超时） */
export const CANCEL_BY_SYSTEM = 3
