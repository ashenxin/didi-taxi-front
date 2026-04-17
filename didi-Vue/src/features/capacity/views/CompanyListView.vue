<template>
  <el-card class="page-card">
    <template #header>
      <div class="toolbar-row">
        <strong>运力公司</strong>
        <el-button type="primary" @click="openCreate">新增</el-button>
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
      <el-table-column prop="teamId" label="车队编码" width="100" />
      <el-table-column prop="companyNo" label="公司编号" min-width="140" />
      <el-table-column prop="companyName" label="公司名称" min-width="200" />
      <el-table-column label="省 / 市" min-width="150">
        <template #default="{ row }">
          <span :title="formatCompanyRegionHint(row)">
            {{ formatCompanyProvinceCity(row) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="team" label="车队" min-width="140" />
      <el-table-column label="操作" width="260" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="goDrivers(row)">查看司机</el-button>
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="confirmDelete(row)">删除</el-button>
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

    <el-dialog v-model="createVisible" title="新增运力（公司 + 车队）" width="520px" destroy-on-close @closed="resetCreateForm">
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="100px">
        <el-form-item label="省市">
          <ProvinceCityCascader
            v-model:province-code="createForm.provinceCode"
            v-model:city-code="createForm.cityCode"
            width="100%"
          />
        </el-form-item>
        <el-form-item label="公司编号" prop="companyNo">
          <el-input v-model="createForm.companyNo" placeholder="必填" maxlength="32" show-word-limit />
        </el-form-item>
        <el-form-item label="公司名称" prop="companyName">
          <el-input v-model="createForm.companyName" placeholder="必填" maxlength="128" show-word-limit />
        </el-form-item>
        <el-form-item label="车队名称" prop="team">
          <el-input v-model="createForm.team" placeholder="必填" maxlength="128" show-word-limit />
        </el-form-item>
        <el-form-item label="车队编码">
          <el-input
            v-model="createForm.teamIdInput"
            placeholder="留空则系统自动生成（全库唯一）"
            clearable
          />
          <div class="form-tip">业务编码，与数据库主键 ID 不同；全库不可重复。</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="createLoading" @click="submitCreate">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editVisible" title="编辑运力" width="520px" destroy-on-close @closed="resetEditForm">
      <el-form ref="editFormRef" :model="editForm" :rules="editRules" label-width="100px">
        <el-form-item label="公司编号">
          <el-input :model-value="editForm.companyNo" disabled />
        </el-form-item>
        <el-form-item label="车队编码">
          <el-input :model-value="editForm.teamId" disabled />
        </el-form-item>
        <el-form-item label="公司名称" prop="companyName">
          <el-input v-model="editForm.companyName" placeholder="必填" maxlength="128" show-word-limit />
        </el-form-item>
        <el-form-item label="车队名称" prop="team">
          <el-input v-model="editForm.team" placeholder="必填" maxlength="128" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="editLoading" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { createCompany, deleteCompany, fetchCompanyPage, updateCompany } from '../api/capacityApi'
import ProvinceCityCascader from '../../../components/ProvinceCityCascader.vue'
import {
  formatCompanyProvinceCity,
  formatCompanyRegionHint,
  gbProvinceCityNames
} from '../../../utils/regionCodes'

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

const createVisible = ref(false)
const createLoading = ref(false)
const createFormRef = ref(null)
const createForm = reactive({
  provinceCode: '',
  cityCode: '',
  companyNo: '',
  companyName: '',
  team: '',
  teamIdInput: ''
})

const createRules = {
  companyNo: [{ required: true, message: '请输入公司编号', trigger: 'blur' }],
  companyName: [{ required: true, message: '请输入公司名称', trigger: 'blur' }],
  team: [{ required: true, message: '请输入车队名称', trigger: 'blur' }]
}

const editVisible = ref(false)
const editLoading = ref(false)
const editFormRef = ref(null)
const editForm = reactive({
  id: null,
  companyNo: '',
  teamId: '',
  companyName: '',
  team: ''
})

const editRules = {
  companyName: [{ required: true, message: '请输入公司名称', trigger: 'blur' }],
  team: [{ required: true, message: '请输入车队名称', trigger: 'blur' }]
}

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

const openCreate = () => {
  resetCreateForm()
  createVisible.value = true
}

const resetCreateForm = () => {
  createForm.provinceCode = ''
  createForm.cityCode = ''
  createForm.companyNo = ''
  createForm.companyName = ''
  createForm.team = ''
  createForm.teamIdInput = ''
}

const submitCreate = async () => {
  try {
    await createFormRef.value?.validate()
  } catch {
    return
  }
  if (!createForm.provinceCode || !createForm.cityCode) {
    ElMessage.warning('请选择省市')
    return
  }
  const { provinceName, cityName } = gbProvinceCityNames(createForm.provinceCode, createForm.cityCode)
  if (!provinceName || !cityName) {
    ElMessage.warning('无法解析省市名称，请重新选择')
    return
  }
  let teamId = undefined
  const raw = String(createForm.teamIdInput || '').trim()
  if (raw) {
    const n = Number(raw)
    if (!Number.isInteger(n) || n <= 0) {
      ElMessage.warning('车队编码须为正整数')
      return
    }
    teamId = n
  }
  const payload = {
    provinceCode: createForm.provinceCode,
    provinceName,
    cityCode: createForm.cityCode,
    cityName,
    companyNo: createForm.companyNo.trim(),
    companyName: createForm.companyName.trim(),
    team: createForm.team.trim()
  }
  if (teamId !== undefined) payload.teamId = teamId

  createLoading.value = true
  try {
    await createCompany(payload)
    ElMessage.success('创建成功')
    createVisible.value = false
    search()
  } catch (e) {
    ElMessage.error(e.message || '创建失败')
  } finally {
    createLoading.value = false
  }
}

const openEdit = (row) => {
  editForm.id = row.id
  editForm.companyNo = row.companyNo || ''
  editForm.teamId = row.teamId != null ? String(row.teamId) : ''
  editForm.companyName = row.companyName || ''
  editForm.team = row.team || ''
  editVisible.value = true
}

const resetEditForm = () => {
  editForm.id = null
  editForm.companyNo = ''
  editForm.teamId = ''
  editForm.companyName = ''
  editForm.team = ''
}

const submitEdit = async () => {
  try {
    await editFormRef.value?.validate()
  } catch {
    return
  }
  if (editForm.id == null) return
  editLoading.value = true
  try {
    await updateCompany(editForm.id, {
      companyName: editForm.companyName.trim(),
      team: editForm.team.trim()
    })
    ElMessage.success('保存成功')
    editVisible.value = false
    search()
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    editLoading.value = false
  }
}

const confirmDelete = (row) => {
  ElMessageBox.confirm(
    `确定删除「${row.companyName || ''}」下的车队「${row.team || ''}」吗？（存在归属司机时不可删）`,
    '删除确认',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
  )
    .then(() => deleteCompany(row.id))
    .then(() => {
      ElMessage.success('已删除')
      search()
    })
    .catch((e) => {
      if (e === 'cancel' || e === 'close') return
      ElMessage.error(e?.message || '删除失败')
    })
}

onMounted(() => search())
</script>

<style scoped>
.form-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
  margin-top: 4px;
}
</style>
