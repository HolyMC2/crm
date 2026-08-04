<!--
  Biblioteca evergreen (W6 C1 SPA — Marco item 5: "ver/marcar el pool de rotación").
  A manager-facing view over the evergreen rotation pool: which published posts are
  flagged evergreen, how often each has been recycled, and when each is next eligible.
  Actions: "Reciclar ahora" (one manual recycle through the same cron path) and
  "Quitar de la biblioteca" (unflag). Backend enforces every permission; the UI just
  mirrors it. Data: doco_marketing.api.social_evergreen.* + api.social.get_shops.

  Self-contained on purpose (no import from composables/socialCalendar.js): that file is
  under concurrent sibling edit this wave, so this page carries its own small helpers to
  stay build-decoupled. Colours use frappe-ui semantic tokens (surface/ink/outline), which
  are theme-aware — light + dark are handled by the token system, not hand-written dark:
  pairs (same convention as SocialCalendar.vue).
-->
<template>
  <div
    data-testid="evergreen-page"
    class="flex min-h-0 w-full flex-1 flex-col overflow-y-auto bg-surface-gray-2"
  >
    <!-- toolbar -->
    <div class="flex min-h-[52px] flex-none flex-wrap items-center justify-between gap-2 border-b border-outline-gray-1 bg-surface-base px-5 py-2">
      <div class="flex items-center gap-3">
        <span class="text-[15px] font-bold text-ink-gray-9">🌲 {{ __('Biblioteca evergreen') }}</span>
        <select
          v-if="isManager || shopOptions.length > 1"
          v-model="shop"
          @change="onShopChange"
          class="rounded-lg border border-outline-gray-2 bg-surface-base px-2 py-1 text-[12px] font-semibold text-ink-gray-7"
          :title="__('Filtrar por sucursal')"
        >
          <option v-if="isManager" value="">{{ __('Todas las sucursales') }}</option>
          <option v-for="s in shopOptions" :key="s.name" :value="s.name">{{ s.shop_name }}</option>
        </select>
      </div>
      <router-link
        to="/social"
        class="text-[12px] font-semibold text-ink-blue-7 hover:underline"
        :title="__('Los borradores reciclados aparecen en Social → Por aprobar')"
      >
        {{ __('Ir al calendario →') }}
      </router-link>
    </div>

    <!-- intro -->
    <p class="flex-none border-b border-outline-gray-1 bg-surface-base px-5 py-2 text-[12px] text-ink-gray-6">
      {{ __('Las publicaciones evergreen son contenido que sigue funcionando: se re-generan como un nuevo borrador (con su misma imagen), nunca un repost idéntico, y siempre pasan por Aprobar.') }}
    </p>

    <div class="flex-1 p-4">
      <!-- loading -->
      <div v-if="pool.loading && !rows.length" class="py-16 text-center text-[13px] text-ink-gray-5">
        {{ __('Cargando…') }}
      </div>

      <!-- empty -->
      <div
        v-else-if="!rows.length"
        class="mx-auto mt-10 max-w-[520px] rounded-2xl border border-dashed border-outline-gray-2 bg-surface-base px-6 py-10 text-center"
      >
        <div class="text-[34px]">🌲</div>
        <div class="mt-2 text-[15px] font-bold text-ink-gray-8">{{ __('Aún no hay publicaciones evergreen') }}</div>
        <p class="mx-auto mt-2 max-w-[420px] text-[12.5px] leading-relaxed text-ink-gray-6">
          {{ __('Marca una publicación como evergreen desde el Compositor IA (casilla «Marcar como evergreen») o al editarla en el calendario. Cuando rinda bien, podrás reciclarla desde aquí.') }}
        </p>
        <router-link
          to="/social"
          class="mt-4 inline-block rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2"
        >
          {{ __('Ir al calendario') }}
        </router-link>
      </div>

      <!-- pool list -->
      <div v-else class="mx-auto flex max-w-[900px] flex-col gap-2.5">
        <div
          v-for="(row, i) in rows"
          :key="row.name"
          :data-testid="`evergreen-row-${i}`"
          class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-outline-gray-2 bg-surface-base px-4 py-3"
        >
          <!-- title + meta -->
          <div class="min-w-[180px] flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-[13.5px] font-semibold text-ink-gray-9">{{ row.title || row.name }}</span>
              <span class="rounded-full bg-surface-gray-2 px-2 py-0.5 text-[10.5px] font-semibold text-ink-gray-7">
                {{ KIND_EMOJI[row.post_kind] || '' }} {{ row.post_kind || __('Sin tipo') }}
              </span>
              <span class="rounded-full px-2 py-0.5 text-[10.5px] font-semibold" :class="chip(row.status)">
                {{ statusLabel(row.status) }}
              </span>
            </div>
            <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-ink-gray-5">
              <span>♻ {{ recycledLabel(row.times_recycled) }}</span>
              <span v-if="row.last_recycled_at">{{ __('Último') }}: {{ fmtDate(row.last_recycled_at) }}</span>
              <span v-if="isManager && shop === '' && row.shop">· {{ shopLabel(row.shop) }}</span>
            </div>
          </div>

          <!-- eligibility -->
          <span
            class="rounded-full px-2.5 py-1 text-[11px] font-semibold"
            :class="available(row) ? 'bg-surface-green-2 text-ink-green-7' : 'bg-surface-amber-1 text-ink-amber-7 dark:bg-amber-300/15 dark:text-amber-200'"
          >
            {{ available(row) ? __('Disponible') : __('En pausa hasta') + ' ' + fmtDate(row.next_eligible) }}
          </span>

          <!-- actions (manager UI; backend re-checks anyway) -->
          <div v-if="isManager" class="flex items-center gap-2">
            <button
              :data-testid="`evergreen-recycle-${i}`"
              class="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
              style="background: var(--brand)"
              :disabled="!available(row) || busy === row.name"
              :title="available(row) ? __('Crear un borrador reciclado ahora') : __('Disponible el') + ' ' + fmtDate(row.next_eligible)"
              @click="recycleNow(row)"
            >
              {{ busy === row.name ? __('♻ …') : __('♻ Reciclar ahora') }}
            </button>
            <button
              :data-testid="`evergreen-toggle-${i}`"
              class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2 disabled:opacity-40"
              :disabled="busy === row.name"
              :title="__('Sacar de la rotación evergreen')"
              @click="askRemove(row)"
            >
              {{ __('Quitar') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- confirm: quitar de la biblioteca -->
    <template v-if="confirmRow">
      <div class="fixed inset-0 z-[300] bg-black/30 dark:bg-black/60" @click="confirmRow = null" />
      <div class="fixed left-1/2 top-1/2 z-[310] w-[92vw] max-w-[420px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[14px] border border-outline-gray-2 bg-surface-base shadow-xl">
        <div class="border-b border-outline-gray-1 px-4 py-3 text-[14px] font-bold text-ink-gray-9">
          {{ __('Quitar de la biblioteca') }}
        </div>
        <div class="px-4 py-4 text-[12.5px] leading-relaxed text-ink-gray-7">
          {{ __('¿Quitar «{0}» de la biblioteca evergreen? Dejará de reciclarse automáticamente. La publicación no se elimina.', [confirmRow.title || confirmRow.name]) }}
        </div>
        <div class="flex items-center justify-end gap-2 border-t border-outline-gray-1 px-4 py-3">
          <button
            class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2"
            @click="confirmRow = null"
          >
            {{ __('Cancelar') }}
          </button>
          <button
            class="rounded-lg bg-surface-red-7 px-3 py-1.5 text-[12.5px] font-semibold text-ink-base disabled:opacity-50"
            :disabled="busy === confirmRow.name"
            @click="removeConfirmed"
          >
            {{ __('Quitar') }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { createResource, call as frappeCall, toast } from 'frappe-ui'

// Kept in-page (not imported from socialCalendar.js) to stay decoupled from that
// concurrently-edited file. Values mirror the calendar's for visual consistency.
const KIND_EMOJI = { Producto: '🛒', Servicio: '🛠', Temporada: '🎉', Noticia: '📣', Testimonio: '💬', Aviso: 'ℹ️' }

function chip(status) {
  return {
    Published: 'bg-surface-green-2 text-ink-green-7',
    'Partially Published': 'bg-surface-amber-1 text-ink-amber-7 dark:bg-amber-300/15 dark:text-amber-200',
    Scheduled: 'bg-surface-blue-2 text-ink-blue-7',
    'Pending Approval': 'bg-surface-amber-1 text-ink-amber-7 dark:bg-amber-300/15 dark:text-amber-200',
    Draft: 'bg-surface-gray-2 text-ink-gray-6',
  }[status] || 'bg-surface-gray-2 text-ink-gray-6'
}
function statusLabel(status) {
  return {
    Published: __('Publicado'),
    'Partially Published': __('Publicado parcial'),
    Scheduled: __('Programado'),
    'Pending Approval': __('Por aprobar'),
    Draft: __('Borrador'),
  }[status] || status
}

function fmtDate(dt) {
  if (!dt) return ''
  const d = new Date(String(dt).replace(' ', 'T'))
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}
function recycledLabel(n) {
  const c = Number(n) || 0
  // {0} args must go through __'s second parameter — a bare __('… {0} …')
  // throws inside translate()'s format() and white-screens the route.
  return c === 0 ? __('Nunca reciclado') : c === 1 ? __('Reciclado 1 vez') : __('Reciclado {0} veces', [c])
}
// Eligible now when it has never been recycled or its cooldown (next_eligible) has passed.
function available(row) {
  if (!row.next_eligible) return true
  const d = new Date(String(row.next_eligible).replace(' ', 'T'))
  return isNaN(d.getTime()) ? true : d <= new Date()
}

// ── shop selector (managers get every branch + "Todas"; an employee is auto-pinned) ──
const shopsRes = createResource({ url: 'doco_marketing.api.social.get_shops', auto: true })
const isManager = computed(() => !!shopsRes.data?.is_manager)
const shopOptions = computed(() => shopsRes.data?.shops || [])
const shopLabel = (name) => shopOptions.value.find((s) => s.name === name)?.shop_name || name
const shop = ref('')
watch(
  shopOptions,
  (opts) => {
    if (!isManager.value && opts.length && !shop.value) shop.value = opts[0].name
  },
  { immediate: true },
)

// ── the pool ──────────────────────────────────────────────────────────────────
const pool = createResource({
  url: 'doco_marketing.api.social_evergreen.get_evergreen_pool',
  makeParams: () => ({ shop: shop.value || undefined }),
  auto: true,
})
function onShopChange() {
  pool.reload()
}

// available first, then whatever order the backend returned (stable sort)
const rows = computed(() => {
  const data = pool.data || []
  return [...data].sort((a, b) => (available(a) === available(b) ? 0 : available(a) ? -1 : 1))
})

// ── actions (backend enforces manager + branch + eligibility regardless) ────────
const busy = ref('')

async function recycleNow(row) {
  if (!available(row) || busy.value) return
  busy.value = row.name
  try {
    await frappeCall('doco_marketing.api.social_evergreen.recycle_now', { name: row.name })
    toast.success(__('Borrador creado — pendiente de aprobación'))
    toast.info(__('Aparece en Social → Por aprobar'))
    pool.reload()
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo reciclar'))
  } finally {
    busy.value = ''
  }
}

const confirmRow = ref(null)
function askRemove(row) {
  confirmRow.value = row
}
async function removeConfirmed() {
  const row = confirmRow.value
  if (!row) return
  busy.value = row.name
  try {
    await frappeCall('doco_marketing.api.social_evergreen.set_evergreen', { name: row.name, on: 0 })
    toast.success(__('Quitado de la biblioteca'))
    confirmRow.value = null
    pool.reload()
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo quitar'))
  } finally {
    busy.value = ''
  }
}
</script>
