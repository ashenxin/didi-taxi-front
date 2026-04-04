<template>
  <template v-for="item in items" :key="item.id">
    <el-sub-menu v-if="hasChildMenu(item)" :index="subMenuIndex(item)">
      <template #title>{{ item.name }}</template>
      <AdminSidebarMenu :items="item.children" :pending-team-change-count="pendingTeamChangeCount" />
    </el-sub-menu>
    <el-menu-item v-else :index="item.path">
      <span v-if="item.path === '/capacity/team-change-requests'" class="menu-item-with-badge">
        <span class="menu-item-with-badge__label">{{ item.name }}</span>
        <span
          v-if="pendingTeamChangeCount > 0"
          class="menu-pending-count"
          :title="`待审核 ${pendingTeamChangeCount} 条`"
        >{{ pendingTeamChangeCount }}</span>
      </span>
      <span v-else>{{ item.name }}</span>
    </el-menu-item>
  </template>
</template>

<script setup>
import AdminSidebarMenu from './AdminSidebarMenu.vue'

defineProps({
  items: { type: Array, default: () => [] },
  pendingTeamChangeCount: { type: Number, default: 0 }
})

function hasChildMenu(item) {
  return Array.isArray(item.children) && item.children.length > 0
}

function subMenuIndex(item) {
  return item.path || `sub-${item.id}`
}
</script>
