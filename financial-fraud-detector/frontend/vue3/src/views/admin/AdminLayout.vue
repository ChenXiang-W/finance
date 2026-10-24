<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { adminApi } from '../../api'
import { useAppStore } from '../../stores/app'

const app = useAppStore()
const router = useRouter()

const authed = ref(false)
const checking = ref(true)
const loading = ref(false)
const form = ref({ username: '', password: '' })

const BASE = import.meta.env.BASE_URL
const nav = [
  { to: '/admin/dashboard', label: '仪表盘' },
  { to: '/admin/dataset', label: '训练数据' },
  { to: '/admin/training', label: '模型训练' },
  { to: '/admin/cases', label: '案例管理' },
  { to: '/admin/users', label: '用户管理' },
  { to: '/admin/monitor', label: '系统监控' },
]

async function check() {
  const token = localStorage.getItem('admin_token')
  if (!token) {
    authed.value = false
    checking.value = false
    return
  }
  try {
    await adminApi.verify()
    authed.value = true
  } catch {
    localStorage.removeItem('admin_token')
    authed.value = false
  } finally {
    checking.value = false
  }
}

async function login() {
  if (!form.value.username || !form.value.password) {
    app.notify('请输入用户名和密码', 'error')
    return
  }
  loading.value = true
  try {
    const res = await adminApi.login(form.value.username.trim(), form.value.password)
    localStorage.setItem('admin_token', res.access_token)
    authed.value = true
    app.notify('登录成功', 'success')
    router.push('/admin/dashboard')
  } catch (e) {
    app.notify('登录失败：' + e.message, 'error')
  } finally {
    loading.value = false
  }
}

function logout() {
  localStorage.removeItem('admin_token')
  authed.value = false
  app.notify('已退出登录')
}

onMounted(async () => {
  document.documentElement.classList.add('dark')
  await check()
})
onBeforeUnmount(() => document.documentElement.classList.remove('dark'))
</script>

<template>
  <div v-if="checking" class="login-wrap">
    <div class="login-card"><p>正在校验登录状态…</p></div>
  </div>

  <div v-else-if="!authed" class="login-wrap">
    <div class="login-card">
      <h1>金盾智眼 · 管理后台</h1>
      <p>请使用管理员账号登录</p>
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="用户名">
          <el-input v-model="form.username" placeholder="admin" autofocus />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" show-password placeholder="密码" @keyup.enter="login" />
        </el-form-item>
        <el-button type="primary" style="width: 100%" :loading="loading" @click="login">登录</el-button>
      </el-form>
      <p style="margin-top: 14px">
        <router-link to="/detect" style="color: #00f3ff">← 返回检测台</router-link>
      </p>
    </div>
  </div>

  <div v-else class="admin-shell">
    <aside class="admin-nav">
      <div class="brand">
        <img :src="BASE + 'jpg/Logo.jpg'" alt="" />
        <div>
          <b>金盾智眼</b>
          <span>管理后台</span>
        </div>
      </div>
      <router-link v-for="item in nav" :key="item.to" :to="item.to">{{ item.label }}</router-link>
      <div class="nav-foot">
        <router-link to="/detect" style="color: inherit">← 返回检测台</router-link>
        <button class="btn ghost sm" @click="logout">退出登录</button>
      </div>
    </aside>

    <div class="admin-main">
      <router-view />
    </div>
  </div>
</template>
