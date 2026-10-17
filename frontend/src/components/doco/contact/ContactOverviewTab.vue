<template>
  <section class="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-base">
    <SectionAvailability
      :availability="data?.availability"
      @retry="resource.reload()"
    />
    <div v-if="resource.loading && !data" class="p-6 text-sm text-ink-gray-6">
      {{ __('Cargando resumen…') }}
    </div>
    <div v-else-if="resource.error && !data" class="p-6 text-sm text-ink-red-7">
      {{ __('No se pudo cargar el resumen.') }}
      <button class="ml-1 font-semibold underline" @click="resource.reload()">
        {{ __('Reintentar') }}
      </button>
    </div>
    <div
      v-else-if="data"
      class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6"
    >
      <!-- Only numbers there is something to say about: a zero tile is noise
           (Shell S4.2). The balance always shows; it is the first question. -->
      <div v-for="rollup in rollups" :key="rollup.currency" class="mb-4">
        <div
          v-if="rollups.length > 1"
          class="mb-2 text-xs font-semibold text-ink-gray-6"
        >
          {{ rollup.currency }}
        </div>
        <KpiGrid>
          <KpiTile
            :label="__('Saldo')"
            :value="money(rollup.outstanding, rollup.currency)"
            :tone="rollup.outstanding > 0 ? 'danger' : 'neutral'"
          />
          <KpiTile
            v-for="tile in moneyTiles(rollup)"
            :key="tile.label"
            :label="tile.label"
            :value="tile.value"
            :tone="tile.tone"
          />
        </KpiGrid>
      </div>

      <KpiGrid v-if="countTiles.length">
        <KpiTile
          v-for="tile in countTiles"
          :key="tile.label"
          :label="tile.label"
          :value="tile.value"
          :tone="tile.tone"
        />
      </KpiGrid>

      <div class="mt-5 grid gap-3 lg:grid-cols-2">
        <div
          class="rounded-xl border border-outline-gray-2 bg-surface-gray-1 p-4"
        >
          <h3 class="text-sm font-semibold text-ink-gray-9">
            {{ __('Actividad') }}
          </h3>
          <dl class="mt-3 space-y-2 text-sm">
            <Row
              :label="__('Primera compra')"
              :value="date(data.first_purchase)"
            />
            <Row
              :label="__('Primera vez registrada')"
              :value="date(data.first_seen)"
            />
            <Row
              :label="__('Última actividad')"
              :value="date(data.last_activity, true)"
            />
          </dl>
        </div>
        <div
          class="hidden rounded-xl border border-outline-gray-2 bg-surface-gray-1 p-4 lg:block"
        >
          <h3 class="text-sm font-semibold text-ink-gray-9">
            {{ __('Persona y clientes') }}
          </h3>
          <dl class="mt-3 space-y-2 text-sm">
            <Row
              :label="__('Organización')"
              :value="data.contact.organization || __('Sin organización')"
            />
            <Row
              :label="__('Teléfono')"
              :value="data.contact.mobile_no || '—'"
            />
            <Row :label="__('Correo')" :value="data.contact.email || '—'" />
          </dl>
          <div class="mt-3 flex flex-wrap gap-1.5">
            <a
              v-for="customer in data.customers"
              :key="customer.name"
              :href="sourceHref('Customer', customer.name)"
              class="rounded-full bg-surface-blue-1 px-2.5 py-1 text-xs font-semibold text-ink-blue-9"
              >{{ customer.customer_name || customer.name }}</a
            >
            <span
              v-if="!data.customers.length"
              class="text-xs text-ink-gray-6"
              >{{ __('Sin cuenta de cliente') }}</span
            >
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import SectionAvailability from '@/components/doco/contact/SectionAvailability.vue'
import { computed, defineComponent, h } from 'vue'
import { createResource } from 'frappe-ui'
import { KpiGrid, KpiTile } from '@/components/ui'
import { sourceHref } from '@/utils/shellRoutes'

const props = defineProps({
  docname: { type: String, required: true },
  selectedCustomer: { type: String, default: '' },
})
const resource = createResource({
  url: 'doco_marketing.api.contact360.get_contact_overview',
  params: { contact: props.docname, customer: props.selectedCustomer || null },
  // No persistent cache: private amounts/records must never render for another
  // selected account or user before the server re-authorizes them.
  auto: true,
})
const data = computed(() => resource.data || null)
const rollups = computed(() => data.value?.rollup?.by_currency || [])

// Money besides the balance, only when it is not zero.
function moneyTiles(rollup) {
  return [
    { label: __('Facturado'), amount: rollup.invoiced },
    { label: __('Pagado'), amount: rollup.paid },
    { label: __('Notas de crédito'), amount: rollup.credited, tone: 'warning' },
  ]
    .filter((t) => Number(t.amount) > 0)
    .map((t) => ({
      label: t.label,
      value: money(t.amount, rollup.currency),
      tone: t.tone || 'neutral',
    }))
}
const countTiles = computed(() => {
  const counts = data.value?.counts || {}
  return [
    { label: __('Tratos'), n: counts.deals },
    { label: __('Reparaciones'), n: counts.repairs },
    {
      label: __('Garantías activas'),
      n: counts.active_warranties,
      tone: 'success',
    },
    { label: __('Facturas'), n: counts.invoices },
    data.value?.has_storefront && {
      label: __('Pedidos tienda'),
      n: counts.storefront_orders,
      tone: counts.open_storefront_orders > 0 ? 'warning' : 'neutral',
    },
    data.value?.has_saldo && { label: __('Recargas'), n: counts.recargas },
  ]
    .filter((t) => t && Number(t.n) > 0)
    .map((t) => ({
      label: t.label,
      value: String(t.n),
      tone: t.tone || 'neutral',
    }))
})
const Row = defineComponent({
  props: { label: String, value: String },
  setup(p) {
    return () =>
      h('div', { class: 'flex items-start justify-between gap-3' }, [
        h('dt', { class: 'text-ink-gray-6' }, p.label),
        h(
          'dd',
          { class: 'text-right font-medium text-ink-gray-8' },
          p.value || '—',
        ),
      ])
  },
})

function money(value, currency) {
  if (value == null || !currency) return '—'
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(
    Number(value),
  )
}
function date(value, withTime = false) {
  if (!value) return '—'
  const parsed = new Date(value)
  return new Intl.DateTimeFormat(
    'es-MX',
    withTime
      ? { dateStyle: 'medium', timeStyle: 'short' }
      : { dateStyle: 'medium' },
  ).format(parsed)
}
</script>
