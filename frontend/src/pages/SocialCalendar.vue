<!--
  Social — content calendar + composer (MA-23, S5). Page SHELL after the W6 B0
  decompose: toolbar + view switch + the manager-only AI composer and branch-onboarding
  modals, delegating the month grid to CalendarGrid, the métricas view to MetricsPanel
  and the create/edit dialog to SocialComposer. Shared calendar data (resources, month
  nav, shop selector) lives in the useSocialCalendar composable. Behavior is unchanged
  from the former 1121-line monolith — this is a pure structural refactor.
  Data: doco_marketing.api.social.* + services/social.publish.
-->
<template>
  <div class="scb flex min-h-0 w-full flex-1 flex-col overflow-y-auto bg-surface-gray-2">
    <!-- toolbar -->
    <div class="flex h-[52px] flex-none items-center justify-between border-b border-outline-gray-1 bg-surface-base px-5">
      <div class="flex items-center gap-3">
        <span class="text-[15px] font-bold text-ink-gray-9">{{ __('Social') }}</span>
        <div class="flex overflow-hidden rounded-lg border border-outline-gray-2 text-[11.5px] font-semibold">
          <button class="px-2.5 py-1" :class="view === 'calendar' ? 'bg-surface-gray-10 text-ink-base' : 'text-ink-gray-6'" @click="view = 'calendar'">{{ __('Calendario') }}</button>
          <button class="px-2.5 py-1" :class="view === 'metrics' ? 'bg-surface-gray-10 text-ink-base' : 'text-ink-gray-6'" @click="showMetrics">{{ __('Métricas') }}</button>
        </div>
        <select
          v-if="isManager || shopOptions.length > 1"
          v-model="shop" @change="onShopChange"
          class="fld rounded-lg border border-outline-gray-2 px-2 py-1 text-[12px] font-semibold"
          :title="__('Filtrar por sucursal')"
        >
          <option v-if="isManager" value="">{{ __('Todas las sucursales') }}</option>
          <option v-for="s in shopOptions" :key="s.name" :value="s.name">{{ s.shop_name }}</option>
        </select>
        <template v-if="view === 'calendar'">
          <div class="flex overflow-hidden rounded-lg border border-outline-gray-2 text-[11px] font-semibold">
            <button v-for="cv in CAL_VIEWS" :key="cv.key" class="px-2 py-1" :class="calView === cv.key ? 'bg-surface-gray-10 text-ink-base' : 'text-ink-gray-6'" @click="calView = cv.key">{{ cv.label }}</button>
          </div>
          <div class="flex items-center gap-1">
            <button class="rounded-md px-1.5 py-1 text-ink-gray-6 hover:bg-surface-gray-2" @click="shift(-1)">‹</button>
            <span class="min-w-[140px] text-center text-[13px] font-semibold capitalize text-ink-gray-8">{{ rangeLabel }}</span>
            <button class="rounded-md px-1.5 py-1 text-ink-gray-6 hover:bg-surface-gray-2" @click="shift(1)">›</button>
          </div>
        </template>
      </div>
      <div class="flex items-center gap-2">
        <router-link to="/social/evergreen" class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2" :title="__('Publicaciones evergreen reutilizables')">
          🌲 {{ __('Biblioteca') }}
        </router-link>
        <router-link to="/social/mentions" class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2" :title="__('Menciones entrantes de clientes')">
          💬 {{ __('Menciones') }}
        </router-link>
        <button v-if="isManager" class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2" @click="openShops" :title="__('Asignar empleados a sucursales')">
          {{ __('Sucursales') }}
        </button>
        <button v-if="isManager" class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink-gray-7 disabled:opacity-50" :disabled="bulkBusy" @click="bulkDraft" :title="__('Un borrador IA por cada sucursal, desde su inventario')">
          {{ bulkBusy ? __('✨ generando…') : __('✨ IA · todas') }}
        </button>
        <button class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink-gray-7 disabled:opacity-50" :disabled="composeBusy" @click="openAiComposer" :title="__('Compositor IA: tipo, temporada, brief y ejemplo')">
          {{ composeBusy ? __('✨ generando…') : __('✨ Borrador IA') }}
        </button>
        <button class="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white" style="background:var(--brand)" @click="openNewPost()">
          + {{ __('Nueva publicación') }}
        </button>
      </div>
    </div>

    <!-- ⏳ pendientes de aprobación — surfaced instead of buried in the grid -->
    <div v-if="pendingPosts.length" class="flex flex-none flex-wrap items-center gap-1.5 border-b border-outline-gray-1 bg-surface-amber-1 px-4 py-2 dark:bg-amber-300/10" role="status">
      <span class="text-[11.5px] font-bold text-ink-amber-6 dark:text-amber-200">⏳ {{ __('Por aprobar') }} ({{ pendingPosts.length }}):</span>
      <button
        v-for="p in pendingPosts.slice(0, 6)"
        :key="p.name"
        class="press max-w-[180px] truncate rounded-md bg-surface-base px-2 py-0.5 text-[11px] font-medium text-ink-gray-8"
        @click="openEditPost(p)"
      >
        {{ p.title || p.name }}
      </button>
      <span v-if="pendingPosts.length > 6" class="text-[11px] text-ink-amber-6">+{{ pendingPosts.length - 6 }}</span>
    </div>

    <!-- filter chips (pillar / status / channel family) — client-side, combinable -->
    <div
      v-if="view === 'calendar' && (visiblePillars.length || visibleStatuses.length || hasFamilies)"
      class="flex flex-none flex-wrap items-center gap-1.5 border-b border-outline-gray-1 bg-surface-base px-4 py-2 text-[11px]"
    >
      <button
        v-for="pl in visiblePillars" :key="'k' + pl.kind"
        class="rounded-full border px-2 py-0.5 font-medium"
        :class="filterKinds.includes(pl.kind) ? pl.chip + ' border-transparent ring-1 ring-gray-400 dark:ring-gray-500' : 'border-outline-gray-2 text-ink-gray-6'"
        @click="toggleFilter('kind', pl.kind)"
      >{{ pl.emoji }} {{ pl.kind }} · {{ filterCounts.kinds[pl.kind] }}</button>
      <span v-if="visiblePillars.length && visibleStatuses.length" class="text-ink-gray-3">|</span>
      <button
        v-for="st in visibleStatuses" :key="'s' + st"
        class="rounded-full border px-2 py-0.5 font-medium"
        :class="filterStatuses.includes(st) ? chip(st) + ' border-transparent ring-1 ring-gray-400 dark:ring-gray-500' : 'border-outline-gray-2 text-ink-gray-6'"
        @click="toggleFilter('status', st)"
      >{{ statusLabel(st) }} · {{ filterCounts.statuses[st] }}</button>
      <span v-if="visibleStatuses.length && hasFamilies" class="text-ink-gray-3">|</span>
      <button
        v-for="fam in CHANNEL_FAMILIES.filter((f) => filterCounts.families[f.key])" :key="'f' + fam.key"
        class="rounded-full border px-2 py-0.5 font-medium"
        :class="filterFamilies.includes(fam.key) ? 'border-transparent bg-surface-gray-3 text-ink-gray-8 ring-1 ring-gray-400 dark:ring-gray-500' : 'border-outline-gray-2 text-ink-gray-6'"
        @click="toggleFilter('family', fam.key)"
      >{{ fam.emoji }} {{ fam.label }} · {{ filterCounts.families[fam.key] }}</button>
      <button v-if="activeFilterCount" class="ml-auto rounded-full px-2 py-0.5 font-semibold text-ink-gray-5 hover:text-ink-gray-8" @click="clearFilters">✕ {{ __('Limpiar') }} ({{ activeFilterCount }})</button>
    </div>

    <!-- calendar (grid + tray) OR métricas -->
    <CalendarGrid
      v-if="view === 'calendar'"
      :days="days"
      :posts-by-day="postsByDay"
      :agenda-days="agendaDays"
      :drafts="visibleDrafts"
      :cal-view="calView"
      :season-by-day="seasonByDay"
      :today-key="todayKey"
      @open-new="openNewPost"
      @open-edit="openEditPost"
      @reschedule="onReschedule"
    />
    <MetricsPanel v-else :dash="dash" :lb="lb" :lb-totals="lbTotals" />

    <!-- AI composer (MA-31 W4): full brief-driven menu replacing the old
         signal dropdown. Generates a Pending-Approval draft and drops the
         operator into the normal edit/Aprobar modal below. -->
    <template v-if="showAiComposer">
      <div class="fixed inset-0 z-[300] bg-black/30 dark:bg-black/60" @click="showAiComposer = false" />
      <div class="fixed left-1/2 top-1/2 z-[310] flex max-h-[92vh] w-[94vw] max-w-[680px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[14px] border border-outline-gray-2 bg-surface-base shadow-xl">
        <div class="flex items-center justify-between border-b border-outline-gray-1 px-4 py-3">
          <span class="text-[14px] font-bold text-ink-gray-9">✨ {{ __('Compositor IA') }}</span>
          <!-- brand kit mini-panel: the palette + rules the generator is bound to -->
          <div v-if="composeOpts?.brand_kit" class="flex items-center gap-1.5 text-[11px] text-ink-gray-6">
            <span
              v-for="c in [composeOpts.brand_kit.brand_primary_color, composeOpts.brand_kit.brand_secondary_color, composeOpts.brand_kit.brand_accent_color].filter(Boolean)"
              :key="c" class="inline-block size-3.5 rounded-full border border-outline-gray-2" :style="{ background: c }" :title="c"
            />
            <span v-if="composeOpts.brand_kit.brand_tagline" class="max-w-[180px] truncate italic">«{{ composeOpts.brand_kit.brand_tagline }}»</span>
          </div>
        </div>
        <div class="flex-1 space-y-3.5 overflow-y-auto px-4 py-3.5">
          <!-- pillar -->
          <div>
            <div class="mb-1 text-[11.5px] font-bold uppercase tracking-wide text-ink-gray-5">{{ __('Tipo de publicación') }}</div>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="k in composeOpts?.kinds || []" :key="k" type="button"
                class="rounded-full border px-3 py-1 text-[12px] font-semibold"
                :class="composeForm.post_kind === k ? 'border-transparent text-white' : 'border-outline-gray-2 text-ink-gray-7 hover:bg-surface-gray-2'"
                :style="composeForm.post_kind === k ? 'background:var(--brand)' : ''"
                @click="composeForm.post_kind = k"
              >{{ KIND_EMOJI[k] || '' }} {{ k }}</button>
            </div>
          </div>
          <!-- season: auto-suggested, clearable -->
          <div>
            <div class="mb-1 text-[11.5px] font-bold uppercase tracking-wide text-ink-gray-5">{{ __('Temporada') }}</div>
            <div class="flex flex-wrap items-center gap-1.5">
              <button
                v-if="suggestedSeason && composeForm.season !== suggestedSeason.name" type="button"
                class="rounded-full border border-dashed border-outline-gray-3 px-3 py-1 text-[12px] text-ink-gray-6 hover:bg-surface-gray-2"
                @click="composeForm.season = suggestedSeason.name"
              >{{ suggestedSeason.emoji }} {{ suggestedSeason.name }} · {{ suggestedSeasonLabel }}</button>
              <select v-model="composeForm.season" class="fld rounded-lg border border-outline-gray-2 px-2 py-1 text-[12.5px]">
                <option :value="null">{{ __('Sin temporada') }}</option>
                <option v-for="s in composeOpts?.seasons || []" :key="s.name" :value="s.name">{{ s.emoji }} {{ s.name }}</option>
              </select>
            </div>
          </div>
          <!-- brief -->
          <div>
            <div class="mb-1 text-[11.5px] font-bold uppercase tracking-wide text-ink-gray-5">
              {{ __('Brief') }}
              <span v-if="['Noticia', 'Testimonio'].includes(composeForm.post_kind)" class="text-ink-red-6">*</span>
            </div>
            <textarea
              v-model="composeForm.brief" rows="3"
              class="fld w-full rounded-lg border border-outline-gray-2 px-2.5 py-1.5 text-[13px]"
              :placeholder="briefPlaceholder"
            />
          </div>
          <!-- reference post few-shot picker -->
          <div v-if="(composeOpts?.recent_posts || []).length">
            <div class="mb-1 text-[11.5px] font-bold uppercase tracking-wide text-ink-gray-5">{{ __('Imitar estilo de…') }} <span class="font-normal normal-case">({{ __('opcional') }})</span></div>
            <div class="flex gap-2 overflow-x-auto pb-1">
              <button
                v-for="p in composeOpts.recent_posts" :key="p.name" type="button"
                class="w-[104px] flex-none overflow-hidden rounded-lg border text-left"
                :class="composeForm.reference_post === p.name ? 'border-blue-500 dark:border-blue-400 ring-1 ring-blue-500 dark:ring-blue-400' : 'border-outline-gray-2 hover:border-outline-gray-3'"
                @click="composeForm.reference_post = composeForm.reference_post === p.name ? null : p.name"
              >
                <img v-if="p.thumb" :src="p.thumb" class="h-[64px] w-full object-cover" loading="lazy" />
                <div v-else class="flex h-[64px] w-full items-center justify-center bg-surface-gray-2 text-[18px]">📝</div>
                <div class="truncate px-1.5 py-1 text-[10.5px] leading-tight text-ink-gray-7">{{ p.title || p.caption_head || p.name }}</div>
              </button>
            </div>
          </div>
          <!-- media source -->
          <div>
            <div class="mb-1 text-[11.5px] font-bold uppercase tracking-wide text-ink-gray-5">{{ __('Imagen') }}</div>
            <div class="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-gray-8">
              <label class="flex items-center gap-1.5"><input v-model="composeForm.media_mode" type="radio" value="products" /> {{ __('Fotos de productos') }}</label>
              <label class="flex items-center gap-1.5" :class="{ 'opacity-40': !composeForm.reference_post }">
                <input v-model="composeForm.media_mode" type="radio" value="reference" :disabled="!composeForm.reference_post" /> {{ __('Reusar las del ejemplo') }}
              </label>
              <label class="flex items-center gap-1.5"><input v-model="composeForm.media_mode" type="radio" value="none" /> {{ __('Sin imagen (la agrego después / Canva)') }}</label>
            </div>
          </div>
          <label class="flex items-center gap-1.5 text-[12.5px] text-ink-gray-8">
            <input v-model="composeForm.evergreen" type="checkbox" /> 🌲 {{ __('Marcar como evergreen (rotable si rinde bien)') }}
          </label>
        </div>
        <div class="flex items-center justify-end gap-2 border-t border-outline-gray-1 px-4 py-3">
          <button class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink-gray-7" @click="showAiComposer = false">{{ __('Cancelar') }}</button>
          <button
            class="rounded-lg px-4 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50" style="background:var(--brand)"
            :disabled="composeBusy || (['Noticia', 'Testimonio'].includes(composeForm.post_kind) && !composeForm.brief.trim())"
            @click="generateCompose"
          >{{ composeBusy ? __('✨ Generando…') : __('✨ Generar borrador') }}</button>
        </div>
      </div>
    </template>

    <!-- composer modal (create/edit) -->
    <SocialComposer
      ref="composerRef"
      :shop="shop"
      :shop-options="shopOptions"
      :is-manager="isManager"
      :channels="channels"
      @reload="cal.reload()"
    />

    <!-- sucursales / onboarding modal (D6, manager) -->
    <template v-if="showShops">
      <div class="fixed inset-0 z-[300] bg-black/30 dark:bg-black/60" @click="showShops = false" />
      <div class="fixed left-1/2 top-1/2 z-[310] w-[92vw] max-w-[480px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[14px] border border-outline-gray-2 bg-surface-base shadow-xl">
        <div class="flex items-center justify-between border-b border-outline-gray-1 px-4 py-3">
          <span class="text-[14px] font-bold text-ink-gray-9">{{ __('Sucursales y empleados') }}</span>
          <button class="text-ink-gray-5 hover:text-ink-gray-8" @click="showShops = false">✕</button>
        </div>
        <div class="max-h-[68vh] overflow-y-auto p-4">
          <label class="mb-1 block text-[11px] font-semibold text-ink-gray-6">{{ __('Sucursal') }}</label>
          <select v-model="onbShop" @change="onOnbShopChange" class="fld mb-4 w-full rounded-md border border-outline-gray-2 px-2 py-1.5 text-[13px]">
            <option v-for="s in shopOptions" :key="s.name" :value="s.name">{{ s.shop_name }}</option>
          </select>

          <label class="mb-1 block text-[11px] font-semibold text-ink-gray-6">{{ __('Empleados asignados') }}</label>
          <div v-if="!(employeesRes.data || []).length" class="mb-3 text-[12px] text-ink-gray-4">{{ employeesRes.loading ? __('Cargando…') : __('Nadie asignado todavía.') }}</div>
          <div v-for="u in employeesRes.data || []" :key="u" class="mb-1.5 flex items-center justify-between rounded-md bg-surface-gray-1 px-2.5 py-1.5">
            <span class="text-[12.5px] text-ink-gray-8">{{ u }}</span>
            <button class="text-[11px] font-semibold text-ink-red-8 hover:underline disabled:opacity-50" :disabled="onbBusy" @click="unassignEmp(u)">{{ __('Quitar') }}</button>
          </div>

          <label class="mb-1 mt-4 block text-[11px] font-semibold text-ink-gray-6">{{ __('Agregar empleado') }}</label>
          <div class="flex items-center gap-2">
            <select v-model="newEmp" class="fld flex-1 rounded-md border border-outline-gray-2 px-2 py-1.5 text-[13px]">
              <option value="">{{ __('Elegir Marketing User…') }}</option>
              <option v-for="u in availableToAssign" :key="u" :value="u">{{ u }}</option>
            </select>
            <button class="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50" style="background:var(--brand)" :disabled="onbBusy || !newEmp" @click="assignEmp">{{ __('Asignar') }}</button>
          </div>
          <p class="mt-3 text-[11px] text-ink-gray-4">{{ __('Solo aparecen usuarios con rol Marketing User. El gestor (Marketing Manager) ve todas las sucursales.') }}</p>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { createResource, call as frappeCall, toast } from 'frappe-ui'
