<template>
  <section class="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-base">
    <div v-if="resource.loading && !data" class="p-6 text-sm text-ink-gray-5">
      {{ __('Cargando documentos…') }}
    </div>
    <div v-else-if="resource.error && !data" class="p-6 text-sm text-ink-red-7">
      {{ __('No se pudieron cargar los documentos.') }}
      <button class="ml-1 font-semibold underline" @click="resource.reload()">
        {{ __('Reintentar') }}
      </button>
    </div>
    <div
      v-else-if="data"
      class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 md:p-6"
    >
      <div
        v-if="!groups.length"
        class="py-12 text-center text-sm text-ink-gray-5"
      >
        {{ __('Sin documentos de venta todavía.') }}
      </div>
      <section v-for="group in groups" :key="group.key" class="mb-6">
        <div class="mb-2 flex items-baseline justify-between gap-3">
          <h3 class="text-sm font-semibold text-ink-gray-9">
            {{ group.label }} · {{ trunc(group.key).total }}
          </h3>
          <span
            v-if="trunc(group.key).is_truncated"
            class="text-xs text-ink-gray-5"
          >
            {{
              __('Mostrando las últimas {0} de {1}', [
                trunc(group.key).shown,
                trunc(group.key).total,
              ])
            }}
          </span>
        </div>

        <div
          class="hidden overflow-x-auto rounded-xl border border-outline-gray-2 md:block"
        >
          <div class="min-w-[720px]">
            <div
              class="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] bg-surface-gray-1 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-ink-gray-5"
            >
              <span>{{ __('Folio') }}</span
              ><span>{{ __('Fecha') }}</span
              ><span>{{ __('Estado') }}</span
              ><span class="text-right">{{ __('Importe') }}</span
              ><span>{{ __('Moneda') }}</span>
            </div>
            <button
              v-for="row in group.rows"
              :key="`${row.doctype}-${row.name}`"
              class="grid w-full grid-cols-[1.4fr_1fr_1fr_1fr_1fr] items-center border-t border-outline-gray-1 px-3 py-2 text-left text-sm hover:bg-surface-gray-1"
              @click="open(row, group.doctype)"
            >
              <span class="truncate font-semibold text-ink-blue-link">{{
                row.name
              }}</span>
              <span class="text-ink-gray-5">{{ date(row.date) }}</span>
              <span
                ><Badge
                  :label="status(row)"
                  :theme="statusTheme(row.status)"
                  size="sm"
              /></span>
              <span
                class="text-right font-semibold tabular-nums text-ink-gray-8"
                >{{ money(amount(row), row.currency) }}</span
              >
              <span class="text-ink-gray-5">{{ row.currency || '—' }}</span>
            </button>
          </div>
        </div>

        <div
          class="overflow-hidden rounded-xl border border-outline-gray-2 md:hidden"
        >
          <MobileRecordCard
            v-for="row in group.rows"
            :key="`${row.doctype}-${row.name}`"
            :title="row.name"
            :subtitle="money(amount(row), row.currency)"
            :time="date(row.date)"
            @open="open(row, group.doctype)"
          >
            <template #chips
              ><Badge
                :label="status(row)"
                :theme="statusTheme(row.status)"
                size="sm"
            /></template>
          </MobileRecordCard>
        </div>
      </section>
    </div>

    <Dialog v-model="viewerOpen" :options="{ size: '4xl' }">
      <template #body>
        <div
          class="flex items-center justify-between border-b border-outline-gray-1 px-4 py-3"
        >
          <h3 class="truncate text-sm font-bold text-ink-gray-9">
            {{ viewer.name }}
          </h3>
          <div class="flex items-center gap-2">
            <Button
              v-if="viewer.html"
              size="sm"
              :label="__('Imprimir')"
              @click="printDoc"
            />
            <button
              class="p-1 text-ink-gray-5 hover:text-ink-gray-9"
              :aria-label="__('Cerrar')"
              @click="viewerOpen = false"
            >
              ✕
            </button>
          </div>
        </div>
        <div class="h-[70vh] bg-surface-gray-1">
          <div
            v-if="viewer.loading"
            class="py-10 text-center text-sm text-ink-gray-5"
          >
            {{ __('Cargando…') }}
          </div>
          <div
            v-else-if="viewer.error"
            class="py-10 text-center text-sm text-ink-red-7"
          >
            {{ viewer.error }}
          </div>
          <iframe
            v-else-if="viewer.html"
            ref="frame"
            :srcdoc="viewer.html"
            sandbox="allow-same-origin allow-modals allow-popups"
            class="h-full w-full border-0 bg-white"
          />
        </div>
      </template>
    </Dialog>
  </section>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { Badge, Button, Dialog, call, createResource } from 'frappe-ui'
import MobileRecordCard from '@/components/doco/MobileRecordCard.vue'

const props = defineProps({ docname: { type: String, required: true } })
const resource = createResource({
  url: 'doco_marketing.api.contact360.get_contact_documents',
  params: { contact: props.docname },
  cache: ['contact360-documents', props.docname],
  auto: true,
})
const data = computed(() => resource.data || null)
const groups = computed(() =>
  [
    {
      key: 'quotations',
      label: __('Cotizaciones'),
      doctype: 'Quotation',
      rows: data.value?.quotations || [],
    },
    {
      key: 'sales_orders',
      label: __('Órdenes de venta'),
      doctype: 'Sales Order',
      rows: data.value?.sales_orders || [],
    },
    {
      key: 'invoices',
      label: __('Facturas'),
      doctype: 'Sales Invoice',
      rows: data.value?.invoices || [],
    },
    {
      key: 'credit_notes',
      label: __('Notas de crédito'),
      doctype: 'Sales Invoice',
      rows: data.value?.credit_notes || [],
    },
    {
      key: 'payments',
      label: __('Pagos'),
      doctype: 'Payment Entry',
      rows: data.value?.payments || [],
    },
  ].filter((group) => group.rows.length),
)

const viewerOpen = ref(false)
const frame = ref(null)
const viewer = reactive({
  name: '',
  doctype: '',
  html: '',
  loading: false,
  error: '',
})
async function open(row, fallbackDoctype) {
  const doctype = row.doctype || fallbackDoctype
  if (doctype === 'Payment Entry') return
  viewerOpen.value = true
  Object.assign(viewer, {
    name: row.name,
    doctype,
    html: '',
    loading: true,
    error: '',
  })
  try {
    const out = await call('doco_marketing.api.contact360.render_contact_doc', {
      contact: props.docname,
      doctype,
      name: row.name,
    })
    viewer.html = out.html
  } catch (error) {
    viewer.error = error.messages?.[0] || __('No se pudo abrir el documento.')
  } finally {
    viewer.loading = false
  }
}
function printDoc() {
  frame.value?.contentWindow?.print()
}
function trunc(key) {
  return (
    data.value?.truncated?.[key] || { shown: 0, total: 0, is_truncated: false }
  )
}
function amount(row) {
  return row.allocated_amount ?? row.grand_total
}
function status(row) {
  return row.status || __('Sin estado')
}
function statusTheme(value) {
  return (
    {
      Paid: 'green',
      Completed: 'green',
      Submitted: 'green',
      Unpaid: 'orange',
      'Partly Paid': 'orange',
      Overdue: 'red',
      Return: 'gray',
      Draft: 'gray',
      Open: 'blue',
    }[value] || 'gray'
  )
}
function money(value, currency) {
  if (value == null) return '—'
  if (!currency)
    return new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(
      Number(value),
    )
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(
    Number(value),
  )
}
function date(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(
    new Date(value),
  )
}
</script>
