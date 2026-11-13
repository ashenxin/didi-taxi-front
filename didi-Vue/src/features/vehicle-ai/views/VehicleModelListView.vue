<template>
  <el-card class="page-card">
    <template #header>
      <div class="toolbar-row">
        <div class="title-with-tag">
          <strong>车型库</strong>
          <el-tag size="small" type="success">真实接口</el-tag>
        </div>
        <div class="header-actions">
          <el-button v-if="isSuper" type="primary" @click="openImport()">上传车型图片</el-button>
        </div>
      </div>
    </template>

    <el-form :model="query" inline @submit.prevent>
      <el-form-item label="车型"><el-input v-model="query.keyword" placeholder="品牌 / 车系 / 车型" clearable style="width: 190px" /></el-form-item>
      <el-form-item label="品牌">
        <el-select v-model="query.brandCode" placeholder="全部品牌" clearable style="width: 140px">
          <el-option v-for="b in brandOptions" :key="b.code" :label="b.name" :value="b.code" />
        </el-select>
      </el-form-item>
      <el-form-item label="能源">
        <el-select v-model="query.energyType" placeholder="全部能源" clearable style="width: 120px">
          <el-option v-for="e in energyOptions" :key="e.code" :label="e.name" :value="e.code" />
        </el-select>
      </el-form-item>
      <el-form-item label="车身">
        <el-select v-model="query.bodyType" placeholder="全部车身" clearable style="width: 110px">
          <el-option v-for="b in bodyOptions" :key="b.code" :label="b.name" :value="b.code" />
        </el-select>
      </el-form-item>
      <el-form-item label="价格">
        <el-select v-model="query.priceBand" placeholder="全部价格" clearable style="width: 125px">
          <el-option v-for="p in priceBands" :key="p.code" :label="p.label" :value="p.code" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="query.status" placeholder="全部状态" clearable style="width: 110px">
          <el-option label="已发布" :value="1" /><el-option label="草稿" :value="0" /><el-option label="下架" :value="2" />
        </el-select>
      </el-form-item>
      <el-form-item><el-button type="primary" @click="load(1)">查询</el-button><el-button @click="resetQuery">重置</el-button></el-form-item>
    </el-form>

    <el-table v-loading="loading" :data="rows" stripe style="width: 100%">
      <el-table-column label="图片" width="92">
        <template #default="{ row }"><img v-if="row.coverImageUrl" :src="row.coverImageUrl" class="cover" alt="" /><VehicleThumb v-else variant="sedan" color="#6b7280" /></template>
      </el-table-column>
      <el-table-column label="车型" min-width="210">
        <template #default="{ row }">
          <div class="model-name">{{ row.modelName }}</div>
          <div class="muted">{{ row.seriesName }} · {{ row.modelYear }} 款</div>
          <div v-if="row.trimTags?.length" class="tag-row"><el-tag v-for="tag in row.trimTags" :key="tag" size="small" type="info">{{ tag }}</el-tag></div>
        </template>
      </el-table-column>
      <el-table-column prop="brandName" label="品牌" width="90" />
      <el-table-column label="指导价" width="140"><template #default="{ row }">{{ priceText(row) }}</template></el-table-column>
      <el-table-column label="能源 / 车身" width="120"><template #default="{ row }">{{ row.energyTypeText }} · {{ row.bodyTypeText }}</template></el-table-column>
      <el-table-column label="图片数" width="80" align="center"><template #default="{ row }">{{ row.imageCount }}</template></el-table-column>
      <el-table-column label="索引" width="110">
        <template #default="{ row }"><el-tag size="small" :type="row.indexedImageCount > 0 ? 'success' : 'info'">{{ row.indexedImageCount }}/{{ row.imageCount }}</el-tag></template>
      </el-table-column>
      <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag size="small" :type="row.status === 1 ? 'success' : 'info'">{{ row.statusText }}</el-tag></template></el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }"><el-button v-if="isSuper" link type="primary" @click="openImport(row)">上传图片</el-button></template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination v-model:current-page="pageNo" v-model:page-size="pageSize" layout="total, sizes, prev, pager, next" :total="total" :page-sizes="[10, 20, 50]" @current-change="load()" @size-change="load(1)" />
    </div>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="680px" destroy-on-close @closed="resetDialog">
      <el-radio-group v-model="dialogMode" class="mode-switch">
        <el-radio-button value="existing">选择已有车型</el-radio-button>
        <el-radio-button value="new">新建车型</el-radio-button>
      </el-radio-group>

      <div v-if="dialogMode === 'existing'" class="dialog-block">
        <el-form label-width="90px">
          <el-form-item label="车型">
            <el-select v-model="selectedModelId" placeholder="搜索并选择车型" filterable clearable style="width: 100%">
              <el-option v-for="row in rows" :key="row.id" :label="`${row.brandName} ${row.modelName} · ${row.modelYear} 款`" :value="row.id" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="selectedModel" label="当前参数">
            <div class="param-line"><el-tag size="small" type="info">{{ selectedModel.brandName }}</el-tag><el-tag size="small" type="info">{{ priceText(selectedModel) }}</el-tag><el-tag size="small" type="info">{{ selectedModel.energyTypeText }}</el-tag></div>
          </el-form-item>
          <el-form-item v-if="selectedModel" label="配置亮点">
            <div v-if="selectedModel.trimTags?.length" class="param-line"><el-tag v-for="tag in selectedModel.trimTags" :key="tag" size="small" type="success">{{ tag }}</el-tag></div>
            <span v-else class="muted">未填写</span>
          </el-form-item>
        </el-form>
      </div>

      <div v-else class="dialog-block">
        <el-form label-width="90px">
          <div class="form-grid">
            <el-form-item label="品牌编码" required>
              <el-autocomplete
                v-model="newModel.brandCode"
                :fetch-suggestions="brandSuggestions"
                placeholder="输入品牌编码，如 benchi"
                clearable
                style="width: 100%"
                @select="onBrandSelect"
                @blur="onBrandChange(newModel.brandCode)"
              >
                <template #default="{ item }">
                  <span>{{ item.name }}</span>
                  <span class="brand-code">{{ item.code }}</span>
                </template>
              </el-autocomplete>
            </el-form-item>
            <el-form-item label="品牌名称" required>
              <el-input v-model="newModel.brandName" :disabled="brandExists" placeholder="新品牌请填名称，如 宝马" />
            </el-form-item>
            <el-form-item label="车系" required><el-input v-model="newModel.seriesName" placeholder="如 汉" /></el-form-item>
            <el-form-item label="车型" required><el-input v-model="newModel.modelName" placeholder="如 汉 EV" /></el-form-item>
            <el-form-item label="车型编码" required>
              <el-input v-model="newModel.modelCode" placeholder="如 benchi-c-2026-donggan" />
              <div class="form-tip">全局唯一；同一品牌可建多款，用不同编码区分年款/配置</div>
            </el-form-item>
            <el-form-item label="年款" required><el-input-number v-model="newModel.modelYear" :min="2000" :max="2030" style="width: 100%" /></el-form-item>
            <el-form-item label="价格下限" required><el-input-number v-model="newModel.guidePriceMin" :min="0" :precision="2" :step="0.5" style="width: 100%" /></el-form-item>
            <el-form-item label="价格上限" required><el-input-number v-model="newModel.guidePriceMax" :min="0" :precision="2" :step="0.5" style="width: 100%" /></el-form-item>
            <el-form-item label="能源" required><el-select v-model="newModel.energyType" style="width: 100%"><el-option v-for="e in energyOptions" :key="e.code" :label="e.name" :value="e.code" /></el-select></el-form-item>
            <el-form-item label="车身" required><el-select v-model="newModel.bodyType" style="width: 100%"><el-option v-for="b in bodyOptions" :key="b.code" :label="b.name" :value="b.code" /></el-select></el-form-item>
          </div>
        </el-form>
      </div>

      <div class="dialog-block">
        <el-form label-width="90px">
          <div class="form-grid">
            <el-form-item label="拍摄角度" required><el-select v-model="angle" style="width: 100%"><el-option v-for="a in shotAngles" :key="a.code" :label="a.name" :value="a.code" /></el-select></el-form-item>
            <el-form-item v-if="dialogMode === 'new'" label="配置亮点"><el-input v-model="tags" placeholder="如：刀片电池、云辇-C；逗号分隔，可留空" /></el-form-item>
          </div>
        </el-form>
        <el-upload v-model:file-list="fileList" drag multiple :auto-upload="false" accept="image/jpeg,image/png,image/webp" :limit="10" class="import-upload">
          <div class="upload-empty"><p>拖拽多张图片到这里，或点击选择</p><span>JPG / PNG / WEBP，单张 ≤ 10MB；单次最多 10 张</span></div>
        </el-upload>
        <div v-if="importing" class="task-block"><span>正在逐张处理：校验 → MinIO → DashScope → Milvus…</span></div>
        <div v-if="importResult" class="task-block">
          <div class="task-head"><span>共 {{ importResult.total }} 张</span><el-tag size="small" type="success">已处理</el-tag></div>
          <p class="task-note">成功 {{ importResult.success }} · 失败 {{ importResult.failed }} · 跳过 {{ importResult.skipped }}</p>
          <ul class="result-list"><li v-for="item in importResult.items" :key="item.fileName"><span class="result-name">{{ item.fileName }}</span><el-tag size="small" :type="item.result === 'SUCCESS' ? 'success' : item.result === 'SKIPPED' ? 'info' : 'danger'">{{ item.result }}</el-tag><span v-if="item.errorMsg" class="result-error">{{ item.errorMsg }}</span></li></ul>
        </div>
      </div>

      <template #footer><el-button @click="dialogVisible = false">关闭</el-button><el-button type="primary" :disabled="!canSubmit" :loading="importing" @click="submitImport">开始上传</el-button></template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import VehicleThumb from '../components/VehicleThumb.vue'
