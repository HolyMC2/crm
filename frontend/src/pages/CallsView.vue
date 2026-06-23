<!--
  Calls log — FCRM redesign (handoff §5.9). Stats + tabs (All/Out/In/Missed) + table,
  row → call detail drawer. New page; upstream CallLogs.vue kept at /call-logs/view/.
-->
<template>
  <div class="flex min-h-0 w-full flex-1 flex-col bg-surface-white">
    <!-- stats -->
    <div class="flex flex-none gap-6 border-b border-outline-gray-1 px-5 py-3">
      <Stat :label="__('Llamadas')" :value="rows.length" />
      <Stat :label="__('Conectadas')" :value="connected" color="#16a34a" />
      <Stat :label="__('Perdidas')" :value="missed" color="#e5484d" />
      <Stat :label="__('Duración prom.')" :value="avgDuration" />
    </div>

    <!-- toolbar -->
    <div class="flex h-[48px] flex-none items-center justify-between border-b border-outline-gray-1 px-5">
      <div class="flex items-center gap-1.5">
        <button
          v-for="t in tabs"
          :key="t.key"
          class="rounded-full px-3 py-1 text-[11.5px] font-semibold"
          :class="tab === t.key ? 'bg-surface-gray-3 text-ink-gray-9' : 'bg-surface-gray-2 text-ink-gray-6'"
          @click="tab = t.key"
        >
          {{ t.label }}
        </button>
      </div>
      <button
        class="rounded-lg px-3.5 py-[7px] text-[12.5px] font-semibold text-white"
        style="background: #16a34a"
        @click="logCall"
      >
        + {{ __('Registrar llamada') }}
      </button>
    </div>

    <!-- header -->
    <div
      class="grid flex-none items-center border-b border-outline-gray-1 bg-surface-gray-1 px-5 text-[10.5px] font-semibold uppercase tracking-[.07em] text-ink-gray-4"
      :style="`grid-template-columns:${GRID};height:34px`"
    >
      <div>{{ __('Dir.') }}</div>
      <div>{{ __('Contacto') }}</div>
      <div>{{ __('Hora') }}</div>
      <div>{{ __('Duración') }}</div>
      <div>{{ __('Resultado') }}</div>
      <div />
    </div>

    <!-- rows -->
    <div class="scb min-h-0 flex-1 overflow-y-auto">
      <div v-if="calls.loading && !rows.length" class="py-10 text-center text-xs text-ink-gray-4">{{ __('Cargando…') }}</div>
      <div v-else-if="!rows.length" class="py-10 text-center text-xs text-ink-gray-4">{{ __('Sin llamadas') }}</div>

      <div
        v-for="r in rows"
        :key="r.name"
        class="grid cursor-pointer items-center border-b border-outline-gray-1 px-5 hover:bg-surface-gray-2"
        :style="`grid-template-columns:${GRID};min-height:50px`"
        @click="openCall(r.name)"
      >
        <div>
          <span class="inline-flex items-center gap-1 rounded-md px-1.5 py-[2px] text-[10.5px] font-semibold" :class="dirChip(r)">
            {{ r.type === 'Outgoing' ? '↑ Out' : '↓ In' }}
          </span>
        </div>
        <div class="min-w-0">
          <div class="truncate text-[13px] font-semibold text-ink-gray-9">{{ phoneOf(r) }}</div>
          <div v-if="r.reference_docname" class="truncate text-[11px] text-ink-gray-4">{{ r.reference_docname }}</div>
        </div>
        <div class="text-[12px] text-ink-gray-5">{{ timeAgo(r.start_time) }}</div>
        <div class="text-[12px] font-medium text-ink-gray-7">{{ fmtDur(r.duration) }}</div>
        <div>
          <span class="rounded-md px-2 py-[3px] text-[11px] font-semibold" :class="outcomeChip(r.status)">{{ r.status || '—' }}</span>
        </div>
        <button class="text-[14px] text-ink-gray-4" @click.stop="openCall(r.name)">›</button>
      </div>
    </div>

    <CallDetailDrawer v-if="selectedCall" :name="selectedCall" @close="selectedCall = null" @changed="calls.reload()" />
  </div>
</template>

<script setup>
import { computed, h, ref, watch } from 'vue'
import { createListResource } from 'frappe-ui'
import { timeAgo } from '@/composables/crmFormat'
import { useDoctypeModal } from '@/composables/doctypeModal'
import CallDetailDrawer from '@/components/doco/calls/CallDetailDrawer.vue'

const GRID = '70px 1fr 90px 90px 120px 26px'
const MISSED = ['No Answer', 'Missed', 'Busy', 'Failed', 'Canceled']

const { showModal } = useDoctypeModal()
function logCall() {
  showModal({ doctype: 'CRM Call Log', title: __('Call Log'), callbacks: { afterInsert: () => calls.reload() } })
}

const tab = ref('all')
const tabs = [
  { key: 'all', label: __('Todas') },
  { key: 'out', label: __('Salientes') },
  { key: 'in', label: __('Entrantes') },
  { key: 'missed', label: __('Perdidas') },
]
const selectedCall = ref(null)

const calls = createListResource({
  doctype: 'CRM Call Log',
  fields: ['name', 'type', 'status', 'from', 'to', 'duration', 'start_time', 'reference_doctype', 'reference_docname'],
  orderBy: 'start_time desc',
  pageLength: 100,
})
const rows = computed(() => calls.data || [])

function applyFilters() {
  const f = {}
  if (tab.value === 'out') f.type = 'Outgoing'
  else if (tab.value === 'in') f.type = 'Incoming'
  else if (tab.value === 'missed') f.status = ['in', MISSED]
  calls.filters = f
  calls.reload()
}
watch(tab, applyFilters, { immediate: true })

// stats (from loaded page)
const connected = computed(() => rows.value.filter((r) => r.status === 'Completed').length)
const missed = computed(() => rows.value.filter((r) => MISSED.includes(r.status)).length)
const avgDuration = computed(() => {
  const d = rows.value.map((r) => Number(r.duration) || 0).filter((x) => x > 0)
  if (!d.length) return '—'
  return fmtDur(Math.round(d.reduce((a, b) => a + b, 0) / d.length))
})

function phoneOf(r) {
  return (r.type === 'Outgoing' ? r.to : r.from) || r.from || r.to || '—'
}
function fmtDur(s) {
  s = Number(s) || 0
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}
function dirChip(r) {
  if (MISSED.includes(r.status)) return 'text-ink-red-4 bg-surface-red-1'
  return r.type === 'Outgoing' ? 'text-ink-green-3 bg-surface-green-2' : 'text-ink-blue-2 bg-surface-blue-1'
}
function outcomeChip(status) {
  if (status === 'Completed') return 'text-ink-green-3 bg-surface-green-2'
  if (MISSED.includes(status)) return 'text-ink-red-4 bg-surface-red-1'
  return 'text-ink-gray-6 bg-surface-gray-2'
}
function openCall(name) {
  selectedCall.value = name
}

const Stat = (props) =>
  h('div', {}, [
    h('div', { class: 'text-[10px] font-semibold uppercase tracking-[.07em] text-ink-gray-4' }, props.label),
    h('div', { class: 'text-[18px] font-bold ' + (props.color ? '' : 'text-ink-gray-9'), style: props.color ? `color:${props.color}` : undefined }, String(props.value)),
  ])
Stat.props = ['label', 'value', 'color']
</script>
