import { requestJson, requestJsonDelete, requestJsonPost, requestJsonPut } from '../../../api/http'
import { toQueryString } from '../../../api/query'

const BASE = '/admin/api/v1/system/admin-users'

export async function fetchAdminStaffPage(params) {
  const qs = toQueryString(params)
  return requestJson(`${BASE}?${qs}`)
}

export async function getAdminStaff(id) {
  return requestJson(`${BASE}/${id}`)
}

export async function createAdminStaff(body) {
  return requestJsonPost(BASE, body)
}

export async function updateAdminStaff(id, body) {
  return requestJsonPut(`${BASE}/${id}`, body)
}

export async function deleteAdminStaff(id) {
  return requestJsonDelete(`${BASE}/${id}`)
}
