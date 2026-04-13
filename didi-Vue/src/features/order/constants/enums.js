export const STATUS_MAP = {
  0: '已创建',
  1: '已分配',
  2: '已接单',
  3: '司机已到达',
  4: '行程中',
  5: '已完成',
  6: '已取消',
  7: '待司机确认',
  CREATED: '已创建',
  ASSIGNED: '已分配',
  ACCEPTED: '已接单',
  ARRIVED: '司机已到达',
  STARTED: '行程中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  PENDING_DRIVER_CONFIRM: '待司机确认'
}

export const STATUS_OPTIONS = [
  { label: '已创建', value: 0 },
  { label: '已分配', value: 1 },
  { label: '已接单', value: 2 },
  { label: '司机已到达', value: 3 },
  { label: '行程中', value: 4 },
  { label: '已完成', value: 5 },
  { label: '已取消', value: 6 },
  { label: '待司机确认', value: 7 }
]

export const EVENT_TYPE_MAP = {
  CREATE: '创建订单',
  ASSIGN: '系统派单',
  ACCEPT: '司机接单',
  ARRIVE: '司机到达',
  START: '开始行程',
  FINISH: '完成行程',
  CANCEL: '取消订单'
}

export const statusText = (status) => (status === 0 || status ? STATUS_MAP[status] ?? status : '-')
export const eventTypeText = (type) => EVENT_TYPE_MAP[type] ?? type
