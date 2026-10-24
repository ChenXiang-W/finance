<script setup>
import { onMounted } from 'vue'
import AppRail from './components/AppRail.vue'
import Particles from './components/Particles.vue'
import Toast from './components/Toast.vue'
import { useAppStore } from './stores/app'

const app = useAppStore()
onMounted(() => app.init())
</script>

<template>
  <Particles />
  <div class="fx-vignette" aria-hidden="true"></div>
  <div class="fx-scan" aria-hidden="true"></div>

  <div class="app">
    <AppRail />
    <main class="canvas">
      <router-view />
    </main>
  </div>

  <Toast />
</template>
