<script setup>
import { computed, reactive, ref, watch } from 'vue'

import { API_BASE_URL, clearToken, getToken, postJson, setToken } from './api'

const CITY_NAME_MAP = {
  '330100': '杭州'
}

const PRODUCT_NAME_MAP = {
  ECONOMY: '快车',
  COMFORT: '专车'
}

const fixed = reactive({
  provinceCode: '330000',
  cityCode: '330100',
  productCode: 'ECONOMY',
  origin: {
    name: '西湖景区',
    address: '杭州市西湖区龙井路附近',
    lat: 30.251612,
    lng: 120.141275
  },
  dest: {
    name: '杭州东站',
    address: '杭州市上城区全福桥路',
    lat: 30.292753,
    lng: 120.21201
  }
})

const loading = ref(false)
const lastRequest = ref(null)
const lastResponse = ref(null)
const lastError = ref(null)

const authed = ref(!!getToken())
const authTab = ref('sms')
const phone = ref('13800138000')
const password = ref('')
const smsCode = ref('')
const smsSending = ref(false)
const smsHint = ref('')

function resetLoginInputs() {
  password.value = ''
  smsCode.value = ''
  smsHint.value = ''
}

function maybeDropToLogin(err) {
  const msg = err?.message || String(err || '')
  if (msg.includes('未登录') || msg.includes('登录已失效') || msg.includes('未授权')) {
    authed.value = false
    resetLoginInputs()
  }
}

const cityName = computed(() => CITY_NAME_MAP[fixed.cityCode] || fixed.cityCode)
const productName = computed(() => PRODUCT_NAME_MAP[fixed.productCode] || fixed.productCode)

const summary = computed(() => {
  return {
    origin: `${fixed.origin.name}（${fixed.origin.lat}, ${fixed.origin.lng}）`,
    dest: `${fixed.dest.name}（${fixed.dest.lat}, ${fixed.dest.lng}）`
  }
})

async function placeOrder() {
  loading.value = true
  lastError.value = null
  lastResponse.value = null

  const payload = {
    provinceCode: fixed.provinceCode,
    cityCode: fixed.cityCode,
    productCode: fixed.productCode,
    origin: fixed.origin,
    dest: fixed.dest
  }
  lastRequest.value = payload

  try {
    lastResponse.value = await postJson('/app/api/v1/orders', payload)
  } catch (e) {
    lastError.value = e?.message || String(e)
    maybeDropToLogin(e)
  } finally {
    loading.value = false
  }
}

async function sendSms() {
  smsHint.value = ''
  smsSending.value = true
  const startedAt = Date.now()
  try {
    await postJson('/app/api/v1/auth/sms/send', { phone: phone.value })
    smsHint.value = '验证码已发送（本地 mock 会在后端日志打印 code）'
  } catch (e) {
    smsHint.value = e?.message || String(e)
  } finally {
    // 发送过快会让用户没感知，至少展示 1s 的 loading
    const elapsed = Date.now() - startedAt
    const remain = 1000 - elapsed
    if (remain > 0) {
      await new Promise((r) => setTimeout(r, remain))
    }
    smsSending.value = false
  }
}

async function loginSms() {
  loading.value = true
  lastError.value = null
  try {
    const data = await postJson('/app/api/v1/auth/login-sms', { phone: phone.value, code: smsCode.value })
    if (data?.accessToken) {
      setToken(data.accessToken)
      authed.value = true
      resetLoginInputs()
    }
  } catch (e) {
    lastError.value = e?.message || String(e)
    // 验证码错误/过期/频控：清空验证码，避免用户重复提交旧值
    smsCode.value = ''
  } finally {
    loading.value = false
  }
}

async function loginPassword() {
  loading.value = true
  lastError.value = null
  try {
    const data = await postJson('/app/api/v1/auth/login-password', { phone: phone.value, password: password.value })
    if (data?.accessToken) {
      setToken(data.accessToken)
      authed.value = true
      resetLoginInputs()
    }
  } catch (e) {
    lastError.value = e?.message || String(e)
    // 密码错误/提示改用验证码等：清空密码，避免继续提交旧值
    password.value = ''
  } finally {
    loading.value = false
  }
}

function logout() {
  clearToken()
  authed.value = false
  lastError.value = null
  lastResponse.value = null
  lastRequest.value = null
  resetLoginInputs()
}

watch(authed, (v) => {
  if (!v) resetLoginInputs()
})
</script>

