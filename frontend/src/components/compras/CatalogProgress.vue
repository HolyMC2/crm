<template>
  <!-- A supplier list being indexed and read: its line, a bar while a stage
       moves on its own, and what the owner can do meanwhile. Given `progress`
       it shows it (Compras › Surtido polls its lists); given only `catalog` it
       polls the list itself (the chat card) until the stage settles. -->
  <div
    v-if="shown"
    role="status"
    :class="[
      'min-w-0',
      card ? 'rounded-7 border border-outline-gray-2 p-3' : '',
    ]"
    :data-stage="shown.stage"
    data-testid="catalog-progress"
  >
    <div v-if="card && title" class="mb-1.5 flex items-center gap-2">
      <span
        class="lucide-file-spreadsheet size-4 flex-none text-ink-gray-6"
        aria-hidden="true"
      />
      <p class="min-w-0 flex-1 truncate text-sm font-medium text-ink-gray-9">
        {{ title }}
      </p>
      <RouterLink
        v-if="catalogName"
        :to="{ name: 'CompraLista', params: { name: catalogName } }"
        class="press -my-2 inline-flex min-h-11 flex-none items-center rounded-6 px-2 text-sm font-medium text-ink-gray-7 hover:bg-surface-gray-2 hover:text-ink-gray-9 sm:min-h-8"
        @click="$emit('navigate')"
      >
        {{ __('Open the list', null, 'Surtido') }}
      </RouterLink>
    </div>
    <div class="flex items-start gap-2">
      <span
        :class="[
          ICON[shown.busy ? 'busy' : shown.tone],
          'mt-0.5 size-4 flex-none',
        ]"
        aria-hidden="true"
      />
      <p
        :class="[
          'min-w-0 flex-1 text-sm',
          shown.tone === 'danger' ? 'text-ink-red-7' : 'text-ink-gray-8',
        ]"
      >
        {{ shown.line }}
      </p>
      <span
        v-if="shown.pct !== null"
        class="num flex-none text-sm tabular-nums text-ink-gray-6"
      >
        {{ shown.pct }}%
      </span>
    </div>
    <div
      v-if="shown.pct !== null"
      class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-gray-2"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="shown.pct"
      :aria-label="shown.line"
    >
      <div
        class="h-full rounded-full bg-surface-gray-7 transition-[width] duration-500 motion-reduce:transition-none"
        :style="{ width: Math.max(shown.pct, 3) + '%' }"
      />
    </div>
    <p v-if="shown.note && !compact" class="mt-1 text-xs text-ink-gray-6">
      {{ shown.note }}
    </p>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import { progressView } from '@/utils/catalogProgress'

const props = defineProps({
  // the progress the caller already has (doco books.catalogs.progress)
  progress: { type: Object, default: null },
  // a list to poll instead
  catalog: { type: String, default: '' },
  // a row of a table: no note
  compact: { type: Boolean, default: false },
  // a chat card: framed, with the list's title and the way to it
  card: { type: Boolean, default: false },
})
defineEmits(['navigate'])

const ICON = {
  busy: 'lucide-loader-circle animate-spin text-ink-gray-6',
  neutral: 'lucide-loader-circle text-ink-gray-6',
  warning: 'lucide-circle-alert text-ink-amber-9',
  danger: 'lucide-circle-alert text-ink-red-7',
  success: 'lucide-circle-check text-ink-green-7',
}
const POLL_MS = 3000

const polled = ref(null)
const current = computed(() => props.progress || polled.value)
const shown = computed(() => progressView(current.value))
const title = computed(() => current.value?.title || '')
const catalogName = computed(
  () => current.value?.catalog || props.catalog || '',
)

let timer = null
let stopped = false
async function tick() {
  timer = null
  if (stopped || props.progress || !props.catalog) return
  try {
    polled.value = await call('doco.workspaces.sourcing.progress', {
      catalog: props.catalog,
    })
  } catch {
    // a missed tick is retried; a list the person cannot read stays blank
    if (!polled.value) return
  }
  if (!stopped && shown.value?.busy) timer = setTimeout(tick, POLL_MS)
}
watch(
  () => props.catalog,
  () => {
    clearTimeout(timer)
    polled.value = null
    tick()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  stopped = true
  clearTimeout(timer)
})
</script>
