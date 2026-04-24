<template>
  <el-card class="page-card">
    <template #header>
      <div class="toolbar-row">
        <strong>车辆列表（独立查询）</strong>
        <div style="display:flex; gap: 8px; align-items:center">
          <el-button @click="reload">刷新</el-button>
        </div>
      </div>
    </template>

    <el-form :model="query" inline class="filter-form" @submit.prevent>
      <el-form-item label="车牌号">
        <el-input v-model="query.carNo" placeholder="模糊匹配" clearable style="width: 160px" />
      </el-form-item>
      <el-form-item label="司机ID">
        <el-input v-model="query.driverId" placeholder="精确" clearable style="width: 140px" />
      </el-form-item>
      <el-form-item label="司机手机">
        <el-input v-model="query.driverPhone" placeholder="模糊匹配" clearable style="width: 160px" />
      </el-form-item>
      <el-form-item label="公司ID">
        <el-input v-model="query.companyId" placeholder="精确" clearable style="width: 140px" />
      </el-form-item>
      <el-form-item label="省/市">
        <ProvinceCityCascader
          v-model:province-code="query.provinceCode"
          v-model:city-code="query.cityCode"
          placeholder="省 / 市"
        />
      </el-form-item>
      <el-form-item label="品牌名称">
        <el-input v-model="query.brandName" placeholder="模糊匹配" clearable style="width: 160px" />
      </el-form-item>
      <el-form-item label="运力类型">
        <el-input v-model="query.rideTypeId" placeholder="例如 1/2" clearable style="width: 140px" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" native-type="button" @click="onSearch">查询</el-button>
        <el-button native-type="button" @click.prevent="reset">重置</el-button>
      </el-form-item>
    </el-form>

    <el-table :data="tableData" stripe style="width: 100%">
      <el-table-column prop="id" label="ID" width="90" />
      <el-table-column prop="carNo" label="车牌号" width="140" />
      <el-table-column label="省 / 市" min-width="140">
        <template #default="{ row }">
          {{ row.cityName || formatGbRegionTitle(row.provinceCode, row.cityCode) }}
        </template>
      </el-table-column>
      <el-table-column prop="brandName" label="品牌" min-width="140" show-overflow-tooltip />
      <el-table-column prop="rideTypeId" label="运力类型" width="110" />
      <el-table-column prop="businessTypeId" label="业务类型" width="110" />
      <el-table-column label="司机" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">
          {{ row.driverName || '—' }}（{{ row.driverPhone || '—' }}）
        </template>
      </el-table-column>
      <el-table-column label="公司/车队" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">
          <div>{{ row.companyName || '—' }}</div>
          <div class="muted">{{ row.team || '' }}</div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          {{ carStateText(row.carState) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">详情</el-button>
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

    <el-dialog v-model="detailVisible" title="车辆详情" width="520px" destroy-on-close>
      <template v-if="detailLoading">
        <div style="padding: 8px 0">加载中…</div>
      </template>
      <template v-else>
        <el-descriptions v-if="detail" :column="1" border>
          <el-descriptions-item label="车辆ID">{{ detail.id }}</el-descriptions-item>
          <el-descriptions-item label="车牌号">{{ detail.carNo || '—' }}</el-descriptions-item>
          <el-descriptions-item label="城市">{{ detail.cityName || formatGbRegionTitle(detail.provinceCode, detail.cityCode) }}</el-descriptions-item>
          <el-descriptions-item label="品牌">{{ detail.brandName || '—' }}</el-descriptions-item>
          <el-descriptions-item label="车辆类型">{{ detail.vehicleType || '—' }}</el-descriptions-item>
          <el-descriptions-item label="运力类型">{{ detail.rideTypeId || '—' }}</el-descriptions-item>
          <el-descriptions-item label="业务类型">{{ detail.businessTypeId || '—' }}</el-descriptions-item>
          <el-descriptions-item label="司机">{{ detail.driverName || '—' }}（{{ detail.driverPhone || '—' }}）</el-descriptions-item>
          <el-descriptions-item label="公司">{{ detail.companyName || '—' }}</el-descriptions-item>
          <el-descriptions-item label="车队">{{ detail.team || '—' }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ carStateText(detail.carState) }}</el-descriptions-item>
        </el-descriptions>
        <el-empty v-else description="暂无数据" />
      </template>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { nextTick, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import ProvinceCityCascader from '../../../components/ProvinceCityCascader.vue'
import { fetchCarDetail, fetchCarPage } from '../api/capacityApi'
import { formatGbRegionTitle } from '../../../utils/regionCodes'

const pageNo = ref(1)
const pageSize = ref(10)
const total = ref(0)
const tableData = ref([])

const query = reactive({
  carNo: '',
  driverId: '',
  driverPhone: '',
  companyId: '',
  provinceCode: '',
  cityCode: '',
  brandName: '',
  rideTypeId: ''
})

const carStateText = (state) => {
  if (state === 0) return '有效'
  if (state === 1) return '失效'
  if (state === null || state === undefined || state === '') return '—'
  return '未知'
}

function toLongOrUndefined(v) {
  const s = String(v ?? '').trim()
  if (!s) return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

const search = () => {
  fetchCarPage({
    pageNo: pageNo.value,
    pageSize: pageSize.value,
    carNo: query.carNo || undefined,
    driverId: toLongOrUndefined(query.driverId),
    driverPhone: query.driverPhone || undefined,
    companyId: toLongOrUndefined(query.companyId),
    provinceCode: query.provinceCode || undefined,
    cityCode: query.cityCode || undefined,
    brandName: query.brandName || undefined,
    rideTypeId: query.rideTypeId || undefined
  })
    .then((res) => {
      tableData.value = res.list || []
      total.value = res.total || 0
    })
    .catch((e) => ElMessage.error(e.message || '查询失败'))
}

const onSearch = () => {
  pageNo.value = 1
  search()
}

const onSizeChange = () => {
  pageNo.value = 1
  search()
}

const reset = async () => {
  query.carNo = ''
  query.driverId = ''
  query.driverPhone = ''
  query.companyId = ''
  query.provinceCode = ''
  query.cityCode = ''
  query.brandName = ''
  query.rideTypeId = ''
  pageNo.value = 1
  pageSize.value = 10
  await nextTick()
  search()
}

const reload = () => search()

const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref(null)

const openDetail = async (row) => {
  if (!row?.id) return
  detailVisible.value = true
  detailLoading.value = true
  detail.value = null
  try {
    detail.value = await fetchCarDetail(row.id)
  } catch (e) {
    ElMessage.error(e.message || '加载失败')
  } finally {
    detailLoading.value = false
  }
}

onMounted(() => search())
</script>

<style scoped>
.filter-form {
  margin-bottom: 8px;
}
.muted {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}
</style>