<template>
  <div class="page">
    <header class="topbar">
      <div class="brand">
        <div class="brand__dot" />
        <div class="brand__title">乘客出行</div>
      </div>
      <div class="topbar__meta">H5 Demo · 静态坐标</div>
    </header>

    <main class="content">
      <section class="card" v-if="!authed">
        <div class="card__title">登录</div>
        <div class="card__desc">
          首期支持两种方式：手机号验证码登录（登录即注册）与手机号密码登录。登录成功后会保存 token 并用于后续请求。
        </div>

        <div class="tabs">
          <button class="tab" :class="{ 'tab--active': authTab === 'sms' }" @click="authTab = 'sms'">验证码登录</button>
          <button class="tab" :class="{ 'tab--active': authTab === 'pwd' }" @click="authTab = 'pwd'">密码登录</button>
        </div>

        <div class="form">
          <div class="field">
            <div class="field__label">手机号</div>
            <div class="field__value">
              <input class="input" v-model.trim="phone" placeholder="13800138000" />
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
            <button class="cta" :disabled="loading" @click="loginSms">
              <span v-if="!loading">验证码登录</span>
              <span v-else>登录中…</span>
            </button>
          </template>

          <template v-else>
            <div class="field">
              <div class="field__label">密码</div>
              <div class="field__value">
                <input class="input" type="password" v-model="password" placeholder="请输入密码" />
              </div>
              <div class="tip">若该手机号未设置密码，会提示改用验证码登录。</div>
            </div>
            <button class="cta" :disabled="loading" @click="loginPassword">
              <span v-if="!loading">密码登录</span>
              <span v-else>登录中…</span>
            </button>
          </template>

          <div class="result__block" v-if="lastError">
            <div class="badge badge--danger">提示</div>
            <div class="mono">{{ lastError }}</div>
          </div>
        </div>
      </section>

      <section class="map">
        <div class="map__grid" />
        <div class="map__overlay" />

        <div class="pin pin--origin" :title="fixed.origin.name">
          <div class="pin__label">起</div>
        </div>
        <div class="pin pin--dest" :title="fixed.dest.name">
          <div class="pin__label">终</div>
        </div>

        <div class="route" aria-hidden="true" />

        <div class="map__hint">
          <div class="hint-row">
            <span class="hint-dot hint-dot--origin" />
            <span class="hint-text">{{ summary.origin }}</span>
          </div>
          <div class="hint-row">
            <span class="hint-dot hint-dot--dest" />
            <span class="hint-text">{{ summary.dest }}</span>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card__title">确认行程</div>
        <div class="card__desc">
          点击下单会把坐标与城市信息发送到后端（`passenger-api`），用于路线规划 / 距离与 ETA 预估。
        </div>

        <div class="form">
          <div class="field">
            <div class="field__label">城市</div>
            <div class="field__value">{{ cityName }}（{{ fixed.cityCode }}）</div>
          </div>
          <div class="field">
            <div class="field__label">产品线</div>
            <div class="field__value">{{ productName }}（{{ fixed.productCode }}）</div>
          </div>
          <div class="field">
            <div class="field__label">起点</div>
            <div class="field__value">
              <div class="place">{{ fixed.origin.name }}</div>
              <div class="sub">{{ fixed.origin.address }}</div>
            </div>
          </div>
          <div class="field">
            <div class="field__label">终点</div>
            <div class="field__value">
              <div class="place">{{ fixed.dest.name }}</div>
              <div class="sub">{{ fixed.dest.address }}</div>
            </div>
          </div>
        </div>

        <div class="field__row" style="margin-top: 14px;">
          <button class="cta" :disabled="loading || !authed" @click="placeOrder">
          <span v-if="!loading">立即下单</span>
          <span v-else>正在下单…</span>
          </button>
          <button class="btn btn--ghost" v-if="authed" @click="logout">退出登录</button>
        </div>
        <div class="tip" v-if="!authed">请先登录后再下单。</div>

        <div class="result" v-if="lastRequest || lastResponse || lastError">
          <div class="result__title">调试信息</div>

          <div class="result__block" v-if="lastError">
            <div class="badge badge--danger">请求失败</div>
            <div class="mono">{{ lastError }}</div>
            <div class="tip">
              提示：目前后端还没实现该接口时会返回 404。你先看页面风格即可。
            </div>
          </div>

          <div class="result__block" v-if="lastResponse">
            <div class="badge badge--ok">下单成功</div>
            <pre class="mono">{{ JSON.stringify(lastResponse, null, 2) }}</pre>
          </div>

          <details class="result__block" v-if="lastRequest" open>
            <summary class="result__summary">
              <span class="badge badge--info">请求体</span>
              <span class="muted">POST {{ API_BASE_URL }}/app/api/v1/orders</span>
            </summary>
            <pre class="mono">{{ JSON.stringify(lastRequest, null, 2) }}</pre>
          </details>
        </div>
      </section>
    </main>

    <footer class="footer">
      <span class="muted">API Base</span>
      <span class="mono mono--inline">{{ API_BASE_URL }}</span>
    </footer>
  </div>
</template>
