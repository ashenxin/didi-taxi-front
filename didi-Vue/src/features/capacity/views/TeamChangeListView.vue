<template>
  <el-card class="page-card">
    <template #header>
      <div class="toolbar-row">
        <strong>换队申请</strong>
        <div style="display: flex; gap: 8px; align-items: center">
          <el-tag v-if="query.status === 'PENDING'" type="warning" effect="plain">默认仅待审核</el-tag>
          <el-button @click="reloadAll">刷新</el-button>
        </div>
      </div>
    </template>

    <el-alert
      v-if="showPendingBanner"
      type="warning"
      show-icon
      :closable="false"
      class="pending-banner"
      :title="`当前共有 ${tableTotal} 条待审核换队申请，请及时处理。`"
    />

    <el-form :model="query" inline class="filter-form" @submit.prevent>
      <el-form-item label="状态">
        <el-select v-model="query.status" placeholder="默认待审核" style="width: 140px">
          <el-option label="待审核" value="PENDING" />
          <el-option label="全部" value="ALL" />
          <el-option label="已通过" value="APPROVED" />
          <el-option label="已拒绝" value="REJECTED" />
        </el-select>
      </el-form-item>
      <el-form-item label="司机手机">
        <el-input v-model="query.driverPhone" placeholder="模糊匹配" clearable style="width: 160px" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" native-type="button" @click="onSearch">查询</el-button>
        <el-button native-type="button" @click.prevent="reset">重置</el-button>
      </el-form-item>
    </el-form>

    <el-table :data="tableData" stripe style="width: 100%">
      <el-table-column prop="id" label="申请ID" width="90" />
      <el-table-column prop="driverName" label="司机" min-width="100" />
      <el-table-column prop="driverPhone" label="手机号" min-width="120" />
      <el-table-column prop="fromTeamName" label="原车队/运力" min-width="130" show-overflow-tooltip />
      <el-table-column prop="toTeamName" label="目标车队/运力" min-width="130" show-overflow-tooltip />
      <el-table-column prop="companyName" label="目标公司" min-width="120" show-overflow-tooltip />
      <el-table-column prop="requestReason" label="申请说明" min-width="140" show-overflow-tooltip />
      <el-table-column label="申请时间" min-width="165">
        <template #default="{ row }">{{ fmtTime(row.requestedAt) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">{{ teamChangeStatusLabel(row.status) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <template v-if="row.status === 'PENDING'">
            <el-button link type="success" @click="openApprove(row)">同意</el-button>
            <el-button link type="danger" @click="openReject(row)">拒绝</el-button>
          </template>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
    </el-table>

    <div style="display: flex; justify-content: flex-end; margin-top: 16px">
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

    <el-dialog v-model="approveVisible" title="同意换队" width="420px" destroy-on-close @closed="approveRow = null">
      <p v-if="approveRow">司机「{{ approveRow.driverName }}」将加入目标运力，确认同意？</p>
      <el-form>
        <el-form-item label="备注（可选）">
          <el-input v-model="approveRemark" type="textarea" :rows="2" placeholder="可空" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="approveVisible = false">取消</el-button>
        <el-button type="primary" :loading="actionLoading" @click="doApprove">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="rejectVisible" title="拒绝换队" width="420px" destroy-on-close @closed="rejectRow = null">
      <p v-if="rejectRow">拒绝后司机保持解绑且不可接单（按业务规则）。</p>
      <el-form>
        <el-form-item label="原因" required>
          <el-input v-model="rejectReason" type="textarea" :rows="3" placeholder="必填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectVisible = false">取消</el-button>
        <el-button type="danger" :loading="actionLoading" @click="doReject">确定拒绝</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  approveTeamChange,
  fetchTeamChangePage,
  rejectTeamChange
} from '../api/capacityApi'
import { usePendingTeamChange } from '../../../composables/usePendingTeamChange'

const { refresh: refreshPendingCount } = usePendingTeamChange()

const pageNo = ref(1)
const pageSize = ref(10)
const total = ref(0)
const tableData = ref([])

const query = reactive({
  status: 'PENDING',
  driverPhone: ''
})

const tableTotal = ref(0)
const showPendingBanner = computed(() => {
  const st = query.status
  const pendingScope = st === 'PENDING'
  return pendingScope && tableTotal.value > 0
})

const fmtTime = (v) => {
  if (v == null || v === '') return '—'
  if (typeof v === 'string') return v.replace('T', ' ').slice(0, 19)
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('zh-CN', { hour12: false })
}

const TEAM_CHANGE_STATUS_LABEL = {
  PENDING: '待审核',
  APPROVED: '已通过',
  REJECTED: '已拒绝',
  CANCELLED: '已取消'
}

const teamChangeStatusLabel = (code) => {
  if (code == null || code === '') return '—'
  return TEAM_CHANGE_STATUS_LABEL[code] || String(code)
}

const search = () => {
  const status = query.status === 'ALL' ? undefined : query.status
  fetchTeamChangePage({
    pageNo: pageNo.value,
    pageSize: pageSize.value,
    status,
    driverPhone: query.driverPhone || undefined
  })
    .then((res) => {
      tableData.value = res.list || []
      total.value = res.total || 0
      tableTotal.value = total.value
    })
    .catch((e) => ElMessage.error(e.message || '查询失败'))
}

const onSearch = () => {
  pageNo.value = 1
  search()
}

const reset = () => {
  query.status = 'PENDING'
  query.driverPhone = ''
  pageNo.value = 1
  pageSize.value = 10
  search()
}

const onSizeChange = () => {
  pageNo.value = 1
  search()
}

const reloadAll = ({ forcePendingCount = false } = {}) => {
  search()
  refreshPendingCount({ force: forcePendingCount })
}

onMounted(() => {
  reloadAll({ forcePendingCount: true })
})

const approveVisible = ref(false)
const rejectVisible = ref(false)
const approveRow = ref(null)
const rejectRow = ref(null)
const approveRemark = ref('')
const rejectReason = ref('')
const actionLoading = ref(false)

const openApprove = (row) => {
  approveRow.value = row
  approveRemark.value = ''
  approveVisible.value = true
}

const openReject = (row) => {
  rejectRow.value = row
  rejectReason.value = ''
  rejectVisible.value = true
}

const doApprove = async () => {
  const row = approveRow.value
  if (!row) return
  actionLoading.value = true
  try {
    const payload = {}
    if (approveRemark.value.trim()) payload.reviewReason = approveRemark.value.trim()
    await approveTeamChange(row.id, payload)
    ElMessage.success('已通过')
    approveVisible.value = false
    reloadAll({ forcePendingCount: true })
  } catch (e) {
    ElMessage.error(e.message || '操作失败')
  } finally {
    actionLoading.value = false
  }
}

const doReject = async () => {
  const row = rejectRow.value
  if (!row) return
  if (!rejectReason.value.trim()) {
    ElMessage.warning('请填写拒绝原因')
    return
  }
  actionLoading.value = true
  try {
    await rejectTeamChange(row.id, { reviewReason: rejectReason.value.trim() })
    ElMessage.success('已拒绝')
    rejectVisible.value = false
    reloadAll({ forcePendingCount: true })
  } catch (e) {
    ElMessage.error(e.message || '操作失败')
  } finally {
    actionLoading.value = false
  }
}
</script>

<style scoped>
.pending-banner {
  margin-bottom: 16px;
}
.filter-form {
  margin-bottom: 8px;
}
.muted {
  color: var(--el-text-color-placeholder);
}
</style>
