<template>
  <el-card class="page-card">
    <template #header>
      <div class="toolbar-row">
        <div class="title-with-tag">
          <strong>图片识车</strong>
          <el-tag size="small" type="success">真实接口</el-tag>
        </div>
      </div>
    </template>

    <div class="search-layout">
      <section class="query-panel">
        <el-upload class="query-upload" drag :auto-upload="false" :show-file-list="false" accept="image/jpeg,image/png,image/webp" :on-change="handleChange">
          <div v-if="previewUrl" class="preview">
            <img :src="previewUrl" alt="查询图片" />
            <span class="preview-mask">点击更换图片</span>
          </div>
          <div v-else class="upload-empty">
            <p>拖拽或点击上传车辆图片</p>
            <span>JPG / PNG / WEBP，单张 ≤ 10MB</span>
          </div>
        </el-upload>

        <div v-if="file" class="file-meta">
          <span class="file-name" :title="file.name">{{ file.name }}</span>
          <el-button link type="primary" @click="clearFile">移除</el-button>
        </div>

        <el-form label-position="top" class="filter-form">
          <el-form-item label="品牌">
            <el-select v-model="filters.brandCode" placeholder="全部品牌" clearable style="width: 100%">
              <el-option v-for="b in brandOptions" :key="b.code" :label="b.name" :value="b.code" />
            </el-select>
          </el-form-item>
          <el-form-item label="能源类型">
            <el-select v-model="filters.energyType" placeholder="全部能源" clearable style="width: 100%">
              <el-option v-for="e in energyOptions" :key="e.code" :label="e.name" :value="e.code" />
            </el-select>
          </el-form-item>
          <el-form-item label="价格区间">
            <el-select v-model="filters.priceBand" placeholder="全部价格" clearable style="width: 100%">
              <el-option v-for="p in priceBands" :key="p.code" :label="p.label" :value="p.code" />
            </el-select>
          </el-form-item>
        </el-form>

        <el-button type="primary" class="search-btn" :loading="loading" :disabled="!file" @click="runSearch">开始识别</el-button>
        <p class="panel-note">DashScope 多模态向量化 + Milvus HNSW；分数是余弦相似度，不是准确率。</p>
      </section>

      <section class="result-panel">
        <div class="result-head">
          <div>
            <strong>相似车型</strong>
            <span v-if="results.length" class="muted">共 {{ results.length }} 条，按余弦相似度排序</span>
          </div>
          <el-tag v-if="logId" size="small" type="info">logId {{ logId }}</el-tag>
        </div>

        <el-table v-if="results.length" :data="results" stripe style="width: 100%">
          <el-table-column label="#" width="48" align="center"><template #default="{ $index }">{{ $index + 1 }}</template></el-table-column>
          <el-table-column label="车型" min-width="230">
            <template #default="{ row }">
              <div class="model-cell">
                <img v-if="row.coverImageUrl" :src="row.coverImageUrl" class="cover" alt="" />
                <VehicleThumb v-else variant="sedan" color="#6b7280" />
                <div>
                  <div class="model-name">{{ row.modelName }}</div>
                  <div class="muted">{{ row.modelCode }} · 命中{{ row.matchedAngleText }}</div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="brandName" label="品牌" width="90" />
          <el-table-column label="指导价" width="140"><template #default="{ row }">{{ priceText(row) }}</template></el-table-column>
          <el-table-column label="能源 / 车身" width="120"><template #default="{ row }">{{ row.energyTypeText }} · {{ row.bodyTypeText }}</template></el-table-column>
          <el-table-column label="相似度" width="170">
            <template #default="{ row }">
              <div class="sim-cell">
                <span class="sim-value">{{ Math.round(row.score * 100) }}%</span>
                <el-progress :percentage="Math.round(row.score * 100)" :stroke-width="6" :show-text="false" :color="scoreColor(row.score)" class="sim-bar" />
              </div>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="110" fixed="right">
            <template #default="{ row }"><el-button link type="primary" @click="feedback(row)">结果正确</el-button></template>
          </el-table-column>
        </el-table>
        <el-empty v-else :description="emptyDescription" />
      </section>
    </div>
  </el-card>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import VehicleThumb from '../components/VehicleThumb.vue'
