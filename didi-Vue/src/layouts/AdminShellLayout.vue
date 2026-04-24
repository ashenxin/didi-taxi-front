<template>
  <el-container class="layout-root">
    <el-aside width="220px" class="layout-aside">
      <div class="logo">didi 管理后台</div>
      <el-menu
        :default-active="activeMenu"
        router
        background-color="#111827"
        text-color="#d1d5db"
        active-text-color="#ffffff"
      >
        <AdminSidebarMenu :items="sidebarMenuItems" :pending-team-change-count="pendingTeamChangeCount" />
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="layout-header">
        <div class="header-title">后台管理平台</div>
        <el-button type="info" link class="header-user" @click="logout">
          {{ displayName ? `${displayName} · 退出` : '退出登录' }}
        </el-button>
      </el-header>
      <el-main class="layout-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdminSidebarMenu from '../components/AdminSidebarMenu.vue'
import { logoutAdmin, adminMe, refreshPendingTeamChangeCount, pendingTeamChangeCount, loadAdminMe } from '../stores/adminSession'
import { adminMenuTree } from '../router/dynamicRoutes'
import { teardownAdminMenuRoutes } from '../router'

const route = useRoute()
const router = useRouter()

const displayName = computed(() => adminMe.value?.displayName || adminMe.value?.username || '')

/**
 * 侧栏“固定入口”：
 * - 不依赖后端菜单更新（避免新增页面发布后侧栏看不到）
 * - 仍然走 router.addRoute 注册的 extra routes（见 router/dynamicRoutes.js）
 */
const EXTRA_SIDEBAR_ITEMS = Object.freeze([
  {
    id: 'extra-capacity-cars',
    name: '车辆查询',
    path: '/capacity/cars',
    component: 'capacity/CarSearchListView.vue',
    visible: 1,
    children: []
  }
])

const fullMenuTree = computed(() => {
  const base = Array.isArray(adminMenuTree.value) ? adminMenuTree.value : []
  return [...base, ...EXTRA_SIDEBAR_ITEMS]
})

function logout() {
  logoutAdmin()
  teardownAdminMenuRoutes()
  router.replace({ path: '/login' })
}

function collectMenuPaths(nodes, acc = []) {
  if (!nodes?.length) return acc
  for (const n of nodes) {
    if (n.path) acc.push(n.path)
    collectMenuPaths(n.children, acc)
  }
  return acc
}

function filterVisibleSidebar(nodes) {
  if (!Array.isArray(nodes) || !nodes.length) return []
  const out = []
  for (const n of nodes) {
    if (!n.visible) continue
    const children = filterVisibleSidebar(n.children || [])
    if (children.length) {
      out.push({ ...n, children })
    } else if (n.component && n.path) {
      out.push({ ...n, children: [] })
    }
  }
  return out
}

const sidebarMenuItems = computed(() => filterVisibleSidebar(fullMenuTree.value))

const activeMenu = computed(() => {
  const p = route.path
  const paths = collectMenuPaths(fullMenuTree.value).sort((a, b) => b.length - a.length)
  for (const path of paths) {
    if (p === path || (path !== '/' && p.startsWith(path + '/'))) return path
  }
  return p
})

onMounted(() => {
  refreshPendingTeamChangeCount({ force: true })
  loadAdminMe({ force: true }).catch(() => {})
})

watch(
  () => route.fullPath,
  () => {
    refreshPendingTeamChangeCount()
    loadAdminMe().catch(() => {})
  }
)
</script>
