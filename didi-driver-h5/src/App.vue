<script setup>
import { computed, ref } from 'vue'

import { API_BASE_URL, getJson } from './api/http'
import { useAuth } from './features/auth/useAuth'

const {
  authed,
  authTab,
  showRegister,
  phone,
  password,
  smsCode,
  authLoading,
  smsSending,
  smsHint,
  authError,
  openRegister,
  backToLogin,
  sendSms,
  loginSms,
  loginPassword,
  registerSms,
  registerPassword,
  logout,
  maybeDropToLogin,
} = useAuth()

const assignedLoading = ref(false)
const assigned = ref([])
const assignedError = ref('')

const pageTitle = computed(() => (authed.value ? '司机工作台' : '司机端登录'))

async function loadAssigned() {
  assignedLoading.value = true
  assignedError.value = ''
  try {
    assigned.value = (await getJson('/driver/api/v1/orders/assigned')) || []
  } catch (e) {
    assignedError.value = e?.message || String(e)
    maybeDropToLogin(e)
  } finally {
    assignedLoading.value = false
  }
}

function logoutAll() {
  assigned.value = []
  assignedError.value = ''
  logout()
}
</script>

<template>
  <div class="page">
    <header class="topbar">
      <div class="brand">
        <div class="brand__dot" />
        <div class="brand__title">{{ pageTitle }}</div>
      </div>
      <div class="topbar__meta">司机端 · 工具版</div>
    </header>

    <main class="content">
      <section class="card card--panel" v-if="!authed">
        <div class="card__title">{{ showRegister ? '注册' : '登录' }}</div>
        <div class="card__desc">
          司机端支持两种方式：手机号验证码、手机号密码。成功后会保存 token。<span class="mono">{{ API_BASE_URL }}</span>
        </div>

        <div class="tabs">
          <button class="tab" :class="{ 'tab--active': authTab === 'sms' }" @click="authTab = 'sms'">验证码</button>
          <button class="tab" :class="{ 'tab--active': authTab === 'pwd' }" @click="authTab = 'pwd'">密码</button>
        </div>

        <div class="form">
          <div class="field">
            <div class="field__label">手机号</div>
            <div class="field__value">
              <input class="input" v-model.trim="phone" placeholder="13900000000" />
            </div>
          </div>

          <template v-if="authTab === 'sms'">
            <div class="field">
              <div class="field__label">验证码</div>
              <div class="field__value field__row">
                <input class="input" v-model.trim="smsCode" placeholder="123456" />
                <button class="btn" :disabled="smsSending" @click="sendSms">
                  <span v-if="!smsSending">发送验证码</span>
                  <span v-else>发送中…</span>
                </button>
              </div>
              <div class="tip tip--full tip--center" v-if="smsHint">{{ smsHint }}</div>
            </div>

            <button class="cta" :disabled="authLoading" v-if="!showRegister" @click="loginSms">
              <span v-if="!authLoading">验证码登录</span>
              <span v-else>登录中…</span>
            </button>
            <button class="cta" :disabled="authLoading" v-else @click="registerSms">
              <span v-if="!authLoading">验证码注册</span>
              <span v-else>注册中…</span>
            </button>
          </template>

          <template v-else>
            <div class="field">
              <div class="field__label">密码</div>
              <div class="field__value">
                <input class="input" type="password" v-model="password" placeholder="请输入密码" />
              </div>
              <div class="tip">若未设置密码，会提示改用验证码登录或先注册设置密码。</div>
            </div>

            <template v-if="showRegister">
              <div class="field">
                <div class="field__label">验证码</div>
                <div class="field__value field__row">
                  <input class="input" v-model.trim="smsCode" placeholder="123456" />
                  <button class="btn" :disabled="smsSending" @click="sendSms">
                    <span v-if="!smsSending">发送验证码</span>
                    <span v-else>发送中…</span>
                  </button>
                </div>
                <div class="tip tip--full tip--center" v-if="smsHint">{{ smsHint }}</div>
              </div>
            </template>

            <button class="cta" :disabled="authLoading" v-if="!showRegister" @click="loginPassword">
              <span v-if="!authLoading">密码登录</span>
              <span v-else>登录中…</span>
            </button>
            <button class="cta" :disabled="authLoading" v-else @click="registerPassword">
              <span v-if="!authLoading">密码注册</span>
              <span v-else>注册中…</span>
            </button>
          </template>

          <div class="err" v-if="authError">{{ authError }}</div>

          <div class="footer-actions">
            <template v-if="!showRegister">
              <div class="footer-actions__hint">如无账号，请先注册</div>
              <button class="link" type="button" @click="openRegister">去注册</button>
            </template>
            <template v-else>
              <div class="footer-actions__hint">已有账号？</div>
              <button class="link" type="button" @click="backToLogin">返回登录</button>
            </template>
          </div>
        </div>
      </section>

      <section class="card card--panel" v-else>
        <div class="card__title">工作台（联调）</div>
        <div class="card__desc">
          登录成功后可调用司机业务接口（需携带 token，经网关注入 <code>X-User-Id</code>）。
        </div>

        <div class="row">
          <button class="btn" :disabled="assignedLoading" @click="loadAssigned">
            {{ assignedLoading ? '加载中…' : '拉取指派单' }}
          </button>
          <button class="btn btn--ghost" @click="logoutAll">退出登录</button>
        </div>

        <div class="tip" v-if="assigned && assigned.length === 0">暂无指派单（order 服务未启动时可能返回 502）。</div>
        <pre class="mono pre" v-if="assigned && assigned.length">{{ JSON.stringify(assigned, null, 2) }}</pre>
        <div class="err" v-if="assignedError">{{ assignedError }}</div>
      </section>
    </main>
  </div>
</template>
