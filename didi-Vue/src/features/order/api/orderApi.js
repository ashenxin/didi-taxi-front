import { requestJson } from '../../../api/http'
import { toQueryString } from '../../../api/query'

export async function fetchOrderPage(params) {
  const query = toQueryString(params)
  return requestJson(`/admin/api/v1/orders?${query}`)
}

export async function fetchOrderDetail(orderNo) {
  return requestJson(`/admin/api/v1/orders/${orderNo}`)
}
