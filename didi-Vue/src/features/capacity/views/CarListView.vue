<template>
  <el-card class="page-card">
    <template #header>
      <div class="toolbar-row">
        <strong>车辆列表</strong>
        <div style="display:flex; gap: 8px; align-items:center">
          <el-tag v-if="driverName || driverPhone" type="info">司机：{{ driverName || '-' }}（{{ driverPhone || '-' }}）</el-tag>
          <el-button @click="goDrivers">返回司机</el-button>
        </div>
      </div>
    </template>

    <el-table :data="tableData" stripe style="width: 100%">
      <el-table-column prop="id" label="ID" width="90" />
      <el-table-column prop="carNo" label="车牌号" width="140" />
      <el-table-column label="省 / 市" min-width="140">
        <template #default="{ row }">
          {{ row.cityName || formatGbRegionTitle(row.provinceCode, row.cityCode) }}
        </template>
      </el-table-column>
      <el-table-column prop="brandName" label="品牌" min-width="140" />
      <el-table-column prop="vehicleType" label="车辆类型" min-width="140" />
      <el-table-column prop="ownerName" label="所有人" min-width="120" />
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          {{ carStateText(row.carState) }}
        </template>
      </el-table-column>
    </el-table>

    <div style="display:flex; justify-content:flex-end; margin-top: 16px">
      <el-pagination
        v-model:current-page="pageNo"
        v-model:page-size="pageSize"
        layout="total, sizes, prev, pager, next"
        :total="total"
        :page-sizes="[10, 20, 50]"
        @current-change="search"
        @size-change="onSizeChange"
      />
    </div>
  </el-card>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { fetchCarsByDriver } from '../api/capacityApi'
import { formatGbRegionTitle } from '../../../utils/regionCodes'

const route = useRoute()
const router = useRouter()

const pageNo = ref(1)
const pageSize = ref(10)
const total = ref(0)
const tableData = ref([])

const driverId = computed(() => route.params.driverId)
const driverName = computed(() => route.query.driverName || '')
const driverPhone = computed(() => route.query.driverPhone || '')

const carStateText = (state) => {
  if (state === 0) return '有效'
  if (state === 1) return '失效'
  return '未知'
}

const search = () => {
  if (!driverId.value) {
    ElMessage.error('缺少 driverId，无法查询车辆')
    return
  }
  fetchCarsByDriver(driverId.value, { pageNo: pageNo.value, pageSize: pageSize.value })
    .then((res) => {
      tableData.value = res.list || []
      total.value = res.total || 0
    })
    .catch((e) => ElMessage.error(e.message || '查询失败'))
}

const onSizeChange = () => {
  pageNo.value = 1
  search()
}

const goDrivers = () => {
  router.push({ path: '/capacity/drivers' })
}

onMounted(() => search())
</script>
