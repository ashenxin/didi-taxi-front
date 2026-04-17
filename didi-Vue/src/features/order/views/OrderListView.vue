<template>
  <el-card class="page-card">
    <template #header>
      <div class="toolbar-row">
        <strong>订单管理</strong>
        <el-button type="primary" plain>导出（MVP后续）</el-button>
      </div>
    </template>

    <el-form :model="query" inline @submit.prevent>
      <el-form-item label="订单号">
        <el-input v-model="query.orderNo" placeholder="请输入订单号" clearable />
      </el-form-item>
      <el-form-item label="乘客手机号">
        <el-input v-model="query.phone" placeholder="请输入手机号（精确）" clearable />
      </el-form-item>
      <el-form-item label="省市">
        <ProvinceCityCascader v-model:province-code="query.provinceCode" v-model:city-code="query.cityCode" />
      </el-form-item>
      <el-form-item label="订单状态">
        <el-select v-model="query.status" placeholder="全部状态" clearable style="width: 160px">
          <el-option
            v-for="item in STATUS_OPTIONS"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="下单时间">
        <el-date-picker
          v-model="query.createdAtRange"
          type="datetimerange"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
          range-separator="至"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" native-type="button" @click="search">查询</el-button>
        <el-button native-type="button" @click.prevent="reset">重置</el-button>
      </el-form-item>
    </el-form>

    <el-table :data="tableData" stripe>
      <el-table-column prop="orderNo" label="订单号" min-width="180" />
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          {{ row.statusText || statusText(row.status) }}
        </template>
      </el-table-column>
      <el-table-column label="省 / 市" min-width="160">
        <template #default="{ row }">
          <span :title="formatGbRegionDisplayName(row.provinceCode, row.cityCode)">
            {{ formatGbRegionDisplayName(row.provinceCode, row.cityCode) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="productCode" label="产品线" width="100" />
      <el-table-column prop="driverId" label="司机ID" width="100" />
      <el-table-column prop="createdAt" label="下单时间" min-width="160" />
      <el-table-column label="操作" fixed="right" width="100">
        <template #default="{ row }">
          <el-button link type="primary" @click="goDetail(row.orderNo)">详情</el-button>
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
        @size-change="search"
      />
    </div>
  </el-card>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { STATUS_OPTIONS, statusText } from '../constants/enums'
import { fetchOrderPage } from '../api/orderApi'
import ProvinceCityCascader from '../../../components/ProvinceCityCascader.vue'
import { formatGbRegionDisplayName } from '../../../utils/regionCodes'

const router = useRouter()
const pageNo = ref(1)
const pageSize = ref(10)
const total = ref(0)
const tableData = ref([])

const query = reactive({
  orderNo: '',
  phone: '',
  provinceCode: '',
  cityCode: '',
  status: '',
  createdAtRange: []
})

const search = () => {
  const range = query.createdAtRange || []
  const createdAtStart = range.length === 2 ? formatDateTime(range[0]) : ''
  const createdAtEnd = range.length === 2 ? formatDateTime(range[1]) : ''
  fetchOrderPage({
    orderNo: query.orderNo,
    phone: query.phone,
    provinceCode: query.provinceCode,
    cityCode: query.cityCode,
    status: query.status,
    createdAtStart,
    createdAtEnd,
    pageNo: pageNo.value,
    pageSize: pageSize.value
  })
    .then((res) => {
      tableData.value = res.list || []
      total.value = res.total || 0
    })
    .catch((e) => {
      ElMessage.error(e.message || '查询失败')
    })
}

const reset = () => {
  query.orderNo = ''
  query.phone = ''
  query.provinceCode = ''
  query.cityCode = ''
  query.status = ''
  query.createdAtRange = []
  pageNo.value = 1
  pageSize.value = 10
  search()
}

const goDetail = (orderNo) => {
  router.push(`/orders/${orderNo}`)
}

const formatDateTime = (date) => {
  const d = new Date(date)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

onMounted(() => {
  search()
})
</script>
