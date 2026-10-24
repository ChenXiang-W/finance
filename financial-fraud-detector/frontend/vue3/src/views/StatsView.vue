<script setup>
import { computed, onMounted, ref } from 'vue'
import { useSessionStore } from '../stores/session'
import { fmtScore, fmtWhen, pillClass, riskTier, tierText } from '../utils/format'
import RiskScale from '../components/RiskScale.vue'
import DimensionBars from '../components/DimensionBars.vue'

const session = useSessionStore()
const scope = ref('session')

const convs = computed(() => session.conversations)
const scores = computed(() => convs.value.map((c) => Number(c.risk_score)).filter(Number.isFinite))

const sessionKpi = computed(() => {
  const total = convs.value.length
  const high = convs.value.filter((c) => riskTier(c.risk_score) === 'high').length
  const avg = scores.value.length ? scores.value.reduce((a, b) => a + b, 0) / scores.value.length : null
  const types = new Set(convs.value.map((c) => c.fraud_type || '未分类')).size
  return { total, high, avg, types }
})

const globalKpi = computed(() => {
  const s = session.stats || {}
  return {
    total: s.total_detections || 0,
    high: s.high_risk_count || 0,
    avg: s.avg_risk_score > 0 ? Number(s.avg_risk_score) : null,
    types: (s.categories || []).length,
  }
})

const kpi = computed(() => (scope.value === 'session' ? sessionKpi.value : globalKpi.value))

const typeBars = computed(() => {
  if (scope.value === 'global') {
    return (session.stats.categories || []).map((c) => ({ label: c.name || '未分类', value: c.count || 0, text: String(c.count || 0) }))
  }
  const map = {}
  convs.value.forEach((c) => {
    const k = c.fraud_type || '未分类'
    map[k] = (map[k] || 0) + 1
  })
  return Object.entries(map)
    .map(([label, value]) => ({ label, value, text: String(value) }))
    .sort((a, b) => b.value - a.value)
})

const riskBars = computed(() => {
  if (scope.value === 'global') {
    const total = globalKpi.value.total
    if (!total) return []
    const high = globalKpi.value.high
    return [
      { label: '高风险', value: high, text: `${high} · ${Math.round((high / total) * 100)}%`, cls: 'hi' },
      { label: '其他/未分级', value: total - high, text: String(total - high) },
    ]
  }
  const total = convs.value.length
  if (!total) return []
  const buckets = { high: 0, mid: 0, low: 0 }
  convs.value.forEach((c) => { buckets[riskTier(c.risk_score)]++ })
  return [
    { label: '高风险', value: buckets.high, text: `${buckets.high} · ${Math.round((buckets.high / total) * 100)}%`, cls: 'hi' },
    { label: '中风险', value: buckets.mid, text: `${buckets.mid} · ${Math.round((buckets.mid / total) * 100)}%`, cls: 'mid' },
    { label: '低风险', value: buckets.low, text: `${buckets.low} · ${Math.round((buckets.low / total) * 100)}%`, cls: 'lo' },
  ]
})

const histogram = computed(() => {
  const buckets = [0, 0, 0, 0, 0]
  scores.value.forEach((v) => {
    buckets[Math.min(4, Math.max(0, Math.floor(v * 5)))]++
  })
  const labels = ['0–0.2', '0.2–0.4', '0.4–0.6', '0.6–0.8', '0.8–1.0']
  return labels.map((label, i) => ({
    label,
    value: buckets[i],
    text: String(buckets[i]),
    cls: i >= 3 ? 'hi' : i === 2 ? 'mid' : 'lo',
  }))
})

const recent = computed(() => convs.value.slice(-10).reverse())

onMounted(() => session.load())
</script>

<template>
  <section class="view">
    <header class="title-row">
      <div>
        <h1>统计</h1>
        <p class="sub">
          {{ scope === 'session' ? '本会话的检测分布与最近记录 · ' + convs.length + ' 条' : '全部记录的检测分布' }}
        </p>
      </div>
      <div class="segmented">
        <button :aria-pressed="scope === 'session'" @click="scope = 'session'">本会话</button>
        <button :aria-pressed="scope === 'global'" @click="scope = 'global'">全部记录</button>
      </div>
    </header>

    <div class="kpis" style="margin-bottom: 24px">
      <div class="kpi">
        <div class="kpi-label">检测总数</div>
        <div class="kpi-value mono">{{ kpi.total }}</div>
        <div class="kpi-note">条</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">高风险</div>
        <div class="kpi-value mono">{{ kpi.high }}</div>
        <div class="kpi-note">评分 ≥ 0.60</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">平均评分</div>
        <div class="kpi-value mono">{{ kpi.avg != null ? fmtScore(kpi.avg) : '-' }}</div>
        <div class="kpi-note">0-1</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">覆盖类型</div>
        <div class="kpi-value mono">{{ kpi.types }}</div>
        <div class="kpi-note">类</div>
      </div>
    </div>

    <div class="grid">
      <section class="panel col-4">
        <header><h2>欺诈类型分布</h2><span class="meta">按记录数</span></header>
        <DimensionBars v-if="typeBars.length" :items="typeBars" />
        <div v-else class="empty"><p>暂无数据</p></div>
      </section>

      <section class="panel col-4">
        <header><h2>风险等级分布</h2><span class="meta">按记录数</span></header>
        <DimensionBars v-if="riskBars.length" :items="riskBars" />
        <div v-else class="empty"><p>暂无数据</p></div>
        <p v-if="scope === 'global'" class="hint" style="margin-top: 10px">全部记录只提供高风险计数，中/低风险未细分。</p>
      </section>

      <section class="panel col-4">
        <header><h2>评分分布</h2><span class="meta">本会话</span></header>
        <DimensionBars v-if="scores.length" :items="histogram" />
        <div v-else class="empty"><p>暂无数据</p></div>
        <p v-if="scores.length" class="hint" style="margin-top: 10px">共 {{ scores.length }} 条评分 · 区间为左闭右开</p>
        <RiskScale v-else :score="kpi.avg" title="平均评分位置" />
      </section>

      <section class="panel col-12">
        <header><h2>最近记录</h2><span class="meta">本会话最近 {{ recent.length }} 条</span></header>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width: 150px">时间</th>
                <th>文本</th>
                <th style="width: 110px">类型</th>
                <th style="width: 92px">等级</th>
                <th class="n" style="width: 72px">评分</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!recent.length">
                <td colspan="5"><div class="empty"><p>还没有检测记录</p></div></td>
              </tr>
              <tr v-for="c in recent" :key="c.id ?? c.timestamp">
                <td class="mono" style="color: var(--muted)">{{ fmtWhen(c.timestamp) }}</td>
                <td><span class="truncate">{{ (c.user_text || '').slice(0, 60) }}</span></td>
                <td>{{ c.fraud_type || '未分类' }}</td>
                <td><span class="pill" :class="pillClass(riskTier(c.risk_score))">{{ tierText(riskTier(c.risk_score)) }}</span></td>
                <td class="n mono">{{ fmtScore(c.risk_score) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </section>
</template>
