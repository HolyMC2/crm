// Scripts de usuario (Shell D12): words for the list and the confirms, the
// assistant's question, the numbered code view, and the page's flows: the
// switch always confirms, the engine-off banner, «¿Qué hace?», save with a
// confirm and the version stamp.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({
  calls: [],
  replies: {},
  toasts: [],
  asked: [],
  query: {},
}))
vi.mock('frappe-ui', () => ({
  call: async (url, args) => {
    const method = url.split('.').pop()
    state.calls.push([method, args])
    const reply = state.replies[method]
    if (reply instanceof Error) throw reply
    return typeof reply === 'function' ? reply(args) : reply
  },
  toast: {
    success: (text) => state.toasts.push(['success', text]),
    error: (text) => state.toasts.push(['error', text]),
  },
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: state.query }),
  useRouter: () => ({ replace: ({ query }) => (state.query = query) }),
  RouterLink: { render: () => null },
}))
vi.mock('@/components/assistant/useAssistant', async () => {
  const { computed } = await import('vue')
  return {
    assistantEnabled: computed(() => true),
    openAssistant: async (args) => {
      state.asked.push(args)
      return true
    },
    useAssistantContext: () => () => {},
  }
})
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
                h('p', props.subtitle),
                slots.default?.(),
                slots.actions?.(),
              ])
            : null,
    },
    EmptyState: {
      props: ['title', 'message', 'state'],
      setup: (props) => () =>
        h('div', { 'data-empty': props.state || 'empty' }, [
          props.title,
          props.message,
        ]),
    },
    ListRow: {
      props: ['title', 'subtitle', 'meta', 'icon', 'selected', 'subtitleLines'],
      setup:
        (props, { attrs }) =>
        () =>
          h(
            attrs.onClick ? 'button' : 'div',
            {
              'data-row': props.title,
              'data-testid': attrs['data-testid'],
              onClick: attrs.onClick,
            },
            [props.title, props.subtitle ? ` · ${props.subtitle}` : ''],
          ),
    },
    Segmented: {
      props: ['modelValue', 'options', 'label'],
      emits: ['update:modelValue'],
      setup:
        (props, { emit }) =>
        () =>
          h(
            'div',
            { role: 'radiogroup' },
            props.options.map((o) =>
              h(
                'button',
                {
                  'data-tab': o.value,
                  onClick: () => emit('update:modelValue', o.value),
                },
                o.label,
              ),
            ),
          ),
    },
  }
})

import {
  explainPrompt,
  MAX_EXPLAIN_CODE,
  numberedLines,
  rowSubtitle,
  rowTitle,
  saveCopy,
  toggleCopy,
} from '@/components/scripts/scripts'
import Scripts from '@/pages/Scripts.vue'

globalThis.__ = (msg) => msg

const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}

describe('scripts words', () => {
  it('says what a row applies to and who changed it, without ISO dates', () => {
    const text = rowSubtitle({
      aplica: 'Artículo · la lista del escritorio',
      modificado: '2025-06-15 20:12:49.663021',
      modificado_por: 'Marco Ponce',
    })
    expect(text).toMatch(/^Artículo · la lista del escritorio · Marco Ponce, /)
    expect(text).not.toMatch(/2025-06-15/)
  })

  it('titles a script by what it applies to, its raw name as meta', () => {
    const script = {
      titulo: 'Sales Order-doco-storefront-fulfillment',
      aplica: 'Pedido de venta · el formulario del escritorio',
      modificado_por: 'Marco Ponce',
    }
    expect(rowTitle(script)).toBe(
      'Pedido de venta · el formulario del escritorio',
    )
    expect(rowSubtitle(script)).toBe(
      'Sales Order-doco-storefront-fulfillment · Marco Ponce',
    )
    const field = {
      ...script,
      titulo: 'RFC',
      campo: 'tax_id',
      aplica: 'Cliente · texto',
    }
    expect(rowTitle(field)).toBe('RFC')
    expect(rowSubtitle(field)).toBe('Cliente · texto · Marco Ponce')
  })

  it('confirms switching on with when it runs, and warns when the engine is off', () => {
    const row = {
      activo: false,
      cuando: 'Se ejecutará cada vez que un documento «Nota» se guarda.',
    }
    const on = toggleCopy(row, { tipo: 'cliente' })
    expect(on.title).toBe('¿Activar este script?')
    expect(on.message).toContain('Se ejecutará cada vez')
    expect(on.confirm).toBe('Activar')
    const off = toggleCopy({ ...row, activo: true }, { tipo: 'cliente' })
    expect(off.title).toBe('¿Apagar este script?')
    const engine = toggleCopy(row, { tipo: 'servidor', motorActivo: false })
    expect(engine.message).toMatch(/no se ejecutará/)
  })

  it('warns that saving an active script counts at once', () => {
    expect(saveCopy({ activo: true, cuando: 'Cada vez.' }).message).toMatch(
      /activo/,
    )
    expect(saveCopy({ activo: false }).message).toMatch(/no lo activa/)
  })

  it('asks the assistant in plain words with the code, cut when very long', () => {
    const prompt = explainPrompt({
      name: 'bulk_add',
      aplica: 'Artículo · la lista del escritorio',
      activo: true,
      lenguaje: 'javascript',
      codigo: 'frappe.listview_settings["Item"] = {}',
    })
    expect(
      prompt.startsWith(
        'Explica en palabras sencillas qué hace este script y cuándo se ejecuta.',
      ),
    ).toBe(true)
    expect(prompt).toContain('```javascript\nfrappe.listview_settings')
    const long = explainPrompt({ codigo: 'x'.repeat(MAX_EXPLAIN_CODE + 50) })
    expect(long).toContain('solo el principio')
    expect(long.length).toBeLessThan(MAX_EXPLAIN_CODE + 400)
  })

  it('numbers the code lines', () => {
    expect(numberedLines('a\nb\n')).toEqual([
      { n: 1, text: 'a' },
      { n: 2, text: 'b' },
    ])
    expect(numberedLines('')).toEqual([])
  })
})

