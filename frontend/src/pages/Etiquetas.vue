<template>
  <div
    ref="scroller"
    class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-etiquetas
  >
    <!-- Phone: the page's own bar (route meta.ownPhoneHeader), back to Productos. -->
    <AppBar
      v-if="phone"
      :back="{ name: 'Productos' }"
      back-label="Volver a Productos"
      context="Productos"
      title="Etiquetas"
    />
    <header
      v-else
      class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-6 pb-3 pt-6"
    >
      <div class="min-w-0">
        <RouterLink
          :to="{ name: 'Productos' }"
          class="mb-1 inline-flex min-h-8 items-center gap-1 text-sm text-ink-gray-6 hover:text-ink-gray-9"
        >
          <span class="lucide-arrow-left size-4" aria-hidden="true" />
          Productos
        </RouterLink>
        <h1 class="title-face text-3xl font-semibold text-ink-gray-9">
          Etiquetas
        </h1>
        <p class="text-sm text-ink-gray-6">
          Precios, anaqueles, piezas con serie o lote: elige qué etiquetar,
          diseña la etiqueta e imprime.
        </p>
      </div>
      <Segmented
        v-if="boot && !bootState"
        :model-value="vista"
        label="Etiquetas"
        :options="vistas"
        class="w-full max-w-sm"
        @update:model-value="setVista"
      />
    </header>

    <EmptyState
      v-if="bootState"
      class="mx-auto my-8 max-w-md"
      :state="bootState.state"
      :title="bootState.title"
      :message="bootState.message"
      :action="bootState.action"
      @action="bootState.run"
    >
      <a
        v-if="bootState.href"
        :href="bootState.href"
        target="_blank"
        rel="noopener"
        class="press inline-flex min-h-11 items-center rounded-6 bg-surface-gray-2 px-4 text-sm font-medium text-ink-gray-9"
        >{{ bootState.hrefLabel }}</a
      >
    </EmptyState>

    <template v-else-if="boot">
      <div v-if="phone" class="px-4 pb-3 pt-2">
        <Segmented
          :model-value="vista"
          label="Etiquetas"
          :options="vistas"
          @update:model-value="setVista"
        />
      </div>

      <!-- ── Imprimir ─────────────────────────────────────────────────
           Phone: the label, its design (a sheet), the list, the print at
           the thumb. Tablet: the list beside the label and its design.
           Desk: list · label · design, the print under the label. -->
      <div
        v-if="vista === 'imprimir'"
        class="grid flex-1 grid-cols-1 items-start gap-4 px-4 pb-4 sm:px-6 md:grid-cols-2 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)_minmax(17rem,20rem)] lg:gap-6"
        data-etq-imprimir
      >
        <!-- The label as it prints. -->
        <section
          class="min-w-0 space-y-2 md:col-start-2 md:row-start-1 lg:sticky lg:top-4"
          aria-label="Así sale"
          data-etq-preview
        >
          <EtqStage
            v-model:index="shownIndex"
            v-model:view="stageView"
            class="h-64 sm:h-72 lg:h-[min(28rem,calc(100dvh-15rem))]"
            :html="previewHtml"
            :size="previewSize"
            :designed="isSize"
            :count="previewShown"
            :offset="previewOffset"
            :total="rows.length"
            :loading="previewing"
            :label="layoutName(currentLayout)"
            :title="stageTitle"
            :empty="previewProblem || 'Elige una medida para ver la etiqueta.'"
          />
          <div class="flex items-baseline justify-between gap-3 px-1 text-sm">
            <p class="min-w-0 truncate text-ink-gray-8" data-etq-caption>
              {{ caption }}
            </p>
            <p v-if="rows.length" class="num flex-none text-ink-gray-6">
              {{ labelsText(total) }}
            </p>
          </div>
          <!-- Desk: the print under the label, in sight. -->
          <div v-if="wide" class="space-y-2 pt-1" data-etq-desk-print>
            <EtqPrintBar
              :label="printLabel(rows)"
              :blocked="blocked"
              :busy="busy"
              :result="result"
              :share="false"
              :pdf="hasSize"
              @print="print"
              @pdf="pdf"
              @retry="retry"
              @download="download"
              @again="sendAgain"
              @job="openJob"
              @clear="clearList(true)"
              @dismiss="result = null"
            />
            <p class="flex items-start gap-2 px-1 text-xs text-ink-gray-6">
              <Icon icon="printer" class="mt-0.5 size-4 flex-none" />
              {{ printerText }}
            </p>
          </div>
          <ul
            v-if="fit.text || fit.notes?.length"
            class="space-y-1 rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-9"
            data-etq-fit
          >
            <li v-if="fit.text">{{ fit.text }}</li>
            <li v-for="note in fit.notes || []" :key="note.key">
              {{ note.text }}
            </li>
          </ul>
          <button
            v-if="narrow"
            type="button"
            class="press flex min-h-14 w-full items-center gap-3 rounded-8 border border-outline-gray-2 px-4 py-2 text-left hover:bg-surface-gray-1"
            data-etq-layout
            @click="designOpen = true"
          >
            <Icon icon="sliders-horizontal" class="size-5 text-ink-gray-7" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-base text-ink-gray-9">{{
                layoutName(currentLayout) || 'Elige la medida'
              }}</span>
              <span class="block truncate text-sm text-ink-gray-6">{{
                isSize ? partsText(design, designMeta.parts) : 'Diseño propio'
              }}</span>
            </span>
            <span class="text-sm font-medium text-ink-gray-8">Diseño</span>
          </button>
          <ul v-if="warnings.length" class="space-y-2" data-etq-warnings>
            <li
              v-for="warning in warnings"
              :key="warning.key"
              class="space-y-2 rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-9"
            >
              <p>{{ warning.text }}</p>
              <div
                v-if="warning.key === 'sin_precio'"
                class="flex flex-wrap gap-2"
              >
                <Button
                  class="press min-h-11"
                  :label="`Quitar ${warning.items.length === 1 ? 'el que no tiene' : `los ${warning.items.length} sin`} precio`"
                  @click="removeUnpriced"
                />
                <Button
                  v-if="warning.items.length === 1"
                  class="press min-h-11"
                  label="Ponerle precio"
                  @click="
                    router.push({
                      name: 'Producto',
                      params: { item: warning.items[0] },
                    })
                  "
                />
              </div>
            </li>
          </ul>
        </section>

        <!-- What to label: one search (type, paste or scan a code), the
             everyday sources, and the list. -->
        <div
          class="min-w-0 space-y-4 md:col-start-1 md:row-span-2 md:row-start-1"
        >
          <section aria-label="Qué etiquetar" class="space-y-2">
            <label class="relative flex items-center">
              <span
                class="lucide-search pointer-events-none absolute left-3.5 size-4 text-ink-gray-5"
                aria-hidden="true"
              />
              <input
                ref="searchBox"
                v-model="query"
                type="search"
                enterkeyhint="done"
                autocomplete="off"
                class="h-12 w-full rounded-full border-0 bg-surface-gray-2 pl-10 pr-10 text-base text-ink-gray-9 placeholder:text-ink-gray-5 focus:ring-2 focus:ring-outline-gray-3"
                placeholder="Nombre, código o escanea"
                aria-label="Agrega un producto: nombre, código o escanea"
                data-etq-search
                @focus="openSearch"
                @blur="closeSearchSoon"
                @keydown.enter.prevent="addTyped"
                @keydown.esc="closeSearch"
              />
              <span
                v-if="searching"
                class="lucide-loader-circle absolute right-3.5 size-4 animate-spin text-ink-gray-5 motion-reduce:animate-none"
                aria-hidden="true"
              />
            </label>
            <ExpandTransition>
              <div
                v-if="panelOpen"
                class="overflow-hidden rounded-8 border border-outline-gray-2 bg-surface-base"
                data-etq-results
              >
                <ul v-if="query.trim()" aria-label="Productos encontrados">
                  <li v-for="item in results" :key="item.item_code">
                    <ListRow
                      :title="item.item_name"
                      :subtitle="resultLine(item)"
                      icon="lucide-package"
                      @click="pickResult(item)"
                    >
                      <template #trailing>
                        <span
                          class="lucide-plus size-5 text-ink-gray-7"
                          aria-hidden="true"
                        />
                      </template>
                    </ListRow>
                  </li>
                  <li
                    v-if="!results.length && !searching"
                    class="px-4 py-3 text-sm text-ink-gray-6"
                  >
                    Ningún producto se llama así. Si es un código, presiona
                    Enter para buscarlo como serie o lote.
                  </li>
                </ul>
                <template v-else>
                  <RecentPicks
                    class="px-3 pt-2"
                    :picks="recent.picks.value"
                    @pick="pickRecent"
                    @clear="recent.clear()"
                  />
                  <p
                    v-if="suggestions.length"
                    class="px-4 pb-1 pt-3 text-xs font-medium text-ink-gray-6"
                  >
                    Editados hace poco
                  </p>
                  <ul v-if="suggestions.length" aria-label="Editados hace poco">
                    <li v-for="item in suggestions" :key="item.item_code">
                      <ListRow
                        :title="item.item_name"
                        :subtitle="resultLine(item)"
                        icon="lucide-package"
                        @click="pickResult(item)"
                      >
                        <template #trailing>
                          <span
                            class="lucide-plus size-5 text-ink-gray-7"
                            aria-hidden="true"
                          />
                        </template>
                      </ListRow>
                    </li>
                  </ul>
                  <p
                    v-else-if="!recent.picks.value.length"
                    class="px-4 py-3 text-sm text-ink-gray-6"
                  >
                    Escribe el nombre o el código, o escanea la etiqueta del
                    proveedor.
                  </p>
                </template>
              </div>
            </ExpandTransition>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="entry in SOURCES"
                :key="entry.key"
                type="button"
                class="press inline-flex min-h-11 items-center gap-2 rounded-full border border-outline-gray-2 px-4 text-sm font-medium text-ink-gray-8 hover:bg-surface-gray-1"
                :title="entry.hint"
                @click="openSource(entry)"
              >
                <Icon :icon="entry.icon" class="size-4" aria-hidden="true" />
                {{ entry.label }}
              </button>
            </div>
          </section>

          <p
            v-if="unknown.length"
            role="status"
            class="flex flex-wrap items-center gap-2 rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-9"
          >
            <span class="min-w-0 flex-1">
              No encontré {{ unknown.join(', ') }}. Revisa el código o búscalo
              por nombre.
            </span>
            <button
              type="button"
              class="press min-h-11 px-2 font-medium"
              @click="unknown = []"
            >
              Entendido
            </button>
          </p>
          <p
            v-if="loadProblem"
            role="alert"
            class="rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
          >
            {{ loadProblem }}
          </p>
          <p
            v-if="more"
            role="status"
            class="rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-9"
          >
            Traje los primeros {{ MAX_ROWS }}: es lo más que sale en una
            impresión. Imprime estos y trae el resto por grupo.
          </p>

          <!-- What will print -->
          <section aria-labelledby="etq-lista" class="space-y-2">
            <div class="flex min-h-11 items-center gap-2">
              <h2
                id="etq-lista"
                class="min-w-0 flex-1 text-base font-semibold text-ink-gray-9"
              >
                Por imprimir
                <span
                  v-if="rows.length"
                  class="num ml-1 font-normal text-ink-gray-6"
                  >{{ labelsText(total) }}</span
                >
              </h2>
              <button
                v-if="rows.length"
                type="button"
                class="press min-h-11 rounded-full px-3 text-sm font-medium"
                :class="
                  confirmClear
                    ? 'bg-surface-red-1 text-ink-red-7'
                    : 'text-ink-gray-7 hover:bg-surface-gray-2'
                "
                @click="clearList"
                @blur="confirmClear = false"
              >
                {{ confirmClear ? 'Vaciar lista' : 'Vaciar' }}
              </button>
            </div>
            <p
              v-if="source"
              class="flex items-center gap-2 text-sm text-ink-gray-7"
              data-etq-source-line
            >
              <span class="lucide-package-open size-4" aria-hidden="true" />
              <RouterLink
                v-if="sourceRoute"
                :to="sourceRoute"
                class="min-w-0 truncate underline-offset-2 hover:underline"
                >{{ source.title }}</RouterLink
              >
              <span v-else class="min-w-0 truncate">{{ source.title }}</span>
            </p>
            <ul
              v-if="loadingRows && !rows.length"
              class="space-y-1"
              aria-hidden="true"
            >
              <li
                v-for="n in 3"
                :key="n"
                class="h-16 animate-pulse rounded-6 bg-surface-gray-2 motion-reduce:animate-none"
              />
            </ul>
            <div
              v-else-if="!rows.length"
              class="rounded-8 border border-dashed border-outline-gray-3 px-4 py-6 text-center text-sm text-ink-gray-6"
            >
              Busca o escanea un producto, o trae lo que llegó, lo que cambió de
              precio o lo que hay en tienda.
            </div>
            <EtqRows
              v-else
              :rows="rows"
              :shown="stageView === 'todas' ? -1 : shownIndex"
              @qty="setQty"
              @remove="removeRow"
              @rename="rename"
              @pieces="openPieces"
              @show="showRow"
            />
          </section>
        </div>

        <!-- Tablet and desk: the design beside the label. -->
        <aside
          v-if="!narrow"
          class="min-w-0 md:col-start-2 md:row-start-2 lg:sticky lg:top-4 lg:col-start-3 lg:row-start-1 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:pr-1"
          aria-label="Diseño"
        >
          <EtqDesign
            v-model:layout="layout"
            v-model:design="design"
            :layouts="boot.layouts || []"
            :meta="designMeta"
            :dropped="droppedKeys"
            :rows="rows"
            :price-list="boot.price_list || ''"
          />
        </aside>

        <!-- Phone and tablet: the print at the thumb, over the list. -->
        <div
          v-if="!wide"
          class="sticky bottom-0 z-10 -mx-4 space-y-2 border-t border-outline-gray-1 bg-surface-base px-4 pb-3 pt-2 sm:-mx-6 sm:px-6 md:col-span-2"
        >
          <EtqPrintBar
            :label="printLabel(rows)"
            :blocked="blocked"
            :busy="busy"
            :result="result"
            :share="phone"
            :pdf="hasSize"
            @print="print"
            @pdf="pdf"
            @retry="retry"
            @download="download"
            @again="sendAgain"
            @job="openJob"
            @clear="clearList(true)"
            @dismiss="result = null"
          />
        </div>
      </div>

      <!-- ── Trabajos ─────────────────────────────────────────────── -->
      <div v-else-if="vista === 'trabajos'" class="px-0 pb-6 sm:px-6">
        <EtqJobs
          :filter="String(route.query.filtro || '')"
          :all="!!boot.capabilities?.all_jobs"
          @update:filter="setFilter"
          @counts="(value) => (counts = value)"
          @print="setVista('imprimir')"
        />
      </div>

      <!-- ── Plantillas ───────────────────────────────────────────── -->
      <div v-else class="pb-6 sm:px-6">
        <EtqTemplates
          :layouts="boot.layouts || []"
          :in-use="layout"
          :design="design"
          :new-template-url="boot.new_template_url"
          @use="useLayout"
        />
      </div>
    </template>

    <EtqDesignSheet
      v-if="designMounted"
      v-model:open="designOpen"
      v-model:layout="layout"
      v-model:design="design"
      v-model:index="shownIndex"
      :subtitle="layoutName(currentLayout)"
      :layouts="boot?.layouts || []"
      :meta="designMeta"
      :dropped="droppedKeys"
      :rows="rows"
      :price-list="boot?.price_list || ''"
      :html="previewHtml"
      :size="previewSize"
      :designed="isSize"
      :count="previewShown"
      :offset="previewOffset"
      :total="rows.length"
      :loading="previewing"
    />
    <EtqSourceSheet
      v-if="sourceMounted"
      v-model:open="sourceOpen"
      :source="sourceKind"
      @pick="pickSource"
    />
    <EtqUnitsSheet
      v-if="piecesMounted"
      v-model:open="piecesOpen"
      :row="piecesRow"
      @pick="pickPieces"
    />
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import { useDebounceFn } from '@vueuse/core'
import {
  AppBar,
  EmptyState,
  ListRow,
  RecentPicks,
  Segmented,
} from '@/components/ui'
import ExpandTransition from '@/components/ui/ExpandTransition.vue'
import Icon from '@/components/Icon.vue'
import EtqStage from '@/components/etiquetas/EtqStage.vue'
import EtqRows from '@/components/etiquetas/EtqRows.vue'
import EtqPrintBar from '@/components/etiquetas/EtqPrintBar.vue'
import {
  isMobile as phone,
  isNarrow as narrow,
  isWide as wide,
} from '@/composables/breakpoint'
import { useRecentPicks } from '@/composables/useRecentPicks'
import { documentRoute } from '@/documentos/registry'
import {
  SOURCES,
  clampQty,
  cleanDesign,
  downloadHtml,
  etiquetasApi,
  findLayout,
  labelsText,
  layoutName,
  mergeRows,
  partsText,
  pdfFile,
  printBlock,
  printHtml,
  PREVIEW_ROWS,
  printLabel,
  problemText,
  rememberDesign,
  rememberLayout,
  rememberSize,
  rememberedDesign,
  rememberedLayout,
  requestId,
  rowKey,
  rowPrice,
  sendPdf,
  startFrom,
  startLayout,
  totalLabels,
} from '@/composables/useEtiquetas'

