import { defineStore } from 'pinia'
import { apiBase } from '../api'

/** 全局外观 / 引擎 / 提示 */
export const useAppStore = defineStore('app', {
  state: () => ({
    theme: localStorage.getItem('theme') === 'light' ? 'light' : 'dark',
    motionOff: localStorage.getItem('motion_off') === '1',
    engine: ['auto', 'deepseek', 'local'].includes(localStorage.getItem('engine'))
      ? localStorage.getItem('engine')
      : 'auto',
    apiBaseUrl: apiBase(),
    toast: { msg: '', type: '', show: false },
    _toastTimer: null,
  }),
  actions: {
    applyTheme() {
      document.documentElement.setAttribute('data-theme', this.theme)
    },
    setTheme(isDark) {
      this.theme = isDark ? 'dark' : 'light'
      localStorage.setItem('theme', this.theme)
      this.applyTheme()
    },
    applyMotion() {
      document.body.classList.toggle('motion-off', this.motionOff)
    },
    setMotion(on) {
      this.motionOff = !on
      localStorage.setItem('motion_off', this.motionOff ? '1' : '0')
      this.applyMotion()
    },
    setEngine(e) {
      this.engine = e
      localStorage.setItem('engine', e)
    },
    notify(msg, type = '') {
      this.toast = { msg, type, show: true }
      clearTimeout(this._toastTimer)
      this._toastTimer = setTimeout(() => { this.toast.show = false }, 3000)
    },
    init() {
      this.applyTheme()
      this.applyMotion()
    },
  },
})
