<!--
  Inbox right pane (320px): quick Acciones + doco Score, then the FULL upstream
  editable deal-field sidebar (SidePanelLayout) so no field is hidden. handoff §5.1.
-->
<template>
  <div
    class="scb flex flex-col overflow-y-auto bg-surface-white"
    :class="isMobile ? 'min-h-0 w-full flex-1' : 'w-[320px] flex-none border-l border-outline-gray-1'"
  >
    <!-- mobile: back to the conversation thread (← pops the history stack) -->
    <div
      v-if="isMobile"
      class="sticky top-0 z-10 flex flex-none items-center gap-2 border-b border-outline-gray-1 bg-surface-white px-3 py-2.5"
    >
      <button
        class="-ml-1 flex h-8 w-7 flex-none items-center justify-center text-ink-gray-6 hover:text-ink-gray-9"
        :aria-label="__('Volver a la conversación')"
        @click="mobileBack"
      >
        <LucideChevronLeft class="h-6 w-6" />
      </button>
      <span class="truncate text-[14px] font-bold text-ink-gray-9">
        {{ isDeal ? __('Datos del trato') : __('Datos del cliente') }}
      </span>
    </div>

    <!-- ⚠ posible duplicado (spec 4.3, detection-only) -->
    <DuplicateBanner :doctype="activeDealDoctype" :name="activeDeal" @open="onOpenDuplicate" @merged="onMerged" />

    <!-- 🎓 notas de coaching (spec 7.4) — managers only; self-hides for everyone else -->
    <CoachingPanel :doctype="activeDealDoctype" :name="activeDeal" />

    <!-- acciones -->
    <div class="flex-none border-b border-outline-gray-1 p-3.5">
      <div class="mb-2.5 flex items-center justify-between">
        <span class="text-[11px] font-bold uppercase tracking-[.08em] text-ink-gray-4">{{ __('Acciones') }}</span>
        <!-- on the 360° page → jump to the inbox conversation; in the inbox → open 360° -->
        <button
          v-if="onDeal360"
          class="text-[11px] text-ink-blue-link"
          @click="$router.push({ path: '/inbox', query: { deal: activeDeal } })"
        >
          {{ __('Abrir en Bandeja') }} →
        </button>
        <button v-else class="text-[11px] text-ink-blue-link" @click="$router.push(isDeal ? `/deal/${activeDeal}` : `/leads/${activeDeal}`)">
          {{ isDeal ? __('Abrir 360°') : __('Abrir Lead') }} →
        </button>
      </div>
      <button class="w-full rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-white" style="background: var(--brand)" @click="call">
        ☎ {{ __('Llamar') }}
      </button>

      <template v-if="isDeal">
        <!-- inline-editable deal controls -->
        <div class="mt-3 flex flex-col gap-2 text-[12px]">
          <div class="flex items-center justify-between gap-2">
            <span class="flex-none text-ink-gray-5">{{ __('Estado') }}</span>
            <Dropdown :options="statusOpts" placement="right">
              <button class="flex items-center gap-1 rounded bg-surface-gray-2 px-2 py-1 text-[11.5px] font-semibold text-ink-gray-8 hover:bg-surface-gray-3">
                {{ row.status || '—' }} ⌄
              </button>
            </Dropdown>
          </div>
          <div class="flex items-center justify-between gap-2">
            <span class="flex-none text-ink-gray-5">{{ __('Asignado') }}</span>
            <div class="flex items-center gap-1">
              <span v-for="a in assignees" :key="a.name" class="group relative leading-none">
                <Avatar :label="a.label" :image="a.image" size="sm" />
                <button class="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-surface-red-1 text-[8px] leading-none text-ink-red-4 transition-opacity focus:opacity-100 focus-visible:opacity-100" :class="isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'" :title="__('Quitar asignado')" :aria-label="__('Quitar asignado') + ' ' + a.label" @click="removeAssignee(a.name)">×</button>
              </span>
              <Dropdown :options="userOpts" placement="right">
                <button class="rounded bg-surface-gray-2 px-1.5 py-1 text-[11px] text-ink-gray-5 hover:bg-surface-gray-3" :aria-label="__('Asignar usuario')">+</button>
              </Dropdown>
            </div>
          </div>
          <div class="flex items-start justify-between gap-2">
            <span class="flex-none pt-1 text-ink-gray-5">{{ __('Etiquetas') }}</span>
            <div class="flex flex-1 flex-wrap justify-end gap-1">
              <span v-for="t in tags" :key="t" class="inline-flex items-center gap-0.5 rounded bg-surface-blue-1 px-1.5 py-px text-[10.5px] font-medium text-ink-blue-2">
                {{ t }}<button class="text-ink-gray-5 hover:text-ink-red-4" :aria-label="__('Quitar etiqueta') + ' ' + t" @click="removeTag(t)">×</button>
              </span>
              <input
                v-if="addingTag"
                ref="tagInput"
                v-model="newTag"
                class="w-20 rounded border border-outline-gray-2 bg-surface-gray-2 px-1.5 py-px text-[10.5px] text-ink-gray-8 focus:bg-surface-white focus:outline-none focus:ring-0"
                :placeholder="__('etiqueta')"
                @keyup.enter="addTag"
                @blur="addTag"
              />
              <button v-else class="rounded bg-surface-gray-2 px-1.5 py-px text-[10.5px] text-ink-gray-5 hover:bg-surface-gray-3" :aria-label="__('Añadir etiqueta')" @click="startAddTag">+</button>
            </div>
          </div>
        </div>

        <!-- macros rápidas: one-click status flip + open the WhatsApp template to review -->
        <div class="mt-3 border-t border-outline-gray-1 pt-2.5">
          <div class="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-gray-4">{{ __('Macros rápidas') }}</div>
          <div class="flex flex-col gap-1">
            <button class="rounded-md px-2 py-1.5 text-left text-[11.5px] font-medium text-ink-green-3 hover:bg-surface-green-2" @click="macroListo">
              → {{ __('Listo para entregar') }}
            </button>
            <button class="rounded-md px-2 py-1.5 text-left text-[11.5px] font-medium text-ink-gray-7 hover:bg-surface-gray-2" @click="macroCompletado">
              → {{ __('Marcar completado') }}
            </button>
            <button class="rounded-md px-2 py-1.5 text-left text-[11.5px] font-medium text-ink-amber-3 hover:bg-surface-amber-1" @click="macroPago">
              → {{ __('Recordatorio de pago') }}<span v-if="dealSummary.balance" class="text-ink-gray-5"> · {{ dealSummary.balance }}</span>
            </button>
          </div>
        </div>
      </template>
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

    <!-- 💰 Documentos (ERP_INTEGRATION_SPEC P1): the deal's money docs + rollup,
         neutral (doco crm_deal joins) and flag-gated per tenant -->
    <SalesDocsSection v-if="isDeal && salesDocsEnabled && activeDeal" :deal="activeDeal" />

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
        <button type="button" class="text-ink-blue-link hover:underline" @click="$router.push('/score-rules')">{{ __('Reglas de score') }} →</button>
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
        :aria-expanded="showAllFields"
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
import { computed, ref, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { createResource, call as frappeCall, toast, Dropdown, Avatar } from 'frappe-ui'
import { globalStore } from '@/stores/global'
import { statusesStore } from '@/stores/statuses'
import { usersStore } from '@/stores/users'
import { parseAssignees } from '@/utils'
import { guardStatusChange } from '@/utils/statusGuard'
import LucideChevronLeft from '~icons/lucide/chevron-left'
import SidePanelLayout from '@/components/SidePanelLayout.vue'
import DealContactsSection from '@/components/doco/inbox/DealContactsSection.vue'
import ContactCardEditable from '@/components/doco/inbox/ContactCardEditable.vue'
import SalesDocsSection from '@/components/doco/inbox/SalesDocsSection.vue'
import DuplicateBanner from '@/components/doco/inbox/DuplicateBanner.vue'
import CoachingPanel from '@/components/doco/inbox/CoachingPanel.vue'

// ⚠ duplicate banner → jump to the other open record (detect+navigate only)
// NB selectDeal arg order: (name, doctype)
function onOpenDuplicate(doctype, name) {
  selectDeal(name, doctype)
}

// merge landed: the record in view just absorbed the source's history, and the
// retired source must drop out of the queue.
function onMerged() {
  dealRes.reload()
  sections.reload()
  scheduleQueueReload()
}

import { isMobile } from '@/composables/breakpoint'
import { activeDeal, activeDealDoctype, activeTab, convoTemplateOpen, queue, GRADE_COLORS, setStage, setStageSilent, requestStage, mobileBack, hasTaller, salesDocsEnabled, selectDeal, scheduleQueueReload } from '@/composables/inbox'

const { dealStatuses } = statusesStore()
const { crmUsers } = usersStore()

const { makeCall } = globalStore()

const route = useRoute()
// On the standalone Deal 360° page (/deal/:id) the top action opens the inbox
// conversation instead of re-opening 360°.
const onDeal360 = computed(() => /^\/deal\//.test(route.path))

const isDeal = computed(() => activeDealDoctype.value === 'CRM Deal')

// effective row: the rich inbox queue row when present; else (Deal 360° / deep link,
// deal not in the queue) a direct deal+lead fetch — same fallback as DealHeader, so
// the Score card + Llamar don't go blank/no-op on /deal/:id.
const queueRow = computed(() => (queue.data || []).find((r) => r.deal === activeDeal.value) || {})
const dealRes = createResource({ url: 'frappe.client.get_value' })
const leadRes = createResource({ url: 'frappe.client.get_value' })
watch(
  [activeDeal, hasTaller],
  () => {
    const d = activeDeal.value
    if (!d) return
    const isD = activeDealDoctype.value === 'CRM Deal'
    // repair_device / repair_orders_count are taller custom fields — requesting
    // them on a tenant without taller (mumu) is an unknown-column error, so only
    // include them when has_taller. The v-if guards hide the rows when absent.
    const dealFields = ['status', 'lead', 'mobile_no', 'first_name', 'lead_name', 'probability', 'creation', 'deal_value', 'source', '_assign', '_user_tags']
    if (hasTaller.value) dealFields.push('repair_device', 'repair_orders_count')
    dealRes.submit({
      doctype: activeDealDoctype.value,
      filters: d,
      fieldname: JSON.stringify(
        isD ? dealFields : ['status', 'mobile_no', 'first_name', 'last_name', 'lead_name', 'lead_score', 'score_grade'],
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

// "Valor" = total quoted across the deal's Repair Orders (the quote lives on the
// RO, not the deal). Reuses the same taller endpoint the Reparación tab uses; on a
// tenant without taller it errors silently and Valor is just omitted.
const repairOrders = createResource({
  url: 'taller.repair.repair_orders.get_deal_repair_orders',
  onError: () => {},
})
watch(
  [activeDeal, hasTaller],
  () => {
    const d = activeDeal.value
    if (d && isDeal.value && hasTaller.value) repairOrders.submit({ deal_name: d })
    else repairOrders.data = null
  },
  { immediate: true },
)
const dealValue = computed(() =>
  (repairOrders.data || []).reduce(
    (s, ro) => s + (Number(ro.quote_amount) || Number(ro.billing_total) || 0),
    0,
  ) || null,
)
// outstanding saldo (what the customer still owes) — for the payment-reminder macro
const dealBalance = computed(() =>
  (repairOrders.data || []).reduce((s, ro) => s + (Number(ro.balance_due) || 0), 0) || null,
)

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
    value: money(dealValue.value),
    balance: money(dealBalance.value),
    source: m.source,
    created: fmtDate(m.creation),
  }
})

function call() {
  if (row.value.mobile_no) makeCall(row.value.mobile_no)
}

// ── Acciones: inline-editable Estado / Asignado / Etiquetas ─────────────────────
const statusOpts = computed(() =>
  (dealStatuses.data || []).map((s) => ({ label: s.name, onClick: () => changeStatus(s.name, s.type) })),
)
async function changeStatus(status, type) {
  if (!activeDeal.value || status === row.value.status) return
  // A Lost-type status needs a reason captured first (validate_lost_reason on Deal AND
  // Lead); requestStage opens the prompt and commitLostStage writes status + reason together.
  if (type === 'Lost') {
    requestStage(status, type)
    return
  }
  // Completado/Entregado auto-send WhatsApp — explicit confirm first (statusGuard),
  // with the silent escape for stale orders. Resolves 'changed'/'silent'/false so
  // macros can skip their success toast on cancel.
  return guardStatusChange(
    status,
    async () => {
      await setStage(status)
      dealRes.reload()
    },
    {
      onSilent: async () => {
        await setStageSilent(status)
        dealRes.reload()
      },
    },
  )
}

const assignees = computed(() => {
  try {
    return parseAssignees(JSON.parse(dealRes.data?._assign || '[]'))
  } catch {
    return []
  }
})
const userOpts = computed(() =>
  (crmUsers.value || []).map((u) => ({ label: u.full_name || u.name, onClick: () => assignUser(u.name) })),
)
async function assignUser(user) {
  if (assignees.value.some((a) => a.name === user)) return
  await frappeCall('frappe.desk.form.assign_to.add', {
    doctype: activeDealDoctype.value,
    name: activeDeal.value,
    assign_to: [user],
  })
  dealRes.reload()
}
async function removeAssignee(user) {
  await frappeCall('crm.api.doc.remove_assignments', {
    doctype: activeDealDoctype.value,
    name: activeDeal.value,
    assignees: JSON.stringify([user]),
  })
  dealRes.reload()
}

const tags = computed(() =>
  (dealRes.data?._user_tags || '').split(',').map((t) => t.trim()).filter(Boolean),
)
const addingTag = ref(false)
const newTag = ref('')
const tagInput = ref(null)
function startAddTag() {
  addingTag.value = true
  nextTick(() => tagInput.value?.focus())
}
async function addTag() {
  const t = newTag.value.trim()
  newTag.value = ''
  addingTag.value = false
  if (!t || tags.value.includes(t)) return
  await frappeCall('frappe.desk.doctype.tag.tag.add_tag', { tag: t, dt: activeDealDoctype.value, dn: activeDeal.value })
  dealRes.reload()
}
async function removeTag(t) {
  await frappeCall('frappe.desk.doctype.tag.tag.remove_tag', { tag: t, dt: activeDealDoctype.value, dn: activeDeal.value })
  dealRes.reload()
}

// ── Macros rápidas: flip status + open the WhatsApp template to review ───────────
function openTemplate() {
  activeTab.value = 'conversation'
  nextTick(() => {
    convoTemplateOpen.value = true
  })
}
async function macroListo() {
  // The macro hardcodes a status name; if a tenant renamed/didn't seed it, set_value
  // rejects — surface that instead of an unhandled throw + a false success toast.
  try {
    await changeStatus('Por Entregar')
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo cambiar a "Por Entregar" — ¿existe ese estado?'))
    return
  }
  openTemplate()
  toast.success(__('Estado → Por Entregar. Revisa y envía la plantilla.'))
}
async function macroCompletado() {
  let confirmed
  try {
    confirmed = await changeStatus('Completado')
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo marcar como completado — ¿existe el estado "Completado"?'))
    return
  }
  if (confirmed === false) return // user cancelled the WhatsApp-send guard
  toast.success(__('Trato marcado como completado.'))
}
function macroPago() {
  openTemplate()
  toast.info(__('Elige la plantilla de recordatorio de pago.'))
}
</script>
