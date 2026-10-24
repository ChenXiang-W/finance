<script setup>
// 左侧图标栏：与旧版同一套结构 / 类名（CSS 直接复用 cyber-skin.css）
const navItems = [
  { to: '/map', label: '全国态势', icon: 'globe' },
  { to: '/detect', label: '检测', icon: 'chat' },
  { to: '/history', label: '历史记录', icon: 'list' },
  { to: '/stats', label: '统计', icon: 'chart' },
]
const BASE = import.meta.env.BASE_URL
const bottomItems = [
  { to: '/settings', label: '设置', icon: 'gear' },
  { to: '/admin', label: '管理后台', icon: 'grid' },
]
</script>

<template>
  <aside class="rail">
    <router-link class="rail-brand" to="/map" title="全国态势" aria-label="全国态势">
      <img :src="BASE + 'jpg/Logo.jpg'" alt="金盾智眼">
    </router-link>

    <nav class="rail-nav" aria-label="主导航">
      <router-link
        v-for="item in navItems"
        :key="item.to"
        class="rail-btn"
        :to="item.to"
        :aria-label="item.label"
        :title="item.label"
      >
        <svg v-if="item.icon === 'globe'" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 4 5.7 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.7-4-9s1.5-6.5 4-9z" />
        </svg>
        <svg v-else-if="item.icon === 'chat'" viewBox="0 0 24 24">
          <path d="M4 5h16v11H8l-4 4V5z" /><path d="M8 9h8M8 12h5" />
        </svg>
        <svg v-else-if="item.icon === 'list'" viewBox="0 0 24 24">
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
        <svg v-else viewBox="0 0 24 24">
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </svg>
        <span class="rail-tip">{{ item.label }}</span>
      </router-link>
    </nav>

    <div class="rail-bottom">
      <router-link
        v-for="item in bottomItems"
        :key="item.to"
        class="rail-btn"
        :to="item.to"
        :aria-label="item.label"
        :title="item.label"
      >
        <svg v-if="item.icon === 'gear'" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
        </svg>
        <svg v-else viewBox="0 0 24 24">
          <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
        </svg>
        <span class="rail-tip">{{ item.label }}</span>
      </router-link>
    </div>
  </aside>
</template>
