<template>
  <!-- The availability board in the shell (INMO-SH, inmobiliaria.api.board.get_board):
       the development is the bar's title (tap to change). Each tower reads as
       its floors, top floor first, and each floor as its units: number, price
       and state at a glance, the state also in words where it is not
       «Disponible». One search field: any word of the unit (number, model,
       bedrooms, buyer); under it, the states and towers as chips. A unit
       opens its card and «back» returns here. The board stays live. -->
  <div
    class="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-base"
  >
    <AppBar
      :title="data?.desarrollo?.nombre || 'Disponibilidad'"
      :scopes="scopes"
      :scope="data?.desarrollo?.name || ''"
      scope-title="Elige el desarrollo"
      :back="true"
      back-label="Inmobiliaria"
      :loading="loading && !!data"
      :searchable="!!data && !data.vacio"
      :search="search"
      :search-open="searchOpen"
      search-label="Unidad, modelo, recámaras o comprador"
      data-testid="inmo-tablero-appbar"
      @update:scope="pickDevelopment"
      @update:search="search = $event"
      @update:search-open="searchOpen = $event"
      @back="goBack"
    >
      <template #search-panel>
        <ChipGroup
          label="Estado"
          :options="estados"
          :model-value="estatus"
          data-testid="inmo-tablero-estado"
          @update:model-value="pickStatus"
        />
        <ChipGroup
          v-if="torres.length > 1"
          :label="data?.etiquetas?.grupo || 'Torre'"
          :options="torres"
          :model-value="torre"
          data-testid="inmo-tablero-torre"
          @update:model-value="pickTower"
        />
      </template>
      <template v-if="estatus || torre" #active>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-if="estatus"
            type="button"
            :class="chipClass(true)"
            :aria-label="`Quitar el filtro ${estatus}`"
            data-testid="inmo-tablero-quitar-estado"
            @click="pickStatus('')"
          >
            {{ estatus }}
            <span class="lucide-x size-3 flex-none" aria-hidden="true" />
          </button>
          <button
            v-if="torre"
            type="button"
            :class="chipClass(true)"
            :aria-label="`Quitar el filtro ${torreLabel(torre)}`"
            @click="pickTower('')"
          >
            {{ torreLabel(torre) }}
            <span class="lucide-x size-3 flex-none" aria-hidden="true" />
          </button>
        </div>
      </template>
    </AppBar>
    <div class="flex-1 overflow-y-auto pb-24">
      <EmptyState
        v-if="problem && !data"
        state="error"
        title="No se pudo abrir la disponibilidad"
        :message="problem"
        action="Reintentar"
        @action="load"
      >
        <Button
          variant="subtle"
          class="min-h-11"
          label="Volver al inicio"
          data-testid="inmo-tablero-salida"
          @click="volverA(router, '/crm/inmobiliaria')"
        />
      </EmptyState>
      <!-- Opening: floors of grey tiles where the units will land. -->
      <div
        v-else-if="!data"
        class="flex animate-pulse flex-col gap-2 px-4 pt-4 motion-reduce:animate-none"
        role="status"
        aria-label="Abriendo…"
        data-testid="inmo-tablero-esqueleto"
      >
        <span class="mb-2 h-4 w-48 rounded-full bg-surface-gray-2" />
        <div v-for="n in 6" :key="n" class="flex gap-2">
          <span class="w-9 flex-none" />
          <span
            v-for="m in 3"
            :key="m"
            class="h-16 flex-1 rounded-7 bg-surface-gray-1"
          />
        </div>
      </div>
      <!-- Nothing to show yet: say who registers the first development and
           lead back to the worker's lists, never to Desk. -->
      <EmptyState
        v-else-if="data.vacio"
        state="empty"
        title="Todavía no hay desarrollos"
        :message="
          data.puede_crear
            ? 'Aquí verás las unidades de cada desarrollo en cuanto des de alta el primero. Mientras, sigue con las listas de tu inicio.'
            : 'Aquí verás las unidades de cada desarrollo en cuanto un administrador dé de alta el primero. Mientras, sigue con las listas de tu inicio.'
        "
        data-testid="inmo-tablero-vacio"
      >
        <Button
          variant="solid"
          class="min-h-11"
          label="Volver al inicio"
          data-testid="inmo-tablero-salida"
          @click="volverA(router, '/crm/inmobiliaria')"
        />
      </EmptyState>
      <template v-else>
        <!-- Another development or status that failed to load keeps the
             board on screen and says why. -->
        <div
          v-if="problem"
          class="mx-4 mt-2 flex flex-wrap items-center gap-2 rounded-6 bg-surface-red-1 px-3 py-2 text-base text-ink-red-7"
          role="alert"
          data-testid="inmo-tablero-problema"
        >
          <span class="flex-1">{{ problem }}</span>
          <Button variant="subtle" label="Reintentar" @click="load" />
        </div>
        <!-- The development at a glance: what is left and from how much. -->
        <p
          class="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 pt-3 text-base text-ink-gray-7"
          data-testid="inmo-tablero-resumen"
        >
          <span
            ><span class="num text-2xl font-semibold text-ink-gray-9">{{
              totales.disponibles || 0
            }}</span>
            {{ totales.disponibles === 1 ? 'disponible' : 'disponibles' }}
            <span v-if="totales.unidades" class="text-ink-gray-6"
              >de <span class="num">{{ totales.unidades }}</span></span
            ></span
          >
          <span v-if="totales.desde_corto"
            >desde
            <span class="num font-semibold text-ink-gray-9">{{
              totales.desde_corto
            }}</span></span
          >
        </p>
        <!-- The legend is the colour key and the state filter at once. -->
        <div
          class="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-1 pt-2 text-sm text-ink-gray-6"
          aria-hidden="true"
        >
          <span
            v-for="l in leyenda"
            :key="l.estatus"
            class="inline-flex items-center gap-1.5"
          >
            <span :class="['size-2.5 rounded-full', DOT[tone(l.estatus)]]" />
            {{ l.estatus }}
            <span class="num">{{ l.cantidad }}</span>
          </span>
        </div>
        <EmptyState
          v-if="!shown.length"
          state="empty"
          :title="
            search
              ? `Ninguna unidad dice «${search}»`
              : 'Ninguna unidad con ese estado'
          "
          :action="search ? 'Borrar la búsqueda' : 'Ver todas'"
          @action="search ? (search = '') : pickStatus('')"
        />
        <section
          v-for="t in shown"
          :key="t.torre"
          class="px-4 pt-5"
          :data-torre="t.torre"
        >
          <h2
            v-if="t.etiqueta && (shown.length > 1 || torres.length > 1)"
            class="title-face pb-2 text-lg font-semibold text-ink-gray-9"
          >
            {{ t.etiqueta }}
            <span class="text-base font-normal text-ink-gray-6"
              ><span class="num">{{ t.disponibles || 0 }}</span>
              {{ t.disponibles === 1 ? 'disponible' : 'disponibles' }}</span
            >
          </h2>
          <div class="flex flex-col gap-1.5">
            <div
              v-for="n in t.niveles"
              :key="`${t.torre}-${n.nivel}`"
              class="flex items-stretch gap-2"
              :data-nivel="n.nivel"
            >
              <span
                class="num flex w-9 flex-none items-center justify-end pr-1 text-sm text-ink-gray-5"
                :title="floorTitle(n)"
                >{{ n.etiqueta }}</span
              >
              <div
                class="grid flex-1 gap-1.5"
                :style="{ gridTemplateColumns: columns(t) }"
              >
                <RouterLink
                  v-for="u in n.unidades"
                  :key="u.name"
                  :to="unitTo(u)"
                  :class="[
                    'press flex min-h-16 min-w-0 flex-col justify-center rounded-7 px-2.5 py-1.5 transition-colors',
                    CELL[tone(u.estatus)],
                  ]"
                  :aria-label="unitLabel(u, n)"
                  :title="unitLabel(u, n)"
                  :data-unidad="u.name"
                  :data-fresh="live.fresh.value.has(u.name) ? '' : undefined"
                >
                  <span
                    class="num truncate text-lg font-semibold leading-tight text-ink-gray-9"
                    >{{ u.numero || u.name }}</span
                  >
                  <span
                    v-if="u.estatus === 'Disponible' && unitPrice(u)"
                    class="num truncate text-sm leading-tight text-ink-gray-7"
                    >{{ unitPrice(u) }}</span
                  >
                  <span
                    v-else
                    class="truncate text-sm leading-tight"
                    :class="STATE_TEXT[tone(u.estatus)]"
                    >{{ u.estatus }}</span
                  >
                  <span
                    v-if="desktop && (u.cliente_nombre || u.recamaras)"
                    class="truncate text-xs leading-tight text-ink-gray-6"
                    >{{ u.cliente_nombre || roomsText(u) }}</span
                  >
                </RouterLink>
              </div>
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import { useWindowSize } from '@vueuse/core'
import { AppBar, EmptyState } from '@/components/ui'
import ChipGroup from '@/components/ui/ChipGroup.vue'
import { chipClass } from '@/components/ui/chipClass'
import {
  inmobiliariaApi,
  problemText,
  volverA,
} from '@/composables/useInmobiliaria'
import { useLiveList } from '@/composables/liveList'
import { matchTokens } from '@/vendor/muelle-shell/contracts/search'
import { formatDate, formatMoneyCompact } from '@/utils/display'

