<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { showToast } from 'vant'
import { fetchTrip } from './tripApi'
import { money, duration, distance, time, statusName, settlementName, cancelName, cancelReason, needsSettlementRefresh } from './tripPresentation'
const props = defineProps({ tripId: { type: String, required: true }, refreshVersion: Number })
const emit = defineEmits(['back', 'auth-error', 'workbench'])
const detail = ref(null), loading = ref(false), error = ref('')
let generation = 0, timer, attempts = 0
function stop() { clearTimeout(timer); timer = null }
async function load(reset = false) {
  stop()
  if (reset) attempts = 0
  const current = ++generation
  loading.value = true; error.value = ''
  try {
    const result = await fetchTrip(props.tripId)
    if (current !== generation) return
    detail.value = result
    if (needsSettlementRefresh(result) && attempts++ < 6) timer = setTimeout(() => load(), 5000)
  } catch (e) {
    if (current !== generation) return
    detail.value = null; error.value = e.message || '行程加载失败'
    emit('auth-error', e)
  } finally { if (current === generation) loading.value = false }
}
watch(() => props.tripId, () => { detail.value = null; load(true) }, { immediate: true })
watch(() => props.refreshVersion, () => load(true))
onBeforeUnmount(() => { generation++; stop() })
</script>

<template>
  <section class="trip-detail trip-surface" aria-label="行程详情">
    <header class="trip-heading">
      <button @click="emit('back')">‹ 返回记录</button><h2>行程详情</h2>
      <button :disabled="loading" @click="load(true)">{{ loading ? '刷新中' : '刷新' }}</button>
    </header>
    <div v-if="error" class="trip-empty" role="alert"><p>{{ error }}</p><button @click="load(true)">重新加载</button></div>
    <p v-else-if="!detail" class="trip-empty">正在读取行程…</p>
    <template v-else>
      <div class="trip-detail-hero">
        <span class="trip-state" :data-status="detail.status">{{ statusName(detail.status) }}</span>
        <strong v-if="detail.status === 5">{{ detail.finalAmount == null ? '结算中' : money(detail.finalAmount) }}</strong>
        <p v-if="detail.status === 5">订单金额 · {{ settlementName(detail) }}</p>
        <p class="trip-order-no">订单 {{ detail.orderNo }}</p>
      </div>
      <div class="trip-route"><p><i class="trip-dot start"></i>{{ detail.originAddress || '起点未记录' }}</p><p><i class="trip-dot end"></i>{{ detail.destAddress || '终点未记录' }}</p></div>
      <div v-if="detail.status === 6" class="trip-notice">{{ cancelName(detail.cancelBy) }} · {{ cancelReason(detail.cancelReason) }}</div>
      <dl class="trip-facts">
        <div><dt>城市 / 产品</dt><dd>{{ detail.cityCode || '未记录' }} / {{ detail.productCode || '未记录' }}</dd></div>
        <div><dt>当次服务车辆</dt><dd>{{ detail.carId ? '车辆 #' + detail.carId : '未记录' }}</dd></div>
        <div><dt>当次所属车队</dt><dd>{{ detail.companyId ? '车队 #' + detail.companyId : '未记录' }}</dd></div>
        <div v-if="detail.status !== 6"><dt>行程里程</dt><dd>{{ distance(detail.distanceMeters) }}</dd></div>
        <div v-if="detail.status === 5"><dt>服务时长</dt><dd>{{ duration(detail.serviceDurationSeconds) }}</dd></div>
        <div v-if="detail.status === 5"><dt>计费时长</dt><dd>{{ duration(detail.billingDurationSeconds) }}</dd></div>
      </dl>
      <p v-if="detail.status !== 6 && detail.distanceSource === 'LOCAL_MOCK_ROUTE'" class="trip-footnote">里程为模拟路线数据，计费时长使用结算冻结值。</p>
      <h3>本次行程时间线</h3>
      <ol class="trip-timeline">
        <li v-for="item in [['下单', detail.orderedAt], ['接单', detail.acceptedAt], ['到达', detail.arrivedAt], ['开始', detail.startedAt], ['完成', detail.finishedAt], ['取消', detail.cancelledAt]].filter(item => item[1])" :key="item[0]">
          <span>{{ item[0] }}</span><time>{{ time(item[1]) }}</time>
        </li>
      </ol>
      <template v-if="detail.status !== 6">
        <h3>费用明细</h3>
        <dl class="trip-facts">
          <div><dt>预估车费</dt><dd>{{ money(detail.estimatedAmount) }}</dd></div>
          <template v-if="detail.status === 5">
            <div><dt>最终车费</dt><dd>{{ detail.finalAmount == null ? '结算中' : money(detail.finalAmount) }}</dd></div>
            <div><dt>优惠减免</dt><dd>{{ detail.finalAmount == null ? '待计算' : money(detail.discountAmount) }}</dd></div>
            <div><dt>乘客应付</dt><dd>{{ detail.finalAmount == null ? '待计算' : money(detail.payableAmount) }}</dd></div>
            <div><dt>已支付</dt><dd>{{ money(detail.paidAmount) }}</dd></div>
          </template>
        </dl>
        <p class="trip-footnote">订单金额为优惠前最终车费。车队分成尚未计算，不代表司机净收入。</p>
      </template>
      <button v-if="[2,3,4].includes(detail.status)" class="trip-primary" @click="emit('workbench')">返回工作台处理行程</button>
      <button class="trip-help" @click="showToast('如对此行程有疑问，请通过平台客服渠道联系，并提供订单号。')">对此行程有疑问</button>
    </template>
  </section>
</template>
