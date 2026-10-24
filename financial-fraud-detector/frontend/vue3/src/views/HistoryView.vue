<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'
import { useSessionStore } from '../stores/session'
import { useDetectStore } from '../stores/detect'
import { fmtScore, fmtWhen, pillClass, riskTier, tierText } from '../utils/format'

const app = useAppStore()
const session = useSessionStore()
const detect = useDetectStore()
const router = useRouter()

const query = ref('')
const level = ref('all')

const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  return session.conversations
    .filter((c) => {
      const hitQ =
        !q ||
        (c.user_text || '').toLowerCase().includes(q) ||
        (c.fraud_type || '').toLowerCase().includes(q) ||
        (c.risk_level || '').toLowerCase().includes(q)
      const hitL = level.value === 'all' || riskTier(c.risk_score) === level.value
      return hitQ && hitL
    })
    .slice()
    .reverse()
})

function openRow(c) {
  router.push('/detect')
  let result = c.result
  if (typeof result === 'string') {
    try { result = JSON.parse(result) } catch { result = null }
  }
  if (result?.basic_info) {
    detect.report = result
    app.notify('已恢复 ' + fmtWhen(c.timestamp) + ' 的报告', 'success')
  } else {
    app.notify('该记录没有完整报告', 'error')
  }
}

onMounted(() => session.load())
</script>

<template>
  <section class="view">
    <header class="title-row">
      <div>
        <h1>历史记录</h1>
        <p class="sub">本会话的检测记录，按时间倒序。点任意一行可恢复当时的完整报告。</p>
      </div>
    </header>

    <div class="panel">
      <header>
        <div class="filters">
          <input v-model="query" class="input" placeholder="搜索文本、类型或等级" style="width: 260px" />
          <div class="segmented">
            <button :aria-pressed="level === 'all'" @click="level = 'all'">全部</button>
            <button :aria-pressed="level === 'high'" @click="level = 'high'">高风险</button>
            <button :aria-pressed="level === 'mid'" @click="level = 'mid'">中风险</button>
            <button :aria-pressed="level === 'low'" @click="level = 'low'">低风险</button>
          </div>
        </div>
        <span class="meta">{{ rows.length }} 条</span>
      </header>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width: 150px">时间</th>
              <th>文本</th>
              <th style="width: 110px">类型</th>
              <th style="width: 92px">等级</th>
              <th class="n" style="width: 72px">评分</th>
              <th style="width: 52px"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!rows.length">
              <td colspan="6">
                <div class="empty">
                  <p>{{ session.conversations.length ? '没有符合筛选条件的记录' : '还没有检测记录' }}</p>
                </div>
              </td>
            </tr>
            <tr v-for="c in rows" :key="c.id" style="cursor: pointer" @click="openRow(c)">
              <td class="mono" style="color: var(--muted)">{{ fmtWhen(c.timestamp) }}</td>
              <td><span class="truncate" :title="c.user_text">{{ (c.user_text || '').slice(0, 60) }}</span></td>
              <td>{{ c.fraud_type || '未分类' }}</td>
              <td><span class="pill" :class="pillClass(riskTier(c.risk_score))">{{ tierText(riskTier(c.risk_score)) }}</span></td>
              <td class="n mono">{{ fmtScore(c.risk_score) }}</td>
              <td class="n">
                <button class="row-del" title="删除这条记录" @click.stop="session.remove(c.id)">×</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
