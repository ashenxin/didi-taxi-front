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
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdminSidebarMenu from '../components/AdminSidebarMenu.vue'
import { clearAdminToken } from '../api/http'
import { fetchMe } from '../api/authApi'
import { usePendingTeamChange } from '../composables/usePendingTeamChange'
import { adminMenuTree } from '../router/dynamicRoutes'
import { teardownAdminMenuRoutes } from '../router'

const route = useRoute()
const router = useRouter()
const { pendingTeamChangeCount, refresh: refreshPendingTeamChange } = usePendingTeamChange()

const displayName = ref('')

async function loadMe() {
  try {
    const me = await fetchMe()
    displayName.value = me?.displayName || me?.username || ''
  } catch {
    displayName.value = ''
  }
}

function logout() {
  clearAdminToken()
  displayName.value = ''
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

const sidebarMenuItems = computed(() => filterVisibleSidebar(adminMenuTree.value))

const activeMenu = computed(() => {
  const p = route.path
  const paths = collectMenuPaths(adminMenuTree.value).sort((a, b) => b.length - a.length)
  for (const path of paths) {
    if (p === path || (path !== '/' && p.startsWith(path + '/'))) return path
  }
  return p
})

onMounted(() => {
  refreshPendingTeamChange()
  loadMe()
})

watch(
  () => route.fullPath,
  () => {
    refreshPendingTeamChange()
    loadMe()
  }
)
</script>
