<script setup>
import { onMounted, onBeforeUnmount, watch } from 'vue'
import { useAppStore } from '../stores/app'

// 粒子网络：与旧版一致（青/品红点 + 连线，每两帧算一次连线）
const app = useAppStore()
let canvas = null
let ctx = null
let raf = null
let pts = []
let w = 0
let h = 0
let frame = 0
const COLORS = ['rgba(0,243,255,', 'rgba(188,19,254,']
const LINKS = 130

function resize() {
  if (!canvas) return
  w = canvas.width = window.innerWidth
  h = canvas.height = window.innerHeight
}

function seed() {
  pts = []
  const count = window.innerWidth < 900 ? 20 : 34
  for (let i = 0; i < count; i++) {
    pts.push({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.3 + 0.4,
      vx: (Math.random() - 0.5) * 0.16,
      vy: (Math.random() - 0.5) * 0.16,
      o: Math.random() * 0.35 + 0.08,
      c: COLORS[Math.floor(Math.random() * COLORS.length)],
    })
  }
}

function allowed() {
  if (app.motionOff) return false
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function draw() {
  raf = requestAnimationFrame(draw)
  if (!ctx) return
  ctx.clearRect(0, 0, w, h)
  if (!allowed()) return
  frame++

  for (const p of pts) {
    p.x += p.vx
    p.y += p.vy
    if (p.x < 0) p.x = w
    if (p.x > w) p.x = 0
    if (p.y < 0) p.y = h
    if (p.y > h) p.y = 0
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
    ctx.fillStyle = p.c + p.o + ')'
    ctx.fill()
  }

  if (frame % 2 === 0) {
    for (let a = 0; a < pts.length; a++) {
      for (let b = a + 1; b < pts.length; b++) {
        const dx = pts[a].x - pts[b].x
        const dy = pts[a].y - pts[b].y
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < LINKS) {
          ctx.beginPath()
          ctx.moveTo(pts[a].x, pts[a].y)
          ctx.lineTo(pts[b].x, pts[b].y)
          ctx.strokeStyle = `rgba(0,243,255,${(0.05 * (1 - d / LINKS)).toFixed(3)})`
          ctx.lineWidth = 0.5
          ctx.stroke()
        }
      }
    }
  }
}

function onResize() {
  resize()
  seed()
}

onMounted(() => {
  canvas = document.getElementById('fxParticles')
  if (!canvas) return
  ctx = canvas.getContext('2d')
  resize()
  seed()
  window.addEventListener('resize', onResize)
  draw()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', onResize)
})

watch(() => app.motionOff, () => {
  if (app.motionOff && ctx) ctx.clearRect(0, 0, w, h)
})
</script>

<template>
  <canvas id="fxParticles" aria-hidden="true"></canvas>
</template>