import { vehicleBrands, energyOptions, priceBands } from '../data/vehicleAiOptions'
import { searchVehicle, sendVehicleFeedback, fetchVehicleOptions } from '../api/vehicleAiApi'

const file = ref(null)
const previewUrl = ref('')
const loading = ref(false)
const results = ref([])
const logId = ref(null)
const searched = ref(false)
const filters = reactive({ brandCode: '', energyType: null, priceBand: null })
const brandOptions = ref([...vehicleBrands])
const hasFilter = computed(() => Boolean(filters.brandCode || filters.energyType || filters.priceBand))
const emptyDescription = computed(() => searched.value
  ? (hasFilter.value ? '当前品牌/能源/价格条件下没有可检索车型，请放宽筛选' : '没有找到相似车型')
  : '上传一张车辆照片，点击「开始识别」查看候选车型')

onMounted(async () => {
  try {
    const data = await fetchVehicleOptions()
    if (Array.isArray(data?.brands) && data.brands.length) brandOptions.value = data.brands.map((b) => ({ code: b.code, name: b.name }))
  } catch { /* 保留静态兜底 */ }
})

function handleChange(uploadFile) {
  const raw = uploadFile?.raw
  if (!raw) return
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(raw.type)) { ElMessage.error('只支持 JPG / PNG / WEBP'); return }
  if (raw.size > 10 * 1024 * 1024) { ElMessage.error('图片不能超过 10MB'); return }
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  file.value = raw
  previewUrl.value = URL.createObjectURL(raw)
  results.value = []; logId.value = null; searched.value = false
}
function clearFile() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  file.value = null; previewUrl.value = ''; results.value = []; logId.value = null; searched.value = false
}
async function runSearch() {
  if (!file.value) return
  loading.value = true
  try {
    const data = await searchVehicle({ file: file.value, ...filters })
    results.value = data?.results || []
    logId.value = data?.logId || null
    searched.value = true
    if (!results.value.length) ElMessage.info(hasFilter.value ? '当前筛选条件下没有可检索车型，可放宽筛选' : '没有找到相似车型')
  } catch (e) { ElMessage.error(e.message || '识别失败') }
  finally { loading.value = false }
}
function priceText(row) {
  const min = Number(row.guidePriceMin || 0).toFixed(2)
  const max = Number(row.guidePriceMax || 0).toFixed(2)
  return `${min}-${max} 万`
}
function scoreColor(score) { return score >= 0.86 ? '#16a34a' : score >= 0.72 ? '#d97706' : '#9ca3af' }
async function feedback(row) {
  if (!logId.value) return
  try { await sendVehicleFeedback(logId.value, 1, row.modelId); ElMessage.success('已记录反馈') }
  catch (e) { ElMessage.error(e.message || '反馈失败') }
}
</script>

<style scoped>
.title-with-tag { display: inline-flex; align-items: center; gap: 8px; }
.muted { color: #6b7280; font-size: 12px; }
.search-layout { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 20px; align-items: start; }
.query-panel { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; }
.query-upload :deep(.el-upload), .query-upload :deep(.el-upload-dragger) { width: 100%; }
.preview { position: relative; }
.preview img { width: 100%; max-height: 220px; object-fit: contain; display: block; }
.preview-mask { position: absolute; left: 0; right: 0; bottom: 0; padding: 6px; background: rgba(0,0,0,.55); color: #fff; font-size: 12px; }
.upload-empty p { margin: 8px 0; color: #374151; }
.upload-empty span { color: #9ca3af; font-size: 12px; }
.file-meta { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin: 10px 0; }
.file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #4b5563; font-size: 12px; }
.filter-form { margin-top: 8px; }
.search-btn { width: 100%; margin-top: 4px; }
.panel-note { color: #9ca3af; font-size: 11.5px; line-height: 1.6; }
.result-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.model-cell { display: flex; align-items: center; gap: 10px; }
.cover { width: 56px; height: 42px; object-fit: cover; border-radius: 6px; }
.model-name { font-weight: 600; color: #111827; }
.sim-cell { display: flex; align-items: center; gap: 8px; }
.sim-value { width: 40px; font-variant-numeric: tabular-nums; }
.sim-bar { flex: 1; }
@media (max-width: 900px) { .search-layout { grid-template-columns: 1fr; } }
</style>
