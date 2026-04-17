import { deleteJson, putJson, requestJson, requestJsonPost } from '../../../api/http'
import { unwrapPage } from '../../../api/pageUtils'
import { toQueryString } from '../../../api/query'

export async function fetchCompanyPage(params) {
  const query = toQueryString(params)
  const data = await requestJson(`/admin/api/v1/capacity/companies?${query}`)
  return unwrapPage(data)
}

export async function createCompany(body) {
  return requestJsonPost('/admin/api/v1/capacity/companies', body)
}

export async function deleteCompany(id) {
  return deleteJson(`/admin/api/v1/capacity/companies/${id}`)
}

export async function updateCompany(id, body) {
  return putJson(`/admin/api/v1/capacity/companies/${id}`, body)
}

export async function fetchDriverPage(params) {
  const query = toQueryString(params)
  const data = await requestJson(`/admin/api/v1/capacity/drivers?${query}`)
  return unwrapPage(data)
}

/** 司机档案详情（证件/资质/照片 URL 等） */
export async function fetchDriverDetail(driverId) {
  return requestJson(`/admin/api/v1/capacity/drivers/${driverId}`)
}

export async function fetchCarsByDriver(driverId, params) {
  const query = toQueryString(params)
  const data = await requestJson(`/admin/api/v1/capacity/drivers/${driverId}/cars?${query}`)
  return unwrapPage(data)
}

/** 换队申请 — 待审核条数（菜单角标） */
export async function fetchTeamChangePendingCount() {
  return requestJson('/admin/api/v1/capacity/team-change-requests/pending-count')
}

export async function fetchTeamChangePage(params) {
  const query = toQueryString(params)
  const data = await requestJson(`/admin/api/v1/capacity/team-change-requests?${query}`)
  return unwrapPage(data)
}

export async function approveTeamChange(id, payload = {}) {
  return requestJsonPost(`/admin/api/v1/capacity/team-change-requests/${id}/approve`, payload)
}

export async function rejectTeamChange(id, payload) {
  return requestJsonPost(`/admin/api/v1/capacity/team-change-requests/${id}/reject`, payload)
}
