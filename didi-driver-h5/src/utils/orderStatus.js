/** 指派单列表 status 字段为英文枚举名（如 ASSIGNED / PENDING_DRIVER_CONFIRM） */
export const ASSIGNED_STATUS_LABEL = {
  ASSIGNED: '已派单',
  PENDING_DRIVER_CONFIRM: '待司机确认',
}

export function formatAssignedItemStatus(statusStr) {
  if (!statusStr) return '-'
  return ASSIGNED_STATUS_LABEL[statusStr] ?? statusStr
}