const EtqJobs = defineAsyncComponent(
  () => import('@/components/etiquetas/EtqJobs.vue'),
)
const EtqTemplates = defineAsyncComponent(
  () => import('@/components/etiquetas/EtqTemplates.vue'),
)
const EtqDesign = defineAsyncComponent(
  () => import('@/components/etiquetas/EtqDesign.vue'),
)
const EtqDesignSheet = defineAsyncComponent(
  () => import('@/components/etiquetas/EtqDesignSheet.vue'),
)
const EtqSourceSheet = defineAsyncComponent(
  () => import('@/components/etiquetas/EtqSourceSheet.vue'),
)
const EtqUnitsSheet = defineAsyncComponent(
  () => import('@/components/etiquetas/EtqUnitsSheet.vue'),
)

const route = useRoute()
const router = useRouter()
const LIST_KEY = 'muelle:etiquetas:lista'
// The most rows one print takes (doco's MAX_ROWS).
const MAX_ROWS = 300

// ── boot ──────────────────────────────────────────────────────────────
const boot = ref(null)
const bootProblem = ref('')
const counts = ref({})

async function loadBoot() {
  bootProblem.value = ''
  try {
    boot.value = await etiquetasApi('bootstrap')
    counts.value = boot.value?.counts || {}
  } catch (error) {
    boot.value = null
    bootProblem.value = problemText(error)
  }
}

