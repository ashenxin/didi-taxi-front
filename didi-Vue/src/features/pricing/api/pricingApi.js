import { requestJson, requestJsonDelete, requestJsonPost, requestJsonPut } from '../../../api/http'
import { toQueryString } from '../../../api/query'

export async function fetchFareRulePage(params) {
  const query = toQueryString(params)
  return requestJson(`/admin/api/v1/pricing/fare-rules?${query}`)
}

export async function fetchFareRuleDetail(id) {
  return requestJson(`/admin/api/v1/pricing/fare-rules/${id}`)
}

export async function createFareRule(body) {
  return requestJsonPost('/admin/api/v1/pricing/fare-rules', body)
}

export async function updateFareRule(id, body) {
  return requestJsonPut(`/admin/api/v1/pricing/fare-rules/${id}`, body)
}

export async function deleteFareRule(id) {
  return requestJsonDelete(`/admin/api/v1/pricing/fare-rules/${id}`)
}

export async function fetchFareRuleCoupons(id, params = {}) {
  const query = toQueryString(params)
  return requestJson(`/admin/api/v1/pricing/fare-rules/${id}/coupons?${query}`)
}

export async function createFareRuleCoupon(id, body) {
  return requestJsonPost(`/admin/api/v1/pricing/fare-rules/${id}/coupons`, body)
}

export async function updateFareRuleCoupon(id, templateId, body) {
  return requestJsonPut(`/admin/api/v1/pricing/fare-rules/${id}/coupons/${templateId}`, body)
}

export async function publishFareRuleCoupon(id, templateId) {
  return requestJsonPost(`/admin/api/v1/pricing/fare-rules/${id}/coupons/${templateId}/publish`)
}

export async function offlineFareRuleCoupon(id, templateId) {
  return requestJsonPost(`/admin/api/v1/pricing/fare-rules/${id}/coupons/${templateId}/offline`)
}
