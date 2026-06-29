<!--
  Social — content calendar + composer (MA-23, S5). Month grid of scheduled posts
  (colored by status) + an unscheduled-drafts tray + a composer modal (text/link
  posts; media lands in S8). Data: doco_marketing.api.social.* + services/social.publish.
-->
<template>
  <div class="scb flex min-h-0 w-full flex-1 flex-col overflow-y-auto bg-surface-gray-2">
    <!-- toolbar -->
    <div class="flex h-[52px] flex-none items-center justify-between border-b border-outline-gray-1 bg-surface-white px-5">
      <div class="flex items-center gap-3">
        <span class="text-[15px] font-bold text-ink-gray-9">{{ __('Social') }}</span>
        <div class="flex overflow-hidden rounded-lg border border-outline-gray-2 text-[11.5px] font-semibold">
          <button class="px-2.5 py-1" :class="view === 'calendar' ? 'bg-surface-gray-7 text-ink-white' : 'text-ink-gray-6'" @click="view = 'calendar'">{{ __('Calendario') }}</button>
          <button class="px-2.5 py-1" :class="view === 'metrics' ? 'bg-surface-gray-7 text-ink-white' : 'text-ink-gray-6'" @click="showMetrics">{{ __('Métricas') }}</button>
        </div>
        <select
          v-if="isManager || shopOptions.length > 1"
          v-model="shop" @change="onShopChange"
          class="rounded-lg border border-outline-gray-2 px-2 py-1 text-[12px] font-semibold text-ink-gray-7"
          :title="__('Filtrar por sucursal')"
        >
          <option v-if="isManager" value="">{{ __('Todas las sucursales') }}</option>
          <option v-for="s in shopOptions" :key="s.name" :value="s.name">{{ s.shop_name }}</option>
        </select>
        <div v-if="view === 'calendar'" class="flex items-center gap-1">
          <button class="rounded-md px-1.5 py-1 text-ink-gray-6 hover:bg-surface-gray-2" @click="shiftMonth(-1)">‹</button>
          <span class="min-w-[140px] text-center text-[13px] font-semibold capitalize text-ink-gray-8">{{ monthLabel }}</span>
          <button class="rounded-md px-1.5 py-1 text-ink-gray-6 hover:bg-surface-gray-2" @click="shiftMonth(1)">›</button>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button v-if="isManager" class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2" @click="openShops" :title="__('Asignar empleados a sucursales')">
          {{ __('Sucursales') }}
        </button>
        <button v-if="isManager" class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink-gray-7 disabled:opacity-50" :disabled="bulkBusy" @click="bulkDraft" :title="__('Un borrador IA por cada sucursal, desde su inventario')">
          {{ bulkBusy ? __('✨ generando…') : __('✨ IA · todas') }}
        </button>
        <button class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink-gray-7 disabled:opacity-50" :disabled="aiBusy" @click="aiDraft" :title="__('Genera un borrador desde el inventario con IA')">
          {{ aiBusy ? __('✨ generando…') : __('✨ Borrador IA') }}
        </button>
        <button class="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white" style="background:#16a34a" @click="openNew()">
          + {{ __('Nueva publicación') }}
        </button>
      </div>
    </div>

    <div v-if="view === 'calendar'" class="p-4">
      <!-- weekday header -->
      <div class="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wide text-ink-gray-4">
        <div v-for="d in weekdays" :key="d">{{ d }}</div>
      </div>
      <!-- month grid -->
      <div class="mt-1 grid grid-cols-7 gap-1">
        <div
          v-for="day in days"
          :key="day.key"
          class="min-h-[92px] rounded-lg border p-1 text-left"
          :class="[
            day.inMonth ? 'border-outline-gray-2 bg-surface-white' : 'border-transparent bg-surface-gray-1/50',
            dragOver === day.key ? 'ring-2 ring-green-400' : '',
          ]"
          @click="openNew(day)"
          @dragover.prevent="dragOver = day.key"
          @dragleave="dragOver = (dragOver === day.key ? '' : dragOver)"
          @drop="onDrop(day)"
        >
          <div class="mb-0.5 text-[11px]" :class="day.isToday ? 'font-bold text-ink-green-3' : 'text-ink-gray-4'">{{ day.n }}</div>
          <div class="flex flex-col gap-0.5">
            <button
              v-for="p in (postsByDay[day.key] || [])"
              :key="p.name"
              draggable="true"
              class="truncate rounded px-1 py-0.5 text-left text-[10.5px] font-medium"
              :class="chip(p.status)"
              :title="p.title + ' · ' + p.status + ' · ' + __('arrastra para reprogramar')"
              @click.stop="openEdit(p)"
              @dragstart="dragged = p"
              @dragend="dragged = null"
            >{{ chanIcons(p.channels) }} {{ p.title || p.name }}</button>
          </div>
        </div>
      </div>

      <!-- unscheduled drafts tray -->
      <div v-if="(cal.data?.drafts || []).length" class="mt-4">
        <div class="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink-gray-4">{{ __('Borradores sin programar') }}</div>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="p in cal.data.drafts" :key="p.name"
            draggable="true"
            class="rounded-md px-2 py-1 text-[11.5px] font-medium" :class="chip(p.status)"
            :title="__('arrastra a un día para fecharlo')"
            @click="openEdit(p)"
            @dragstart="dragged = p"
            @dragend="dragged = null"
          >{{ chanIcons(p.channels) }} {{ p.title || p.name }}</button>
        </div>
      </div>
    </div>

    <!-- métricas view (S12) + per-shop leaderboard (D5) -->
    <div v-else class="p-4">
      <!-- per-shop leaderboard / cross-branch roll-up -->
      <div class="mb-2 flex items-center justify-between">
        <span class="text-[10px] font-bold uppercase tracking-wide text-ink-gray-4">{{ __('Por sucursal') }}</span>
        <button class="rounded-md border border-outline-gray-2 px-2 py-1 text-[11px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2" @click="exportLeaderboard">{{ __('Exportar CSV') }}</button>
      </div>
      <div class="mb-5 overflow-hidden rounded-[12px] border border-outline-gray-2 bg-surface-white">
        <table class="w-full text-[12.5px]">
          <thead class="bg-surface-gray-2 text-[10px] font-bold uppercase tracking-wide text-ink-gray-5">
            <tr>
              <th class="px-3 py-2 text-left">{{ __('Sucursal') }}</th>
              <th class="px-3 py-2 text-right">{{ __('Pubs') }}</th>
              <th class="px-3 py-2 text-right">{{ __('Alcance') }}</th>
              <th class="px-3 py-2 text-right">{{ __('Interacción') }}</th>
              <th class="px-3 py-2 text-right">{{ __('Clics') }}</th>
              <th class="px-3 py-2 text-right text-ink-green-3">{{ __('Leads WA') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in lb.data || []" :key="r.shop" class="border-t border-outline-gray-1">
              <td class="px-3 py-2 font-medium text-ink-gray-8">{{ r.shop_name || r.shop }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ r.posts }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ r.reach.toLocaleString() }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ r.engagement.toLocaleString() }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ r.link_clicks.toLocaleString() }}</td>
              <td class="px-3 py-2 text-right font-bold tabular-nums text-ink-green-3">{{ r.leads }}</td>
            </tr>
            <tr v-if="(lb.data || []).length > 1" class="border-t-2 border-outline-gray-2 bg-surface-gray-1 font-bold">
              <td class="px-3 py-2 text-ink-gray-7">{{ __('Total red') }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ lbTotals.posts }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ lbTotals.reach.toLocaleString() }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ lbTotals.engagement.toLocaleString() }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ lbTotals.link_clicks.toLocaleString() }}</td>
              <td class="px-3 py-2 text-right tabular-nums text-ink-green-3">{{ lbTotals.leads }}</td>
            </tr>
            <tr v-if="!(lb.data || []).length"><td colspan="6" class="px-3 py-6 text-center text-ink-gray-4">{{ lb.loading ? __('Cargando…') : __('Sin datos por sucursal todavía.') }}</td></tr>
          </tbody>
        </table>
      </div>

      <span class="mb-2 block text-[10px] font-bold uppercase tracking-wide text-ink-gray-4">{{ __('Por publicación') }}</span>
      <div class="overflow-hidden rounded-[12px] border border-outline-gray-2 bg-surface-white">
        <table class="w-full text-[12.5px]">
          <thead class="bg-surface-gray-2 text-[10px] font-bold uppercase tracking-wide text-ink-gray-5">
            <tr>
              <th class="px-3 py-2 text-left">{{ __('Publicación') }}</th>
              <th class="px-3 py-2 text-right">{{ __('Alcance') }}</th>
              <th class="px-3 py-2 text-right">{{ __('Interacción') }}</th>
              <th class="px-3 py-2 text-right">{{ __('Clics') }}</th>
              <th class="px-3 py-2 text-right text-ink-green-3">{{ __('Leads WA') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in dash.data || []" :key="row.name" class="border-t border-outline-gray-1">
              <td class="px-3 py-2"><div class="font-medium text-ink-gray-8">{{ row.title || row.name }}</div><div class="text-2xs text-ink-gray-4">{{ row.status }} · {{ (row.scheduled_time || '').slice(0, 10) }}</div></td>
              <td class="px-3 py-2 text-right tabular-nums">{{ row.reach.toLocaleString() }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ row.engagement.toLocaleString() }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ row.link_clicks.toLocaleString() }}</td>
              <td class="px-3 py-2 text-right font-bold tabular-nums text-ink-green-3">{{ row.leads }}</td>
            </tr>
            <tr v-if="!(dash.data || []).length"><td colspan="5" class="px-3 py-8 text-center text-ink-gray-4">{{ dash.loading ? __('Cargando…') : __('Sin datos todavía (las métricas se refrescan a diario).') }}</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- composer modal -->
    <template v-if="showComposer">
      <div class="fixed inset-0 z-[300] bg-black/30" @click="showComposer = false" />
      <div class="fixed left-1/2 top-1/2 z-[310] w-[92vw] max-w-[560px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[14px] border border-outline-gray-2 bg-surface-white shadow-xl">
        <div class="flex items-center justify-between border-b border-outline-gray-1 px-4 py-3">
          <span class="text-[14px] font-bold text-ink-gray-9">{{ form.name ? __('Editar publicación') : __('Nueva publicación') }}</span>
          <span v-if="form.status" class="rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="chip(form.status)">{{ form.status }}</span>
        </div>
        <div class="max-h-[68vh] overflow-y-auto p-4">
          <label class="mb-1 block text-[11px] font-semibold text-ink-gray-6">{{ __('Título') }}</label>
          <input v-model="form.title" type="text" class="mb-3 w-full rounded-md border border-outline-gray-2 px-2 py-1.5 text-[13px]" :placeholder="__('Interno')" />

          <label class="mb-1 block text-[11px] font-semibold text-ink-gray-6">{{ __('Sucursal') }}</label>
          <select v-if="isManager" v-model="form.shop" :disabled="!!form.name" class="mb-3 w-full rounded-md border border-outline-gray-2 px-2 py-1.5 text-[13px] disabled:opacity-60">
            <option v-for="s in shopOptions" :key="s.name" :value="s.name">{{ s.shop_name }}</option>
          </select>
          <div v-else class="mb-3 rounded-md bg-surface-gray-1 px-2 py-1.5 text-[12.5px] text-ink-gray-7">{{ shopLabel(form.shop) || '—' }}</div>

          <label class="mb-1 block text-[11px] font-semibold text-ink-gray-6">{{ __('Canales') }}</label>
          <div class="mb-3 flex flex-wrap gap-1.5">
            <button
              v-for="c in channels" :key="c" type="button"
              class="rounded-md border px-2.5 py-1 text-[12px] font-medium"
              :class="form.channels.includes(c) ? 'border-green-500 bg-surface-green-2 text-ink-green-3' : 'border-outline-gray-2 text-ink-gray-6'"
              @click="toggleChannel(c)"
            >{{ c }}</button>
          </div>

          <label class="mb-1 block text-[11px] font-semibold text-ink-gray-6">{{ __('Texto por canal') }}</label>
          <div v-if="!form.channels.length" class="mb-3 text-[11px] text-ink-gray-4">{{ __('Selecciona un canal arriba.') }}</div>
          <div v-for="c in form.channels" :key="c" class="mb-2">
            <span class="text-[10px] font-mono text-ink-gray-5">{{ c }}</span>
            <textarea v-model="form.captions[c]" rows="2" class="w-full rounded-md border border-outline-gray-2 px-2 py-1.5 text-[13px]" :placeholder="__('Caption…')" />
          </div>

          <div class="mb-3 grid grid-cols-2 gap-3">
            <div>
              <label class="mb-1 block text-[11px] font-semibold text-ink-gray-6">{{ __('Programar') }}</label>
              <input v-model="form.scheduled_time" type="datetime-local" class="w-full rounded-md border border-outline-gray-2 px-2 py-1.5 text-[12.5px]" />
            </div>
            <div>
              <label class="mb-1 block text-[11px] font-semibold text-ink-gray-6">{{ __('CTA') }}</label>
              <select v-model="form.cta_type" class="w-full rounded-md border border-outline-gray-2 px-2 py-1.5 text-[12.5px]">
                <option value="WhatsApp">WhatsApp</option>
                <option value="Webshop">Webshop</option>
                <option value="None">{{ __('Ninguno') }}</option>
              </select>
            </div>
          </div>
          <input v-if="form.cta_type !== 'None'" v-model="form.cta_link" type="text" class="mb-2 w-full rounded-md border border-outline-gray-2 px-2 py-1.5 text-[12.5px]" :placeholder="__('Enlace CTA (wa.me / storefront)')" />
          <p class="text-[11px] text-ink-gray-4">{{ __('Imágenes/video: S8. IG feed/Reels = aviso; enlace por bio. FB lleva enlace clicable.') }}</p>

          <!-- live preview — how the post will look on Facebook -->
          <div class="mt-4 border-t border-outline-gray-1 pt-3">
            <div class="mb-2 text-[11px] font-semibold text-ink-gray-6">{{ __('Vista previa (Facebook)') }}</div>
            <FbPostCard
              :page-name="previewPost.pageName"
              :message="previewPost.message"
              :images="previewPost.images"
              :time-label="previewPost.timeLabel"
              :cta="previewPost.cta"
              show-actions
            />
            <p v-if="!previewPost.message && !previewPost.images.length" class="mt-1.5 text-[11px] text-ink-gray-4">
              {{ __('Escribe el texto del canal FB para ver la vista previa.') }}
            </p>
          </div>
        </div>
        <div v-if="form.name && !canCancel" class="border-t border-outline-gray-1 px-4 pt-2 text-[11px] text-ink-gray-5">
          {{ __('Publicación en vivo o cancelada — solo lectura. Despublica desde la cola si hace falta.') }}
        </div>
        <div class="flex flex-wrap items-center justify-end gap-2 border-t border-outline-gray-1 px-4 py-3">
          <button v-if="form.name && canCancel" class="mr-auto rounded-lg px-3 py-1.5 text-[12px] font-semibold text-ink-red-4 hover:bg-surface-red-1" :disabled="busy" @click="cancelPost">{{ __('Cancelar publicación') }}</button>
          <button v-if="isPending" class="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white" style="background:#2563eb" :disabled="busy" @click="approvePost">{{ __('Aprobar') }}</button>
          <button v-if="isPending" class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12px] font-semibold text-ink-red-4" :disabled="busy" @click="rejectPost">{{ __('Rechazar') }}</button>
          <button class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12px] font-semibold text-ink-gray-7 disabled:opacity-50" :disabled="busy || !canCancel" @click="save('Draft')">{{ __('Guardar borrador') }}</button>
          <button class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12px] font-semibold text-ink-gray-7 disabled:opacity-50" :disabled="busy || !canCancel" @click="save('Scheduled')">{{ __('Programar') }}</button>
          <button class="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50" style="background:#16a34a" :disabled="busy || !canCancel" @click="publishNow">{{ busy ? __('…') : __('Publicar ahora') }}</button>
        </div>
      </div>
    </template>

    <!-- sucursales / onboarding modal (D6, manager) -->
    <template v-if="showShops">
      <div class="fixed inset-0 z-[300] bg-black/30" @click="showShops = false" />
      <div class="fixed left-1/2 top-1/2 z-[310] w-[92vw] max-w-[480px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[14px] border border-outline-gray-2 bg-surface-white shadow-xl">
        <div class="flex items-center justify-between border-b border-outline-gray-1 px-4 py-3">
          <span class="text-[14px] font-bold text-ink-gray-9">{{ __('Sucursales y empleados') }}</span>
          <button class="text-ink-gray-5 hover:text-ink-gray-8" @click="showShops = false">✕</button>
        </div>
        <div class="max-h-[68vh] overflow-y-auto p-4">
          <label class="mb-1 block text-[11px] font-semibold text-ink-gray-6">{{ __('Sucursal') }}</label>
          <select v-model="onbShop" @change="onOnbShopChange" class="mb-4 w-full rounded-md border border-outline-gray-2 px-2 py-1.5 text-[13px]">
            <option v-for="s in shopOptions" :key="s.name" :value="s.name">{{ s.shop_name }}</option>
          </select>

          <label class="mb-1 block text-[11px] font-semibold text-ink-gray-6">{{ __('Empleados asignados') }}</label>
          <div v-if="!(employeesRes.data || []).length" class="mb-3 text-[12px] text-ink-gray-4">{{ employeesRes.loading ? __('Cargando…') : __('Nadie asignado todavía.') }}</div>
          <div v-for="u in employeesRes.data || []" :key="u" class="mb-1.5 flex items-center justify-between rounded-md bg-surface-gray-1 px-2.5 py-1.5">
            <span class="text-[12.5px] text-ink-gray-8">{{ u }}</span>
            <button class="text-[11px] font-semibold text-ink-red-4 hover:underline disabled:opacity-50" :disabled="onbBusy" @click="unassignEmp(u)">{{ __('Quitar') }}</button>
          </div>

          <label class="mb-1 mt-4 block text-[11px] font-semibold text-ink-gray-6">{{ __('Agregar empleado') }}</label>
          <div class="flex items-center gap-2">
            <select v-model="newEmp" class="flex-1 rounded-md border border-outline-gray-2 px-2 py-1.5 text-[13px]">
              <option value="">{{ __('Elegir Marketing User…') }}</option>
              <option v-for="u in availableToAssign" :key="u" :value="u">{{ u }}</option>
            </select>
            <button class="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50" style="background:#16a34a" :disabled="onbBusy || !newEmp" @click="assignEmp">{{ __('Asignar') }}</button>
          </div>
          <p class="mt-3 text-[11px] text-ink-gray-4">{{ __('Solo aparecen usuarios con rol Marketing User. El gestor (Marketing Manager) ve todas las sucursales.') }}</p>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { createResource, call as frappeCall, toast } from 'frappe-ui'
