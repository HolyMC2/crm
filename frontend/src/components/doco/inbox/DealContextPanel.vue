<!--
  Inbox right pane (320px): quick Acciones + doco Score, then the FULL upstream
  editable deal-field sidebar (SidePanelLayout) so no field is hidden. handoff §5.1.
-->
<template>
  <div class="scb flex w-[320px] flex-none flex-col overflow-y-auto border-l border-outline-gray-1 bg-surface-white">
    <!-- acciones -->
    <div class="flex-none border-b border-outline-gray-1 p-3.5">
      <div class="mb-2.5 text-[11px] font-bold uppercase tracking-[.08em] text-ink-gray-4">{{ __('Acciones') }}</div>
      <button class="w-full rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-white" style="background: #16a34a" @click="call">
        ☎ {{ __('Llamar') }}
      </button>
      <button
        class="mt-2 w-full text-[11px] text-ink-blue-link"
        @click="$router.push(isDeal ? `/deal/${activeDeal}` : `/leads/${activeDeal}`)"
      >
        ⛶ {{ isDeal ? __('Abrir 360°') : __('Abrir Lead') }}
      </button>
    </div>

    <!-- compact contact card (name/phone/email + edit popup) -->
    <ContactCardEditable />

    <!-- deal summary: read-only key facts of the trato -->
    <div v-if="isDeal" class="flex-none border-b border-outline-gray-1 p-3.5">
      <div class="mb-2 text-[11px] font-bold uppercase tracking-[.08em] text-ink-gray-4">{{ __('Resumen del trato') }}</div>
      <div class="flex flex-col gap-1.5 text-[12px]">
        <div class="flex items-center justify-between gap-2">
          <span class="flex-none text-ink-gray-5">{{ __('ID') }}</span>
          <span class="truncate font-mono text-ink-gray-8">{{ dealSummary.id }}</span>
        </div>
        <div class="flex items-center justify-between gap-2">
          <span class="flex-none text-ink-gray-5">{{ __('Estado') }}</span>
          <span class="rounded bg-surface-gray-2 px-1.5 py-px text-[10.5px] font-semibold text-ink-gray-7">{{ dealSummary.status || '—' }}</span>
        </div>
        <div v-if="dealSummary.device" class="flex items-center justify-between gap-2">
          <span class="flex-none text-ink-gray-5">{{ __('Dispositivo') }}</span>
          <span class="truncate text-ink-gray-8">{{ dealSummary.device }}</span>
        </div>
        <div v-if="dealSummary.orders" class="flex items-center justify-between gap-2">
          <span class="flex-none text-ink-gray-5">{{ __('Órdenes de reparación') }}</span>
          <span class="font-semibold text-ink-gray-8">{{ dealSummary.orders }}</span>
        </div>
        <div v-if="dealSummary.value" class="flex items-center justify-between gap-2">
          <span class="flex-none text-ink-gray-5">{{ __('Valor') }}</span>
          <span class="font-semibold text-ink-gray-9">{{ dealSummary.value }}</span>
        </div>
        <div v-if="dealSummary.source" class="flex items-center justify-between gap-2">
          <span class="flex-none text-ink-gray-5">{{ __('Origen') }}</span>
          <span class="truncate text-ink-gray-8">{{ dealSummary.source }}</span>
        </div>
        <div class="flex items-center justify-between gap-2">
          <span class="flex-none text-ink-gray-5">{{ __('Creado') }}</span>
          <span class="text-ink-gray-8">{{ dealSummary.created }}</span>
        </div>
      </div>
    </div>

    <!-- score (doco-specific; not in the upstream sidepanel) -->
    <div v-if="grade" class="flex-none border-b border-outline-gray-1 p-3.5">
      <div class="mb-2.5 text-[11px] font-bold uppercase tracking-[.08em] text-ink-gray-4">{{ __('Score') }} · {{ name }}</div>
      <div class="flex items-center gap-2.5 rounded-[9px] border border-outline-gray-2 bg-surface-gray-2 p-2.5">
        <div class="relative h-11 w-11 flex-none">
          <svg viewBox="0 0 44 44" width="44" height="44" style="transform: rotate(-90deg)">
            <circle cx="22" cy="22" r="18" fill="none" style="stroke: var(--outline-gray-2)" stroke-width="4" />
            <circle cx="22" cy="22" r="18" fill="none" :stroke="gradeColor" stroke-width="4" stroke-linecap="round" stroke-dasharray="113.1" :stroke-dashoffset="dashOffset" />
          </svg>
          <div class="absolute inset-0 flex items-center justify-center text-[12px] font-extrabold" :style="`color:${gradeColor}`">{{ score }}</div>
        </div>
        <div>
          <div class="flex items-center gap-1.5">
            <span class="text-[17px] font-extrabold" :style="`color:${gradeColor}`">{{ grade }}</span>
            <span class="rounded px-1.5 py-px text-[10px] font-semibold text-ink-green-3 bg-surface-green-2">{{ gradeWord }}</span>
          </div>
          <div v-if="probability" class="mt-0.5 text-[10px] text-ink-gray-5">{{ probability }}% {{ __('prob. conversión') }}</div>
        </div>
      </div>
      <div class="mt-2.5 text-[11px]">
        <span class="cursor-pointer text-ink-blue-link" @click="$router.push('/score-rules')">{{ __('Reglas de score') }} →</span>
      </div>
    </div>

    <!-- contacts (upstream SidePanelLayout only renders contacts_section via a
         parent slot, which this panel doesn't pass — render it standalone here
         and drop contacts_section from the field layout below to avoid a blank) -->
    <DealContactsSection v-if="activeDeal && isDeal" :deal="activeDeal" :hide-primary="true" />

    <!-- full editable record fields (upstream — nothing hidden), collapsed by
         default so the panel stays compact; expand for the complete field set -->
    <div v-if="dealSections.length" class="flex-none border-b border-outline-gray-1">
      <button
        class="flex w-full items-center justify-between px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-[.08em] text-ink-gray-4 hover:bg-surface-gray-2"
        @click="showAllFields = !showAllFields"
      >
        {{ __('Todos los campos') }}
        <span class="text-ink-gray-5">{{ showAllFields ? '▾' : '▸' }}</span>
      </button>
      <div v-show="showAllFields">
        <SidePanelLayout
          :key="activeDealDoctype + ':' + activeDeal"
          :sections="dealSections"
          :doctype="activeDealDoctype"
          :docname="activeDeal"
          @reload="sections.reload"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { createResource } from 'frappe-ui'
