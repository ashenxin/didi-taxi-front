/**
 * 将「订单管理」单层直达列表页，规范为：一级分组 + 子级「订单管理」进入列表。
 * 若后端已返回二级结构（父无 component、有 children），则不再处理。
 */
export function normalizeAdminMenuTree(menus) {
  if (!Array.isArray(menus)) return []
  return menus.map((node) => {
    if (isTopLevelOrderList(node)) {
      return wrapOrderMenuGroup(node)
    }
    return node
  })
}

function isTopLevelOrderList(node) {
  if (!node?.component) return false
  const comp = String(node.component)
  if (!comp.includes('OrderListView')) return false
  if (node.path !== '/orders') return false
  if (node.name !== '订单管理') return false
  if (node.parentId != null && node.parentId !== 0) return false
  const ch = node.children
  if (Array.isArray(ch) && ch.length > 0) return false
  return true
}

function wrapOrderMenuGroup(node) {
  const cid = node.id
  return {
    id: `order-parent-${cid}`,
    parentId: null,
    name: '订单管理',
    path: '/order-mgmt',
    icon: node.icon,
    component: null,
    perms: null,
    sort: node.sort,
    visible: node.visible !== false,
    children: [{ ...node, children: [] }]
  }
}
