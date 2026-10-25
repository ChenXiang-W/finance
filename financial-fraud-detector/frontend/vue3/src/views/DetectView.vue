<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'
import { useSessionStore } from '../stores/session'
import { useDetectStore } from '../stores/detect'
import { EXAMPLES, EXAMPLE_LIST } from '../utils/examples'
import { engineUsedName, fmtAgentText, fmtScore, fmtWhen, riskTier } from '../utils/format'
import ThreadsPanel from '../components/ThreadsPanel.vue'
import ThreatTicker from '../components/ThreatTicker.vue'
import ReportCard from '../components/ReportCard.vue'
import Composer from '../components/Composer.vue'

const app = useAppStore()
const session = useSessionStore()
const detect = useDetectStore()
const router = useRouter()

const text = ref('')
const composer = ref(null)

const showWelcome = computed(() => !detect.report && !detect.busy && !detect.error)
const surfaceTitle = computed(() => {
  if (detect.report?.batch) return '批量结果'
  const ri = detect.report?.basic_info
  if (!ri) return '新检测'
  const lv = String(ri.risk_level || '')
  if (/失败|未分析|分析中/.test(lv)) return '检测未完成'
  return `${ri.fraud_category || '未分类'} · ${lv}`
})
const surfaceMeta = computed(() => {
  const ri = detect.report?.basic_info
  if (!ri) return `引擎：${{ auto: '自动', deepseek: 'DeepSeek 深度', local: '本地微调' }[app.engine]}`
  return `${engineUsedName(ri.engine_used)} · ${fmtWhen(ri.detected_at || detect.report.generated_at)}`
})
const welcomeRecent = computed(() => session.conversations.slice(-3).reverse())

function submit(value) {
  const v = String(value ?? text.value ?? '').trim()
  if (!v) return
  // 追问模式：上一条还在生成时不接受提交（否则输入会被清掉丢失）
  if (detect.mode === 'agent') {
    if (detect.typing) return
    detect.submit(v)
    text.value = ''
    return
  }
  if (detect.busy) return
  detect.submit(v)
  // 检测/批量/URL 提交后清空输入框，刚分析过的文本不再留在框里
  text.value = ''
}

function newDetect() {
  detect.reset()
  text.value = ''
  composer.value?.focus()
}

function useExample(key) {
  text.value = EXAMPLES[key] || ''
  composer.value?.focus()
}

function openConversation(id) {
  const conv = session.find(id)
  if (!conv) return
  router.push('/detect')
  let result = conv.result
  if (typeof result === 'string') {
    try { result = JSON.parse(result) } catch { result = null }
  }
  if (result && result.basic_info) {
    detect.report = result
    app.notify('已恢复 ' + fmtWhen(conv.timestamp) + ' 的报告', 'success')
  } else {
    app.notify('该记录没有完整报告', 'error')
  }
}

function copyResult() {
  const r = detect.report
  if (!r?.basic_info) return
  const ri = r.basic_info
  const payload = `风险评分 ${fmtScore(ri.risk_score)} / 1.00\n等级 ${ri.risk_level || ''}\n分类 ${
    ri.fraud_category || ''
  }\n报告 ${r.report_id || ''}\n\n${r.summary || ''}`
  navigator.clipboard?.writeText(payload).then(
    () => app.notify('已复制', 'success'),
    () => app.notify('当前浏览器不支持剪贴板', 'error'),
  )
}

function exportReport() {
  const r = detect.report
  if (!r?.basic_info) return
  const ri = r.basic_info
  const lines = [
    '金盾智眼 · 金融欺诈风险报告',
    '报告编号: ' + (r.report_id || 'N/A'),
    '生成时间: ' + (r.generated_at || ''),
    '分析引擎: ' + engineUsedName(ri.engine_used),
    '风险评分: ' + fmtScore(ri.risk_score) + ' / 1.00',
    '风险等级: ' + (ri.risk_level || ''),
    '欺诈分类: ' + (ri.fraud_category || ''),
    '',
    '初步诊断',
    r.summary || '',
    '',
    '防范建议',
    ...(r.suggestions || []).map((s, i) => `${i + 1}. ${s}`),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `欺诈风险报告_${r.report_id || Date.now()}.txt`
  a.click()
  URL.revokeObjectURL(a.href)
  app.notify('报告已导出', 'success')
}

function onKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    submit()
  }
  if (e.key === 'Escape') {
    if (detect.batchMode || detect.urlMode) {
      detect.batchMode = false
      detect.urlMode = false
    } else if (detect.report) {
      newDetect()
    }
  }
}

