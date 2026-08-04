<template>
  <div class="mt-6 border-t pt-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-3">
      <span class="text-base-semibold text-ink-gray-8">
        {{ __('Repair Orders') }}
        <span
          v-if="repairOrders.data?.length"
          class="ml-1.5 text-xs text-ink-gray-5"
        >
          ({{ repairOrders.data.length }})
        </span>
      </span>
      <Button
        size="sm"
        variant="subtle"
        :icon="showForm ? 'x' : 'plus'"
        :tooltip="showForm ? __('Cancel') : __('Add Repair Order')"
        @click="toggleForm"
      />
    </div>

    <!-- Inline add form -->
    <div v-if="showForm" class="mb-4 rounded-lg border bg-surface-gray-1 p-4">
      <RepairOrderInlineForm v-model="newRepair" />
      <div class="mt-3 flex justify-end gap-2">
        <Button :label="__('Cancel')" @click="toggleForm" />
        <Button
          :label="__('Create')"
          variant="solid"
          :loading="creating"
          :disabled="!newRepair.device_model"
          @click="createRepairOrder"
        />
      </div>
      <ErrorMessage v-if="createError" class="mt-2" :message="createError" />
    </div>

    <!-- Loading -->
    <div v-if="repairOrders.loading" class="py-3 text-sm text-ink-gray-5">
      {{ __('Loading...') }}
    </div>

    <!-- Empty state -->
    <div
      v-else-if="!repairOrders.data?.length"
      class="py-2 text-sm text-ink-gray-5"
    >
      {{ __('No repair orders linked to this deal.') }}
    </div>

    <!-- Repair order cards -->
    <div v-else class="space-y-3">
      <div
        v-for="ro in repairOrders.data"
        :key="ro.name"
        class="overflow-hidden rounded-xl border bg-surface-base shadow-sm"
      >
        <!-- Card header -->
        <div class="flex items-center justify-between border-b bg-surface-gray-1 px-4 py-2.5">
          <!-- link to the TALLER SPA order page (operators use that, not the Desk doctype) -->
          <a
            :href="`/taller/orders/${encodeURIComponent(ro.name)}`"
            target="_blank"
            class="text-sm-semibold text-ink-blue-6 hover:underline"
          >
            {{ ro.name }}
          </a>
          <div class="flex items-center gap-1.5">
            <!-- Purchase-side ETA (ERP spec P3): what «Esperando Pieza» is waiting ON -->
            <span
              v-if="waitingPo(ro)"
              class="rounded bg-surface-amber-1 px-1.5 py-px text-[10.5px] font-semibold text-ink-amber-6"
              :title="__('Pieza en camino — Purchase Order vinculado')"
            >
              🧩 {{ waitingPo(ro).purchase_order }}<template v-if="waitingPo(ro).po_expected_date"> · {{ __('llega') }} {{ waitingPo(ro).po_expected_date }}</template>
            </span>
            <Badge :label="__(ro.status)" :theme="statusTheme(ro.status)" />
            <Dropdown :options="draftOptions(ro.name)">
              <Button
                size="sm"
                variant="subtle"
                :label="creatingFor === ro.name ? __('Creando…') : __('Crear borrador')"
                :loading="creatingFor === ro.name"
              />
            </Dropdown>
            <Button
              size="sm"
              variant="subtle"
              icon="send"
              :tooltip="__('Revisar y enviar al cliente')"
              @click="openSend(ro)"
            />
            <button
              :title="__('Print Ticket')"
              class="rounded p-1 text-ink-gray-5 hover:bg-surface-gray-3 hover:text-ink-gray-8"
              @click="printTicket(ro.name)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Card body — vertical stack, one field per row -->
        <div class="divide-y text-sm">

          <!-- Photo strip (low-res thumbnails; click opens full-res) -->
          <div v-if="ro.photos?.length" class="px-4 py-3">
            <div class="mb-1.5 text-xs uppercase tracking-wide text-ink-gray-5">
              {{ __('Fotos') }} <span class="text-ink-gray-4">({{ ro.photos.length }})</span>
            </div>
            <div class="flex gap-2 overflow-x-auto pb-1">
              <button
                v-for="ph in ro.photos"
                :key="ph.name"
                class="relative h-16 w-16 flex-none overflow-hidden rounded-lg border bg-surface-gray-2 hover:ring-2 hover:ring-outline-gray-3"
                :title="ph.photo_type || __('Foto')"
                @click="openPhoto(ph)"
              >
                <img :src="ph.thumbnail_url" class="h-full w-full object-cover" loading="lazy" />
                <span
                  v-if="ph.show_on_tracker"
                  class="absolute right-0.5 top-0.5 rounded bg-surface-green-3 px-1 text-[8px] font-bold text-ink-base"
                  :title="__('Visible en el tracker del cliente')"
                >T</span>
              </button>
            </div>
          </div>

          <!-- Primary: device + repair type + client + technician -->
          <div class="px-4 py-3 space-y-2">
            <Row :label="__('Device Model')" :value="ro.device_model" />
            <Row :label="__('Repair Type')" :value="ro.repair_to_be_done" />
            <Row
              :label="__('Falla reportada')"
              :value="ro.falla_reportada"
              :preWrap="true"
              :emphasize="!ro.falla_reportada"
            />
            <Row :label="__('Client')" :value="ro.client_name || ro.client" />
            <Row :label="__('Device Condition')" :value="ro.general_status && __(ro.general_status)" />
            <Row :label="__('Technician')" :value="ro.technician_name || ro.technician" />
            <Row v-if="ro.received_by_name || ro.received_by"
                 :label="__('Received by')"
                 :value="ro.received_by_name || ro.received_by" />
            <Row v-if="ro.delivered_by_name || ro.delivered_by"
                 :label="__('Delivered by')"
                 :value="ro.delivered_by_name || ro.delivered_by" />
            <Row v-if="ro.laboratorio" :label="__('Laboratorio')" :value="ro.laboratorio" />
          </div>

          <!-- Device state pills -->
          <div class="px-4 py-3">
            <div class="mb-1.5 text-xs uppercase tracking-wide text-ink-gray-5">{{ __('Device State') }}</div>
            <div class="flex flex-wrap gap-1.5">
              <span
                class="inline-flex items-center rounded-full px-2 py-0.5 text-xs-medium"
                :class="ro.turns_on ? 'bg-surface-green-2 text-ink-green-6' : 'bg-surface-red-1 text-ink-red-8'"
              >
                {{ ro.turns_on ? __('Turns on ✓') : __('Does not turn on ✗') }}
              </span>
              <span
                class="inline-flex items-center rounded-full px-2 py-0.5 text-xs-medium"
                :class="ro.has_sim_tray ? 'bg-surface-green-2 text-ink-green-6' : 'bg-surface-gray-2 text-ink-gray-5'"
              >
                {{ ro.has_sim_tray ? __('SIM tray ✓') : __('No SIM tray') }}
              </span>
              <span
                v-if="ro.has_phone_case"
                class="inline-flex items-center rounded-full bg-surface-blue-1 px-2 py-0.5 text-xs-medium text-ink-blue-5"
              >
                {{ __('Case ✓') }}
              </span>
              <span
                v-if="ro.broken_screen"
                class="inline-flex items-center rounded-full bg-surface-amber-1 px-2 py-0.5 text-xs-medium text-ink-amber-6"
              >
                {{ __('Broken screen ⚠') }}
              </span>
              <span
                v-if="ro.is_wet"
                class="inline-flex items-center rounded-full bg-surface-amber-1 px-2 py-0.5 text-xs-medium text-ink-amber-6"
              >
                {{ __('Wet ⚠') }}
              </span>
              <span
                v-if="ro.is_warranty_claim"
                class="inline-flex items-center rounded-full bg-surface-violet-1 px-2 py-0.5 text-xs-medium text-ink-violet-1"
              >
                {{ __('Warranty claim') }}
              </span>
            </div>
          </div>

          <!-- Security: phone PIN / pattern (sensitive) -->
          <div v-if="ro.phone_pin || ro.phone_pattern" class="px-4 py-3">
            <div class="mb-1.5 text-xs uppercase tracking-wide text-ink-gray-5">{{ __('Security') }}</div>
            <div class="flex flex-wrap gap-3 font-mono text-xs">
              <span v-if="ro.phone_pin">
                <span class="text-ink-gray-5">{{ __('PIN') }}:</span>
                <code class="ml-1 rounded bg-surface-gray-2 px-1.5 py-0.5 text-ink-gray-8">{{ ro.phone_pin }}</code>
              </span>
              <span v-if="ro.phone_pattern">
                <span class="text-ink-gray-5">{{ __('Pattern') }}:</span>
                <code class="ml-1 rounded bg-surface-gray-2 px-1.5 py-0.5 text-ink-gray-8">{{ ro.phone_pattern }}</code>
              </span>
            </div>
          </div>

          <!-- IMEI / serial numbers -->
          <div v-if="ro.serial_numbers?.length" class="px-4 py-3">
            <div class="mb-1.5 text-xs uppercase tracking-wide text-ink-gray-5">{{ __('IMEI / Serial') }}</div>
            <div class="flex flex-wrap gap-1.5">
              <code
                v-for="sn in ro.serial_numbers"
                :key="sn.serial_no"
                class="rounded bg-surface-gray-2 px-1.5 py-0.5 font-mono text-xs text-ink-gray-7"
              >
                {{ sn.identifier_type }}: {{ sn.serial_no }}
              </code>
            </div>
          </div>

          <!-- Financials (always shown — operators see cotización/anticipo at a glance) -->
          <div class="px-4 py-3 space-y-2">
            <div class="mb-0.5 text-xs uppercase tracking-wide text-ink-gray-5">{{ __('Financials') }}</div>
            <Row :label="__('Cotización')" :value="money(ro.quote_amount) || __('—')" />
            <Row :label="__('Anticipo')" :value="money(ro.advance_amount) || __('—')" />
            <Row :label="__('Saldo')" :value="money(ro.balance_due) || __('—')" :emphasize="(ro.balance_due || 0) > 0" />
            <Row :label="__('Mano de obra')" :value="money(ro.labor_charge) || __('—')" />
            <Row :label="__('Total facturable')" :value="money(ro.billing_total) || __('—')" />
          </div>

          <!-- Refacciones (always shown — empty state makes missing parts visible) -->
          <div class="px-4 py-3">
            <div class="mb-1.5 text-xs uppercase tracking-wide text-ink-gray-5">
              {{ __('Refacciones') }}
              <span v-if="ro.parts?.length" class="text-ink-gray-4">({{ ro.parts.length }})</span>
            </div>
            <div v-if="!ro.parts?.length" class="text-xs text-ink-gray-5">
              {{ __('Sin refacciones cargadas.') }}
            </div>
            <div v-else class="space-y-1.5">
              <div
                v-for="(p, i) in ro.parts"
                :key="`${ro.name}-part-${i}`"
                class="flex items-center justify-between rounded border bg-surface-base px-2 py-1.5 text-xs"
              >
                <div class="min-w-0 truncate">
                  <span class="font-medium text-ink-gray-8">{{ p.item_name || p.item || '—' }}</span>
                  <span v-if="p.source" class="ml-1.5 text-ink-gray-5">[{{ __(p.source) }}]</span>
                  <span
                    v-if="p.purchase_order && p.po_status"
                    class="ml-1.5 rounded bg-surface-amber-1 px-1 py-px text-[10px] font-semibold text-ink-amber-6"
                    :title="`${p.purchase_order} · ${p.po_status}`"
                  >
                    🧩 {{ p.po_expected_date ? __('llega') + ' ' + p.po_expected_date : p.purchase_order }}
                  </span>
                </div>
                <div class="ml-2 whitespace-nowrap font-mono text-ink-gray-7">
                  {{ p.qty || 0 }}{{ p.uom ? ' ' + p.uom : '' }}
                  <span v-if="p.customer_charge != null" class="ml-2 text-ink-gray-5">
                    · {{ money(p.customer_charge) }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Repair log (recent entries, newest first) -->
          <div class="px-4 py-3">
            <div class="mb-1.5 text-xs uppercase tracking-wide text-ink-gray-5">
              {{ __('Repair Log') }}
              <span v-if="ro.repair_log?.length" class="text-ink-gray-4">({{ ro.repair_log.length }})</span>
            </div>
            <div v-if="!ro.repair_log?.length" class="text-xs text-ink-gray-5">
              {{ __('Sin entradas de log.') }}
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="e in ro.repair_log"
                :key="e.name"
                class="rounded border bg-surface-base px-2 py-1.5"
              >
                <div class="flex items-center justify-between gap-2 text-xs">
                  <div class="flex items-center gap-1.5">
                    <Badge v-if="e.step_type" size="sm" :label="__(e.step_type)" theme="gray" />
                    <Badge v-if="e.outcome" size="sm" :label="__(e.outcome)"
                           :theme="e.outcome === 'OK' ? 'green' : e.outcome === 'KO' ? 'red' : 'gray'" />
                    <span class="text-ink-gray-7">{{ e.technician_name || e.technician || '—' }}</span>
                  </div>
                  <span class="text-ink-gray-5">{{ formatDate(e.entry_datetime) }}</span>
                </div>
                <div v-if="e.description" class="mt-1 whitespace-pre-wrap text-xs text-ink-gray-8">
                  {{ e.description }}
                </div>
                <div v-if="e.resolution" class="mt-1 whitespace-pre-wrap text-xs text-ink-gray-7">
                  <span class="text-ink-gray-5">{{ __('Resolución') }}:</span> {{ e.resolution }}
                </div>
              </div>
            </div>
          </div>

          <!-- Warranty -->
          <div v-if="ro.warranty_expires_on || ro.warranty_period_days" class="px-4 py-3 space-y-2">
            <div class="mb-0.5 text-xs uppercase tracking-wide text-ink-gray-5">{{ __('Warranty') }}</div>
            <Row v-if="ro.warranty_period_days" :label="__('Period (days)')" :value="ro.warranty_period_days" />
            <Row v-if="ro.warranty_expires_on" :label="__('Expires on')" :value="ro.warranty_expires_on" />
          </div>

          <!-- Deal status echo -->
          <div v-if="ro.deal_status" class="px-4 py-3">
            <Row :label="__('Deal status')" :value="ro.deal_status" />
          </div>

          <!-- Last communication mirror -->
          <div v-if="ro.last_communication" class="px-4 py-3">
            <div class="mb-1.5 flex items-center gap-2">
              <div class="text-xs uppercase tracking-wide text-ink-gray-5">{{ __('Last communication') }}</div>
              <Badge
                v-if="ro.communication_status"
                size="sm"
                :label="__(ro.communication_status)"
                :theme="ro.communication_status === 'Open' ? 'orange' : 'green'"
              />
            </div>
            <div class="text-sm text-ink-gray-8 whitespace-pre-wrap">{{ ro.last_communication }}</div>
            <div class="mt-1 text-xs text-ink-gray-5">
              {{ ro.last_communication_sender || __('Unknown') }}
              <span v-if="ro.last_communication_date">
                · {{ formatDate(ro.last_communication_date) }}
              </span>
            </div>
          </div>

          <!-- Documentos financieros (always shown — empty state makes gaps obvious) -->
          <div class="px-4 py-3">
            <div class="mb-1.5 text-xs uppercase tracking-wide text-ink-gray-5">{{ __('Documentos financieros') }}</div>
            <div
              v-if="!ro.quotation && !ro.sales_order && !ro.invoices?.length"
              class="text-xs text-ink-gray-5"
            >
              {{ __('Sin documentos vinculados.') }}
            </div>
            <div v-else class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <a
                v-if="ro.quotation"
                :href="`/app/quotation/${encodeURIComponent(ro.quotation)}`"
                target="_blank"
                class="text-ink-blue-6 hover:underline"
              >
                {{ __('Cotización') }}: {{ ro.quotation }}
              </a>
              <a
                v-if="ro.sales_order"
                :href="`/app/sales-order/${encodeURIComponent(ro.sales_order)}`"
                target="_blank"
                class="text-ink-blue-6 hover:underline"
              >
                {{ __('SO') }}: {{ ro.sales_order }}
              </a>
              <a
                v-for="inv in (ro.invoices || [])"
                :key="`${inv.invoice_type}-${inv.invoice}`"
                :href="`/app/${inv.invoice_type === 'POS Invoice' ? 'pos-invoice' : 'sales-invoice'}/${encodeURIComponent(inv.invoice)}`"
                target="_blank"
                class="text-ink-blue-6 hover:underline"
              >
                {{ inv.invoice_type === 'POS Invoice' ? __('POS') : __('Factura') }}: {{ inv.invoice }}
              </a>
            </div>
          </div>

        </div>
      </div>
    </div>

    <RepairSendModal
      v-model="sendModalOpen"
      :ro="sendRo"
      :deal-email="contactCard.data?.email || ''"
      :deal-mobile="contactCard.data?.mobile_no || ''"
    />
  </div>
</template>

<script setup>
import RepairOrderInlineForm from '@/components/Modals/RepairOrderInlineForm.vue'
import RepairSendModal from '@/components/doco/RepairSendModal.vue'
import { Badge, Button, Dropdown, ErrorMessage, createResource } from 'frappe-ui'
import { contactCard } from '@/composables/inbox'
import { h, ref } from 'vue'

// Small inline helper for a label/value row. Stacked vertical layout —
// label on top, value below, both full-width.
const Row = (props) =>
  h('div', null, [
    h('div', { class: 'text-xs text-ink-gray-5' }, props.label),
    h(
      'div',
      {
        class: [
          'mt-0.5 font-medium',
          props.preWrap ? 'whitespace-pre-wrap' : '',
          props.emphasize ? 'text-ink-red-8' : 'text-ink-gray-8',
        ],
      },
      props.value === undefined || props.value === null || props.value === ''
        ? '—'
        : String(props.value),
    ),
  ])

function money(v) {
  if (v == null) return null
  const n = Number(v)
  if (!Number.isFinite(n) || n === 0) return null
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: window.frappe?.boot?.sysdefaults?.currency || 'MXN',
    }).format(n)
  } catch {
    return n.toFixed(2)
  }
}

