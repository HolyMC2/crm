<!--
  Contact 360 · Tienda — storefront orders on the person record.

  Every row shows HOW it reached this contact (vinculado / cliente / correo /
  teléfono). Guest checkout parks orders on the shared guest Customer, so the
  only exact edge is `contact_person`; the weaker edges are what make an old
  guest order findable at all, and an operator who sees an unfamiliar order has
  to be able to tell which edge brought it in.

  The subtotal is this tab's own — Documentos keeps its rollup untouched.
-->
<template>
  <section class="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-base">
    <div v-if="resource.loading && !data" class="p-6 text-sm text-ink-gray-5">
      {{ __('Cargando pedidos…') }}
    </div>
    <div v-else-if="resource.error && !data" class="p-6 text-sm text-ink-red-7">
      {{ __('No se pudieron cargar los pedidos de la tienda.') }}
      <button class="ml-1 font-semibold underline" @click="resource.reload()">
        {{ __('Reintentar') }}
      </button>
    </div>
    <div
      v-else-if="data"
      class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 md:p-6"
    >
      <div class="mb-5 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Metric :label="__('Pedidos')" :value="data.summary.total_orders" />
        <Metric
          :label="__('Abiertos')"
          :value="data.summary.open_orders"
          :tone="data.summary.open_orders > 0 ? 'orange' : 'gray'"
        />
        <Metric
          :label="__('Importe')"
          :value="money(data.summary.total_amount, data.summary.currency)"
        />
        <Metric
          :label="__('Último pedido')"
          :value="date(data.summary.last_order)"
        />
      </div>

      <p
        v-if="data.summary.mixed_currency"
        class="mb-4 rounded-lg bg-surface-amber-1 px-3 py-2 text-xs text-ink-amber-9"
      >
        {{
          __(
            'Hay pedidos en más de una moneda; el importe está convertido a la moneda de la empresa.',
          )
        }}
      </p>

      <section class="mb-6">
        <div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 class="text-sm font-semibold text-ink-gray-9">
            {{ __('Pedidos de la tienda') }}
          </h3>
          <div v-if="matchChips.length" class="flex flex-wrap gap-1.5">
            <Badge
              v-for="chip in matchChips"
              :key="chip.key"
              :label="`${chip.label}: ${chip.count}`"
              :theme="matchTheme(chip.key)"
              size="sm"
            />
          </div>
        </div>

        <div
          v-if="!data.orders.length"
          class="rounded-xl border border-outline-gray-2 p-8 text-center text-sm text-ink-gray-5"
        >
          {{ __('Sin pedidos en la tienda en línea.') }}
        </div>

        <div
          v-else
          class="hidden overflow-x-auto rounded-xl border border-outline-gray-2 md:block"
        >
          <div class="min-w-[900px]">
            <div
              class="grid grid-cols-[1.2fr_1fr_1fr_1.1fr_0.9fr_1fr] gap-x-3 bg-surface-gray-1 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-ink-gray-5"
            >
              <span>{{ __('Pedido') }}</span
              ><span>{{ __('Entrega') }}</span
              ><span>{{ __('Estado') }}</span
              ><span>{{ __('Cliente') }}</span
              ><span>{{ __('Fecha') }}</span
              ><span class="text-right">{{ __('Importe') }}</span>
            </div>
            <div
              v-for="row in data.orders"
              :key="row.name"
              class="grid grid-cols-[1.2fr_1fr_1fr_1.1fr_0.9fr_1fr] items-center gap-x-3 border-t border-outline-gray-1 px-3 py-2 text-sm hover:bg-surface-gray-1"
            >
              <span class="min-w-0">
                <button
                  class="block w-full truncate text-left font-semibold text-ink-blue-link"
                  @click="openOrder(row)"
                >
                  {{ row.name }}
                </button>
                <Badge
                  :label="matchLabel(row.match)"
                  :theme="matchTheme(row.match)"
                  size="sm"
                />
              </span>
              <span
                ><Badge
                  :label="fulfillmentLabel(row.fulfillment)"
                  :theme="fulfillmentTheme(row.fulfillment)"
                  size="sm"
              /></span>
              <span class="truncate text-ink-gray-6">{{
                row.docstatus === 0 ? __('Borrador') : row.status || '—'
              }}</span>
              <span class="truncate text-ink-gray-6">{{
                row.customer_name || row.customer || '—'
              }}</span>
              <span class="text-ink-gray-5">{{ date(row.date) }}</span>
              <span class="text-right font-semibold tabular-nums text-ink-gray-8"
                >{{ money(row.amount, row.currency) }}
              </span>
            </div>
          </div>
        </div>

        <div
          v-if="data.orders.length"
          class="overflow-hidden rounded-xl border border-outline-gray-2 md:hidden"
        >
          <MobileRecordCard
            v-for="row in data.orders"
            :key="row.name"
            :title="row.name"
            :subtitle="row.customer_name || row.customer || '—'"
            :time="date(row.date)"
            @open="openOrder(row)"
          >
            <template #chips>
              <Badge
                :label="fulfillmentLabel(row.fulfillment)"
                :theme="fulfillmentTheme(row.fulfillment)"
                size="sm"
              />
              <Badge
                :label="matchLabel(row.match)"
                :theme="matchTheme(row.match)"
                size="sm"
              />
              <span class="text-xs font-semibold text-ink-gray-7">{{
                money(row.amount, row.currency)
              }}</span>
            </template>
          </MobileRecordCard>
        </div>

        <p
          v-if="data.summary.truncated"
          class="mt-2 text-xs text-ink-gray-5"
        >
          {{
            __('Mostrando los {0} más recientes de {1}.', [
              data.orders.length,
              data.summary.total_orders,
            ])
          }}
        </p>
      </section>

      <section v-if="data.returns.length">
        <h3 class="mb-2 text-sm font-semibold text-ink-gray-9">
          {{ __('Devoluciones') }}
        </h3>
        <div class="grid gap-2 md:grid-cols-2">
          <div
            v-for="row in data.returns"
            :key="row.name"
            class="rounded-xl border border-outline-gray-2 p-3"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="truncate text-sm font-semibold text-ink-gray-9">{{
                row.sales_order
              }}</span>
              <Badge
                :label="row.status || '—'"
                :theme="returnTheme(row.status)"
                size="sm"
              />
            </div>
            <div class="mt-1 text-xs text-ink-gray-5">
              {{ reasonLabel(row.reason) }} · {{ date(row.creation) }}
            </div>
            <p v-if="row.message" class="mt-1.5 text-xs text-ink-gray-7">
              {{ row.message }}
            </p>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup>
