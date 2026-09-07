<script setup>
import { reactive, ref, watch, onBeforeUnmount } from 'vue'
import { fetchTrips } from './tripApi'
import DriverTripDetail from './DriverTripDetail.vue'
import { statusName, tripAmount, time } from './tripPresentation'
const props = defineProps({ initialFilter: Object, initialTripId: String, refreshVersion: Number })
const emit = defineEmits(['back', 'auth-error'])
const filters = reactive({ status: 'ALL', startDate: '', endDate: '', dateField: 'ACCEPTED', ...props.initialFilter })
const rows = ref([]), total = ref(0), page = ref(1), snapshot = ref(null)
const loading = ref(false), refreshing = ref(false), error = ref(''), selected = ref(props.initialTripId || '')
let generation = 0
const tabs = [['ALL', '全部'], ['IN_PROGRESS', '进行中'], ['FINISHED', '已完成'], ['CANCELLED', '已取消']]
async function load(reset = true) {
  if (!reset && loading.value) return
  const current = ++generation
  loading.value = true; error.value = ''
  if (reset) { rows.value = []; total.value = 0; snapshot.value = null; page.value = 1 }
  const next = reset ? 1 : page.value + 1
  try {
    if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) throw new Error('开始日期不能晚于结束日期')
    const result = await fetchTrips({ ...filters, pageNo: next, pageSize: 20, snapshotId: snapshot.value })
    if (current !== generation) return
    const seen = new Set(rows.value.map(row => row.id))
    rows.value = reset ? result.list : [...rows.value, ...result.list.filter(row => !seen.has(row.id))]
    total.value = result.total; page.value = next; snapshot.value = result.snapshotId
  } catch (e) {
    if (current !== generation) return
    error.value = e.message || '行程加载失败'; emit('auth-error', e)
  } finally { if (current === generation) { loading.value = false; refreshing.value = false } }
}
function resetScroll() { requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' })) }
function showList() { selected.value = ''; load(true); resetScroll() }
function showDetail(id) { selected.value = id; resetScroll() }
watch(() => filters.status, () => load(true))
watch(() => props.refreshVersion, () => load(true))
load(true)
onBeforeUnmount(() => { generation++ })
</script>

<template>
  <div class="driver-trip-history">
    <DriverTripDetail v-if="selected" :trip-id="selected" :refresh-version="refreshVersion" @back="showList" @auth-error="emit('auth-error', $event)" @workbench="emit('back')" />
    <section v-else class="trip-surface" aria-label="行程记录">
      <header class="trip-heading"><button @click="emit('back')">‹ 工作台</button><h2>行程记录</h2><button :disabled="loading" @click="load(true)">刷新</button></header>
      <div class="trip-tabs" role="tablist" aria-label="行程状态">
        <button v-for="[code, label] in tabs" :key="code" role="tab" :aria-selected="filters.status === code" @click="filters.status = code">{{ label }}</button>
      </div>
      <form class="trip-filters" @submit.prevent="load(true)">
        <label>日期口径<select v-model="filters.dateField"><option value="ACCEPTED">接单日期</option><option value="FINISHED">完单日期</option><option value="CANCELLED">取消日期</option></select></label>
        <div class="trip-date-range"><label>开始日期<input v-model="filters.startDate" type="date" /></label><label>结束日期<input v-model="filters.endDate" type="date" /></label></div>
        <button type="submit" class="trip-primary" :disabled="loading">查询</button>
      </form>
      <p class="trip-footnote">仅记录成功接单后的服务 · 共 {{ total }} 条</p>
      <van-pull-refresh v-model="refreshing" @refresh="load(true)">
        <div class="trip-list">
          <button v-for="row in rows" :key="row.id" class="trip-list-item" @click="showDetail(row.id)">
            <div class="trip-list-top"><span class="trip-state" :data-status="row.status">{{ statusName(row.status) }}</span><time>{{ time(row.acceptedAt) }}</time></div>
            <div class="trip-route"><p><i class="trip-dot start"></i>{{ row.originAddress || '起点未记录' }}</p><p><i class="trip-dot end"></i>{{ row.destAddress || '终点未记录' }}</p></div>
            <div class="trip-list-bottom"><span>{{ row.orderNo }}</span><strong>{{ tripAmount(row) }} ›</strong></div>
          </button>
          <div v-if="error" class="trip-empty" role="alert"><p>{{ error }}</p><button @click="load(rows.length === 0)">重试</button></div>
          <p v-else-if="loading" class="trip-empty">正在加载行程…</p>
          <p v-else-if="!rows.length" class="trip-empty">当前条件下暂无行程</p>
          <button v-if="!error && rows.length < total" class="trip-load-more" :disabled="loading" @click="load(false)">加载更多</button>
          <p v-else-if="rows.length" class="trip-footnote">已显示全部记录</p>
        </div>
      </van-pull-refresh>
    </section>
  </div>
</template>
