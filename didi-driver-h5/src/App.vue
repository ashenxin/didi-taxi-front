<script setup>
import { ref } from 'vue'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '')

const gwLoading = ref(false)
const gwOk = ref(null)
const gwDetail = ref('')

async function pingGateway() {
  gwLoading.value = true
  gwOk.value = null
  gwDetail.value = ''
  try {
    const resp = await fetch(`${API_BASE_URL}/actuator/health`)
    const text = await resp.text()
    gwOk.value = resp.ok
    gwDetail.value = text.slice(0, 200)
  } catch (e) {
    gwOk.value = false
    gwDetail.value = e?.message || String(e)
  } finally {
    gwLoading.value = false
  }
}
</script>

<template>
  <div class="page">
    <header class="topbar">
      <div class="brand">
        <div class="brand__dot" />
        <div class="brand__title">司机端</div>
      </div>
      <div class="topbar__meta">H5 联调壳 · 非 Vue 模板页</div>
    </header>

    <main class="content">
      <section class="card">
        <h2>说明</h2>
        <p class="muted">
          仓库里此前一直是 Vite 创建项目时的默认欢迎页，<strong>不是构建坏了</strong>。本页为最小业务壳，便于确认网关地址与连通性；听单、订单等页面需按产品继续开发。
        </p>
      </section>

      <section class="card">
        <h2>API 基址</h2>
        <p class="mono">{{ API_BASE_URL }}</p>
        <p class="muted small">司机 BFF 路径前缀：<code>/driver/api/v1</code>（经网关；调用需携带 JWT，登录流待对接）。</p>
      </section>

      <section class="card">
        <h2>网关连通</h2>
        <button type="button" class="btn" :disabled="gwLoading" @click="pingGateway">
          {{ gwLoading ? '检测中…' : 'GET /actuator/health' }}
        </button>
        <p v-if="gwOk === true" class="ok">网关可达（{{ gwDetail.slice(0, 80) }}…）</p>
        <p v-else-if="gwOk === false" class="err">失败：{{ gwDetail }}</p>
      </section>
    </main>
  </div>
</template>
