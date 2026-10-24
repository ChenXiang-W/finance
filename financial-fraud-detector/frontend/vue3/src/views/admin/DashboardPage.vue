<script setup>
import { onMounted, ref } from 'vue'
import { adminApi } from '../../api'
import { fmtScore, fmtWhen } from '../../utils/format'

const stats = ref({})
const logs = ref([])
const model = ref({})
const loading = ref(true)

onMounted(async () => {
  loading.value = true
  try {
    const [s, l, m] = await Promise.allSettled([adminApi.stats(), adminApi.logs({ page: 1, page_size: 12 }), adminApi.modelInfo()])
    if (s.status === 'fulfilled') stats.value = s.value || {}
    if (l.status === 'fulfilled') logs.value = l.value?.items || l.value || []
    if (m.status === 'fulfilled') model.value = m.value || {}
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="admin-head">
    <div>
      <h1>仪表盘</h1>
      <p class="hint">数据库中的真实统计与最近检测记录</p>
    </div>
  </div>

  <div class="kpi-row" v-loading="loading">
    <div class="kpi-cell"><div class="label">检测总数</div><div class="value">{{ stats.total_detections ?? 0 }}</div></div>
    <div class="kpi-cell"><div class="label">高风险</div><div class="value">{{ stats.high_risk_count ?? 0 }}</div></div>
    <div class="kpi-cell"><div class="label">训练案例</div><div class="value">{{ stats.total_cases ?? 0 }}</div></div>
    <div class="kpi-cell"><div class="label">用户数</div><div class="value">{{ stats.total_users ?? 0 }}</div></div>
  </div>

  <div class="admin-card">
    <div class="admin-head" style="margin-bottom: 10px">
      <div><b>最近检测</b></div>
      <span class="hint mono">平均评分 {{ fmtScore(stats.avg_risk_score) }}</span>
    </div>
    <el-table :data="logs" size="small" stripe>
      <el-table-column prop="created_at" label="时间" width="160">
        <template #default="{ row }">{{ fmtWhen(row.created_at || row.timestamp) }}</template>
      </el-table-column>
      <el-table-column prop="input_text" label="文本" min-width="240" show-overflow-tooltip />
      <el-table-column prop="fraud_type" label="类型" width="120" />
      <el-table-column prop="risk_score" label="评分" width="90" align="right">
        <template #default="{ row }">{{ fmtScore(row.risk_score) }}</template>
      </el-table-column>
      <el-table-column prop="risk_level" label="等级" width="110" />
    </el-table>
    <el-empty v-if="!loading && !logs.length" description="还没有检测记录" />
  </div>

  <div class="admin-card">
    <div class="admin-head" style="margin-bottom: 10px"><div><b>模型状态</b></div></div>
    <el-descriptions :column="3" border size="small">
      <el-descriptions-item label="模型路径">{{ model.model_path || '-' }}</el-descriptions-item>
      <el-descriptions-item label="已加载">{{ model.model_loaded ? '是' : '否' }}</el-descriptions-item>
      <el-descriptions-item label="微调启用">{{ model.finetuned_enabled ? '是' : '否' }}</el-descriptions-item>
      <el-descriptions-item label="基座模型">{{ model.base_model || '-' }}</el-descriptions-item>
      <el-descriptions-item label="准确率">{{ model.accuracy != null ? model.accuracy : '未评测' }}</el-descriptions-item>
      <el-descriptions-item label="F1">{{ model.f1_score != null ? model.f1_score : '未评测' }}</el-descriptions-item>
    </el-descriptions>
  </div>
</template>
