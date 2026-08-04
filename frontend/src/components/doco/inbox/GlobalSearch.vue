<!--
  Global message search (spec 2.6 + 2.7). Full-screen on mobile / centered modal on
  desktop. Debounced (300ms) LIKE search over WhatsApp + Messenger message bodies,
  perm-scoped server-side. A row tap emits open(reference_doctype, reference_name) —
  the parent (inbox) wires it to selectDeal. Self-contained state: this component owns
  no shared composable (inbox.js is lead-owned).

  The match term is highlighted by TEXT-SPLITTING (highlightSegments → <b>), never
  v-html — customer message text is rendered as text, never parsed as markup.
-->
<template>
  <div
    class="fixed inset-0 z-40 flex items-stretch justify-center sm:items-start sm:pt-[8vh]"
    role="dialog"
    aria-modal="true"
    :aria-label="__('Buscar mensajes')"
    @keydown.esc="close"
    @click.self="close"
  >
    <div class="absolute inset-0 bg-black/30" @click="close" />
    <div
      class="relative flex h-full w-full flex-col overflow-hidden bg-surface-base dark:bg-surface-gray-1 sm:h-auto sm:max-h-[80vh] sm:w-[560px] sm:rounded-2xl sm:shadow-xl"
    >
      <!-- header + search -->
      <div class="flex-none border-b border-outline-gray-1 px-4 pb-3 pt-3.5">
        <div class="mb-2.5 flex items-center justify-between">
          <div class="text-[14px] font-bold text-ink-gray-9">🔍 {{ __('Buscar mensajes') }}</div>
          <button
            class="press flex h-7 w-7 items-center justify-center rounded-full text-ink-gray-5 hover:bg-surface-gray-3 hover:text-ink-gray-9"
            :aria-label="__('Cerrar')"
            @click="close"
          >
            <LucideX class="h-4 w-4" />
          </button>
        </div>
        <div class="flex items-center gap-2 rounded-[9px] border border-outline-gray-2 px-2.5 py-[7px] focus-within:border-outline-gray-4 focus-within:ring-1 focus-within:ring-outline-gray-3">
          <LucideSearch class="h-3.5 w-3.5 flex-none text-ink-gray-4" />
          <input
            ref="searchRef"
            :value="query"
            :aria-label="__('Buscar en las conversaciones')"
            @input="onInput($event.target.value)"
            @keydown.esc="close"
            :placeholder="__('Buscar en las conversaciones…')"
            class="w-full border-0 bg-transparent text-[13px] text-ink-gray-8 placeholder:text-ink-gray-4 focus:outline-none focus:ring-0"
          />
          <button
            v-if="query"
            class="flex h-4 w-4 flex-none items-center justify-center rounded-full text-ink-gray-4 hover:bg-surface-gray-3 hover:text-ink-gray-7"
            :aria-label="__('Limpiar')"
            @click="clear"
          >
            <LucideX class="h-3 w-3" />
          </button>
        </div>
      </div>

      <!-- results -->
      <div class="scb flex-1 overflow-y-auto">
        <div v-if="tooShort" class="px-4 py-10 text-center text-[12px] text-ink-gray-4">
          {{ __('Escribe al menos 2 letras para buscar.') }}
        </div>
        <div v-else-if="loading" class="px-4 py-10 text-center text-[12px] text-ink-gray-4">
          {{ __('Buscando…') }}
        </div>
        <div v-else-if="error" class="px-4 py-10 text-center text-[12px] text-ink-red-6">
          {{ __('No se pudo buscar.') }}
          <button class="ml-1 font-semibold underline" @click="runNow">{{ __('Reintentar') }}</button>
        </div>
        <div v-else-if="!results.length" class="px-4 py-10 text-center text-[12px] text-ink-gray-4">
          {{ __('Sin resultados para «{0}».', [query]) }}
        </div>
        <ul v-else class="py-1.5">
          <li v-for="(r, i) in results" :key="i">
            <button
              class="press flex w-full items-start gap-2.5 px-3.5 py-2 text-left hover:bg-surface-gray-2"
              @click="pick(r)"
            >
              <span
                class="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full text-[11px] font-bold"
                :style="avatarStyle(r.contact_name)"
              >
                {{ initials(r.contact_name) }}
              </span>
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="flex items-center justify-between gap-2">
                  <span class="truncate text-[12.5px] font-semibold text-ink-gray-8">
                    {{ r.contact_name || __('Sin nombre') }}
                  </span>
                  <span class="flex flex-none items-center gap-1.5 text-[10.5px] text-ink-gray-4">
                    <span
                      class="h-1.5 w-1.5 rounded-full"
                      :style="`background:${channelDot(r.channel)}`"
                      :title="channelLabel(r.channel)"
                    />
                    {{ timeAgo(r.ts) }}
                  </span>
                </span>
                <span class="mt-0.5 line-clamp-2 text-[12px] leading-snug text-ink-gray-6">
                  <template v-for="(seg, j) in segmentsFor(r.snippet)" :key="j">
                    <b v-if="seg.match" class="font-semibold text-ink-gray-9">{{ seg.text }}</b>
                    <template v-else>{{ seg.text }}</template>
                  </template>
                </span>
              </span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { call } from 'frappe-ui'
