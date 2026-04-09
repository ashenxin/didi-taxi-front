import { createRouter, createWebHistory } from 'vue-router'
import { getAdminToken } from '../api/http'
import { registerAdminMenuRoutes, clearAdminMenuRoutes } from './dynamicRoutes'

const LoginView = () => import('../features/auth/views/LoginView.vue')
const AdminShellLayout = () => import('../layouts/AdminShellLayout.vue')

const routes = [
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: { public: true }
  },
  {
    path: '/',
    name: 'admin-shell',
    component: AdminShellLayout,
    children: []
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

let menuRoutesReady = false
/** 并发导航时共用一个注册 Promise，避免重复 addRoute 叠出两层页面 */
let menuRoutesLoading = null

export function resetAdminMenuRoutesState() {
  menuRoutesReady = false
  menuRoutesLoading = null
}

export function teardownAdminMenuRoutes() {
  clearAdminMenuRoutes(router)
  resetAdminMenuRoutesState()
}

router.beforeEach(async (to, _from, next) => {
  if (to.meta.public) {
    if (to.path === '/login' && getAdminToken()) {
      next({ path: '/', replace: true })
      return
    }
    next()
    return
  }
  if (!getAdminToken()) {
    next({ path: '/login', query: { redirect: to.fullPath } })
    return
  }
  if (!menuRoutesReady) {
    if (!menuRoutesLoading) {
      menuRoutesLoading = registerAdminMenuRoutes(router)
        .then(() => {
          menuRoutesReady = true
        })
        .finally(() => {
          menuRoutesLoading = null
        })
    }
    try {
      await menuRoutesLoading
    } catch (e) {
      console.error('[admin] 加载菜单失败', e)
      next({ path: '/login', query: { redirect: to.fullPath } })
      return
    }
    next({ path: to.fullPath, replace: true })
    return
  }
  next()
})

export default router
