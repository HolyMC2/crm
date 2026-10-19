// Ediciones masivas (Shell D12): the selection state (toggle, range, page,
// limit, Esc, long press), the worker's sentences, and the bar's flow
// select → confirm → apply → «Deshacer».
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'

const state = vi.hoisted(() => ({ calls: [], replies: {}, toasts: [] }))
vi.mock('frappe-ui', () => ({
  call: async (url, args) => {
    const method = url.split('.').pop()
    state.calls.push([method, args])
    const reply = state.replies[method]
    if (reply instanceof Error) throw reply
    return typeof reply === 'function' ? reply(args) : reply
  },
  toast: {
    success: (text, data) => state.toasts.push(['success', text, data]),
    error: (text, data) => state.toasts.push(['error', text, data]),
  },
}))
vi.mock('@/components/ui', async () => {
  const { h } = await import('vue')
  return {
    BottomSheet: {
      props: ['open', 'title', 'subtitle'],
      setup:
        (props, { slots }) =>
        () =>
          props.open
            ? h('div', { role: 'dialog' }, [
                h('h2', props.title),
                slots.default?.(),
                slots.actions?.(),
              ])
            : null,
    },
    ListRow: {
      props: ['title', 'subtitle', 'meta', 'avatar', 'icon', 'subtitleLines'],
      setup:
        (props, { attrs }) =>
        () =>
          h(
            attrs.onClick ? 'button' : 'div',
            { 'data-row': props.title, onClick: attrs.onClick },
            [props.title, props.subtitle ? ` · ${props.subtitle}` : ''],
          ),
    },
  }
})

import { useSeleccion, LONG_PRESS_MS } from '@/components/masivo/useSeleccion'
import {
  barActions,
  confirmCopy,
  cuantos,
  doneText,
  exportUrl,
  printUrl,
  refusedRows,
  undoneText,
  valueText,
  visiblePeople,
} from '@/components/masivo/masivo'
import BulkBar from '@/components/masivo/BulkBar.vue'

globalThis.__ = (msg) => msg

const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}

