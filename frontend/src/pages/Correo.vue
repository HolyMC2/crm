<template>
  <!-- Correo (Shell D12): the emails of the accounts this worker can read,
       Gmail-style. Alerts and repeated subjects fold into category rows; on
       desktop the message opens beside the list. On the phone the page is a
       flex item of the shell's <main> row: min-w-0 flex-1 keeps it at the
       screen width (the chip row and nowrap rows widened it past the edge). -->
  <div class="flex h-full min-w-0 flex-1 flex-col">
    <AppBar
      v-if="isPhone"
      back
      back-label="Más"
      title="Correo"
      :loading="loading"
    />
    <!-- Phone: only the search pill; it opens the mailbox and account chips
         (ui/SearchPanel, as in the Inbox). -->
    <SearchPanel
      v-if="isPhone && !state.categoria"
      v-model:open="searchOpen"
      class="flex-none"
      :query="term"
      placeholder="Buscar en el correo"
      @update:query="onPanelQuery"
    >
      <template v-if="activeChips.length" #active>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="chip in activeChips"
            :key="chip.key"
            type="button"
            :class="chipClass(true)"
            :aria-label="`Quitar filtro ${chip.label}`"
            @click="setQuery(chip.patch)"
          >
            {{ chip.label }}
            <span class="lucide-x size-3 flex-none" aria-hidden="true" />
          </button>
        </div>
      </template>
      <ChipGroup
        label="Bandeja"
        :options="vistas"
        :model-value="state.vista"
        :clear-value="state.vista"
        testid="correo-vista"
        @update:model-value="setQuery({ vista: $event })"
      />
      <ChipGroup
        v-if="cuentas.length > 1"
        label="Cuenta"
        :options="cuentaChips.filter((c) => c.value)"
        :model-value="state.cuenta"
        testid="correo-cuenta"
        @update:model-value="setQuery({ cuenta: $event })"
      />
    </SearchPanel>
    <div class="flex min-h-0 flex-1">
      <div
        ref="listPane"
        class="flex min-h-0 flex-col overflow-y-auto"
        :class="
          isWide ? 'w-96 flex-none border-r border-outline-gray-2' : 'flex-1'
        "
        data-testid="correo-lista"
      >
        <div class="mx-auto w-full max-w-3xl space-y-3 px-4 pb-3 pt-3">
          <h1 v-if="!isPhone" class="text-xl font-semibold text-ink-gray-9">
            Correo
          </h1>
          <form v-if="!isPhone" role="search" @submit.prevent="runSearch">
            <label class="relative block">
              <span class="sr-only">Buscar en el correo</span>
              <span
                class="lucide-search pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-gray-6"
                aria-hidden="true"
              />
              <input
                v-model="term"
                type="search"
                enterkeyhint="search"
                class="h-12 w-full rounded-full border-0 bg-surface-gray-2 pl-10 pr-4 text-base text-ink-gray-9 [&::-webkit-search-cancel-button]:hidden"
                placeholder="Buscar en el correo"
                data-testid="correo-buscar"
                @input="debouncedSearch"
              />
            </label>
          </form>
          <Segmented
            v-if="!state.categoria && !isPhone"
            :model-value="state.vista"
            :options="vistas"
            label="Bandeja"
            @update:model-value="setQuery({ vista: $event })"
          />
          <FilterChips
            v-if="cuentas.length > 1 && !state.categoria && !isPhone"
            :model-value="state.cuenta"
            :chips="cuentaChips"
            label="Cuenta"
            @update:model-value="setQuery({ cuenta: $event })"
          />
          <div
            v-if="state.categoria"
            class="flex items-center gap-1"
            data-testid="correo-categoria"
          >
            <button
              type="button"
              class="flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-8 hover:bg-surface-gray-2"
              aria-label="Volver a la bandeja"
              @click="setQuery({ categoria: '' })"
            >
              <span class="lucide-arrow-left size-5" aria-hidden="true" />
            </button>
            <h2 class="min-w-0 flex-1 break-words text-lg font-semibold">
              {{ categoriaTitle }}
              <span
                v-if="total"
                class="text-base font-normal tabular-nums text-ink-gray-6"
              >
                · {{ total }}</span
              >
            </h2>
          </div>
        </div>

        <EmptyState
          v-if="loading && !rows.length && !categorias.length"
          state="loading"
          title="Cargando correos…"
        />
        <EmptyState
          v-else-if="error && !rows.length"
          state="error"
          title="No se pudo abrir el correo"
          :message="error"
          action="Reintentar"
          @action="load()"
        />
        <EmptyState
          v-else-if="!loading && !rows.length && !categorias.length"
          :title="empty.title"
          :message="empty.message"
        />

        <ul
          v-if="categorias.length"
          class="mx-auto w-full max-w-3xl"
          data-testid="correo-categorias"
        >
          <li v-for="cat in categorias" :key="cat.clave">
            <ListRow
              :icon="
                cat.categoria === 'sistema' ? 'lucide-bell' : 'lucide-inbox'
              "
              :title="categoryLabel(cat).title"
              :subtitle="categoryLabel(cat).line"
              :strong="categoryLabel(cat).fresh"
              @click="setQuery({ categoria: cat.clave })"
            >
              <template #trailing>
                <span
                  class="whitespace-nowrap rounded-full px-2 py-0.5 text-sm font-medium tabular-nums"
                  :class="
                    categoryLabel(cat).fresh
                      ? 'bg-surface-amber-2 text-ink-amber-9'
                      : 'bg-surface-gray-2 text-ink-gray-7'
                  "
                  >{{ categoryLabel(cat).badge }}</span
                >
              </template>
            </ListRow>
          </li>
        </ul>

        <ul
          class="mx-auto w-full max-w-3xl divide-y divide-outline-gray-1"
          data-testid="correo-filas"
        >
          <li v-for="row in rows" :key="row.name">
            <ListRow
              :to="
                isWide
                  ? null
                  : { path: `/correo/${encodeURIComponent(row.name)}` }
              "
              :avatar="isSystem(row.de) ? undefined : senderName(row.de)"
              :icon="isSystem(row.de) ? 'lucide-bell' : ''"
              :title="rowWho(row)"
              :strong="!row.leido"
              :meta="shortWhen(row.fecha)"
              :selected="isWide && row.name === state.m"
              data-testid="correo-fila"
              @click="openRow(row)"
            >
              <template #subtitle>
                <span
                  class="block truncate"
                  :class="
                    row.leido
                      ? 'text-ink-gray-8'
                      : 'font-semibold text-ink-gray-9'
                  "
                  >{{ row.asunto }}</span
                >
                <span v-if="row.snippet" class="block truncate">{{
                  row.snippet
                }}</span>
                <span
                  v-if="documentChip(row.documento)"
                  class="mt-1 inline-flex max-w-full items-center gap-1 rounded-full border border-outline-gray-2 px-2 py-0.5 text-sm text-ink-gray-7"
                >
                  <span
                    class="lucide-file-text size-4 flex-none"
                    aria-hidden="true"
                  />
                  <span class="truncate">{{
                    documentChip(row.documento)
                  }}</span>
                </span>
              </template>
              <template v-if="row.adjuntos" #trailing>
                <span
                  class="lucide-paperclip size-4 text-ink-gray-6"
                  aria-label="Con adjunto"
                />
              </template>
            </ListRow>
          </li>
        </ul>

        <div class="mx-auto w-full max-w-3xl px-4 pb-24 pt-2">
          <button
            v-if="next !== null"
            ref="moreButton"
            type="button"
            :class="BTN.tonal"
            class="w-full"
            :disabled="loadingMore"
            data-testid="correo-mas"
            @click="loadMore"
          >
            {{ loadingMore ? 'Cargando…' : 'Cargar más' }}
          </button>
          <p v-if="recortado" class="pt-2 text-center text-sm text-ink-gray-6">
            Se muestran los correos más recientes; busca para encontrar los
            anteriores.
          </p>
        </div>
      </div>

      <div v-if="isWide" class="min-w-0 flex-1">
        <CorreoMensaje
          v-if="state.m"
          :key="state.m"
          :name="state.m"
          pane
          @changed="refreshRow"
          @close="setQuery({ m: '' })"
        />
        <EmptyState
          v-else
          title="Elige un correo"
          message="Se abre aquí, junto a la lista, con el documento al que pertenece."
        />
      </div>
    </div>
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDebounceFn, useIntersectionObserver } from '@vueuse/core'
import {
  AppBar,
  EmptyState,
  FilterChips,
  ListRow,
  Segmented,
} from '@/components/ui'
import { isMobile as isPhone, isWide } from '@/composables/breakpoint'
import ChipGroup from '@/components/ui/ChipGroup.vue'
import SearchPanel from '@/components/ui/SearchPanel.vue'
import { chipClass } from '@/components/ui/chipClass'
import { BTN } from '@/documentos/tools'
import { createListCache } from '@/utils/listCache'
import {
  bandeja,
  categoryLabel,
  documentChip,
  emptyCopy,
  errorText,
  isSystem,
  rowWho,
  senderName,
  shortWhen,
} from '@/components/correo/correo'