import { globalStore } from '@/stores/global'
import SidePanelLayout from '@/components/SidePanelLayout.vue'
import DealContactsSection from '@/components/doco/inbox/DealContactsSection.vue'
import ContactCardEditable from '@/components/doco/inbox/ContactCardEditable.vue'
import { activeDeal, activeDealDoctype, queue, GRADE_COLORS } from '@/composables/inbox'

const { makeCall } = globalStore()

const isDeal = computed(() => activeDealDoctype.value === 'CRM Deal')

// effective row: the rich inbox queue row when present; else (Deal 360° / deep link,
// deal not in the queue) a direct deal+lead fetch — same fallback as DealHeader, so
// the Score card + Llamar don't go blank/no-op on /deal/:id.
const queueRow = computed(() => (queue.data || []).find((r) => r.deal === activeDeal.value) || {})
const dealRes = createResource({ url: 'frappe.client.get_value' })
const leadRes = createResource({ url: 'frappe.client.get_value' })
watch(
  activeDeal,
  (d) => {
    if (!d) return
    const isD = activeDealDoctype.value === 'CRM Deal'
    dealRes.submit({
      doctype: activeDealDoctype.value,
      filters: d,
      fieldname: JSON.stringify(
        isD
          ? ['status', 'lead', 'mobile_no', 'first_name', 'lead_name', 'probability', 'creation', 'repair_device', 'repair_orders_count', 'deal_value', 'source']
          : ['status', 'mobile_no', 'first_name', 'last_name', 'lead_name', 'lead_score', 'score_grade'],
      ),
    })
  },
  { immediate: true },
)
watch(
  () => dealRes.data?.lead,
  (lead) => lead && leadRes.submit({ doctype: 'CRM Lead', filters: lead, fieldname: JSON.stringify(['lead_score', 'score_grade', 'lead_name', 'mobile_no']) }),
)
const row = computed(() => {
  if (queueRow.value.deal) return queueRow.value
  const d = dealRes.data || {}
  const l = leadRes.data || {}
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
const score = computed(() => row.value.lead_score ?? 0)
const gradeColor = computed(() => GRADE_COLORS[grade.value]?.[0] || '#9aa2ae')
const gradeWord = computed(() => ({ A: __('Top tier'), B: __('Bueno'), C: __('Medio'), D: __('Bajo') })[grade.value] || '')
const dashOffset = computed(() => (113.1 * (100 - Math.min(100, Number(score.value) || 0))) / 100)

// upstream side-panel field layout (all record fields, editable), per doctype
const sections = createResource({
  url: 'crm.fcrm.doctype.crm_fields_layout.crm_fields_layout.get_sidepanel_sections',
  auto: false,
})
watch(activeDealDoctype, (dt) => dt && sections.submit({ doctype: dt }), { immediate: true })
// contacts_section is rendered by DealContactsSection above (SidePanelLayout would
// show it blank here), so drop it from the field layout to avoid an empty section.
const dealSections = computed(() =>
  (sections.data || []).filter((s) => s.name !== 'contacts_section'),
)

// conversion probability for the Score card (from the deal fetch above)
const probability = computed(() => dealRes.data?.probability)

// ── deal summary (read-only key facts) + collapsible full-field editor ──────────
const showAllFields = ref(false)
function fmtDate(ts) {
  if (!ts) return '—'
  const d = new Date(String(ts).replace(' ', 'T'))
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}
function money(v) {
  const n = Number(v)
  return n ? n.toLocaleString(undefined, { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }) : null
}
const dealSummary = computed(() => {
  const m = dealRes.data || {}
  return {
    id: activeDeal.value,
    status: row.value.status,
    device: m.repair_device || row.value.device,
    orders: m.repair_orders_count,
    value: money(m.deal_value),
    source: m.source,
    created: fmtDate(m.creation),
  }
})

function call() {
  if (row.value.mobile_no) makeCall(row.value.mobile_no)
}
</script>
