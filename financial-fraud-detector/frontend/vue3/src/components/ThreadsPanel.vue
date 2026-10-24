<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'
import { useSessionStore } from '../stores/session'
import { useDetectStore } from '../stores/detect'
import { fmtScore, fmtWhen, riskTier } from '../utils/format'
import EnginePicker from './EnginePicker.vue'

const app = useAppStore()
const session = useSessionStore()
const detect = useDetectStore()
const router = useRouter()
const recent = computed(() => session.conversations.slice(-5).reverse())
const sidShort = computed(() => String(session.sid).replace(/^session_/, '').slice(0, 14))

const emit = defineEmits(['new-detect', 'open'])

const pinned = computed(() => {
  if (detect.report && !detect.report.batch) {
    const ri = detect.report.basic_info || {}
    return {
      title: `${ri.fraud_category || '当前报告'} · 评分 ${fmtScore(ri.risk_score)}`,
      meta: `${detect.report.report_id || ''} · ${fmtWhen(ri.detected_at)}`,
      current: true,
    }
  }
  const last = session.conversations[session.conversations.length - 1]
  if (!last) return null
  return {
    title: (last.user_text || '').slice(0, 28),
    meta: `${last.fraud_type || '未分类'} · ${fmtScore(last.risk_score)} · ${fmtWhen(last.timestamp)}`,
    id: last.id,
  }
})

// 直接引用 store 字段保持响应式；之前用 ref 复制初始值，后端状态变化后状态灯不会更新
const online = computed(() => session.online)
onMounted(() => { if (session.online === null) session.checkHealth() })
</script>

<template>
  <aside class="threads" aria-label="会话与引擎">
    <header class="threads-head">
      <span class="mark">金</span>
      <div class="threads-id">
        <b>本机会话</b>
        <span class="hint mono">{{ sidShort }}</span>
      </div>
    </header>

    <button class="btn primary block" @click="emit('new-detect')">新检测</button>

    <EnginePicker />

    <div class="block">
      <div class="block-label">置顶</div>
      <button
        v-if="pinned"
        class="pinned"
        @click="!pinned.current && pinned.id != null && emit('open', pinned.id)"
      >
        <span class="pinned-title">{{ pinned.title }}</span>
        <span class="pinned-meta">{{ pinned.meta }}</span>
      </button>
      <p v-else class="hint">还没有报告</p>
    </div>

    <div class="block grow">
      <div class="block-label">
        最近检测
        <router-link class="link" to="/history">全部</router-link>
      </div>
      <div class="rows">
        <template v-if="recent.length">
          <button
            v-for="c in recent"
            :key="c.id ?? c.timestamp"
            class="recent-row"
            :title="c.user_text"
            @click="c.id != null ? emit('open', c.id) : router.push('/history')"
          >
            <span class="recent-dot" :class="riskTier(c.risk_score)"></span>
            <span class="recent-label">{{ (c.user_text || '').slice(0, 24) }}</span>
            <span class="recent-val">{{ fmtScore(c.risk_score) }}</span>
          </button>
        </template>
        <p v-else class="hint">还没有检测记录</p>
      </div>
    </div>

    <div class="block">
      <div class="block-label">快捷操作</div>
      <div class="quick">
        <button class="quick-row" @click="detect.toggleBatch()">
          <span>批量检测</span><span class="num">20</span>
        </button>
        <button class="quick-row" @click="detect.toggleUrl()">
          <span>URL 抓取</span><span class="num">1</span>
        </button>
        <button class="quick-row" @click="router.push('/stats')">
          <span>统计</span><span class="num">4</span>
        </button>
        <button class="quick-row" @click="router.push('/settings')">
          <span>设置</span><span class="num"></span>
        </button>
      </div>
    </div>

    <footer class="threads-foot">
      <span class="dot" :class="online === false ? 'off' : 'on'"></span>
      <span class="hint">
        <template v-if="online === false">后端离线 · 只能直连智能体</template>
        <template v-else>
          后端在线 · 累计 {{ session.stats.total_detections || 0 }} 条 · 高风险
          {{ session.stats.high_risk_count || 0 }}
        </template>
      </span>
    </footer>
  </aside>
</template>