const CorreoMensaje = defineAsyncComponent(
  () => import('@/pages/CorreoMensaje.vue'),
)

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const loadingMore = ref(false)
const error = ref('')
const rows = ref([])
const categorias = ref([])
const cuentas = ref([])
const conteos = ref({})
const next = ref(null)
const total = ref(0)
const recortado = ref(false)
const categoriaTitulo = ref('')
const moreButton = ref(null)
const listPane = ref(null)

const state = computed(() => ({
  vista: route.query.vista === 'enviados' ? 'enviados' : 'recibidos',
  buscar: String(route.query.q || ''),
  cuenta: String(route.query.cuenta || ''),
  categoria: String(route.query.categoria || ''),
  m: String(route.query.m || ''),
}))
const term = ref(state.value.buscar)

const vistas = computed(() => [
  {
    value: 'recibidos',
    label: 'Recibidos',
    count: conteos.value.sin_leer || undefined,
  },
  { value: 'enviados', label: 'Enviados' },
])
const cuentaChips = computed(() => [
  { value: '', label: 'Todas' },
  ...cuentas.value.map((c) => ({
    value: c.name,
    label: c.nombre,
    count: c.sin_leer || undefined,
  })),
])
const categoriaTitle = computed(() => {
  if (state.value.categoria === 'sistema') return 'Avisos del sistema'
  return categoriaTitulo.value || 'Correos repetidos'
})
const empty = computed(() =>
  emptyCopy({
    vista: state.value.vista,
    buscar: state.value.buscar,
    categoria: state.value.categoria,
    cuentas: cuentas.value.length,
  }),
)

