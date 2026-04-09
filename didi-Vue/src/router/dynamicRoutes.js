import { adminMenus, loadAdminMenus, clearAdminSession } from '../stores/adminSession'
import { resolveAdminView } from './adminViewRegistry'

/** 与 router/index 中布局路由 name 一致 */
export const ADMIN_LAYOUT_NAME = 'admin-shell'

/** 当前用户菜单树（仅 visible 过滤前Raw数据，侧栏自行再滤） */
export const adminMenuTree = adminMenus

const addedRouteNames = []

/** 去掉末尾多余 `/`，避免 `/foo` 与 `/foo/` 注册两条 */
function normalizeMenuPath(path) {
  const s = String(path || '').trim()
  if (!s || s === '/') return s
  return s.replace(/\/+$/, '') || '/'
}

/** `/a/b` → `a/b`；`/` → 空串（嵌套在父 path `/` 下的默认子路由） */
function fullPathToChildSegment(fullPathNormalized) {
  const s = fullPathNormalized
  if (!s || s === '/') return ''
  return s.replace(/^\//, '')
}

function resolvePage(componentPath) {
  if (!componentPath) return null
  const loader = resolveAdminView(componentPath)
  if (loader) return loader
  console.warn('[admin] 未在白名单中的视图标识:', componentPath)
  return resolveAdminView('auth/NoMenuView.vue') || (() => import('../features/auth/views/NoMenuView.vue'))
}

function firstRoutablePath(nodes) {
  if (!nodes?.length) return null
  for (const n of nodes) {
    if (n.children?.length) {
      const p = firstRoutablePath(n.children)
      if (p) return p
    }
    if (n.path && n.component) return n.path
  }
  return null
}

/** 菜单动态路由一律挂在布局下，保证全站只有一个内容区 router-view，避免叠页 */
function addMenuRoutes(router, nodes, pathSeen) {
  if (!nodes?.length) return
  for (const node of nodes) {
    if (node.component && node.path) {
      const fullPath = normalizeMenuPath(node.path)
      if (pathSeen.has(fullPath)) {
        console.warn('[admin] 菜单树存在重复 path，已跳过', fullPath, 'menuId=', node.id)
      } else {
        pathSeen.add(fullPath)
        const childPath = fullPathToChildSegment(fullPath)
        router.addRoute(ADMIN_LAYOUT_NAME, {
          path: childPath,
          name: `adm-menu-${node.id}`,
          component: resolvePage(node.component),
          meta: { menuTitle: node.name, fromMenu: true }
        })
        addedRouteNames.push(`adm-menu-${node.id}`)
      }
    }
    if (node.children?.length) {
      addMenuRoutes(router, node.children, pathSeen)
    }
  }
}

/** 与菜单动态路由并列注册的固定路由 name，用于卸载时扫表删除 */
const EXTRA_ROUTE_NAMES = [
  'orderDetail',
  'capacityCarsByDriver',
  'pricingFareRuleNew',
  'pricingFareRuleEdit',
  'admin-welcome',
  'root-redirect'
]

const extraRouteDefs = [
  {
    name: 'orderDetail',
    childPath: 'orders/:orderNo',
    fullPath: '/orders/:orderNo',
    props: true,
    loader: () => import('../features/order/views/OrderDetailView.vue')
  },
  {
    name: 'capacityCarsByDriver',
    childPath: 'capacity/drivers/:driverId/cars',
    fullPath: '/capacity/drivers/:driverId/cars',
    props: true,
    loader: () => import('../features/capacity/views/CarListView.vue')
  },
  {
    name: 'pricingFareRuleNew',
    childPath: 'pricing/fare-rules/new',
    fullPath: '/pricing/fare-rules/new',
    props: { isNew: true },
    loader: () => import('../features/pricing/views/FareRuleEditView.vue')
  },
  {
    name: 'pricingFareRuleEdit',
    childPath: 'pricing/fare-rules/:id',
    fullPath: '/pricing/fare-rules/:id',
    props: (route) => ({ id: route.params.id, isNew: false }),
    loader: () => import('../features/pricing/views/FareRuleEditView.vue')
  }
]

function removeAllDynamicRoutes(router) {
  const namesToRemove = new Set()
  for (const r of router.getRoutes()) {
    const n = r.name
    if (n == null) continue
    const ns = String(n)
    if (ns.startsWith('adm-menu-') || EXTRA_ROUTE_NAMES.includes(ns)) {
      namesToRemove.add(n)
    }
  }
  for (const n of namesToRemove) {
    try {
      if (router.hasRoute(n)) router.removeRoute(n)
    } catch {
      /* ignore */
    }
  }
  addedRouteNames.length = 0
}

/**
 * 拉取菜单并注册动态路由（含详情/编辑等附加路由）
 * @param {import('vue-router').Router} router
 */
export async function registerAdminMenuRoutes(router) {
  await loadAdminMenus({ force: true })
  adminMenus.value = Array.isArray(adminMenus.value) ? adminMenus.value : []

  removeAllDynamicRoutes(router)

  const pathSeen = new Set()
  addMenuRoutes(router, adminMenuTree.value, pathSeen)

  for (const r of extraRouteDefs) {
    const fp = normalizeMenuPath(r.fullPath)
    if (pathSeen.has(fp)) {
      console.warn('[admin] 附加路由与菜单 path 重复，跳过', fp, r.name)
      continue
    }
    pathSeen.add(fp)
    router.addRoute(ADMIN_LAYOUT_NAME, {
      path: r.childPath,
      name: r.name,
      component: r.loader,
      props: r.props
    })
    addedRouteNames.push(r.name)
  }

  const welcomeFull = '/welcome'
  if (!pathSeen.has(welcomeFull)) {
    pathSeen.add(welcomeFull)
    router.addRoute(ADMIN_LAYOUT_NAME, {
      path: 'welcome',
      name: 'admin-welcome',
      component: () => import('../features/auth/views/NoMenuView.vue'),
      meta: { title: '无菜单' }
    })
    addedRouteNames.push('admin-welcome')
  } else {
    console.warn('[admin] 菜单已占用 /welcome，省略 admin-welcome 路由')
  }

  const defaultPath = normalizeMenuPath(firstRoutablePath(adminMenuTree.value) || '/welcome')
  if (!pathSeen.has('/')) {
    pathSeen.add('/')
    router.addRoute(ADMIN_LAYOUT_NAME, {
      path: '',
      name: 'root-redirect',
      redirect: defaultPath
    })
    addedRouteNames.push('root-redirect')
  } else {
    console.warn('[admin] 菜单已占用根 path，省略 root-redirect')
  }
}

/**
 * @param {import('vue-router').Router} router
 */
export function clearAdminMenuRoutes(router) {
  removeAllDynamicRoutes(router)
  clearAdminSession()
}
