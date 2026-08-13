<template>
  <section class="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-base">
    <div v-if="resource.loading && !data" class="p-6 text-sm text-ink-gray-5">
      {{ __('Cargando reparaciones…') }}
    </div>
    <div v-else-if="resource.error && !data" class="p-6 text-sm text-ink-red-7">
      {{ __('No se pudieron cargar las reparaciones.') }}
      <button class="ml-1 font-semibold underline" @click="resource.reload()">
        {{ __('Reintentar') }}
      </button>
    </div>
    <div
      v-else-if="data"
      class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 md:p-6"
    >
      <div class="mb-5 grid grid-cols-3 gap-2">
        <Metric :label="__('Órdenes')" :value="data.summary.total_repairs" />
        <Metric
          :label="__('Garantías activas')"
          :value="data.summary.active_warranties"
          :tone="data.summary.active_warranties > 0 ? 'green' : 'gray'"
        />
        <Metric
          :label="__('Importe')"
          :value="money(data.summary.total_amount, data.summary.currency)"
        />
      </div>

      <section class="mb-6">
        <h3 class="mb-2 text-sm font-semibold text-ink-gray-9">
          {{ __('Órdenes de reparación') }}
        </h3>
        <div
          v-if="!data.repairs.length"
          class="rounded-xl border border-outline-gray-2 p-8 text-center text-sm text-ink-gray-5"
        >
          {{ __('Sin reparaciones registradas.') }}
        </div>
        <div
          v-else
          class="hidden overflow-x-auto rounded-xl border border-outline-gray-2 md:block"
        >
          <div class="min-w-[920px]">
            <div
              class="grid grid-cols-[1.1fr_1.2fr_1.6fr_1fr_1fr_1fr_1fr] gap-x-3 bg-surface-gray-1 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-ink-gray-5"
            >
              <span>{{ __('Folio') }}</span
              ><span>{{ __('Equipo') }}</span
              ><span>{{ __('Falla / servicio') }}</span
              ><span>{{ __('Estado') }}</span
              ><span>{{ __('Laboratorio') }}</span
              ><span>{{ __('Fecha') }}</span
              ><span class="text-right">{{ __('Importe') }}</span>
            </div>
            <a
              v-for="row in data.repairs"
              :key="row.name"
              :href="`/taller/orders/${encodeURIComponent(row.name)}`"
              target="_blank"
              class="grid grid-cols-[1.1fr_1.2fr_1.6fr_1fr_1fr_1fr_1fr] items-center gap-x-3 border-t border-outline-gray-1 px-3 py-2 text-sm hover:bg-surface-gray-1"
            >
              <span class="truncate font-semibold text-ink-blue-link">{{
                row.name
              }}</span>
              <span class="truncate text-ink-gray-8">{{
                row.device_model || '—'
              }}</span>
              <span class="truncate text-ink-gray-6">{{
                row.falla_reportada || row.repair_to_be_done || '—'
              }}</span>
              <span
                ><Badge
                  :label="row.status || __('Sin estado')"
                  :theme="statusTheme(row.status)"
                  size="sm"
              /></span>
              <span class="truncate text-ink-gray-6">{{
                row.laboratorio || '—'
              }}</span>
              <span class="text-ink-gray-5">{{ date(row.creation) }}</span>
              <span
                class="text-right font-semibold tabular-nums text-ink-gray-8"
                >{{ money(row.amount, data.summary.currency) }}</span
              >
            </a>
          </div>
        </div>
        <div
          class="overflow-hidden rounded-xl border border-outline-gray-2 md:hidden"
        >
          <MobileRecordCard
            v-for="row in data.repairs"
            :key="row.name"
            :title="row.device_model || row.name"
            :subtitle="`${row.name} · ${row.repair_to_be_done || row.falla_reportada || __('Sin servicio')}`"
            :time="date(row.creation)"
            @open="openRepair(row.name)"
          >
            <template #chips>
              <Badge
                :label="row.status || __('Sin estado')"
                :theme="statusTheme(row.status)"
                size="sm"
              />
              <span class="text-xs font-semibold text-ink-gray-7">{{
                money(row.amount, data.summary.currency)
              }}</span>
            </template>
          </MobileRecordCard>
        </div>
      </section>

      <section class="mb-6">
        <h3 class="mb-2 text-sm font-semibold text-ink-gray-9">
          {{ __('Garantías') }}
        </h3>
        <div v-if="!data.warranties.length" class="text-sm text-ink-gray-5">
          {{ __('Sin garantías registradas.') }}
        </div>
        <div v-else class="grid gap-2 md:grid-cols-2">
          <a
            v-for="warranty in data.warranties"
            :key="warranty.repair_order"
            :href="`/taller/orders/${encodeURIComponent(warranty.repair_order)}`"
            target="_blank"
            class="rounded-xl border border-outline-gray-2 bg-surface-gray-1 p-3"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="truncate text-sm font-semibold text-ink-gray-9">{{
                warranty.device_model || warranty.repair_order
              }}</span>
              <Badge
                :label="warranty.active ? __('Vigente') : __('Vencida')"
                :theme="warranty.active ? 'green' : 'gray'"
                size="sm"
              />
            </div>
            <div class="mt-1 text-xs text-ink-gray-5">
              {{ warranty.repair_order }} · {{ __('vence') }}
              {{ date(warranty.expires_on) }}
            </div>
          </a>
        </div>
      </section>

      <section>
        <h3 class="mb-2 text-sm font-semibold text-ink-gray-9">
          {{ __('Equipos') }}
        </h3>
        <div v-if="!data.devices.length" class="text-sm text-ink-gray-5">
          {{ __('Sin equipos identificados.') }}
        </div>
        <div v-else class="grid gap-2 md:grid-cols-2">
          <div
            v-for="(device, index) in data.devices"
            :key="`${device.device_model}-${index}`"
            class="rounded-xl border border-outline-gray-2 p-3"
          >
            <div class="text-sm font-semibold text-ink-gray-9">
              {{ device.device_model }}
            </div>
            <div
              v-if="device.serial_numbers.length"
              class="mt-2 flex flex-wrap gap-1.5"
            >
              <code
                v-for="serial in device.serial_numbers"
                :key="serial.serial_no"
                class="rounded bg-surface-gray-2 px-2 py-1 text-xs text-ink-gray-7"
                >{{ serial.type }}: {{ serial.serial_no }}</code
              >
            </div>
            <div class="mt-2 text-xs text-ink-gray-5">
              {{ __('Órdenes') }}: {{ device.repair_orders.join(', ') }}
            </div>
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
  url: 'doco_marketing.api.contact360.get_contact_repairs',
  params: { contact: props.docname },
  cache: ['contact360-repairs', props.docname],
  auto: true,
})
const data = computed(() => resource.data || null)
const Metric = defineComponent({
  props: {
    label: String,
    value: [String, Number],
    tone: { type: String, default: 'gray' },
  },
  setup(p) {
    return () =>
      h(
        'div',
        {
          class:
            p.tone === 'green'
              ? 'rounded-xl bg-surface-green-2 p-3 text-ink-green-8'
              : 'rounded-xl bg-surface-gray-1 p-3 text-ink-gray-9',
        },
        [
          h(
            'div',
            {
              class: 'text-[10px] font-bold uppercase tracking-wide opacity-70',
            },
            p.label,
          ),
          h(
            'div',
            { class: 'mt-1 truncate text-lg font-bold tabular-nums' },
            String(p.value ?? 0),
          ),
        ],
      )
  },
})
function openRepair(name) {
  window.open(
    `/taller/orders/${encodeURIComponent(name)}`,
    '_blank',
    'noopener',
  )
}
function statusTheme(status) {
  return (
    {
      Entregado: 'green',
      Listo: 'green',
      Cancelado: 'red',
      Diagnóstico: 'blue',
      Reparando: 'orange',
    }[status] || 'gray'
  )
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
</script>
