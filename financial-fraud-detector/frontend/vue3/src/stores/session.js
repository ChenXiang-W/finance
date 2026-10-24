import { defineStore } from 'pinia'
import { detectApi, sessionId } from '../api'
import { useAppStore } from './app'

/** 会话（历史记录）与全局统计 */
export const useSessionStore = defineStore('session', {
  state: () => ({
    sid: sessionId(),
    conversations: [],
    stats: {},
    online: null,
    loading: false,
  }),
  getters: {
    highRiskCount: (s) => s.conversations.filter((c) => Number(c.risk_score) >= 0.6).length,
    recent: (s) => s.conversations.slice(-5).reverse(),
    scores: (s) => s.conversations.map((c) => Number(c.risk_score)).filter((v) => Number.isFinite(v)),
  },
  actions: {
    async load() {
      this.loading = true
      try {
        const [sess, stats] = await Promise.allSettled([detectApi.session(this.sid), detectApi.stats()])
        if (sess.status === 'fulfilled') {
          this.conversations = sess.value?.data?.conversations || []
        }
        if (stats.status === 'fulfilled') {
          this.stats = stats.value || {}
          this.online = true
        } else {
          this.online = false
        }
      } finally {
        this.loading = false
      }
    },
    async checkHealth() {
      try {
        await detectApi.health()
        this.online = true
      } catch {
        this.online = false
      }
      return this.online
    },
    async remove(id) {
      const app = useAppStore()
      try {
        await detectApi.deleteItem(id, this.sid)
        await this.load()
        app.notify('已删除', 'success')
      } catch (e) {
        app.notify('删除失败：' + e.message, 'error')
      }
    },
    find(id) {
      return this.conversations.find((c) => String(c.id) === String(id))
    },
  },
})
