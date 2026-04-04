import { requestJson } from './http'

const toQuery = (params) => {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, value)
    }
  })
  return query.toString()
}

export async function fetchOrderPage(params) {
  const query = toQuery(params)
  return requestJson(`/admin/api/v1/orders?${query}`)
}

export async function fetchOrderDetail(orderNo) {
  return requestJson(`/admin/api/v1/orders/${orderNo}`)
}