function setQuery(patch) {
  const query = { ...route.query, ...patch }
  for (const key of Object.keys(query)) if (!query[key]) delete query[key]
  if ('vista' in patch || 'cuenta' in patch || 'q' in patch)
    delete query.categoria
  router.replace({ query })
}

const searchOpen = ref(false)
function onPanelQuery(text) {
  term.value = text
  debouncedSearch()
}
// Closed phone search: the mailbox (when not Recibidos) and the account, with ×.
const activeChips = computed(() => [
  ...(state.value.vista === 'enviados'
    ? [{ key: 'vista', label: 'Enviados', patch: { vista: '' } }]
    : []),
  ...(state.value.cuenta
    ? [
        {
          key: 'cuenta',
          label:
            cuentaChips.value.find((c) => c.value === state.value.cuenta)
              ?.label || state.value.cuenta,
          patch: { cuenta: '' },
        },
      ]
    : []),
])
const debouncedSearch = useDebounceFn(() => runSearch(), 350)
function runSearch() {
  if (term.value.trim() !== state.value.buscar)
    setQuery({ q: term.value.trim() })
}

function args(inicio = 0) {
  return {
    vista: state.value.vista,
    buscar: state.value.buscar,
    cuenta: state.value.cuenta,
    categoria: state.value.categoria,
    inicio,
    limite: 30,
  }
}

// The tray's last answer paints at once on a visit or a filter change; a
// search is not kept.
const listCache = createListCache('correo', () =>
  state.value.buscar
    ? null
    : [state.value.vista, state.value.cuenta, state.value.categoria],
)
function showTray(out) {
  rows.value = out.filas || []
  categorias.value = out.categorias || []
  if (out.cuentas) cuentas.value = out.cuentas
  conteos.value = out.conteos || {}
  next.value = out.siguiente ?? null
  total.value = out.total || 0
  recortado.value = Boolean(out.recortado)
  categoriaTitulo.value = out.categoria_titulo || ''
}

let ticket = 0
async function load() {
  const mine = ++ticket
  const listAt = listCache.key()
  // The painted copy starts at the top; the read then keeps the worker's place.
  const fromCache = listCache.paint((out) => {
    showTray(out)
    listPane.value?.scrollTo?.({ top: 0 })
  })
  loading.value = true
  error.value = ''
  try {
    const out = (await bandeja(args(0))) || {}
    if (mine !== ticket) return
    showTray(out)
    listCache.save(listAt, out)
    if (!fromCache) listPane.value?.scrollTo?.({ top: 0 })
  } catch (e) {
    if (mine === ticket) error.value = errorText(e)
  } finally {
    if (mine === ticket) loading.value = false
  }
}

async function loadMore() {
  if (next.value === null || loadingMore.value) return
  loadingMore.value = true
  try {
    const out = (await bandeja(args(next.value))) || {}
    const seen = new Set(rows.value.map((r) => r.name))
    rows.value = [
      ...rows.value,
      ...(out.filas || []).filter((r) => !seen.has(r.name)),
    ]
    next.value = out.siguiente ?? null
  } catch (e) {
    error.value = errorText(e)
  } finally {
    loadingMore.value = false
  }
}

useIntersectionObserver(moreButton, ([entry]) => {
  if (entry?.isIntersecting) loadMore()
})

function openRow(row) {
  if (!isWide.value) return
  setQuery({ m: row.name })
}

function refreshRow(change) {
  const row = rows.value.find((r) => r.name === change?.name)
  if (!row) return
  if (change.leido !== undefined) row.leido = change.leido
  if (change.documento !== undefined) row.documento = change.documento
}

watch(
  () => [
    state.value.vista,
    state.value.buscar,
    state.value.cuenta,
    state.value.categoria,
  ],
  () => {
    term.value = state.value.buscar
    load()
  },
  { immediate: true },
)
</script>
