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
          <p class="mt-1 text-sm text-ink-gray-5">
            {{ __('Seguimiento, trabajo y documentos del mismo cliente.') }}
          </p>
        </div>
        <button
          class="rounded-lg border border-outline-gray-2 bg-surface-base px-3 py-2 text-sm hover:bg-surface-gray-2"
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
              <p
                v-if="taskError"
                role="alert"
                class="mt-2 text-sm text-ink-red-8"
              >
                {{ taskError }}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                v-if="doc.next_activity_task"
                class="rounded-lg bg-surface-green-3 px-3 py-2 text-sm font-semibold text-ink-green-9 hover:bg-surface-green-2 disabled:opacity-50"
                :disabled="finishing"
                @click="completeTask"
              >
                {{ finishing ? __('Guardando…') : __('Marcar como hecha') }}
              </button>
              <button
                class="rounded-lg bg-surface-gray-7 px-3 py-2 text-sm font-semibold text-white hover:bg-surface-gray-6"
                :disabled="finishing"
                @click="schedule"
              >
                {{
                  doc.next_activity_task
                    ? __('Editar seguimiento')
                    : __('Programar seguimiento')
                }}
              </button>
            </div>
          </div>
        </section>

        <dl
          class="grid grid-cols-2 gap-x-6 gap-y-5 border-b border-outline-gray-2 pb-6 sm:grid-cols-4"
        >
          <div>
            <dt class="text-sm text-ink-gray-5">{{ __('Valor esperado') }}</dt>
            <dd class="mt-1 text-xl font-semibold tabular-nums text-ink-gray-9">
              {{
                Number(doc.expected_deal_value)
                  ? formatMoney(doc.expected_deal_value, doc.currency)
                  : __('Sin estimar')
              }}
            </dd>
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
              {{ doc.status || '—' }}
            </dd>
            <p class="mt-1 text-xs text-ink-gray-5">
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
                class="text-sm font-medium text-ink-green-8 underline"
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
                    :href="`/taller/orders/${encodeURIComponent(ro.name)}`"
                    class="font-semibold text-ink-green-8 underline"
                    >{{ ro.device_model || ro.name }}</a
                  ><span
                    class="rounded bg-surface-gray-2 px-2 py-1 text-xs font-medium"
                    >{{ ro.status }}</span
                  >
                </div>
                <p class="mt-1 text-xs text-ink-gray-5">{{ ro.name }}</p>
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
                class="text-sm font-medium text-ink-green-8 underline"
                @click="$emit('navigate', 'items')"
              >
                {{ __('Preparar cotización') }}
              </button>
            </div>
            <div
              v-if="salesDocsEnabled"
              class="rounded-lg border border-outline-gray-2 bg-surface-base"
            >
              <SalesDocsSection :deal="name" />
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
import { createResource, call, toast } from 'frappe-ui'
import { usersStore } from '@/stores/users'
import { statusesStore } from '@/stores/statuses'
import { useDoctypeModal } from '@/composables/doctypeModal'
import { hasTaller, salesDocsEnabled, reloadQueue } from '@/composables/inbox'
import { reloadSalesSummary } from '@/composables/salesDocs'
import { formatMoney } from '@/composables/crmFormat'
import NextActivityChip from '@/components/doco/NextActivityChip.vue'
import DealConversations from './DealConversations.vue'
import SalesDocsSection from './SalesDocsSection.vue'

const props = defineProps({ name: { type: String, required: true } })
defineEmits(['navigate'])
const { getUser } = usersStore(),
  stages = statusesStore(),
  { showModal } = useDoctypeModal()
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
const doc = computed(() => record.data || {})
const closed = computed(() =>
  ['Won', 'Lost'].includes(stages.getDealStatus(doc.value.status)?.type),
)
const finishing = ref(false),
  taskError = ref('')
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
  if (hasTaller.value) repairs.fetch()
  if (salesDocsEnabled.value) reloadSalesSummary(props.name)
}
function schedule() {
  showModal({
    doctype: 'CRM Task',
    name: doc.value.next_activity_task || null,
    title: __('Seguimiento'),
    defaults: {
      reference_doctype: 'CRM Deal',
      reference_docname: props.name,
      assigned_to: doc.value.deal_owner,
      status: 'Todo',
      activity_type: 'Task',
    },
    callbacks: { afterInsert: refresh, afterUpdate: refresh },
  })
}
async function completeTask() {
  if (finishing.value || !doc.value.next_activity_task) return
  finishing.value = true
  taskError.value = ''
  try {
    await call('frappe.client.set_value', {
      doctype: 'CRM Task',
      name: doc.value.next_activity_task,
      fieldname: 'status',
      value: 'Done',
    })
    await record.fetch()
    reloadQueue()
    toast.success(__('Seguimiento completado'))
  } catch {
    taskError.value = __(
      'No se pudo completar el seguimiento. Reintenta o revisa tu permiso para editar la tarea.',
    )
  } finally {
    finishing.value = false
  }
}
onMounted(refresh)
watch(hasTaller, (enabled) => {
  if (enabled && record.data) repairs.fetch()
})
</script>