onMounted(async () => {
  await session.load()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <section class="view view-workspace">
    <div class="workspace">
      <ThreadsPanel @new-detect="newDetect" @open="openConversation" />

      <section class="surface" aria-label="工作台">
        <header class="surface-head">
          <div class="surface-title">
            <h1>{{ surfaceTitle }}</h1>
            <span class="hint">{{ surfaceMeta }}</span>
          </div>
          <div class="surface-actions">
            <button v-if="detect.report && !detect.report.batch" class="btn ghost sm" @click="copyResult">
              复制
            </button>
            <button v-if="detect.report && !detect.report.batch" class="btn ghost sm" @click="exportReport">
              导出
            </button>
            <!-- 历史入口已去重：左侧导航栏常驻 -->
          </div>
        </header>

        <ThreatTicker />

        <div class="surface-body" :class="{ 'is-idle': showWelcome }">
          <!-- 空态 -->
          <div v-if="showWelcome" class="welcome">
            <span class="mark lg">金</span>
            <h2>粘贴文本，我来判断风险</h2>
            <p class="hint">先做规则预筛与六维分析，再给出风险评分、分类与防范建议。</p>

            <div class="suggestions">
              <button
                v-for="s in EXAMPLE_LIST"
                :key="s.key"
                class="suggestion"
                @click="useExample(s.key)"
              >
                <span class="suggestion-label">{{ s.label }}</span>
                <span class="suggestion-hint">{{ s.hint }}</span>
              </button>
            </div>

            <button class="example-link" @click="detect.demo()">查看示例报告</button>

            <div class="welcome-recent">
              <div class="caption">最近检测</div>
              <template v-if="welcomeRecent.length">
                <button
                  v-for="c in welcomeRecent"
                  :key="c.id ?? c.timestamp"
                  class="recent-row"
                  @click="c.id != null ? openConversation(c.id) : null"
                >
                  <span class="recent-dot" :class="riskTier(c.risk_score)"></span>
                  <span class="recent-label">{{ (c.user_text || '').slice(0, 34) }}</span>
                  <span class="recent-val">{{ fmtScore(c.risk_score) }}</span>
                </button>
              </template>
              <p v-else class="hint">还没有记录，粘贴一段文本开始第一条检测。</p>
            </div>

            <p class="disclaimer">结果仅供参考，不能替代人工核验。</p>
          </div>

          <!-- 加载中 -->
          <div v-else-if="detect.busy && !detect.report" class="skeleton-lines" aria-busy="true">
            <p class="hint">服务端分析中…</p>
            <div class="skeleton w40"></div>
            <div class="skeleton w70"></div>
            <div class="skeleton tall"></div>
            <div class="skeleton w90"></div>
          </div>

          <!-- 错误 -->
          <div v-else-if="detect.error" class="empty">
            <h3>检测未完成</h3>
            <p>{{ detect.error }}</p>
            <button class="btn" @click="submit()">重试</button>
          </div>

          <!-- 报告 -->
          <ReportCard v-if="detect.report" :report="detect.report" />

          <!-- 智能体对话 -->
          <div v-if="detect.messages.length || detect.typing" class="conversation">
            <div class="agent-log">
              <div v-for="(m, i) in detect.messages" :key="i" class="msg" :class="{ 'msg-user': m.role === 'user' }">
                <div class="msg-head">{{ m.role === 'user' ? '你' : '智能体' }}</div>
                <div class="msg-body" v-html="fmtAgentText(m.content)"></div>
              </div>
              <div v-if="detect.typing" class="msg">
                <div class="msg-head">智能体</div>
                <div class="msg-typing">分析中…</div>
              </div>
            </div>
          </div>
        </div>

        <Composer ref="composer" v-model:text="text" :key="detect.mode" @submit="submit" @new="newDetect" />
      </section>
    </div>
  </section>
</template>
