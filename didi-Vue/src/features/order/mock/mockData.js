export const orderRows = [
  {
    orderNo: 'OD202603240001',
    status: 'COMPLETED',
    provinceCode: '330000',
    cityCode: '330100',
    productCode: '快车',
    passengerPhone: '13800138000',
    passengerId: 10001,
    driverId: 20001,
    createdAt: '2026-03-24 09:11:20'
  },
  {
    orderNo: 'OD202603240002',
    status: 'STARTED',
    provinceCode: '330000',
    cityCode: '330100',
    productCode: '快车',
    passengerPhone: '13900139000',
    passengerId: 10002,
    driverId: 20015,
    createdAt: '2026-03-24 10:08:05'
  },
  {
    orderNo: 'OD202603240003',
    status: 'CANCELLED',
    provinceCode: '310000',
    cityCode: '310104',
    productCode: '专车',
    passengerPhone: '13700137000',
    passengerId: 10003,
    driverId: null,
    createdAt: '2026-03-24 11:35:47'
  }
]

export const orderDetailMap = {
  OD202603240001: {
    orderNo: 'OD202603240001',
    status: 'COMPLETED',
    productCode: '快车',
    provinceCode: '330000',
    cityCode: '330100',
    passengerId: 10001,
    passengerPhone: '13800138000',
    driverId: 20001,
    carId: 30011,
    companyId: 40001,
    originAddress: '杭州市西湖区天目山路 266 号',
    destAddress: '杭州市滨江区江陵路 1760 号',
    estimatedAmount: '36.80',
    finalAmount: '41.20',
    createdAt: '2026-03-24 09:11:20',
    assignedAt: '2026-03-24 09:11:42',
    acceptedAt: '2026-03-24 09:12:01',
    arrivedAt: '2026-03-24 09:19:23',
    startedAt: '2026-03-24 09:23:15',
    finishedAt: '2026-03-24 09:49:34',
    cancelledAt: '-',
    cancelReason: '-',
    events: [
      { occurredAt: '2026-03-24 09:11:20', eventType: 'CREATE', fromStatus: null, toStatus: 'CREATED', operator: '乘客(10001)', reason: '-' },
      { occurredAt: '2026-03-24 09:11:42', eventType: 'ASSIGN', fromStatus: 'CREATED', toStatus: 'ASSIGNED', operator: '系统', reason: '-' },
      { occurredAt: '2026-03-24 09:12:01', eventType: 'ACCEPT', fromStatus: 'ASSIGNED', toStatus: 'ACCEPTED', operator: '司机(20001)', reason: '-' },
      { occurredAt: '2026-03-24 09:19:23', eventType: 'ARRIVE', fromStatus: 'ACCEPTED', toStatus: 'ARRIVED', operator: '司机(20001)', reason: '-' },
      { occurredAt: '2026-03-24 09:23:15', eventType: 'START', fromStatus: 'ARRIVED', toStatus: 'STARTED', operator: '司机(20001)', reason: '-' },
      { occurredAt: '2026-03-24 09:49:34', eventType: 'FINISH', fromStatus: 'STARTED', toStatus: 'COMPLETED', operator: '司机(20001)', reason: '-' }
    ]
  },
  OD202603240002: {
    orderNo: 'OD202603240002',
    status: 'STARTED',
    productCode: '快车',
    provinceCode: '330000',
    cityCode: '330100',
    passengerId: 10002,
    passengerPhone: '13900139000',
    driverId: 20015,
    carId: 30020,
    companyId: 40001,
    originAddress: '杭州市余杭区文一西路 998 号',
    destAddress: '杭州市上城区解放东路 18 号',
    estimatedAmount: '28.60',
    finalAmount: '-',
    createdAt: '2026-03-24 10:08:05',
    assignedAt: '2026-03-24 10:08:17',
    acceptedAt: '2026-03-24 10:08:32',
    arrivedAt: '2026-03-24 10:16:11',
    startedAt: '2026-03-24 10:19:50',
    finishedAt: '-',
    cancelledAt: '-',
    cancelReason: '-',
    events: [
      { occurredAt: '2026-03-24 10:08:05', eventType: 'CREATE', fromStatus: null, toStatus: 'CREATED', operator: '乘客(10002)', reason: '-' },
      { occurredAt: '2026-03-24 10:08:17', eventType: 'ASSIGN', fromStatus: 'CREATED', toStatus: 'ASSIGNED', operator: '系统', reason: '-' },
      { occurredAt: '2026-03-24 10:08:32', eventType: 'ACCEPT', fromStatus: 'ASSIGNED', toStatus: 'ACCEPTED', operator: '司机(20015)', reason: '-' },
      { occurredAt: '2026-03-24 10:16:11', eventType: 'ARRIVE', fromStatus: 'ACCEPTED', toStatus: 'ARRIVED', operator: '司机(20015)', reason: '-' },
      { occurredAt: '2026-03-24 10:19:50', eventType: 'START', fromStatus: 'ARRIVED', toStatus: 'STARTED', operator: '司机(20015)', reason: '-' }
    ]
  }
}
