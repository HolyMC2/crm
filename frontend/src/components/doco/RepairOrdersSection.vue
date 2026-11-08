<template>
  <!-- The deal's repair orders as a seller reads them while talking to the
       customer: what the device is, where it stands and what comes next, the
       money, the technician's photos (sent to the chat from here), the latest
       progress. Reception and billing detail fold under «Más detalles»;
       Taller stays the place to work the order. -->
  <section :class="chat ? '' : 'mt-6 border-t pt-6'">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h3 class="text-base font-semibold text-ink-gray-9">
        {{ __('Reparaciones') }}
        <span
          v-if="orders.length"
          class="num ml-1 text-sm font-normal text-ink-gray-5"
          >{{ orders.length }}</span
        >
      </h3>
      <!-- Intake belongs to taller: same tab, Back and «Volver al trato» return here. -->
      <a
        v-if="intakeHref"
        :href="intakeHref"
        class="press inline-flex min-h-9 items-center gap-1.5 rounded-full bg-surface-gray-2 px-3 text-sm font-medium text-ink-gray-9 hover:bg-surface-gray-3"
        >{{ __('Nueva reparación') }}</a
      >
    </div>

    <p
      v-if="hasTaller && state.context && !state.context.can_create"
      class="mb-3 text-sm text-ink-gray-6"
    >
      {{
        state.context.create_blocked_reason ||
        __('No tienes permiso para crear una reparación desde este trato.')
      }}
    </p>
    <div
      v-if="state.loading && !state.context"
      role="status"
      class="py-3 text-sm text-ink-gray-5"
    >
      {{ __('Cargando reparaciones…') }}
    </div>
    <div
      v-else-if="state.loadError"
      role="alert"
      class="space-y-2 py-3 text-sm text-ink-red-7"
    >
      <p>
        {{ __('No se pudieron cargar las reparaciones.') }}
        {{ state.loadError }}
      </p>
      <Button :label="__('Reintentar consulta')" @click="refresh()" />
    </div>
    <p
      v-else-if="!orders.length"
      class="rounded-6 border border-dashed border-outline-gray-3 p-4 text-sm text-ink-gray-5"
    >
      {{
        __(
          'Este trato aún no tiene órdenes de reparación. Recibe el equipo con «Nueva reparación».',
        )
      }}
    </p>

    <div v-else class="space-y-4">
      <article
        v-for="ro in orders"
        :key="ro.name"
        class="overflow-hidden rounded-7 border border-outline-gray-2 bg-surface-base"
        :data-order="ro.name"
      >
        <div class="px-4 pt-4">
          <div class="flex items-start gap-3">
            <!-- the TALLER SPA order page (operators use that, not the Desk doctype) -->
            <a
              :href="orderHref(ro.name)"
              class="title-face min-w-0 flex-1 break-words text-lg font-semibold leading-snug text-ink-gray-9 hover:underline"
              >{{ ro.device_model || __('Equipo sin modelo') }}</a
            >
            <StatusChip
              :label="ro.status ? __(ro.status) : __('Sin estado')"
              :tone="repairTone(ro.status)"
            />
          </div>
          <p class="mt-0.5 text-sm text-ink-gray-6">
            {{ ro.repair_to_be_done || __('Servicio por definir') }}
          </p>
          <p class="mt-0.5 text-xs text-ink-gray-5">
            {{ __('Folio') }} {{ ro.name }}
          </p>
        </div>

        <p
          v-if="nextStep(ro)"
          class="mx-4 mt-3 rounded-6 bg-surface-gray-1 px-3 py-2 text-sm text-ink-gray-8"
          data-next-step
        >
          {{ nextStep(ro) }}
        </p>
        <p
          v-if="promise(ro)"
          class="mx-4 mt-2 text-sm text-ink-gray-7"
          data-promise
        >
          {{ __('Prometido para') }}
          <span
            :class="
              promise(ro).overdue ? 'font-medium text-ink-red-7' : 'font-medium'
            "
            >{{ promise(ro).label }}</span
          >
        </p>

        <!-- Receipt rows: an amount never truncates, whatever the width. -->
        <dl
          class="mx-4 mt-3 max-w-md divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-1 text-sm"
        >
          <div class="flex items-baseline justify-between gap-3 px-3 py-2">
            <dt class="min-w-0 text-ink-gray-6">
              {{ __('Cotización') }}
              <span
                v-if="decision(ro)"
                class="ml-1 text-xs"
                :class="decision(ro).class"
                >{{ decision(ro).label }}</span
              >
            </dt>
            <dd class="num whitespace-nowrap font-semibold text-ink-gray-9">
              {{ money(ro.quote_amount, ro.currency) }}
            </dd>
          </div>
          <div class="flex items-baseline justify-between gap-3 px-3 py-2">
            <dt class="min-w-0 text-ink-gray-6">{{ __('Anticipo') }}</dt>
            <dd class="num whitespace-nowrap font-semibold text-ink-gray-9">
              {{ money(ro.advance_amount, ro.currency) }}
            </dd>
          </div>
          <div class="flex items-baseline justify-between gap-3 px-3 py-2">
            <dt class="min-w-0 text-ink-gray-6">{{ __('Saldo') }}</dt>
            <dd
              class="num whitespace-nowrap font-semibold"
              :class="
                owedAfterDelivery(ro) ? 'text-ink-red-7' : 'text-ink-gray-9'
              "
            >
              {{ money(ro.balance_due, ro.currency) }}
            </dd>
          </div>
        </dl>

        <template v-if="isOpen(ro)">
          <div class="mt-4 px-4" data-photos>
            <div class="mb-2 flex min-h-9 items-center justify-between gap-2">
              <h4 class="text-sm font-medium text-ink-gray-7">
                {{ __('Fotos del taller') }}
                <span v-if="photoTotal(ro)" class="num text-ink-gray-5">{{
                  photoTotal(ro)
                }}</span>
              </h4>
              <button
                v-if="chat && ro.photos?.length"
                type="button"
                class="press inline-flex min-h-9 items-center gap-1.5 rounded-full bg-surface-gray-2 px-3 text-sm font-medium text-ink-gray-9 hover:bg-surface-gray-3"
                @click="sendToChat(ro)"
              >
                <span class="lucide-send size-3.5" aria-hidden="true" />
                {{ __('Enviar al chat') }}
              </button>
            </div>
            <div
              v-if="ro.photos?.length"
              class="flex gap-2 overflow-x-auto pb-1"
            >
              <button
                v-for="ph in ro.photos"
                :key="ph.name"
                type="button"
                class="press relative size-20 flex-none overflow-hidden rounded-6 bg-surface-gray-2"
                :title="ph.photo_type ? __(ph.photo_type) : __('Foto')"
                :aria-label="__('Ver foto')"
                @click="openPhoto(ph)"
              >
                <img
                  :src="ph.thumbnail_url || ph.image"
                  :alt="ph.photo_type ? __(ph.photo_type) : __('Foto')"
                  class="size-full object-cover"
                  loading="lazy"
                />
                <span
                  v-if="ph.show_on_tracker"
                  class="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/45 text-white"
                  :title="__('Visible para el cliente en el seguimiento')"
                >
                  <span class="lucide-eye size-3" aria-hidden="true" />
                </span>
              </button>
              <template v-if="photoTotal(ro) > ro.photos.length">
                <button
                  v-if="chat"
                  type="button"
                  :class="moreClass"
                  :aria-label="__('Ver todas las fotos')"
                  @click="sendToChat(ro)"
                >
                  +{{ photoTotal(ro) - ro.photos.length }}
                </button>
                <a
                  v-else
                  :href="orderHref(ro.name)"
                  :class="moreClass"
                  :aria-label="__('Ver todas las fotos')"
                  >+{{ photoTotal(ro) - ro.photos.length }}</a
                >
              </template>
            </div>
            <p v-else class="text-sm text-ink-gray-5">
              {{ __('Sin fotos todavía. El técnico las sube en Taller.') }}
            </p>
          </div>

          <div class="mt-4 space-y-3 px-4">
            <Fact
              :label="__('Falla reportada')"
              :text="ro.falla_reportada || __('Sin falla capturada')"
              :muted="!ro.falla_reportada"
            />
            <Fact
              v-if="ro.diagnosis_summary"
              :label="__('Diagnóstico')"
              :text="ro.diagnosis_summary"
            />
            <Fact
              v-if="ro.work_performed"
              :label="__('Trabajo realizado')"
              :text="ro.work_performed"
            />
          </div>

          <div v-if="ro.repair_log?.length" class="mt-4 px-4" data-log>
            <h4 class="mb-1.5 text-sm font-medium text-ink-gray-7">
              {{ __('Último avance') }}
            </h4>
            <ul class="space-y-2">
              <li
                v-for="e in logShown(ro)"
                :key="e.name"
                class="rounded-6 border border-outline-gray-1 px-3 py-2"
              >
                <div
                  class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-gray-6"
                >
                  <span class="font-medium text-ink-gray-8">{{
                    e.technician_name || __('Taller')
                  }}</span>
                  <span v-if="e.step_type">{{ __(e.step_type) }}</span>
                  <StatusChip
                    v-if="e.outcome"
                    :label="__(e.outcome)"
                    :tone="e.outcome === 'KO' ? 'warning' : 'neutral'"
                  />
                  <span class="ml-auto">{{
                    relativeTime(e.entry_datetime)
                  }}</span>
                </div>
                <p
                  v-if="e.description"
                  class="mt-1 whitespace-pre-wrap text-sm text-ink-gray-8"
                >
                  {{ e.description }}
                </p>
                <p
                  v-if="e.resolution"
                  class="mt-1 whitespace-pre-wrap text-sm text-ink-gray-7"
                >
                  {{ __('Resolución') }}: {{ e.resolution }}
                </p>
              </li>
            </ul>
            <button
              v-if="ro.repair_log.length > 1"
              type="button"
              class="press mt-1 inline-flex min-h-9 items-center text-sm font-medium text-ink-gray-7 hover:text-ink-gray-9"
              :aria-expanded="String(!!fullLog[ro.name])"
              @click="fullLog[ro.name] = !fullLog[ro.name]"
            >
              {{
                fullLog[ro.name]
                  ? __('Ver solo el último')
                  : __('Ver bitácora ({0})', [ro.repair_log.length])
              }}
            </button>
          </div>

          <div v-if="ro.parts?.length" class="mt-4 px-4">
            <h4 class="mb-1.5 text-sm font-medium text-ink-gray-7">
              {{ __('Refacciones') }}
              <span class="num text-ink-gray-5">{{ ro.parts.length }}</span>
            </h4>
            <ul
              class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-1"
            >
              <li
                v-for="(p, i) in ro.parts"
                :key="`${ro.name}-part-${i}`"
                class="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <div class="min-w-0">
                  <p class="truncate text-ink-gray-8">
                    {{ p.item_name || p.item || '—' }}
                  </p>
                  <p
                    v-if="p.purchase_order && p.po_status"
                    class="text-xs text-ink-amber-9"
                    :title="`${p.purchase_order} · ${p.po_status}`"
                  >
                    {{
                      p.po_expected_date
                        ? __('En camino · llega {0}', [
                            formatDate(p.po_expected_date),
                          ])
                        : __('En camino')
                    }}
                  </p>
                </div>
                <span class="num flex-none text-ink-gray-7">
                  {{ formatQty(p.qty || 0, p.uom) }}
                  <template v-if="p.customer_charge != null">
                    · {{ money(p.customer_charge, ro.currency) }}
                  </template>
                </span>
              </li>
            </ul>
          </div>

          <p
            v-if="warranty(ro)"
            class="mx-4 mt-4 text-sm text-ink-gray-7"
            data-warranty
          >
            {{ warranty(ro) }}
          </p>

          <div class="mt-4 border-t border-outline-gray-1">
            <button
              type="button"
              class="flex min-h-11 w-full items-center justify-between px-4 text-sm font-medium text-ink-gray-7 hover:bg-surface-gray-1"
              :aria-expanded="String(!!details[ro.name])"
              @click="details[ro.name] = !details[ro.name]"
            >
              {{ __('Más detalles') }}
              <span
                class="lucide-chevron-down size-4 transition-transform duration-200 motion-reduce:transition-none"
                :class="details[ro.name] ? 'rotate-180' : ''"
                aria-hidden="true"
              />
            </button>
            <ExpandTransition>
              <div v-if="details[ro.name]" class="space-y-4 px-4 pb-4">
                <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <Pair
                    :label="__('Recibió')"
                    :value="ro.received_by_name || ro.received_by"
                  />
                  <Pair
                    :label="__('Técnico')"
                    :value="ro.technician_name || ro.technician"
                  />
                  <Pair
                    v-if="ro.delivered_by_name || ro.delivered_by"
                    :label="__('Entregó')"
                    :value="ro.delivered_by_name || ro.delivered_by"
                  />
                  <Pair
                    :label="__('Cliente')"
                    :value="ro.client_name || ro.client"
                  />
                  <Pair :label="__('Laboratorio')" :value="ro.laboratorio" />
                  <Pair
                    :label="__('Condición del equipo')"
                    :value="ro.general_status && __(ro.general_status)"
                  />
                </dl>
                <div
                  v-if="deviceState(ro).length"
                  class="flex flex-wrap gap-1.5"
                >
                  <StatusChip
                    v-for="s in deviceState(ro)"
                    :key="s.label"
                    :label="s.label"
                    :tone="s.tone"
                  />
                </div>
                <div
                  v-if="ro.serial_numbers?.length"
                  class="flex flex-wrap gap-1.5"
                >
                  <code
                    v-for="sn in ro.serial_numbers"
                    :key="sn.serial_no"
                    class="rounded-4 bg-surface-gray-2 px-1.5 py-0.5 font-mono text-xs text-ink-gray-7"
                    >{{ sn.identifier_type }}: {{ sn.serial_no }}</code
                  >
                </div>
                <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <Pair
                    :label="__('Mano de obra')"
                    :value="money(ro.labor_charge, ro.currency)"
                  />
                  <Pair
                    v-if="ro.diagnostic_fee"
                    :label="__('Costo de diagnóstico')"
                    :value="money(ro.diagnostic_fee, ro.currency)"
                  />
                  <Pair
                    :label="__('Total facturable')"
                    :value="money(ro.billing_total, ro.currency)"
                  />
                  <Pair
                    v-if="ro.quote_valid_until"
                    :label="__('Cotización vigente hasta')"
                    :value="
                      formatDate(ro.quote_valid_until, { relative: false })
                    "
                  />
                </dl>
                <div
                  v-if="ro.quotation || ro.sales_order || ro.invoices?.length"
                  class="flex flex-wrap gap-x-4 gap-y-1 text-sm"
                >
                  <a
                    v-if="ro.quotation"
                    :href="`/app/quotation/${encodeURIComponent(ro.quotation)}`"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-ink-blue-9 hover:underline"
                    >{{ __('Cotización') }} {{ ro.quotation }}</a
                  >
                  <a
                    v-if="ro.sales_order"
                    :href="`/app/sales-order/${encodeURIComponent(ro.sales_order)}`"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-ink-blue-9 hover:underline"
                    >{{ __('Pedido') }} {{ ro.sales_order }}</a
                  >
                  <a
                    v-for="inv in ro.invoices || []"
                    :key="`${inv.invoice_type}-${inv.invoice}`"
                    :href="`/app/${inv.invoice_type === 'POS Invoice' ? 'pos-invoice' : 'sales-invoice'}/${encodeURIComponent(inv.invoice)}`"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-ink-blue-9 hover:underline"
                    >{{
                      inv.invoice_type === 'POS Invoice'
                        ? __('Venta')
                        : __('Factura')
                    }}
                    {{ inv.invoice }}</a
                  >
                </div>
                <div v-if="ro.last_communication" class="text-sm">
                  <p class="text-xs text-ink-gray-5">
                    {{ __('Último aviso al cliente') }}
                    <template v-if="ro.last_communication_date">
                      · {{ formatDateTime(ro.last_communication_date) }}
                    </template>
                  </p>
                  <p class="mt-0.5 whitespace-pre-wrap text-ink-gray-8">
                    {{ ro.last_communication }}
                  </p>
                </div>
              </div>
            </ExpandTransition>
          </div>
        </template>

        <div
          class="flex items-center justify-end gap-1 border-t border-outline-gray-1 px-2 py-1.5"
          :class="isOpen(ro) ? '' : 'mt-3'"
        >
          <button
            v-if="!isOpen(ro)"
            type="button"
            class="press mr-auto inline-flex min-h-10 items-center rounded-full px-3 text-sm font-medium text-ink-gray-8 hover:bg-surface-gray-2"
            @click="expanded[ro.name] = true"
          >
            {{ __('Ver orden') }}
          </button>
          <a
            :href="orderHref(ro.name)"
            class="press inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink-gray-8 hover:bg-surface-gray-2"
          >
            <span class="lucide-external-link size-4" aria-hidden="true" />
            {{ __('Abrir en Taller') }}
          </a>
          <button
            v-if="ro.capabilities?.can_print"
            type="button"
            :title="__('Print Ticket')"
            :aria-label="__('Print Ticket')"
            class="press flex size-10 items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
            @click="printTicket(ro.name)"
          >
            <span class="lucide-printer size-4" aria-hidden="true" />
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup>
import { Button, createResource } from 'frappe-ui'
import { computed, h, reactive } from 'vue'
import { useRoute } from 'vue-router'
import { ExpandTransition, StatusChip } from '@/components/ui'
import { hasTaller, requestTallerPhotos } from '@/composables/inbox'
import { useRepairOrders } from '@/composables/repairOrders'
import {
  formatDate,
  formatDateTime,
  formatDue,
  formatQty,
  parseServerDate,
  relativeTime,
} from '@/utils/display'
import {
  repairClosed,
  repairMoney as money,
  repairOrderHref,
  repairTone,
  tallerIntakeHref,
} from '@/utils/repairOrders'

