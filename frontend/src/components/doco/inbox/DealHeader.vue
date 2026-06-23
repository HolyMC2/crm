<!-- Inbox center top: deal header (identity/score/SLA/stage/call) + next-action bar. §5.1 -->
<template>
  <div class="flex-none border-b border-outline-gray-1 px-4 py-[11px]">
    <div class="flex items-center gap-3">
      <span
        class="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full text-sm font-semibold"
        :style="`background:${avatarColor(name)[0]};color:${avatarColor(name)[1]}`"
      >
        {{ initials(name) }}
      </span>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-base font-bold text-ink-gray-9">{{ name || '—' }}</span>
          <span
            v-if="grade"
            class="rounded px-[7px] py-px text-[11px] font-bold text-white"
            :style="`background:${gradeColor}`"
          >
            {{ grade }} · {{ score }}
          </span>
          <span class="text-[11.5px] text-ink-gray-5">{{ activeDeal }}</span>
        </div>
        <div class="mt-0.5 flex items-center gap-2.5 text-[12px] text-ink-gray-6">
          <span v-if="row.device">🔧 {{ row.device }}</span>
          <span v-if="row.device" style="color: #d7dae1">·</span>
          <span v-if="row.mobile_no">{{ row.mobile_no }}</span>
          <template v-if="row.last_message_ts">
            <span style="color: #d7dae1">·</span>
            <span class="text-ink-gray-5">{{ __('último mensaje enviado') }} {{ timeAgo(row.last_message_ts) }}</span>
          </template>
          <span
            v-if="waWindow"
            class="rounded px-1.5 py-px text-[10.5px] font-semibold"
            :style="waWindow.open ? 'color:#b9790a;background:#fdf6e9' : 'color:#e5484d;background:#fdecec'"
            :title="waWindow.open ? __('Ventana de 24h de WhatsApp abierta') : __('Ventana cerrada — solo plantillas')"
          >
            {{ waWindow.open ? `WA ${waWindow.hoursLeft}h` : __('WA cerrada') }}
          </span>
        </div>
      </div>
      <div class="flex flex-none items-center gap-2.5">
        <div v-if="slaLabel" class="text-right">
          <div class="text-[10px] text-ink-gray-5">{{ __('1ª respuesta SLA') }}</div>
          <div class="text-[13px] font-bold" :style="slaOverdue ? 'color:#e5484d' : 'color:#15803d'">
            {{ slaLabel }}
          </div>
        </div>
        <div class="h-[30px] w-px" style="background: #edeef1" />
        <Dropdown :options="stageOptions">
          <button
            class="flex items-center gap-1.5 rounded-lg border px-[11px] py-[7px] text-[12.5px] font-semibold"
            :style="stageBtnStyle"
          >
            <span class="h-2 w-2 rounded-full" :style="`background:${stageColor}`" />
            {{ row.status || __('Estado') }} ⌄
          </button>
        </Dropdown>
        <button
          class="flex h-[34px] w-[34px] items-center justify-center rounded-lg text-[15px] text-white"
          style="background: #16a34a"
          :title="__('Llamar')"
          @click="call"
        >
          <LucidePhone class="h-4 w-4" />
        </button>
      </div>
    </div>

    <!-- next action bar -->
    <div
      v-if="nextTask"
      class="mt-[11px] flex items-center gap-2.5 rounded-[10px] border px-[13px] py-[9px]"
      style="background: #fdf6e9; border-color: #f1dca6"
    >
      <span
        class="flex-none text-[9.5px] font-bold uppercase tracking-[.08em]"
        style="color: #b9790a"
      >
        ⏱ {{ __('Próxima acción') }}
      </span>
      <span class="truncate text-[13px] font-semibold text-ink-gray-9">{{ nextTask.title }}</span>
      <span v-if="nextTask.due" class="flex-none text-[11.5px]" style="color: #b08a3e">
        · {{ dueLabel }}
      </span>
      <div class="ml-auto flex flex-none gap-1.5">
        <button
          class="rounded-[7px] px-[11px] py-1.5 text-[11.5px] font-semibold text-white"
          style="background: #16a34a"
          @click="markDone"
        >
          {{ __('Marcar hecho') }}
        </button>
        <button
          class="rounded-[7px] border border-outline-gray-2 bg-surface-white px-[11px] py-1.5 text-[11.5px] font-medium text-ink-gray-7"
          @click="reschedule"
        >
          {{ __('Reprogramar') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue'
import { Dropdown, createListResource, createResource, call as frappeCall, toast } from 'frappe-ui'
import LucidePhone from '~icons/lucide/phone'
import { globalStore } from '@/stores/global'
import { statusesStore } from '@/stores/statuses'
import { useDoctypeModal } from '@/composables/doctypeModal'
import {
  activeDeal,
  activeDealDoctype,
  queue,
  sla,
  setStage,
  avatarColor,
  initials,
  timeAgo,
  GRADE_COLORS,
} from '@/composables/inbox'

const { showModal } = useDoctypeModal()

const { makeCall } = globalStore()
const { getDealStatus, getLeadStatus, leadStatuses, dealStatuses: dealStatusList } = statusesStore()

const isDeal = computed(() => activeDealDoctype.value === 'CRM Deal')

// rich row from the inbox queue when present; otherwise (360° / deep-linked deal not
// in the queue) build an equivalent from a direct deal+lead fetch so the header isn't sparse.
const queueRow = computed(() => (queue.data || []).find((r) => r.deal === activeDeal.value) || {})
const dealFetch = createResource({ url: 'frappe.client.get_value' })
const leadFetch = createResource({ url: 'frappe.client.get_value' })
watch(
  [activeDeal, queueRow],
  () => {
    if (!activeDeal.value || queueRow.value.deal) return // in queue → no fetch needed
    const isD = activeDealDoctype.value === 'CRM Deal'
    dealFetch.submit({
      doctype: activeDealDoctype.value,
      filters: activeDeal.value,
      fieldname: JSON.stringify(
        isD
          ? ['status', 'lead', 'mobile_no', 'first_name', 'lead_name']
          : ['status', 'mobile_no', 'first_name', 'last_name', 'lead_name', 'lead_score', 'score_grade'],
      ),
    })
  },
  { immediate: true },
)
watch(
  () => dealFetch.data?.lead,
  (lead) => lead && leadFetch.submit({ doctype: 'CRM Lead', filters: lead, fieldname: JSON.stringify(['lead_score', 'score_grade', 'lead_name', 'mobile_no']) }),
)
const row = computed(() => {
  if (queueRow.value.deal) return queueRow.value
  const d = dealFetch.data || {}
  const l = leadFetch.data || {}
  return {
    deal: activeDeal.value,
    status: d.status,
    contact_name: d.lead_name || d.first_name || l.lead_name || d.mobile_no || l.mobile_no,
    mobile_no: d.mobile_no || l.mobile_no,
    lead_score: l.lead_score ?? d.lead_score,
    score_grade: l.score_grade ?? d.score_grade,
  }
})
const name = computed(() => row.value.contact_name || row.value.mobile_no || '')
const grade = computed(() => row.value.score_grade)
const score = computed(() => row.value.lead_score ?? '')
const gradeColor = computed(() => GRADE_COLORS[grade.value]?.[0] || '#9aa2ae')

// guard: a deep-linked deal not in the queue gives an empty row → status undefined;
// getDealStatus(undefined) throws internally, so only call it when status is set.
const stageColor = computed(() => {
  if (!row.value.status) return '#9aa2ae'
  const s = isDeal.value ? getDealStatus(row.value.status) : getLeadStatus(row.value.status)
  return s?.color || '#9aa2ae'
})
const stageBtnStyle = computed(() => {
  const c = stageColor.value
  return `color:${c};background:${c}14;border-color:${c}40`
})

// stage dropdown — the right status set for the active doctype (Deal vs Lead)
const stageOptions = computed(() => {
  const list = (isDeal.value ? dealStatusList : leadStatuses)?.data || []
  return list.map((s) => ({ label: s.name, onClick: () => setStage(s.name) }))
})

// WhatsApp 24h customer-service window (free-form until 24h after last inbound;
// after that, template-only). Driven by the last Incoming WhatsApp Message.
const lastInbound = createListResource({
  doctype: 'WhatsApp Message',
  fields: ['creation'],
  orderBy: 'creation desc',
  pageLength: 1,
  onError: () => {},
})
watch(
  activeDeal,
  (d) => {
    if (!d) return
    lastInbound.filters = { reference_doctype: activeDealDoctype.value, reference_name: d, type: 'Incoming' }
    lastInbound.reload()
  },
  { immediate: true },
)
const waWindow = computed(() => {
  const ts = lastInbound.data?.[0]?.creation
  if (!ts) return null
  const left = 24 - (Date.now() - new Date(String(ts).replace(' ', 'T')).getTime()) / 3600000
  return left > 0 ? { open: true, hoursLeft: Math.max(1, Math.floor(left)) } : { open: false }
})

// SLA
const slaSecs = computed(() => sla.data?.first_response_seconds_left)
const slaOverdue = computed(
  () => sla.data?.sla_status === 'Failed' || (slaSecs.value ?? 0) < 0,
)
const slaLabel = computed(() => {
  const s = slaSecs.value
  if (s === undefined || s === null) return sla.data?.sla_status || ''
  const abs = Math.abs(s)
  const h = Math.floor(abs / 3600)
  const m = Math.floor((abs % 3600) / 60)
  const t = h ? `${h}h` : `${m}m`
  return s < 0 ? `vencido +${t}` : `${t} restantes`
})

function call() {
  if (row.value.mobile_no) makeCall(row.value.mobile_no)
}

// next action: earliest open task on this deal
const tasks = createListResource({
  doctype: 'CRM Task',
  fields: ['name', 'title', 'status', 'due_date', 'priority'],
  orderBy: 'due_date asc',
  pageLength: 1,
})
watch(
  activeDeal,
  (d) => {
    if (!d) return
    tasks.filters = {
      reference_doctype: activeDealDoctype.value,
      reference_docname: d,
      status: ['not in', ['Done', 'Canceled']],
    }
    tasks.reload()
  },
  { immediate: true },
)
const nextTask = computed(() => {
  const t = tasks.data?.[0]
  return t ? { name: t.name, title: t.title, due: t.due_date } : null
})
const dueLabel = computed(() => {
  if (!nextTask.value?.due) return ''
  const d = new Date(String(nextTask.value.due).replace(' ', 'T'))
  return d.toLocaleDateString()
})

async function markDone() {
  if (!nextTask.value) return
  await frappeCall('frappe.client.set_value', {
    doctype: 'CRM Task',
    name: nextTask.value.name,
    fieldname: 'status',
    value: 'Done',
  })
  toast.success(__('Tarea completada'))
  tasks.reload()
}
function reschedule() {
  // open the real wired CRM Task modal (date/assignee/priority/reminder) for editing
  if (!nextTask.value) return
  showModal({
    name: nextTask.value.name,
    doctype: 'CRM Task',
    title: __('Task'),
    callbacks: { afterUpdate: () => tasks.reload() },
  })
}
</script>
