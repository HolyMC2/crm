<template>
  <div ref="scroller" class="flex h-full min-w-0 flex-col overflow-y-auto">
    <AppBar
      v-if="phone"
      back
      back-label="Tableros"
      :title="board?.title || 'Tablero'"
      :loading="loading"
    >
      <template #actions>
        <button
          type="button"
          class="press flex size-12 items-center justify-center rounded-full text-ink-gray-7"
          aria-label="Pídeselo a Muelle"
          title="Pídeselo a Muelle"
          @click="ask()"
        >
          <span class="lucide-sparkles size-5" aria-hidden="true" />
        </button>
        <Dropdown v-if="board" :options="menu" align="end">
          <button
            type="button"
            class="press flex size-12 items-center justify-center rounded-full text-ink-gray-7"
            aria-label="Más acciones del tablero"
            title="Más acciones"
          >
            <span class="lucide-ellipsis-vertical size-5" aria-hidden="true" />
          </button>
        </Dropdown>
      </template>
    </AppBar>

    <div class="mx-auto w-full max-w-7xl px-4 pb-24 pt-3 sm:px-6 sm:pt-6">
      <header v-if="!phone" class="flex flex-wrap items-center gap-3">
        <div class="min-w-0 flex-1">
          <RouterLink
            :to="HOME"
            class="text-sm text-ink-gray-6 hover:text-ink-gray-8"
            >Tableros</RouterLink
          >
          <h1
            class="title-face truncate text-2xl font-semibold text-ink-gray-9"
          >
            {{ board?.title || 'Tablero' }}
          </h1>
          <p v-if="board && !board.mine" class="text-sm text-ink-gray-6">
            De {{ board.owner_name
            }}{{ board.can_write ? '' : ' · solo lectura' }}
          </p>
        </div>
        <Button
          v-if="board?.can_write"
          variant="solid"
          class="min-h-11"
          label="Agregar widget"
          data-testid="add-widget"
          @click="openSheet(null)"
        >
          <template #prefix>
            <span class="lucide-plus size-4" aria-hidden="true" />
          </template>
        </Button>
        <Button
          class="min-h-11"
          label="Pídeselo a Muelle"
          data-testid="ask-board"
          @click="ask()"
        >
          <template #prefix>
            <span class="lucide-sparkles size-4" aria-hidden="true" />
          </template>
        </Button>
        <div
          v-if="board"
          class="flex items-center gap-0.5 rounded-full bg-surface-gray-2 p-0.5"
        >
          <button
            v-if="board.can_write"
            type="button"
            class="press flex size-11 items-center justify-center rounded-full"
            :class="
              arranging
                ? 'bg-surface-base text-ink-gray-9 shadow-sm'
                : 'text-ink-gray-7'
            "
            :aria-pressed="arranging ? 'true' : 'false'"
            aria-label="Acomodar: arrastra y cambia el tamaño"
            title="Acomodar"
            data-testid="arrange"
            @click="arranging = !arranging"
          >
            <span class="lucide-move size-4" aria-hidden="true" />
          </button>
          <button
            v-if="board.can_undo"
            type="button"
            class="press flex size-11 items-center justify-center rounded-full text-ink-gray-7"
            aria-label="Deshacer el último cambio"
            title="Deshacer"
            data-testid="undo"
            @click="undo"
          >
            <span class="lucide-undo-2 size-4" aria-hidden="true" />
          </button>
          <Dropdown :options="menu" align="end">
            <button
              type="button"
              class="press flex size-11 items-center justify-center rounded-full text-ink-gray-7"
              aria-label="Más acciones del tablero"
              title="Más acciones"
            >
              <span
                class="lucide-ellipsis-vertical size-4"
                aria-hidden="true"
              />
            </button>
          </Dropdown>
        </div>
      </header>

      <!-- The board's period: every widget reads its numbers for it. -->
      <div
        v-if="board"
        class="mt-3 flex items-center gap-2 overflow-x-auto pb-1"
      >
        <button
          v-for="p in shortPeriods"
          :key="p.value"
          type="button"
          :aria-pressed="periodo === p.value ? 'true' : 'false'"
          :class="chipClass(periodo === p.value)"
          class="!text-sm"
          :data-testid="`periodo-${p.value}`"
          @click="setPeriodo(p.value)"
        >
          {{ p.label }}
        </button>
        <FormControl
          type="select"
          class="w-44 shrink-0 [&_select]:min-h-11"
          aria-label="Otro periodo"
          :model-value="
            shortPeriods.some((p) => p.value === periodo) ? '' : periodo
          "
          :options="[
            { label: 'Otro periodo…', value: '' },
            ...PERIODOS.filter((p) => !PERIODOS_CORTOS.includes(p.value)),
          ]"
          @update:model-value="(value) => value && setPeriodo(value)"
        />
        <span
          v-if="loadingData"
          class="shrink-0 text-sm text-ink-gray-5"
          role="status"
        >
          Actualizando…
        </span>
      </div>

      <p
        v-if="arranging && !phone"
        class="mt-2 rounded-6 bg-surface-gray-2 p-2 text-sm text-ink-gray-7"
      >
        Arrastra un widget para moverlo y su esquina para cambiar su tamaño. Se
        guarda solo.
        <button
          type="button"
          class="ml-1 font-medium text-ink-gray-9 underline"
          @click="arranging = false"
        >
          Listo
        </button>
      </p>

      <div
        v-if="problem"
        role="alert"
        class="mt-4 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
        data-testid="board-problem"
      >
        <strong>{{ problem.title }}.</strong> {{ problem.detail }}
        <Button class="ml-2" label="Reintentar" @click="load()" />
      </div>

      <EmptyState
        v-if="loading && !board"
        state="loading"
        title="Abriendo el tablero…"
      />
      <EmptyState
        v-else-if="board && !board.widgets.length"
        title="Este tablero está vacío"
        :message="
          board.can_write
            ? 'Agrega una gráfica, un número o una nota, o pídele a Muelle que lo arme por ti.'
            : 'Quien lo comparte todavía no le pone nada.'
        "
        :action="board.can_write ? 'Agregar widget' : ''"
        @action="openSheet(null)"
      />

      <!-- Phone: one column in reading order. -->
      <div
        v-else-if="board && phone"
        class="mt-3 flex flex-col gap-3"
        data-testid="board-column"
      >
        <div
          v-for="w in ordered"
          :key="w.id"
          :style="
            phoneHeight(w) ? { height: `${phoneHeight(w)}px` } : undefined
          "
        >
          <TableroWidget
            :widget="w"
            :payload="datos[w.id]"
            :loading="loadingData && !datos[w.id]"
            :can-edit="board.can_write"
            :currency="currency"
            :back="back"
            @edit="openSheet(w)"
            @retry="loadData([w.id], true)"
          />
        </div>
      </div>

      <!-- Desk: the board's own grid, dragged and resized in «Acomodar». -->
      <div
        v-else-if="board"
        class="-mx-1.5 mt-3"
        :class="
          arranging &&
          'rounded-7 bg-surface-gray-1 outline-dashed outline-1 outline-outline-gray-3'
        "
        data-testid="board-grid"
      >
        <GridLayout
          v-model="grid"
          :cols="COLS"
          :row-height="ROW_PX"
          :disabled="!arranging"
          @layout-updated="onLayout"
        >
          <template #item="{ i }">
            <div class="h-full p-1.5" :class="arranging && 'cursor-move'">
              <TableroWidget
                v-if="byId[i]"
                :widget="byId[i]"
                :payload="datos[i]"
                :loading="loadingData && !datos[i]"
                :can-edit="board.can_write && !arranging"
                :currency="currency"
                :back="back"
                @edit="openSheet(byId[i])"
                @retry="loadData([i], true)"
              />
            </div>
          </template>
        </GridLayout>
      </div>
    </div>

    <Fab
      v-if="phone && board?.can_write"
      label="Agregar widget"
      @click="openSheet(null)"
    />

    <WidgetSheet
      v-if="sheet.mounted"
      v-model:open="sheet.open"
      :widget="sheet.widget"
      :saving="sheet.saving"
      :problem="sheet.problem"
      @save="saveWidget"
      @duplicate="duplicateWidget"
      @remove="removeWidget"
      @ask="(draft) => ask(sheet.widget?.id ? sheet.widget : draft)"
    />
    <ShareSheet
      v-if="share.mounted && board"
      v-model:open="share.open"
      doctype="Tablero"
      :name="board.name"
      :title="board.title"
      :shared="board.shared || []"
      :can="board.mine"
      @done="(activity) => onShared(activity)"
    />
    <BottomSheet v-model:open="rename.open" title="Nombre del tablero">
      <form id="rename-form" @submit.prevent="saveTitle">
        <FormControl
          v-model="rename.title"
          type="text"
          label="Nombre"
          :maxlength="80"
          class="[&_input]:min-h-11"
        />
      </form>
      <template #footer>
        <Button
          variant="solid"
          type="submit"
          form="rename-form"
          class="min-h-11 w-full"
          label="Guardar nombre"
          :disabled="!rename.title.trim()"
        />
      </template>
    </BottomSheet>
  </div>
