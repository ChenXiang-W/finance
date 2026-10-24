<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useDetectStore } from '../stores/detect'
import { EXAMPLES } from '../utils/examples'

const props = defineProps({ text: { type: String, default: '' } })
const emit = defineEmits(['update:text', 'submit', 'new'])

const detect = useDetectStore()
const ta = ref(null)

const mode = computed(() => detect.mode)
const placeholder = computed(() => {
  if (mode.value === 'url') return '粘贴要抓取正文的 URL…'
  if (mode.value === 'batch') return '批量模式：每行一条文本（最多 20 条）…'
  if (mode.value === 'agent') return '追问智能体，例如「这类诈骗的资金怎么流转」…'
  return '粘贴短信、聊天记录、邮件或广告文案…'
})
const modeLabel = computed(
  () => ({ url: 'URL 抓取', batch: '批量', agent: '追问', detect: '检测' })[mode.value],
)
const note = computed(() => {
  if (mode.value === 'url') return '抓取网页正文后自动检测。'
  if (mode.value === 'batch') return '每行一条，串行检测，结果汇总为一张表。'
  return ''
})

function autosize() {
  nextTick(() => {
    const el = ta.value
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 180) + 'px'
  })
}

watch(() => props.text, autosize, { immediate: true })

function onInput(e) {
  emit('update:text', e.target.value)
  autosize()
}

function submit() {
  emit('submit', props.text)
  if (mode.value === 'agent') emit('update:text', '')
}

function fillExample() {
  const keys = Object.keys(EXAMPLES)
  const text = EXAMPLES[keys[Math.floor(Math.random() * keys.length)]]
  emit('update:text', text)
  ta.value?.focus()
}

function onKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    submit()
  }
}

defineExpose({ focus: () => ta.value?.focus() })
</script>

<template>
  <footer class="composer">
    <textarea
      ref="ta"
      class="composer-input"
      :value="text"
      rows="1"
      maxlength="10000"
      :placeholder="placeholder"
      @input="onInput"
      @keydown="onKeydown"
    ></textarea>

    <div class="composer-foot">
      <div class="composer-chips">
        <button class="chip" type="button" @click="fillExample">示例</button>
        <button
          class="chip"
          type="button"
          :aria-pressed="detect.batchMode ? 'true' : 'false'"
          @click="detect.toggleBatch()"
        >批量</button>
        <button
          class="chip"
          type="button"
          :aria-pressed="detect.urlMode ? 'true' : 'false'"
          @click="detect.toggleUrl()"
        >URL</button>
        <button v-if="detect.report" class="chip" type="button" @click="emit('new')">新检测</button>
        <span class="composer-count mono">{{ text.length }} / 10000</span>
      </div>
      <div class="composer-actions">
        <span class="composer-mode">{{ modeLabel }}</span>
        <button class="send" type="button" :disabled="detect.busy" title="发送（Ctrl+Enter）" @click="submit">
          <svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
        </button>
      </div>
    </div>

    <p v-if="note" class="composer-note hint">{{ note }}</p>
    <p v-else-if="detect.busy" class="composer-note hint">分析中…</p>
  </footer>
</template>
