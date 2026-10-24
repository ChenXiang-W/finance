import { defineStore } from 'pinia'
import { detectApi } from '../api'
import { useAppStore } from './app'
import { useSessionStore } from './session'
import { fmtScore } from '../utils/format'

const SYSTEM_PROMPT =
  '你是一位资深金融反欺诈分析专家，拥有 15 年金融犯罪调查经验。' +
  '收到疑似欺诈文本时，请从「欺诈手法识别 / 心理操控剖析 / 资金风险推演 / 法律定性与后果 / 防范与应对 / 综合风险评级」六个维度分析，' +
  '结合文本中的具体词句，用中文、结构清晰、结尾给一句话总结。'

function deepseekKey() {
  return localStorage.getItem('deepseek_api_key') || ''
}

async function callDeepSeek(messages) {
  const key = deepseekKey()
  if (!key) throw new Error('未配置 DeepSeek API Key')
  const base = (localStorage.getItem('deepseek_api_url') || 'https://api.deepseek.com').replace(/\/+$/, '')
  const model = localStorage.getItem('deepseek_model') || 'deepseek-chat'
  const resp = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 2048, stream: false }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err?.error?.message || `API 请求失败 (HTTP ${resp.status})`)
  }
  const data = await resp.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) throw new Error('API 返回格式异常')
  return content
}

