// «Avísame…» (Shell Wave D, DD8): the sheet asks the server what the user may
// ask about this record, needs a date for «si no se paga para el…», sends the
// chosen condition, and lists and removes the user's own avisos. Disparadores
// shows who receives each recipe as plain chips.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'

const state = vi.hoisted(() => ({ calls: [], replies: {} }))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: async (url, args) => {
      state.calls.push([url.split('.').pop(), args])
      const reply = state.replies[url.split('.').pop()]
      return typeof reply === 'function' ? reply(args) : reply
    },
    toast: { success: vi.fn(), error: vi.fn() },
    Button: {
      props: ['label', 'variant', 'loading', 'disabled'],
      emits: ['click'],
      setup:
        (props, { emit, attrs }) =>
        () =>
          h(
            'button',
            {
              disabled: props.disabled,
              'aria-label': attrs['aria-label'],
              onClick: () => emit('click'),
            },
            props.label,
          ),
    },
    FormControl: {
      props: ['modelValue', 'label', 'type', 'options'],
      emits: ['update:modelValue'],
      setup:
        (props, { emit }) =>
        () =>
          h('input', {
            'data-label': props.label,
            type: props.type,
            value: props.modelValue,
            onInput: (e) => emit('update:modelValue', e.target.value),
          }),
    },
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
                slots.default?.(),
                slots.actions?.(),
              ])
            : null,
    },
  }
})

import AvisameSheet from '@/components/documentos/AvisameSheet.vue'
import {
  cleanThreshold,
  offersAvisame,
  recipientChips,
} from '@/components/documentos/avisame'

globalThis.__ = (msg) => msg

const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
let app, root
function mount(props) {
  root = document.createElement('div')
  document.body.appendChild(root)
  const bound = reactive({ open: false, ...props })
  app = createApp({
    render: () =>
      h(AvisameSheet, {
        ...bound,
        'onUpdate:open': (value) => (bound.open = value),
      }),
  })
  app.mount(root)
  return bound
}
const button = (label) =>
  [...root.querySelectorAll('button')].find(
    (b) => b.textContent.trim() === label,
  )

afterEach(() => {
  app?.unmount()
  root?.remove()
  state.calls = []
  state.replies = {}
})

describe('AvisameSheet on a record', () => {
  it('needs a date for «si no se paga» and sends the chosen condition', async () => {
    state.replies.avisame_options = {
      options: [
        {
          key: 'pagada',
          label: 'Cuando se pague',
          needs_date: false,
          active: true,
        },
        {
          key: 'no_pagada',
          label: 'Si no se paga para el…',
          needs_date: true,
          active: false,
        },
      ],
      active: [{ name: 'R1', condition: 'Cuando se pague' }],
    }
    state.replies.avisame = {
      name: 'R2',
      condition: 'Si no se paga para el 20 de octubre',
      status: 'Activo',
    }
    const bound = mount({
      doctype: 'Sales Invoice',
      name: 'ACC-SINV-1',
      title: 'Juan Pérez',
    })
    bound.open = true
    await flush()

    // The condition already asked for is shown and cannot be asked twice.
    const radios = [...root.querySelectorAll('[role="radio"]')]
    expect(
      radios.map((r) => r.textContent.replace(/\s+/g, ' ').trim()),
    ).toEqual(['Cuando se pagueYa lo pediste', 'Si no se paga para el…'])
    expect(radios[0].disabled).toBe(true)
    expect(radios[1].getAttribute('aria-checked')).toBe('true')
    expect(root.textContent).toContain('Ya me avisas')

    const save = button('Avísame')
    expect(save.disabled).toBe(true) // no date yet
    const date = root.querySelector('[data-label="Fecha límite"]')
    date.value = '2026-10-20'
    date.dispatchEvent(new Event('input'))
    await flush()
    expect(button('Avísame').disabled).toBe(false)
    button('Avísame').click()
    await flush()
    expect(state.calls.at(-1)).toEqual([
      'avisame',
      {
        doctype: 'Sales Invoice',
        name: 'ACC-SINV-1',
        key: 'no_pagada',
        until_date: '2026-10-20',
      },
    ])
    expect(bound.open).toBe(false)
  })

  it('removes one of my avisos', async () => {
    state.replies.avisame_options = {
      options: [
        {
          key: 'pagada',
          label: 'Cuando se pague',
          needs_date: false,
          active: true,
        },
      ],
      active: [{ name: 'R1', condition: 'Cuando se pague' }],
    }
    state.replies.quitar = { ok: true }
    const bound = mount({ doctype: 'Sales Invoice', name: 'ACC-SINV-1' })
    bound.open = true
    await flush()
    root.querySelector('[aria-label="Quitar: Cuando se pague"]').click()
    await flush()
    expect(state.calls.map(([method]) => method)).toContain('quitar')
    expect(state.calls.find(([m]) => m === 'quitar')[1]).toEqual({ name: 'R1' })
  })
})

describe('AvisameSheet on an item', () => {
  it('watches one store below a quantity', async () => {
    state.replies.mis_avisos = []
    state.replies.avisame_stock = {
      name: 'R3',
      condition: 'Cuando baje de 3 en Centro',
      note: '',
    }
    const bound = mount({
      doctype: 'Item',
      name: 'FUNDA-13',
      title: 'Funda iPhone 13',
      warehouses: [{ warehouse: 'Centro - T', label: 'Centro', qty: 8 }],
    })
    bound.open = true
    await flush()
    expect(root.textContent).toContain('Ahora hay 8 en Centro.')
    expect(button('Avísame').disabled).toBe(true)
    for (let i = 0; i < 3; i++) root.querySelector('[aria-label="Más"]').click()
    await flush()
    button('Avísame').click()
    await flush()
    expect(state.calls.at(-1)).toEqual([
      'avisame_stock',
      { item_code: 'FUNDA-13', warehouse: 'Centro - T', threshold: 3 },
    ])
  })
})

describe('avisame helpers', () => {
  it('cleans thresholds and knows which records offer it', () => {
    expect(cleanThreshold('2,5')).toBe(2.5)
    expect(cleanThreshold('0')).toBeNull()
    expect(cleanThreshold('abc')).toBeNull()
    expect(offersAvisame('Sales Invoice')).toBe(true)
    expect(offersAvisame('Item')).toBe(true)
    expect(offersAvisame('Stock Entry')).toBe(false)
  })

  it('names who receives a recipe in plain words', () => {
    expect(
      recipientChips({
        groups: ['Compras'],
        seller: true,
        seller_label: 'Quien la pidió',
        people: [{ user: 'ana@x.mx', name: 'Ana López' }],
      }).map((chip) => chip.label),
    ).toEqual(['Compras', 'Quien la pidió', 'Ana López'])
    expect(recipientChips({})).toEqual([])
  })
})
