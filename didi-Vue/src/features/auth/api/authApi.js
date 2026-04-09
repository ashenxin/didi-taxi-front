import { requestJson, requestJsonPost, setAdminToken } from '../../../api/http'

/**
 * @returns {Promise<{ accessToken: string, tokenType: string, expiresIn: number, user: object }>}
 */
export async function login(username, password) {
  const data = await requestJsonPost('/admin/api/v1/auth/login', { username, password })
  if (data?.accessToken) setAdminToken(data.accessToken)
  return data
}

export async function fetchMe() {
  return requestJson('/admin/api/v1/auth/me')
}

/** @returns {Promise<Array>} 菜单树，与接口文档 MenuNode 一致 */
export async function fetchMenus() {
  return requestJson('/admin/api/v1/auth/menus')
}
