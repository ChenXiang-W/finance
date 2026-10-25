<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import * as echarts from 'echarts'
import { detectApi } from '../api'

/* ---------------- 省份配色 / 风险等级 ---------------- */
const PROVINCE_COLORS = [
  '#101a2e', '#121d33', '#0f1a2e', '#131e36', '#111b2e',
  '#101a2e', '#142037', '#0f1928', '#121d33', '#111b2e',
  '#101a2e', '#131e36', '#142037', '#0f1a2e', '#121d33',
  '#111b2e', '#101a2e', '#131e36', '#0f1a2e', '#121d33',
  '#111b2e', '#101a2e', '#142037', '#131e36', '#0f1a2e',
  '#121d33', '#111b2e', '#101a2e', '#131e36', '#142037',
  '#0f1a2e', '#121d33', '#111b2e', '#101a2e', '#131e36',
]
const LEVEL = {
  critical: { fill: '#ff2a2a', name: '极高风险' },
  high: { fill: '#ff9f1c', name: '高风险' },
  medium: { fill: '#ffe14d', name: '中风险' },
  low: { fill: '#00ff9d', name: '低风险' },
}
const RISK_PILL = {
  极高风险: ['rgba(255,42,42,.18)', '#ff8080'],
  高风险: ['rgba(255,159,28,.18)', '#ffc266'],
  中风险: ['rgba(255,225,77,.16)', '#ffe9a3'],
  低风险: ['rgba(0,255,157,.16)', '#7dffc8'],
}

/* ---------------- 状态 ---------------- */
const chartEl = ref(null)
const nodesText = ref('- 节点')
const liveText = ref('实时监控')
const isDemo = ref(false)
const metrics = reactive({ threats: '-', alerts: '-', regions: '-' })
const stats = reactive({ total: 0, types: 0, latency: 0 })
const feeds = ref([])
const province = reactive({ open: false, name: '', risk: '', desc: '', stats: [], bars: [], cases: [] })

let chart = null
let provinceData = {}
let resizeHandler = null

/* ---------------- 工具 ---------------- */
function anim(el, target, dur = 1200, dec = 0) {
  if (!el) return
  const start = performance.now()
  const from = 0
  function step(now) {
    const p = Math.min((now - start) / dur, 1)
    const cur = from + (target - from) * (1 - Math.pow(1 - p, 3))
    el.textContent = dec > 0 ? cur.toFixed(dec) : Math.round(cur)
    if (p < 1) requestAnimationFrame(step)
    else el.textContent = dec > 0 ? target.toFixed(dec) : target
  }
  requestAnimationFrame(step)
}

/* ---------------- 地图 ---------------- */
async function initMap(data) {
  if (!chartEl.value) return
  if (chart) chart.dispose()
  chart = echarts.init(chartEl.value)
  chart.showLoading({ text: '加载地图…', color: '#4f6ef7', maskColor: 'rgba(5,8,15,0.8)' })

  provinceData = {}
  ;(data?.nodes || []).forEach((n) => { provinceData[n.name] = n })

  try {
    const geo = await fetch(`${import.meta.env.BASE_URL}china.json`).then((r) => r.json())
    chart.hideLoading()
    echarts.registerMap('china', geo)

    const regions = geo.features
      .filter((f) => f.properties.name)
      .map((f, i) => ({
        name: f.properties.name,
        itemStyle: { areaColor: PROVINCE_COLORS[i % PROVINCE_COLORS.length] },
      }))

    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(7,11,20,0.95)',
        borderColor: 'rgba(56,189,248,0.35)',
        padding: [12, 16],
        textStyle: { color: '#dce6f0', fontSize: 14, fontFamily: '"Noto Sans SC",sans-serif' },
        formatter: (p) => {
          const pd = provinceData[p.name]
          if (pd) {
            const lc = LEVEL[pd.level] || LEVEL.low
            return `<b style="color:#fff;">${p.name}</b><br/>风险：<span style="color:${lc.fill}">${lc.name}</span><br/>节点：${pd.count}<br/><i style="color:#00f3ff;">点击查看实时详情</i>`
          }
          return `<b>${p.name}</b>`
        },
      },
      geo: {
        map: 'china',
        roam: true,
        zoom: 1.25,
        center: [104, 36],
        aspectScale: 0.85,
        label: { show: true, color: 'rgba(255,255,255,0.4)', fontSize: 11, fontFamily: '"Noto Sans SC",sans-serif' },
        regions,
        itemStyle: { borderColor: 'rgba(56,189,248,0.18)', borderWidth: 0.8, shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' },
        emphasis: {
          label: { fontSize: 14, fontWeight: 'bold', color: '#fff' },
          itemStyle: {
            areaColor: '#1a3050',
            borderColor: 'rgba(56,189,248,0.55)',
            borderWidth: 2,
            shadowBlur: 20,
            shadowColor: 'rgba(56,189,248,0.2)',
          },
        },
      },
      series: [],
    })

    chart.getDom().style.backgroundColor = 'transparent'
    chart.on('click', (p) => {
      if (p.componentType === 'geo' && p.name) showProvince(p.name)
    })
  } catch (e) {
    chart.hideLoading()
    console.error('地图数据加载失败', e)
  }
}

