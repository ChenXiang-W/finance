<script setup>
import { computed } from 'vue'
import RiskScale from './RiskScale.vue'
import DimensionBars from './DimensionBars.vue'
import { engineUsedName, fmtScore, fmtWhen, pillClass, riskTier, tierText } from '../utils/format'

const props = defineProps({ report: { type: Object, required: true } })

const isBatch = computed(() => !!props.report.batch)
const ri = computed(() => props.report.basic_info || {})
const failed = computed(() => {
  const lv = String(ri.value.risk_level || '')
  return /失败|未分析|分析中/.test(lv)
})
const tier = computed(() => riskTier(ri.value.risk_score))
const dims = computed(() => {
  const factors = props.report.risk_factors || []
  return factors
    .filter((f) => f && typeof f.score === 'number')
    .map((f) => {
      const s = Math.max(0, Math.min(1, f.score))
      return {
        label: f.category || '维度',
        value: s,
        text: s.toFixed(2),
        cls: s >= 0.6 ? 'hi' : s >= 0.3 ? 'mid' : 'lo',
      }
    })
})
const suggestions = computed(() => props.report.suggestions || [])
const confidence = computed(() =>
  ri.value.confidence != null ? Math.round(ri.value.confidence * 100) + '%' : '-',
)

const batchRows = computed(() => {
  const rows = props.report.rows || []
  const ok = rows.filter((r) => r.data)
  const high = ok.filter((r) => riskTier(r.data.basic_info?.risk_score) === 'high').length
  return { rows, ok: ok.length, high }
})

function rowTier(r) {
  return riskTier(r.data?.basic_info?.risk_score)
}
</script>

<template>
  <!-- 批量结果 -->
  <template v-if="isBatch">
    <p class="hint">
      共 {{ batchRows.rows.length }} 条 · 成功 {{ batchRows.ok }} 条 · 高风险 {{ batchRows.high }} 条
    </p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width: 44px">#</th>
            <th>文本</th>
            <th style="width: 120px">类型</th>
            <th style="width: 92px">等级</th>
            <th class="n" style="width: 72px">评分</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in batchRows.rows" :key="i">
            <td class="mono">{{ i + 1 }}</td>
            <td><span class="truncate" :title="r.text">{{ r.text }}</span></td>
            <td>{{ r.data?.basic_info?.fraud_category || '-' }}</td>
            <td>
              <span v-if="r.data" class="pill" :class="pillClass(rowTier(r))">
                {{ tierText(rowTier(r)) }}
              </span>
              <span v-else class="pill">失败</span>
            </td>
            <td class="n mono">{{ r.data ? fmtScore(r.data.basic_info?.risk_score) : '-' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>

  <!-- 单条报告 -->
  <template v-else>
    <div class="report-head">
      <span v-if="failed" class="pill">未完成分析</span>
      <span v-else class="pill" :class="pillClass(tier)">{{ tierText(tier) }}</span>
      <span class="mono" style="color: var(--muted)">{{ ri.fraud_category || '未分类' }}</span>
      <span class="mono report-id">{{ engineUsedName(ri.engine_used) }}</span>
      <span v-if="report.demo" class="pill">示例数据</span>
      <span class="spacer"></span>
      <span class="mono report-id">{{ report.report_id || '-' }}</span>
      <span class="mono report-id">{{ fmtWhen(ri.detected_at || report.generated_at) }}</span>
    </div>

    <div class="lead">
      <div class="lead-figure">
        <div class="lead-label">风险评分</div>
        <div class="lead-value mono">
          {{ failed ? '-' : fmtScore(ri.risk_score) }}<span class="of"> / 1.00</span>
        </div>
        <div class="lead-meta">{{ failed ? '未产生评分' : '置信度 ' + confidence }}</div>
      </div>
      <RiskScale :score="failed ? null : ri.risk_score" title="风险刻度" />
    </div>

    <div class="report-cols">
      <div class="report-main">
        <DimensionBars v-if="dims.length" :items="dims" />
        <p v-else class="hint">六维明细需要深度分析；当前引擎未返回维度数据。</p>
      </div>
      <div class="report-side">
        <div class="report-section">
          <h3>初步诊断</h3>
          <p>{{ report.summary || '暂无诊断结论。' }}</p>
        </div>
        <div v-if="suggestions.length" class="report-section">
          <h3>防范建议</h3>
          <ol>
            <li v-for="(s, i) in suggestions" :key="i">{{ s }}</li>
          </ol>
        </div>
      </div>
    </div>
  </template>
</template>
