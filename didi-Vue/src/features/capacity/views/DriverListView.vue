<template>
  <el-card class="page-card">
    <template #header>
      <div class="toolbar-row">
        <strong>司机列表</strong>
        <div style="display:flex; gap: 8px; align-items:center">
          <el-tag v-if="companyName" type="info">公司：{{ companyName }}</el-tag>
          <el-button @click="goCompanies">返回公司</el-button>
        </div>
      </div>
    </template>

    <el-form :model="query" inline @submit.prevent>
      <el-form-item v-if="!lockedCompanyId" label="公司ID">
        <el-input v-model="query.companyId" placeholder="可从公司页进入自动带入" clearable style="width: 220px" />
      </el-form-item>
      <el-form-item label="姓名">
        <el-input v-model="query.name" placeholder="模糊匹配" clearable />
      </el-form-item>
      <el-form-item label="手机号">
        <el-input v-model="query.phone" placeholder="模糊匹配" clearable />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" native-type="button" @click="search">查询</el-button>
        <el-button native-type="button" @click.prevent="reset">重置</el-button>
      </el-form-item>
    </el-form>

    <el-table :data="tableData" stripe style="width: 100%">
      <el-table-column prop="id" label="ID" width="90" />
      <el-table-column prop="name" label="姓名" min-width="120" />
      <el-table-column prop="phone" label="手机号" min-width="140" />
      <el-table-column v-if="!lockedCompanyId" prop="companyId" label="公司ID" width="110" />
      <el-table-column label="省 / 市" min-width="150">
        <template #default="{ row }">
          {{ row.cityName || formatGbRegionTitle(row.provinceCode, row.cityCode) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button link type="primary" @click="goCars(row)">查看车辆</el-button>
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
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { fetchDriverPage } from '../api/capacityApi'
import { formatGbRegionTitle } from '../../../utils/regionCodes'

const route = useRoute()
const router = useRouter()

const pageNo = ref(1)
const pageSize = ref(10)
const total = ref(0)
const tableData = ref([])

const query = reactive({
  companyId: '',
  name: '',
  phone: ''
})

const companyName = computed(() => route.query.companyName || '')
const lockedCompanyId = computed(() => (route.query.companyId ? String(route.query.companyId) : ''))

const syncFromRoute = () => {
  if (lockedCompanyId.value) {
    query.companyId = lockedCompanyId.value
  }
}

watch(
  () => route.query.companyId,
  () => {
    syncFromRoute()
    pageNo.value = 1
    search()
  }
)

const search = () => {
  fetchDriverPage({
    companyId: query.companyId,
    name: query.name,
    phone: query.phone,
    pageNo: pageNo.value,
    pageSize: pageSize.value
  })
    .then((res) => {
      tableData.value = res.list || []
      total.value = res.total || 0
    })
    .catch((e) => ElMessage.error(e.message || '查询失败'))
}

const reset = async () => {
  query.name = ''
  query.phone = ''
  // 非「从公司页带入公司」时，一并清空公司 ID，否则界面像没重置
  if (!lockedCompanyId.value) {
    query.companyId = ''
  }
  pageNo.value = 1
  pageSize.value = 10
  await nextTick()
  search()
}

const onSizeChange = () => {
  pageNo.value = 1
  search()
}

const goCars = (driver) => {
  if (!driver || driver.id === undefined || driver.id === null || driver.id === '') {
    ElMessage.error('司机ID缺失，无法查看车辆')
    return
  }
  router.push({
    path: `/capacity/drivers/${driver.id}/cars`,
    query: { driverName: driver.name, driverPhone: driver.phone }
  })
}

const goCompanies = () => router.push('/capacity/companies')

onMounted(() => {
  syncFromRoute()
  search()
})
</script>
