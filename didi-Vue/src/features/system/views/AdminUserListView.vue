<template>
  <el-card class="page-card">
    <template #header>
      <div class="toolbar-row">
        <strong>管理员</strong>
        <el-button v-if="canManage" type="primary" @click="openCreate">新建</el-button>
      </div>
    </template>

    <el-form v-if="canManage" :inline="true" class="filter-form" @submit.prevent="loadPage">
      <el-form-item v-if="is_SUPER" label="省市">
        <ProvinceCityCascader
          v-model:province-code="filters.provinceCode"
          v-model:city-code="filters.cityCode"
          width="280px"
        />
      </el-form-item>
      <el-form-item v-if="!is_SUPER && provinceLabel" label="管辖">
        <span>{{ provinceLabel }}</span>
      </el-form-item>
      <el-form-item v-if="!is_SUPER" label="城市">
        <ProvinceCityCascader
          lock-province
          :locked-province-code="me?.provinceCode || ''"
          v-model:province-code="filters.provinceCode"
          v-model:city-code="filters.cityCode"
          width="280px"
        />
      </el-form-item>
      <el-form-item v-if="is_SUPER" label="角色">
        <el-select v-model="filters.roleCode" placeholder="全部" clearable style="width: 150px">
          <el-option label="省管理员" value="PROVINCE_ADMIN" />
          <el-option label="市管理员" value="CITY_OPERATOR" />
        </el-select>
      </el-form-item>
      <el-form-item label="登录名">
        <el-input v-model="filters.username" placeholder="模糊" clearable style="width: 140px" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="loadPage">查询</el-button>
      </el-form-item>
    </el-form>

    <el-table v-loading="loading" :data="rows" border stripe style="width: 100%">
      <el-table-column prop="username" label="登录名" min-width="120" />
      <el-table-column prop="displayName" label="显示名" min-width="120" />
      <el-table-column prop="roleCode" label="角色" width="140">
        <template #default="{ row }">{{ roleLabel(row.roleCode) }}</template>
      </el-table-column>
      <el-table-column label="省 / 市" min-width="160">
        <template #default="{ row }">
          <span :title="formatGbRegionTitle(row.provinceCode, row.cityCode)">
            {{ formatGbRegionTitle(row.provinceCode, row.cityCode) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="90">
        <template #default="{ row }">{{ row.status === 1 ? '正常' : '停用' }}</template>
      </el-table-column>
      <el-table-column v-if="canManage" label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="confirmDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination
        v-model:current-page="pageNo"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        @current-change="loadPage"
        @size-change="loadPage"
      />
    </div>

    <el-dialog v-model="dialogVisible" :title="dialogMode === 'create' ? '新建管理员' : '编辑'" width="520px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="dynamicRules" label-width="100px">
        <el-form-item v-if="dialogMode === 'create'" label="登录名" prop="username">
          <el-input v-model="form.username" autocomplete="off" />
        </el-form-item>
        <el-form-item v-if="dialogMode === 'create'" label="密码" prop="password">
          <el-input v-model="form.password" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <el-form-item v-if="dialogMode === 'create' && is_SUPER" label="角色" prop="roleCode">
          <el-select v-model="form.roleCode" style="width: 100%">
            <el-option label="省管理员" value="PROVINCE_ADMIN" />
            <el-option label="市管理员" value="CITY_OPERATOR" />
          </el-select>
        </el-form-item>
        <el-form-item label="显示名" prop="displayName">
          <el-input v-model="form.displayName" />
        </el-form-item>
        <el-form-item v-if="showProvinceField || showCityField" label="省市" prop="provinceCode">
          <ProvinceCityCascader
            v-model:province-code="form.provinceCode"
            v-model:city-code="form.cityCode"
            :allow-province-only="form.roleCode === 'PROVINCE_ADMIN'"
            width="100%"
          />
        </el-form-item>
        <el-form-item v-if="dialogMode === 'edit'" label="状态">
          <el-radio-group v-model="form.status">
            <el-radio :label="1">正常</el-radio>
            <el-radio :label="0">停用</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="dialogMode === 'edit'" label="重置密码">
          <el-input v-model="form.password" type="password" show-password placeholder="留空不修改" autocomplete="new-password" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { fetchMe } from '../../auth/api/authApi'
import {
  createAdminStaff,
  deleteAdminStaff,
  fetchAdminStaffPage,
  getAdminStaff,
  updateAdminStaff
} from '../api/systemAdminUserApi'
import ProvinceCityCascader from '../../../components/ProvinceCityCascader.vue'
import { formatGbRegionTitle } from '../../../utils/regionCodes'

const me = ref(null)
const is_SUPER = computed(() => me.value?.roleCodes?.includes('SUPER'))
const is_PROVINCE = computed(() => me.value?.roleCodes?.includes('PROVINCE_ADMIN'))
const canManage = computed(() => is_SUPER.value || is_PROVINCE.value)
const provinceLabel = computed(() =>
  me.value?.provinceCode ? formatGbRegionTitle(me.value.provinceCode, '') : ''
)

const loading = ref(false)
const rows = ref([])
const total = ref(0)
const pageNo = ref(1)
const pageSize = ref(10)

const filters = reactive({
  provinceCode: '',
  cityCode: '',
  username: '',
  roleCode: ''
})

const dialogVisible = ref(false)
const dialogMode = ref('create')
const editingId = ref(null)
const saving = ref(false)
const formRef = ref(null)

const form = reactive({
  username: '',
  password: '',
  roleCode: 'CITY_OPERATOR',
  displayName: '',
  provinceCode: '',
  cityCode: '',
  status: 1
})

const showProvinceField = computed(() => {
  if (dialogMode.value === 'create') return true
  return is_SUPER.value && form.roleCode === 'PROVINCE_ADMIN'
})

const showCityField = computed(() => form.roleCode === 'CITY_OPERATOR')

const dynamicRules = computed(() => {
  if (dialogMode.value === 'edit') {
    return {}
  }
  const r = {
    username: [{ required: true, message: '必填', trigger: 'blur' }],
    password: [{ required: true, message: '必填', trigger: 'blur' }],
    provinceCode: [
      { required: true, message: '请选择省', trigger: 'change' },
      {
        validator: (_rule, _val, cb) => {
          if (form.roleCode === 'CITY_OPERATOR' && !form.cityCode?.trim()) {
            cb(new Error('市管理员请选择市/区'))
          } else cb()
        },
        trigger: 'change'
      }
    ]
  }
  if (is_SUPER.value) {
    r.roleCode = [{ required: true, message: '必选', trigger: 'change' }]
  }
  return r
})

watch(
  () => form.roleCode,
  () => {
    if (form.roleCode === 'PROVINCE_ADMIN') {
      form.cityCode = ''
    }
  }
)

function roleLabel(code) {
  if (code === 'PROVINCE_ADMIN') return '省管理员'
  if (code === 'CITY_OPERATOR') return '市管理员'
  return code || '—'
}

async function loadMe() {
  try {
    me.value = await fetchMe()
  } catch {
    me.value = null
  }
}

async function loadPage() {
  if (!canManage.value) return
  loading.value = true
  try {
    const params = {
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      username: filters.username || undefined,
      cityCode: filters.cityCode || undefined
    }
    if (is_SUPER.value) {
      params.provinceCode = filters.provinceCode || undefined
      params.roleCode = filters.roleCode || undefined
    } else if (me.value?.provinceCode) {
      params.provinceCode = me.value.provinceCode
    }
    const data = await fetchAdminStaffPage(params)
    rows.value = data?.list || []
    total.value = data?.total ?? 0
  } catch (e) {
    ElMessage.error(e.message || '加载失败')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  dialogMode.value = 'create'
  editingId.value = null
  form.username = ''
  form.password = ''
  form.roleCode = is_SUPER.value ? 'PROVINCE_ADMIN' : 'CITY_OPERATOR'
  form.displayName = ''
  form.provinceCode = is_SUPER.value ? '' : (me.value?.provinceCode || '')
  form.cityCode = ''
  form.status = 1
  dialogVisible.value = true
}

async function openEdit(row) {
  dialogMode.value = 'edit'
  editingId.value = row.id
  loading.value = true
  try {
    const u = await getAdminStaff(row.id)
    form.username = u.username
    form.password = ''
    form.roleCode = u.roleCode
    form.displayName = u.displayName || ''
    form.provinceCode = u.provinceCode || ''
    form.cityCode = u.cityCode || ''
    form.status = u.status ?? 1
    dialogVisible.value = true
  } catch (e) {
    ElMessage.error(e.message || '加载详情失败')
  } finally {
    loading.value = false
  }
}

async function submitForm() {
  await formRef.value?.validate().catch(() => Promise.reject())
  saving.value = true
  try {
    if (dialogMode.value === 'create') {
      const body = {
        username: form.username.trim(),
        password: form.password,
        displayName: form.displayName || undefined,
        roleCode: form.roleCode,
        provinceCode: form.provinceCode?.trim(),
        cityCode: form.roleCode === 'CITY_OPERATOR' ? form.cityCode?.trim() : undefined
      }
      await createAdminStaff(body)
      ElMessage.success('已创建')
    } else {
      const payload = {
        displayName: form.displayName || undefined,
        status: form.status,
        password: form.password || undefined
      }
      if (is_SUPER.value) {
        payload.provinceCode = form.provinceCode || undefined
        payload.cityCode = form.roleCode === 'CITY_OPERATOR' ? form.cityCode || undefined : undefined
      } else if (form.roleCode === 'CITY_OPERATOR') {
        payload.cityCode = form.cityCode || undefined
      }
      await updateAdminStaff(editingId.value, payload)
      ElMessage.success('已保存')
    }
    dialogVisible.value = false
    await loadPage()
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function confirmDelete(row) {
  try {
    await ElMessageBox.confirm(`确定删除「${row.username}」？`, '删除', { type: 'warning' })
  } catch {
    return
  }
  try {
    await deleteAdminStaff(row.id)
    ElMessage.success('已删除')
    await loadPage()
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  }
}

onMounted(async () => {
  await loadMe()
  await loadPage()
})
</script>

<style scoped>
.filter-form {
  margin-bottom: 12px;
}

.pager {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
