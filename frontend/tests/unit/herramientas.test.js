// «Herramientas del asistente» (Shell Wave D, DD17): the owner sees every
// assistant tool grouped, filters them (apagadas, escriben, clientes y fiscal,
// cambiadas), toggles one from its row, and edits confirmation, MCP, the daily
// limit and the roles in its sheet. A refused load says who may see it.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'

const state = vi.hoisted(() => ({ calls: [], replies: {}, toasts: [] }))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: async (url, args) => {
      const name = url.split('.').pop()
      state.calls.push([name, args])
      const reply = state.replies[name]
      if (reply instanceof Error) throw reply
      return typeof reply === 'function' ? reply(args) : reply
    },
    toast: {
      success: (m) => state.toasts.push(['ok', m]),
      error: (m) => state.toasts.push(['error', m]),
    },
    Button: {
      props: ['label', 'variant', 'disabled'],
      emits: ['click'],
      setup:
        (props, { emit }) =>
        () =>
          h(
            'button',
            { disabled: props.disabled, onClick: () => emit('click') },
            props.label,
          ),
    },
  }
})
vi.mock('@/composables/breakpoint', async () => {
  const { ref } = await import('vue')
  return { isMobile: ref(true) }
})
vi.mock('@/components/ui', async () => {
  const { h } = await import('vue')
  const passthrough = (tag) => ({
    props: ['title', 'state', 'message', 'action'],
    setup:
      (props, { slots }) =>
      () =>
        h(tag, { 'data-title': props.title }, [
          props.title,
          props.message,
          slots.default?.(),
        ]),
  })
  return {
    AppBar: passthrough('header'),
    EmptyState: passthrough('section'),
    FilterChips: {
      props: ['modelValue', 'chips'],
      emits: ['update:modelValue'],
      setup:
        (props, { emit }) =>
        () =>
          h(
            'nav',
            props.chips.map((chip) =>
              h(
                'button',
                {
                  'data-chip': chip.value,
                  onClick: () => emit('update:modelValue', chip.value),
                },
                `${chip.label} ${chip.count}`,
              ),
            ),
          ),
    },
    BottomSheet: {
      props: ['open', 'title'],
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
  }
})

import Page from '@/pages/AsistenteHerramientas.vue'
import ToolSheet from '@/components/herramientas/ToolSheet.vue'
import {
  chipCounts,
  grouped,
  matches,
  supporting,
} from '@/components/herramientas/herramientas'

const ROWS = [
  {
    herramienta: 'buscar',
    titulo: 'Buscar',
    resumen: 'Busca en todo lo que puedes ver.',
    efecto: 'lectura',
    grupo: 'Registros',
    habilitada: 1,
    roles: [],
    requiere_confirmacion: 0,
    limite_diario: 0,
    permitir_mcp: 1,
    cambiada: false,
  },
  {
    herramienta: 'timbrar',
    titulo: 'Timbrar',
    resumen: 'Timbra una factura.',
    efecto: 'escritura',
    grupo: 'Fiscal',
    categoria: 'fiscal',
    categoria_label: 'Fiscal (CFDI)',
    habilitada: 0,
    roles: [],
    requiere_confirmacion: 1,
    limite_diario: 0,
    permitir_mcp: 0,
    cambiada: false,
  },
  {
    herramienta: 'cambiar_precio',
    titulo: 'Cambiar precio',
    resumen: 'Precio con vigencia.',
    efecto: 'escritura',
    grupo: 'Inventario',
    habilitada: 1,
    roles: ['Puesto Encargado'],
    requiere_confirmacion: 1,
    limite_diario: 20,
    permitir_mcp: 1,
    cambiada: true,
  },
]

globalThis.__ = (msg) => msg

const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}

let app
let root
function mount(component, props = {}) {
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(component, props) })
  app.mount(root)
  return root
}

afterEach(() => {
  app?.unmount()
  root?.remove()
  state.calls = []
  state.replies = {}
  state.toasts = []
})

describe('route', () => {
  it('Más › Configuración reaches a registered page that lights «Más»', () => {
    // a router compaction once dropped this route (blank page); without
    // meta.app the shell counted it as Ventas and lit «Ventas»
    const router = readFileSync(
      resolve(__dirname, '../../src/router.js'),
      'utf8',
    )
    const record = router.match(
      /path: '\/asistente\/herramientas',[\s\S]*?\n {2}\},/,
    )?.[0]
    expect(record).toBeTruthy()
    expect(record).toContain("name: 'AsistenteHerramientas'")
    expect(record).toContain("import('@/pages/AsistenteHerramientas.vue')")
    expect(record).toMatch(/app: 'avisos'/)
    expect(record).toMatch(/ownPhoneHeader: true/)
  })
})

