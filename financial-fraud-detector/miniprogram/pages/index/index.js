const { sessionId, request } = require('../../utils/api')

const ENGINE_NAMES = {
  deepseek: 'DeepSeek 深度分析',
  finetuned: '本地微调模型',
  none: '无可用引擎',
}
const LEVEL_COLORS = {
  极高风险: ['#ff2a2a', 'rgba(255,42,42,0.16)', '#ff8080'],
  高风险: ['#ff9f1c', 'rgba(255,159,28,0.16)', '#ffc266'],
  中风险: ['#ffe14d', 'rgba(255,225,77,0.14)', '#ffe9a3'],
  低风险: ['#00ff9d', 'rgba(0,255,157,0.14)', '#7dffc8'],
}

function fmtScore(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(2) : '-'
}

Page({
  data: {
    text: '',
    chatText: '',
    busy: false,
    typing: false,
    error: '',
    report: null,
    messages: [],
    scrollTop: 0,
  },

  onInput(e) {
    this.setData({ text: e.detail.value })
  },
  onChatInput(e) {
    this.setData({ chatText: e.detail.value })
  },

  /** 滚动对话到底部 */
  scrollChat() {
    this.setData({ scrollTop: this.data.scrollTop + 9999 })
  },

  /** 检测 */
  detect() {
    const text = (this.data.text || '').trim()
    if (!text) {
      wx.showToast({ title: '请先粘贴文本', icon: 'none' })
      return
    }
    if (this.data.busy) return
    this.setData({ busy: true, error: '', report: null })
    request('/api/detect', 'POST', {
      text,
      session_id: sessionId(),
      use_llm: true,
      engine: 'auto',
    }).then((d) => {
      const bi = d.basic_info || {}
      const failed = /失败|未分析|分析中/.test(String(bi.risk_level || ''))
      const dims = (d.risk_factors || []).map((f) => {
        const s = Math.max(0, Math.min(1, Number(f.score) || 0))
        return {
          category: f.category || '维度',
          pct: Math.round(s * 100),
          text: s.toFixed(2),
          color: s >= 0.6 ? '#ff5d6c' : s >= 0.3 ? '#ffe14d' : '#00ff9d',
        }
      })
      const levelColors = LEVEL_COLORS[bi.risk_level] || LEVEL_COLORS['中风险']
      this.setData({
        report: {
          score: fmtScore(bi.risk_score),
          level: bi.risk_level || '-',
          levelBg: levelColors[1],
          levelColor: levelColors[2],
          category: bi.fraud_category || '未分类',
          confidence: Math.round((Number(bi.confidence) || 0) * 100) + '%',
          engineText: ENGINE_NAMES[bi.engine_used] || bi.engine_used || '-',
          latencyText: bi.latency_ms != null ? '耗时 ' + (bi.latency_ms / 1000).toFixed(1) + 's' : '',
          dims,
          summary: d.summary || '',
          suggestions: d.suggestions || [],
        },
        messages: failed ? this.data.messages : this.data.messages,
      })
      wx.showToast({ title: '检测完成', icon: 'success' })
    }).catch((e) => {
      this.setData({ error: '检测失败：' + e.message })
    }).finally(() => {
      this.setData({ busy: false })
    })
  },

  /** 对话（本地模型 /api/chat） */
  send() {
    const content = (this.data.chatText || '').trim()
    if (!content || this.data.typing) return
    const messages = this.data.messages.concat([{ role: 'user', content }])
    this.setData({ messages, chatText: '', typing: true })
    this.scrollChat()

    const history = [{
      role: 'system',
      content: '你是金融反诈助手「金盾智眼」。用简洁中文回答，分点说明，回答控制在 200 字以内，' +
        '不要输出 JSON，不要提及 DeepSeek 或任何其他模型、工具、服务；' +
        '即使用户问到其他 AI，也不要复述其名称，只回答你专注于金融反诈。',
    }].concat(messages.map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })))

    request('/api/chat', 'POST', {
      messages: history,
      max_new_tokens: 256,
      temperature: 0.7,
    }).then((d) => {
      this.setData({
        messages: this.data.messages.concat([{ role: 'model', content: (d && d.reply) || '（模型没有返回内容）' }]),
      })
    }).catch((e) => {
      this.setData({
        messages: this.data.messages.concat([{ role: 'model', content: '对话失败：' + e.message + '（需后端已启动且模型已加载）' }]),
      })
    }).finally(() => {
      this.setData({ typing: false })
      this.scrollChat()
    })
  },
})
