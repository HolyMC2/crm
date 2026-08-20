<!--
  Contact 360 · Recargas — saldo history on the person record.

  Two facts live here and are deliberately NOT added together: recargas this
  person paid for (Customer edge) and recargas made to their line (referencia
  edge). A mother paying for her son's number produces one of each, and a single
  «total» would tell the shop something false about both.

  Only «Success» is money. Failed / Refunded rows are listed — the cashier asks
  «why did it fail» — but never summed.
-->
<template>
  <section class="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-base">
    <div v-if="resource.loading && !data" class="p-6 text-sm text-ink-gray-5">
      {{ __('Cargando recargas…') }}
    </div>
    <div v-else-if="resource.error && !data" class="p-6 text-sm text-ink-red-7">
      {{ __('No se pudieron cargar las recargas.') }}
      <button class="ml-1 font-semibold underline" @click="resource.reload()">
        {{ __('Reintentar') }}
      </button>
    </div>
    <div
      v-else-if="data"
      class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 md:p-6"
    >
      <div class="mb-5 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Metric :label="__('Recargas')" :value="data.summary.total_recargas" />
        <Metric
          :label="__('Exitosas')"
          :value="data.summary.successful"
          :tone="data.summary.successful > 0 ? 'green' : 'gray'"
        />
        <Metric
          :label="__('Importe')"
          :value="money(data.summary.total_amount, data.summary.currency)"
        />
        <Metric
          :label="__('Última')"
          :value="date(data.summary.last_recarga)"
        />
      </div>

      <p class="mb-5 text-xs text-ink-gray-5">
        {{
          __('{0} pagadas por este contacto · {1} hechas a su número', [
            data.summary.paid_by_contact,
            data.summary.to_contact_number,
          ])
        }}
      </p>

      <section v-if="data.numbers.length" class="mb-6">
        <h3 class="mb-2 text-sm font-semibold text-ink-gray-9">
          {{ __('Números') }}
        </h3>
        <div class="grid gap-2 md:grid-cols-2">
          <div
            v-for="row in data.numbers"
            :key="row.referencia"
            class="rounded-xl border border-outline-gray-2 p-3"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="truncate text-sm font-semibold text-ink-gray-9">{{
                row.referencia
              }}</span>
              <Badge
                v-if="row.is_contact_number"
                :label="__('Su número')"
                theme="green"
                size="sm"
              />
            </div>
            <div class="mt-1 text-xs text-ink-gray-5">
              {{ row.carrier || __('Sin compañía') }} · {{ row.count }}
              {{ __('recargas') }} ·
              {{ money(row.amount, data.summary.currency) }}
            </div>
            <div v-if="row.last" class="text-xs text-ink-gray-4">
              {{ __('Última') }}: {{ date(row.last) }}
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 class="mb-2 text-sm font-semibold text-ink-gray-9">
          {{ __('Historial') }}
        </h3>
        <div
          v-if="!data.recargas.length"
          class="rounded-xl border border-outline-gray-2 p-8 text-center text-sm text-ink-gray-5"
        >
          {{ __('Sin recargas registradas.') }}
        </div>

        <div
          v-else
          class="hidden overflow-x-auto rounded-xl border border-outline-gray-2 md:block"
        >
          <div class="min-w-[860px]">
            <div
              class="grid grid-cols-[1.1fr_1fr_1.1fr_1fr_0.9fr_0.9fr] gap-x-3 bg-surface-gray-1 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-ink-gray-5"
            >
              <span>{{ __('Número') }}</span
              ><span>{{ __('Compañía') }}</span
              ><span>{{ __('Producto') }}</span
              ><span>{{ __('Estado') }}</span
              ><span>{{ __('Fecha') }}</span
              ><span class="text-right">{{ __('Monto') }}</span>
            </div>
            <div
              v-for="row in data.recargas"
              :key="row.name"
              class="grid grid-cols-[1.1fr_1fr_1.1fr_1fr_0.9fr_0.9fr] items-center gap-x-3 border-t border-outline-gray-1 px-3 py-2 text-sm hover:bg-surface-gray-1"
            >
              <span class="min-w-0">
                <span class="block truncate font-semibold text-ink-gray-9">{{
                  row.referencia || '—'
                }}</span>
                <Badge
                  :label="
                    row.paid_by_contact ? __('La pagó') : __('A su número')
                  "
                  :theme="row.paid_by_contact ? 'blue' : 'gray'"
                  size="sm"
                />
              </span>
              <span class="truncate text-ink-gray-6">{{
                row.saldo_carrier || '—'
              }}</span>
              <span class="truncate text-ink-gray-6">{{
                row.saldo_product || '—'
              }}</span>
              <span class="min-w-0">
                <Badge
                  :label="statusLabel(row.status)"
                  :theme="statusTheme(row.status)"
                  size="sm"
                />
                <span
                  v-if="row.error_message"
                  class="mt-0.5 block truncate text-[11px] text-ink-red-6"
                  :title="row.error_message"
                  >{{ row.error_message }}</span
                >
              </span>
              <span class="text-ink-gray-5">{{ date(row.creation) }}</span>
              <span
                class="text-right font-semibold tabular-nums"
                :class="
                  row.status === 'Success' ? 'text-ink-gray-8' : 'text-ink-gray-4'
                "
                >{{ money(row.amount, data.summary.currency) }}</span
              >
            </div>
          </div>
        </div>

        <div
          v-if="data.recargas.length"
          class="overflow-hidden rounded-xl border border-outline-gray-2 md:hidden"
        >
          <MobileRecordCard
            v-for="row in data.recargas"
            :key="row.name"
            :title="row.referencia || row.name"
            :subtitle="`${row.saldo_carrier || '—'} · ${row.saldo_product || '—'}`"
            :time="date(row.creation)"
          >
            <template #chips>
              <Badge
                :label="statusLabel(row.status)"
                :theme="statusTheme(row.status)"
                size="sm"
              />
              <Badge
                :label="row.paid_by_contact ? __('La pagó') : __('A su número')"
                :theme="row.paid_by_contact ? 'blue' : 'gray'"
                size="sm"
              />
              <span class="text-xs font-semibold text-ink-gray-7">{{
                money(row.amount, data.summary.currency)
              }}</span>
            </template>
          </MobileRecordCard>
        </div>

        <p v-if="data.summary.truncated" class="mt-2 text-xs text-ink-gray-5">
          {{
            __('Mostrando las {0} más recientes de {1}.', [
              data.recargas.length,
              data.summary.total_recargas,
            ])
          }}
        </p>
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
  url: 'doco_marketing.api.contact360.get_contact_saldo',
  params: { contact: props.docname },
  cache: ['contact360-saldo', props.docname],
  auto: true,
})
const data = computed(() => resource.data || null)

const STATUS_LABELS = {
  Success: __('Exitosa'),
  Failed: __('Fallida'),
  Refunded: __('Reembolsada'),
  Pending: __('Pendiente'),
  InProgress: __('En proceso'),
  'Manual Review': __('Revisión manual'),
}
const STATUS_THEMES = {
  Success: 'green',
  Failed: 'red',
  Refunded: 'orange',
  Pending: 'gray',
  InProgress: 'blue',
  'Manual Review': 'orange',
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status || '—'
}
function statusTheme(status) {
  return STATUS_THEMES[status] || 'gray'
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
      green: 'rounded-xl bg-surface-green-2 p-3 text-ink-green-8',
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