describe('helpers', () => {
  it('filters by chip and query', () => {
    expect(
      ROWS.filter((r) => matches(r, 'apagadas', '')).map((r) => r.herramienta),
    ).toEqual(['timbrar'])
    expect(ROWS.filter((r) => matches(r, 'escriben', '')).length).toBe(2)
    expect(ROWS.filter((r) => matches(r, 'sensibles', '')).length).toBe(1)
    expect(ROWS.filter((r) => matches(r, 'cambiadas', '')).length).toBe(1)
    expect(ROWS.filter((r) => matches(r, 'todas', 'vigencia')).length).toBe(1)
    // the tool id is not on screen, so it does not match either
    expect(
      ROWS.filter((r) => matches(r, 'todas', 'cambiar_precio')).length,
    ).toBe(0)
  })

  it('counts chips and orders groups', () => {
    const counts = Object.fromEntries(
      chipCounts(ROWS).map((c) => [c.value, c.count]),
    )
    expect(counts).toMatchObject({
      todas: 3,
      apagadas: 1,
      escriben: 2,
      sensibles: 1,
      cambiadas: 1,
    })
    expect(grouped(ROWS).map((g) => g.group)).toEqual([
      'Registros',
      'Inventario',
      'Fiscal',
    ])
  })

  it('says the limits in one line', () => {
    expect(supporting(ROWS[2])).toBe(
      'Pide confirmación · Solo: Puesto Encargado · 20 al día',
    )
    expect(supporting(ROWS[1])).toBe('Pide confirmación · Sin MCP')
    expect(supporting(ROWS[0])).toBe('')
  })
})

describe('page', () => {
  it('lists tools by group and toggles one from its row', async () => {
    state.replies.herramientas = {
      herramientas: ROWS.map((r) => ({ ...r })),
      mcp_activo: 1,
    }
    state.replies.guardar = ({ herramienta, valores }) => ({
      ...ROWS.find((r) => r.herramienta === herramienta),
      ...JSON.parse(valores),
      cambiada: true,
    })
    const el = mount(Page)
    await flush()
    const headings = [...el.querySelectorAll('section h2')].map((n) =>
      n.textContent.trim(),
    )
    expect(headings).toEqual(['Registros · 1', 'Inventario · 1', 'Fiscal · 1'])
    expect(el.textContent).toContain('vienen apagadas')
    const toggle = el.querySelector('[aria-label="Encender: Timbrar"]')
    toggle.click()
    await flush()
    const [name, args] = state.calls.find(([n]) => n === 'guardar')
    expect(name).toBe('guardar')
    expect(args.herramienta).toBe('timbrar')
    expect(JSON.parse(args.valores)).toEqual({ habilitada: 1 })
    expect(state.toasts).toContainEqual(['ok', 'Encendida: Timbrar.'])
    expect(el.querySelector('[aria-label="Apagar: Timbrar"]')).not.toBeNull()
  })

  it('filters with the chips', async () => {
    state.replies.herramientas = { herramientas: ROWS.map((r) => ({ ...r })) }
    const el = mount(Page)
    await flush()
    el.querySelector('[data-chip="apagadas"]').click()
    await flush()
    expect(
      [...el.querySelectorAll('li')].map((li) => li.textContent),
    ).toHaveLength(1)
    expect(el.textContent).toContain('Timbrar')
    expect(el.textContent).not.toContain('Cambiar precio')
  })

  it('rolls back and explains a refused save', async () => {
    state.replies.herramientas = { herramientas: ROWS.map((r) => ({ ...r })) }
    state.replies.guardar = Object.assign(new Error('x'), {
      messages: ['Solo el dueño cambia las herramientas del asistente.'],
    })
    const el = mount(Page)
    await flush()
    el.querySelector('[aria-label="Apagar: Buscar"]').click()
    await flush()
    expect(state.toasts).toContainEqual([
      'error',
      'Solo el dueño cambia las herramientas del asistente.',
    ])
    expect(el.querySelector('[aria-label="Apagar: Buscar"]')).not.toBeNull()
  })

  it('a refused load says who sees the screen', async () => {
    state.replies.herramientas = Object.assign(new Error('x'), {
      exc_type: 'PermissionError',
    })
    const el = mount(Page)
    await flush()
    expect(el.textContent).toContain('Solo el dueño ve esta pantalla')
  })
})

describe('sheet', () => {
  it('edits confirmation, MCP, limit and roles', async () => {
    state.replies.roles = ['Puesto Encargado', 'Sales User']
    const saved = []
    const row = ref({ ...ROWS[2] })
    root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp({
      render: () =>
        h(ToolSheet, {
          open: true,
          row: row.value,
          mcpOn: true,
          onSave: (changes) => saved.push(changes),
        }),
    })
    app.mount(root)
    await flush()
    root.querySelector('[aria-label="Pedir confirmación"]').click()
    root.querySelector('[aria-label="Permitir por MCP"]').click()
    const input = root.querySelector('input[type="number"]')
    input.value = '5'
    input.dispatchEvent(new Event('input'))
    input.dispatchEvent(new Event('change'))
    root.querySelector('[aria-label="Quitar Puesto Encargado"]').click()
    const select = root.querySelector('select')
    expect([...select.options].map((o) => o.value)).toEqual(['', 'Sales User'])
    select.value = 'Sales User'
    select.dispatchEvent(new Event('change'))
    expect(saved).toEqual([
      { requiere_confirmacion: 0 },
      { permitir_mcp: 0 },
      { limite_diario: 5 },
      { roles: [] },
      { roles: ['Puesto Encargado', 'Sales User'] },
    ])
    expect(root.textContent).toContain('Volver a como viene')
  })

  it('shows the owner line, never the model text or the tool id', async () => {
    const row = {
      ...ROWS[2],
      descripcion:
        'Cambia precios de venta: lineas [{articulo, precio}]. Úsala para…',
    }
    root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp({
      render: () => h(ToolSheet, { open: true, row, mcpOn: true }),
    })
    app.mount(root)
    await flush()
    expect(root.textContent).toContain('Precio con vigencia.')
    expect(root.textContent).not.toContain('Úsala')
    expect(root.textContent).not.toContain('cambiar_precio')
    expect(root.textContent).not.toContain('Lo que lee el asistente')
  })
})
