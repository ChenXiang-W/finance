<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi } from '../../api'
import { fmtWhen } from '../../utils/format'

const rows = ref([])
const total = ref(0)
const loading = ref(true)
const dialog = ref(false)
const saving = ref(false)
const form = ref({ id: null, username: '', email: '', role: 'analyst', password: '' })

async function load() {
  loading.value = true
  try {
    const d = await adminApi.users()
    rows.value = d?.items || d || []
    total.value = d?.total ?? rows.value.length
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

function openNew() {
  form.value = { id: null, username: '', email: '', role: 'analyst', password: '' }
  dialog.value = true
}
function openEdit(row) {
  form.value = { id: row.id, username: row.username, email: row.email, role: row.role || 'analyst', password: '' }
  dialog.value = true
}

async function save() {
  saving.value = true
  try {
    if (form.value.id) await adminApi.updateUser(form.value.id, form.value)
    else await adminApi.createUser(form.value)
    ElMessage.success('已保存')
    dialog.value = false
    await load()
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`删除用户 ${row.username}？`, '确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await adminApi.deleteUser(row.id)
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    ElMessage.error(e.message)
  }
}

onMounted(load)
</script>

<template>
  <div class="admin-head">
    <div>
      <h1>用户管理</h1>
      <p class="hint">业务用户账号（管理员账号在数据库初始化时创建）</p>
    </div>
    <el-button type="primary" @click="openNew">新增用户</el-button>
  </div>

  <div class="admin-card" v-loading="loading">
    <p class="hint" style="margin-bottom: 10px">共 {{ total }} 个用户</p>
    <el-table :data="rows" size="small" stripe>
      <el-table-column prop="username" label="用户名" width="160" />
      <el-table-column prop="email" label="邮箱" min-width="200" />
      <el-table-column prop="role" label="角色" width="120" />
      <el-table-column label="创建时间" width="170">
        <template #default="{ row }">{{ fmtWhen(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="150">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" plain @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!loading && !rows.length" description="还没有用户" />
  </div>

  <el-dialog v-model="dialog" :title="form.id ? '编辑用户' : '新增用户'" width="480px">
    <el-form label-position="top">
      <el-form-item label="用户名"><el-input v-model="form.username" /></el-form-item>
      <el-form-item label="邮箱"><el-input v-model="form.email" /></el-form-item>
      <el-form-item label="角色">
        <el-select v-model="form.role" style="width: 100%">
          <el-option label="analyst" value="analyst" />
          <el-option label="admin" value="admin" />
        </el-select>
      </el-form-item>
      <el-form-item :label="form.id ? '重置密码（留空不修改）' : '密码'">
        <el-input v-model="form.password" type="password" show-password />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialog = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>
