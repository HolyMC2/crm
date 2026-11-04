<template>
  <!-- The locked box (docs/TABLEROS.md §4): scripts run, but in an opaque
       origin with no network, no cookies, no forms and no way to the page
       except the two messages the page reads. -->
  <iframe
    ref="frame"
    class="block w-full border-0 bg-transparent"
    :class="fill ? 'h-full' : ''"
    :style="fill ? undefined : { height: `${height}px` }"
    sandbox="allow-scripts"
    referrerpolicy="no-referrer"
    :title="title || 'Widget a la medida'"
    :srcdoc="doc"
    data-testid="widget-box"
    @load="send"
  />
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { boxDocument, safeOpenPath } from '@/tableros/board'

const props = defineProps({
  codigo: { type: Object, required: true },
  /** { alias: payload }: what muelle.onData hands the widget. */
  data: { type: Object, default: () => ({}) },
  title: { type: String, default: '' },
  /** Take the parent's height (the board's grid) instead of the content's. */
  fill: { type: Boolean, default: false },
})
const emit = defineEmits(['error'])

const router = useRouter()
const frame = ref(null)
const height = ref(160)
const doc = computed(() => boxDocument(props.codigo))

function theme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

function send() {
  // structuredClone drops Vue's proxies; the box gets plain data only.
  const data = JSON.parse(JSON.stringify(props.data || {}))
  frame.value?.contentWindow?.postMessage(
    { type: 'muelle:data', data, theme: theme() },
    '*',
  )
}

function onMessage(event) {
  if (!frame.value || event.source !== frame.value.contentWindow) return
  const { type, value } = event.data || {}
  if (type === 'muelle:height') {
    const n = Number(value)
    if (Number.isFinite(n)) height.value = Math.max(40, Math.min(n, 2400))
  } else if (type === 'muelle:open') {
    const path = safeOpenPath(value)
    if (!path) return
    if (path.startsWith('/crm/')) router.push(path.slice(4))
    else window.open(path, '_blank', 'noopener')
  } else if (type === 'muelle:error') {
    emit('error', String(value || '').slice(0, 200))
  }
}

watch(() => props.data, send, { deep: true })
onMounted(() => window.addEventListener('message', onMessage))
onBeforeUnmount(() => window.removeEventListener('message', onMessage))
</script>