// A labelled block of free text (falla, diagnóstico): label over the text.
const Fact = (props) =>
  h('div', null, [
    h('p', { class: 'text-xs text-ink-gray-5' }, props.label),
    h(
      'p',
      {
        class: [
          'mt-0.5 whitespace-pre-wrap text-sm',
          props.muted ? 'text-ink-gray-5' : 'text-ink-gray-8',
        ],
      },
      props.text,
    ),
  ])
// One label/value pair of «Más detalles».
const Pair = (props) =>
  h('div', { class: 'min-w-0' }, [
    h('dt', { class: 'text-xs text-ink-gray-5' }, props.label),
    h(
      'dd',
      { class: 'mt-0.5 break-words text-ink-gray-8' },
      props.value === undefined || props.value === null || props.value === ''
        ? '—'
        : String(props.value),
    ),
  ])

const props = defineProps({
  docname: { type: String, required: true },
  // Mounted beside the deal's conversation (the inbox workspace): the photos
  // can go to that chat.
  chat: { type: Boolean, default: false },
})

const route = useRoute()
const { state, refresh } = useRepairOrders(() => props.docname)
const orderHref = (name) => repairOrderHref(name, props.docname, route.fullPath)
const intakeHref = computed(() =>
  hasTaller.value && state.value.context?.can_create !== false
    ? tallerIntakeHref(props.docname, route.fullPath)
    : null,
)

