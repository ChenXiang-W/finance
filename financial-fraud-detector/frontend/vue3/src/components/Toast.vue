<script setup>
import { computed } from 'vue'
import { useAppStore } from '../stores/app'

const app = useAppStore()
const cls = computed(() => ['show', app.toast.type].filter(Boolean).join(' '))
</script>

<template>
  <Transition name="fade">
    <div v-if="app.toast.show" id="toast" :class="cls" role="status" aria-live="polite">
      {{ app.toast.msg }}
    </div>
  </Transition>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.24s ease, transform 0.24s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
