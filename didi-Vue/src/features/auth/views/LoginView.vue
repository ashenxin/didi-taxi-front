<template>
  <div class="login-page">
    <div class="login-card">
      <h1 class="login-title">didi 管理后台</h1>
      <p class="login-sub">请使用后台账号登录</p>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="onSubmit">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" autocomplete="username" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            autocomplete="current-password"
          />
        </el-form-item>
        <el-button type="primary" class="login-submit" native-type="submit" :loading="loading">
          登录
        </el-button>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { login } from '../api/authApi'

const route = useRoute()
const router = useRouter()

const formRef = ref(null)
const loading = ref(false)
const form = reactive({
  username: '',
  password: ''
})

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

async function onSubmit() {
  await formRef.value?.validate().catch(() => Promise.reject())
  loading.value = true
  try {
    await login(form.username.trim(), form.password)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.replace(redirect || '/')
  } catch (e) {
    ElMessage.error(e?.message || '登录失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(160deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
}

.login-card {
  width: 100%;
  max-width: 400px;
  padding: 2rem 2.25rem;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.45);
}

.login-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: #f8fafc;
  letter-spacing: 0.02em;
}

.login-sub {
  margin: 0.35rem 0 1.5rem;
  font-size: 0.9rem;
  color: #94a3b8;
}

.login-submit {
  width: 100%;
  margin-top: 0.5rem;
}

.login-card :deep(.el-form-item__label) {
  color: #cbd5e1;
}

.login-card :deep(.el-input__wrapper) {
  background-color: rgba(30, 41, 59, 0.9);
  box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.25) inset;
}
</style>