// The parts a size can carry, in the worker's words (older servers send
// them as `fields` only).
const designMeta = computed(() => {
  const meta = boot.value?.design || {}
  return { ...meta, parts: meta.parts || boot.value?.fields || [] }
})
const printerText = computed(() => {
  const size = currentLayout.value?.size
  const base =
    boot.value?.printer?.text ||
    'Imprime con la impresora que elijas en el diálogo de impresión.'
  return size
    ? `${base} Si sale chica o en una hoja, elige papel de ${size}, escala 100 % y sin márgenes.`
    : base
})

// The whole screen's guard: it says why and offers the way on.
const bootState = computed(() => {
  if (bootProblem.value)
    return {
      state: 'error',
      title: 'No pude abrir Etiquetas',
      message: bootProblem.value,
      action: 'Volver a intentar',
      run: start,
    }
  if (!boot.value) return { state: 'loading', title: 'Abriendo Etiquetas…' }
  const caps = boot.value.capabilities || {}
  if (!caps.print && !caps.design)
    return {
      state: 'denied',
      title: 'No puedes imprimir etiquetas',
      message: caps.reason,
      action: 'Volver a Productos',
      run: () => router.push({ name: 'Productos' }),
    }
  if (!boot.value.layouts?.some((entry) => !entry.problem))
    return {
      state: 'empty',
      title: 'Aún no hay plantillas de etiqueta',
      message: boot.value.new_template_url
        ? 'Diseña la primera en el escritorio: medidas de la etiqueta, textos y códigos.'
        : 'Pide al encargado que active las etiquetas de la tienda o que diseñe una plantilla.',
      href: boot.value.new_template_url,
      hrefLabel: 'Crear plantilla en el escritorio',
      action: 'Volver a Productos',
      run: () => router.push({ name: 'Productos' }),
    }
  return null
})

