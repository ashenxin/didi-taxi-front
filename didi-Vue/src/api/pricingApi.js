import { requestJson, requestJsonDelete, requestJsonPost, requestJsonPut } from './http'

const toQuery = (params) => {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, value)
    }
  })
  return query.toString()
}

export async function fetchFareRulePage(params) {
  const query = toQuery(params)
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

