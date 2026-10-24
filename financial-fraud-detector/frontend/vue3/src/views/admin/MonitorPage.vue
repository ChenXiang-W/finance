<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi } from '../../api'

const sys = ref(null)
const model = ref({})
const llm = reactive({ api_key: '', base_url: 'https://api.deepseek.com', model: 'deepseek-chat' })
const loading = ref(true)
const saving = ref(false)

async function load() {
  loading.value = true
  try {
    const [s, m, c] = await Promise.allSettled([adminApi.systemInfo(), adminApi.modelInfo(), adminApi.llmConfig()])
    if (s.status === 'fulfilled') sys.value = s.value
    if (m.status === 'fulfilled') model.value = m.value || {}
    if (c.status === 'fulfilled' && c.value) {
      llm.base_url = c.value.base_url || llm.base_url
      llm.model = c.value.model || llm.model
      llm.api_key = c.value.api_key || ''
    }
  } finally {
    loading.value = false
  }
}

async function saveLlm() {
  saving.value = true
  try {
    await adminApi.saveLlmConfig({ ...llm })
    ElMessage.success('已保存')
    await load()
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="admin-head">
    <div>
      <h1>系统监控</h1>
      <p class="hint">服务运行状态与 LLM 配置</p>
    </div>
    <el-button @click="load">刷新</el-button>
  </div>

  <div class="kpi-row" v-loading="loading">
    <div class="kpi-cell"><div class="label">CPU</div><div class="value">{{ sys?.server?.cpu_percent ?? '-' }}<small>%</small></div></div>
    <div class="kpi-cell"><div class="label">内存</div><div class="value">{{ sys?.server?.memory_percent ?? '-' }}<small>%</small></div></div>
    <div class="kpi-cell"><div class="label">磁盘</div><div class="value">{{ sys?.server?.disk_percent ?? '-' }}<small>%</small></div></div>
    <div class="kpi-cell"><div class="label">数据库</div><div class="value" style="font-size: 15px">{{ sys?.database?.size_kb ?? '-' }} <small>KB</small></div></div>
  </div>

  <div class="admin-card">
    <div class="admin-head" style="margin-bottom: 10px"><div><b>运行环境</b></div></div>
    <el-descriptions :column="2" border size="small">
      <el-descriptions-item label="数据库类型">{{ sys?.database?.type || 'SQLite' }}</el-descriptions-item>
      <el-descriptions-item label="数据库路径">{{ sys?.database?.path || '-' }}</el-descriptions-item>
      <el-descriptions-item label="DeepSeek 已配置">{{ sys?.api?.deepseek_configured ? '是' : '否' }}</el-descriptions-item>
      <el-descriptions-item label="微调模型已加载">{{ sys?.api?.model_loaded ? '是' : '否' }}</el-descriptions-item>
      <el-descriptions-item label="模型路径">{{ model.model_path || '-' }}</el-descriptions-item>
      <el-descriptions-item label="基座模型">{{ model.base_model || '-' }}</el-descriptions-item>
    </el-descriptions>
  </div>

  <div class="admin-card">
    <div class="admin-head" style="margin-bottom: 10px"><div><b>LLM 配置</b></div><span class="hint">保存后立即生效 · Key 不回显，留空表示不修改</span></div>
    <el-form label-position="top" style="max-width: 560px">
      <el-form-item label="API Key">
        <el-input v-model="llm.api_key" type="password" show-password placeholder="sk-…" />
      </el-form-item>
      <el-form-item label="Base URL">
        <el-input v-model="llm.base_url" />
      </el-form-item>
      <el-form-item label="模型">
        <el-input v-model="llm.model" />
      </el-form-item>
      <el-button type="primary" :loading="saving" @click="saveLlm">保存配置</el-button>
    </el-form>
  </div>
</template>