</template>
<script setup>
import {
  computed,
  defineAsyncComponent,
  getCurrentInstance,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Button, Dropdown, FormControl, toast } from 'frappe-ui'
import { AppBar, BottomSheet, EmptyState, Fab } from '@/components/ui'
import { chipClass } from '@/components/ui/chipClass'
import GridLayout from '@/components/Dashboard/GridLayout.vue'
import TableroWidget from '@/components/tableros/TableroWidget.vue'
import {
  openAssistant,
  useAssistantContext,
} from '@/components/assistant/useAssistant'
import { isMobile as phone } from '@/composables/breakpoint'
import { problemOf } from '@/composables/useCobranza'
import { shellBoot } from '@/composables/muelleShell'
import {
  COLS,
  HOME,
  PERIODOS,
  PERIODOS_CORTOS,
  ROW_PX,
  askPrompt,
  editOps,
  gridOf,
  moveOps,
  newWidget,
  phoneHeight,
  readingOrder,
  tablerosApi,
} from '@/tableros/board'

const WidgetSheet = defineAsyncComponent(
  () => import('@/components/tableros/WidgetSheet.vue'),
)
const ShareSheet = defineAsyncComponent(
  () => import('@/components/documentos/ShareSheet.vue'),
)

const route = useRoute()
const router = useRouter()
const scroller = ref(null)
const board = ref(null)
const datos = reactive({})
const loading = ref(false)
const loadingData = ref(false)
const problem = ref(null)
const arranging = ref(false)
const grid = ref([])
const name = computed(() => String(route.params.name || ''))
const currency = computed(() => shellBoot.value?.currency || '')
const back = computed(() => `/crm${route.fullPath}`)
const periodo = computed(() => board.value?.periodo || 'este_mes')
const shortPeriods = PERIODOS.filter((p) => PERIODOS_CORTOS.includes(p.value))
const byId = computed(() =>
  Object.fromEntries((board.value?.widgets || []).map((w) => [w.id, w])),
)
const ordered = computed(() => readingOrder(board.value?.widgets))
let ticket = 0