describe('useSeleccion', () => {
  const rows = ['A', 'B', 'C', 'D', 'E']

  it('toggles, picks a shift-range and the whole page, and clears', () => {
    const sel = useSeleccion()
    expect(sel.active).toBe(false)
    sel.toggle('B', 1)
    expect(sel.active).toBe(true)
    expect(sel.count).toBe(1)
    sel.range(3, rows)
    expect(sel.names).toEqual(['B', 'C', 'D'])
    sel.toggle('C', 2)
    expect(sel.isSelected('C')).toBe(false)
    sel.allOnPage(rows)
    expect(sel.count).toBe(5)
    sel.allOnPage(rows) // all picked: unpicks the page
    expect(sel.count).toBe(0)
    expect(sel.active).toBe(true) // still in selection mode until cleared
    sel.clear()
    expect(sel.active).toBe(false)
    sel.dispose()
  })

  it('never holds more than the limit and says so', () => {
    const onLimit = vi.fn()
    const sel = useSeleccion({ max: 3, onLimit })
    sel.allOnPage(rows)
    expect(sel.names).toEqual(['A', 'B', 'C'])
    expect(onLimit).toHaveBeenCalledWith(3)
    sel.dispose()
  })

  it('prunes rows that left the list', () => {
    const sel = useSeleccion()
    sel.allOnPage(rows)
    sel.prune(['A', 'E', 'Z'])
    expect(sel.names).toEqual(['A', 'E'])
    sel.dispose()
  })

  it('Esc leaves selection mode, unless a sheet is open', async () => {
    const sel = useSeleccion()
    sel.toggle('A', 0)
    await nextTick()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(sel.count).toBe(1)
    dialog.remove()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(sel.active).toBe(false)
    sel.dispose()
  })

  it('a long touch press picks the row and swallows the click that follows', () => {
    vi.useFakeTimers()
    try {
      const sel = useSeleccion()
      const on = sel.press('B', 1)
      on.pointerdown({
        pointerType: 'touch',
        button: 0,
        clientX: 10,
        clientY: 10,
      })
      vi.advanceTimersByTime(LONG_PRESS_MS + 10)
      expect(sel.names).toEqual(['B'])
      const click = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        shiftKey: false,
      }
      expect(sel.onRowClick(click, 'B', 1, rows)).toBe(true)
      expect(click.preventDefault).toHaveBeenCalled()
      expect(sel.names).toEqual(['B']) // the swallowed click did not untoggle
      // while selecting, a tap toggles instead of opening the record
      expect(sel.onRowClick({ ...click }, 'C', 2, rows)).toBe(true)
      expect(sel.names).toEqual(['B', 'C'])
      // a scroll gesture is not a long press
      const other = sel.press('D', 3)
      other.pointerdown({
        pointerType: 'touch',
        button: 0,
        clientX: 0,
        clientY: 0,
      })
      other.pointermove({ clientX: 0, clientY: 40 })
      vi.advanceTimersByTime(LONG_PRESS_MS + 10)
      expect(sel.isSelected('D')).toBe(false)
      // the mouse never long-presses
      const mouse = sel.press('E', 4)
      mouse.pointerdown({
        pointerType: 'mouse',
        button: 0,
        clientX: 0,
        clientY: 0,
      })
      vi.advanceTimersByTime(LONG_PRESS_MS + 10)
      expect(sel.isSelected('E')).toBe(false)
      sel.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('outside selection mode a click opens the record', () => {
    const sel = useSeleccion()
    const click = { preventDefault: vi.fn(), stopPropagation: vi.fn() }
    expect(sel.onRowClick(click, 'A', 0, rows)).toBe(false)
    expect(click.preventDefault).not.toHaveBeenCalled()
    sel.dispose()
  })
})

describe('masivo words', () => {
  const words = { singular: 'Factura', plural: 'Facturas' }

  it('counts in the list’s words', () => {
    expect(cuantos(1, words)).toBe('1 factura')
    expect(cuantos(5, words)).toBe('5 facturas')
    expect(cuantos(2)).toBe('2 documentos')
  })

  it('confirms the exact action', () => {
    expect(
      confirmCopy('asignar', { ...words, count: 5, persona: 'Beto', horas: 24 })
        .title,
    ).toBe('Asignar 5 facturas a Beto')
    expect(
      confirmCopy('etiquetar', { ...words, count: 1, etiquetas: ['urgente'] })
        .title,
    ).toBe('Etiquetar 1 factura con «urgente»')
    const field = {
      label: 'Estado',
      fieldtype: 'Select',
      options: [{ value: 'Open', label: 'Abierta' }],
      solo_borrador: true,
    }
    const copy = confirmCopy('campo', {
      ...words,
      count: 3,
      campo: field,
      valor: 'Open',
    })
    expect(copy.title).toBe('Cambiar «Estado» a Abierta en 3 facturas')
    expect(copy.message).toMatch(/borradores/)
    expect(copy.confirm).toBe('Cambiar')
  })

  it('values in words, never raw', () => {
    expect(valueText({ fieldtype: 'Check' }, 1)).toBe('Sí')
    expect(valueText({ fieldtype: 'Data' }, '')).toBe('vacío')
    expect(valueText({ fieldtype: 'Date' }, '2026-10-20')).not.toMatch(
      /2026-10-20/,
    )
  })

  it('reports done, unchanged, refused and undone', () => {
    expect(doneText({ hechos: 5, rechazados: [] }, words)).toBe(
      'Listo: 5 facturas',
    )
    expect(
      doneText(
        { hechos: 3, rechazados: [{ name: 'X' }, { name: 'Y' }] },
        words,
      ),
    ).toBe('Listo: 3 facturas · 2 sin cambiar')
    expect(doneText({ hechos: 0, rechazados: [], sin_cambio: ['A'] })).toMatch(
      /ya estaban así/,
    )
    expect(undoneText({ revertidos: 5, fallidos: [] }, words)).toBe(
      'Deshecho: 5 facturas',
    )
    expect(
      refusedRows([
        { name: 'ACC-1', titulo: 'Juan', motivo: 'Ya está confirmado' },
      ]),
    ).toEqual([
      {
        key: 'ACC-1',
        title: 'Juan',
        subtitle: 'Ya está confirmado',
        meta: 'ACC-1',
      },
    ])
  })

  it('builds the print and export links from the selection', () => {
    const pdf = new URL(
      printUrl('Sales Invoice', ['A', 'B'], 'Factura CFDI 4.0'),
      'http://x',
    )
    expect(pdf.pathname).toBe('/api/method/crm.api.masivo.imprimir')
    expect(JSON.parse(pdf.searchParams.get('nombres'))).toEqual(['A', 'B'])
    expect(pdf.searchParams.get('formato')).toBe('Factura CFDI 4.0')
    expect(
      new URL(printUrl('Note', ['A'], 'Standard'), 'http://x').searchParams.has(
        'formato',
      ),
    ).toBe(false)
    expect(exportUrl('Note', ['A'])).toMatch(/crm\.api\.masivo\.exportar\?/)
  })

  it('orders the bar and only shows what the role allows', () => {
    const bar = barActions({
      acciones: [
        { clave: 'exportar' },
        { clave: 'asignar' },
        { clave: 'nuevo' },
      ],
    })
    expect(bar.map((a) => a.clave)).toEqual(['asignar', 'exportar'])
    expect(bar[0].icon).toBe('lucide-user-plus')
  })
})

describe('BulkBar', () => {
  let app, root
  function mount(props) {
    root = document.createElement('div')
    document.body.appendChild(root)
    const events = { done: [], clear: 0 }
    const bound = reactive(props)
    app = createApp({
      render: () =>
        h(BulkBar, {
          ...bound,
          onDone: (r) => events.done.push(r),
          onClear: () => (events.clear += 1),
        }),
    })
    app.mount(root)
    return events
  }
  const button = (label) =>
    [...document.querySelectorAll('button')].find(
      (b) =>
        b.textContent.trim() === label ||
        b.getAttribute('aria-label') === label ||
        b.dataset.row === label,
    )

  afterEach(() => {
    app?.unmount()
    root?.remove()
    state.calls = []
    state.replies = {}
    state.toasts = []
  })

  it('assigns after a confirm that names who and how many, then undoes', async () => {
    state.replies.opciones = {
      acciones: [{ clave: 'asignar', etiqueta: 'Asignar' }],
      deshacer_horas: 24,
    }
    state.replies.people = [{ user: 'beto@x', name: 'Beto' }]
    state.replies.aplicar = {
      hechos: 4,
      nombres: ['A', 'B', 'C', 'D'],
      sin_cambio: [],
      rechazados: [{ name: 'E', titulo: 'Juan', motivo: 'No tienes permiso' }],
      deshacer: 'masivo-abc',
    }
    state.replies.deshacer = { revertidos: 4, fallidos: [] }
    const events = mount({
      doctype: 'Sales Invoice',
      nombres: ['A', 'B', 'C', 'D', 'E'],
      singular: 'Factura',
      plural: 'Facturas',
    })
    await flush()
    button('Asignar').click()
    await flush()
    button('Beto').click()
    await flush()
    expect(document.body.textContent).toContain('Asignar 5 facturas a Beto')
    expect(state.calls.some(([m]) => m === 'aplicar')).toBe(false) // nothing before confirm
    document.querySelector('[data-testid="documentos-confirm"]').click()
    await flush()
    const [, args] = state.calls.find(([m]) => m === 'aplicar')
    expect(args.accion).toBe('asignar')
    expect(JSON.parse(args.nombres)).toHaveLength(5)
    expect(JSON.parse(args.datos)).toEqual({ usuarios: ['beto@x'] })
    expect(args.request_id).toMatch(/^masivo-/)
    const [kind, text, data] = state.toasts.at(-1)
    expect(kind).toBe('success')
    expect(text).toBe('Listo: 4 facturas · 1 sin cambiar')
    expect(data.action.label).toBe('Deshacer')
    // the refused one, in words
    expect(document.body.textContent).toContain('Juan · No tienes permiso')
    expect(events.clear).toBe(1)
    await data.action.onClick()
    await flush()
    expect(state.calls.at(-1)).toEqual(['deshacer', { token: 'masivo-abc' }])
    expect(state.toasts.at(-1)[1]).toBe('Deshecho: 4 facturas')
    expect(events.done.at(-1).deshecho).toBe(true)
  })

  it('says it when the role allows nothing', async () => {
    state.replies.opciones = { acciones: [] }
    mount({ doctype: 'Note', nombres: ['A'] })
    await flush()
    expect(document.body.textContent).toContain(
      'no puede cambiar estos documentos',
    )
  })
})

describe('the bar and the people picker at 305px', () => {
  it('uses one short word per action', () => {
    const acciones = [
      'asignar',
      'etiquetar',
      'campo',
      'imprimir',
      'exportar',
    ].map((clave) => ({ clave, etiqueta: clave }))
    expect(barActions({ acciones }).map((a) => a.short)).toEqual([
      'Asignar',
      'Etiqueta',
      'Cambiar',
      'Imprimir',
      'Excel',
    ])
  })
  it('leaves lab test users out of Asignar', () => {
    expect(
      visiblePeople([
        { user: 'a@x.mx', name: 'Beto Vendedor' },
        { user: 't@x.mx', name: '_Test' },
        { user: 't5@x.mx', name: "_Test'5" },
      ]).map((p) => p.name),
    ).toEqual(['Beto Vendedor'])
    expect(visiblePeople(null)).toEqual([])
  })
})
