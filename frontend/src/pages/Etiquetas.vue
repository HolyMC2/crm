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
    <header v-else class="px-6 pb-2 pt-6">
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
        Precios, anaqueles, piezas con serie o lote: elige qué etiquetar, revisa
        la muestra e imprime.
      </p>
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
      <div class="px-4 pb-3 pt-2 sm:px-6">
        <Segmented
          :model-value="vista"
          label="Etiquetas"
          :options="vistas"
          class="max-w-md"
          @update:model-value="setVista"
        />
      </div>

      <!-- ── Imprimir ─────────────────────────────────────────────── -->
      <div
        v-if="vista === 'imprimir'"
        class="grid flex-1 gap-4 px-4 pb-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start"
        data-etq-imprimir
      >
        <div class="min-w-0 space-y-4">
          <!-- What to label: one search (type, paste or scan a code) and the
               two everyday sources. -->
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
                @keydown.enter.prevent="addTyped"
              />
              <span
                v-if="searching"
                class="lucide-loader-circle absolute right-3.5 size-4 animate-spin text-ink-gray-5 motion-reduce:animate-none"
                aria-hidden="true"
              />
            </label>
            <ExpandTransition>
              <ul
                v-if="query.trim() && (results.length || !searching)"
                class="overflow-hidden rounded-8 border border-outline-gray-2 bg-surface-base"
                aria-label="Productos encontrados"
                data-etq-results
              >
                <li v-for="item in results" :key="item.item_code">
                  <ListRow
                    :title="item.item_name"
                    :subtitle="resultLine(item)"
                    icon="lucide-package"
                    @click="addItems([{ code: item.item_code }], true)"
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
                  v-if="!results.length"
                  class="px-4 py-3 text-sm text-ink-gray-6"
                >
                  Ningún producto se llama así. Si es un código, presiona Enter
                  para buscarlo como serie o lote.
                </li>
              </ul>
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
              Busca o escanea un producto, o trae lo que llegó o cambió de
              precio.
            </div>
            <ul
              v-else
              class="divide-y divide-outline-gray-1 rounded-8 border border-outline-gray-2"
              data-etq-rows
            >
              <li
                v-for="row in rows"
                :key="rowKey(row)"
                class="flex flex-wrap items-center justify-end gap-x-2 py-2 pl-4 pr-2"
                data-etq-row
              >
                <!-- Below ~360 px the copies move under the name. -->
                <div class="min-w-0 flex-1 basis-36">
                  <p class="line-clamp-2 text-base text-ink-gray-9">
                    {{ row.item_name }}
                  </p>
                  <p class="truncate text-sm text-ink-gray-6">
                    {{ rowLine(row) }}
                  </p>
                  <p class="text-sm">
                    <span
                      v-if="rowPrice(row)"
                      class="num font-semibold text-ink-gray-9"
                      >{{ rowPrice(row) }}</span
                    >
                    <RouterLink
                      v-else
                      :to="{
                        name: 'Producto',
                        params: { item: row.item_code },
                      }"
                      class="text-ink-amber-9 underline underline-offset-2"
                      data-etq-sin-precio
                      >Sin precio · ponle uno</RouterLink
                    >
                  </p>
                </div>
                <div
                  v-if="!row.serial_no"
                  class="flex flex-none items-center rounded-full bg-surface-gray-2"
                  role="group"
                  :aria-label="`Copias de ${row.item_name}`"
                >
                  <button
                    type="button"
                    class="press flex size-11 items-center justify-center rounded-full text-ink-gray-8 disabled:opacity-40"
                    :disabled="row.qty <= 1"
                    :aria-label="`Una copia menos de ${row.item_name}`"
                    @click="setQty(row, row.qty - 1)"
                  >
                    <span class="lucide-minus size-4" aria-hidden="true" />
                  </button>
                  <input
                    :value="row.qty"
                    type="number"
                    inputmode="numeric"
                    min="1"
                    :max="MAX_COPIES"
                    class="num w-11 border-0 bg-transparent p-0 text-center text-base font-semibold text-ink-gray-9 [appearance:textfield] focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none"
                    :aria-label="`Copias de ${row.item_name}`"
                    @change="setQty(row, $event.target.value)"
                  />
                  <button
                    type="button"
                    class="press flex size-11 items-center justify-center rounded-full text-ink-gray-8 disabled:opacity-40"
                    :disabled="row.qty >= MAX_COPIES"
                    :aria-label="`Una copia más de ${row.item_name}`"
                    @click="setQty(row, row.qty + 1)"
                  >
                    <span class="lucide-plus size-4" aria-hidden="true" />
                  </button>
                </div>
                <span
                  v-else
                  class="num flex-none px-3 text-sm text-ink-gray-6"
                  title="Una pieza con serie lleva una sola etiqueta"
                  >1 pieza</span
                >
                <button
                  type="button"
                  class="press flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-6 hover:bg-surface-gray-2"
                  :aria-label="`Quitar ${row.item_name}`"
                  @click="removeRow(row)"
                >
                  <span class="lucide-x size-4" aria-hidden="true" />
                </button>
              </li>
            </ul>
          </section>
        </div>

        <!-- The layout, the sample and the print, side by side on desktop. -->
        <aside
          class="min-w-0 space-y-3 lg:sticky lg:top-4"
          aria-label="Plantilla e impresión"
        >
          <button
            type="button"
            class="press flex min-h-14 w-full items-center gap-3 rounded-8 border border-outline-gray-2 px-4 py-2 text-left hover:bg-surface-gray-1"
            data-etq-layout
            @click="layoutOpen = true"
          >
            <Icon icon="layout-template" class="size-5 text-ink-gray-7" />
            <span class="min-w-0 flex-1">
              <span class="block text-sm text-ink-gray-6">Plantilla</span>
              <span class="block truncate text-base text-ink-gray-9">{{
                layoutName(currentLayout) || 'Elige una'
              }}</span>
              <span
                v-if="currentLayout?.kind === 'size'"
                class="block truncate text-sm text-ink-gray-6"
                >{{ partsText }}</span
              >
            </span>
            <span class="text-sm font-medium text-ink-gray-8">Cambiar</span>
          </button>

          <EtqPreview
            :html="previewHtml"
            :loading="previewing"
            :caption="previewCaption"
          />

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

          <!-- How the last print went, with the way on. -->
          <section
            v-if="result"
            role="status"
            class="space-y-2 rounded-8 p-3 text-sm"
            :class="
              result.ok
                ? 'bg-surface-green-1 text-ink-green-8'
                : 'bg-surface-red-1 text-ink-red-7'
            "
            data-etq-result
          >
            <p class="font-semibold">
              {{ result.ok ? 'Enviada a la impresora' : 'No se imprimió' }}
            </p>
            <p v-if="result.ok">
              {{ labelsText(result.job?.label_count) }} en
              {{ result.job?.layout_label }}. Si no salió, revisa que elegiste
              la impresora de etiquetas en el diálogo y vuelve a imprimir.
            </p>
            <p v-else>{{ result.reason }}</p>
            <div class="flex flex-wrap gap-2">
              <Button
                v-if="!result.ok"
                variant="solid"
                class="press min-h-11"
                label="Volver a intentar"
                :loading="busy"
                @click="retry"
              />
              <Button
                v-if="!result.ok && result.html"
                class="press min-h-11"
                label="Descargar etiquetas"
                @click="download"
              />
              <Button
                v-if="result.job"
                class="press min-h-11"
                label="Ver trabajo"
                @click="
                  router.push({
                    name: 'EtiquetasTrabajo',
                    params: { name: result.job.name },
                  })
                "
              />
              <Button
                v-if="result.ok"
                class="press min-h-11"
                label="Vaciar lista"
                @click="clearList(true)"
              />
            </div>
          </section>

          <p class="flex items-start gap-2 text-sm text-ink-gray-6">
            <Icon icon="printer" class="mt-0.5 size-4 flex-none" />
            {{ boot.printer?.text }}
          </p>

          <!-- The print sits at the thumb on a phone; its reason, when it
               cannot run, beside it. -->
          <div
            class="sticky bottom-0 z-10 -mx-4 space-y-1 border-t border-outline-gray-1 bg-surface-base px-4 pb-3 pt-2 lg:static lg:mx-0 lg:border-0 lg:p-0"
            data-etq-print
          >
            <p
              v-if="blocked && !busy"
              class="text-sm text-ink-gray-6"
              data-etq-print-why
            >
              {{ blocked }}
            </p>
            <Button
              variant="solid"
              class="press min-h-12 w-full text-base"
              :label="printLabel(rows)"
              :loading="busy"
              :disabled="!!blocked"
              @click="print"
            >
              <template #prefix>
                <Icon icon="printer" class="size-5" />
              </template>
            </Button>
          </div>
        </aside>
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
        <EmptyState
          v-if="!boot.layouts?.length"
          title="Aún no hay plantillas de etiqueta"
          :message="noLayoutsText"
        />
        <EtqTemplates
          v-else
          :layouts="boot.layouts"
          :in-use="layout"
          :parts="parts"
          :new-template-url="boot.new_template_url"
          @use="useLayout"
        />
      </div>
    </template>

    <EtqLayoutSheet
      v-if="layoutMounted"
      v-model:open="layoutOpen"
      :layouts="boot?.layouts || []"
      :fields="boot?.fields || []"
      :layout="layout"
      :parts="parts"
      :new-template-url="boot?.new_template_url || ''"
      @apply="applyLayout"
    />
    <EtqSourceSheet
      v-if="sourceMounted"
      v-model:open="sourceOpen"
      :source="sourceKind"
      @pick="pickSource"
    />
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import { useDebounceFn } from '@vueuse/core'
import { AppBar, EmptyState, ListRow, Segmented } from '@/components/ui'
import ExpandTransition from '@/components/ui/ExpandTransition.vue'
import Icon from '@/components/Icon.vue'
import EtqPreview from '@/components/etiquetas/EtqPreview.vue'
import { isMobile as phone } from '@/composables/breakpoint'
import { documentRoute } from '@/documentos/registry'
import {
  MAX_COPIES,
  SOURCES,
  clampQty,
  downloadHtml,
  etiquetasApi,
  labelsText,
  layoutName,
  mergeRows,
  printBlock,
  printHtml,
  printLabel,
  problemText,
  rememberFields,
  rememberLayout,
  rememberedFields,
  rememberedLayout,
  requestId,
  rowKey,
  rowLine,
  rowPrice,
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
const EtqLayoutSheet = defineAsyncComponent(
  () => import('@/components/etiquetas/EtqLayoutSheet.vue'),
)
const EtqSourceSheet = defineAsyncComponent(
  () => import('@/components/etiquetas/EtqSourceSheet.vue'),
)

const route = useRoute()
const router = useRouter()
const LIST_KEY = 'muelle:etiquetas:lista'

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

const noLayoutsText = computed(() =>
  boot.value?.new_template_url
    ? 'Diseña la primera en el escritorio: medidas de la etiqueta, textos y códigos.'
    : 'Pide al encargado que active las etiquetas de la tienda o que diseñe una plantilla.',
)

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
  if (!boot.value.layouts?.some((layout) => !layout.problem))
    return {
      state: 'empty',
      title: 'Aún no hay plantillas de etiqueta',
      message: noLayoutsText.value,
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

// ── layout ────────────────────────────────────────────────────────────
const layout = ref('')
const parts = ref([])
const layoutOpen = ref(false)
const layoutMounted = ref(false)
watch(layoutOpen, (open) => open && (layoutMounted.value = true))
const currentLayout = computed(() =>
  boot.value?.layouts?.find((entry) => entry.key === layout.value),
)
const partsText = computed(() => {
  const names = new Map((boot.value?.fields || []).map((f) => [f.key, f.label]))
  return parts.value.map((key) => names.get(key) || key).join(', ')
})
function applyLayout({ layout: key, parts: chosen }) {
  layout.value = key
  if (chosen?.length) parts.value = chosen
  rememberLayout(key)
  rememberFields(parts.value)
}
function useLayout(key) {
  applyLayout({ layout: key, parts: parts.value })
  setVista('imprimir')
}

// ── rows ──────────────────────────────────────────────────────────────
const rows = ref([])
const unknown = ref([])
const source = ref(null)
const title = ref('')
const loadingRows = ref(false)
const loadProblem = ref('')
const confirmClear = ref(false)
const total = computed(() => totalLabels(rows.value))
const sourceRoute = computed(() =>
  source.value ? documentRoute(source.value.doctype, source.value.name) : null,
)

async function addItems(items, clearSearch = false) {
  if (!items.length) return
  loadingRows.value = true
  loadProblem.value = ''
  try {
    const answer = await etiquetasApi('rows', { items: JSON.stringify(items) })
    rows.value = mergeRows(rows.value, answer?.rows || [])
    unknown.value = answer?.unknown || []
    if (clearSearch) query.value = ''
    result.value = null
  } catch (error) {
    loadProblem.value = problemText(error)
  } finally {
    loadingRows.value = false
  }
}

async function addFrom({ doctype, name }) {
  loadingRows.value = true
  loadProblem.value = ''
  try {
    const answer = await etiquetasApi('rows', { doctype, name })
    // A document is its own batch: its lines replace the list.
    rows.value = mergeRows([], answer?.rows || [])
    unknown.value = answer?.unknown || []
    source.value = answer?.source || { doctype, name, title: name }
    title.value = source.value.title
    result.value = null
  } catch (error) {
    loadProblem.value = problemText(error)
  } finally {
    loadingRows.value = false
  }
}

async function fromJob(name) {
  loadingRows.value = true
  try {
    const job = await etiquetasApi('job', { name })
    rows.value = mergeRows([], job?.rows || [])
    if (job?.layout && boot.value?.layouts?.some((l) => l.key === job.layout))
      layout.value = job.layout
    if (job?.fields?.length) parts.value = job.fields
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

// ── search ────────────────────────────────────────────────────────────
const query = ref('')
const results = ref([])
const searching = ref(false)
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

// A scanner types the code and presses Enter: add it as it is.
function addTyped() {
  const text = query.value.trim()
  if (!text) return
  const exact = results.value.find(
    (item) => item.item_code.toLowerCase() === text.toLowerCase(),
  )
  addItems([{ code: exact?.item_code || text }], true)
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
  else {
    await addItems(pick.items || [])
    if (pick.title && !source.value) title.value = pick.title
  }
}

// ── preview ───────────────────────────────────────────────────────────
const previewHtml = ref('')
const previewing = ref(false)
const previewShown = ref(0)
const warnings = ref([])
const previewCaption = computed(() => {
  if (!rows.value.length || !previewHtml.value) return ''
  return previewShown.value < total.value
    ? `Muestra de las primeras ${previewShown.value} de ${labelsText(total.value)}.`
    : `Así salen las ${labelsText(total.value)}.`
})
let previewTicket = 0
const drawPreview = useDebounceFn(async () => {
  if (!rows.value.length || !layout.value) {
    previewHtml.value = ''
    warnings.value = []
    return
  }
  const mine = ++previewTicket
  previewing.value = true
  try {
    const answer = await etiquetasApi('preview', {
      layout: layout.value,
      rows: JSON.stringify(rows.value),
      fields: currentLayout.value?.kind === 'size' ? parts.value : null,
    })
    if (mine !== previewTicket) return
    previewHtml.value = answer?.html || ''
    previewShown.value = answer?.shown || 0
    warnings.value = answer?.warnings || []
  } catch (error) {
    if (mine === previewTicket) {
      previewHtml.value = ''
      warnings.value = [{ key: 'preview', text: problemText(error) }]
    }
  } finally {
    if (mine === previewTicket) previewing.value = false
  }
}, 350)
watch([rows, layout, parts], drawPreview, { deep: true })

// ── print ─────────────────────────────────────────────────────────────
const busy = ref(false)
const result = ref(null)
const blocked = computed(() =>
  printBlock({ rows: rows.value, layout: layout.value, busy: busy.value }),
)

async function print() {
  if (blocked.value) return
  busy.value = true
  result.value = null
  try {
    const answer = await etiquetasApi('print_labels', {
      layout: layout.value,
      rows: JSON.stringify(rows.value),
      fields: currentLayout.value?.kind === 'size' ? parts.value : null,
      title: title.value,
      source_doctype: source.value?.doctype || '',
      source_name: source.value?.name || '',
      request_key: requestId(),
    })
    await send(answer)
  } catch (error) {
    result.value = { ok: false, reason: problemText(error) }
  } finally {
    busy.value = false
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
  busy.value = true
  try {
    await send(await etiquetasApi('reprint', { job: result.value.job.name }))
  } catch (error) {
    result.value = { ...result.value, reason: problemText(error) }
  } finally {
    busy.value = false
  }
}
function download() {
  if (result.value?.html)
    downloadHtml(
      result.value.html,
      `${result.value.job?.name || 'etiquetas'}.html`,
    )
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
  )
  const known = (boot.value.fields || []).map((f) => f.key)
  const saved = (rememberedFields() || []).filter((key) => known.includes(key))
  parts.value = saved.length ? saved : known
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