// ── views ─────────────────────────────────────────────────────────────
const vista = computed(() =>
  ['trabajos', 'plantillas'].includes(route.query.vista)
    ? route.query.vista
    : 'imprimir',
)
const vistas = computed(() => [
  { value: 'imprimir', label: 'Imprimir' },
  {
    value: 'trabajos',
    label: 'Trabajos',
    // Prints that did not go out this week, so they get a second look.
    count: counts.value.failed || undefined,
  },
  { value: 'plantillas', label: 'Plantillas' },
])
function setVista(value) {
  const query = {
    ...route.query,
    vista: value === 'imprimir' ? undefined : value,
  }
  if (value !== 'trabajos') delete query.filtro
  router.replace({ query })
}
function setFilter(value) {
  router.replace({ query: { ...route.query, filtro: value || undefined } })
}

// ── layout and design ─────────────────────────────────────────────────
const layout = ref('')
const design = ref(cleanDesign(null))
const designOpen = ref(false)
const designMounted = ref(false)
watch(designOpen, (open) => open && (designMounted.value = true))
const currentLayout = computed(() =>
  findLayout(layout.value, boot.value?.layouts || [], designMeta.value.custom),
)
const isSize = computed(() => currentLayout.value?.kind === 'size')
const hasSize = computed(
  () => currentLayout.value?.w_mm > 0 && currentLayout.value?.h_mm > 0,
)
watch(layout, (key) => {
  if (!key) return
  rememberLayout(key)
  rememberSize(key)
})
watch(design, (value) => rememberDesign(value), { deep: true })
function useLayout(key) {
  layout.value = key
  setVista('imprimir')
}