// Open orders first (the Deal's own order among each); a delivered or
// cancelled order folds to its header and money while another is open.
const orders = computed(() => {
  const list = state.value.context?.orders || []
  return [
    ...list.filter((ro) => !repairClosed(ro.status)),
    ...list.filter((ro) => repairClosed(ro.status)),
  ]
})
const anyOpen = computed(() =>
  orders.value.some((ro) => !repairClosed(ro.status)),
)
const expanded = reactive({})
const details = reactive({})
const fullLog = reactive({})
function isOpen(ro) {
  return expanded[ro.name] ?? !(repairClosed(ro.status) && anyOpen.value)
}

const moreClass =
  'press num flex size-20 flex-none items-center justify-center rounded-6 border border-outline-gray-2 text-sm font-medium text-ink-gray-7 hover:bg-surface-gray-2'
function photoTotal(ro) {
  return Math.max(ro.photo_count || 0, ro.photos?.length || 0)
}
function logShown(ro) {
  return fullLog[ro.name] ? ro.repair_log : ro.repair_log.slice(0, 1)
}

// Purchase-side ETA (ERP spec P3): the first PO-linked part of a waiting order.
// po_status is merged ONLY when the tenant flag is on, so a flag-off tenant
// shows nothing even if part rows carry stray purchase_order values.
function waitingPo(ro) {
  return (ro.parts || []).find((p) => p.purchase_order && p.po_status) || null
}

