<template>
  <el-card class="page-card">
    <template #header>
      <div class="toolbar-row">
        <strong>计价规则</strong>
        <el-button type="primary" @click="goCreate">新建规则</el-button>
      </div>
    </template>

    <el-form :model="query" inline @submit.prevent>
      <el-form-item label="运力公司">
        <el-select
          v-model="query.companyId"
          placeholder="全部公司"
          clearable
          filterable
          style="width: 240px"
        >
          <el-option
            v-for="c in companyOptions"
            :key="c.id"
            :label="companyOptionLabel(c)"
            :value="c.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="省/市">
        <ProvinceCityCascader
          v-model:province-code="query.provinceCode"
          v-model:city-code="query.cityCode"
          placeholder="省 / 市"
        />
      </el-form-item>
      <el-form-item label="产品线">
        <el-input v-model="query.productCode" placeholder="如 ECONOMY" clearable />
      </el-form-item>
      <el-form-item label="规则名称">
        <el-input v-model="query.ruleName" placeholder="模糊匹配" clearable />
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="query.active" placeholder="全部" clearable style="width: 160px">
          <el-option label="生效中" :value="1" />
          <el-option label="已失效" :value="0" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" native-type="button" @click="search">查询</el-button>
        <el-button native-type="button" @click.prevent="reset">重置</el-button>
      </el-form-item>
    </el-form>

    <el-table :data="tableData" stripe style="width: 100%">
      <el-table-column prop="id" label="ID" width="90" />
      <el-table-column label="运力公司" min-width="200">
        <template #default="{ row }">
          <span :title="fareRuleCompanyLabel(row)">{{ fareRuleCompanyLabel(row) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="省/市" min-width="200">
        <template #default="{ row }">
          <span :title="fareRuleRegionLabel(row)">{{ fareRuleRegionLabel(row) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="productCode" label="产品线" width="120" />
      <el-table-column prop="ruleName" label="规则名称" min-width="180" />
      <el-table-column label="生效区间" min-width="260">
        <template #default="{ row }">
          <span>{{ row.effectiveFrom || '-' }}</span>
          <span style="margin: 0 8px">~</span>
          <span>{{ row.effectiveTo || '长期有效' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="起步价" width="90">
        <template #default="{ row }">{{ money(row.baseFare) }}</template>
      </el-table-column>
      <el-table-column label="含里程(km)" width="110">
        <template #default="{ row }">{{ row.includedDistanceKm }}</template>
      </el-table-column>
      <el-table-column label="含时长(min)" width="120">
        <template #default="{ row }">{{ row.includedDurationMin }}</template>
      </el-table-column>
      <el-table-column label="每公里" width="90">
        <template #default="{ row }">{{ money(row.perKmPrice) }}</template>
      </el-table-column>
      <el-table-column label="每分钟" width="90">
        <template #default="{ row }">{{ money(row.perMinutePrice) }}</template>
      </el-table-column>
      <el-table-column label="最低/封顶" width="140">
        <template #default="{ row }">
          <span>{{ row.minimumFare == null ? '-' : money(row.minimumFare) }}</span>
          <span style="margin:0 6px">/</span>
          <span>{{ row.maximumFare == null ? '-' : money(row.maximumFare) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" fixed="right" width="140">
        <template #default="{ row }">
          <el-button link type="primary" @click="goEdit(row)">编辑</el-button>
          <el-popconfirm title="确认删除该规则？" @confirm="onDelete(row)">
            <template #reference>
              <el-button link type="danger">删除</el-button>
            </template>
          </el-popconfirm>
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
import { fetchCompanyPage } from '../../capacity/api/capacityApi'
import { deleteFareRule, fetchFareRulePage } from '../api/pricingApi'
import ProvinceCityCascader from '../../../components/ProvinceCityCascader.vue'
import {
  gbProvinceCityNames,
  inferGbProvince6FromCityOrDistrictCode,
  normalizeGbDigits
} from '../../../utils/regionCodes'

/** 与「司机列表」一致：省名/市或区名（直辖市展示区县，不用 formatGbRegionTitle 以免只显示直辖市名） */
const companyOptions = ref([])

function companyOptionLabel(c) {
  if (!c) return ''
  const no = c.companyNo ? `${c.companyNo} ` : ''
  return `${no}${c.companyName || c.id || ''}`
}

function fareRuleCompanyLabel(row) {
  if (!row) return '—'
  const name = row.companyName || ''
  const no = row.companyNo || ''
  if (name && no) return `${no} ${name}`
  if (no) return no
  if (name) return name
  return row.companyId != null ? `#${row.companyId}` : '—'
}

function fareRuleRegionLabel(row) {
  const cc = normalizeGbDigits(row?.cityCode || '')
  const p = (row?.provinceCode && String(row.provinceCode).trim()) || inferGbProvince6FromCityOrDistrictCode(cc)
  if (!cc && !p) return '—'
  const { provinceName, cityName } = gbProvinceCityNames(p, cc)
  if (provinceName && cityName) return `${provinceName}/${cityName}`
  if (provinceName) return provinceName
  if (cityName) return cityName
  return '—'
}

const router = useRouter()
const pageNo = ref(1)
const pageSize = ref(10)
const total = ref(0)
const tableData = ref([])

const query = reactive({
  companyId: undefined,
  provinceCode: '',
  cityCode: '',
  productCode: '',
  ruleName: '',
  active: undefined
})

function money(value) {
  if (value === undefined || value === null || value === '') return '-'
  return Number(value).toFixed(2)
}

/** 已失效：有生效结束时间且已过期（与后端 active=0 一致） */
function isFareRuleExpired(row) {
  if (row == null || row.effectiveTo == null || row.effectiveTo === '') return false
  const t = new Date(row.effectiveTo)
  if (Number.isNaN(t.getTime())) return false
  return t.getTime() <= Date.now()
}

/** 未失效在前、已失效在后；同组内按 id 降序 */
function sortFareRulesActiveFirst(list) {
  if (!Array.isArray(list) || list.length < 2) return list || []
  return [...list].sort((a, b) => {
    const ea = isFareRuleExpired(a) ? 1 : 0
    const eb = isFareRuleExpired(b) ? 1 : 0
    if (ea !== eb) return ea - eb
    return (Number(b.id) || 0) - (Number(a.id) || 0)
  })
}

async function search() {
  try {
    const data = await fetchFareRulePage({
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      ...query
    })
    tableData.value = sortFareRulesActiveFirst(data.list || [])
    total.value = data.total || 0
    pageNo.value = data.pageNo || pageNo.value
    pageSize.value = data.pageSize || pageSize.value
  } catch (e) {
    ElMessage.error(e.message || '查询失败')
  }
}

function reset() {
  query.companyId = undefined
  query.provinceCode = ''
  query.cityCode = ''
  query.productCode = ''
  query.ruleName = ''
  query.active = undefined
  pageNo.value = 1
  search()
}

function onSizeChange() {
  pageNo.value = 1
  search()
}

function goCreate() {
  router.push('/pricing/fare-rules/new')
}

function goEdit(row) {
  router.push(`/pricing/fare-rules/${row.id}`)
}

async function onDelete(row) {
  try {
    await deleteFareRule(row.id)
    ElMessage.success('已删除')
    search()
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  }
}

async function loadCompanies() {
  try {
    const data = await fetchCompanyPage({ pageNo: 1, pageSize: 500 })
    companyOptions.value = data.list || []
  } catch {
    companyOptions.value = []
  }
}

onMounted(() => {
  loadCompanies()
  search()
})
</script>
