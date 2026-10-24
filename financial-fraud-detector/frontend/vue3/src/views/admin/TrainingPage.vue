<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi } from '../../api'
import { fmtScore, fmtWhen } from '../../utils/format'

const dataset = ref({})
const models = ref([])
const modelsState = ref({})
const train = ref({})
const logText = ref('')
const epochs = ref(1)
const loading = ref(true)
let pollTimer = null

const steps = [
  { key: 'prepare', label: '生成训练集' },
  { key: 'finetune', label: 'LoRA 微调' },
  { key: 'export', label: '合并模型' },
  { key: 'evaluate', label: '评测入库' },
]
const artifacts = computed(() => dataset.value?.artifacts || {})
const generated = computed(() => dataset.value?.generated || {})

function stepDone(step) {
  if (step === 'prepare') return !!(generated.value.train > 0)
  if (step === 'finetune') return !!artifacts.value.adapter?.exists
  if (step === 'export') return !!artifacts.value.merged?.exists
  if (step === 'evaluate') return models.value.length > 0
  return false
}
function stepState(step) {
  if (train.value.running && train.value.step === step) return '运行中…'
  if (train.value.step === step && train.value.state === 'failed') return '上次失败'
  return stepDone(step) ? '已完成' : '待运行'
}

async function refreshStatus() {
  try {
    const res = await adminApi.trainStatus()
    // /train/status 顶层就是完整状态对象（state 只是其中的字符串字段），
    // 之前写 res?.state || res 会把对象覆盖成字符串，导致首次轮询后 running 丢失、轮询停止
    train.value = res || {}
    if (res?.log_tail != null) logText.value = res.log_tail
    else if (res?.log != null) logText.value = res.log
  } catch {
    /* 训练接口不可用时静默 */
  }
}

async function loadAll() {
  loading.value = true
  try {
    const [d, m] = await Promise.allSettled([adminApi.dataset(), adminApi.models()])
    if (d.status === 'fulfilled') dataset.value = d.value || {}
    if (m.status === 'fulfilled') {
      models.value = m.value?.items || []
      modelsState.value = m.value || {}
    }
  } finally {
    loading.value = false
  }
}

async function startStep(step) {
  const tip =
    step === 'finetune'
      ? '微调会占用 GPU，样本少时约 1–2 分钟。确定开始？'
      : `确定运行「${steps.find((s) => s.key === step)?.label}」？`
  try {
    await ElMessageBox.confirm(tip, '确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    const d = await adminApi.trainStart({ step, epochs: Number(epochs.value) || 1 })
    train.value = d?.state || d || {}
    // start 接口返回的原始 state 对象没有 running 字段（那是 /train/status 才有的），
    // 补上避免第一次轮询前 UI 误判为空闲
    if (train.value && train.value.running === undefined) train.value.running = true
    ElMessage.success('已启动')
    startPoll()
  } catch (e) {
    ElMessage.error(e.message || '启动失败')
  }
}

async function stopTrain() {
  try {
    await ElMessageBox.confirm('确定停止当前训练任务？已产生的权重可能不完整。', '确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await adminApi.trainStop()
    ElMessage.success('已停止')
    await refreshStatus()
  } catch (e) {
    ElMessage.error(e.message)
  }
}

async function activate(row) {
  try {
    await adminApi.activateModel(row.id)
    ElMessage.success('已启用（热加载）')
    await loadAll()
  } catch (e) {
    ElMessage.error(e.message)
  }
}
async function deactivate() {
  try {
    await adminApi.deactivateModel()
    ElMessage.success('已停用')
    await loadAll()
  } catch (e) {
    ElMessage.error(e.message)
  }
}
async function removeModel(row) {
  try {
    await ElMessageBox.confirm('删除该模型版本？', '确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await adminApi.deleteModel(row.id)
    ElMessage.success('已删除')
    await loadAll()
  } catch (e) {
    ElMessage.error(e.message)
  }
}

function startPoll() {
  stopPoll()
  pollTimer = setInterval(async () => {
    await refreshStatus()
    if (!train.value.running) {
      stopPoll()
      await loadAll()
    }
  }, 2500)
}
function stopPoll() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}

onMounted(async () => {
  await loadAll()
  await refreshStatus()
  if (train.value.running) startPoll()
})
onBeforeUnmount(stopPoll)
</script>

<template>
  <div class="admin-head">
    <div>
      <h1>模型训练</h1>
      <p class="hint">四步流水线：prepare → finetune → export → evaluate</p>
    </div>
    <div style="display: flex; gap: 8px; align-items: center">
      <span class="hint">epochs</span>
      <el-input-number v-model="epochs" :min="1" :max="20" size="small" />
      <el-button :disabled="!train.running" type="danger" plain @click="stopTrain">停止训练</el-button>
    </div>
  </div>

  <div class="steps-row">
    <div v-for="s in steps" :key="s.key" class="step-card">
      <b>{{ s.label }}</b>
      <div class="state">{{ stepState(s.key) }}</div>
      <el-button size="small" :disabled="train.running" @click="startStep(s.key)">运行</el-button>
    </div>
  </div>

  <div class="admin-card">
    <div class="admin-head" style="margin-bottom: 10px">
      <div><b>训练状态 / 日志</b></div>
      <span class="hint mono">{{ train.running ? '运行中 · ' + (train.step || '') : '空闲' }}</span>
    </div>
    <div class="log-box">{{ logText || '暂无日志' }}</div>
  </div>

  <div class="admin-card" v-loading="loading">
    <div class="admin-head" style="margin-bottom: 10px">
      <div><b>模型版本</b></div>
      <el-button size="small" :disabled="!modelsState.model_loaded" @click="deactivate">停用当前模型</el-button>
    </div>
    <el-table :data="models" size="small">
      <el-table-column prop="version_name" label="版本" width="170" />
      <el-table-column prop="is_active" label="启用" width="80">
        <template #default="{ row }">
          <el-tag v-if="row.is_active" type="success" size="small">启用</el-tag>
          <span v-else class="hint">-</span>
        </template>
      </el-table-column>
      <el-table-column label="准确率" width="100">
        <template #default="{ row }">{{ row.accuracy != null ? row.accuracy : '-' }}</template>
      </el-table-column>
      <el-table-column label="F1" width="90">
        <template #default="{ row }">{{ row.f1_score != null ? row.f1_score : '-' }}</template>
      </el-table-column>
      <el-table-column label="训练条数" width="100">
        <template #default="{ row }">{{ row.train_samples ?? '-' }}</template>
      </el-table-column>
      <el-table-column label="训练时间" width="160">
        <template #default="{ row }">{{ fmtWhen(row.trained_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="170">
        <template #default="{ row }">
          <el-button size="small" :disabled="row.is_active" @click="activate(row)">启用</el-button>
          <el-button size="small" type="danger" plain @click="removeModel(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!models.length" description="还没有训练出的模型版本" />
    <p class="hint" style="margin-top: 10px">当前激活路径：{{ modelsState.active_path || '-' }} · 已加载：{{ modelsState.model_loaded ? '是' : '否' }}</p>
  </div>
</template>