/* ---------------- 省份详情 ---------------- */
async function showProvince(name) {
  province.open = true
  province.name = name
  province.desc = '正在获取实时情报...'
  province.risk = ''
  try {
    const info = await detectApi.provinceIntel(name)
    province.risk = info.risk || '暂无数据'
    province.desc = info.desc || ''
    province.stats = [
      { label: '活跃节点', value: info.nodes || 0 },
      { label: '本月案件', value: info.monthly || 0 },
      { label: '高危预警', value: info.alerts || 0 },
    ]
    province.bars = info.fraud_types || []
    province.cases = info.cases || []
  } catch {
    province.desc = '情报获取失败，请检查后端服务'
  }
}

function closeProvince() {
  province.open = false
}

/** 省份是否真有情报数据：全 0 且无类型/案件时显示"暂无情报"，不摆一排假 0 */
const hasIntel = computed(() =>
  province.stats.some((s) => (s.value || 0) > 0) || province.bars.length > 0 || province.cases.length > 0,
)

/* ---------------- 数据 ---------------- */
async function loadFeed() {
  try {
    const data = await detectApi.threatFeed()
    if (!data) return
    // 省份→风险数据映射在这里更新：地图先于数据初始化，
    // 之前只在 initMap 里填充一次（null），tooltip 永远拿不到省份情报
    ;(data?.nodes || []).forEach((n) => { provinceData[n.name] = n })
    feeds.value = data.feeds || []
    isDemo.value = !!data.demo
    if (isDemo.value) liveText.value = '演示数据'
    if (data.stats) {
      nodesText.value = `${data.stats.total_nodes} 节点`
      metrics.threats = data.stats.active_threats
      metrics.alerts = data.stats.today_alerts
      metrics.regions = data.stats.coverage_regions
    }
  } catch {
    /* 后端离线 */
  }
}

async function loadStats() {
  try {
    const s = await detectApi.stats()
    if (!s) return
    stats.total = s.total_detections || 0
    stats.types = (s.categories || []).length
    stats.latency = Math.round(s.avg_latency_ms || 0)
  } catch {
    /* ignore */
  }
}

const tagText = { critical: 'CRIT', high: 'HIGH', medium: 'MED', low: 'LOW' }
const BASE = import.meta.env.BASE_URL

