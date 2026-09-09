<template>
  <div
    class="scb min-h-0 flex-1 overflow-y-auto bg-surface-base"
    data-testid="item-workspace"
  >
    <div v-if="doctype !== 'CRM Deal' || !enabled" class="p-6">
      <h2 class="text-base font-semibold">{{ __('Artículos y ventas') }}</h2>
      <p class="mt-2 text-sm text-ink-gray-6">
        {{
          doctype !== 'CRM Deal'
            ? __(
                'Convierte este prospecto en un trato para guardar artículos, cotizaciones y órdenes de venta.',
              )
            : __(
                'Activa el panel de documentos de venta en Marketing Settings para trabajar con artículos y ventas.',
              )
        }}
      </p>
      <Button class="mt-4" @click="$emit('catalog')">{{
        __('Consultar catálogo')
      }}</Button>
    </div>
    <template v-else>
      <header
        class="flex flex-wrap items-start justify-between gap-3 border-b border-outline-gray-1 px-5 py-4"
      >
        <div>
          <h2 class="text-base font-semibold text-ink-gray-9">
            {{ __('Artículos y ventas') }}
          </h2>
          <p class="mt-1 text-xs text-ink-gray-5">
            {{ __('Cotiza, da seguimiento y factura desde este trato.') }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button
            :disabled="busy || loading"
            icon="refresh-cw"
            :aria-label="__('Actualizar ventas')"
            @click="refresh"
          /><Button
            v-if="hasTaller"
            :disabled="!data?.can_write"
            @click="repairOpen = true"
            >{{ __('Nueva reparación') }}</Button
          ><Button
            :disabled="!data?.can_write || busy"
            variant="solid"
            icon-left="plus"
            @click="pickerOpen = true"
            >{{ __('Agregar artículos') }}</Button
          >
        </div>
      </header>
      <div
        v-if="error"
        role="alert"
        class="mx-5 mt-4 rounded border border-outline-red-2 p-3 text-sm text-ink-red-6"
      >
        {{ error }}
      </div>
      <div
        v-if="notice"
        role="status"
        class="mx-5 mt-4 rounded border border-outline-gray-2 p-3 text-sm text-ink-gray-7"
      >
        {{ notice }}
      </div>
      <div v-if="loading && !data" class="p-6 text-sm text-ink-gray-5">
        {{ __('Cargando artículos y documentos…') }}
      </div>
      <template v-if="data">
        <section
          class="border-b border-outline-gray-1 px-5 py-4"
          :aria-label="__('Estadísticas de ventas')"
        >
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-sm font-medium">{{ __('Resumen de ventas') }}</h3>
            <select
              v-model="scope"
              aria-label="Alcance de estadísticas"
              class="rounded border border-outline-gray-2 bg-surface-base py-1 pl-2 pr-7 text-xs"
            >
              <option value="deal">{{ __('Este trato') }}</option>
              <option value="customer" :disabled="!data.customers.length">
                {{ __('Cliente · todos sus tratos') }}
              </option>
            </select>
          </div>
          <div
            v-for="g in totals"
            :key="g.company + g.currency"
            class="mb-3 last:mb-0"
          >
            <p class="mb-2 text-xs text-ink-gray-5">
              {{ g.company }} · {{ g.currency }}
            </p>
            <dl class="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <div v-for="metric in metrics" :key="metric.key">
                <dt class="text-xs text-ink-gray-5">{{ metric.label }}</dt>
                <dd
                  class="mt-1 text-lg font-semibold tabular-nums"
                  :class="
                    metric.key === 'outstanding' && g.outstanding > 0
                      ? 'text-ink-red-6'
                      : 'text-ink-gray-9'
                  "
                >
                  {{
                    metric.key === 'count'
                      ? g.count
                      : money(g[metric.key], g.currency)
                  }}
                </dd>
              </div>
            </dl>
          </div>
          <p v-if="!totals.length" class="text-sm text-ink-gray-5">
            {{ __('Sin facturas confirmadas en este alcance.') }}
          </p>
          <p class="mt-3 text-xs text-ink-gray-5">
            {{
              __(
                'Importes de facturas confirmadas, netos de devoluciones. Cotizaciones y órdenes no suman ventas.',
              )
            }}<span v-if="scope === 'customer'" class="ml-1">
              {{
                __(
                  'Histórico completo del cliente, limitado a documentos que puedes consultar.',
                )
              }}</span
            >
          </p>
          <p
            v-if="scope === 'customer' && data.customer_history_restricted"
            class="mt-1 text-xs text-ink-amber-7"
          >
            {{
              __(
                'Tu rol no permite consultar todo el historial de facturación.',
              )
            }}
          </p>
        </section>

        <section class="px-5 py-5" :aria-label="__('Artículos vinculados')">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-sm font-semibold">
              {{ __('Artículos vinculados') }}
              <span class="font-normal text-ink-gray-5"
                >· {{ detail?.lines.length || 0 }}</span
              >
            </h3>
            <select
              v-if="salesDocuments.length"
              v-model="selectedKey"
              aria-label="Documento de artículos"
              class="max-w-full rounded border border-outline-gray-2 bg-surface-base py-1.5 pl-2 pr-7 text-xs"
            >
              <option
                v-for="doc in salesDocuments"
                :key="key(doc)"
                :value="key(doc)"
              >
                {{ label(doc.doctype) }} · {{ doc.name }} · {{ status(doc) }}
              </option>
            </select>
          </div>
          <p
            v-if="!salesDocuments.length"
            class="rounded border border-dashed border-outline-gray-2 p-6 text-center text-sm text-ink-gray-5"
          >
            {{
              __(
                'Agrega artículos para crear una cotización guardada en este trato.',
              )
            }}
          </p>
          <div
            v-else
            class="overflow-x-auto rounded border border-outline-gray-2"
          >
            <table class="w-full text-left text-sm">
              <thead class="bg-surface-gray-1 text-xs text-ink-gray-6">
                <tr>
                  <th class="px-3 py-2.5 font-medium">{{ __('Artículo') }}</th>
                  <th class="px-3 py-2.5 text-right font-medium">
                    {{ __('Cantidad') }}
                  </th>
                  <th class="px-3 py-2.5 text-right font-medium">
                    {{ __('Precio') }}
                  </th>
                  <th class="px-3 py-2.5 text-right font-medium">
                    {{ __('Importe') }}
                  </th>
                  <th v-if="editable" class="w-10">
                    <span class="sr-only">{{ __('Quitar') }}</span>
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-outline-gray-1">
                <tr v-if="detailLoading">
                  <td
                    :colspan="editable ? 5 : 4"
                    class="p-5 text-center text-ink-gray-5"
                  >
                    {{ __('Cargando artículos…') }}
                  </td>
                </tr>
                <template v-else
                  ><tr v-for="line in detail?.lines || []" :key="line.name">
                    <td class="px-3 py-3">
                      <a
                        :href="desk('Item', line.item_code)"
                        target="_blank"
                        rel="noopener"
                        class="font-medium text-ink-gray-9 hover:underline"
                        >{{ line.item_name || line.item_code }}</a
                      >
                      <div class="mt-1 text-xs text-ink-gray-5">
                        {{ line.item_code
                        }}<span v-if="line.discount_percentage">
                          · {{ line.discount_percentage }}%
                          {{ __('descuento') }}</span
                        >
                      </div>
                    </td>
                    <td class="px-3 py-3 text-right tabular-nums">
                      <input
                        v-if="editable"
                        :value="line.qty"
                        type="number"
                        min="0.001"
                        max="999"
                        step="any"
                        :disabled="busy"
                        :aria-label="__('Cantidad') + ' ' + line.item_name"
                        class="w-20 rounded border border-outline-gray-2 bg-surface-base p-1.5 text-right text-sm"
                        @change="updateQuantity(line, $event)"
                      /><span v-else>{{ line.qty }}</span>
                      <div class="mt-1 text-xs text-ink-gray-5">
                        {{ line.uom }}
                      </div>
                    </td>
                    <td
                      class="whitespace-nowrap px-3 py-3 text-right tabular-nums"
                    >
                      {{ money(line.rate, detail.currency) }}
                    </td>
                    <td
                      class="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums"
                    >
                      {{ money(line.amount, detail.currency) }}
                    </td>
                    <td v-if="editable" class="px-2">
                      <Button
                        icon="x"
                        :disabled="busy"
                        :aria-label="__('Quitar') + ' ' + line.item_name"
                        @click="removeLine(line)"
                      />
                    </td></tr
                ></template>
              </tbody>
              <tfoot
                v-if="detail && !detailLoading"
                class="border-t border-outline-gray-2 bg-surface-gray-1"
              >
                <tr>
                  <td colspan="3" class="px-3 py-3 text-xs text-ink-gray-6">
                    {{ __('Total del documento · impuestos incluidos') }}
                  </td>
                  <td
                    class="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums"
                  >
                    {{ money(detail.total, detail.currency) }}
                  </td>
                  <td v-if="editable" />
                </tr>
              </tfoot>
            </table>
          </div>
          <div
            v-if="selectedDoc"
            class="mt-3 flex flex-wrap items-center gap-2"
          >
            <Button
              v-if="
                selectedDoc.doctype === 'Quotation' &&
                selectedDoc.docstatus !== 2 &&
                data.can_write
              "
              :disabled="busy || detailLoading || !detail?.lines.length"
              @click="orderConfirm = true"
              >{{ __('Crear orden de venta') }}</Button
            >
            <Button
              v-if="
                selectedDoc.doctype === 'Sales Order' &&
                data.can_write &&
                data.can_invoice
              "
              :disabled="busy || selectedDoc.docstatus !== 1"
              @click="invoice"
              >{{ __('Crear factura · borrador') }}</Button
            >
            <a
              :href="desk(selectedDoc.doctype, selectedDoc.name)"
              target="_blank"
              rel="noopener"
              class="px-2 py-1 text-sm text-ink-blue-link hover:underline"
              >{{ __('Abrir en ERP') }} ↗</a
            >
            <span
              v-if="
                selectedDoc.doctype === 'Sales Order' &&
                selectedDoc.docstatus === 0
              "
              class="text-xs text-ink-gray-5"
              >{{ __('Confirma la orden en ERP para facturar.') }}</span
            >
          </div>
        </section>

        <section class="border-t border-outline-gray-1 px-5 py-5">
          <div class="mb-1 flex flex-wrap items-center justify-between gap-3">
            <h3 class="text-sm font-semibold">
              {{ __('Historial del trato') }}
              <span class="font-normal text-ink-gray-5"
                >· {{ data.documents.length }}</span
              >
            </h3>
            <Button
              :disabled="!data.can_write || busy"
              icon-left="link"
              @click="openLink"
              >{{ __('Vincular documento') }}</Button
            >
          </div>
          <p class="mb-3 text-xs text-ink-gray-5">
            {{
              __(
                'Por fecha de creación; se muestra el estado actual. Los pagos usan su fecha contable.',
              )
            }}
          </p>
          <div class="mb-3 flex gap-2">
            <select
              v-model="typeFilter"
              aria-label="Tipo de documento"
              class="min-w-0 flex-1 rounded border border-outline-gray-2 bg-surface-base py-1.5 pl-2 pr-7 text-xs"
            >
              <option value="">{{ __('Todos los documentos') }}</option>
              <option v-for="dt in documentTypes" :key="dt" :value="dt">
                {{ label(dt) }}
              </option></select
            ><Button @click="oldest = !oldest">{{
              oldest ? __('Más antiguos primero') : __('Más recientes primero')
            }}</Button>
          </div>
          <ol
            class="divide-y divide-outline-gray-1 border-y border-outline-gray-1"
          >
            <li
              v-for="doc in visibleHistory"
              :key="key(doc)"
              class="flex flex-wrap items-center gap-x-3 gap-y-1 py-3"
            >
              <time
                class="w-24 flex-none text-xs tabular-nums text-ink-gray-5"
                >{{ date(doc.date) }}</time
              >
              <div class="min-w-0 flex-1">
                <button
                  v-if="isSale(doc)"
                  class="text-left text-sm font-medium text-ink-blue-link hover:underline"
                  @click="selectDocument(doc)"
                >
                  {{ doc.name }}</button
                ><a
                  v-else
                  :href="
                    doc.doctype === 'Repair Order'
                      ? `/taller/orders/${encodeURIComponent(doc.name)}`
                      : desk(doc.doctype, doc.name)
                  "
                  target="_blank"
                  rel="noopener"
                  class="text-sm font-medium text-ink-blue-link hover:underline"
                  >{{ doc.name }} ↗</a
                >
                <div class="mt-1 text-xs text-ink-gray-5">
                  {{ label(doc.doctype)
                  }}<span v-if="doc.device_model">
                    · {{ doc.device_model }}</span
                  >
                </div>
              </div>
              <span
                class="rounded bg-surface-gray-2 px-2 py-1 text-xs text-ink-gray-6"
                >{{ status(doc) }}</span
              ><span
                v-if="doc.currency"
                class="ml-auto whitespace-nowrap text-sm tabular-nums"
                >{{ money(doc.grand_total, doc.currency) }}</span
              >
            </li>
          </ol>
          <p
            v-if="!visibleHistory.length"
            class="py-5 text-center text-sm text-ink-gray-5"
          >
            {{ __('Sin documentos en este filtro.') }}
          </p>
          <Button
            v-if="filteredHistory.length > historyLimit"
            class="mt-3"
            @click="historyLimit += 30"
            >{{ __('Mostrar más') }} ({{
              filteredHistory.length - historyLimit
            }})</Button
          >
        </section>
      </template>
    </template>
    <WorkspaceItemPicker
      v-model="pickerOpen"
      :busy="busy"
      :save-error="error"
      @add="addItems"
    />
    <Dialog
      v-model="orderConfirm"
      :options="{ title: __('Crear orden de venta'), size: 'sm' }"
      ><template #body-content
        ><p class="text-sm text-ink-gray-7">
          {{
            __(
              'Se confirmará esta cotización y se creará una orden de venta en borrador. La cotización dejará de ser editable.',
            )
          }}
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <Button :disabled="busy" @click="orderConfirm = false">{{
            __('Cancelar')
          }}</Button>
          <p v-if="error" role="alert" class="text-sm text-ink-red-6">
            {{ error }}
          </p>
          <Button variant="solid" :loading="busy" @click="createOrder">{{
            __('Confirmar y crear orden')
          }}</Button>
        </div></template
      ></Dialog
    >
    <Dialog
      v-model="repairOpen"
      :options="{ title: __('Reparaciones del trato'), size: '4xl' }"
      ><template #body-content
        ><RepairOrdersSection
          v-if="repairOpen && hasTaller"
          :docname="deal"
          initially-open
          @created="refresh" /></template
    ></Dialog>
    <Dialog
      v-model="linkOpen"
      :options="{ title: __('Vincular documento existente'), size: '2xl' }"
      ><template #body-content
        ><p class="mb-3 text-sm text-ink-gray-6">
          {{
            __(
              'Borradores del mismo cliente que todavía no pertenecen a otro trato.',
            )
          }}
        </p>
        <form class="mb-3 flex flex-wrap gap-2" @submit.prevent="searchLinks">
          <select
            v-model="linkType"
            aria-label="Tipo a vincular"
            class="rounded border border-outline-gray-2 bg-surface-base text-sm"
            @change="searchLinks"
          >
            <option value="Sales Order">{{ __('Orden de venta') }}</option>
            <option value="Sales Invoice">{{ __('Factura') }}</option></select
          ><input
            v-model="linkQuery"
            aria-label="Número de documento"
            :placeholder="__('Número de documento')"
            class="min-w-0 flex-1 rounded border border-outline-gray-2 bg-surface-base text-sm"
          /><Button type="submit" :loading="linkLoading">{{
            __('Buscar')
          }}</Button>
        </form>
        <p v-if="linkError" role="alert" class="mb-3 text-sm text-ink-red-6">
          {{ linkError }}
        </p>
        <div class="max-h-80 overflow-auto divide-y divide-outline-gray-1">
          <div
            v-for="doc in linkResults"
            :key="doc.name"
            class="flex items-center justify-between gap-3 py-3 text-sm"
          >
            <div>
              <p class="font-medium">{{ doc.name }}</p>
              <p class="text-xs text-ink-gray-5">
                {{ doc.customer }} · {{ doc.company }}
              </p>
            </div>
            <Button :disabled="busy || linkLoading" @click="linkDoc(doc)">{{
              __('Vincular')
            }}</Button>
          </div>
        </div>
        <p
          v-if="!linkResults.length && !linkLoading"
          class="py-3 text-sm text-ink-gray-5"
        >
          {{
            __(
              'Sin borradores disponibles. El trato necesita un cliente ERP vinculado.',
            )
          }}
        </p></template
      ></Dialog
    >
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Button, Dialog, call } from 'frappe-ui'
import { formatMoney } from '@/composables/crmFormat'
import { reloadSalesSummary } from '@/composables/salesDocs'
import RepairOrdersSection from '@/components/doco/RepairOrdersSection.vue'
import WorkspaceItemPicker from './WorkspaceItemPicker.vue'