import { adminMe, loadAdminMe } from '../../../stores/adminSession'
import { vehicleBrands, energyOptions, bodyOptions, priceBands, shotAngles } from '../data/vehicleAiOptions'
import { fetchVehicleModels, createVehicleModel, importVehicleImages, fetchVehicleOptions } from '../api/vehicleAiApi'

const isSuper = computed(() => (adminMe.value?.roleCodes || []).includes('SUPER'))
const rows = ref([]); const total = ref(0); const pageNo = ref(1); const pageSize = ref(10); const loading = ref(false)
const query = reactive({ keyword: '', brandCode: '', energyType: null, bodyType: null, priceBand: null, status: null })
const dialogVisible = ref(false); const dialogMode = ref('existing'); const selectedModelId = ref(null)
const fileList = ref([]); const angle = ref(2); const tags = ref(''); const importing = ref(false); const importResult = ref(null)
const newModel = reactive({ brandCode: 'byd', brandName: '比亚迪', seriesName: '汉', modelName: '汉 EV', modelCode: '', modelYear: 2025, guidePriceMin: 17.98, guidePriceMax: 23.58, energyType: 2, bodyType: 1 })

const selectedModel = computed(() => rows.value.find((r) => r.id === selectedModelId.value) || null)
const brandOptions = ref([...vehicleBrands])
const brandExists = computed(() => brandOptions.value.some((b) => b.code === newModel.brandCode))
const dialogTitle = computed(() => dialogMode.value === 'existing' ? '上传车型图片 · 已有车型' : '上传车型图片 · 新建车型')
const canSubmit = computed(() => {
  if (!fileList.value.length) return false
  if (dialogMode.value === 'existing') return !!selectedModel.value
  return !!(newModel.brandCode && newModel.brandName && newModel.seriesName && newModel.modelName && newModel.modelCode)
})

