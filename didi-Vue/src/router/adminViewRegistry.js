const viewModules = import.meta.glob('../features/**/views/**/*.vue')

function pick(relPathUnderFeatures) {
  const key = `../features/${relPathUnderFeatures}`
  return viewModules[key] || null
}

/**
 * 后端菜单字段 `component` 白名单映射表。
 * - key：后端下发的 component（历史兼容：沿用原 views 下的相对路径）
 * - value：前端实际允许加载的页面组件
 */
export const ADMIN_VIEW_REGISTRY = Object.freeze({
  'auth/NoMenuView.vue': pick('auth/views/NoMenuView.vue'),

  'capacity/CompanyListView.vue': pick('capacity/views/CompanyListView.vue'),
  'capacity/DriverListView.vue': pick('capacity/views/DriverListView.vue'),
  'capacity/CarListView.vue': pick('capacity/views/CarListView.vue'),
  'capacity/TeamChangeListView.vue': pick('capacity/views/TeamChangeListView.vue'),

  'order/OrderListView.vue': pick('order/views/OrderListView.vue'),
  'order/OrderDetailView.vue': pick('order/views/OrderDetailView.vue'),

  'pricing/FareRuleListView.vue': pick('pricing/views/FareRuleListView.vue'),
  'pricing/FareRuleEditView.vue': pick('pricing/views/FareRuleEditView.vue'),

  'system/AdminUserListView.vue': pick('system/views/AdminUserListView.vue')
})

export function resolveAdminView(component) {
  const k = String(component || '').trim()
  if (!k) return null
  const loader = ADMIN_VIEW_REGISTRY[k]
  if (!loader) return null
  return loader
}