const props = defineProps({
  deal: String,
  doctype: String,
  enabled: Boolean,
  hasTaller: Boolean,
})
defineEmits(['catalog'])
const data = ref(null),
  detail = ref(null),
  error = ref(''),
  notice = ref('')
const loading = ref(false),
  detailLoading = ref(false),
  busy = ref(false)
const pickerOpen = ref(false),
  repairOpen = ref(false),
  orderConfirm = ref(false)
const selectedKey = ref(''),
  scope = ref('customer'),
  typeFilter = ref(''),
  oldest = ref(false),
  historyLimit = ref(30)
const linkOpen = ref(false),
  linkType = ref('Sales Order'),
  linkQuery = ref(''),
  linkResults = ref([]),
  linkLoading = ref(false),
  linkError = ref('')
let alive = true,
  request = 0,
  detailRequest = 0,
  linkRequest = 0
const api = (method, params = {}) =>
  call(`doco_marketing.api.item_workspace.${method}`, {
    deal: props.deal,
    ...params,
  })
const quoteApi = (method, params) =>
  call(`doco_marketing.api.sales_docs.${method}`, {
    deal: props.deal,
    ...params,
  })
const key = (d) => `${d.doctype}:${d.name}`
const isSale = (d) =>
  ['Quotation', 'Sales Order', 'Sales Invoice', 'POS Invoice'].includes(
    d.doctype,
  )
