<!-- Inbox center top: deal header (identity/score/SLA/stage/call) + next-action bar. §5.1 -->
<template>
  <div class="flex-none border-b border-outline-gray-1 px-4 py-[11px]">
    <div class="flex items-center gap-3">
      <!-- mobile: back to the conversation list (← pops the history stack) -->
      <button
        v-if="isMobile"
        class="-ml-1.5 flex h-9 w-7 flex-none items-center justify-center text-ink-gray-6 hover:text-ink-gray-9"
        :aria-label="__('Volver a la bandeja')"
        @click="mobileBack"
      >
        <LucideChevronLeft class="h-6 w-6" />
      </button>
      <!-- identity: on mobile this whole block opens the customer/deal data pane
           (view 4), exactly like tapping the contact name in WhatsApp. -->
      <span
        class="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full text-sm-semibold"
        :class="isMobile ? 'cursor-pointer' : ''"
        :style="`background:${avatarColor(name)[0]};color:${avatarColor(name)[1]}`"
        @click="isMobile && openContext()"
      >
        {{ initials(name) }}
      </span>
      <div
        class="min-w-0 flex-1"
        :class="isMobile ? 'cursor-pointer' : ''"
        :role="isMobile ? 'button' : undefined"
        :tabindex="isMobile ? 0 : undefined"
        @click="isMobile && openContext()"
        @keydown.enter="isMobile && openContext()"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span class="truncate text-base-bold text-ink-gray-9">{{ name || '—' }}</span>
          <LucideChevronRight v-if="isMobile" class="h-4 w-4 flex-none text-ink-gray-4" />
          <ScoreExplainPopover
            v-if="grade"
            :doctype="activeDealDoctype"
            :name="activeDeal"
            :score="score"
            :grade="grade"
            variant="header"
          />
          <span class="hidden text-[11.5px] text-ink-gray-5 sm:inline">{{ activeDeal }}</span>
        </div>
        <!-- meta row wraps on narrow screens (was clipping the WA/saldo chips) -->
        <div class="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-ink-gray-6">
          <span
            v-if="row.device"
            class="max-w-[52vw] truncate whitespace-nowrap sm:max-w-none"
          >🔧 {{ row.device }}</span>
          <span v-if="row.device" class="hidden text-ink-gray-4 sm:inline">·</span>
          <span v-if="row.mobile_no" class="whitespace-nowrap">{{ row.mobile_no }}</span>
          <template v-if="row.last_message_ts">
            <span class="text-ink-gray-4">·</span>
            <span class="whitespace-nowrap text-ink-gray-5">
              <span class="hidden sm:inline">{{ __('último mensaje enviado') }} </span>{{ timeAgo(row.last_message_ts) }}
            </span>
          </template>
          <span
            v-if="waWindow"
            class="flex-none whitespace-nowrap rounded px-1.5 py-px text-[10.5px] font-semibold"
            :class="waWindow.open ? 'bg-surface-amber-1 text-ink-amber-7' : 'bg-surface-red-1 text-ink-red-8'"
            :title="waWindow.open ? __('Ventana de 24h de WhatsApp abierta') : __('Ventana cerrada — solo plantillas')"
          >
            {{ waWindow.open ? `WA ${waWindow.hoursLeft}h` : __('WA cerrada') }}
          </span>
          <span
            v-if="saldoChip"
            class="flex-none whitespace-nowrap rounded bg-surface-red-1 px-1.5 py-px text-[10.5px] font-semibold text-ink-red-8"
            :title="__('Saldo pendiente en facturas del trato')"
          >
            💰 {{ __('Saldo') }} {{ saldoChip }}
          </span>
        </div>
      </div>
      <div class="flex flex-none items-center gap-1.5 self-start sm:gap-2.5 sm:self-auto">
        <div
          v-if="responsible && !isMobile"
          class="flex items-center gap-1.5"
          :title="__('Responsable') + ': ' + responsible.name"
        >
          <span
            class="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full text-[10px] font-semibold"
            :style="`background:${avatarColor(responsible.name)[0]};color:${avatarColor(responsible.name)[1]}`"
          >
            {{ initials(responsible.name) }}
          </span>
          <span class="text-[12px] font-medium text-ink-gray-7">{{ responsible.name.split(' ')[0] }}</span>
        </div>
        <div v-if="responsible && slaLabel && !isMobile" class="h-[30px] w-px bg-outline-gray-2" />
        <div v-if="slaLabel && !isMobile" class="text-right">
          <div class="text-[10px] text-ink-gray-5">{{ __('1ª respuesta SLA') }}</div>
          <div class="text-[13px] font-bold" :class="slaOverdue ? 'text-ink-red-7' : 'text-ink-green-7'">
            {{ slaLabel }}
          </div>
        </div>
        <div v-if="!isMobile" class="h-[30px] w-px bg-outline-gray-2" />
        <Dropdown v-if="!isMobile" :options="stageOptions">
          <button
            class="flex items-center gap-1.5 rounded-lg border border-outline-gray-2 bg-surface-gray-2 px-[11px] py-[7px] text-[12.5px] font-semibold text-ink-gray-8"
          >
            <span class="h-2 w-2 rounded-full" :style="`background:${stageColor}`" />
            {{ row.status || __('Estado') }} ⌄
          </button>
        </Dropdown>
        <!-- 🏷 etiquetas (spec 2.2) -->
        <button
          class="press flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-outline-gray-2"
          :class="(row.tags || []).length ? 'bg-surface-violet-2 text-ink-violet-8' : 'bg-surface-gray-2 text-ink-gray-7 hover:bg-surface-gray-3'"
          :title="__('Etiquetas')"
          :aria-label="__('Etiquetas')"
          @click="openTags"
        >
          <LucideTag class="h-4 w-4" />
        </button>
        <!-- 💤 snooze/recordar (spec 2.1) -->
        <Dropdown :options="snoozeOptions">
          <button
            class="press flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-outline-gray-2"
            :class="isSnoozed ? 'bg-surface-violet-2 text-ink-violet-8' : 'bg-surface-gray-2 text-ink-gray-7 hover:bg-surface-gray-3'"
            :title="isSnoozed ? __('Pospuesta — reaparece sola') : __('Posponer conversación')"
            :aria-label="__('Posponer')"
          >
            <LucideAlarmClock class="h-4 w-4" />
          </button>
        </Dropdown>
        <!-- 📅 cadencia de seguimiento (spec 4.2) — self-hides for non-deals -->
        <CadencePicker :doctype="activeDealDoctype" :name="activeDeal" />
        <button
          class="press flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-outline-gray-2 bg-surface-gray-2 text-ink-gray-7 hover:bg-surface-gray-3"
          :title="__('Bitácora — historial en todos los canales')"
          :aria-label="__('Bitácora')"
          @click="openLedger"
        >
          <LucideScrollText class="h-4 w-4" />
        </button>
        <button
          class="press flex h-[34px] w-[34px] items-center justify-center rounded-lg text-[15px] text-white"
          style="background: var(--brand)"
          :title="__('Llamar')"
          :aria-label="__('Llamar')"
          @click="call"
        >
          <LucidePhone class="h-4 w-4" />
        </button>
      </div>
    </div>

    <!-- 🏷 etiquetas manager -->
    <Dialog v-model="showTagsDialog" :options="{ title: __('Etiquetas') }">
      <template #body-content>
        <div v-if="localTags.length" class="mb-3 flex flex-wrap gap-1.5">
          <span
            v-for="tg in localTags"
            :key="tg"
            class="inline-flex items-center gap-1 rounded-full bg-surface-violet-2 px-2.5 py-1 text-[12px] font-semibold text-ink-violet-8"
          >
            🏷 {{ tg }}
            <button class="press text-[13px] leading-none" :aria-label="__('Quitar') + ' ' + tg" @click="removeTag(tg)">×</button>
          </span>
        </div>
        <div v-else class="mb-3 text-[12px] text-ink-gray-5">{{ __('Sin etiquetas') }}</div>
        <div v-if="tagSuggestions.length" class="mb-3">
          <div class="mb-1.5 text-[10.5px] font-bold uppercase tracking-[.07em] text-ink-gray-4">{{ __('Sugerencias') }}</div>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="tg in tagSuggestions"
              :key="tg"
              class="press rounded-full bg-surface-gray-2 px-2.5 py-1 text-[12px] font-medium text-ink-gray-7 hover:bg-surface-gray-3"
              @click="addTag(tg)"
            >
              + {{ tg }}
            </button>
          </div>
        </div>
        <div class="flex gap-2">
          <input
            v-model="newTag"
            class="w-full rounded-lg border border-outline-gray-2 bg-surface-base px-3 py-2 text-base text-ink-gray-9"
            :aria-label="__('Nueva etiqueta')"
            :placeholder="__('Nueva etiqueta… (urgente, garantía, mayoreo)')"
            @keydown.enter.prevent="addTag(newTag)"
          />
          <Button variant="solid" :label="__('Añadir')" :disabled="!newTag.trim()" @click="addTag(newTag)" />
        </div>
      </template>
    </Dialog>

    <!-- custom snooze datetime -->
    <Dialog v-model="showSnoozeDialog" :options="{ title: __('Posponer hasta') }">
      <template #body-content>
        <input
          v-model="snoozeCustom"
          type="datetime-local"
          :min="minLocal"
          class="w-full rounded-lg border border-outline-gray-2 bg-surface-base px-3 py-2 text-base text-ink-gray-9"
          :aria-label="__('Posponer hasta')"
        />
      </template>
      <template #actions>
        <Button
          variant="solid"
          :label="__('Posponer')"
          :disabled="!snoozeCustom"
          @click="confirmCustomSnooze"
        />
      </template>
    </Dialog>

    <!-- next action bar -->
    <div
      v-if="nextTask"
      class="mt-[11px] flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-[10px] border border-outline-amber-4 bg-surface-amber-1 px-[13px] py-[9px]"
    >
      <span
        class="flex-none text-[9.5px] font-bold uppercase tracking-[.08em] text-ink-amber-7"
      >
        ⏱ {{ __('Próxima acción') }}
      </span>
      <span class="truncate text-[13px] font-semibold text-ink-gray-9">{{ nextTask.title }}</span>
      <span v-if="nextTask.due" class="flex-none text-[11.5px] text-ink-amber-6">
        · {{ dueLabel }}
      </span>
      <div class="ml-auto flex flex-none gap-1.5">
        <button
          class="rounded-[7px] px-[11px] py-1.5 text-[11.5px] font-semibold text-white"
          style="background: var(--brand)"
          @click="markDone"
        >
          {{ __('Marcar hecho') }}
        </button>
        <button
          class="rounded-[7px] border border-outline-gray-2 bg-surface-base px-[11px] py-1.5 text-[11.5px] font-medium text-ink-gray-7 hover:bg-surface-gray-2"
          @click="reschedule"
        >
          {{ __('Reprogramar') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Button, Dialog, Dropdown, createListResource, createResource, call as frappeCall, toast } from 'frappe-ui'
import LucidePhone from '~icons/lucide/phone'
import LucideScrollText from '~icons/lucide/scroll-text'
import LucideAlarmClock from '~icons/lucide/alarm-clock'
import LucideTag from '~icons/lucide/tag'
import LucideChevronLeft from '~icons/lucide/chevron-left'
import LucideChevronRight from '~icons/lucide/chevron-right'
import CadencePicker from '@/components/doco/inbox/CadencePicker.vue'
import ScoreExplainPopover from '@/components/doco/ScoreExplainPopover.vue'
import { globalStore } from '@/stores/global'
import { statusesStore } from '@/stores/statuses'
import { usersStore } from '@/stores/users'
import { useDoctypeModal } from '@/composables/doctypeModal'
import { isMobile } from '@/composables/breakpoint'
import {
  activeDeal,
  activeDealDoctype,
  queueRows,
  sla,
  requestStage,
  openContext,
  openLedger,
  mobileBack,
  avatarColor,
  initials,
  timeAgo,
  salesDocsEnabled,
  snoozedCount,
  reloadQueue,
  conversationTags,
} from '@/composables/inbox'
import { ensureSalesSummary, salesOutstanding, salesRollup } from '@/composables/salesDocs'
import { formatMoney } from '@/composables/crmFormat'

const { showModal } = useDoctypeModal()

const { makeCall } = globalStore()
const { getUser } = usersStore()
const { getDealStatus, getLeadStatus, leadStatuses, dealStatuses: dealStatusList } = statusesStore()

const isDeal = computed(() => activeDealDoctype.value === 'CRM Deal')

// rich row from the inbox queue when present; otherwise (360° / deep-linked deal not
// in the queue) build an equivalent from a direct deal+lead fetch so the header isn't sparse.
// AUDIT 2026-07-26: resolve against the ACCUMULATED queueRows, not queue.data — the
// resource holds only the last-fetched page, so pagination or any merge reload made
// the open conversation's header silently degrade (device/tags/snooze dropped).
const queueRow = computed(() => queueRows.value.find((r) => r.deal === activeDeal.value) || {})
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
          ? ['status', 'lead', 'mobile_no', 'first_name', 'lead_name', 'deal_owner']
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
    deal_owner: d.deal_owner,
  }
})
const name = computed(() => row.value.contact_name || row.value.mobile_no || '')

