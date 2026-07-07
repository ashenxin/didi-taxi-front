<template>
  <el-card class="page-card">
    <template #header>
      <div class="toolbar-row">
        <strong>{{ isNew ? '新建计价规则' : '编辑计价规则' }}</strong>
        <div style="display:flex; gap: 8px">
          <el-button @click="goBack">返回</el-button>
          <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
        </div>
      </div>
    </template>

    <el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
      <el-form-item label="运力公司" prop="companyId">
        <el-select
          v-model="form.companyId"
          filterable
          placeholder="请选择运力公司"
          style="width: 100%"
          @change="onCompanyChange"
        >
          <el-option
            v-for="c in companies"
            :key="c.id"
            :label="companyOptionLabel(c)"
            :value="c.id"
          />
        </el-select>
        <span class="form-hint">保存时省/市须与公司档案一致，选择公司将自动带出运营区域</span>
      </el-form-item>
      <el-form-item label="省/市" prop="provinceCode">
        <ProvinceCityCascader
          v-model:province-code="form.provinceCode"
          v-model:city-code="form.cityCode"
          placeholder="省 / 市"
          width="100%"
        />
      </el-form-item>
      <el-form-item label="产品线编码" prop="productCode">
        <el-input v-model="form.productCode" placeholder="如 ECONOMY/COMFORT" />
      </el-form-item>
      <el-form-item label="规则名称" prop="ruleName">
        <el-input v-model="form.ruleName" placeholder="便于运营识别（可选）" />
      </el-form-item>

      <el-divider content-position="left">生效时间</el-divider>
      <el-form-item label="生效开始" prop="effectiveFrom">
        <el-date-picker v-model="form.effectiveFrom" type="datetime" placeholder="选择时间" />
      </el-form-item>
      <el-form-item label="生效结束" prop="effectiveTo">
        <el-date-picker v-model="form.effectiveTo" type="datetime" placeholder="为空表示长期有效" clearable />
      </el-form-item>

      <el-divider content-position="left">计费参数</el-divider>
      <el-form-item label="起步价" prop="baseFare">
        <el-input-number v-model="form.baseFare" :min="0" :precision="2" :step="1" />
      </el-form-item>
      <el-form-item label="起步含里程(km)" prop="includedDistanceKm">
        <el-input-number v-model="form.includedDistanceKm" :min="0" :precision="2" :step="0.5" />
      </el-form-item>
      <el-form-item label="起步含时长(min)" prop="includedDurationMin">
        <el-input-number v-model="form.includedDurationMin" :min="0" :step="1" />
      </el-form-item>
      <el-form-item label="每公里单价" prop="perKmPrice">
        <el-input-number v-model="form.perKmPrice" :min="0" :precision="2" :step="0.5" />
      </el-form-item>
      <el-form-item label="每分钟单价" prop="perMinutePrice">
        <el-input-number v-model="form.perMinutePrice" :min="0" :precision="2" :step="0.5" />
      </el-form-item>
      <el-form-item label="最低消费" prop="minimumFare">
        <el-input-number v-model="form.minimumFare" :min="0" :precision="2" :step="1" controls-position="right" />
        <span class="form-hint">为空表示不启用</span>
      </el-form-item>
      <el-form-item label="封顶价" prop="maximumFare">
        <el-input-number v-model="form.maximumFare" :min="0" :precision="2" :step="1" controls-position="right" />
        <span class="form-hint">为空表示不启用</span>
      </el-form-item>
    </el-form>
  </el-card>

  <el-card v-if="!isNew" class="page-card coupon-card">
    <template #header>
      <div class="toolbar-row">
        <strong>优惠券方案</strong>
        <el-button type="primary" :disabled="!isSuperAdmin" @click="openCouponDialog()">新建方案</el-button>
      </div>
    </template>

    <el-alert
      v-if="!isSuperAdmin"
      title="当前账号仅可查看优惠券方案，增删改与启停需超管操作"
      type="info"
      :closable="false"
      show-icon
      class="coupon-alert"
    />

    <el-table :data="couponRows" stripe style="width: 100%" v-loading="couponLoading">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="name" label="方案名称" min-width="160" />
      <el-table-column label="类型" width="120">
        <template #default="{ row }">{{ couponTypeText(row.couponType) }}</template>
      </el-table-column>
      <el-table-column label="优惠" min-width="160">
        <template #default="{ row }">{{ couponDiscountText(row) }}</template>
      </el-table-column>
      <el-table-column label="门槛" width="110">
        <template #default="{ row }">{{ money(row.thresholdAmount || 0) }}</template>
      </el-table-column>
      <el-table-column label="总量/已领/已用" width="150">
        <template #default="{ row }">{{ row.totalCount || 0 }} / {{ row.receivedCount || 0 }} / {{ row.usedCount || 0 }}</template>
      </el-table-column>
      <el-table-column label="有效期" min-width="260">
        <template #default="{ row }">
          <span>{{ row.validStartAt || '-' }}</span>
          <span style="margin: 0 8px">~</span>
          <span>{{ row.validEndAt || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <el-tag :type="couponStatusType(row.status)">{{ couponStatusText(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" fixed="right" width="190">
        <template #default="{ row }">
          <el-button link type="primary" :disabled="!isSuperAdmin || row.status === 'PUBLISHED'" @click="openCouponDialog(row)">编辑</el-button>
          <el-button v-if="row.status !== 'PUBLISHED'" link type="success" :disabled="!isSuperAdmin" @click="publishCoupon(row)">启用</el-button>
          <el-button v-else link type="warning" :disabled="!isSuperAdmin" @click="offlineCoupon(row)">停用</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>

  <el-dialog v-model="couponDialogVisible" :title="couponForm.id ? '编辑优惠券方案' : '新建优惠券方案'" width="640px">
    <el-form ref="couponFormRef" :model="couponForm" :rules="couponRules" label-width="120px">
      <el-form-item label="方案名称" prop="name">
        <el-input v-model="couponForm.name" maxlength="60" />
      </el-form-item>
      <el-form-item label="优惠类型" prop="couponType">
        <el-select v-model="couponForm.couponType" style="width: 100%">
          <el-option label="固定金额减免" value="AMOUNT_OFF" />
          <el-option label="比例折扣" value="PERCENT_OFF" />
          <el-option label="特殊活动" value="SPECIAL" />
        </el-select>
      </el-form-item>
      <el-form-item label="满减门槛" prop="thresholdAmount">
        <el-input-number v-model="couponForm.thresholdAmount" :min="0" :precision="2" :step="1" controls-position="right" />
      </el-form-item>
      <el-form-item v-if="couponForm.couponType === 'AMOUNT_OFF'" label="减免金额" prop="discountAmount">
        <el-input-number v-model="couponForm.discountAmount" :min="0.01" :precision="2" :step="1" controls-position="right" />
      </el-form-item>
      <template v-if="couponForm.couponType === 'PERCENT_OFF'">
        <el-form-item label="折扣比例" prop="discountRate">
          <el-input-number v-model="couponForm.discountRate" :min="0.01" :max="0.99" :precision="2" :step="0.01" controls-position="right" />
          <span class="form-hint">例如 0.90 表示九折</span>
        </el-form-item>
        <el-form-item label="优惠封顶" prop="maxDiscountAmount">
          <el-input-number v-model="couponForm.maxDiscountAmount" :min="0" :precision="2" :step="1" controls-position="right" />
          <span class="form-hint">为空或 0 表示不封顶</span>
        </el-form-item>
      </template>
      <el-form-item v-if="couponForm.couponType === 'SPECIAL'" label="规则配置" prop="ruleConfig">
        <el-input v-model="couponForm.ruleConfig" type="textarea" :rows="4" placeholder='如 {"activityCode":"NATIONAL_DAY"}' />
      </el-form-item>
      <el-form-item label="有效期" prop="validRange">
        <el-date-picker
          v-model="couponForm.validRange"
          type="datetimerange"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="发放总量" prop="totalCount">
        <el-input-number v-model="couponForm.totalCount" :min="1" :step="100" controls-position="right" />
      </el-form-item>
      <el-form-item label="活动编码">
        <el-input v-model="couponForm.activityCode" maxlength="64" placeholder="特殊活动可选" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="couponDialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="couponSaving" @click="saveCoupon">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { fetchCompanyPage } from '../../capacity/api/capacityApi'
import {
  createFareRule,
  createFareRuleCoupon,
  fetchFareRuleCoupons,
  fetchFareRuleDetail,
  offlineFareRuleCoupon,
  publishFareRuleCoupon,
  updateFareRule,
  updateFareRuleCoupon
} from '../api/pricingApi'
import ProvinceCityCascader from '../../../components/ProvinceCityCascader.vue'
import { adminMe, loadAdminMe } from '../../../stores/adminSession'

const props = defineProps({
  id: { type: [String, Number], default: undefined },
  isNew: { type: Boolean, default: false }
})

const router = useRouter()
const formRef = ref()
const saving = ref(false)
const companies = ref([])
const couponLoading = ref(false)
const couponSaving = ref(false)
const couponRows = ref([])
const couponDialogVisible = ref(false)
const couponFormRef = ref()
const isSuperAdmin = computed(() => (adminMe.value?.roleCodes || []).includes('SUPER'))

const form = reactive({
  companyId: null,
  provinceCode: '',
  cityCode: '',
  productCode: '',
  ruleName: '',
  effectiveFrom: null,
  effectiveTo: null,
  baseFare: null,
  includedDistanceKm: null,
  includedDurationMin: null,
  perKmPrice: null,
  perMinutePrice: null,
  minimumFare: null,
  maximumFare: null
})

const rules = {
  companyId: [{ required: true, message: '请选择运力公司', trigger: 'change' }],
  provinceCode: [
    { required: true, message: '请选择省', trigger: 'change' },
    {
      validator: (_r, _v, cb) => {
        if (!form.cityCode?.trim()) cb(new Error('请选择市/区'))
        else cb()
      },
      trigger: 'change'
    }
  ],
  productCode: [{ required: true, message: '产品线编码不能为空', trigger: 'blur' }],
  effectiveFrom: [{ required: true, message: '生效开始时间不能为空', trigger: 'change' }],
  baseFare: [{ required: true, message: '起步价不能为空', trigger: 'change' }],
  includedDistanceKm: [{ required: true, message: '起步含里程不能为空', trigger: 'change' }],
  includedDurationMin: [{ required: true, message: '起步含时长不能为空', trigger: 'change' }],
  perKmPrice: [{ required: true, message: '每公里单价不能为空', trigger: 'change' }],
  perMinutePrice: [{ required: true, message: '每分钟单价不能为空', trigger: 'change' }]
}

const couponForm = reactive({
  id: null,
  name: '',
  couponType: 'AMOUNT_OFF',
  thresholdAmount: 0,
  discountAmount: null,
  discountRate: 0.9,
  maxDiscountAmount: null,
  validRange: [],
  totalCount: 1000,
  activityCode: '',
  ruleConfig: ''
})

const couponRules = {
  name: [{ required: true, message: '方案名称不能为空', trigger: 'blur' }],
  couponType: [{ required: true, message: '请选择优惠类型', trigger: 'change' }],
  validRange: [
    {
      validator: (_r, value, cb) => {
        if (!Array.isArray(value) || value.length !== 2 || !value[0] || !value[1]) cb(new Error('请选择有效期'))
        else cb()
      },
      trigger: 'change'
    }
  ],
  totalCount: [{ required: true, message: '发放总量不能为空', trigger: 'change' }]
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function formatDateTime(date) {
  if (!date) return null
  const d = new Date(date)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

function parseMaybeDateTime(value) {
  if (!value) return null
  // 后端可能返回字符串（yyyy-MM-dd HH:mm:ss 或 ISO），这里尽量兼容
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function money(value) {
  if (value === undefined || value === null || value === '') return '-'
  return Number(value).toFixed(2)
}

function couponTypeText(type) {
  const map = {
    AMOUNT_OFF: '固定减免',
    PERCENT_OFF: '比例折扣',
    SPECIAL: '特殊活动'
  }
  return map[type] || type || '-'
}

function couponStatusText(status) {
  const map = {
    DRAFT: '草稿',
    PUBLISHED: '启用',
    OFFLINE: '停用'
  }
  return map[status] || status || '-'
}

function couponStatusType(status) {
  if (status === 'PUBLISHED') return 'success'
  if (status === 'OFFLINE') return 'warning'
  return 'info'
}

function couponDiscountText(row) {
  if (!row) return '-'
  if (row.couponType === 'PERCENT_OFF') {
    const discount = row.discountRate == null ? '-' : `${Number(row.discountRate * 10).toFixed(1)}折`
    const cap = row.maxDiscountAmount ? `，封顶 ${money(row.maxDiscountAmount)}` : ''
    return `${discount}${cap}`
  }
  if (row.couponType === 'SPECIAL') return row.activityCode || '特殊规则'
  return `减 ${money(row.discountAmount)}`
}

function goBack() {
  router.push('/pricing/fare-rules')
}

function companyOptionLabel(c) {
  if (!c) return ''
  const no = c.companyNo ? `${c.companyNo} ` : ''
  return `${no}${c.companyName || ''}`.trim() || String(c.id)
}

function onCompanyChange(companyId) {
  const c = companies.value.find((x) => x.id === companyId)
  if (!c) return
  form.provinceCode = c.provinceCode || ''
  form.cityCode = c.cityCode || ''
}

async function loadCompanies() {
  try {
    const data = await fetchCompanyPage({ pageNo: 1, pageSize: 500 })
    companies.value = data.list || []
  } catch {
    companies.value = []
  }
}

async function loadDetail() {
  if (props.isNew) return
  try {
    const data = await fetchFareRuleDetail(props.id)
    form.companyId = data.companyId != null ? data.companyId : null
    form.provinceCode = data.provinceCode || ''
    form.cityCode = data.cityCode || ''
    form.productCode = data.productCode || ''
    form.ruleName = data.ruleName || ''
    form.effectiveFrom = parseMaybeDateTime(data.effectiveFrom)
    form.effectiveTo = parseMaybeDateTime(data.effectiveTo)
    form.baseFare = data.baseFare
    form.includedDistanceKm = data.includedDistanceKm
    form.includedDurationMin = data.includedDurationMin
    form.perKmPrice = data.perKmPrice
    form.perMinutePrice = data.perMinutePrice
    form.minimumFare = data.minimumFare
    form.maximumFare = data.maximumFare
  } catch (e) {
    ElMessage.error(e.message || '加载失败')
  }
}

async function loadCoupons() {
  if (props.isNew) return
  couponLoading.value = true
  try {
    const data = await fetchFareRuleCoupons(props.id, { pageNo: 1, pageSize: 50 })
    couponRows.value = data?.list || []
  } catch (e) {
    ElMessage.error(e.message || '加载优惠券方案失败')
  } finally {
    couponLoading.value = false
  }
}

function resetCouponForm(row = null) {
  couponForm.id = row?.id || null
  couponForm.name = row?.name || ''
  couponForm.couponType = row?.couponType || 'AMOUNT_OFF'
  couponForm.thresholdAmount = row?.thresholdAmount ?? 0
  couponForm.discountAmount = row?.discountAmount ?? null
  couponForm.discountRate = row?.discountRate ?? 0.9
  couponForm.maxDiscountAmount = row?.maxDiscountAmount ?? null
  couponForm.validRange = row ? [parseMaybeDateTime(row.validStartAt), parseMaybeDateTime(row.validEndAt)] : []
  couponForm.totalCount = row?.totalCount ?? 1000
  couponForm.activityCode = row?.activityCode || ''
  couponForm.ruleConfig = row?.ruleConfig || ''
}

function openCouponDialog(row = null) {
  if (!isSuperAdmin.value) return
  resetCouponForm(row)
  couponDialogVisible.value = true
}

function couponPayload() {
  return {
    name: couponForm.name,
    couponType: couponForm.couponType,
    thresholdAmount: couponForm.thresholdAmount || 0,
    discountAmount: couponForm.couponType === 'AMOUNT_OFF' ? couponForm.discountAmount : null,
    discountRate: couponForm.couponType === 'PERCENT_OFF' ? couponForm.discountRate : null,
    maxDiscountAmount: couponForm.couponType === 'PERCENT_OFF' ? couponForm.maxDiscountAmount || null : null,
    validStartAt: formatDateTime(couponForm.validRange[0]),
    validEndAt: formatDateTime(couponForm.validRange[1]),
    totalCount: couponForm.totalCount,
    perUserLimit: 1,
    issueType: 'LOGIN_POPUP',
    sourceType: couponForm.couponType === 'SPECIAL' ? 'SPECIAL' : 'NORMAL',
    activityCode: couponForm.activityCode || null,
    ruleConfig: couponForm.couponType === 'SPECIAL' ? couponForm.ruleConfig : null
  }
}

async function saveCoupon() {
  if (!couponFormRef.value) return
  await couponFormRef.value.validate(async (valid) => {
    if (!valid) return
    couponSaving.value = true
    try {
      if (couponForm.id) {
        await updateFareRuleCoupon(props.id, couponForm.id, couponPayload())
      } else {
        await createFareRuleCoupon(props.id, couponPayload())
      }
      ElMessage.success('已保存优惠券方案')
      couponDialogVisible.value = false
      loadCoupons()
    } catch (e) {
      ElMessage.error(e.message || '保存优惠券方案失败')
    } finally {
      couponSaving.value = false
    }
  })
}

async function publishCoupon(row) {
  try {
    await publishFareRuleCoupon(props.id, row.id)
    ElMessage.success('已启用')
    loadCoupons()
  } catch (e) {
    ElMessage.error(e.message || '启用失败')
  }
}

async function offlineCoupon(row) {
  try {
    await offlineFareRuleCoupon(props.id, row.id)
    ElMessage.success('已停用')
    loadCoupons()
  } catch (e) {
    ElMessage.error(e.message || '停用失败')
  }
}

async function submit() {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    if (form.effectiveTo && form.effectiveFrom && new Date(form.effectiveTo) < new Date(form.effectiveFrom)) {
      ElMessage.error('生效结束时间不能早于生效开始时间')
      return
    }
    saving.value = true
    try {
      const payload = {
        companyId: form.companyId,
        provinceCode: form.provinceCode,
        cityCode: form.cityCode,
        productCode: form.productCode,
        ruleName: form.ruleName || null,
        effectiveFrom: formatDateTime(form.effectiveFrom),
        effectiveTo: form.effectiveTo ? formatDateTime(form.effectiveTo) : null,
        baseFare: form.baseFare,
        includedDistanceKm: form.includedDistanceKm,
        includedDurationMin: form.includedDurationMin,
        perKmPrice: form.perKmPrice,
        perMinutePrice: form.perMinutePrice,
        minimumFare: form.minimumFare === null ? null : form.minimumFare,
        maximumFare: form.maximumFare === null ? null : form.maximumFare
      }
      if (props.isNew) {
        await createFareRule(payload)
        ElMessage.success('已创建')
        goBack()
      } else {
        await updateFareRule(props.id, payload)
        ElMessage.success('已保存')
        goBack()
      }
    } catch (e) {
      ElMessage.error(e.message || '保存失败')
    } finally {
      saving.value = false
    }
  })
}

onMounted(async () => {
  loadAdminMe().catch(() => {})
  await loadCompanies()
  await loadDetail()
  await loadCoupons()
})
</script>

<style scoped>
.coupon-card {
  margin-top: 16px;
}

.coupon-alert {
  margin-bottom: 12px;
}

.form-hint {
  margin-left: 10px;
  color: #6b7280;
  font-size: 12px;
}
</style>
