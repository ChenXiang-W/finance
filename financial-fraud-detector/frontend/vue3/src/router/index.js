import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  { path: '/', redirect: '/map' },
  { path: '/detect', name: 'detect', component: () => import('../views/DetectView.vue'), meta: { title: '欺诈检测' } },
  { path: '/history', name: 'history', component: () => import('../views/HistoryView.vue'), meta: { title: '历史记录' } },
  { path: '/stats', name: 'stats', component: () => import('../views/StatsView.vue'), meta: { title: '统计' } },
  { path: '/settings', name: 'settings', component: () => import('../views/SettingsView.vue'), meta: { title: '设置' } },
  { path: '/map', name: 'map', component: () => import('../views/MapView.vue'), meta: { title: '全国态势' } },
  {
    path: '/admin',
    component: () => import('../views/admin/AdminLayout.vue'),
    meta: { title: '管理后台' },
    children: [
      { path: '', redirect: '/admin/dashboard' },
      { path: 'dashboard', name: 'admin-dashboard', component: () => import('../views/admin/DashboardPage.vue'), meta: { title: '仪表盘' } },
      { path: 'dataset', name: 'admin-dataset', component: () => import('../views/admin/DatasetPage.vue'), meta: { title: '训练数据' } },
      { path: 'training', name: 'admin-training', component: () => import('../views/admin/TrainingPage.vue'), meta: { title: '模型训练' } },
      { path: 'cases', name: 'admin-cases', component: () => import('../views/admin/CasesPage.vue'), meta: { title: '案例管理' } },
      { path: 'users', name: 'admin-users', component: () => import('../views/admin/UsersPage.vue'), meta: { title: '用户管理' } },
      { path: 'monitor', name: 'admin-monitor', component: () => import('../views/admin/MonitorPage.vue'), meta: { title: '系统监控' } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/detect' },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.afterEach((to) => {
  const base = '金盾智眼'
  document.title = to.meta && to.meta.title ? `${to.meta.title} — ${base}` : base
  // 画布是内部滚动容器：切路由时必须复位，否则从首页（可滚动）进入工作台会带着上一页的滚动偏移
  requestAnimationFrame(() => {
    const canvas = document.querySelector('.canvas')
    if (canvas) canvas.scrollTop = 0
    window.scrollTo(0, 0)
  })
})

export default router
