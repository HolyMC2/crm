<!--
  Webshop integration — FCRM redesign (handoff §5.14). KPIs over the storefront_bridge
  (deals tagged source_campaign='SO:<name>'). Data: doco_marketing.api.webshop.*.
-->
<template>
  <div class="scb flex min-h-0 w-full flex-1 flex-col overflow-y-auto bg-surface-gray-2">
    <!-- toolbar -->
    <div class="flex h-[52px] flex-none items-center justify-between border-b border-outline-gray-1 bg-surface-base px-5">
      <div class="flex items-center gap-2">
        <span class="text-[15px] font-bold text-ink-gray-9">{{ __('Webshop') }}</span>
        <span
          class="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
          :class="kpis.connected ? 'text-ink-green-6 bg-surface-green-2' : 'text-ink-gray-6 bg-surface-gray-2'"
        >
          {{ kpis.connected ? '✓ ' + __('Conectado') : __('Desconectado') }}
        </span>
      </div>
      <button class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink-gray-7" :disabled="syncing" @click="sync">
        {{ syncing ? __('Sincronizando…') : __('Sincronizar') }}
      </button>
    </div>

    <div class="p-5">
      <div class="grid grid-cols-5 gap-3">
        <Kpi :label="__('Pedidos en CRM')" :value="kpis.orders_linked || 0" />
        <Kpi :label="__('Ingresos vía CRM')" :value="money(kpis.revenue_via_crm)" color="var(--brand)" />
        <Kpi :label="__('Ticket promedio')" :value="money(kpis.avg_order_value)" />
        <Kpi :label="__('Carritos abandonados')" :value="kpis.cart_abandoned ?? '—'" />
        <Kpi :label="__('Atribución')" :value="kpis.attribution_model || '—'" />
      </div>

      <div class="mt-4 rounded-[12px] border border-outline-gray-2 bg-surface-base p-4">
        <div class="mb-3 text-[13px] font-bold text-ink-gray-9">{{ __('Registro de webhooks') }}</div>
        <div v-if="!logs.length" class="py-4 text-center text-xs text-ink-gray-4">
          {{ __('El puente storefront→CRM es por eventos (Sales Order on_submit); sin registro manual.') }}
        </div>
        <div v-for="(l, i) in logs" :key="i" class="border-b border-outline-gray-1 py-2 text-[12px] text-ink-gray-7">{{ l.event || l }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, h, ref } from 'vue'
import { createResource, call as frappeCall, toast } from 'frappe-ui'
import { money } from '@/utils/numberFormat'

const kpisRes = createResource({ url: 'doco_marketing.api.webshop.get_webshop_kpis', auto: true })
const logsRes = createResource({ url: 'doco_marketing.api.webshop.get_webhook_logs', auto: true })
const kpis = computed(() => kpisRes.data || {})
const logs = computed(() => logsRes.data || [])

const syncing = ref(false)
async function sync() {
  syncing.value = true
  try {
    const res = await frappeCall('doco_marketing.api.webshop.sync_now')
    toast.success(res?.note || __('Sincronizado'))
    kpisRes.reload()
  } finally {
    syncing.value = false
  }
}

const Kpi = (props) =>
  h('div', { class: 'rounded-[12px] border border-outline-gray-2 bg-surface-base p-4' }, [
    h('div', { class: 'text-[10px] font-semibold uppercase tracking-[.07em] text-ink-gray-4' }, props.label),
    h('div', { class: 'mt-1.5 text-[22px] font-extrabold ' + (props.color ? '' : 'text-ink-gray-9'), style: props.color ? `color:${props.color}` : undefined }, String(props.value)),
  ])
Kpi.props = ['label', 'value', 'color']
</script>