/** 检测工作台：报告 / 输入模式 / 智能体对话 */
export const useDetectStore = defineStore('detect', {
  state: () => ({
    report: null,
    busy: false,
    error: '',
    batchMode: false,
    urlMode: false,
    messages: [],
    typing: false,
  }),
  getters: {
    // 报告是否真的分析成功（未分析/失败/分析中都算没有结果）
    reportValid: (s) => {
      const ri = s.report && s.report.basic_info
      if (!ri) return false
      return !/失败|未分析|分析中/.test(String(ri.risk_level || ''))
    },
    mode: (s) => {
      const ri = s.report && s.report.basic_info
      const valid = !!ri && !/失败|未分析|分析中/.test(String(ri.risk_level || ''))
      return s.urlMode ? 'url' : s.batchMode ? 'batch' : valid ? 'agent' : 'detect'
    },
    hasKey: () => !!deepseekKey(),
  },
  actions: {
    reset() {
      this.report = null
      this.error = ''
      this.batchMode = false
      this.urlMode = false
      this.messages = []
      this.typing = false
    },
    toggleBatch() {
      this.batchMode = !this.batchMode
      if (this.batchMode) this.urlMode = false
    },
    toggleUrl() {
      this.urlMode = !this.urlMode
      if (this.urlMode) this.batchMode = false
    },

    /* ---------- 单条检测 ---------- */
    async runDetect(text) {
      const app = useAppStore()
      const session = useSessionStore()
      if (this.busy) return
      if (!text || !text.trim()) {
        app.notify(this.mode === 'agent' ? '请输入追问内容' : '请先粘贴需要检测的文本', 'error')
        return
      }
      this.busy = true
      this.error = ''
      this.report = null
      this.messages = []
      try {
        const res = await detectApi.detect(text.trim(), app.engine)
        const payload = res?.data ?? res
        if (!payload || !payload.basic_info) throw new Error('后端返回为空')
        this.report = payload
        if (!this.reportValid) {
          app.notify('检测已提交，但没有可用的分析引擎（本地模型未加载 / 未配置 DeepSeek），因此没有评分与六维结果', 'error')
        }
        await session.load()
        if (this.hasKey && this.reportValid) this.triggerAgentAnalysis(text.trim(), payload)
      } catch (e) {
        // 后端不可用但有 Key：转由智能体直连分析（不伪造结构化评分）
        if (this.hasKey) {
          this.error = '后端不可用，已转由右下对话区直接分析（无结构化评分）。'
          await this.sendAgent(
            `请对以下文本做金融欺诈六维分析，并在最后给出 0.00-1.00 的风险评分与等级：\n\n${text.trim()}`,
          )
        } else {
          this.error = e.message || '检测失败'
        }
      } finally {
        this.busy = false
      }
    },

    /* ---------- 批量检测 ---------- */
    async runBatch(text) {
      const app = useAppStore()
      const session = useSessionStore()
      const lines = String(text || '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      if (!lines.length) {
        app.notify('请至少输入一条文本', 'error')
        return
      }
      if (lines.length > 20) {
        app.notify('单次最多 20 条', 'error')
        return
      }
      this.busy = true
      const results = []
      try {
        for (let i = 0; i < lines.length; i++) {
          try {
            const res = await detectApi.detect(lines[i], app.engine)
            results.push({ text: lines[i], data: res?.data ?? res })
          } catch {
            results.push({ text: lines[i], data: null })
          }
        }
        this.report = { batch: true, rows: results }
        await session.load()
        app.notify(`批量完成：${results.length} 条`, 'success')
      } finally {
        this.busy = false
      }
    },

    /* ---------- URL 抓取 ---------- */
    async fetchUrl(url) {
      const app = useAppStore()
      if (!url || !/^https?:\/\//i.test(url.trim())) {
        app.notify('请输入以 http(s):// 开头的 URL', 'error')
        return
      }
      this.busy = true
      this.error = ''
      try {
        const res = await detectApi.fetchUrl(url.trim())
        if (!res?.ok || !res.text) throw new Error(res?.error || '抓取失败')
        this.urlMode = false
        this.busy = false
        await this.runDetect(res.text)
      } catch (e) {
        this.busy = false
        this.error = '抓取失败：' + e.message
      }
    },

    /* ---------- 示例报告（明确标注示例数据） ---------- */
    demo() {
      this.report = {
        demo: true,
        report_id: 'DEMO-' + Date.now(),
        generated_at: new Date().toISOString(),
        basic_info: {
          risk_score: 0.78,
          risk_level: '高风险',
          fraud_category: '冒充客服',
          confidence: 0.88,
          detected_at: new Date().toISOString(),
          engine_used: 'deepseek',
        },
        risk_factors: [
          { category: '欺诈手法', score: 0.92 },
          { category: '心理操控', score: 0.86 },
          { category: '资金风险', score: 0.8 },
          { category: '法律风险', score: 0.62 },
          { category: '社会危害', score: 0.7 },
          { category: '紧急程度', score: 0.88 },
        ],
        suggestions: [
          '任何要求「屏幕共享」的客服都是诈骗，立即挂断',
          '官方客服不会引导你把资金转入「安全账户」',
          '若已共享屏幕：立刻断网、挂失银行卡、修改支付密码',
          '保留通话与聊天记录，拨打 96110 或到就近派出所报案',
        ],
        summary:
          '典型冒充客服话术：以「征信受影响」制造紧迫感，诱导下载会议软件并屏幕共享，从而直接操作受害者银行账户。',
      }
    },

    /* ---------- 智能体 ---------- */
    async triggerAgentAnalysis(text, data) {
      const ri = data?.basic_info || {}
      const prompt =
        `请对以下文本进行金融欺诈分析：\n\n【待检测文本】\n${text}\n\n` +
        `（系统预筛：风险评分 ${fmtScore(ri.risk_score)}，等级 ${ri.risk_level || '未知'}，初步分类 ${ri.fraud_category || '未分类'}）\n\n请按 6 维度框架分析。`
      await this.sendAgent(prompt)
    },

    async sendAgent(text) {
      const app = useAppStore()
      const msg = String(text || '').trim()
      if (!msg) return
      this.messages.push({ role: 'user', content: msg })
      if (!this.hasKey) {
        // 未配置 DeepSeek：走本地基座的多轮对话（纯离线）
        this.typing = true
        try {
          const history = [{ role: 'system', content: '你是金融反诈助手，用简洁中文回答，不要输出 JSON。' }].concat(
            this.messages.map((m) => ({ role: m.role === 'agent' ? 'assistant' : 'user', content: m.content })),
          )
          const res = await detectApi.chat(history)
          this.messages.push({ role: 'agent', content: (res && res.reply) || '（本地模型没有返回内容）' })
        } catch (e) {
          this.messages.push({ role: 'agent', content: '本地对话失败：' + e.message + '（需后端已加载本地模型）' })
        } finally {
          this.typing = false
        }
        return
      }
      this.typing = true
      try {
        const history = [{ role: 'system', content: SYSTEM_PROMPT }].concat(
          this.messages.map((m) => ({ role: m.role === 'agent' ? 'assistant' : 'user', content: m.content })),
        )
        const reply = await callDeepSeek(history)
        this.messages.push({ role: 'agent', content: reply })
      } catch (e) {
        this.messages.push({ role: 'agent', content: '请求失败：' + e.message })
      } finally {
        this.typing = false
      }
    },

    /** 统一入口：按当前模式分发 */
    submit(text) {
      if (this.mode === 'url') return this.fetchUrl(text)
      if (this.mode === 'batch') return this.runBatch(text)
      if (this.mode === 'agent') return this.sendAgent(text)
      return this.runDetect(text)
    },
  },
})
