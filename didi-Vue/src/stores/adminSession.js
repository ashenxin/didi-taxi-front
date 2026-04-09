import { ref } from 'vue'
import { fetchMe, fetchMenus } from '../features/auth/api/authApi'
import { fetchTeamChangePendingCount } from '../features/capacity/api/capacityApi'
import { clearAdminToken, setUnauthorizedHandler } from '../api/http'

export const adminMe = ref(null)
export const adminMenus = ref([])
export const pendingTeamChangeCount = ref(0)

const lastMeLoadedAt = ref(0)
const lastMenusLoadedAt = ref(0)
const lastPendingCountLoadedAt = ref(0)

export function clearAdminSession() {
  adminMe.value = null
  adminMenus.value = []
  pendingTeamChangeCount.value = 0
  lastMeLoadedAt.value = 0
  lastMenusLoadedAt.value = 0
  lastPendingCountLoadedAt.value = 0
}

export function logoutAdmin() {
  clearAdminToken()
  clearAdminSession()
}

setUnauthorizedHandler(() => {
  clearAdminSession()
})

export async function loadAdminMe({ force = false, ttlMs = 5 * 60 * 1000 } = {}) {
  if (!force && adminMe.value && Date.now() - lastMeLoadedAt.value < ttlMs) return adminMe.value
  const me = await fetchMe()
  adminMe.value = me || null
  lastMeLoadedAt.value = Date.now()
  return adminMe.value
}

export async function loadAdminMenus({ force = false, ttlMs = 5 * 60 * 1000 } = {}) {
  if (!force && adminMenus.value?.length && Date.now() - lastMenusLoadedAt.value < ttlMs) return adminMenus.value
  const menus = await fetchMenus()
  adminMenus.value = Array.isArray(menus) ? menus : []
  lastMenusLoadedAt.value = Date.now()
  return adminMenus.value
}

export async function refreshPendingTeamChangeCount({ force = false, ttlMs = 30 * 1000 } = {}) {
  if (!force && Date.now() - lastPendingCountLoadedAt.value < ttlMs) return pendingTeamChangeCount.value
  try {
    const n = await fetchTeamChangePendingCount()
    pendingTeamChangeCount.value = typeof n === 'number' ? n : Number(n) || 0
  } catch {
    pendingTeamChangeCount.value = 0
  } finally {
    lastPendingCountLoadedAt.value = Date.now()
  }
  return pendingTeamChangeCount.value
}