const label = (dt) =>
  ({
    Quotation: __('Cotización'),
    'Sales Order': __('Orden de venta'),
    'Sales Invoice': __('Factura'),
    'POS Invoice': __('Venta POS'),
    'Payment Entry': __('Pago'),
    'Repair Order': __('Reparación'),
  })[dt] || dt
const status = (d) =>
  d.docstatus === 2
    ? __('Cancelado')
    : d.docstatus === 0 && d.doctype !== 'Repair Order'
      ? __('Borrador')
      : __(d.status || 'Confirmado')
const desk = (dt, name) =>
  `/app/${dt.toLowerCase().replaceAll(' ', '-')}/${encodeURIComponent(name)}`
const money = (value, currency) => formatMoney(Number(value || 0), currency)
const date = (value) =>
  String(value || '')
    .slice(0, 16)
    .replace('T', ' ')
const message = (e) =>
  e.messages?.join('\n') ||
  e.message ||
  __('No se pudo completar la operación.')
const metrics = [
  { key: 'invoiced', label: __('Facturado') },
  { key: 'paid', label: __('Pagado') },
  { key: 'outstanding', label: __('Saldo pendiente') },
  { key: 'count', label: __('Facturas') },
]
const totals = computed(
  () =>
    (scope.value === 'customer'
      ? data.value?.customer_totals
      : data.value?.totals) || [],
)
const salesDocuments = computed(
  () => data.value?.documents.filter(isSale) || [],
)
const selectedDoc = computed(() =>
  salesDocuments.value.find((d) => key(d) === selectedKey.value),
)
const editable = computed(
  () =>
    data.value?.can_write &&
    detail.value?.doctype === 'Quotation' &&
    detail.value?.docstatus === 0,
)
const documentTypes = computed(() => [
  ...new Set(data.value?.documents.map((d) => d.doctype) || []),
])
const filteredHistory = computed(() => {
  const rows = (data.value?.documents || []).filter(
    (d) => !typeFilter.value || d.doctype === typeFilter.value,
  )
  return oldest.value ? [...rows].reverse() : rows
})
const visibleHistory = computed(() =>
  filteredHistory.value.slice(0, historyLimit.value),
)

