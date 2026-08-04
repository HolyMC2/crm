<!--
  Resumen AI del hilo (spec 5.2). A collapsed "🧠 Resumen" chip that expands to a
  card with a 3-4 sentence brief of the active conversation (situación / qué espera
  el cliente / siguiente paso). On-demand — fetched only when opened, like the
  suggested-replies chip. Refresh forces a fresh generation (force=1). The whole
  component hides when AI is off site-wide (aiEnabled) or the backend reports
  {available: false}. Reads the active deal from the inbox composable.

  Assistive only: the summary is rendered as plain text (no v-html).
-->
<template>
  <div v-if="!hidden" class="flex-none border-b border-outline-gray-1 px-3 py-1.5">
    <!-- collapsed chip -->
    <button
      v-if="!expanded"
      type="button"
      class="press inline-flex items-center gap-1.5 rounded-full border border-outline-gray-2 bg-surface-gray-1 px-2.5 py-1 text-[12px] font-medium text-ink-gray-7 hover:bg-surface-gray-2"
      @click="toggle"
    >
      <span>🧠</span>{{ __('Resumen') }}
    </button>

    <!-- expanded card -->
    <div v-else class="rounded-xl border border-outline-gray-2 bg-surface-gray-1 p-3">
      <div class="mb-1.5 flex items-center justify-between gap-2">
        <div class="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-gray-8">
          <span>🧠</span>{{ __('Resumen del hilo') }}
        </div>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="press flex size-6 items-center justify-center rounded-md text-ink-gray-5 hover:bg-surface-gray-2 hover:text-ink-gray-8 disabled:opacity-40"
            :disabled="loading"
            :title="__('Actualizar')"
            :aria-label="__('Actualizar')"
            @click="refresh"
          >
            <LucideRefreshCw class="size-3.5" :class="loading && 'animate-spin'" />
          </button>
          <button
            type="button"
            class="press flex size-6 items-center justify-center rounded-md text-ink-gray-5 hover:bg-surface-gray-2 hover:text-ink-gray-8"
            :title="__('Ocultar')"
            :aria-label="__('Ocultar')"
            @click="toggle"
          >
            <LucideChevronUp class="size-4" />
          </button>
        </div>
      </div>

      <div v-if="loading" class="text-[12.5px] text-ink-gray-4">{{ __('Generando resumen…') }}</div>
      <template v-else-if="hasSummary">
        <p class="whitespace-pre-line text-[12.5px] leading-relaxed text-ink-gray-7">{{ summary }}</p>
        <div class="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-ink-gray-4">
          <span>{{ __('actualizado') }} {{ staleLabel }}</span>
          <span v-if="data && data.cached">· {{ __('en caché') }}</span>
        </div>
      </template>
      <div v-else-if="isEmpty" class="text-[12.5px] text-ink-gray-4">
        {{ __('Aún no hay mensajes para resumir') }}
      </div>
      <button
        v-else
        type="button"
        class="press text-[12px] font-medium text-ink-blue-7 hover:underline"
        @click="refresh"
      >
        {{ __('No se pudo generar — reintentar') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { call, toast } from 'frappe-ui'
import LucideRefreshCw from '~icons/lucide/refresh-cw'
import LucideChevronUp from '~icons/lucide/chevron-up'
import { activeDeal, activeDealDoctype, aiEnabled } from '@/composables/inbox'
import { stalenessBucket } from '@/utils/summaryStaleness'

const expanded = ref(false)
const loading = ref(false)
const data = ref(null)
const nowTick = ref(Date.now())

// Hidden when AI is disabled for the site, or the backend says this thread has no
// AI (available:false). aiEnabled short-circuits so we never call the endpoint on
// an AI-off tenant.
const hidden = computed(() => !aiEnabled.value || (data.value && data.value.available === false))
const summary = computed(() => data.value?.summary || '')
const hasSummary = computed(() => !loading.value && !!data.value?.summary)
const isEmpty = computed(() => {
  const d = data.value
  if (!d || loading.value) return false
  return d.available !== false && !d.summary && !d.error && (d.message_count || 0) === 0
})

const staleLabel = computed(() => {
  const b = stalenessBucket(data.value?.generated_at, nowTick.value)
  if (!b) return ''
  if (b.unit === 'moment') return __('hace un momento')
  if (b.unit === 'min') return __('hace {0} min', [b.value])
  if (b.unit === 'hour') return __('hace {0} h', [b.value])
  return __('hace {0} d', [b.value])
})

async function load(force = false) {
  if (loading.value || !activeDeal.value) return
  loading.value = true
  try {
    const out = await call('doco_marketing.api.summary.thread_summary', {
      doctype: activeDealDoctype.value,
      name: activeDeal.value,
      force: force ? 1 : 0,
    })
    data.value = out || { available: true, summary: null, error: true }
  } catch (e) {
    data.value = { available: true, summary: null, error: true }
    toast.error(__('No se pudo generar el resumen'))
  } finally {
    loading.value = false
  }
}

function toggle() {
  expanded.value = !expanded.value
  if (expanded.value && !data.value) load(false)
}
function refresh() {
  load(true)
}

// Switching conversation resets the chip: collapse + drop the previous deal's summary.
watch([activeDeal, activeDealDoctype], () => {
  expanded.value = false
  data.value = null
})

// Keep "actualizado hace X" fresh while the card is open (cheap 60s tick).
let timer = null
watch(expanded, (open) => {
  clearInterval(timer)
  timer = null
  if (open) {
    nowTick.value = Date.now()
    timer = setInterval(() => (nowTick.value = Date.now()), 60000)
  }
})
onBeforeUnmount(() => clearInterval(timer))
</script>