function show(view) {
  board.value = view
  grid.value = gridOf(view.widgets)
}

async function load() {
  const mine = ++ticket
  loading.value = true
  problem.value = null
  try {
    const view = await tablerosApi('abrir', { name: name.value })
    if (mine !== ticket) return
    show(view)
    loadData()
  } catch (error) {
    if (mine === ticket) problem.value = problemOf(error)
  } finally {
    if (mine === ticket) loading.value = false
  }
}

/** Every widget's numbers (or `ids` only), each one alone. */
async function loadData(ids = null, retry = false) {
  if (!board.value) return
  loadingData.value = true
  const args = { name: board.value.name, periodo: periodo.value }
  if (ids) args.ids = ids
  if (retry) for (const id of ids || []) delete datos[id]
  try {
    const out = await tablerosApi('datos', args)
    if (!ids) for (const key of Object.keys(datos)) delete datos[key]
    Object.assign(datos, out.datos || {})
  } catch (error) {
    const reason = problemOf(error).detail
    for (const w of board.value.widgets)
      if (!ids || ids.includes(w.id))
        datos[w.id] = { kind: 'blocked', reason, retry: true }
  } finally {
    loadingData.value = false
  }
}

/** Operations on the latest board; the answer is the board as saved. */
async function change(operaciones, { reload = [] } = {}) {
  const view = await tablerosApi('cambiar', {
    name: board.value.name,
    operaciones,
  })
  show(view)
  if (reload.length) loadData(reload)
  return view
}

async function setPeriodo(value) {
  if (value === periodo.value) return
  if (!board.value.can_write) {
    board.value = { ...board.value, periodo: value }
    return loadData()
  }
  try {
    await change([{ op: 'periodo', periodo: value }])
    loadData()
  } catch (error) {
    toast.error(problemOf(error).detail)
  }
}

let moving = null
async function onLayout(layout) {
  if (!arranging.value || !board.value) return
  const ops = moveOps(board.value.widgets, layout)
  if (!ops.length) return
  const mine = (moving = change(ops))
  try {
    await mine
  } catch (error) {
    toast.error(problemOf(error).detail)
    if (moving === mine) load()
  }
}

// --- the editor ---------------------------------------------------------------
const sheet = reactive({
  mounted: false,
  open: false,
  widget: null,
  saving: false,
  problem: '',
})
function openSheet(widget) {
  sheet.widget = widget || newWidget('grafica', null)
  sheet.problem = ''
  sheet.mounted = true
  sheet.open = true
}

async function saveWidget(draft) {
  sheet.saving = true
  sheet.problem = ''
  try {
    const before = sheet.widget?.id ? byId.value[sheet.widget.id] : null
    if (before) {
      const ops = editOps(before, draft)
      if (ops.length) {
        const { campos } = ops[0]
        await change(ops)
        if (campos.fuente || campos.fuentes || campos.tipo)
          loadData([before.id])
      }
    } else {
      const known = new Set(board.value.widgets.map((w) => w.id))
      const view = await change([{ op: 'agregar', widget: draft }])
      const added = view.widgets
        .filter((w) => !known.has(w.id))
        .map((w) => w.id)
      if (added.length) loadData(added)
    }
    sheet.open = false
    toast.success(before ? 'Widget guardado.' : 'Widget agregado.')
  } catch (error) {
    sheet.problem = problemOf(error).detail
  } finally {
    sheet.saving = false
  }
}

