import { requestJson, requestJsonPost } from '../../../api/http'
import { toQueryString } from '../../../api/query'

export async function fetchCompanyPage(params) {
  const query = toQueryString(params)
  return requestJson(`/admin/api/v1/capacity/companies?${query}`)
}

export async function fetchDriverPage(params) {
  const query = toQueryString(params)
  return requestJson(`/admin/api/v1/capacity/drivers?${query}`)
}

export async function fetchCarsByDriver(driverId, params) {
  const query = toQueryString(params)
  return requestJson(`/admin/api/v1/capacity/drivers/${driverId}/cars?${query}`)
}

/** 换队申请 — 待审核条数（菜单角标） */
export async function fetchTeamChangePendingCount() {
  return requestJson('/admin/api/v1/capacity/team-change-requests/pending-count')
}

export async function fetchTeamChangePage(params) {
  const query = toQueryString(params)
  return requestJson(`/admin/api/v1/capacity/team-change-requests?${query}`)
}

export async function approveTeamChange(id, payload = {}) {
  return requestJsonPost(`/admin/api/v1/capacity/team-change-requests/${id}/approve`, payload)
}

export async function rejectTeamChange(id, payload) {
  return requestJsonPost(`/admin/api/v1/capacity/team-change-requests/${id}/reject`, payload)
}
