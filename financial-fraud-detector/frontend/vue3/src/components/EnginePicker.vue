<script setup>
import { useAppStore } from '../stores/app'

const app = useAppStore()
const engines = [
  { id: 'auto', name: '自动', hint: '本地优先' },
  { id: 'deepseek', name: '深度', hint: 'DeepSeek' },
  { id: 'local', name: '本地', hint: '微调模型' },
]
</script>

<template>
  <div class="block">
    <div class="block-label">分析引擎</div>
    <div class="engines" role="radiogroup" aria-label="分析引擎">
      <button
        v-for="e in engines"
        :key="e.id"
        class="engine"
        role="radio"
        :aria-checked="app.engine === e.id ? 'true' : 'false'"
        @click="app.setEngine(e.id)"
      >
        <span class="engine-name">{{ e.name }}</span>
        <span class="engine-hint">{{ e.hint }}</span>
      </button>
    </div>
  </div>
</template>