async function duplicateWidget() {
  const id = sheet.widget?.id
  if (!id) return
  try {
    const known = new Set(board.value.widgets.map((w) => w.id))
    const view = await change([{ op: 'duplicar', id }])
    const added = view.widgets.filter((w) => !known.has(w.id)).map((w) => w.id)
    for (const copy of added) datos[copy] = datos[id]
    sheet.open = false
    toast.success('Widget duplicado.')
  } catch (error) {
    sheet.problem = problemOf(error).detail
  }
}

async function removeWidget() {
  const id = sheet.widget?.id
  if (!id) return
  try {
    await change([{ op: 'quitar', id }])
    delete datos[id]
    sheet.open = false
    toast.success('Widget quitado. «Deshacer» lo devuelve.')
  } catch (error) {
    sheet.problem = problemOf(error).detail
  }
}

async function undo() {
  try {
    show(await tablerosApi('deshacer', { name: board.value.name }))
    loadData()
    toast.success('Listo, el tablero quedó como antes.')
  } catch (error) {
    toast.error(problemOf(error).detail)
  }
}

// --- the board's own actions ---------------------------------------------------
const rename = reactive({ open: false, title: '' })
async function saveTitle() {
  const title = rename.title.trim()
  if (!title) return
  try {
    await change([{ op: 'titulo', titulo: title }])
    rename.open = false
    toast.success('Nombre guardado.')
  } catch (error) {
    toast.error(problemOf(error).detail)
  }
}

const share = reactive({ mounted: false, open: false })
function onShared(activity) {
  if (Array.isArray(activity?.shared))
    board.value = { ...board.value, shared: activity.shared }
}

async function duplicateBoard() {
  try {
    const copy = await tablerosApi('duplicar', { name: board.value.name })
    toast.success('Tablero duplicado: ahora es tuyo.')
    router.push(`${HOME}/${copy.name}`)
  } catch (error) {
    toast.error(problemOf(error).detail)
  }
}

const removing = ref(false)
async function removeBoard() {
  if (!removing.value) {
    removing.value = true
    toast.info('Toca «Borrar tablero» otra vez para borrarlo.')
    setTimeout(() => (removing.value = false), 4000)
    return
  }
  try {
    await tablerosApi('borrar', { name: board.value.name })
    toast.success('Tablero borrado.')
    router.replace(HOME)
  } catch (error) {
    toast.error(problemOf(error).detail)
  }
}

const menu = computed(() => {
  const b = board.value
  if (!b) return []
  const items = []
  if (b.can_write)
    items.push({
      label: 'Cambiar nombre',
      onClick: () => Object.assign(rename, { open: true, title: b.title }),
    })
  if (phone.value && b.can_undo)
    items.push({ label: 'Deshacer el último cambio', onClick: undo })
  items.push({ label: 'Duplicar tablero', onClick: duplicateBoard })
  if (b.mine)
    items.push({
      label: 'Compartir',
      onClick: () => Object.assign(share, { mounted: true, open: true }),
    })
  items.push({ label: 'Actualizar números', onClick: () => loadData() })
  if (b.mine)
    items.push({
      label: removing.value ? 'Borrar tablero (confirma)' : 'Borrar tablero',
      theme: 'red',
      onClick: removeBoard,
    })
  return items
})

// --- the assistant ----------------------------------------------------------------
useAssistantContext(() =>
  board.value
    ? { doctype: 'Tablero', name: board.value.name, title: board.value.title }
    : null,
)
async function ask(widget = null) {
  const opened = await openAssistant({
    text: board.value ? askPrompt(board.value, widget) : '',
  })
  if (!opened) toast.error('El asistente no está disponible para tu usuario.')
}

// --- live: the bot's (or a coworker's) change reloads the board ---------------------
const socket = getCurrentInstance()?.appContext.config.globalProperties.$socket
function onRemote(event) {
  if (!board.value || event?.name !== board.value.name) return
  if ((event.revision || 0) <= (board.value.revision || 0)) return
  load()
}
onMounted(() => socket?.on?.('doco_tablero', onRemote))
onBeforeUnmount(() => socket?.off?.('doco_tablero', onRemote))

watch(
  name,
  (value) => {
    if (!value || route.name !== 'Tablero') return
    arranging.value = false
    for (const key of Object.keys(datos)) delete datos[key]
    board.value = null
    load()
  },
  { immediate: true },
)
</script>