import FbPostCard from '@/components/doco/social/FbPostCard.vue'

const weekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const cursor = ref(new Date())

function shiftMonth(d) {
  cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + d, 1)
}

const monthStart = computed(() => new Date(cursor.value.getFullYear(), cursor.value.getMonth(), 1))
const monthLabel = computed(() => monthStart.value.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }))

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const days = computed(() => {
  const first = monthStart.value
  const start = new Date(first)
  start.setDate(1 - ((first.getDay() + 6) % 7)) // Monday-start
  const today = ymd(new Date())
  const out = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    out.push({ key: ymd(d), n: d.getDate(), inMonth: d.getMonth() === first.getMonth(), isToday: ymd(d) === today, date: d })
  }
  return out
})

// ── shop selector (D4) — declared before `cal` so its auto-fetch sees it ──────
const shop = ref('') // '' = all shops (manager); resolved to the lone shop for an employee

const cal = createResource({
  url: 'doco_marketing.api.social.get_calendar',
  makeParams: () => ({ start: days.value[0].key, end: days.value[41].key + ' 23:59:59', shop: shop.value || undefined }),
  auto: true,
})

// métricas view (S12) + per-shop leaderboard (D5)
const view = ref('calendar')
const dash = createResource({
  url: 'doco_marketing.api.social.get_dashboard',
  makeParams: () => ({ shop: shop.value || undefined }),
  auto: false,
})
const lb = createResource({ url: 'doco_marketing.api.social.get_leaderboard', auto: false })
const lbTotals = computed(() => {
  const acc = { posts: 0, reach: 0, impressions: 0, engagement: 0, link_clicks: 0, leads: 0 }
  for (const r of lb.data || []) for (const k in acc) acc[k] += r[k] || 0
  return acc
})
function showMetrics() {
  view.value = 'metrics'
  dash.reload()
  lb.reload()
}

