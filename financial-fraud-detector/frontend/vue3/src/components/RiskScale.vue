<script setup>
import { computed } from 'vue'
import { fmtScore } from '../utils/format'

const props = defineProps({
  score: { type: [Number, String], default: null },
  title: { type: String, default: '风险刻度' },
})

const has = computed(() => Number.isFinite(Number(props.score)))
const pct = computed(() => {
  if (!has.value) return null
  const s = Math.max(0, Math.min(1, Number(props.score)))
  return (s * 100).toFixed(1)
})
const ticks = computed(() =>
  Array.from({ length: 11 }, (_, i) => ({ left: i * 10, major: i % 5 === 0 })),
)
const labels = ['0', '0.2', '0.4', '0.6', '0.8', '1.0']
</script>

<template>
  <div class="scale">
    <div class="scale-head">
      <span>{{ title }}</span>
      <span>{{ has ? '当前 ' + fmtScore(score) : '当前 -' }} · 警戒线 0.60</span>
    </div>
    <div class="scale-track">
      <span
        v-for="(t, i) in ticks"
        :key="i"
        class="scale-tick"
        :class="{ major: t.major }"
        :style="{ left: t.left + '%' }"
      ></span>
      <span class="scale-guard" style="left: 60%"></span>
      <span v-if="has" class="scale-marker" :style="{ left: pct + '%' }"></span>
    </div>
    <div class="scale-labels">
      <span v-for="l in labels" :key="l">{{ l }}</span>
    </div>
  </div>
</template>
