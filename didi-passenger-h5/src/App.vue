<script setup>
import { computed, reactive, ref } from 'vue'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '')

const CITY_NAME_MAP = {
  '330100': '杭州'
}

const PRODUCT_NAME_MAP = {
  ECONOMY: '快车',
  COMFORT: '专车'
}

const fixed = reactive({
  passengerId: 1,
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
    passengerId: fixed.passengerId,
    provinceCode: fixed.provinceCode,
    cityCode: fixed.cityCode,
    productCode: fixed.productCode,
    origin: fixed.origin,
    dest: fixed.dest
  }
  lastRequest.value = payload

  try {
    const resp = await fetch(`${API_BASE_URL}/app/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    const text = await resp.text()
    let json
    try {
      json = text ? JSON.parse(text) : {}
    } catch {
      json = { raw: text }
    }

    if (!resp.ok || json.code !== 200) {
      throw new Error(json.msg || `请求失败（${resp.status}）`)
    }
    lastResponse.value = json.data
  } catch (e) {
    lastError.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}
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

        <button class="cta" :disabled="loading" @click="placeOrder">
          <span v-if="!loading">立即下单</span>
          <span v-else>正在下单…</span>
        </button>

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