const postsByDay = computed(() => {
  const m = {}
  for (const p of cal.data?.scheduled || []) {
    if (!p.scheduled_time) continue
    // Bucket by the DATE STRING (site-tz naive, as the backend stores it) — NOT a
    // browser-local Date — so a post always lands on its stored day regardless of
    // the operator's browser timezone (frontend-3). Deployment is single-tz (MX).
    const k = p.scheduled_time.slice(0, 10)
    ;(m[k] = m[k] || []).push(p)
  }
  return m
})

// reload when the visible month changes (makeParams picks up the new range)
watch(() => cursor.value, () => cal.reload())

const channelsRes = createResource({ url: 'doco_marketing.api.social.get_channels', auto: true })
const channels = computed(() => channelsRes.data || ['FB Feed', 'FB Reel', 'IG Feed', 'IG Reel', 'IG Story'])

// shop selector data (D4): managers get every enabled shop + the 'Todas' option; an
// employee is auto-pinned to their (single) branch so filters + composer are concrete.
const shopsRes = createResource({ url: 'doco_marketing.api.social.get_shops', auto: true })
const isManager = computed(() => !!shopsRes.data?.is_manager)
const shopOptions = computed(() => shopsRes.data?.shops || [])
const shopLabel = (name) => shopOptions.value.find((s) => s.name === name)?.shop_name || name
watch(shopOptions, (opts) => {
  if (!isManager.value && opts.length && !shop.value) shop.value = opts[0].name
}, { immediate: true })
function onShopChange() {
  cal.reload()
  if (view.value === 'metrics') { dash.reload() }
}

