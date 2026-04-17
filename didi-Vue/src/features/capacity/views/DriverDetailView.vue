<template>
  <el-card v-loading="loading" class="page-card">
    <template #header>
      <div class="toolbar-row">
        <strong>司机资料</strong>
        <div style="display: flex; gap: 8px; align-items: center">
          <el-button v-if="detail?.id" type="primary" link @click="goCars">名下车辆</el-button>
          <el-button @click="goBack">返回列表</el-button>
        </div>
      </div>
    </template>

    <template v-if="detail">
      <h3 class="section-title">基本信息</h3>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="司机ID">{{ detail.id }}</el-descriptions-item>
        <el-descriptions-item label="姓名">{{ detail.name || '—' }}</el-descriptions-item>
        <el-descriptions-item label="手机号">{{ detail.phone || '—' }}</el-descriptions-item>
        <el-descriptions-item label="性别">{{ genderText(detail.gender) }}</el-descriptions-item>
        <el-descriptions-item label="出生日期">{{ fmtDate(detail.birthday) }}</el-descriptions-item>
        <el-descriptions-item label="国籍">{{ detail.nationality || '—' }}</el-descriptions-item>
        <el-descriptions-item label="民族">{{ detail.nation || '—' }}</el-descriptions-item>
        <el-descriptions-item label="婚姻状况">{{ maritalText(detail.maritalStatus) }}</el-descriptions-item>
        <el-descriptions-item label="注册来源">{{ driverSourceText(detail.driverSource) }}</el-descriptions-item>
      </el-descriptions>

      <h3 class="section-title">归属与地区</h3>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="公司ID">{{ detail.companyId ?? '—' }}</el-descriptions-item>
        <el-descriptions-item label="公司名称">{{ detail.companyName || '—' }}</el-descriptions-item>
        <el-descriptions-item label="品牌编号">{{ detail.brandNo || '—' }}</el-descriptions-item>
        <el-descriptions-item label="品牌名称">{{ detail.brandName || '—' }}</el-descriptions-item>
        <el-descriptions-item label="省编码">{{ detail.provinceCode || '—' }}</el-descriptions-item>
        <el-descriptions-item label="省名称">{{ detail.provinceName || '—' }}</el-descriptions-item>
        <el-descriptions-item label="市/区编码">{{ detail.cityCode || '—' }}</el-descriptions-item>
        <el-descriptions-item label="市/区名称">{{ detail.cityName || '—' }}</el-descriptions-item>
      </el-descriptions>

      <h3 class="section-title">证件与驾驶证</h3>
      <el-descriptions :column="1" border>
        <el-descriptions-item label="身份证号">{{ detail.idCard || '—' }}</el-descriptions-item>
        <el-descriptions-item label="初次领驾驶证">{{ fmtDate(detail.getDriverLicenseDate) }}</el-descriptions-item>
        <el-descriptions-item label="驾驶证有效期起">{{ fmtDate(detail.driverLicenseOn) }}</el-descriptions-item>
        <el-descriptions-item label="驾驶证有效期止">{{ fmtDate(detail.driverLicenseOff) }}</el-descriptions-item>
      </el-descriptions>

      <h3 class="section-title">状态</h3>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="审核状态">{{ auditStatusText(detail.auditStatus) }}</el-descriptions-item>
        <el-descriptions-item label="是否可接单">{{ yesNo(detail.canAcceptOrder) }}</el-descriptions-item>
        <el-descriptions-item label="听单状态">{{ monitorText(detail.monitorStatus) }}</el-descriptions-item>
        <el-descriptions-item label="上报账号">{{ rptText(detail.rptStatus) }}</el-descriptions-item>
        <el-descriptions-item label="最新审核流水ID">{{ detail.auditLastRecordId ?? '—' }}</el-descriptions-item>
      </el-descriptions>

      <h3 class="section-title">系统时间</h3>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="创建时间">{{ fmtDateTime(detail.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ fmtDateTime(detail.updatedAt) }}</el-descriptions-item>
      </el-descriptions>

      <h3 class="section-title">影像资料</h3>
      <p class="hint">以下为档案中的 OSS 链接，仅供内网合规查看</p>
      <div class="photo-grid">
        <div v-for="item in photoItems" :key="item.key" class="photo-cell">
          <div class="photo-label">{{ item.label }}</div>
          <template v-if="item.url">
            <el-image
              :src="item.url"
              fit="contain"
              :preview-src-list="[item.url]"
              preview-teleported
              class="photo-img"
            />
            <el-link :href="item.url" target="_blank" type="primary" style="font-size: 12px">打开链接</el-link>
          </template>
          <span v-else class="muted">—</span>
        </div>
      </div>
    </template>
  </el-card>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { fetchDriverDetail } from '../api/capacityApi'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const detail = ref(null)

const driverId = computed(() => route.params.driverId)

const AUDIT_STATUS_OPTIONS = [
  { label: '待完善', value: 0 },
  { label: '审核中', value: 1 },
  { label: '通过', value: 2 },
  { label: '驳回/需补件', value: 3 }
]

function auditStatusText(v) {
  if (v === null || v === undefined || v === '') return '—'
  const n = Number(v)
  const hit = AUDIT_STATUS_OPTIONS.find((o) => o.value === n)
  return hit ? hit.label : String(v)
}

function genderText(g) {
  if (g === 1) return '男'
  if (g === 2) return '女'
  if (g === 0) return '未知'
  return '—'
}

function maritalText(m) {
  if (m === 0) return '未婚'
  if (m === 1) return '已婚'
  if (m === 2) return '离异'
  return '—'
}

function driverSourceText(s) {
  if (s === 0) return '自行注册'
  if (s === 1) return '导入'
  return '—'
}

function monitorText(m) {
  if (m === 0) return '未听单'
  if (m === 1) return '听单中'
  if (m === 2) return '服务中'
  return '—'
}

function rptText(r) {
  if (r === 0) return '有效'
  if (r === 1) return '失效'
  return '—'
}

function yesNo(v) {
  if (v === 1) return '是'
  if (v === 0) return '否'
  return '—'
}

function fmtDate(v) {
  if (v == null || v === '') return '—'
  const d = typeof v === 'string' ? new Date(v) : v instanceof Date ? v : new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fmtDateTime(v) {
  if (v == null || v === '') return '—'
  const d = typeof v === 'string' ? new Date(v) : v instanceof Date ? v : new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  return d.toLocaleString('zh-CN', { hour12: false })
}

const photoItems = computed(() => {
  const d = detail.value
  if (!d) return []
  return [
    { key: 'idCardPhotoA', label: '身份证人像面', url: d.idCardPhotoA },
    { key: 'idCardPhotoB', label: '身份证国徽面', url: d.idCardPhotoB },
    { key: 'photoOss', label: '驾驶员头像', url: d.photoOss },
    { key: 'withCarPhoto', label: '人车合照', url: d.withCarPhoto },
    { key: 'licensePhotoOssA', label: '驾驶证正页', url: d.licensePhotoOssA },
    { key: 'licensePhotoOssB', label: '驾驶证副页', url: d.licensePhotoOssB }
  ]
})

function load() {
  if (!driverId.value) {
    ElMessage.error('缺少司机ID')
    return
  }
  loading.value = true
  detail.value = null
  fetchDriverDetail(driverId.value)
    .then((data) => {
      detail.value = data
    })
    .catch((e) => ElMessage.error(e.message || '加载失败'))
    .finally(() => {
      loading.value = false
    })
}

function goBack() {
  router.push({ path: '/capacity/drivers', query: { ...route.query } })
}

function goCars() {
  const d = detail.value
  if (!d?.id) return
  router.push({
    path: `/capacity/drivers/${d.id}/cars`,
    query: { driverName: d.name || '', driverPhone: d.phone || '' }
  })
}

watch(
  () => route.params.driverId,
  () => load(),
  { immediate: false }
)

onMounted(() => load())
</script>

<style scoped>
.section-title {
  margin: 20px 0 12px;
  font-size: 15px;
  font-weight: 600;
}
.section-title:first-of-type {
  margin-top: 0;
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin: 0 0 12px;
}
.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}
.photo-cell {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 8px;
}
.photo-label {
  font-size: 13px;
  margin-bottom: 8px;
  color: var(--el-text-color-regular);
}
.photo-img {
  width: 100%;
  height: 120px;
  background: var(--el-fill-color-light);
}
.muted {
  color: var(--el-text-color-placeholder);
}
</style>