// ── rows ──────────────────────────────────────────────────────────────
const rows = ref([])
const unknown = ref([])
const source = ref(null)
const title = ref('')
const more = ref(false)
const loadingRows = ref(false)
const loadProblem = ref('')
const confirmClear = ref(false)
const total = computed(() => totalLabels(rows.value))
const sourceRoute = computed(() =>
  source.value ? documentRoute(source.value.doctype, source.value.name) : null,
)
const recent = useRecentPicks('muelle:etiquetas-recent')

// Rows land on the list (a product already there adds its copies) and the
// first of them shows on the stage.
function land(incoming, { replace = false } = {}) {
  rows.value = mergeRows(replace ? [] : rows.value, incoming)
  if (!incoming.length) return
  const first = rows.value.findIndex(
    (row) => rowKey(row) === rowKey(incoming[0]),
  )
  if (first >= 0) showRow(first)
}

async function load(args, { replace = false } = {}) {
  loadingRows.value = true
  loadProblem.value = ''
  try {
    const answer = await etiquetasApi('rows', args)
    land(answer?.rows || [], { replace })
    unknown.value = answer?.unknown || []
    more.value = !!answer?.more
    result.value = null
    return answer
  } catch (error) {
    loadProblem.value = problemText(error)
    return null
  } finally {
    loadingRows.value = false
  }
}

async function addItems(items) {
  if (!items.length) return null
  return load({ items: JSON.stringify(items) })
}

async function addFrom({ doctype, name }) {
  // A document is its own batch: its lines replace the list.
  const answer = await load({ doctype, name }, { replace: true })
  if (!answer) return
  source.value = answer.source || { doctype, name, title: name }
  title.value = source.value.title
}