import LucideSearch from '~icons/lucide/search'
import LucideX from '~icons/lucide/x'
import { avatarColor, initials, timeAgo, CHANNEL_META } from '@/composables/crmFormat'
import { highlightSegments, debounce } from '@/utils/searchHighlight'

const MIN_LEN = 2

const emit = defineEmits(['open', 'close'])

const query = ref('')
const results = ref([])
const loading = ref(false)
const error = ref(false)
const searchRef = ref(null)

// idle-vs-empty: before the first 2-char query we show the hint, not "sin resultados"
const tooShort = computed(() => query.value.trim().length < MIN_LEN)

// out-of-order guard: a slow earlier response must never overwrite a newer one
let seq = 0

async function doSearch() {
  const q = query.value.trim()
  if (q.length < MIN_LEN) {
    results.value = []
    loading.value = false
    error.value = false
    return
  }
  const mine = ++seq
  loading.value = true
  error.value = false
  try {
    const rows = await call('doco_marketing.api.search.search_messages', { query: q, limit: 30 })
    if (mine !== seq) return // a newer search superseded this one
    results.value = Array.isArray(rows) ? rows : []
  } catch (e) {
    if (mine !== seq) return
    error.value = true
    results.value = []
  } finally {
    if (mine === seq) loading.value = false
  }
}

const runSearch = debounce(doSearch, 300)

function onInput(v) {
  query.value = v
  if (v.trim().length < MIN_LEN) {
    runSearch.cancel()
    results.value = []
    loading.value = false
    error.value = false
    return
  }
  runSearch()
}

function runNow() {
  runSearch.cancel()
  doSearch()
}

function clear() {
  runSearch.cancel()
  query.value = ''
  results.value = []
  error.value = false
  loading.value = false
  nextTick(() => searchRef.value?.focus())
}

function pick(r) {
  emit('open', r.reference_doctype, r.reference_name)
}

function close() {
  runSearch.cancel()
  emit('close')
}

function segmentsFor(snippet) {
  return highlightSegments(snippet, query.value)
}
function avatarStyle(name) {
  const [bg, text] = avatarColor(name)
  return `background:${bg};color:${text}`
}
function channelDot(ch) {
  return (CHANNEL_META[ch] || [null, '#94a3b8'])[1]
}
function channelLabel(ch) {
  return (CHANNEL_META[ch] || [ch || ''])[0]
}

onMounted(() => nextTick(() => searchRef.value?.focus()))
onBeforeUnmount(() => runSearch.cancel())
</script>
