<!--
  Calls log — FCRM redesign (handoff §5.9). Stats + tabs (All/Out/In/Missed) + table,
  row → call detail drawer. New page; upstream CallLogs.vue kept at /call-logs/view/.
-->
<template>
  <div class="relative flex min-h-0 w-full flex-1 flex-col bg-surface-base">
    <!-- Phone: a call history like a phone's — who, when, how it went, and a
         way to call back. One chip row; «Registrar llamada» is the FAB. -->
    <template v-if="isMobile">
      <FilterChips
        v-model="tab"
        class="flex-none px-4 py-2"
        :chips="phoneChips"
        :deselectable="false"
        :label="__('Llamadas')"
      />
      <div class="scb min-h-0 flex-1 overflow-y-auto pb-24">
        <CallsBoard
          v-model:days="days"
          v-model:focus="focus"
          class="px-4 pb-4 pt-1"
          :board="board"
          :error="boardError"
          :can-set-up="canSetUp"
          @settings="openInboxSettings('calls')"
        />
        <div ref="listTop" class="scroll-mt-2" />
        <EmptyState
          v-if="calls.loading && !rows.length"
          state="loading"
          :title="__('Cargando…')"
        />
        <EmptyState
          v-else-if="!rows.length"
          :title="__('Sin llamadas')"
          :message="__('Las llamadas que hagas o recibas aparecerán aquí.')"
        />
        <ListRow
          v-for="r in rows"
          :key="r.name"
          :title="callTitle(r)"
          :subtitle="callLine(r)"
          :subtitle-lines="followUp(r) ? 2 : 1"
          :subtitle-tone="MISSED.includes(r.status) ? 'danger' : ''"
          :data-fresh="live.fresh.value.has(r.name) || undefined"
          data-testid="call-row"
          @click="openCall(r.name)"
        >
          <template #leading>
            <span
              class="flex size-10 flex-none items-center justify-center rounded-full"
              :class="dirChip(r)"
              :aria-label="
                r.type === 'Outgoing' ? __('Saliente') : __('Entrante')
              "
            >
              <span class="size-5" :class="dirIcon(r)" aria-hidden="true" />
            </span>
          </template>
          <!-- how it went rides line 2 (red when missed): a chip beside the
               call-back button wrapped the number onto two lines at 305px -->
          <template #trailing>
            <a
              v-if="dialable(r)"
              :href="`tel:${dialable(r)}`"
              class="flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-8 hover:bg-surface-gray-2"
              :aria-label="__('Llamar')"
              @click.stop
              ><span class="lucide-phone size-5" aria-hidden="true"
            /></a>
          </template>
        </ListRow>
      </div>
      <Fab
        :label="__('Registrar llamada')"
        icon="lucide-phone"
        @click="logCall"
      />
    </template>
    <template v-else>
      <CallsBoard
        v-model:days="days"
        v-model:focus="focus"
        class="max-w-5xl flex-none border-b border-outline-gray-1 px-5 py-3"
        :board="board"
        :error="boardError"
        :can-set-up="canSetUp"
        @settings="openInboxSettings('calls')"
      />

      <!-- toolbar: wraps on phones so the action button drops under the tabs
         instead of pushing the row past the viewport -->
      <div
        class="flex min-h-[48px] flex-none flex-wrap items-center justify-between gap-2 border-b border-outline-gray-1 px-5 py-1.5"
      >
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            v-for="t in deskTabs"
            :key="t.key"
            class="rounded-full px-3 py-1 text-[11.5px] font-semibold"
            :class="
              tab === t.key
                ? 'bg-surface-gray-3 text-ink-gray-9'
                : 'bg-surface-gray-2 text-ink-gray-6'
            "
            @click="tab = t.key"
          >
            {{ t.label }}
          </button>
        </div>
        <button
          class="rounded-6 px-3.5 py-[7px] text-[12.5px] font-semibold text-white"
          style="background: var(--brand)"
          @click="logCall"
        >
          + {{ __('Registrar llamada') }}
        </button>
      </div>

      <!-- header: sentence case, the reading order of a call -->
      <div
        class="grid flex-none items-center gap-x-3 border-b border-outline-gray-1 bg-surface-gray-1 px-5 text-sm font-medium text-ink-gray-5"
        :style="`grid-template-columns:${GRID};height:34px`"
      >
        <div />
        <div>{{ __('Contacto') }}</div>
        <div>{{ __('Fecha y hora') }}</div>
        <div>{{ __('En turno') }}</div>
        <div>{{ __('Motivo') }}</div>
        <div>{{ __('¿Se logró?') }}</div>
        <div>{{ __('Ánimo') }}</div>
      </div>

      <!-- rows -->
      <div class="scb min-h-0 flex-1 overflow-y-auto">
        <div
          v-if="calls.loading && !rows.length"
          class="py-10 text-center text-sm text-ink-gray-5"
        >
          {{ __('Cargando…') }}
        </div>
        <div
          v-else-if="!rows.length"
          class="py-10 text-center text-sm text-ink-gray-5"
        >
          {{ __('Sin llamadas') }}
        </div>

        <button
          v-for="r in rows"
          :key="r.name"
          type="button"
          class="grid w-full items-center gap-x-3 border-b border-outline-gray-1 px-5 py-2 text-left hover:bg-surface-gray-2"
          :style="`grid-template-columns:${GRID};min-height:52px`"
          :data-fresh="live.fresh.value.has(r.name) || undefined"
          data-testid="call-row"
          @click="openCall(r.name)"
        >
          <span
            class="flex size-8 items-center justify-center rounded-full"
            :class="dirChip(r)"
            :aria-label="
              r.type === 'Outgoing' ? __('Saliente') : __('Entrante')
            "
          >
            <span class="size-4" :class="dirIcon(r)" aria-hidden="true" />
          </span>
          <span class="min-w-0">
            <span
              class="block truncate text-base font-semibold text-ink-gray-9"
            >
              {{ callTitle(r) }}
            </span>
            <span class="block truncate text-sm text-ink-gray-5">
              {{ callSub(r) }}
            </span>
          </span>
          <span class="min-w-0">
            <span class="num block truncate text-base text-ink-gray-8">
              {{ callWhen(r.start_time) }}
            </span>
            <!-- how long it lasted, or how it failed, under when -->
            <span
              class="num block truncate text-sm"
              :class="
                MISSED.includes(r.status) ? 'text-ink-red-7' : 'text-ink-gray-5'
              "
            >
              {{ timeLine(r) }}
            </span>
            <span
              v-if="followUp(r)"
              class="block truncate text-sm"
              :class="
                verdictTone(followUp(r)) === 'danger'
                  ? 'text-ink-red-7'
                  : 'text-[var(--muelle-on-surface-variant)]'
              "
              data-follow-up
            >
              {{ verdictLine(followUp(r)) }}
            </span>
          </span>
          <span class="truncate text-base text-ink-gray-7">
            {{ onShift(r.start_time, shifts).join(', ') || '—' }}
          </span>
          <span
            class="truncate text-base"
            :class="info(r).call_reason ? 'text-ink-gray-8' : 'text-ink-gray-4'"
            :title="info(r).call_reason || ''"
          >
            {{ info(r).call_reason || reasonPlaceholder(r) }}
          </span>
          <span>
            <StatusChip
              v-if="GOAL[info(r).goal_met]"
              :label="GOAL[info(r).goal_met].label"
              :tone="GOAL[info(r).goal_met].tone"
            />
          </span>
          <span>
            <StatusChip
              v-if="SENTIMENT[info(r).tone]"
              :label="SENTIMENT[info(r).tone].label"
              :tone="SENTIMENT[info(r).tone].tone"
            />
          </span>
        </button>
      </div>
    </template>
    <CallDetailDrawer
      v-if="selectedCall"
      :name="selectedCall"
      :shifts="shifts"
      @close="selectedCall = null"
      @changed="calls.reload()"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createListResource } from 'frappe-ui'
