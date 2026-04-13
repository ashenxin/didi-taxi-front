/**
 * 指派单列表 status 字段为英文枚举名（如 ASSIGNED / PENDING_DRIVER_CONFIRM）。
 * 列表可含多笔待确认；司机 accept 一单后，其余由 order-service 系统取消。
 */
export const ASSIGNED_STATUS_LABEL = {
  ASSIGNED: '已派单',
  PENDING_DRIVER_CONFIRM: '待司机确认',
}

export function formatAssignedItemStatus(statusStr) {
  if (!statusStr) return '-'
  return ASSIGNED_STATUS_LABEL[statusStr] ?? statusStr
}

/** 仅「待司机确认接单」列表应展示的行（排除已完单、已取消等终态） */
export function isPendingAssignListStatus(statusStr) {
  return statusStr === 'ASSIGNED' || statusStr === 'PENDING_DRIVER_CONFIRM'
}
