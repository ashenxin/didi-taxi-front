export function money(value) {
  return value == null || value === '' || !Number.isFinite(Number(value)) ? '未记录' : `¥${Number(value).toFixed(2)}`
}
export function duration(value) {
  if (value == null || !Number.isFinite(Number(value)) || Number(value) < 0) return '未记录'
  const seconds = Math.floor(Number(value))
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60)
  return hours ? `${hours}小时${minutes}分` : minutes ? `${minutes}分${seconds % 60}秒` : `${seconds}秒`
}
export function distance(value) {
  return value == null || !Number.isFinite(Number(value)) || Number(value) < 0 ? '未记录' : `${(Number(value) / 1000).toFixed(2)} 公里`
}
export function time(value) { return value ? String(value).replace('T', ' ').slice(0, 19) : '未记录' }
export function statusName(value) { return ({ 2: '已接单', 3: '已到达', 4: '行程中', 5: '已完成', 6: '已取消' })[value] || '状态未知' }
export function settlementName(row) {
  if (row?.manualActionRequired === 1) return '结算异常，待处理'
  return ({ CALCULATING: '结算中', PAYMENT_REQUIRED: '乘客待支付', PAY_CONFIRMING: '支付确认中', PAID: '已结清' })[row?.settlementStatus] || '结算信息暂未就绪'
}
export function tripAmount(row) {
  if (Number(row?.status) === 6) return '已取消'
  if (Number(row?.status) !== 5) return `预估 ${money(row?.estimatedAmount)}`
  if (row?.manualActionRequired === 1) return '结算异常'
  return row?.finalAmount == null ? '结算中' : money(row.finalAmount)
}
export function cancelName(value) { return ({ 1: '乘客取消', 2: '司机取消', 3: '系统取消' })[value] || '取消方未记录' }
export function cancelReason(value) {
  return ({ TOO_FAR: '距离过远', TRAFFIC_JAM: '交通拥堵', VEHICLE_ISSUE: '车辆问题', OTHER: '其他原因', DRIVER_LOGOUT: '退出登录，释放已接行程', LOGOUT: '退出登录，释放已接行程' })[value] || value || '未记录'
}
export function needsSettlementRefresh(row) {
  return Number(row?.status) === 5 && row?.manualActionRequired !== 1 &&
    (row?.finalAmount == null || ['CALCULATING', 'PAY_CONFIRMING'].includes(row?.settlementStatus))
}
export function shanghaiDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