const route = useRoute()
const router = useRouter()
const { width } = useWindowSize()
const desktop = computed(() => width.value >= 1024)
const data = ref(null)
const loading = ref(false)
const problem = ref('')
const search = ref('')
const searchOpen = ref(false)

// A state's colour, the same on the tile, its dot in the legend and its word.
const TONE = {
  Disponible: 'success',
  Apartada: 'info',
  Vendida: 'neutral',
  Escriturada: 'neutral',
  Bloqueada: 'warning',
  'No disponible': 'muted',
}
const tone = (estatus) => TONE[estatus] || 'neutral'
const CELL = {
  success: 'bg-surface-green-1 hover:bg-surface-green-2',
  info: 'bg-surface-blue-1 hover:bg-surface-blue-2',
  warning: 'bg-surface-amber-1 hover:bg-surface-amber-2',
  neutral: 'bg-surface-gray-2 hover:bg-surface-gray-3',
  muted: 'bg-surface-gray-1 hover:bg-surface-gray-2',
}
const DOT = {
  success: 'bg-surface-green-3',
  info: 'bg-surface-blue-3',
  warning: 'bg-surface-amber-3',
  neutral: 'bg-surface-gray-5',
  muted: 'bg-surface-gray-3',
}
const STATE_TEXT = {
  success: 'text-ink-green-8',
  info: 'text-ink-blue-8',
  warning: 'text-ink-amber-9',
  neutral: 'text-ink-gray-7',
  muted: 'text-ink-gray-6',
}