async function fromJob(name) {
  loadingRows.value = true
  try {
    const job = await etiquetasApi('job', { name })
    rows.value = mergeRows([], job?.rows || [])
    if (job?.layout && findLayout(job.layout, boot.value?.layouts || []))
      layout.value = job.layout
    if (job?.design) design.value = cleanDesign(job.design, designMeta.value)
    source.value = job?.source ? { ...job.source, title: job.title } : null
    title.value = job?.title || ''
  } catch (error) {
    loadProblem.value = problemText(error)
  } finally {
    loadingRows.value = false
  }
}

function setQty(row, value) {
  rows.value = rows.value.map((entry) =>
    rowKey(entry) === rowKey(row) ? { ...entry, qty: clampQty(value) } : entry,
  )
}
// The name a label prints, for this print only.
function rename(row, name) {
  rows.value = rows.value.map((entry) =>
    rowKey(entry) === rowKey(row)
      ? {
          ...entry,
          base_name: entry.base_name || entry.item_name,
          item_name: name,
        }
      : entry,
  )
}
function removeRow(row) {
  rows.value = rows.value.filter((entry) => rowKey(entry) !== rowKey(row))
  if (!rows.value.length) forgetSource()
}
function removeUnpriced() {
  rows.value = rows.value.filter((row) => rowPrice(row))
  if (!rows.value.length) forgetSource()
}
// A small delete is two taps in place: «Vaciar», then «Vaciar lista».
function clearList(now = false) {
  if (!now && !confirmClear.value) {
    confirmClear.value = true
    return
  }
  confirmClear.value = false
  rows.value = []
  unknown.value = []
  more.value = false
  result.value = null
  forgetSource()
}
function forgetSource() {
  source.value = null
  title.value = ''
}

// The list survives a trip to «ponle precio» and back (this tab only).
watch(
  [rows, source, title],
  () => {
    try {
      if (rows.value.length)
        sessionStorage.setItem(
          LIST_KEY,
          JSON.stringify({
            rows: rows.value,
            source: source.value,
            title: title.value,
          }),
        )
      else sessionStorage.removeItem(LIST_KEY)
    } catch {
      // Private mode: the list is just not kept.
    }
  },
  { deep: true },
)
async function restore() {
  let saved
  try {
    saved = JSON.parse(sessionStorage.getItem(LIST_KEY) || 'null')
  } catch {
    return
  }
  if (!saved?.rows?.length) return
  rows.value = saved.rows
  source.value = saved.source || null
  title.value = saved.title || ''
  // Prices may have changed meanwhile («ponle precio»): read them again.
  try {
    const answer = await etiquetasApi('rows', {
      items: JSON.stringify(
        saved.rows.map((row) => ({
          code: row.serial_no || row.batch_no || row.item_code,
          qty: row.qty,
        })),
      ),
    })
    const fresh = new Map((answer?.rows || []).map((row) => [rowKey(row), row]))
    rows.value = rows.value.map((row) => {
      const hit = fresh.get(rowKey(row))
      return hit ? { ...row, price: hit.price, barcode: hit.barcode } : row
    })
  } catch {
    // Keep the saved prices; the preview still shows what prints.
  }
}

// ── pieces ────────────────────────────────────────────────────────────
const piecesOpen = ref(false)
const piecesMounted = ref(false)
const piecesRow = ref(null)
function openPieces(row) {
  piecesRow.value = row
  piecesMounted.value = true
  piecesOpen.value = true
}
// The picked pieces take the product's place on the list.
function pickPieces({ row, units }) {
  piecesOpen.value = false
  const at = rows.value.findIndex((entry) => rowKey(entry) === rowKey(row))
  const kept = rows.value.filter((entry) => rowKey(entry) !== rowKey(row))
  const merged = mergeRows(kept.slice(0, Math.max(0, at)), units)
  rows.value = mergeRows(merged, kept.slice(Math.max(0, at)))
  if (at >= 0) showRow(at)
}

// ── search ────────────────────────────────────────────────────────────
const query = ref('')
const results = ref([])
const searching = ref(false)
const searchFocused = ref(false)
const searchBox = ref(null)
const suggestions = ref([])
let suggested = false
const panelOpen = computed(() => !!query.value.trim() || searchFocused.value)
let searchTicket = 0
const search = useDebounceFn(async () => {
  const text = query.value.trim()
  if (!text) {
    results.value = []
    return
  }
  const mine = ++searchTicket
  searching.value = true
  try {
    const answer = await etiquetasApi('candidates', {
      kind: 'productos',
      query: text,
    })
    if (mine === searchTicket) results.value = (answer?.rows || []).slice(0, 6)
  } catch {
    if (mine === searchTicket) results.value = []
  } finally {
    if (mine === searchTicket) searching.value = false
  }
}, 250)
watch(query, search)