onMounted(() => { loadAdminMe({ force: true }).catch(() => {}); loadBrandOptions(); load(1) })

async function loadBrandOptions() {
  try {
    const data = await fetchVehicleOptions()
    if (Array.isArray(data?.brands) && data.brands.length) {
      brandOptions.value = data.brands.map((b) => ({ code: b.code, name: b.name }))
    }
  } catch { /* 保留静态兜底 */ }
}

async function load(page = pageNo.value) {
  pageNo.value = page; loading.value = true
  try {
    const data = await fetchVehicleModels({ pageNo: pageNo.value, pageSize: pageSize.value, ...query })
    rows.value = data?.list || []; total.value = Number(data?.total || 0)
  } catch (e) { ElMessage.error(e.message || '车型列表加载失败') }
  finally { loading.value = false }
}
function resetQuery() {
  Object.assign(query, { keyword: '', brandCode: '', energyType: null, bodyType: null, priceBand: null, status: null }); load(1)
}
function brandSuggestions(query, cb) {
  const q = String(query || '').toLowerCase()
  cb(brandOptions.value
    .filter((b) => !q || b.code.includes(q) || b.name.includes(q))
    .map((b) => ({ ...b, value: b.code })))
}
function onBrandSelect(item) {
  newModel.brandCode = item.code
  newModel.brandName = item.name
}
function onBrandChange(code) {
  const hit = brandOptions.value.find((b) => b.code === code)
  newModel.brandName = hit ? hit.name : ''
}
function openImport(row) {
  dialogVisible.value = true; dialogMode.value = 'existing'; selectedModelId.value = row?.id || null
  fileList.value = []; importing.value = false; importResult.value = null; angle.value = 2; tags.value = ''
}
function resetDialog() { fileList.value = []; importing.value = false; importResult.value = null; selectedModelId.value = null; dialogMode.value = 'existing' }

