<script setup>
import { onMounted, ref, watch } from 'vue'
import { useAppStore } from '../stores/app'

const props = defineProps({
  items: { type: Array, default: () => [] }, // [{ label, value, text, cls }]
  wide: { type: Boolean, default: true },
})

const app = useAppStore()
const el = ref(null)
const ready = ref(false)

function replay() {
  ready.value = false
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { ready.value = true })
  })
}

onMounted(() => {
  if (app.motionOff) {
    ready.value = true
  } else {
    replay()
  }
})

watch(() => props.items, () => {
  if (!app.motionOff) replay()
})

function pct(v) {
  const max = Math.max(1, ...props.items.map((i) => Number(i.value) || 0))
  return Math.max(0, Math.min(100, ((Number(v) || 0) / max) * 100))
}
</script>

<template>
  <div ref="el" class="dims">
    <div v-for="(it, i) in items" :key="i" class="dim">
      <span class="dim-label" :class="{ wide }">{{ it.label }}</span>
      <span class="dim-track">
        <span
          class="dim-fill"
          :class="it.cls"
          :style="{ width: ready ? pct(it.value) + '%' : '0%' }"
        ></span>
      </span>
      <span class="dim-val" :class="{ wide }">{{ it.text ?? it.value }}</span>
    </div>
  </div>
</template>
