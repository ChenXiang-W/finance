import axios from 'axios'

/**
 * API 基址：优先用「设置」里存的后端地址，否则默认当前主机的 8000 端口。
 * 开发期（5173）与生产静态托管都可用，后端已开 CORS。
 */
export function apiBase() {
  const saved = (localStorage.getItem('api_base') || '').replace(/\/+$/, '')
  if (saved) return saved
  const host = window.location.hostname || '127.0.0.1'
  return `${window.location.protocol}//${host}:8000`
}

const http = axios.create({ timeout: 120000 })

http.interceptors.request.use((cfg) => {
  cfg.baseURL = apiBase()
  const token = localStorage.getItem('admin_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

http.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response && err.response.status === 401) {
      localStorage.removeItem('admin_token')
    }
    const detail = err.response?.data?.detail
    const msg = typeof detail === 'string' ? detail : (err.message || '请求失败')
    return Promise.reject(new Error(msg))
  },
)

/* ---------------- 会话 ID ---------------- */
export function sessionId() {
  let sid = localStorage.getItem('fraud_session_id')
  if (!sid) {
    sid = 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    localStorage.setItem('fraud_session_id', sid)
  }
  return sid
}

/* ---------------- 检测 / 情报 ---------------- */
export const detectApi = {
  detect: (text, engine = 'auto') =>
    http.post('/api/detect', { text, session_id: sessionId(), use_llm: true, engine }),
  fetchUrl: (url) => http.post('/api/fetch-url', { url }),
  // 本地对话首次要加载基座模型（可能 1-3 分钟），单独放宽超时到 5 分钟
  chat: (messages) => http.post('/api/chat', { messages }, { timeout: 300000 }),
  health: () => http.get('/api/health'),
  stats: () => http.get('/api/stats'),
  threatFeed: () => http.get('/api/threat-feed'),
  provinceIntel: (name) => http.get('/api/province-intel', { params: { name } }),
  session: (sid = sessionId()) => http.get(`/api/session/${sid}`),
  deleteItem: (id, sid = sessionId()) => http.delete(`/api/session/${sid}/item/${id}`),
  clearSession: (sid = sessionId()) => http.delete(`/api/session/${sid}`),
}

/* ---------------- 管理后台 ---------------- */
export const adminApi = {
  login: (username, password) => http.post('/api/admin/login', { username, password }),
  verify: () => http.get('/api/admin/verify-token'),
  stats: () => http.get('/api/admin/stats'),
  logs: (params) => http.get('/api/admin/logs', { params }),
  users: () => http.get('/api/admin/users'),
  createUser: (data) => http.post('/api/admin/users', data),
  updateUser: (id, data) => http.put(`/api/admin/users/${id}`, data),
  deleteUser: (id) => http.delete(`/api/admin/users/${id}`),
  apiKeys: () => http.get('/api/admin/api-keys'),
  saveApiKey: (userId, data) => http.put(`/api/admin/api-keys/${userId}`, data),

  cases: (params) => http.get('/api/admin/cases', { params }),
  createCase: (data) => http.post('/api/admin/cases', data),
  updateCase: (id, data) => http.put(`/api/admin/cases/${id}`, data),
  deleteCase: (id) => http.delete(`/api/admin/cases/${id}`),
  importCases: (formData) => http.post('/api/admin/cases/import', formData),
  exportCases: () => http.get('/api/admin/cases-export', { responseType: 'blob' }),

  dataset: () => http.get('/api/admin/dataset'),
  prepareDataset: () => http.post('/api/admin/dataset/prepare'),

  models: () => http.get('/api/admin/models'),
  activateModel: (id) => http.post(`/api/admin/models/${id}/activate`),
  deactivateModel: () => http.post('/api/admin/models/deactivate'),
  deleteModel: (id) => http.delete(`/api/admin/models/${id}`),
  modelInfo: () => http.get('/api/admin/model-info'),
  finetune: (data) => http.post('/api/admin/model-finetune', data),

  trainStatus: () => http.get('/api/admin/train/status'),
  trainStart: (data) => http.post('/api/admin/train/start', data),
  trainStop: () => http.post('/api/admin/train/stop'),
  trainLogs: (lines = 200) => http.get('/api/admin/train/logs', { params: { lines } }),

  systemInfo: () => http.get('/api/admin/system-info'),
  // 注意：LLM 配置挂在 /api 前缀（routers/detect.py），不是 /api/admin
  llmConfig: () => http.get('/api/llm/config'),
  saveLlmConfig: (data) => http.post('/api/llm/config', data),
}

export default http