describe('Scripts page', () => {
  let app, root
  function mount() {
    root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp({ render: () => h(Scripts) })
    app.mount(root)
  }
  const byText = (text) =>
    [...document.querySelectorAll('button')].find(
      (b) =>
        b.textContent.trim() === text || b.getAttribute('aria-label') === text,
    )
  afterEach(() => {
    app?.unmount()
    root?.remove()
    state.calls = []
    state.replies = {}
    state.toasts = []
    state.asked = []
    state.query = {}
  })

  const row = {
    name: 'bulk_add_or_update_item_price',
    titulo: 'bulk_add_or_update_item_price',
    aplica: 'Artículo · la lista del escritorio',
    cuando:
      'Se ejecutará cada vez que alguien abra la lista de «Artículo» en el escritorio.',
    activo: false,
    modificado: '2025-06-15 20:11:47',
    modificado_por: 'Marco Ponce',
  }
  const detail = {
    ...row,
    tipo: 'cliente',
    lenguaje: 'javascript',
    codigo: 'line one\nline two\n',
    puede_editar: true,
    versiones: [
      {
        quien: 'Marco Ponce',
        cuando: '2025-06-15 20:11:47',
        texto: 'Creado',
        diff: [],
      },
    ],
  }

  it('switching on asks first, says when it runs, then saves', async () => {
    state.replies.lista = {
      filas: [row],
      total: 1,
      hay_mas: false,
      puede_editar: true,
      puede_crear: true,
    }
    state.replies.activar = { ...detail, activo: true }
    mount()
    await flush()
    expect(state.calls[0]).toEqual([
      'lista',
      { tipo: 'cliente', inicio: 0, limite: 50 },
    ])
    document.querySelector('[data-ajustes-switch]').click()
    await flush()
    expect(state.calls.some(([m]) => m === 'activar')).toBe(false)
    expect(document.body.textContent).toContain('¿Activar este script?')
    expect(document.body.textContent).toContain('abra la lista de «Artículo»')
    document.querySelector('[data-testid="documentos-confirm"]').click()
    await flush()
    const [, args] = state.calls.find(([m]) => m === 'activar')
    expect(args).toMatchObject({ tipo: 'cliente', name: row.name, activo: 1 })
    expect(state.toasts.at(-1)).toEqual(['success', 'Activado.'])
  })

  it('opens a script: numbered code, «¿Qué hace?» asks the assistant, save confirms', async () => {
    state.replies.lista = {
      filas: [row],
      total: 1,
      hay_mas: false,
      puede_editar: true,
    }
    state.replies.ver = detail
    state.replies.guardar = {
      ...detail,
      codigo: 'line one\nline 2\n',
      versiones: [
        {
          quien: 'Tú',
          cuando: '2026-10-18 17:00:00',
          texto: 'Código: +1 −1 líneas',
          diff: ['-line two', '+line 2'],
        },
        ...detail.versiones,
      ],
    }
    mount()
    await flush()
    document
      .querySelector('[data-row="Artículo · la lista del escritorio"]')
      .click()
    await flush()
    const code = document.querySelector('[data-testid="scripts-code"]')
    expect(code.textContent).toContain('1line one')
    expect(code.textContent).toContain('2line two')
    byText('¿Qué hace?').click()
    await flush()
    expect(state.asked[0].send).toBe(true)
    expect(state.asked[0].text).toContain('qué hace este script')
    expect(state.asked[0].text).toContain('line two')

    document.querySelector('[data-testid="scripts-edit"]').click()
    await flush()
    const editor = document.querySelector('[data-testid="scripts-editor"]')
    editor.value = 'line one\nline 2\n'
    editor.dispatchEvent(new Event('input'))
    await flush()
    document.querySelector('[data-testid="scripts-save"]').click()
    await flush()
    expect(state.calls.some(([m]) => m === 'guardar')).toBe(false)
    expect(document.body.textContent).toContain('¿Guardar los cambios?')
    document.querySelector('[data-testid="documentos-confirm"]').click()
    await flush()
    const [, args] = state.calls.find(([m]) => m === 'guardar')
    expect(args).toMatchObject({
      tipo: 'cliente',
      name: row.name,
      codigo: 'line one\nline 2\n',
      modificado: row.modificado,
    })
    expect(document.body.textContent).toContain('Código: +1 −1 líneas')
  })

  it('shows the engine-off banner on Servidor', async () => {
    state.replies.lista = (args) =>
      args.tipo === 'servidor'
        ? {
            filas: [],
            total: 0,
            hay_mas: false,
            motor_activo: false,
            nota: 'En este sitio los scripts de servidor están apagados; ninguno se ejecuta.',
          }
        : { filas: [], total: 0, hay_mas: false }
    mount()
    await flush()
    document.querySelector('[data-tab="servidor"]').click()
    await flush()
    expect(
      document.querySelector('[data-testid="scripts-engine-off"]').textContent,
    ).toContain('ninguno se ejecuta')
    expect(document.body.textContent).toContain('No hay scripts de servidor')
  })

  it('a worker who is not the owner sees why, not a list', async () => {
    state.replies.lista = Object.assign(
      new Error(
        'Solo el dueño o quien administra el sistema puede ver y cambiar los scripts.',
      ),
      { exc_type: 'PermissionError' },
    )
    mount()
    await flush()
    expect(
      document.querySelector('[data-empty="denied"]').textContent,
    ).toContain('Solo el dueño')
  })
})