// Before a word is typed: what this device labelled lately and the
// products edited last.
async function openSearch() {
  searchFocused.value = true
  if (suggested) return
  suggested = true
  try {
    const answer = await etiquetasApi('candidates', { kind: 'productos' })
    suggestions.value = (answer?.rows || []).slice(0, 6)
  } catch {
    suggested = false
  }
}
let blurTimer
function closeSearchSoon() {
  // A tap on a suggestion lands before the panel folds.
  clearTimeout(blurTimer)
  blurTimer = setTimeout(() => (searchFocused.value = false), 180)
}
function closeSearch() {
  clearTimeout(blurTimer)
  searchFocused.value = false
  query.value = ''
  searchBox.value?.blur()
}
// What the worker picked by hand comes back as a «Reciente».
function pickResult(item) {
  closeSearch()
  recent.touch({ name: item.item_code, label: item.item_name })
  addItems([{ code: item.item_code }])
}
function pickRecent(pick) {
  closeSearch()
  recent.touch(pick)
  addItems([{ code: pick.name }])
}

// A scanner types the code and presses Enter: add it as it is.
async function addTyped() {
  const text = query.value.trim()
  if (!text) return
  const exact = results.value.find(
    (item) => item.item_code.toLowerCase() === text.toLowerCase(),
  )
  query.value = ''
  const answer = await addItems([{ code: exact?.item_code || text }])
  const [row] = answer?.rows || []
  if (row) recent.touch({ name: row.item_code, label: row.item_name })
}
function resultLine(item) {
  const kind =
    item.units === 'serie'
      ? 'por serie'
      : item.units === 'lote'
        ? 'por lote'
        : ''
  return [item.item_code, kind].filter(Boolean).join(' · ')
}

// ── sources ───────────────────────────────────────────────────────────
const sourceOpen = ref(false)
const sourceMounted = ref(false)
const sourceKind = ref(null)
function openSource(entry) {
  sourceKind.value = entry
  sourceMounted.value = true
  sourceOpen.value = true
}
async function pickSource(pick) {
  sourceOpen.value = false
  if (pick.doctype) await addFrom(pick)
  else if (pick.stock) {
    await load({ stock: JSON.stringify(pick.stock) })
    if (pick.title && !source.value) title.value = pick.title
  } else {
    await addItems(pick.items || [])
    if (pick.title && !source.value) title.value = pick.title
  }
}

// ── preview ───────────────────────────────────────────────────────────
const previewHtml = ref('')
const previewing = ref(false)
const previewShown = ref(0)
// Where the drawing on the stage starts in the list.
const previewOffset = ref(0)
const previewSize = ref({ w_mm: 0, h_mm: 0 })
const previewProblem = ref('')
const warnings = ref([])
const fit = ref({ dropped: [], text: '', notes: [] })
const shownIndex = ref(0)
const stageView = ref('una')
const droppedKeys = computed(() => (fit.value.dropped || []).map((p) => p.key))
const shownRow = computed(() =>
  rows.value.length ? rows.value[shownIndex.value] : null,
)
const stageTitle = computed(() =>
  shownRow.value
    ? `Etiqueta de ${shownRow.value.item_name}`
    : 'Etiqueta de ejemplo',
)
const caption = computed(() => {
  if (!previewHtml.value) return ''
  if (!rows.value.length)
    return 'Producto de ejemplo: así sale con lo que elegiste.'
  if (stageView.value === 'todas') {
    const from = previewOffset.value
    const span =
      rows.value.length > previewShown.value
        ? `Del ${from + 1} al ${from + previewShown.value} de ${rows.value.length}, una`
        : 'Una'
    return `${span} de cada producto; se imprimen ${labelsText(total.value)}.`
  }
  const row = shownRow.value
  if (!row) return ''
  const copies = row.serial_no
    ? '1 pieza'
    : row.qty === 1
      ? '1 copia'
      : `${row.qty} copias`
  return `${row.item_name} · ${copies}`
})
function showRow(position) {
  if (stageView.value === 'todas') stageView.value = 'una'
  shownIndex.value = Math.max(0, position)
}
// A long list draws the window of products around the one on the stage.
const windowStart = computed(() =>
  rows.value.length > PREVIEW_ROWS
    ? Math.floor(shownIndex.value / PREVIEW_ROWS) * PREVIEW_ROWS
    : 0,
)

