import { requestJson, requestJsonDelete, requestJsonPost, requestJsonPut } from './http'

const BASE = '/admin/api/v1/system/admin-users'

const toQuery = (params) => {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.append(k, String(v))
  })
  return q.toString()
}

export async function fetchAdminStaffPage(params) {
  const qs = toQuery(params)
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