// The one line a seller says next: what the order waits on, or what to do.
function nextStep(ro) {
  const due = ro.pending_due && formatDue(ro.pending_due).label
  const withDue = (text) => (text && due ? `${text} · ${due}` : text)
  if (ro.status === 'Listo para Entregar')
    return Number(ro.balance_due) > 0
      ? __('Listo: avisa al cliente y cobra {0} al entregar.', [
          money(ro.balance_due, ro.currency),
        ])
      : __('Listo: avisa al cliente que puede pasar por su equipo.')
  if (ro.status === 'Esperando Pieza') {
    const po = waitingPo(ro)
    if (po?.po_expected_date)
      return __('Esperando la pieza: llega {0}.', [
        formatDate(po.po_expected_date),
      ])
    return withDue(
      ro.pending_action || ro.wait_reason || __('Esperando la pieza.'),
    )
  }
  if (ro.status === 'Esperando Cliente' && ro.estimate_decision === 'Pendiente')
    return ro.quote_valid_until
      ? __('El cliente debe aprobar la cotización (vigente hasta {0}).', [
          formatDate(ro.quote_valid_until, { relative: false }),
        ])
      : __('El cliente debe aprobar la cotización.')
  if (repairClosed(ro.status)) return ''
  return withDue(ro.pending_action || ro.wait_reason || '')
}

