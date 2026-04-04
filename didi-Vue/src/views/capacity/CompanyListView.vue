<template>
  <el-card class="page-card">
    <template #header>
      <div class="toolbar-row">
        <strong>运力公司</strong>
      </div>
    </template>

    <el-form :model="query" inline @submit.prevent>
      <el-form-item label="省市">
        <ProvinceCityCascader v-model:province-code="query.provinceCode" v-model:city-code="query.cityCode" />
      </el-form-item>
      <el-form-item label="公司编号">
        <el-input v-model="query.companyNo" placeholder="模糊匹配" clearable />
      </el-form-item>
      <el-form-item label="公司名称">
        <el-input v-model="query.companyName" placeholder="模糊匹配" clearable />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" native-type="button" @click="search">查询</el-button>
        <el-button native-type="button" @click.prevent="reset">重置</el-button>
      </el-form-item>
    </el-form>

    <el-table :data="tableData" stripe style="width: 100%">
      <el-table-column prop="id" label="ID" width="90" />
      <el-table-column prop="companyNo" label="公司编号" min-width="140" />
      <el-table-column prop="companyName" label="公司名称" min-width="200" />
      <el-table-column label="省 / 市" min-width="150">
        <template #default="{ row }">
          <span :title="`${row.cityCode || ''}`.trim()">
            {{ row.cityName || formatGbRegionTitle(row.provinceCode, row.cityCode) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="team" label="车队" min-width="140" />
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button link type="primary" @click="goDrivers(row)">查看司机</el-button>
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
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { fetchCompanyPage } from '../../api/capacityApi'
import ProvinceCityCascader from '../../components/ProvinceCityCascader.vue'
import { formatGbRegionTitle } from '../../utils/regionCodes'

const router = useRouter()
const pageNo = ref(1)
const pageSize = ref(10)
const total = ref(0)
const tableData = ref([])

const query = reactive({
  provinceCode: '',
  cityCode: '',
  companyNo: '',
  companyName: ''
})

const search = () => {
  fetchCompanyPage({
    ...query,
    pageNo: pageNo.value,
    pageSize: pageSize.value
  })
    .then((res) => {
      tableData.value = res.list || []
      total.value = res.total || 0
    })
    .catch((e) => ElMessage.error(e.message || '查询失败'))
}

const reset = () => {
  query.provinceCode = ''
  query.cityCode = ''
  query.companyNo = ''
  query.companyName = ''
  pageNo.value = 1
  pageSize.value = 10
  search()
}

const onSizeChange = () => {
  pageNo.value = 1
  search()
}

const goDrivers = (company) => {
  router.push({ path: '/capacity/drivers', query: { companyId: String(company.id), companyName: company.companyName } })
}

onMounted(() => search())
</script>

