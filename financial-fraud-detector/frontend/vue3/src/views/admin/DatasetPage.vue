<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi } from '../../api'

const dataset = ref({})
const loading = ref(true)
const preparing = ref(false)
const importText = ref('')
const importing = ref(false)
const importDlg = ref(false)

const byType = computed(() => dataset.value?.cases?.by_type || [])
// 案例库（DB 录入）为空时，改画最近一次生成的训练集分布（来自 JSONL 语料合并），
// 否则明明有 420 条训练数据页面却显示"暂无"，让人误以为数据丢了
const preparedTypes = computed(() => dataset.value?.runner?.last_prepare?.types || [])
const distList = computed(() => (byType.value.length ? byType.value : preparedTypes.value))
const distName = (t) => t.name || t.type || t.fraud_type || '未分类'
const maxCount = computed(() => Math.max(1, ...distList.value.map((t) => t.count || 0)))
const generated = computed(() => dataset.value?.generated || {})
const artifacts = computed(() => dataset.value?.artifacts || {})

async function load() {
  loading.value = true
  try {
    dataset.value = await adminApi.dataset()
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

async function prepare() {
  preparing.value = true
  try {
    const d = await adminApi.prepareDataset()
    const sm = d.summary || {}
    ElMessage.success(`训练集已生成：${sm.train ?? '?'} 条训练 / ${sm.val ?? '?'} 条验证`)
    await load()
  } catch (e) {
    ElMessage.error(e.message || '生成失败')
  } finally {
    preparing.value = false
  }
}

async function doImport() {
  if (!importText.value.trim()) return
  importing.value = true
  try {
    const d = await adminApi.importCases({ data: importText.value })
    ElMessage.success(`导入完成：新增 ${d.created ?? 0} 条，跳过 ${d.skipped ?? 0} 条`)
    importDlg.value = false
    importText.value = ''
    await load()
  } catch (e) {
    ElMessage.error(e.message || '导入失败')
  } finally {
    importing.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="admin-head">
    <div>
      <h1>训练数据</h1>
      <p class="hint">案例库 → prepare_data.py → train/val JSONL</p>
    </div>
    <div style="display: flex; gap: 8px">
      <el-button @click="importDlg = true">批量导入案例</el-button>
      <el-button type="primary" :loading="preparing" @click="prepare">生成训练集</el-button>
    </div>
  </div>

  <div class="kpi-row" v-loading="loading">
    <div class="kpi-cell"><div class="label">案例库案例</div><div class="value">{{ dataset.cases?.total ?? byType.reduce((a, b) => a + (b.count || 0), 0) }}</div></div>
    <div class="kpi-cell"><div class="label">训练条数</div><div class="value">{{ generated.train ?? '-' }}</div></div>
    <div class="kpi-cell"><div class="label">验证条数</div><div class="value">{{ generated.val ?? '-' }}</div></div>
    <div class="kpi-cell"><div class="label">适配器</div><div class="value" style="font-size: 14px">{{ artifacts.adapter?.exists ? '已生成' : '未生成' }}</div></div>
  </div>

  <div class="admin-card">
    <div class="admin-head" style="margin-bottom: 12px">
      <div><b>类型分布</b></div>
      <span class="hint">{{ byType.length ? '案例库（管理后台录入）· 按条数' : '训练集（最近一次生成，来源 JSONL 语料）· 按条数' }}</span>
    </div>
    <div v-if="distList.length" class="admin-grid">
      <div v-for="t in distList" :key="distName(t)" style="display: grid; grid-template-columns: 120px 1fr 60px; gap: 10px; align-items: center">
        <span style="font-size: 12px; color: var(--muted)">{{ distName(t) }}</span>
        <div class="dim-track"><div class="dim-fill" :style="{ width: Math.max(4, Math.round(((t.count || 0) / maxCount) * 100)) + '%' }"></div></div>
        <span class="mono" style="text-align: right; font-size: 12px">{{ t.count }}</span>
      </div>
    </div>
    <el-empty v-else description="暂无数据：请先录入案例或生成训练集" />
  </div>

  <div class="admin-card">
    <div class="admin-head" style="margin-bottom: 12px"><div><b>产物状态</b></div></div>
    <el-descriptions :column="2" border size="small">
      <el-descriptions-item label="LoRA 适配器">{{ artifacts.adapter?.exists ? artifacts.adapter.path : '未生成' }}</el-descriptions-item>
      <el-descriptions-item label="合并后模型">{{ artifacts.merged?.exists ? artifacts.merged.path : '未生成' }}</el-descriptions-item>
    </el-descriptions>
  </div>

  <el-dialog v-model="importDlg" title="批量导入案例（每行一条 JSON）" width="640px">
    <el-input v-model="importText" type="textarea" :rows="10" placeholder='{"text":"…","fraud_type":"冒充客服","risk_level":"high","risk_score":0.85}' />
    <template #footer>
      <el-button @click="importDlg = false">取消</el-button>
      <el-button type="primary" :loading="importing" @click="doImport">导入</el-button>
    </template>
  </el-dialog>
</template>