import { computed, defineComponent, h } from 'vue'
import { Badge, createResource } from 'frappe-ui'
import MobileRecordCard from '@/components/doco/MobileRecordCard.vue'

const props = defineProps({ docname: { type: String, required: true } })
const resource = createResource({
  url: 'doco_marketing.api.contact360.get_contact_storefront',
  params: { contact: props.docname },
  cache: ['contact360-storefront', props.docname],
  auto: true,
})
const data = computed(() => resource.data || null)

const MATCH_LABELS = {
  vinculado: __('Vinculado'),
  cliente: __('Por cliente'),
  correo: __('Por correo'),
  telefono: __('Por teléfono'),
}
const MATCH_THEMES = {
  vinculado: 'green',
  cliente: 'blue',
  correo: 'gray',
  telefono: 'orange',
}
const FULFILLMENT_LABELS = {
  placed: __('Recibido'),
  paid: __('Pagado'),
  preparing: __('Preparando'),
  ready: __('Listo'),
  delivered: __('Entregado'),
  cancelled: __('Cancelado'),
}
const FULFILLMENT_THEMES = {
  placed: 'gray',
  paid: 'blue',
  preparing: 'orange',
  ready: 'green',
  delivered: 'green',
  cancelled: 'red',
}
const REASON_LABELS = {
  defectuoso: __('Defectuoso'),
  equivocado: __('Equivocado'),
  no_como_esperaba: __('No como esperaba'),
  otro: __('Otro'),
}

const matchChips = computed(() =>
  Object.entries(data.value?.summary?.matched_by || {}).map(([key, count]) => ({
    key,
    count,
    label: matchLabel(key),
  })),
)

function matchLabel(key) {
  return MATCH_LABELS[key] || key || '—'
}
function matchTheme(key) {
  return MATCH_THEMES[key] || 'gray'
}
function fulfillmentLabel(value) {
  return FULFILLMENT_LABELS[value] || value || '—'
}
function fulfillmentTheme(value) {
  return FULFILLMENT_THEMES[value] || 'gray'
}
function returnTheme(status) {
  return (
    { Abierta: 'orange', 'En proceso': 'blue', Resuelta: 'green', Rechazada: 'red' }[
      status
    ] || 'gray'
  )
}
function reasonLabel(reason) {
  return REASON_LABELS[reason] || reason || __('Sin motivo')
}
function openOrder(row) {
  // The public /pedido link is the one the buyer sees; without a configured
  // storefront domain the server sends none, and Desk is the honest fallback.
  const url = row.order_url || `/app/sales-order/${encodeURIComponent(row.name)}`
  window.open(url, '_blank', 'noopener')
}
function money(value, currency) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: currency || 'MXN',
  }).format(Number(value || 0))
}
function date(value) {
  return value
    ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(
        new Date(value),
      )
    : '—'
}

const Metric = defineComponent({
  props: {
    label: String,
    value: [String, Number],
    tone: { type: String, default: 'gray' },
  },
  setup(p) {
    const tones = {
      gray: 'rounded-xl bg-surface-gray-1 p-3 text-ink-gray-9',
      orange: 'rounded-xl bg-surface-amber-1 p-3 text-ink-amber-9',
    }
    return () =>
      h('div', { class: tones[p.tone] || tones.gray }, [
        h(
          'div',
          { class: 'text-[10px] font-bold uppercase tracking-wide opacity-70' },
          p.label,
        ),
        h(
          'div',
          { class: 'mt-1 truncate text-lg font-bold tabular-nums' },
          String(p.value ?? 0),
        ),
      ])
  },
})
</script>
