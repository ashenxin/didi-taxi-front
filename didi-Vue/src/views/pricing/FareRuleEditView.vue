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
      <el-form-item label="省市" prop="provinceCode">
        <ProvinceCityCascader v-model:province-code="form.provinceCode" v-model:city-code="form.cityCode" width="100%" />
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
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { createFareRule, fetchFareRuleDetail, updateFareRule } from '../../api/pricingApi'
import ProvinceCityCascader from '../../components/ProvinceCityCascader.vue'

const props = defineProps({
  id: { type: [String, Number], default: undefined },
  isNew: { type: Boolean, default: false }
})

const router = useRouter()
const formRef = ref()
const saving = ref(false)

const form = reactive({
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

function goBack() {
  router.push('/pricing/fare-rules')
}

async function loadDetail() {
  if (props.isNew) return
  try {
    const data = await fetchFareRuleDetail(props.id)
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

onMounted(() => {
  loadDetail()
})
</script>

<style scoped>
.form-hint {
  margin-left: 10px;
  color: #6b7280;
  font-size: 12px;
}
</style>