function promise(ro) {
  if (!ro.promised_at || repairClosed(ro.status)) return null
  const at = parseServerDate(ro.promised_at)
  if (!at) return null
  return {
    label: formatDateTime(at),
    overdue: at < new Date() && ro.status !== 'Listo para Entregar',
  }
}

const DECISIONS = {
  Pendiente: { label: __('Por aprobar'), class: 'text-ink-amber-9' },
  Aprobado: { label: __('Aprobada'), class: 'text-ink-green-8' },
  Rechazado: { label: __('Rechazada'), class: 'text-ink-gray-6' },
}
function decision(ro) {
  return DECISIONS[ro.estimate_decision] || null
}
// Red goes on the one figure that is overdue: money still owed on a device
// the customer already took.
function owedAfterDelivery(ro) {
  return ro.status === 'Entregado' && Number(ro.balance_due) > 0
}

function warranty(ro) {
  if (ro.is_warranty_claim) return __('Esta orden es un reclamo de garantía.')
  if (!ro.warranty_expires_on) return ''
  const until = formatDate(ro.warranty_expires_on, { relative: false })
  const at = parseServerDate(ro.warranty_expires_on)
  return at && at < new Date()
    ? __('La garantía venció el {0}.', [until])
    : __('Garantía hasta el {0}.', [until])
}