const desarrollo = computed(() =>
  typeof route.query.desarrollo === 'string' ? route.query.desarrollo : '',
)
const estatus = computed(() =>
  typeof route.query.estatus === 'string' ? route.query.estatus : '',
)
const torre = computed(() =>
  typeof route.query.torre === 'string' ? route.query.torre : '',
)
const scopes = computed(() =>
  (data.value?.desarrollos || []).map((d) => ({
    value: d.name,
    label: d.nombre || d.name,
    count: d.unidades_disponibles || undefined,
  })),
)
const totales = computed(() => data.value?.totales || {})
const leyenda = computed(() =>
  (data.value?.leyenda || []).filter((l) => l.cantidad),
)
const estados = computed(() =>
  leyenda.value.map((l) => ({
    value: l.estatus,
    label: l.estatus,
    count: l.cantidad,
  })),
)
const torres = computed(() =>
  (data.value?.filtros?.grupos || []).map((g) => ({
    value: g.value,
    label: g.label,
  })),
)
const torreLabel = (value) =>
  torres.value.find((t) => t.value === value)?.label || value
const prototipos = computed(() =>
  Object.fromEntries(
    (data.value?.filtros?.prototipos || []).map((p) => [p.name, p.nombre]),
  ),
)

// The towers, floors and units the search leaves; a floor with none goes.
const shown = computed(() => {
  const q = search.value.trim()
  return (data.value?.torres || [])
    .filter((t) => !torre.value || t.torre === torre.value)
    .map((t) => ({
      ...t,
      niveles: t.niveles
        .map((n) => ({
          ...n,
          unidades: q
            ? n.unidades.filter((u) =>
                matchTokens(
                  q,
                  u.numero,
                  u.name,
                  u.tipo_inmueble,
                  prototipos.value[u.prototipo],
                  roomsText(u),
                  u.estatus,
                  u.cliente_nombre,
                  u.vista,
                  floorTitle(n),
                ),
              )
            : n.unidades,
        }))
        .filter((n) => n.unidades.length),
    }))
    .filter((t) => t.niveles.length)
})