let previewTicket = 0
const drawPreview = useDebounceFn(async () => {
  if (!layout.value) {
    previewHtml.value = ''
    warnings.value = []
    return
  }
  const mine = ++previewTicket
  const start = windowStart.value
  const drawn = rows.value.slice(start, start + PREVIEW_ROWS)
  previewing.value = true
  try {
    const answer = await etiquetasApi('preview', {
      layout: layout.value,
      rows: drawn.length ? JSON.stringify(drawn) : null,
      design: isSize.value ? JSON.stringify(design.value) : null,
    })
    if (mine !== previewTicket) return
    previewProblem.value = ''
    previewHtml.value = answer?.html || ''
    previewShown.value = answer?.shown || 0
    previewOffset.value = drawn.length ? start : 0
    previewSize.value = answer?.size || {
      w_mm: currentLayout.value?.w_mm || 0,
      h_mm: currentLayout.value?.h_mm || 0,
    }
    fit.value = answer?.fit || { dropped: [], text: '', notes: [] }
    warnings.value = answer?.warnings || []
  } catch (error) {
    if (mine === previewTicket) {
      previewHtml.value = ''
      previewProblem.value = problemText(error)
      fit.value = { dropped: [], text: '', notes: [] }
      warnings.value = []
    }
  } finally {
    if (mine === previewTicket) previewing.value = false
  }
}, 250)
// The stage says it is drawing from the change on, not from the request.
watch(
  [rows, layout, design, windowStart],
  () => {
    if (layout.value) previewing.value = true
    drawPreview()
  },
  { deep: true },
)

// ── print ─────────────────────────────────────────────────────────────
const busy = ref('')
const result = ref(null)
const blocked = computed(() =>
  printBlock({ rows: rows.value, layout: layout.value, busy: !!busy.value }),
)

function printArgs(output) {
  return {
    layout: layout.value,
    rows: JSON.stringify(rows.value),
    design: isSize.value ? JSON.stringify(design.value) : null,
    title: title.value,
    source_doctype: source.value?.doctype || '',
    source_name: source.value?.name || '',
    request_key: requestId(),
    output,
  }
}

async function print() {
  if (blocked.value) return
  busy.value = 'print'
  result.value = null
  try {
    await send(await etiquetasApi('print_labels', printArgs('html')))
  } catch (error) {
    result.value = { ok: false, reason: problemText(error) }
  } finally {
    busy.value = ''
  }
}

// The browser prints; the job learns how it went.
async function send(answer) {
  const outcome = await printHtml(answer?.html || '')
  let job = answer?.job
  try {
    const marked = await etiquetasApi('mark', {
      job: job?.name,
      outcome: outcome.ok ? 'printed' : 'failed',
      error: outcome.reason || '',
    })
    job = marked?.job || job
  } catch {
    // The labels went to the printer; the job's state catches up later.
  }
  result.value = outcome.ok
    ? { ok: true, job }
    : { ok: false, reason: outcome.reason, job, html: answer?.html }
  counts.value = {
    ...counts.value,
    today: (counts.value.today || 0) + 1,
    failed: (counts.value.failed || 0) + (outcome.ok ? 0 : 1),
  }
}

async function retry() {
  if (!result.value?.job) return print()
  busy.value = 'print'
  try {
    await send(await etiquetasApi('reprint', { job: result.value.job.name }))
  } catch (error) {
    result.value = { ...result.value, reason: problemText(error) }
  } finally {
    busy.value = ''
  }
}
function download() {
  if (result.value?.html)
    downloadHtml(
      result.value.html,
      `${result.value.job?.name || 'etiquetas'}.html`,
    )
}

// A PDF, one label a page at the label's size: a phone shares it (the
// printer's app, WhatsApp), a computer saves it.
let lastPdf = null
async function pdf() {
  if (blocked.value) return
  busy.value = 'pdf'
  result.value = null
  try {
    const answer = await etiquetasApi('print_labels', printArgs('pdf'))
    lastPdf = pdfFile(answer?.pdf, answer?.filename || 'etiquetas.pdf')
    const how = await sendPdf(lastPdf, { share: phone.value })
    if (how !== 'cancelled')
      result.value = { ok: true, pdf: how, job: answer?.job }
  } catch (error) {
    result.value = { ok: false, reason: problemText(error) }
  } finally {
    busy.value = ''
  }
}
async function sendAgain() {
  if (lastPdf) await sendPdf(lastPdf, { share: phone.value })
}
function openJob() {
  if (result.value?.job)
    router.push({
      name: 'EtiquetasTrabajo',
      params: { name: result.value.job.name },
    })
}

// ── start ─────────────────────────────────────────────────────────────
async function start() {
  boot.value = null
  await loadBoot()
  if (!boot.value) return
  layout.value = startLayout(
    boot.value.layouts,
    rememberedLayout(),
    boot.value.default_layout,
    designMeta.value.custom,
  )
  design.value = cleanDesign(rememberedDesign(), designMeta.value)
  if (!boot.value.capabilities?.print) return
  const from = startFrom(route.query)
  if (route.query.trabajo) await fromJob(String(route.query.trabajo))
  else if (from.doctype) await addFrom(from)
  else if (from.items.length) await addItems(from.items)
  else await restore()
  // The start is done: a reload must not add the same products again.
  if (route.query.codigos || route.query.desde || route.query.trabajo) {
    const query = { ...route.query }
    delete query.codigos
    delete query.desde
    delete query.trabajo
    router.replace({ query })
  }
}
onMounted(start)
</script>
