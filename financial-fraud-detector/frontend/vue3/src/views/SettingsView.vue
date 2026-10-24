<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'
import { detectApi } from '../api'

const app = useAppStore()
const router = useRouter()

const apiBase = ref(localStorage.getItem('api_base') || '')
const key = ref(localStorage.getItem('deepseek_api_key') || '')
const apiUrl = ref(localStorage.getItem('deepseek_api_url') || 'https://api.deepseek.com')
const model = ref(localStorage.getItem('deepseek_model') || 'deepseek-chat')
const svcStatus = ref('检测中…')
const saved = ref(false)

async function checkService() {
  try {
    const d = await detectApi.health()
    svcStatus.value = `服务在线 · ${d.service || '后端'} v${d.version || ''}`
  } catch {
    svcStatus.value = '后端离线 · 仅本地规则与智能体直连'
  }
}

function save() {
  const base = apiBase.value.trim().replace(/\/+$/, '')
  if (base) localStorage.setItem('api_base', base)
  else localStorage.removeItem('api_base')
  localStorage.setItem('deepseek_api_key', key.value.trim())
  localStorage.setItem('deepseek_api_url', apiUrl.value.trim() || 'https://api.deepseek.com')
  localStorage.setItem('deepseek_model', model.value.trim() || 'deepseek-chat')
  app.apiBaseUrl = base
  saved.value = true
  setTimeout(() => { saved.value = false }, 2500)
  app.notify('设置已保存', 'success')
  checkService()
}

onMounted(checkService)
</script>

<template>
  <section class="view">
    <header class="title-row">
      <div>
        <h1>设置</h1>
        <p class="sub">外观、服务地址与模型。改动保存在本机浏览器；后端地址修改后需刷新页面。</p>
      </div>
    </header>

    <div class="settings">
      <div class="setting-section">
        <div class="setting-info">
          <h2>外观</h2>
          <p>深色/浅色与动效开关。关掉动效会同时停止过渡动画，适合低配机器演示。</p>
        </div>
        <div class="setting-panel">
          <div class="field-row">
            <div class="field-text">
              <label>深色终端主题</label>
              <p>默认深色；关闭使用浅色。</p>
            </div>
            <input
              type="checkbox"
              class="switch"
              :checked="app.theme === 'dark'"
              @change="app.setTheme($event.target.checked)"
            />
          </div>
          <div class="field-row">
            <div class="field-text">
              <label>界面动效</label>
              <p>关闭后不再有粒子、扫描线与过渡动画。</p>
            </div>
            <input
              type="checkbox"
              class="switch"
              :checked="!app.motionOff"
              @change="app.setMotion($event.target.checked)"
            />
          </div>
        </div>
      </div>

      <div class="setting-section">
        <div class="setting-info">
          <h2>服务</h2>
          <p>后端 API 地址。留空时自动使用当前主机的 8000 端口。</p>
        </div>
        <div class="setting-panel">
          <div class="field">
            <label>后端 API 地址</label>
            <input v-model="apiBase" class="input" placeholder="http://127.0.0.1:8000" />
            <span class="hint">{{ svcStatus }}</span>
          </div>
        </div>
      </div>

      <div class="setting-section">
        <div class="setting-info">
          <h2>模型</h2>
          <p>DeepSeek 用于深度分析；未配置 Key 时只做规则预筛与本地微调模型推理。</p>
        </div>
        <div class="setting-panel">
          <div class="field">
            <label>DeepSeek API Key</label>
            <input v-model="key" class="input" type="password" placeholder="sk-…" />
          </div>
          <div class="field">
            <label>API 地址</label>
            <input v-model="apiUrl" class="input" placeholder="https://api.deepseek.com" />
          </div>
          <div class="field">
            <label>模型</label>
            <input v-model="model" class="input" placeholder="deepseek-chat" />
          </div>
        </div>
      </div>

      <div class="setting-section">
        <div class="setting-info">
          <h2>训练</h2>
          <p>录入训练数据、微调并启用垂直模型在管理后台完成。</p>
        </div>
        <div class="setting-panel">
          <button class="btn" style="justify-self: start" @click="router.push('/admin')">打开管理后台</button>
        </div>
      </div>

      <div class="setting-section">
        <div class="setting-info"></div>
        <div class="setting-panel" style="display: flex; align-items: center; gap: 12px">
          <button class="btn primary" @click="save">保存设置</button>
          <span v-if="saved" class="hint">已保存</span>
        </div>
      </div>
    </div>
  </section>
</template>