// A floor's units side by side as the building has them (four a floor, four
// columns) while each tile keeps room for its number and price; past that,
// as many as fit.
const TILE_MIN = computed(() => (desktop.value ? 136 : 72))
function columns(t) {
  const most = Math.max(1, ...t.niveles.map((n) => n.unidades.length))
  const room =
    (desktop.value ? Math.min(width.value - 120, 1100) : width.value) - 76
  return most * TILE_MIN.value <= room
    ? `repeat(${most}, minmax(0, ${desktop.value ? '11rem' : '1fr'}))`
    : `repeat(auto-fill, minmax(${TILE_MIN.value}px, 1fr))`
}

function floorTitle(n) {
  // A floor label is a bare number on the board ("10"); said aloud it needs its word.
  const nivel = n?.etiqueta
  return /^\d+$/.test(String(nivel || '')) ? `Piso ${nivel}` : nivel || ''
}
function roomsText(u) {
  return u.recamaras ? `${u.recamaras} rec.` : ''
}
function unitPrice(u) {
  if (u.precio_corto) return u.precio_corto
  if (u.precio_renta)
    return `${formatMoneyCompact(u.precio_renta, u.currency || 'MXN')}/mes`
  return ''
}
// What a screen reader (and the tooltip) says of a tile: all of the row.
function unitLabel(u, n) {
  const partes = [
    [u.tipo_inmueble || 'Unidad', u.numero].filter(Boolean).join(' '),
    floorTitle(n),
    u.estatus,
    unitPrice(u),
    roomsText(u),
    u.m2_total ? `${Number(u.m2_total)} m²` : '',
  ]
  if (u.estatus === 'Apartada' && u.apartado_vence)
    partes.push(`apartada hasta ${formatDate(u.apartado_vence)}`)
  if (u.cliente_nombre) partes.push(u.cliente_nombre)
  return partes.filter(Boolean).join(', ')
}
function unitTo(u) {
  return {
    path: `/inmobiliaria/unidad/${encodeURIComponent(u.name)}`,
    query: {
      return_to: route.fullPath.startsWith('/crm')
        ? route.fullPath
        : `/crm${route.fullPath}`,
      return_label: 'Disponibilidad',
    },
  }
}

function pickDevelopment(name) {
  search.value = ''
  router.replace({
    query: {
      ...route.query,
      desarrollo: name,
      estatus: undefined,
      torre: undefined,
    },
  })
}
function pickStatus(value) {
  router.replace({ query: { ...route.query, estatus: value || undefined } })
}
function pickTower(value) {
  router.replace({ query: { ...route.query, torre: value || undefined } })
}
function goBack(event) {
  event.preventDefault()
  if (window.history.state?.back) return router.back()
  router.push('/inmobiliaria')
}

async function load() {
  loading.value = true
  problem.value = ''
  try {
    data.value = await inmobiliariaApi('tablero', {
      desarrollo: desarrollo.value || null,
      estatus: estatus.value || null,
    })
  } catch (e) {
    problem.value = problemText(e)
  } finally {
    loading.value = false
  }
}
const states = () =>
  Object.fromEntries(
    (data.value?.torres || []).flatMap((t) =>
      t.niveles.flatMap((n) => n.unidades.map((u) => [u.name, u.estatus])),
    ),
  )
// A unit a teammate holds or sells changes colour here without a reload, and
// glows for a moment (a new one, or one whose state changed).
const live = useLiveList(
  () => (data.value && !data.value.vacio ? 'Unidad Inmobiliaria' : ''),
  async () => {
    const was = states()
    await load()
    const now = states()
    const names = Object.keys(now)
    live.mark(
      names.filter((n) => was[n] === now[n]),
      names,
    )
  },
)
watch(() => [desarrollo.value, estatus.value], load)
onMounted(load)
</script>