import { useDoctypeModal } from '@/composables/doctypeModal'
import { isMobile } from '@/composables/breakpoint'
import CallDetailDrawer from '@/components/doco/calls/CallDetailDrawer.vue'
import CallsBoard from '@/components/doco/calls/CallsBoard.vue'
import {
  namesFor,
  verdictLine,
  verdictTone,
} from '@/components/doco/calls/board'
import { openInboxSettings } from '@/components/Inbox/inboxSettings'
import {
  GOAL,
  MISSED,
  SENTIMENT,
  callAgo,
  callWhen,
  onShift,
} from '@/components/doco/calls/calls'
import { globalStore } from '@/stores/global'
import { useLiveList } from '@/composables/liveList'
import {
  EmptyState,
  Fab,
  FilterChips,
  ListRow,
  StatusChip,
} from '@/components/ui'
import { formatPhone } from '@/composables/crmFormat'
import { statusLabel } from '@/utils/display'
import { call } from 'frappe-ui'

// Direction, contact, when, how long, who was on shift, then what the
// analysis found: why they called, whether it worked, the customer's mood.
const GRID =
  '32px minmax(140px,1fr) 156px minmax(70px,.5fr) minmax(120px,1.3fr) 96px 80px'

const { showModal } = useDoctypeModal()
function logCall() {
  showModal({
    doctype: 'CRM Call Log',
    title: __('Call Log'),
    callbacks: { afterInsert: () => calls.reload() },
  })
}

