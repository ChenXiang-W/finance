/** 格式化与风险分档工具 */

export function fmtScore(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(2) : '-'
}

export function fmtWhen(value) {
  if (!value) return '-'
  let d
  if (typeof value === 'string') {
    d = new Date(value.replace(' ', 'T'))
    if (Number.isNaN(d.getTime())) d = new Date(value)
  } else {
    d = new Date(value)
  }
  if (Number.isNaN(d.getTime())) return String(value)
  const p = (n) => (n < 10 ? '0' + n : String(n))
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function riskTier(score) {
  const s = Number(score) || 0
  if (s >= 0.6) return 'high'
  if (s >= 0.4) return 'mid'
  return 'low'
}

export function tierText(tier) {
  return { high: '高风险', mid: '中风险', low: '低风险' }[tier] || '未知'
}

export function pillClass(tier) {
  return { high: 'neg', mid: 'warn', low: 'pos' }[tier] || ''
}

export function engineName(e) {
  return { auto: '自动', deepseek: 'DeepSeek 深度', local: '本地微调' }[e] || '自动'
}

export function engineUsedName(used) {
  return { deepseek: 'DeepSeek 深度分析', finetuned: '本地微调模型', none: '无可用引擎' }[used] || '无可用引擎'
}

/** 智能体回复的极简 Markdown：转义后只放开 **粗体** 与换行 */
export function fmtAgentText(text) {
  if (!text) return ''
  const escaped = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
  return escaped.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>')
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