onMounted(async () => {
  await nextTick()
  await initMap(null)
  await loadFeed()
  await loadStats()
  resizeHandler = () => chart?.resize()
  window.addEventListener('resize', resizeHandler)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeHandler)
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div class="home-page">
    <!-- 左侧：地图 + 情报流 -->
    <section class="home-globe">
      <div class="globe-header">
        <div>
          <span class="globe-title">全国诈骗态势监控</span>
          <span class="globe-subtitle">China Fraud Threat Intelligence</span>
        </div>
        <div class="globe-badges">
          <span class="globe-badge live">{{ isDemo ? '● 演示数据' : '● 实时监控中' }}</span>
          <span class="globe-badge nodes">{{ nodesText }}</span>
        </div>
      </div>

      <div ref="chartEl" class="globe-container"></div>

      <div class="globe-info-bar">
        <div class="globe-legend">
          <span class="legend-item"><i class="ld critical"></i> 极高风险</span>
          <span class="legend-item"><i class="ld high"></i> 高风险</span>
          <span class="legend-item"><i class="ld med"></i> 中风险</span>
          <span class="legend-item"><i class="ld low"></i> 低风险</span>
        </div>
        <div class="globe-metrics">
          <span>活跃威胁 <b>{{ metrics.threats }}</b></span>
          <span>今日告警 <b>{{ metrics.alerts }}</b></span>
          <span>覆盖区域 <b>{{ metrics.regions }}</b></span>
        </div>
      </div>

      <div class="threat-feed-wrapper">
        <div class="threat-feed-title">实时威胁情报流</div>
        <div class="threat-feed-scroll">
          <div class="threat-feed">
            <template v-for="round in 2" :key="round">
              <div v-for="(f, i) in feeds" :key="round + '-' + i" class="feed-item">
                <span class="feed-time">{{ f.time }}</span>
                <span class="feed-loc">{{ f.loc }}</span>
                <span class="feed-desc">{{ f.desc }}</span>
                <span class="feed-tag" :class="f.level">{{ tagText[f.level] || 'INFO' }}</span>
              </div>
            </template>
          </div>
        </div>
      </div>
    </section>

    <!-- 右侧：品牌卡 -->
    <section class="home-card">
      <div class="home-logo">
        <div class="logo-hex">
          <img :src="BASE + 'jpg/Logo.jpg'" alt="金盾智眼" class="logo-img" />
        </div>
        <h1>金盾智眼</h1>
        <div class="home-subtitle">AI-Powered Financial Fraud Intelligence</div>
      </div>

      <p class="home-tagline">
        基于大语言模型的金融欺诈检测平台<br />
        多维风险分析 · 实时威胁监控 · 智能决策
      </p>

      <div class="home-actions">
        <router-link to="/detect" class="home-btn-primary">
          <span>进入系统</span>
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" />
          </svg>
        </router-link>
        <!-- 管理后台入口已去重：左侧导航栏底部常驻 -->
      </div>

      <div class="home-divider"></div>

      <div class="home-stats">
        <div class="home-stat">
          <span class="home-stat-num"><span>{{ stats.total }}</span><span class="home-stat-unit"> 条</span></span>
          <span class="home-stat-label">累计检测</span>
        </div>
        <div class="home-stat">
          <span class="home-stat-num"><span>{{ stats.types }}</span><span class="home-stat-unit"> 类</span></span>
          <span class="home-stat-label">欺诈类型覆盖</span>
        </div>
        <div class="home-stat">
          <span class="home-stat-num"><span>{{ stats.latency }}</span><span class="home-stat-unit">ms</span></span>
          <span class="home-stat-label">平均响应</span>
        </div>
      </div>

      <div class="home-footer">
        <span>Powered by DeepSeek AI</span>
        <span class="home-footer-dot">·</span>
        <span>v4.0 · Vue 3</span>
      </div>
    </section>

    <!-- 省份详情浮层：显示/隐藏完全由 .open 类的 transform 控制（home.css），
         不能绑 display:flex —— flex 横排会把标题/统计挤成一根根竖条 -->
    <aside class="province-sidebar" :class="{ open: province.open }">
      <div class="ps-header">
        <button class="ps-back" @click="closeProvince">← 返回</button>
        <h3>{{ province.name }}</h3>
        <span
          class="ps-badge"
          :style="RISK_PILL[province.risk] ? { background: RISK_PILL[province.risk][0], color: RISK_PILL[province.risk][1] } : {}"
        >{{ province.risk }}</span>
      </div>
      <template v-if="hasIntel">
        <div class="ps-stats">
          <div v-for="s in province.stats" :key="s.label" class="ps-stat">
            <b>{{ s.value }}</b><span>{{ s.label }}</span>
          </div>
        </div>
        <div class="ps-desc">{{ province.desc }}</div>
        <h4>欺诈类型分布</h4>
        <div class="ps-bars">
          <div v-for="(b, i) in province.bars" :key="i" class="ps-bar-row">
            <span class="ps-bar-label">{{ b.type }}</span>
            <div class="ps-bar-track"><div class="ps-bar-fill" :style="{ width: b.pct + '%', background: b.color }"></div></div>
            <span class="ps-bar-pct">{{ b.pct }}%</span>
          </div>
        </div>
        <h4>近期案件</h4>
        <div class="ps-cases">
          <div v-for="(c, i) in province.cases" :key="i" class="ps-case">{{ c }}</div>
        </div>
      </template>
      <div v-else class="ps-desc">该省份暂无情报数据。<br />情报覆盖全国主要诈骗高发省份，其余地区数据持续接入中。</div>
    </aside>
  </div>
</template>

<style scoped>
/* 让旧 home.css 的整页布局在 Vue 的 .canvas 里正常铺满 */
.home-page {
  height: 100svh;
  overflow: hidden;
}
</style>
