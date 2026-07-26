<!--
  In-thread search (spec 2.7). A floating bar over the conversation that finds
  matches WITHIN the loaded messages by walking the rendered bubbles — no
  upstream data-flow changes, works on whatever pages are in the DOM. Navigation
  scrolls match-to-match with a temporary ring highlight; nothing in the thread
  DOM is mutated (Vue re-renders stay safe). Matching is case- and diacritic-
  insensitive (utils/threadSearch). Long threads beyond the loaded pages are out
  of scope for v1 — the bar says «en lo cargado» so the operator knows.
-->
<template>
  <div
    v-if="open"
    class="absolute left-1/2 top-2 z-20 flex w-[min(92%,380px)] -translate-x-1/2 items-center gap-1.5 rounded-xl border border-outline-gray-2 bg-surface-white px-2.5 py-1.5 shadow-lg"
  >
    <span aria-hidden="true" class="flex-none text-[13px]">🔎</span>
    <input
      ref="inputEl"
      v-model="query"
      class="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-ink-gray-9 placeholder:text-ink-gray-4 focus:outline-none focus:ring-0"
      :placeholder="__('Buscar en la conversación…')"
      @keydown.enter.prevent="go(1)"
      @keydown.esc.prevent="close"
    />
    <span class="flex-none text-[11px] tabular-nums text-ink-gray-5">
      {{ matches.length ? `${current + 1}/${matches.length}` : query.trim().length >= 2 ? '0' : '' }}
    </span>
    <button
      class="press flex-none px-1 text-[13px] text-ink-gray-6 disabled:opacity-40"
      :disabled="!matches.length"
      :aria-label="__('Anterior')"
      @click="go(-1)"
    >
      ↑
    </button>
    <button
      class="press flex-none px-1 text-[13px] text-ink-gray-6 disabled:opacity-40"
      :disabled="!matches.length"
      :aria-label="__('Siguiente')"
      @click="go(1)"
    >
      ↓
    </button>
    <button class="press flex-none px-1 text-[15px] text-ink-gray-5" :aria-label="__('Cerrar búsqueda')" @click="close">
      ×
    </button>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { matchesQuery, stepMatch } from '@/utils/threadSearch'

const props = defineProps({
  // the scrollable conversation container to search within (.doco-convo element)
  container: { type: Object, default: null },
})

const open = ref(false)
const query = ref('')
const matches = ref([])
const current = ref(-1)
const inputEl = ref(null)

let _debounce = null
let _lastHighlight = null

function toggle() {
  open.value = !open.value
  if (open.value) nextTick(() => inputEl.value?.focus())
  else close()
}
defineExpose({ toggle })

function close() {
  open.value = false
  query.value = ''
  matches.value = []
  current.value = -1
  _clearHighlight()
}

function _clearHighlight() {
  if (_lastHighlight) {
    _lastHighlight.style.boxShadow = ''
    _lastHighlight = null
  }
}

// The message bubbles = the direct per-message wrappers inside the scroller.
// We match on textContent per bubble — no DOM mutation, re-render-safe.
function _bubbles() {
  const root = props.container?.$el || props.container
  if (!root?.querySelectorAll) return []
  // upstream renders one wrapper per message name; fall back to generic blocks
  return Array.from(root.querySelectorAll('[class*="max-w-"]')).filter(
    (el) => el.textContent && el.closest('.doco-convo'),
  )
}

function runSearch() {
  _clearHighlight()
  current.value = -1
  const q = query.value
  if (q.trim().length < 2) {
    matches.value = []
    return
  }
  matches.value = _bubbles().filter((el) => matchesQuery(el.textContent, q))
  if (matches.value.length) go(1)
}

function go(dir) {
  const next = stepMatch(current.value, matches.value.length, dir)
  if (next < 0) return
  current.value = next
  const el = matches.value[next]
  _clearHighlight()
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.style.boxShadow = 'inset 0 0 0 2px var(--brand)'
  _lastHighlight = el
}

watch(query, () => {
  clearTimeout(_debounce)
  _debounce = setTimeout(runSearch, 250)
})

onBeforeUnmount(() => {
  clearTimeout(_debounce)
  _clearHighlight()
})
</script>