import { useSocialCalendar, KIND_EMOJI, PILLARS, STATUSES, STATUS_LABEL, CHANNEL_FAMILIES, chip } from '@/composables/socialCalendar'
import CalendarGrid from '@/components/doco/social/CalendarGrid.vue'
import MetricsPanel from '@/components/doco/social/MetricsPanel.vue'
import SocialComposer from '@/components/doco/social/SocialComposer.vue'

// ── shared calendar data core (resources, month/week nav, filters, shop selector) ──
const sc = useSocialCalendar()
const {
  calView, rangeLabel, days, shift, todayKey,
  view, dash, lb, lbTotals, showMetrics,
  cal, postsByDay, pendingPosts, agendaDays, visibleDrafts, reschedulePost, seasonByDay,
  filterKinds, filterStatuses, filterFamilies, toggleFilter, clearFilters, activeFilterCount, filterCounts,
  channels, isManager, shopOptions, shop, onShopChange,
} = sc

// calendar sub-view toggle + filter-chip helpers (only surface values with posts)
const CAL_VIEWS = [
  { key: 'month', label: __('Mes') },
  { key: 'week', label: __('Semana') },
  { key: 'list', label: __('Lista') },
]
const statusLabel = (s) => STATUS_LABEL[s] || s
const visiblePillars = computed(() => PILLARS.filter((p) => filterCounts.value.kinds[p.kind]))
const visibleStatuses = computed(() => STATUSES.filter((s) => filterCounts.value.statuses[s]))
const hasFamilies = computed(() => !!(filterCounts.value.families.FB || filterCounts.value.families.IG))

