<!--
  MetricsPanel — the Social "Métricas" view (W6 B0 extract from SocialCalendar.vue).
  Per-shop leaderboard / cross-branch roll-up (D5) + per-post dashboard table (S12) +
  client-side CSV export. Reads the get_dashboard / get_leaderboard resources passed
  down from the page; owns no fetching of its own.
-->
<template>
  <div class="p-4">
    <!-- mejores horarios: weekday×hour engagement heatmap (W6 B2), scoped to the
         same shop the dashboard resource is filtered by -->
    <span class="mb-2 block text-[10px] font-bold uppercase tracking-wide text-ink-gray-4">{{ __('Mejores horarios') }}</span>
    <div class="mb-5 rounded-[12px] border border-outline-gray-2 bg-surface-base p-3">
      <SocialHeatmap :shop="heatmapShop" />
    </div>

    <!-- per-shop leaderboard / cross-branch roll-up -->
    <div class="mb-2 flex items-center justify-between">
      <span class="text-[10px] font-bold uppercase tracking-wide text-ink-gray-4">{{ __('Por sucursal') }}</span>
      <button class="rounded-md border border-outline-gray-2 px-2 py-1 text-[11px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2" @click="exportLeaderboard">{{ __('Exportar CSV') }}</button>
    </div>
    <div class="mb-5 overflow-x-auto rounded-[12px] border border-outline-gray-2 bg-surface-base">
      <table class="w-full min-w-[560px] text-[12.5px]">
        <thead class="bg-surface-gray-2 text-[10px] font-bold uppercase tracking-wide text-ink-gray-5">
          <tr>
            <th class="px-3 py-2 text-left">{{ __('Sucursal') }}</th>
            <th class="px-3 py-2 text-right">{{ __('Pubs') }}</th>
            <th class="px-3 py-2 text-right">{{ __('Alcance') }}</th>
            <th class="px-3 py-2 text-right">{{ __('Interacción') }}</th>
            <th class="px-3 py-2 text-right">{{ __('Clics') }}</th>
            <th class="px-3 py-2 text-right text-ink-green-7">{{ __('Leads WA') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in lb.data || []" :key="r.shop" class="border-t border-outline-gray-1">
            <td class="px-3 py-2 font-medium text-ink-gray-8">{{ r.shop_name || r.shop }}</td>
            <td class="px-3 py-2 text-right tabular-nums">{{ r.posts }}</td>
            <td class="px-3 py-2 text-right tabular-nums">{{ r.reach.toLocaleString() }}</td>
            <td class="px-3 py-2 text-right tabular-nums">{{ r.engagement.toLocaleString() }}</td>
            <td class="px-3 py-2 text-right tabular-nums">{{ r.link_clicks.toLocaleString() }}</td>
            <td class="px-3 py-2 text-right font-bold tabular-nums text-ink-green-7">{{ r.leads }}</td>
          </tr>
          <tr v-if="(lb.data || []).length > 1" class="border-t-2 border-outline-gray-2 bg-surface-gray-1 font-bold">
            <td class="px-3 py-2 text-ink-gray-7">{{ __('Total red') }}</td>
            <td class="px-3 py-2 text-right tabular-nums">{{ lbTotals.posts }}</td>
            <td class="px-3 py-2 text-right tabular-nums">{{ lbTotals.reach.toLocaleString() }}</td>
            <td class="px-3 py-2 text-right tabular-nums">{{ lbTotals.engagement.toLocaleString() }}</td>
            <td class="px-3 py-2 text-right tabular-nums">{{ lbTotals.link_clicks.toLocaleString() }}</td>
            <td class="px-3 py-2 text-right tabular-nums text-ink-green-7">{{ lbTotals.leads }}</td>
          </tr>
          <tr v-if="!(lb.data || []).length"><td colspan="6" class="px-3 py-6 text-center text-ink-gray-4">{{ lb.loading ? __('Cargando…') : __('Sin datos por sucursal todavía.') }}</td></tr>
        </tbody>
      </table>
    </div>

    <span class="mb-2 block text-[10px] font-bold uppercase tracking-wide text-ink-gray-4">{{ __('Por publicación') }}</span>
    <div class="overflow-x-auto rounded-[12px] border border-outline-gray-2 bg-surface-base">
      <table class="w-full min-w-[520px] text-[12.5px]">
        <thead class="bg-surface-gray-2 text-[10px] font-bold uppercase tracking-wide text-ink-gray-5">
          <tr>
            <th class="px-3 py-2 text-left">{{ __('Publicación') }}</th>
            <th class="px-3 py-2 text-right">{{ __('Alcance') }}</th>
            <th class="px-3 py-2 text-right">{{ __('Interacción') }}</th>
            <th class="px-3 py-2 text-right">{{ __('Clics') }}</th>
            <th class="px-3 py-2 text-right text-ink-green-7">{{ __('Leads WA') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in dash.data || []" :key="row.name" class="border-t border-outline-gray-1">
            <td class="px-3 py-2"><div class="font-medium text-ink-gray-8">{{ row.title || row.name }}</div><div class="text-2xs text-ink-gray-4">{{ row.status }} · {{ (row.scheduled_time || '').slice(0, 10) }}</div></td>
            <td class="px-3 py-2 text-right tabular-nums">{{ row.reach.toLocaleString() }}</td>
            <td class="px-3 py-2 text-right tabular-nums">{{ row.engagement.toLocaleString() }}</td>
            <td class="px-3 py-2 text-right tabular-nums">{{ row.link_clicks.toLocaleString() }}</td>
            <td class="px-3 py-2 text-right font-bold tabular-nums text-ink-green-7">{{ row.leads }}</td>
          </tr>
          <tr v-if="!(dash.data || []).length"><td colspan="5" class="px-3 py-8 text-center text-ink-gray-4">{{ dash.loading ? __('Cargando…') : __('Sin datos todavía (las métricas se refrescan a diario).') }}</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { toast } from 'frappe-ui'
import SocialHeatmap from '@/components/doco/social/SocialHeatmap.vue'

const props = defineProps({
  dash: { type: Object, required: true },
  lb: { type: Object, required: true },
  lbTotals: { type: Object, required: true },
})

// Reuse the shop the dashboard is already filtered by (dash.makeParams sets
// dash.params.shop synchronously on reload) — the heatmap follows the same branch
// scope without the shell having to thread a new prop through.
const heatmapShop = computed(() => props.dash?.params?.shop || null)

// CSV export of the per-shop leaderboard (D5) — built client-side, no backend file.
function exportLeaderboard() {
  const rows = props.lb.data || []
  if (!rows.length) { toast.error(__('Sin datos para exportar')); return }
  const cols = ['shop_name', 'posts', 'reach', 'impressions', 'engagement', 'link_clicks', 'leads']
  const head = ['Sucursal', 'Publicaciones', 'Alcance', 'Impresiones', 'Interacción', 'Clics', 'Leads WA']
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [head.map(esc).join(',')]
    .concat(rows.map((r) => cols.map((c) => esc(r[c])).join(',')))
    .join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'social-sucursales.csv'
  a.click()
  URL.revokeObjectURL(url)
}
</script>