const tab = ref('all')
// A board tile narrows the list to its calls (missed in hours, outside hours,
// not returned); a tab clears it, «Todas» first as everywhere.
const focus = ref('')
const tabs = [
  { key: 'all', label: __('Todas') },
  { key: 'out', label: __('Salientes') },
  { key: 'in', label: __('Entrantes') },
  { key: 'missed', label: __('Perdidas') },
]
const FOCUS_LABEL = {
  missed_open: __('Perdidas en horario'),
  closed: __('Fuera de horario'),
  waiting: __('Sin devolver'),
}

// The board: crm.api.calls.board over the chosen days.
const days = ref(30)
const board = ref(null)
const boardError = ref('')
const canSetUp = computed(() => Array.isArray(board.value?.people))
let boardSeq = 0
async function loadBoard() {
  const mine = ++boardSeq
  try {
    const found = await call('crm.api.calls.board', { days: days.value })
    if (mine !== boardSeq) return
    board.value = found
    boardError.value = ''
    if (focus.value) applyFilters()
  } catch {
    if (mine === boardSeq)
      boardError.value = __('No se pudo leer el seguimiento de llamadas.')
  }
}
watch(days, loadBoard, { immediate: true })
function followUp(r) {
  return board.value?.items?.[r.name] || null
}
const selectedCall = ref(null)

const calls = createListResource({
  doctype: 'CRM Call Log',
  fields: [
    'name',
    'type',
    'status',
    'from',
    'to',
    'duration',
    'start_time',
    'reference_doctype',
    'reference_docname',
  ],
  orderBy: 'start_time desc',
  pageLength: 100,
})
const rows = computed(() => calls.data || [])
// A call that comes in or a teammate logs shows at once, highlighted.
const live = useLiveList('CRM Call Log', async () => {
  const before = rows.value.map((r) => r.name)
  await calls.reload()
  loadBoard()
  live.mark(
    before,
    rows.value.map((r) => r.name),
  )
})

function applyFilters() {
  const f = {}
  const names = focus.value ? namesFor(board.value, focus.value) : null
  if (names) f.name = ['in', names.length ? names : ['']]
  else if (tab.value === 'out') f.type = 'Outgoing'
  else if (tab.value === 'in') f.type = 'Incoming'
  else if (tab.value === 'missed') f.status = ['in', MISSED]
  calls.filters = f
  calls.reload()
}
watch(
  tab,
  (value) => {
    if (value !== 'focus') focus.value = ''
    applyFilters()
  },
  { immediate: true },
)
// On a phone the board fills the first screen: a tile brings its calls up.
const listTop = ref(null)
watch(focus, async (value) => {
  if (value) tab.value = 'focus'
  else if (tab.value === 'focus') tab.value = 'all'
  applyFilters()
  if (!value || !isMobile.value) return
  await nextTick()
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  listTop.value?.scrollIntoView({
    block: 'start',
    behavior: still ? 'auto' : 'smooth',
  })
})