async function refresh() {
  if (!props.enabled || props.doctype !== 'CRM Deal') return
  const id = ++request
  loading.value = true
  error.value = ''
  try {
    const result = await api('get_workspace')
    if (!alive || id !== request) return
    data.value = result
    if (!result.customers.length) scope.value = 'deal'
    const current = result.documents.find((d) => key(d) === selectedKey.value)
    const next =
      current ||
      result.documents.find(
        (d) => d.doctype === 'Quotation' && d.docstatus === 0,
      ) ||
      result.documents.find(isSale)
    const nextKey = next ? key(next) : ''
    if (selectedKey.value === nextKey) await loadDetail()
    else selectedKey.value = nextKey
  } catch (e) {
    if (alive && id === request) error.value = message(e)
  } finally {
    if (alive && id === request) loading.value = false
  }
}
async function loadDetail() {
  const doc = selectedDoc.value,
    id = ++detailRequest
  detail.value = null
  detailLoading.value = !!doc
  if (!doc) return
  try {
    const result = await api('get_document_items', {
      doctype: doc.doctype,
      name: doc.name,
    })
    if (alive && id === detailRequest) detail.value = result
  } catch (e) {
    if (alive && id === detailRequest) error.value = message(e)
  } finally {
    if (alive && id === detailRequest) detailLoading.value = false
  }
}
async function mutate(action, success) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await action()
    if (!alive) return
    success?.(result)
    reloadSalesSummary(props.deal)
    await refresh()
  } catch (e) {
    if (alive) {
      error.value = message(e)
      if (linkOpen.value) linkError.value = message(e)
    }
  } finally {
    if (alive) busy.value = false
  }
}
function addItems(items) {
  return mutate(
    () => quoteApi('add_items_to_quotation', { items: JSON.stringify(items) }),
    (out) => {
      pickerOpen.value = false
      selectedKey.value = `Quotation:${out.quotation}`
      notice.value =
        out.warnings?.join('\n') || __('Artículos guardados en la cotización.')
    },
  )
}
function updateQuantity(line, event) {
  const qty = Number(event.target.value)
  if (!Number.isFinite(qty) || qty <= 0 || qty > 999) {
    event.target.value = line.qty
    error.value = __('La cantidad debe ser mayor que cero y no superar 999.')
    return
  }
  const old = line.qty
  return mutate(() =>
    quoteApi('update_quotation_line', {
      quotation: detail.value.name,
      row_name: line.name,
      qty,
    }),
  ).then(() => {
    event.target.value =
      detail.value?.lines.find((r) => r.name === line.name)?.qty ?? old
  })
}
function removeLine(line) {
  return mutate(() =>
    quoteApi('remove_quotation_line', {
      quotation: detail.value.name,
      row_name: line.name,
    }),
  )
}
function createOrder() {
  const quotation = selectedDoc.value.name
  return mutate(
    () => quoteApi('accept_quotation', { quotation }),
    (out) => {
      orderConfirm.value = false
      selectedKey.value = `Sales Order:${out.sales_order}`
      notice.value = __('Orden de venta disponible:') + ' ' + out.sales_order
    },
  )
}
function invoice() {
  return mutate(
    () => api('create_invoice', { sales_order: selectedDoc.value.name }),
    (out) => {
      selectedKey.value = `Sales Invoice:${out.name}`
      notice.value = __('Factura en borrador:') + ' ' + out.name
    },
  )
}
function selectDocument(doc) {
  selectedKey.value = key(doc)
}
function openLink() {
  linkOpen.value = true
  searchLinks()
}
async function searchLinks() {
  const id = ++linkRequest
  linkLoading.value = true
  linkError.value = ''
  linkResults.value = []
  try {
    const result = await api('find_linkable_documents', {
      doctype: linkType.value,
      query: linkQuery.value,
    })
    if (alive && id === linkRequest) linkResults.value = result
  } catch (e) {
    if (alive && id === linkRequest) linkError.value = message(e)
  } finally {
    if (alive && id === linkRequest) linkLoading.value = false
  }
}
function linkDoc(doc) {
  const doctype = linkType.value
  return mutate(
    () => api('link_document', { doctype, name: doc.name }),
    () => {
      selectedKey.value = `${doctype}:${doc.name}`
      linkOpen.value = false
      notice.value = __('Documento vinculado.')
    },
  )
}
watch(selectedKey, loadDetail)
watch(() => props.enabled, refresh, { immediate: true })
onBeforeUnmount(() => {
  alive = false
  request++
  detailRequest++
  linkRequest++
})
</script>