// Responsible owner: the CRM Deal's deal_owner (rides the existing assignment /
// cascade — no parallel ACL). Resolved to a full name for the header chip.
const responsible = computed(() => {
  const u = row.value.deal_owner
  if (!u) return null
  return { user: u, name: getUser(u)?.full_name || u }
})
const grade = computed(() => row.value.score_grade)
const score = computed(() => row.value.lead_score ?? '')

// 💰 saldo chip (ERP_INTEGRATION_SPEC P1.3): shares the SalesDocsSection resource —
// one fetch per deal feeds panel + chip. Deal-only; flag can resolve after mount.
watch(
  [activeDeal, salesDocsEnabled],
  () => isDeal.value && activeDeal.value && ensureSalesSummary(activeDeal.value),
  { immediate: true },
)
const saldoChip = computed(() => {
  if (!salesDocsEnabled.value || !isDeal.value || !(salesOutstanding.value > 0)) return ''
  return formatMoney(salesOutstanding.value, salesRollup.value?.currency)
})

// guard: a deep-linked deal not in the queue gives an empty row → status undefined;
// getDealStatus(undefined) throws internally, so only call it when status is set.
const stageColor = computed(() => {
  if (!row.value.status) return '#9aa2ae'
  const s = isDeal.value ? getDealStatus(row.value.status) : getLeadStatus(row.value.status)
  return s?.color || '#9aa2ae'
})
// stage dropdown — the right status set for the active doctype (Deal vs Lead)
const stageOptions = computed(() => {
  const list = (isDeal.value ? dealStatusList : leadStatuses)?.data || []
  return list.map((s) => ({ label: s.name, onClick: () => requestStage(s.name, s.type) }))
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

// ── 🏷 etiquetas (spec 2.2) — optimistic local list; queue refresh reconciles ──
const showTagsDialog = ref(false)
const newTag = ref('')
const localTags = ref([])
watch(
  () => row.value.tags,
  (t) => (localTags.value = [...(t || [])]),
  { immediate: true },
)
const tagSuggestions = computed(() =>
  (conversationTags.data || []).filter((t) => !localTags.value.includes(t)).slice(0, 8),
)
function openTags() {
  localTags.value = [...(row.value.tags || [])]
  showTagsDialog.value = true
}
async function addTag(tag) {
  tag = (tag || '').trim()
  if (!tag || localTags.value.includes(tag)) return
  localTags.value.push(tag)
  newTag.value = ''
  try {
    await frappeCall('doco_marketing.api.inbox.tag_conversation', {
      doctype: activeDealDoctype.value,
      name: activeDeal.value,
      tag,
    })
    conversationTags.fetch()
    reloadQueue({ merge: true })
  } catch (e) {
    localTags.value = localTags.value.filter((t) => t !== tag)
    toast.error(e.messages?.[0] || __('No se pudo etiquetar'))
  }
}
async function removeTag(tag) {
  localTags.value = localTags.value.filter((t) => t !== tag)
  try {
    await frappeCall('doco_marketing.api.inbox.untag_conversation', {
      doctype: activeDealDoctype.value,
      name: activeDeal.value,
      tag,
    })
    conversationTags.fetch()
    reloadQueue({ merge: true })
  } catch (e) {
    localTags.value.push(tag)
    toast.error(e.messages?.[0] || __('No se pudo quitar'))
  }
}

// ── 💤 snooze/recordar (spec 2.1) ──────────────────────────────────────────────
const isSnoozed = computed(() => {
  const su = row.value.snoozed_until
  return !!su && new Date(String(su).replace(' ', 'T')) > new Date()
})
const showSnoozeDialog = ref(false)
const snoozeCustom = ref('')
const minLocal = computed(() => {
  const d = new Date(Date.now() + 5 * 60000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
})
function _tomorrow9() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return d
}
function _nextMonday9() {
  const d = new Date()
  d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7))
  d.setHours(9, 0, 0, 0)
  return d
}
async function _snooze(untilDate) {
  try {
    // absolute epoch — immune to device-tz vs site-tz drift
    await frappeCall('doco_marketing.api.inbox.snooze_conversation', {
      doctype: activeDealDoctype.value,
      name: activeDeal.value,
      until_epoch: untilDate.getTime(),
    })
    toast.success(__('Pospuesta — reaparece sola con aviso'))
    snoozedCount.fetch()
    reloadQueue()
    if (isMobile.value) mobileBack() // WhatsApp-archive feel: back to the list
  } catch (e) {
    toast.error(e.messages?.[0] || __('No se pudo posponer'))
  }
}
async function _unsnooze() {
  try {
    await frappeCall('doco_marketing.api.inbox.unsnooze_conversation', {
      doctype: activeDealDoctype.value,
      name: activeDeal.value,
    })
    toast.success(__('Conversación reactivada'))
    snoozedCount.fetch()
    reloadQueue()
  } catch (e) {
    toast.error(e.messages?.[0] || __('No se pudo reactivar'))
  }
}
function confirmCustomSnooze() {
  if (!snoozeCustom.value) return
  showSnoozeDialog.value = false
  _snooze(new Date(snoozeCustom.value)) // datetime-local parses in device tz → absolute epoch
}
const snoozeOptions = computed(() => {
  const o = []
  if (isSnoozed.value) o.push({ label: __('Reactivar ahora'), onClick: _unsnooze })
  o.push(
    { label: __('1 hora'), onClick: () => _snooze(new Date(Date.now() + 3600e3)) },
    { label: __('3 horas'), onClick: () => _snooze(new Date(Date.now() + 3 * 3600e3)) },
    { label: __('Mañana 9:00'), onClick: () => _snooze(_tomorrow9()) },
    { label: __('Lunes 9:00'), onClick: () => _snooze(_nextMonday9()) },
    { label: __('Elegir fecha…'), onClick: () => (showSnoozeDialog.value = true) },
  )
  return o
})

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