// Phone chips: the same tabs, the board's missed count on «Perdidas», and the
// tile that narrows the list while one does.
const phoneChips = computed(() => [
  ...tabs.map((t) => ({
    value: t.key,
    label: t.label,
    count:
      t.key === 'missed' && board.value?.totals?.missed
        ? board.value.totals.missed
        : undefined,
  })),
  ...(focus.value ? [{ value: 'focus', label: FOCUS_LABEL[focus.value] }] : []),
])
const deskTabs = computed(() => [
  ...tabs,
  ...(focus.value ? [{ key: 'focus', label: FOCUS_LABEL[focus.value] }] : []),
])
// Names for the calls linked to a deal or prospect: one read per kind.
const refNames = ref({})
const NAME_FIELDS = {
  'CRM Deal': ['name', 'lead_name', 'organization'],
  'CRM Lead': ['name', 'lead_name', 'first_name', 'last_name'],
}
watch(rows, async (list) => {
  for (const doctype of Object.keys(NAME_FIELDS)) {
    const names = [
      ...new Set(
        list
          .filter(
            (r) =>
              r.reference_doctype === doctype &&
              r.reference_docname &&
              !(r.reference_docname in refNames.value),
          )
          .map((r) => r.reference_docname),
      ),
    ]
    if (!names.length) continue
    try {
      const found = await call('frappe.client.get_list', {
        doctype,
        filters: { name: ['in', names] },
        fields: NAME_FIELDS[doctype],
        limit_page_length: names.length,
      })
      const next = { ...refNames.value }
      for (const name of names) next[name] = ''
      for (const row of found || [])
        next[row.name] =
          row.lead_name ||
          row.organization ||
          [row.first_name, row.last_name].filter(Boolean).join(' ')
      refNames.value = next
    } catch {
      // Unreadable links keep the number as the title.
    }
  }
})
// What the calls page shows beyond CRM's own columns (doco_marketing):
// each call's analysis and who was on shift. One read per page of calls.
const context = ref({ analysis: {}, shifts: [] })
const shifts = computed(() => context.value.shifts || [])
let contextSeq = 0
async function loadContext() {
  const names = rows.value.map((r) => r.name)
  const mine = ++contextSeq
  if (!names.length) return
  try {
    const found = await call('doco_marketing.api.calls.page_context', {
      names,
    })
    if (mine === contextSeq) context.value = found || context.value
  } catch {
    // Without doco_marketing the page keeps CRM's columns.
  }
}
watch(rows, loadContext)
function info(r) {
  return context.value.analysis?.[r.name] || {}
}
function reasonPlaceholder(r) {
  if (info(r).analysis_status === 'en_proceso') return __('Analizando…')
  return '—'
}

// «Transcribir y analizar» finishes in the background; its result lands here.
const { $socket } = globalStore()
function onAnalysis() {
  loadContext()
}
onMounted(() => $socket?.on('doco_call_analysis', onAnalysis))
onBeforeUnmount(() => $socket?.off('doco_call_analysis', onAnalysis))

function callTitle(r) {
  return refNames.value[r.reference_docname] || formatPhone(phoneOf(r))
}
function callLine(r) {
  return [
    r.status && r.status !== 'Completed' && statusLabel(r.status, 'call'),
    refNames.value[r.reference_docname] && formatPhone(phoneOf(r)),
    callWhen(r.start_time),
    Number(r.duration) > 0 && !followUp(r) && fmtDur(r.duration),
    verdictLine(followUp(r)),
  ]
    .filter(Boolean)
    .join(' · ')
}
// The linked record's number, or where it came from on an unlinked call.
function callSub(r) {
  const named = refNames.value[r.reference_docname]
  return named ? formatPhone(phoneOf(r)) : r.reference_docname || ''
}
function timeLine(r) {
  const how = MISSED.includes(r.status)
    ? statusLabel(r.status, 'call')
    : Number(r.duration) > 0 && fmtDur(r.duration)
  return [how, callAgo(r.start_time)].filter(Boolean).join(' · ')
}
function dirIcon(r) {
  if (MISSED.includes(r.status)) return 'lucide-phone-missed'
  return r.type === 'Outgoing'
    ? 'lucide-phone-outgoing'
    : 'lucide-phone-incoming'
}
function dialable(r) {
  const digits = String(phoneOf(r)).replace(/[^+\d]/g, '')
  return digits.length >= 7 ? digits : ''
}
function phoneOf(r) {
  return (r.type === 'Outgoing' ? r.to : r.from) || r.from || r.to || '—'
}
function fmtDur(s) {
  s = Number(s) || 0
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}
function dirChip(r) {
  if (MISSED.includes(r.status)) return 'text-ink-red-8 bg-surface-red-1'
  return r.type === 'Outgoing'
    ? 'text-ink-green-8 bg-surface-green-2'
    : 'text-ink-blue-9 bg-surface-blue-1'
}
function openCall(name) {
  selectedCall.value = name
}
</script>