function formatDate(s) {
  if (!s) return ''
  const d = new Date(s.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString()
}

const props = defineProps({
  docname: { type: String, required: true },
})

const showForm = ref(false)
const creating = ref(false)
const createError = ref(null)

// Full canonical RO intake shape — mirrors DealModal's `newRepairOrder` ref
// and RepairOrderInlineForm's v-model contract (1:1 with the Intake SPA).
const emptyRepair = () => ({
  device_model: null,
  repair_to_be_done: null,
  falla_reportada: '',
  general_status: '',
  client: null,
  technician: null,
  imei: null,
  has_sim_tray: false,
  is_wet: false,
  turns_on: false,
  broken_screen: false,
  has_phone_case: false,
  unlock_method: 'none',
  phone_pin: '',
  phone_pattern: '',
  quote_amount: 0,
  advance_amount: 0,
})

const newRepair = ref(emptyRepair())

const repairOrders = createResource({
  url: 'taller.repair.repair_orders.get_deal_repair_orders',
  params: { deal_name: props.docname },
  auto: true,
})

function toggleForm() {
  showForm.value = !showForm.value
  if (!showForm.value) {
    newRepair.value = emptyRepair()
    createError.value = null
  }
}

function createRepairOrder() {
  const rd = newRepair.value
  // Link controls may emit either a bare string or a { value } object.
  const getVal = (v) => (v && typeof v === 'object' ? v.value : v)

  const deviceModelVal = getVal(rd.device_model)
  if (!deviceModelVal) {
    createError.value = __('Device Model is required')
    return
  }
  // Falla reportada is mandatory server-side (create_and_link_repair_order
  // throws if blank) — block here so the user gets a clean message.
  const falla = (rd.falla_reportada || '').trim()
  if (!falla) {
    createError.value = __('Falla reportada is required when creating a Repair Order.')
    return
  }

  creating.value = true
  createError.value = null
  const unlock = rd.unlock_method
  createResource({
    url: 'taller.repair.repair_orders.create_and_link_repair_order',
    params: {
      deal_name: props.docname,
      device_model: deviceModelVal,
      repair_to_be_done: getVal(rd.repair_to_be_done) || null,
      falla_reportada: falla,
      general_status: rd.general_status || null,
      client: getVal(rd.client) || null,
      technician: getVal(rd.technician) || null,
      imei: getVal(rd.imei) || null,
      has_sim_tray: rd.has_sim_tray ? 1 : 0,
      is_wet: rd.is_wet ? 1 : 0,
      turns_on: rd.turns_on ? 1 : 0,
      broken_screen: rd.broken_screen ? 1 : 0,
      has_phone_case: rd.has_phone_case ? 1 : 0,
      phone_pin: unlock === 'pin' ? (rd.phone_pin || '') : '',
      phone_pattern: unlock === 'pattern' ? (rd.phone_pattern || '') : '',
      quote_amount: Number(rd.quote_amount) || 0,
      advance_amount: Number(rd.advance_amount) || 0,
    },
    auto: true,
    onSuccess() {
      creating.value = false
      showForm.value = false
      newRepair.value = emptyRepair()
      repairOrders.reload()
    },
    onError(err) {
      creating.value = false
      createError.value = err.messages?.join('\n') || err.message
    },
  })
}

const STATUS_THEMES = {
  'Entregado': 'green',
  'Listo para Entregar': 'green',
  'En Reparación': 'blue',
  'Control de Calidad': 'blue',
  'En Diagnóstico': 'orange',
  'Esperando Aprobación': 'yellow',
  'En Espera de Pieza': 'purple',
  'Esperando Pieza': 'purple',
  'Esperando Cliente': 'yellow',
  'Por Revisar': 'gray',
  'Cancelado': 'red',
}

function statusTheme(status) {
  return STATUS_THEMES[status] || 'gray'
}

// Purchase-side ETA (ERP spec P3): the first PO-linked part of a waiting order —
// feeds the header chip. po_status is merged ONLY when the tenant flag is on,
// and it's the render key — so a flag-off tenant shows nothing even if part
// rows carry stray purchase_order values.
function waitingPo(ro) {
  if (ro.status !== 'Esperando Pieza') return null
  return (ro.parts || []).find((p) => p.purchase_order && p.po_status) || null
}

// Open a photo full-res. Local files serve directly; S3-backed originals need a
// short-lived signed URL (thumbnails are always local, served direct).
function openPhoto(ph) {
  if (ph.storage_backend === 'S3' && ph.file_name) {
    createResource({
      url: 'taller.file_storage.get_signed_url',
      params: { file_name: ph.file_name },
      auto: true,
      onSuccess(data) {
        window.open((typeof data === 'string' ? data : data?.url) || ph.image, '_blank')
      },
      onError() {
        window.open(ph.image || ph.thumbnail_url, '_blank')
      },
    })
  } else {
    window.open(ph.image || ph.thumbnail_url, '_blank')
  }
}

// ── "Revisar y enviar" modal: select photos + log entries, review, then send ────
const sendModalOpen = ref(false)
const sendRo = ref(null)
function openSend(ro) {
  sendRo.value = ro
  sendModalOpen.value = true
}

function printTicket(roName) {
  createResource({
    url: 'taller.repair.repair_orders.get_repair_ticket_print_url',
    params: { name: roName },
    auto: true,
    onSuccess(data) {
      const params = new URLSearchParams({
        doctype: 'Repair Order',
        name: roName,
        format: data.format,
        trigger_print: '1',
        simplified: '1',
      })
      if (data.letterhead) params.set('letterhead', data.letterhead)
      window.open('/printview?' + params.toString(), '_blank', 'width=400,height=600')
    },
    onError(err) {
      const msg = err?.messages?.join('\n') || err?.message || 'Print failed'
      alert(__('Print failed: ') + msg)
    },
  })
}

// Mirror taller BillingPanel "Crear borrador" — single picker over the
// unified create_billing_doc factory. Idempotent server-side: returns the
// existing draft if one is already linked to the RO.
const creatingFor = ref(null)
const DRAFT_DOCTYPES = [
  { label: '🧾 Sales Invoice', value: 'Sales Invoice' },
  { label: '💳 POS Invoice', value: 'POS Invoice' },
  { label: '💵 Cotización', value: 'Quotation' },
  { label: '📦 Sales Order', value: 'Sales Order' },
]

function draftOptions(roName) {
  return DRAFT_DOCTYPES.map((d) => ({
    label: __(d.label),
    onClick: () => createBillingDraft(roName, d.value),
  }))
}

function createBillingDraft(roName, doctype) {
  creatingFor.value = roName
  createResource({
    url: 'taller.api.billing.create_billing_doc',
    params: { ro_name: roName, doctype },
    auto: true,
    onSuccess(data) {
      creatingFor.value = null
      const verb = data.created ? __('drafted') : __('already exists')
      alert(`${doctype} ${data.name} — ${verb}.`)
      repairOrders.reload()
    },
    onError(err) {
      creatingFor.value = null
      const msg = err?.messages?.join('\n') || err?.message || 'Draft failed'
      alert(__('Draft failed: ') + msg)
    },
  })
}
</script>