// CSV export of the per-shop leaderboard (D5) — built client-side, no backend file.
function exportLeaderboard() {
  const rows = lb.data || []
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

// ── D6 bulk draft — one AI draft per enabled branch (manager) ─────────────────
const bulkBusy = ref(false)
async function bulkDraft() {
  bulkBusy.value = true
  try {
    const r = await frappeCall('doco_marketing.api.social.bulk_draft', {
      signal: 'new_arrivals', channels: JSON.stringify(['FB Feed']),
    })
    toast.success(__('Borradores IA creados') + ': ' + (r.drafted || []).length)
    if ((r.skipped || []).length) toast.info(__('Sin stock/IA') + ': ' + r.skipped.join(', '))
    cal.reload()
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudieron generar los borradores'))
  } finally {
    bulkBusy.value = false
  }
}

// ── D6 onboarding — assign branch employees (manager) ─────────────────────────
const showShops = ref(false)
const onbShop = ref('')
const onbBusy = ref(false)
const newEmp = ref('')
const assignableRes = createResource({ url: 'doco_marketing.api.social.get_assignable_users', auto: false })
const employeesRes = createResource({
  url: 'doco_marketing.api.social.get_shop_employees',
  makeParams: () => ({ shop: onbShop.value }),
  auto: false,
})
const availableToAssign = computed(() =>
  (assignableRes.data || []).filter((u) => !(employeesRes.data || []).includes(u)),
)
function openShops() {
  onbShop.value = shopOptions.value[0]?.name || ''
  newEmp.value = ''
  showShops.value = true
  assignableRes.reload()
  if (onbShop.value) employeesRes.reload()
}
function onOnbShopChange() {
  newEmp.value = ''
  if (onbShop.value) employeesRes.reload()
}
async function assignEmp() {
  if (!newEmp.value || !onbShop.value) return
  onbBusy.value = true
  try {
    await frappeCall('doco_marketing.api.social.assign_employee', { user: newEmp.value, shop: onbShop.value })
    toast.success(__('Asignado'))
    newEmp.value = ''
    employeesRes.reload()
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo asignar'))
  } finally {
    onbBusy.value = false
  }
}
async function unassignEmp(user) {
  onbBusy.value = true
  try {
    await frappeCall('doco_marketing.api.social.unassign_employee', { user, shop: onbShop.value })
    toast.success(__('Quitado'))
    employeesRes.reload()
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo quitar'))
  } finally {
    onbBusy.value = false
  }
}

function chip(status) {
  return {
    Draft: 'bg-surface-gray-2 text-ink-gray-6',
    'Pending Approval': 'bg-surface-amber-1 text-ink-amber-3',
    Scheduled: 'bg-surface-blue-2 text-ink-blue-3',
    Publishing: 'bg-surface-blue-2 text-ink-blue-3',
    Published: 'bg-surface-green-2 text-ink-green-3',
    'Partially Published': 'bg-surface-amber-1 text-ink-amber-3',
    Failed: 'bg-surface-red-1 text-ink-red-4',
    Cancelado: 'bg-surface-gray-2 text-ink-gray-4 line-through',
  }[status] || 'bg-surface-gray-2 text-ink-gray-6'
}

function chanIcons(chs) {
  const has = (p) => (chs || []).some((c) => c.startsWith(p))
  return (has('FB') ? '🟦' : '') + (has('IG') ? '🟪' : '')
}

// ── drag-reschedule ──────────────────────────────────────────────────────
const dragged = ref(null)
const dragOver = ref('')
async function onDrop(day) {
  dragOver.value = ''
  const p = dragged.value
  dragged.value = null
  if (!p) return
  const t = (p.scheduled_time || '').slice(11, 16) || '10:00'
  try {
    await frappeCall('doco_marketing.api.social.reschedule', { name: p.name, scheduled_time: `${day.key} ${t}:00` })
    toast.success(__('Reprogramado'))
    cal.reload()
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo reprogramar'))
  }
}

// ── composer ───────────────────────────────────────────────────────────────
const showComposer = ref(false)
const busy = ref(false)
const blank = () => ({ name: '', title: '', shop: '', channels: [], captions: {}, scheduled_time: '', cta_type: 'WhatsApp', cta_link: '', status: '' })
const form = ref(blank())
// live FB preview for the composer (FbPostCard) — bound to the FB caption + CTA + schedule
const previewPost = computed(() => {
  const caps = form.value.captions || {}
  const msg = caps['FB Feed'] || caps['FB Reel'] || Object.values(caps).find(Boolean) || ''
  const cta =
    form.value.cta_type && form.value.cta_type !== 'None'
      ? { label: form.value.cta_link || '', button: form.value.cta_type === 'WhatsApp' ? 'WhatsApp' : __('Ver más') }
      : null
  let timeLabel = __('Borrador')
  if (form.value.scheduled_time) {
    try {
      timeLabel = __('Programado') + ' · ' + new Date(form.value.scheduled_time).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    } catch {
      timeLabel = String(form.value.scheduled_time)
    }
  }
  return {
    pageName: shopLabel(form.value.shop) || __('Tu página'),
    message: msg,
    images: form.value.media_urls || [],
    timeLabel,
    cta,
  }
})
const canCancel = computed(() => !['Published', 'Partially Published', 'Cancelado'].includes(form.value.status))
const isPending = computed(() => !!form.value.name && form.value.status === 'Pending Approval')

// ── AI draft + approval (S11) ────────────────────────────────────────────
const aiBusy = ref(false)
async function aiDraft() {
  aiBusy.value = true
  try {
    const r = await frappeCall('doco_marketing.services.social.ai_draft.ai_draft_now', {
      signal: 'new_arrivals',
      channels: JSON.stringify(['FB Feed']),
      shop: shop.value || undefined,
    })
    toast.success(__('Borrador IA creado'))
    cal.reload()
    await openEdit({ name: r.name }) // open for review
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo generar el borrador'))
  } finally {
    aiBusy.value = false
  }
}

async function approvePost() {
  busy.value = true
  try {
    await frappeCall('doco_marketing.api.social.approve', { name: form.value.name })
    toast.success(__('Aprobado y programado'))
    showComposer.value = false
    cal.reload()
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo aprobar'))
  } finally {
    busy.value = false
  }
}

async function rejectPost() {
  const reason = window.prompt(__('Motivo del rechazo (opcional):'), '')
  if (reason === null) return
  busy.value = true
  try {
    await frappeCall('doco_marketing.api.social.reject', { name: form.value.name, reason })
    toast.success(__('Rechazado'))
    showComposer.value = false
    cal.reload()
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo rechazar'))
  } finally {
    busy.value = false
  }
}

function toDtLocal(dt) {
  return dt ? dt.replace(' ', 'T').slice(0, 16) : ''
}
function fromDtLocal(v) {
  return v ? v.replace('T', ' ') + ':00' : null
}

function openNew(day) {
  form.value = blank()
  // default the new post's branch to the toolbar selection, else the user's first shop
  form.value.shop = shop.value || shopOptions.value[0]?.name || ''
  if (day) form.value.scheduled_time = `${day.key}T10:00`
  showComposer.value = true
}

async function openEdit(p) {
  const doc = await frappeCall('doco_marketing.api.social.get_post', { name: p.name })
  const caps = {}
  for (const c of doc.channels || []) caps[c.channel] = c.caption || ''
  form.value = {
    name: doc.name,
    title: doc.title || '',
    shop: doc.shop || '',
    channels: (doc.channels || []).map((c) => c.channel),
    captions: caps,
    scheduled_time: toDtLocal(doc.scheduled_time),
    cta_type: doc.cta_type || 'WhatsApp',
    cta_link: doc.cta_link || '',
    status: doc.status,
  }
  showComposer.value = true
}

function toggleChannel(c) {
  const i = form.value.channels.indexOf(c)
  if (i >= 0) {
    form.value.channels.splice(i, 1)
  } else {
    form.value.channels.push(c)
    if (!(c in form.value.captions)) form.value.captions[c] = ''
  }
}

function payload(status) {
  return {
    name: form.value.name || undefined,
    title: form.value.title,
    shop: form.value.shop || undefined,
    status,
    source: 'Manual',
    scheduled_time: fromDtLocal(form.value.scheduled_time),
    cta_type: form.value.cta_type,
    cta_link: form.value.cta_type === 'None' ? '' : form.value.cta_link,
    channels: form.value.channels.map((c) => ({ channel: c, caption: form.value.captions[c] || '' })),
  }
}

async function save(status) {
  if (status === 'Scheduled' && (!form.value.scheduled_time || !form.value.channels.length)) {
    toast.error(__('Programar requiere fecha/hora y al menos un canal.'))
    return
  }
  busy.value = true
  try {
    const r = await frappeCall('doco_marketing.api.social.save_post', { payload: JSON.stringify(payload(status)) })
    form.value.name = r.name
    form.value.status = r.status
    toast.success(__('Guardado'))
    showComposer.value = false
    cal.reload()
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo guardar'))
  } finally {
    busy.value = false
  }
}

async function publishNow() {
  if (!form.value.channels.length) {
    toast.error(__('Selecciona al menos un canal.'))
    return
  }
  busy.value = true
  try {
    // "Publicar ahora" = immediate: save WITHOUT a future schedule so the publisher
    // posts now instead of native-scheduling the date field for later.
    const r = await frappeCall('doco_marketing.api.social.save_post', { payload: JSON.stringify({ ...payload('Draft'), scheduled_time: null }) })
    await frappeCall('doco_marketing.services.social.publish.publish_now', { name: r.name })
    toast.success(__('Publicación enviada'))
    showComposer.value = false
  } catch (e) {
    toast.error(e?.messages?.[0] || __('Falló la publicación'))
  } finally {
    busy.value = false
    cal.reload() // reload regardless — the post may have persisted even on publish error
  }
}

async function cancelPost() {
  busy.value = true
  try {
    await frappeCall('doco_marketing.api.social.cancel', { name: form.value.name })
    toast.success(__('Cancelado'))
    showComposer.value = false
    cal.reload()
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo cancelar'))
  } finally {
    busy.value = false
  }
}
</script>