watch(angle, (value, oldValue) => {
  if (value !== oldValue && fileList.value.length) {
    fileList.value = []
    ElMessage.info('拍摄角度已切换，请重新选择该角度的图片')
  }
})

async function submitImport() {
  if (!canSubmit.value) return
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(newModel.brandCode)) {
    ElMessage.error('品牌编码只能使用字母、数字、下划线或短横线')
    return
  }
  importing.value = true; importResult.value = null
  try {
    let modelId = selectedModelId.value
    if (dialogMode.value === 'new') {
      const created = await createVehicleModel({ ...newModel, trimTags: tags.value.split(/[,，]/).map((t) => t.trim()).filter(Boolean) })
      modelId = created?.id
      if (!modelId) throw new Error('新建车型失败')
      // 新建成功后切到“已有车型”，避免再次点击上传时重复创建同一 modelCode
      dialogMode.value = 'existing'
      selectedModelId.value = modelId
      // 为下一款车型清空唯一编码和名称，品牌/车系保留，方便同品牌继续建款
      newModel.modelCode = ''
      newModel.modelName = ''
      await loadBrandOptions()
      await load(1)
    }
    const files = fileList.value.map((f) => f.raw).filter(Boolean)
    importResult.value = await importVehicleImages({ modelId, shotAngle: angle.value, tags: tags.value, files })
    if ((importResult.value.success || 0) + (importResult.value.skipped || 0) > 0) {
      fileList.value = []
    }
    ElMessage.success(`已处理 ${importResult.value.total} 张图片，请选择下一角度图片`)
    await load()
  } catch (e) {
    if (e.code === 409) ElMessage.warning('车型编码已存在，请切换到“选择已有车型”后继续上传')
    else ElMessage.error(e.message || '导入失败')
  } finally { importing.value = false }
}
function priceText(row) { return `${Number(row.guidePriceMin || 0).toFixed(2)}-${Number(row.guidePriceMax || 0).toFixed(2)} 万` }
</script>

<style scoped>
.title-with-tag { display: inline-flex; align-items: center; gap: 8px; }
.header-actions { display: inline-flex; align-items: center; gap: 12px; }
.muted { color: #6b7280; font-size: 12px; }
.brand-code { float: right; color: #9ca3af; font-size: 12px; }
.model-name { font-weight: 600; color: #111827; }
.tag-row { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.cover { width: 56px; height: 42px; object-fit: cover; border-radius: 6px; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.mode-switch { margin-bottom: 14px; }
.param-line { display: flex; flex-wrap: wrap; gap: 6px; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 12px; }
.form-tip { color: #9ca3af; font-size: 11px; line-height: 1.5; margin-top: 4px; }
.import-upload { margin-top: 4px; }
.import-upload :deep(.el-upload), .import-upload :deep(.el-upload-dragger) { width: 100%; }
.upload-empty p { font-size: 13px; color: #374151; }
.upload-empty span { font-size: 11.5px; color: #9ca3af; }
.task-block { margin-top: 12px; padding: 10px 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 12.5px; color: #4b5563; }
.task-head { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
.task-note { color: #9ca3af; font-size: 11.5px; }
.result-list { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; max-height: 160px; overflow-y: auto; }
.result-list li { display: flex; align-items: center; gap: 8px; font-size: 11.5px; }
.result-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.result-error { color: #d92d20; }
@media (max-width: 760px) { .form-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
