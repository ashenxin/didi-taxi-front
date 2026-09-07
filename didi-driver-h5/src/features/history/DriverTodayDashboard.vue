<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { showDialog } from 'vant'
import { fetchToday } from './tripApi'
import { money, duration, distance, shanghaiDate } from './tripPresentation'
const props = defineProps({ refreshVersion: Number })
const emit = defineEmits(['open-history', 'open-trip', 'auth-error'])
const data = ref(null), loading = ref(false), error = ref('')
let generation = 0, retryTimer, dayTimer, attempts = 0
async function load(reset = true) {
  clearTimeout(retryTimer)
  if (reset) attempts = 0
  const current = ++generation
  loading.value = true; error.value = ''
  try {
    const result = await fetchToday()
    if (current !== generation) return
    data.value = result
    if (result.unpricedCount > result.abnormalSettlementCount && attempts++ < 6)
      retryTimer = setTimeout(() => load(false), 5000)
  } catch (e) {
    if (current !== generation) return
    error.value = e.message || '今日数据加载失败'; emit('auth-error', e)
  } finally { if (current === generation) loading.value = false }
}
function open(status) {
  const date = data.value?.businessDate || shanghaiDate()
  emit('open-history', { status, dateField: status === 'CANCELLED' ? 'CANCELLED' : 'FINISHED', startDate: date, endDate: date })
}
function showCancelRule() {
  showDialog({
    title: '取消行程统计规则',
    message: '仅统计司机成功接单后发生的取消。司机拒绝接单、确认超时、未接单指派，以及乘客在司机接单前取消，均不计入取消行程；接单后由司机或乘客取消会计入。',
    confirmButtonText: '知道了',
  })
}
function visible() { if (document.visibilityState === 'visible') load() }
watch(() => props.refreshVersion, () => load(), { immediate: true })
onMounted(() => {
  document.addEventListener('visibilitychange', visible)
  dayTimer = setInterval(() => { if (document.visibilityState === 'visible' && data.value && data.value.businessDate !== shanghaiDate()) load() }, 30000)
})
onBeforeUnmount(() => { generation++; clearTimeout(retryTimer); clearInterval(dayTimer); document.removeEventListener('visibilitychange', visible) })
</script>

<template>
  <section class="trip-surface today-dashboard" aria-label="今日运营看板">
    <header class="trip-heading"><div><h2>今日运营</h2><p>{{ data?.businessDate || shanghaiDate() }} · 上海时间</p></div><button :disabled="loading" @click="load()">{{ loading ? '刷新中' : '刷新' }}</button></header>
    <div v-if="error" class="trip-notice" role="alert">{{ error }} <button @click="load()">重试</button><span v-if="data"> · 当前展示上次数据</span></div>
    <template v-if="data">
      <div class="today-metrics">
        <button class="today-amount" @click="open('FINISHED')"><span>订单金额</span><strong>{{ money(data.orderAmount) }}</strong><small>优惠前车费</small></button>
        <button @click="open('FINISHED')"><span>完成行程</span><strong>{{ data.completedCount }} <small>单</small></strong></button>
        <div class="today-cancel-card">
          <button class="today-cancel-main" @click="open('CANCELLED')"><span>取消行程</span><strong>{{ data.cancelledCount }} <small>单</small></strong></button>
          <button class="today-rule-help" type="button" aria-label="查看取消行程统计规则" @click="showCancelRule">?</button>
        </div>
        <button @click="open('FINISHED')"><span>行程里程</span><strong class="today-small">{{ distance(data.distanceMeters) }}</strong></button>
        <button @click="open('FINISHED')"><span>服务时长</span><strong class="today-small">{{ duration(data.serviceDurationSeconds) }}</strong></button>
      </div>
      <p v-if="data.unpricedCount || data.abnormalSettlementCount" class="trip-notice">{{ data.unpricedCount }} 单尚未计价，{{ data.abnormalSettlementCount }} 单结算异常；待处理金额未计入。</p>
      <p v-if="data.missingDistanceCount || data.missingDurationCount" class="trip-notice">{{ data.missingDistanceCount }} 单缺少里程，{{ data.missingDurationCount }} 单缺少服务时长。</p>
      <p class="trip-footnote">金额包含已计价的待支付行程，不代表司机净收入。当前路线里程为模拟数据。</p>
      <button v-if="data.latestTrip" class="today-latest" @click="emit('open-trip', data.latestTrip.id)"><span>最近完成 <b>{{ data.latestTrip.destAddress || '目的地未记录' }}</b></span><span>查看详情 ›</span></button>
      <p v-else class="trip-footnote">今天还没有已完成行程</p>
    </template>
    <p v-else-if="loading" class="trip-empty">正在读取今日数据…</p>
  </section>
</template>
