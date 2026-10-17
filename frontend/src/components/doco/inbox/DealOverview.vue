<template>
  <div
    class="min-h-0 flex-1 overflow-y-auto bg-surface-gray-1 p-4 sm:p-6"
    data-testid="deal-overview"
  >
    <div class="mx-auto flex max-w-6xl flex-col gap-6">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-ink-gray-9">
            {{ __('Resumen del trato') }}
          </h2>
          <p class="mt-1 hidden text-sm text-ink-gray-5 md:block">
            {{ __('Seguimiento, trabajo y documentos del mismo cliente.') }}
          </p>
        </div>
        <button
          class="min-h-11 rounded-lg border border-outline-gray-2 bg-surface-base px-3 py-2 text-sm hover:bg-surface-gray-2 sm:min-h-0"
          :disabled="record.loading"
          @click="refresh"
        >
          {{ __('Actualizar') }}
        </button>
      </div>
      <p v-if="record.loading && !record.data" role="status">
        {{ __('Cargando resumen…') }}
      </p>
      <p v-else-if="record.error" role="alert" class="text-sm text-ink-red-8">
        {{
          __('No se pudo cargar el trato. Pulsa Actualizar para reintentar.')
        }}
      </p>
      <template v-else-if="record.data">
        <section
          class="rounded-xl border border-outline-gray-2 bg-surface-base p-4 sm:p-5"
          aria-label="Próximo seguimiento"
        >
          <div
            class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:flex-wrap"
          >
            <div class="min-w-0 flex-1">
              <h3 class="text-sm font-semibold text-ink-gray-6">
                {{ __('Próximo seguimiento') }}
              </h3>
              <p class="mt-2 text-lg font-semibold text-ink-gray-9">
                {{
                  doc.next_activity_title ||
                  (closed
                    ? __('Trato cerrado')
                    : __('Sin seguimiento programado'))
                }}
              </p>
              <NextActivityChip
                v-if="doc.next_activity_task"
                :at="doc.next_activity_at || ''"
                :type="doc.next_activity_type || ''"
                :empty-label="__('Pendiente sin fecha')"
              />
              <p v-else class="mt-1 max-w-xl text-sm text-ink-gray-5">
                {{
                  closed
                    ? __(
                        'El historial y los documentos siguen disponibles. Programa otra actividad si necesitas dar seguimiento.',
                      )
                    : __(
                        'Deja una fecha y un responsable para que este trato no se quede sin atención.',
                      )
                }}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                v-if="doc.next_activity_task"
                class="min-h-11 rounded-lg bg-surface-green-3 px-3 py-2 text-sm font-semibold text-ink-green-9 hover:bg-surface-green-2 disabled:opacity-50 sm:min-h-0"
                :disabled="finishing"
                :aria-keyshortcuts="'h'"
                @click="completeTask"
              >
                {{ __('Marcar como hecha') }}
                <kbd class="ml-1 hidden text-xs opacity-70 md:inline">H</kbd>
              </button>
              <button
                v-if="!closed"
                class="min-h-11 rounded-lg bg-surface-gray-2 px-3 py-2 text-sm font-semibold text-ink-gray-8 hover:bg-surface-gray-3 disabled:opacity-50 sm:min-h-0"
                :disabled="finishing"
                :aria-keyshortcuts="'p'"
                @click="snooze"
              >
                {{ __('Snooze one day') }}
                <kbd class="ml-1 hidden text-xs opacity-70 md:inline">P</kbd>
              </button>
              <button
                class="min-h-11 rounded-lg bg-surface-gray-10 px-3 py-2 text-sm font-semibold text-ink-base hover:bg-surface-gray-9 sm:min-h-0"
                :disabled="finishing"
                :aria-keyshortcuts="'n'"
                @click="schedule"
              >
                {{
                  doc.next_activity_task
                    ? __('Editar seguimiento')
                    : __('Programar seguimiento')
                }}
                <kbd class="ml-1 hidden text-xs opacity-70 md:inline">N</kbd>
              </button>
            </div>
          </div>
        </section>

        <dl
          class="grid grid-cols-2 gap-x-6 gap-y-5 border-b border-outline-gray-2 pb-6 sm:grid-cols-4"
        >
          <div>
            <!-- metric contract v2: the same value as the list, board and totals -->
            <dt class="text-sm text-ink-gray-5">{{ __('Valor') }}</dt>
            <dd
              class="mt-1 text-xl font-semibold tabular-nums"
              :class="value.outlier ? 'text-ink-amber-9' : 'text-ink-gray-9'"
              :title="
                value.outlier
                  ? __(
                      'Unusually large amount: left out of totals and averages. Check the value.',
                    )
                  : undefined
              "
            >
              {{
                value.amount
                  ? formatMoney(value.amount, value.currency)
                  : __('Sin estimar')
              }}<span v-if="value.outlier"> ⚠</span>
            </dd>
            <p
              v-if="value.weighted"
              class="mt-1 hidden text-xs text-ink-gray-5 md:block"
            >
              {{ __('Pronóstico ponderado') }}
              {{ formatMoney(value.weighted, value.currency) }}
            </p>
          </div>
          <div>
            <dt class="text-sm text-ink-gray-5">{{ __('Cierre previsto') }}</dt>
            <dd class="mt-1 text-base font-semibold text-ink-gray-9">
              {{ dateLabel(doc.expected_closure_date) }}
            </dd>
          </div>
          <div>
            <dt class="text-sm text-ink-gray-5">
              {{ __('Responsable del trato') }}
            </dt>
            <dd
              class="mt-1 break-words text-base font-semibold text-ink-gray-9"
            >
              {{
                getUser(doc.deal_owner)?.full_name ||
                doc.deal_owner ||
                __('Sin asignar')
              }}
            </dd>
          </div>
          <div>
            <dt class="text-sm text-ink-gray-5">{{ __('Etapa comercial') }}</dt>
            <dd class="mt-1 text-base font-semibold text-ink-gray-9">
              {{ stageLabel(doc.status) || '—' }}
            </dd>
            <p class="mt-1 hidden text-xs text-ink-gray-5 md:block">
              {{ __('El avance del taller se muestra por orden.') }}
            </p>
          </div>
        </dl>

        <div class="grid items-start gap-6 lg:grid-cols-2">
          <section
            v-if="hasTaller"
            class="min-w-0"
            aria-label="Trabajo de reparación"
          >
            <div class="mb-3 flex items-center justify-between gap-3">
              <h3 class="text-base font-semibold">
                {{ __('Trabajo de reparación') }}
              </h3>
              <button
                class="-my-2.5 min-h-11 text-sm font-medium text-ink-green-8 underline sm:my-0 sm:min-h-0"
                @click="$emit('navigate', 'repair')"
              >
                {{ __('Gestionar reparaciones') }}
              </button>
            </div>
            <p
              v-if="repairs.loading"
              role="status"
              class="text-sm text-ink-gray-5"
            >
              {{ __('Cargando órdenes…') }}
            </p>
            <p
              v-else-if="repairs.error"
              role="alert"
              class="text-sm text-ink-red-8"
            >
              {{
                __(
                  'No se pudieron cargar las órdenes. Reintenta con Actualizar.',
                )
              }}
            </p>
            <ul
              v-else-if="repairs.data?.length"
              class="divide-y divide-outline-gray-2 rounded-lg border border-outline-gray-2 bg-surface-base px-4"
            >
              <li v-for="ro in repairs.data" :key="ro.name" class="py-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <a
                    :href="orderHref(ro.name)"
                    class="font-semibold text-ink-green-8 underline"
                    >{{ ro.device_model || ro.name }}</a
                  ><span
                    class="rounded bg-surface-gray-2 px-2 py-1 text-xs font-medium"
                    >{{ ro.status }}</span
                  >
                </div>
                <!-- a phone reads what it is; the folio stays for desk lookups -->
                <p class="mt-1 text-xs text-ink-gray-5">
                  <span class="md:hidden">{{ __('Orden de reparación') }}</span
                  ><span class="hidden md:inline">{{ ro.name }}</span>
                </p>
                <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span
                    >{{ __('Cotizado') }}:
                    {{ formatMoney(ro.quote_amount || 0, doc.currency) }}</span
                  ><span
                    >{{ __('Saldo de la orden') }}:
                    {{ formatMoney(ro.balance_due || 0, doc.currency) }}</span
                  >
                </div>
              </li>
            </ul>
            <p
              v-else
              class="rounded-lg border border-dashed border-outline-gray-3 p-4 text-sm text-ink-gray-5"
            >
              {{
                __(
                  'No hay órdenes visibles vinculadas. Abre Reparación para revisar o crear el trabajo de este trato.',
                )
              }}
            </p>
          </section>
          <section class="min-w-0" aria-label="Documentos y cobros">
            <div class="mb-3 flex items-center justify-between gap-3">
              <h3 class="text-base font-semibold">
                {{ __('Documentos y cobros') }}
              </h3>
              <button
                class="-my-2.5 min-h-11 text-sm font-medium text-ink-green-8 underline sm:my-0 sm:min-h-0"
                @click="$emit('navigate', 'items')"
              >
                {{ __('Preparar cotización') }}
              </button>
            </div>
            <div
              v-if="salesDocsEnabled"
              class="rounded-lg border border-outline-gray-2 bg-surface-base"
            >
              <DealCommercialDocs :deal="name" payment-link />
            </div>
            <p v-else class="text-sm text-ink-gray-5">
              {{
                __(
                  'Los documentos de venta no están habilitados en esta vista. Revisa las opciones disponibles en Artículos.',
                )
              }}
            </p>
          </section>
        </div>
        <div class="rounded-lg border border-outline-gray-2 bg-surface-base">
          <DealConversations :doctype="'CRM Deal'" :name="name" />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { createResource } from 'frappe-ui'