// ── composer handoff (imperative open, via the child's exposed methods) ──────
const composerRef = ref(null)
function openNewPost(day) {
  composerRef.value?.openNew(day)
}
function openEditPost(p) {
  composerRef.value?.openEdit(p)
}
function onReschedule({ post, dayKey }) {
  reschedulePost(post, dayKey)
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

// ── AI composer (MA-31 W4) — replaces the signal dropdown ────────────────
const showAiComposer = ref(false)
const composeBusy = ref(false)
const composeOpts = ref(null)
const composeForm = ref({
  post_kind: 'Producto',
  season: null,
  brief: '',
  reference_post: null,
  media_mode: 'products',
  evergreen: false,
})

const suggestedSeason = computed(
  () => composeOpts.value?.current_season || composeOpts.value?.upcoming_season || null,
)
const suggestedSeasonLabel = computed(() =>
  composeOpts.value?.current_season ? __('ahora') : __('se acerca'),
)
const briefPlaceholder = computed(
  () =>
    ({
      Producto: __('Ej: fundas nuevas de Kitty y micas de hidrogel'),
      Servicio: __('Ej: destacar garantía por escrito en reparaciones'),
      Temporada: __('Ej: promo de temporada en accesorios seleccionados'),
      Noticia: __('Obligatorio: el hecho a anunciar (nuevo horario, servicio, sucursal…)'),
      Testimonio: __('Obligatorio: la historia real del cliente, con sus palabras'),
      Aviso: __('Ej: cerramos el lunes 3 por inventario'),
    })[composeForm.value.post_kind] || '',
)

async function openAiComposer() {
  showAiComposer.value = true
  try {
    composeOpts.value = await frappeCall('doco_marketing.api.social.get_compose_options', {
      shop: shop.value || undefined,
    })
    // Pre-fill the live season only for a Temporada-ish moment; never force it.
    if (composeOpts.value?.current_season && !composeForm.value.season)
      composeForm.value.season = null
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudieron cargar las opciones'))
  }
}

async function generateCompose() {
  composeBusy.value = true
  try {
    const f = composeForm.value
    const r = await frappeCall('doco_marketing.api.social.compose_draft', {
      payload: JSON.stringify({
        shop: shop.value || undefined,
        post_kind: f.post_kind,
        season: f.season || undefined,
        brief: f.brief || '',
        reference_post: f.reference_post || undefined,
        media_mode: f.media_mode,
        evergreen: f.evergreen ? 1 : 0,
        channels: ['FB Feed'],
      }),
    })
    toast.success(__('Borrador IA creado'))
    showAiComposer.value = false
    cal.reload()
    await openEditPost({ name: r.name }) // straight into the normal review/Aprobar view
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo generar el borrador'))
  } finally {
    composeBusy.value = false
  }
}
</script>
