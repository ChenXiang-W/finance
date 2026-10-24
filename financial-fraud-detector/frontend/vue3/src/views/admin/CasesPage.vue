<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi } from '../../api'
import { fmtScore, fmtWhen } from '../../utils/format'

const rows = ref([])
const total = ref(0)
const loading = ref(true)
const search = ref('')
const dialog = ref(false)
const saving = ref(false)
const form = ref({ id: null, text: '', fraud_type: '', risk_level: 'high', risk_score: 0.8, analysis: '', is_active: true })

async function load() {
  loading.value = true
  try {
    // 后端参数是 page / page_size（上限 100）；之前传 limit 被忽略，案例超过 20 条时看不到后面的
    const d = await adminApi.cases({ page: 1, page_size: 100, search: search.value || undefined })
    rows.value = d?.items || []
    total.value = d?.total ?? rows.value.length
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

function openNew() {
  form.value = { id: null, text: '', fraud_type: '', risk_level: 'high', risk_score: 0.8, analysis: '', is_active: true }
  dialog.value = true
}
function openEdit(row) {
  form.value = { ...row }
  dialog.value = true
}
async function save() {
  saving.value = true
  try {
    if (form.value.id) await adminApi.updateCase(form.value.id, form.value)
    else await adminApi.createCase(form.value)
    ElMessage.success('已保存')
    dialog.value = false
    await load()
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}
async function remove(row) {
  try {
    await ElMessageBox.confirm('删除该案例？', '确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await adminApi.deleteCase(row.id)
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    ElMessage.error(e.message)
  }
}
async function toggleActive(row) {
  try {
    await adminApi.updateCase(row.id, { is_active: !row.is_active })
    await load()
  } catch (e) {
    ElMessage.error(e.message)
  }
}

onMounted(load)
</script>

<template>
  <div class="admin-head">
    <div>
      <h1>案例管理</h1>
      <p class="hint">案例库是微调数据源，勾选「参与训练」才会进入训练集</p>
    </div>
    <div style="display: flex; gap: 8px">
      <el-input v-model="search" placeholder="搜索文本/类型" size="default" style="width: 220px" @keyup.enter="load" />
      <el-button @click="load">搜索</el-button>
      <el-button type="primary" @click="openNew">新增案例</el-button>
    </div>
  </div>

  <div class="admin-card" v-loading="loading">
    <p class="hint" style="margin-bottom: 10px">共 {{ total }} 条</p>
    <el-table :data="rows" size="small" stripe>
      <el-table-column prop="text" label="文本" min-width="260" show-overflow-tooltip />
      <el-table-column prop="fraud_type" label="类型" width="120" />
      <el-table-column prop="risk_level" label="等级" width="100" />
      <el-table-column label="评分" width="80" align="right">
        <template #default="{ row }">{{ fmtScore(row.risk_score) }}</template>
      </el-table-column>
      <el-table-column label="参与训练" width="100">
        <template #default="{ row }">
          <el-switch :model-value="row.is_active" @change="toggleActive(row)" />
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="160">
        <template #default="{ row }">{{ fmtWhen(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="140">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" plain @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!loading && !rows.length" description="还没有案例" />
  </div>

  <el-dialog v-model="dialog" :title="form.id ? '编辑案例' : '新增案例'" width="640px">
    <el-form label-position="top">
      <el-form-item label="文本">
        <el-input v-model="form.text" type="textarea" :rows="4" />
      </el-form-item>
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px">
        <el-form-item label="欺诈类型">
          <el-input v-model="form.fraud_type" placeholder="冒充客服" />
        </el-form-item>
        <el-form-item label="风险等级">
          <el-select v-model="form.risk_level" style="width: 100%">
            <el-option label="极高风险" value="极高风险" />
            <el-option label="高风险" value="高风险" />
            <el-option label="中风险" value="中风险" />
            <el-option label="低风险" value="低风险" />
          </el-select>
        </el-form-item>
        <el-form-item label="风险评分">
          <el-input-number v-model="form.risk_score" :min="0" :max="1" :step="0.01" style="width: 100%" />
        </el-form-item>
      </div>
      <el-form-item label="分析说明">
        <el-input v-model="form.analysis" type="textarea" :rows="2" />
      </el-form-item>
      <el-form-item label="参与训练">
        <el-switch v-model="form.is_active" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialog = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>