function deviceState(ro) {
  const out = []
  if (ro.turns_on != null)
    out.push(
      ro.turns_on
        ? { label: __('Enciende'), tone: 'neutral' }
        : { label: __('No enciende'), tone: 'warning' },
    )
  if (ro.has_sim_tray != null)
    out.push({
      label: ro.has_sim_tray ? __('Con charola SIM') : __('Sin charola SIM'),
      tone: 'neutral',
    })
  if (ro.has_phone_case) out.push({ label: __('Con funda'), tone: 'neutral' })
  if (ro.broken_screen)
    out.push({ label: __('Pantalla rota'), tone: 'warning' })
  if (ro.is_wet) out.push({ label: __('Mojado'), tone: 'warning' })
  return out
}

function sendToChat(ro) {
  requestTallerPhotos({ deal: props.docname, order: ro.name })
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
        window.open(
          (typeof data === 'string' ? data : data?.url) || ph.image,
          '_blank',
        )
      },
      onError() {
        window.open(ph.image || ph.thumbnail_url, '_blank')
      },
    })
  } else {
    window.open(ph.image || ph.thumbnail_url, '_blank')
  }
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
      window.open(
        '/printview?' + params.toString(),
        '_blank',
        'width=400,height=600',
      )
    },
    onError(err) {
      const msg = err?.messages?.join('\n') || err?.message || 'Print failed'
      alert(__('Print failed: ') + msg)
    },
  })
}
</script>
