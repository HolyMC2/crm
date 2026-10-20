<template>
  <!-- The availability board in the shell (INMO-SH, inmobiliaria.api.board.get_board):
       the development is the bar's title (tap to change), status chips with the
       legend's counts. Phone: units as rows by tower. Desktop: each tower as a
       grid of levels. A unit opens its card and «back» returns here. -->
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
      :loading="loading"
      data-testid="inmo-tablero-appbar"
      @update:scope="pickDevelopment"
      @back="goBack"
    />
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
      <EmptyState v-else-if="!data" state="loading" title="Abriendo…" />
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
          class="mx-4 mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-surface-red-1 px-3 py-2 text-base text-ink-red-7"
          role="alert"
          data-testid="inmo-tablero-problema"
        >
          <span class="flex-1">{{ problem }}</span>
          <Button variant="subtle" label="Reintentar" @click="load" />
        </div>
        <div class="px-4 pt-2">
          <p
            class="text-base text-ink-gray-7"
            data-testid="inmo-tablero-resumen"
          >
            {{ resumen }}
          </p>
          <div class="pt-3">
            <FilterChips
              :model-value="estatus"
              :chips="chips"
              label="Estado de la unidad"
              @update:model-value="pickStatus"
            />
          </div>
        </div>
        <EmptyState
          v-if="!units.length"
          state="empty"
          title="Ninguna unidad con ese estado"
          action="Ver todas"
          @action="pickStatus('')"
        />
        <template v-else-if="!desktop">
          <section v-for="t in data.torres" :key="t.torre" class="pt-3">
            <h2
              v-if="t.etiqueta && data.torres.length > 1"
              class="px-4 pb-1 text-lg font-semibold text-ink-gray-9"
            >
              {{ t.etiqueta }}
              <span class="text-base font-normal text-ink-gray-6"
                >· {{ disponiblesText(t.disponibles) }}</span
              >
            </h2>
            <template v-for="n in t.niveles" :key="`${t.torre}-${n.nivel}`">
              <ListRow
                v-for="u in n.unidades"
                :key="u.name"
                :title="unitTitle(u)"
                :subtitle="unitDetail(u, n)"
                :subtitle-lines="2"
                :meta="unitPrice(u)"
                :to="unitTo(u)"
                icon="lucide-building-2"
                :data-unidad="u.name"
              >
                <template #trailing>
                  <StatusChip :label="u.estatus" :tone="TONE[u.estatus]" />
                </template>
              </ListRow>
            </template>
          </section>
        </template>
        <div v-else class="flex flex-col gap-6 px-6 pt-4">
          <section
            v-for="t in data.torres"
            :key="t.torre"
            class="flex flex-col gap-2"
          >
            <h2 class="text-lg font-semibold text-ink-gray-9">
              {{ t.etiqueta || data.desarrollo.nombre }}
              <span class="text-base font-normal text-ink-gray-6"
                >· {{ disponiblesText(t.disponibles) }}</span
              >
            </h2>
            <div
              v-for="n in t.niveles"
              :key="`${t.torre}-${n.nivel}`"
              class="flex items-stretch gap-2"
            >
              <span
                class="flex w-20 shrink-0 items-center text-sm text-ink-gray-6"
                >{{ n.etiqueta }}</span
              >
              <div
                class="grid flex-1 grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2"
              >
                <RouterLink
                  v-for="u in n.unidades"
                  :key="u.name"
                  :to="unitTo(u)"
                  :class="[
                    'flex min-h-16 flex-col justify-center rounded-xl px-3 py-2',
                    CELL[TONE[u.estatus]] || CELL.neutral,
                  ]"
                  :title="`${unitTitle(u)} · ${u.estatus}`"
                  :data-unidad="u.name"
                >
                  <span class="text-base font-semibold text-ink-gray-9">{{
                    u.numero
                  }}</span>
                  <span class="text-sm tabular-nums text-ink-gray-7">{{
                    unitPrice(u) || u.estatus
                  }}</span>
                  <span
                    v-if="u.cliente_nombre"
                    class="truncate text-sm text-ink-gray-6"
                    >{{ u.cliente_nombre }}</span
                  >
                </RouterLink>
              </div>
            </div>
          </section>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import { useWindowSize } from '@vueuse/core'
import {
  AppBar,
  EmptyState,
  FilterChips,
  ListRow,
  StatusChip,
} from '@/components/ui'
import {
  inmobiliariaApi,
  problemText,
  volverA,
} from '@/composables/useInmobiliaria'
import { formatDate, formatMoneyCompact } from '@/utils/display'

const route = useRoute()
const router = useRouter()
const { width } = useWindowSize()
const desktop = computed(() => width.value >= 1024)
const data = ref(null)
const loading = ref(false)
const problem = ref('')

const TONE = {
  Disponible: 'success',
  Apartada: 'info',
  Vendida: 'neutral',
  Escriturada: 'neutral',
  Bloqueada: 'warning',
  'No disponible': 'neutral',
}
const CELL = {
  success: 'bg-surface-green-1',
  info: 'bg-surface-blue-1',
  warning: 'bg-surface-amber-1',
  neutral: 'bg-surface-gray-2',
}

const desarrollo = computed(() =>
  typeof route.query.desarrollo === 'string' ? route.query.desarrollo : '',
)
const estatus = computed(() =>
  typeof route.query.estatus === 'string' ? route.query.estatus : '',
)
const scopes = computed(() =>
  (data.value?.desarrollos || []).map((d) => ({
    value: d.name,
    label: d.nombre || d.name,
    count: d.unidades_disponibles || undefined,
  })),
)
const chips = computed(() =>
  (data.value?.leyenda || [])
    .filter((l) => l.cantidad)
    .map((l) => ({ value: l.estatus, label: l.estatus, count: l.cantidad })),
)
const units = computed(() =>
  (data.value?.torres || []).flatMap((t) =>
    t.niveles.flatMap((n) => n.unidades),
  ),
)
const resumen = computed(() => {
  const t = data.value?.totales || {}
  const partes = [disponiblesText(t.disponibles || 0)]
  if (t.desde_corto) partes.push(`desde ${t.desde_corto}`)
  return partes.join(' · ')
})

function disponiblesText(n) {
  return n === 1 ? '1 disponible' : `${n || 0} disponibles`
}
function unitTitle(u) {
  return [u.tipo_inmueble, u.numero].filter(Boolean).join(' ') || u.name
}
function unitDetail(u, n) {
  // A floor label is a bare number on the board ("10"); in a row it needs its word.
  const nivel = n?.etiqueta
  const partes = [
    /^\d+$/.test(String(nivel || '')) ? `Piso\u00a0${nivel}` : nivel,
  ]
  if (u.recamaras) partes.push(`${u.recamaras}\u00a0rec.`)
  if (u.m2_total) partes.push(`${Number(u.m2_total)}\u00a0m²`)
  if (u.estatus === 'Apartada' && u.apartado_vence)
    partes.push(`apartada hasta ${formatDate(u.apartado_vence)}`)
  if (u.cliente_nombre) partes.push(u.cliente_nombre)
  return partes.filter(Boolean).join(' · ')
}
function unitPrice(u) {
  if (u.precio_corto) return u.precio_corto
  if (u.precio_renta)
    return `${formatMoneyCompact(u.precio_renta, u.currency || 'MXN')} / mes`
  return ''
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
  router.replace({
    query: { ...route.query, desarrollo: name, estatus: undefined },
  })
}
function pickStatus(value) {
  router.replace({ query: { ...route.query, estatus: value || undefined } })
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
watch(() => [desarrollo.value, estatus.value], load)
onMounted(load)
</script>
