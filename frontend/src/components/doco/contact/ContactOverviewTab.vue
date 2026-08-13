<template>
  <section class="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-base">
    <div v-if="resource.loading && !data" class="p-6 text-sm text-ink-gray-5">
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
      <div v-for="rollup in rollups" :key="rollup.currency" class="mb-5">
        <div
          v-if="rollups.length > 1"
          class="mb-2 text-xs font-semibold text-ink-gray-5"
        >
          {{ rollup.currency }}
        </div>
        <div class="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Tile
            :label="__('Saldo')"
            :value="money(rollup.outstanding, rollup.currency)"
            tone="red"
          />
          <Tile
            :label="__('Facturado')"
            :value="money(rollup.invoiced, rollup.currency)"
          />
          <Tile
            :label="__('Pagado')"
            :value="money(rollup.paid, rollup.currency)"
            tone="green"
          />
          <Tile
            :label="__('Notas de crédito')"
            :value="money(rollup.credited, rollup.currency)"
            tone="amber"
          />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Tile :label="__('Tratos')" :value="String(data.counts.deals || 0)" />
        <Tile
          :label="__('Reparaciones')"
          :value="String(data.counts.repairs || 0)"
        />
        <Tile
          :label="__('Garantías activas')"
          :value="String(data.counts.active_warranties || 0)"
          tone="green"
        />
        <Tile
          :label="__('Facturas')"
          :value="String(data.counts.invoices || 0)"
        />
      </div>

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
          class="rounded-xl border border-outline-gray-2 bg-surface-gray-1 p-4"
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
              :href="`/desk/customer/${encodeURIComponent(customer.name)}`"
              target="_blank"
              class="rounded-full bg-surface-blue-1 px-2.5 py-1 text-xs font-semibold text-ink-blue-9"
              >{{ customer.customer_name || customer.name }}</a
            >
            <span
              v-if="!data.customers.length"
              class="text-xs text-ink-gray-5"
              >{{ __('Sin Customer vinculado') }}</span
            >
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, defineComponent, h } from 'vue'
import { createResource } from 'frappe-ui'

const props = defineProps({ docname: { type: String, required: true } })
const resource = createResource({
  url: 'doco_marketing.api.contact360.get_contact_overview',
  params: { contact: props.docname },
  cache: ['contact360-overview', props.docname],
  auto: true,
})
const data = computed(() => resource.data || null)
const rollups = computed(() => data.value?.rollup?.by_currency || [])

const Tile = defineComponent({
  props: {
    label: String,
    value: String,
    tone: { type: String, default: 'gray' },
  },
  setup(p) {
    const tones = {
      gray: 'bg-surface-gray-1 text-ink-gray-9',
      red: 'bg-surface-red-1 text-ink-red-8',
      green: 'bg-surface-green-2 text-ink-green-8',
      amber: 'bg-surface-amber-1 text-ink-amber-7',
    }
    return () =>
      h('div', { class: `rounded-xl p-3 ${tones[p.tone]}` }, [
        h(
          'div',
          { class: 'text-[10px] font-bold uppercase tracking-wide opacity-70' },
          p.label,
        ),
        h(
          'div',
          { class: 'mt-1 truncate text-lg font-bold tabular-nums' },
          p.value || '—',
        ),
      ])
  },
})
const Row = defineComponent({
  props: { label: String, value: String },
  setup(p) {
    return () =>
      h('div', { class: 'flex items-start justify-between gap-3' }, [
        h('dt', { class: 'text-ink-gray-5' }, p.label),
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
