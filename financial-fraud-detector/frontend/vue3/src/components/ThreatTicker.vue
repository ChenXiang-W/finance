<script setup>
import { onMounted, ref } from 'vue'
import { detectApi } from '../api'

const fallback = [
  '[江苏·南京] P2P 清退后新型庞氏骗局被查，非法吸存 8 亿',
  '[四川·成都] 虚假投资平台非法吸存 8.5 亿，受害者遍布全国',
  '[广东·深圳] 虚假私募基金跑路，涉案金额 3.2 亿',
  '[浙江·杭州] 虚拟货币传销被取缔，发展下线超 5 万人',
  '[北京·朝阳] 虚假信托产品诈骗老年人，涉案超 8000 万',
  '[福建·厦门] 地下钱庄跨境洗钱通道被破，涉案 30 亿',
]

const items = ref(fallback)
const duration = ref('60s')

function build(list) {
  const safe = (list || []).filter(Boolean)
  if (!safe.length) return
  items.value = safe
  duration.value = Math.max(24, Math.min(90, safe.length * 6)) + 's'
}

onMounted(async () => {
  try {
    const data = await detectApi.threatFeed()
    const feeds = data?.feeds || []
    if (feeds.length) {
      build(feeds.map((f) => `[${f.loc || '全国'}] ${f.desc || ''}`))
    }
  } catch {
    /* 后端离线：使用内置播报 */
  }
})
</script>

<template>
  <div class="threat-ticker" aria-label="威胁情报滚动播报">
    <span class="ticker-label">ALERT</span>
    <div class="ticker-track" :style="{ animationDuration: duration }">
      <template v-for="round in 2" :key="round">
        <span v-for="(t, i) in items" :key="round + '-' + i">{{ t }}</span>
      </template>
    </div>
  </div>
</template>
