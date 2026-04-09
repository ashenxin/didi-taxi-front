<template>
  <div style="display: grid; gap: 16px">
    <el-card class="page-card">
      <template #header>
        <div class="toolbar-row">
          <strong>订单详情</strong>
          <el-button @click="goBack">返回列表</el-button>
        </div>
      </template>

      <div v-if="detail">
        <div class="meta-grid">
          <div class="meta-item"><div class="meta-label">订单号</div><div class="meta-value">{{ detail.orderNo }}</div></div>
          <div class="meta-item"><div class="meta-label">订单状态</div><div class="meta-value">{{ detail.statusText || statusText(detail.status) }}</div></div>
          <div class="meta-item"><div class="meta-label">产品线</div><div class="meta-value">{{ detail.productCode }}</div></div>
          <div class="meta-item"><div class="meta-label">省市</div><div class="meta-value">{{ regionTitle }}</div></div>
          <div class="meta-item"><div class="meta-label">区划编码</div><div class="meta-value">{{ divisionCodesDetail }}</div></div>
          <div class="meta-item"><div class="meta-label">乘客手机号</div><div class="meta-value">{{ detail.passengerPhone }}</div></div>
          <div class="meta-item"><div class="meta-label">司机ID</div><div class="meta-value">{{ detail.driverId ?? '-' }}</div></div>
          <div class="meta-item"><div class="meta-label">车辆ID</div><div class="meta-value">{{ detail.carId ?? '-' }}</div></div>
          <div class="meta-item"><div class="meta-label">公司ID</div><div class="meta-value">{{ detail.companyId ?? '-' }}</div></div>
          <div class="meta-item"><div class="meta-label">预估金额</div><div class="meta-value">{{ detail.estimatedAmount }}</div></div>
          <div class="meta-item"><div class="meta-label">最终金额</div><div class="meta-value">{{ detail.finalAmount }}</div></div>
          <div class="meta-item"><div class="meta-label">下单时间</div><div class="meta-value">{{ detail.createdAt }}</div></div>
        </div>

        <el-divider />

        <el-descriptions :column="1" border>
          <el-descriptions-item label="起点地址">{{ detail.originAddress }}</el-descriptions-item>
          <el-descriptions-item label="终点地址">{{ detail.destAddress }}</el-descriptions-item>
          <el-descriptions-item label="接单时间">{{ detail.acceptedAt }}</el-descriptions-item>
          <el-descriptions-item label="出发时间">{{ detail.startedAt }}</el-descriptions-item>
          <el-descriptions-item label="完单时间">{{ detail.finishedAt }}</el-descriptions-item>
          <el-descriptions-item label="取消原因">{{ detail.cancelReason }}</el-descriptions-item>
        </el-descriptions>
      </div>
      <el-empty v-else description="未找到订单详情" />
    </el-card>

    <el-card class="page-card">
      <template #header>
        <strong>订单事件时间线</strong>
      </template>
      <el-timeline v-if="detail">
        <el-timeline-item
          v-for="event in detail.events"
          :key="`${event.occurredAt || event.createdAt || ''}-${event.id ?? ''}-${event.eventType}`"
          :timestamp="event.occurredAt || event.createdAt"
          placement="top"
        >
          <el-card>
            <div><strong>{{ event.eventTypeText || eventTypeText(event.eventType) }}</strong></div>
            <div>状态流转：{{ event.fromStatusText || statusText(event.fromStatus) }} -> {{ event.toStatusText || statusText(event.toStatus) }}</div>
            <div>操作人：{{ event.operatorDisplay }}</div>
            <div>原因：{{ event.reasonDesc || '-' }}</div>
          </el-card>
        </el-timeline-item>
      </el-timeline>
      <el-empty v-else description="暂无事件" />
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { eventTypeText, statusText } from '../constants/enums'
import { fetchOrderDetail } from '../api/orderApi'
import { formatGbDivisionCodesDetail, formatGbRegionTitle } from '../../../utils/regionCodes'

const route = useRoute()
const router = useRouter()

const detail = ref(null)
const regionTitle = computed(() =>
  detail.value ? formatGbRegionTitle(detail.value.provinceCode, detail.value.cityCode) : ''
)
const divisionCodesDetail = computed(() =>
  detail.value
    ? formatGbDivisionCodesDetail(detail.value.provinceCode, detail.value.cityCode)
    : ''
)

/** 与后端一致：按业务发生时间 occurredAt 升序，同刻用 id 稳定排序 */
const sortEventsByOccurredAt = (list) => {
  const timeMs = (e) => {
    const s = e.occurredAt || e.createdAt
    if (!s) return Number.MAX_SAFE_INTEGER
    const t = new Date(s).getTime()
    return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t
  }
  return [...list].sort((a, b) => {
    const d = timeMs(a) - timeMs(b)
    if (d !== 0) return d
    return (a.id ?? 0) - (b.id ?? 0)
  })
}

const loadDetail = async () => {
  try {
    const res = await fetchOrderDetail(route.params.orderNo)
    const mapped = (res.events || []).map((event) => ({
      ...event,
      operatorDisplay: `${event.operatorTypeText || operatorTypeText(event.operatorType)}(${event.operatorId ?? '-'})`
    }))
    const events = sortEventsByOccurredAt(mapped)
    detail.value = {
      ...res.order,
      events
    }
  } catch (e) {
    ElMessage.error(e.message || '查询详情失败')
    detail.value = null
  }
}

const operatorTypeText = (type) => {
  const map = {
    0: '系统',
    1: '乘客',
    2: '司机',
    3: '客服'
  }
  return map[type] ?? '未知'
}

const goBack = () => {
  router.push('/orders')
}

onMounted(() => {
  loadDetail()
})
</script>