import { usersStore } from '@/stores/users'
import { statusesStore } from '@/stores/statuses'
import {
  nextStepChanged,
  openNextStep,
  snoozeNextStep,
} from '@/composables/useNextStep'
import { hasTaller, salesDocsEnabled, reloadQueue } from '@/composables/inbox'
import { reloadSalesSummary } from '@/composables/salesDocs'
import { formatMoney } from '@/composables/crmFormat'
import { useReloadOnReturn } from '@/composables/reloadOnReturn'
import NextActivityChip from '@/components/doco/NextActivityChip.vue'
import { repairOrderHref } from '@/utils/repairOrders'
import { stageLabel } from '@/utils/stageLabel'
import DealConversations from './DealConversations.vue'
import DealCommercialDocs from '@/components/ventas/DealCommercialDocs.vue'

const props = defineProps({ name: { type: String, required: true } })
defineEmits(['navigate'])
// Bound to this Deal: the inbox URL can still name a Deal selected earlier.
const orderHref = (name) =>
  repairOrderHref(
    name,
    props.name,
    `${window.location.pathname}${window.location.search}`,
  )
const { getUser } = usersStore(),
  stages = statusesStore()
const record = createResource({
  url: 'frappe.client.get_value',
  params: {
    doctype: 'CRM Deal',
    filters: props.name,
    fieldname: [
      'deal_name',
      'status',
      'deal_owner',
      'currency',
      'expected_deal_value',
      'expected_closure_date',
      'next_activity_task',
      'next_activity_title',
      'next_activity_at',
      'next_activity_type',
    ],
  },
})
const repairs = createResource({
  url: 'frappe.client.get_list',
  params: {
    doctype: 'Repair Order',
    filters: { crm_deal: props.name },
    fields: ['name', 'device_model', 'status', 'quote_amount', 'balance_due'],
    order_by: 'creation desc',
    limit_page_length: 20,
  },
})
const amounts = createResource({
  url: 'crm.pipeline.api.get_deal_amounts',
  params: { names: [props.name] },
  onError: () => {},
})
const doc = computed(() => record.data || {})
// The contract's value; before it answers (or if it cannot), the deal's own
// expected amount, so the card never goes blank.
const value = computed(() => {
  const a = amounts.data?.deals?.[props.name]
  if (!a)
    return {
      amount: Number(doc.value.expected_deal_value) || 0,
      currency: doc.value.currency,
    }
  return {
    amount: Number(a.outlier ? a.size : a.commercial_value) || 0,
    currency: a.currency || doc.value.currency,
    outlier: !!a.outlier,
    weighted: a.open ? Number(a.weighted_forecast) || 0 : 0,
  }
})
const closed = computed(() =>
  ['Won', 'Lost'].includes(stages.getDealStatus(doc.value.status)?.type),
)
const finishing = ref(false)
function dateLabel(value) {
  return value
    ? new Date(value + 'T12:00:00').toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : __('Sin fecha')
}
function refresh() {
  record.fetch()
  amounts.fetch()
  if (hasTaller.value) repairs.fetch()
  if (salesDocsEnabled.value) reloadSalesSummary(props.name)
}
// One next-step path (crm.api.next_step) for this card, the list and the keys.
function schedule() {
  openNextStep({ deal: props.name, mode: 'schedule' })
}
function completeTask() {
  if (!doc.value.next_activity_task) return
  openNextStep({ deal: props.name, mode: 'complete' })
}
async function snooze() {
  if (finishing.value) return
  finishing.value = true
  try {
    await snoozeNextStep(props.name)
  } finally {
    finishing.value = false
  }
}
watch(nextStepChanged, (change) => {
  if (change?.deal !== props.name) return
  record.fetch()
  reloadQueue()
})
onMounted(refresh)
watch(hasTaller, (enabled) => {
  if (enabled && record.data) repairs.fetch()
})
// Repair Orders received in taller Intake show up once the operator is back.
useReloadOnReturn(() => hasTaller.value && repairs.fetch())
</script>
