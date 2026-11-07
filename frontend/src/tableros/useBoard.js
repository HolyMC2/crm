// One saved board on screen (doco docs/TABLEROS.md): read it, read every
// widget's data, change it with operations, follow the bot's and coworkers'
// changes. The Tableros page and the Resultados workspace both run on it, so a
// board edits the same way wherever it opens.
import {
  computed,
  getCurrentInstance,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
} from 'vue'
import { toast } from 'frappe-ui'
import { problemOf } from '@/composables/useCobranza'
import {
  editOps,
  fitRows,
  gridOf,
  moveOps,
  newWidget,
  readingOrder,
  tablerosApi,
} from '@/tableros/board'

/**
 * `name()` is the board to show (a falsy name shows none); `dataArgs(board)`
 * the period and filters its widgets read with (the board's own period by
 * default); `local(widget)` true for a widget the page draws from data it
 * already has, which the board then never asks doco for.
 */
export function useBoard({
  name,
  dataArgs = (b) => ({ periodo: b.periodo }),
  local = () => false,
}) {
  const board = ref(null)
  const datos = reactive({})
  const loading = ref(false)
  const loadingData = ref(false)
  const problem = ref(null)
  const arranging = ref(false)
  const grid = ref([])
  let ticket = 0
  let dataTicket = 0

  const byId = computed(() =>
    Object.fromEntries((board.value?.widgets || []).map((w) => [w.id, w])),
  )
  const ordered = computed(() => readingOrder(board.value?.widgets))

  // Rows each card asked for, kept across reloads so a card never shrinks back
  // under its content. Saved only when the person arranges the board.
  const fitted = {}

  function show(view) {
    board.value = view
    grid.value = gridOf(view.widgets, fitted)
  }

  function fit(id, px) {
    const rows = fitRows(px)
    if (rows <= (fitted[id] || 0)) return
    fitted[id] = rows
    grid.value = grid.value.map((g) =>
      g.i === id && g.h < rows ? { ...g, h: rows } : g,
    )
  }

  function clear() {
    ticket++
    dataTicket++
    board.value = null
    grid.value = []
    arranging.value = false
    problem.value = null
    for (const key of Object.keys(datos)) delete datos[key]
    for (const key of Object.keys(fitted)) delete fitted[key]
  }

  async function load({ quiet = false } = {}) {
    const wanted = name()
    if (!wanted) return clear()
    const mine = ++ticket
    loading.value = !quiet
    problem.value = null
    try {
      const view = await tablerosApi('abrir', { name: wanted })
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
    const mine = ids ? dataTicket : ++dataTicket
    const all = board.value.widgets
    const wanted = (ids || all.map((w) => w.id)).filter(
      (id) => !local(byId.value[id]),
    )
    if (!ids) for (const key of Object.keys(datos)) delete datos[key]
    if (!wanted.length) {
      if (mine === dataTicket) loadingData.value = false
      return
    }
    loadingData.value = true
    const args = { name: board.value.name, ...dataArgs(board.value) }
    if (ids || wanted.length < all.length) args.ids = wanted
    if (retry) for (const id of wanted) delete datos[id]
    try {
      const out = await tablerosApi('datos', args)
      if (mine !== dataTicket) return
      Object.assign(datos, out.datos || {})
    } catch (error) {
      if (mine !== dataTicket) return
      const reason = problemOf(error).detail
      for (const id of wanted)
        datos[id] = { kind: 'blocked', reason, retry: true }
    } finally {
      if (mine === dataTicket) loadingData.value = false
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

  /** A whole new board from the server (a restore, an insert): show it and read what is new. */
  function replace(view, { all = false } = {}) {
    const known = new Set((board.value?.widgets || []).map((w) => w.id))
    show(view)
    const fresh = view.widgets.filter((w) => !known.has(w.id)).map((w) => w.id)
    if (all) loadData()
    else if (fresh.length) loadData(fresh)
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

  // --- the editor -------------------------------------------------------------
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
      const added = view.widgets
        .filter((w) => !known.has(w.id))
        .map((w) => w.id)
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

  /** The edited copy takes its library component's latest version. */
  async function catchUp() {
    const id = sheet.widget?.id
    if (!id) return
    try {
      show(
        await tablerosApi('actualizar_desde_componente', {
          tablero: board.value.name,
          widget_id: id,
        }),
      )
      loadData([id])
      sheet.open = false
      toast.success('Listo, quedó como la última versión de la biblioteca.')
    } catch (error) {
      sheet.problem = problemOf(error).detail
    }
  }

  async function undo() {
    try {
      show(await tablerosApi('deshacer', { name: board.value.name }))
      loadData()
      toast.success('Listo, quedó como antes.')
    } catch (error) {
      toast.error(problemOf(error).detail)
    }
  }

  // --- live: the bot's (or a coworker's) change reloads the board ---------------
  const socket =
    getCurrentInstance()?.appContext.config.globalProperties.$socket
  function onRemote(event) {
    if (!board.value || event?.name !== board.value.name) return
    if ((event.revision || 0) <= (board.value.revision || 0)) return
    load({ quiet: true })
  }
  onMounted(() => socket?.on?.('doco_tablero', onRemote))
  onBeforeUnmount(() => socket?.off?.('doco_tablero', onRemote))

  return {
    board,
    datos,
    loading,
    loadingData,
    problem,
    arranging,
    grid,
    byId,
    ordered,
    sheet,
    show,
    fit,
    clear,
    load,
    loadData,
    change,
    replace,
    onLayout,
    openSheet,
    saveWidget,
    duplicateWidget,
    removeWidget,
    catchUp,
    undo,
  }
}
