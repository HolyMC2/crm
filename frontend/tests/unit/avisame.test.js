// «Avísame…» (Shell Wave D, DD8): the sheet asks the server what the user may
// ask about this record, needs a date for «si no se paga para el…», sends the
// chosen condition, and lists and removes the user's own avisos. On an item
// the aviso follows the store's minimum: a store to choose, no number.
// Disparadores shows who receives each recipe as plain chips.
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
  const ListRow = (await vi.importActual('@/components/ui/ListRow.vue')).default
  return {
    ListRow,
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
import RecipientsSheet from '@/components/disparadores/RecipientsSheet.vue'
import { toast } from 'frappe-ui'
import {
  conditionInSentence,
  offersAvisame,
  recipientChips,
  storeMinimum,
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
    ).toEqual([
      'Cuando se pagueYa lo pediste',
      'Si no se paga para el…Eliges la fecha límite',
    ])
    expect(radios[0].disabled).toBe(true)
    expect(radios[1].getAttribute('aria-checked')).toBe('true')
    expect(root.textContent).toContain('Tus avisos')

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

describe('AvisameSheet on a record that already did it', () => {
  it('says so in one line and offers nothing to save', async () => {
    state.replies.avisame_options = {
      options: [],
      active: [],
      note: 'Esta factura ya está pagada.',
    }
    const bound = mount({ doctype: 'Sales Invoice', name: 'ACC-SINV-1' })
    bound.open = true
    await flush()
    expect(root.querySelector('[data-avisame-done]').textContent.trim()).toBe(
      'Esta factura ya está pagada.',
    )
    expect(root.textContent).not.toContain('Te llega a Avisos')
    expect(root.querySelectorAll('[role="radio"]')).toHaveLength(0)
    expect(button('Avísame').disabled).toBe(true)
  })

  it('keeps the note under the conditions still open', async () => {
    state.replies.avisame_options = {
      options: [
        { key: 'entregada', label: 'Cuando se entregue', active: false },
      ],
      active: [],
      note: 'Esta orden ya está facturada.',
    }
    const bound = mount({ doctype: 'Sales Order', name: 'SAL-ORD-1' })
    bound.open = true
    await flush()
    expect(root.textContent).toContain('Te llega a Avisos')
    expect(root.querySelector('[data-avisame-done]').textContent.trim()).toBe(
      'Esta orden ya está facturada.',
    )
    expect(button('Avísame').disabled).toBe(false)
  })
})

describe('AvisameSheet on an item', () => {
  const stores = () => [
    {
      warehouse: 'Centro - T',
      label: 'Centro',
      qty: 8,
      reorder_level: 5,
      watch: { name: 'R1', status: 'activo' },
    },
    {
      warehouse: 'Norte - T',
      label: 'Norte',
      qty: 3,
      reorder_level: 4,
      watch: null,
    },
    {
      warehouse: 'Sur - T',
      label: 'Sur',
      qty: null,
      reorder_level: 0,
      watch: null,
    },
  ]

  it('follows the store minimum: a store to choose and nothing to type', async () => {
    state.replies.mis_avisos = []
    state.replies.avisame_stock = {
      name: 'R3',
      condition: 'Cuando baje de 4 en Norte',
      status: 'Activo',
      note: '',
    }
    const bound = mount({
      doctype: 'Item',
      name: 'FUNDA-13',
      title: 'Funda iPhone 13',
      warehouses: stores(),
    })
    bound.open = true
    await flush()
    const radios = [...root.querySelectorAll('[role="radio"]')]
    expect(
      radios.map((r) => r.textContent.replace(/\s+/g, ' ').trim()),
    ).toEqual([
      'CentroHay 8 · Mínimo 5',
      'NorteHay 3 · Mínimo 4',
      // Where the stock read does not reach: only the minimum.
      'SurSin mínimo',
    ])
    // No quantity to type, no steppers.
    expect(root.querySelectorAll('input')).toHaveLength(0)
    expect(root.querySelector('[aria-label="Menos"]')).toBeNull()
    // First: a store with a minimum the user does not watch yet.
    expect(radios[1].getAttribute('aria-checked')).toBe('true')
    expect(
      root
        .querySelector('[data-avisame-minimum]')
        .textContent.replace(/\s+/g, ' ')
        .trim(),
    ).toBe(
      'Te aviso una vez cada vez que baje de 4 en Norte. El mínimo se cambia en «Mínimos por tienda».',
    )
    expect(button('Avísame').disabled).toBe(false)
    button('Avísame').click()
    await flush()
    expect(state.calls.at(-1)).toEqual([
      'avisame_stock',
      { item_code: 'FUNDA-13', warehouse: 'Norte - T' },
    ])
    // The store keeps its capital; only the condition's first word is lowered.
    expect(toast.success).toHaveBeenLastCalledWith(
      'Listo. Te aviso: cuando baje de 4 en Norte.',
    )
    expect(bound.open).toBe(false)
  })

  it('a store without a minimum: nothing to save, and «Poner mínimo» leads to it', async () => {
    state.replies.mis_avisos = []
    const bound = mount({
      doctype: 'Item',
      name: 'FUNDA-13',
      warehouses: stores(),
      canSetMinimum: true,
    })
    const asked = []
    bound['onSet-minimum'] = (warehouse) => asked.push(warehouse)
    bound.open = true
    await flush()
    root.querySelectorAll('[role="radio"]')[2].click()
    await flush()
    expect(root.querySelector('[data-avisame-minimum]')).toBeNull()
    expect(
      root.querySelector('[data-avisame-no-minimum]').textContent,
    ).toContain('Esta tienda no tiene mínimo. Ponlo primero.')
    expect(button('Avísame').disabled).toBe(true)
    root.querySelector('[data-avisame-set-minimum]').click()
    await flush()
    expect(bound.open).toBe(false)
    expect(asked).toEqual(['Sur - T'])
  })

  it('a store without a minimum, for who does not keep the catalog: who sets it, and no «Poner mínimo»', async () => {
    state.replies.mis_avisos = []
    const bound = mount({
      doctype: 'Item',
      name: 'FUNDA-13',
      warehouses: stores(),
    })
    bound.open = true
    await flush()
    root.querySelectorAll('[role="radio"]')[2].click()
    await flush()
    expect(
      root
        .querySelector('[data-avisame-no-minimum]')
        .textContent.replace(/\s+/g, ' ')
        .trim(),
    ).toBe(
      'Esta tienda no tiene mínimo. Pide a quien mantiene el catálogo que lo ponga.',
    )
    expect(root.querySelector('[data-avisame-set-minimum]')).toBeNull()
    expect(button('Poner mínimo')).toBeUndefined()
    expect(button('Avísame').disabled).toBe(true)
  })

  it('opens on the store the page asks for: the one whose minimum was just set', async () => {
    state.replies.mis_avisos = []
    state.replies.avisame_stock = {
      name: 'R5',
      condition: 'Cuando baje de 6 en Sur',
      status: 'Activo',
      note: '',
    }
    const warehouses = stores()
    warehouses[2].reorder_level = 6
    mount({
      open: true,
      doctype: 'Item',
      name: 'FUNDA-13',
      warehouses,
      store: 'Sur - T',
      canSetMinimum: true,
    })
    await flush()
    const radios = [...root.querySelectorAll('[role="radio"]')]
    // Without it, Norte (a minimum, no aviso yet) would come first.
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual([
      'false',
      'false',
      'true',
    ])
    expect(
      root
        .querySelector('[data-avisame-minimum]')
        .textContent.replace(/\s+/g, ' ')
        .trim(),
    ).toBe(
      'Te aviso una vez cada vez que baje de 6 en Sur. El mínimo se cambia en «Mínimos por tienda».',
    )
    button('Avísame').click()
    await flush()
    expect(state.calls.at(-1)).toEqual([
      'avisame_stock',
      { item_code: 'FUNDA-13', warehouse: 'Sur - T' },
    ])
  })

  it('says which of my avisos already warned; a paused one says «Pausado» once, in its own line', async () => {
    state.replies.mis_avisos = [
      { name: 'R1', condition: 'Cuando baje de 5 en Centro', status: 'Activo' },
      { name: 'R2', condition: 'Cuando baje de 4 en Norte', status: 'Activo' },
      {
        name: 'R4',
        condition: 'Pausado: Sur no tiene mínimo. Pon uno y vuelvo a avisarte.',
        status: 'Activo',
      },
    ]
    const warehouses = stores()
    warehouses[1].watch = { name: 'R2', status: 'disparado' }
    warehouses[2].watch = { name: 'R4', status: 'pausado' }
    const bound = mount({ doctype: 'Item', name: 'FUNDA-13', warehouses })
    bound.open = true
    await flush()
    const mine = [
      ...root.querySelectorAll('[aria-labelledby="avisame-mine"] li'),
    ]
    expect(
      mine.map((row) => row.textContent.replace(/\s+/g, ' ').trim()),
    ).toEqual([
      'Cuando baje de 5 en CentroQuitar',
      'Cuando baje de 4 en NorteYa te aviséQuitar',
      'Pausado: Sur no tiene mínimo. Pon uno y vuelvo a avisarte.Quitar',
    ])
    expect(mine[2].textContent.match(/Pausado/g)).toHaveLength(1)
    // Every store with a minimum is watched: the first with one is chosen.
    expect(
      root.querySelectorAll('[role="radio"]')[0].getAttribute('aria-checked'),
    ).toBe('true')
  })

  it('shows the server note and stays on the same store', async () => {
    state.replies.mis_avisos = []
    state.replies.avisame_stock = {
      name: 'R3',
      condition: 'Cuando baje de 4 en Norte',
      status: 'Activo',
      note: 'Ya está bajo el mínimo: te lo acabo de avisar.',
    }
    const bound = mount({
      doctype: 'Item',
      name: 'FUNDA-13',
      warehouses: stores(),
    })
    bound.open = true
    await flush()
    button('Avísame').click()
    await flush()
    expect(bound.open).toBe(true)
    expect(root.textContent).toContain(
      'Ya está bajo el mínimo: te lo acabo de avisar.',
    )
    // The list of my avisos is read again; the store stays chosen.
    expect(state.calls.filter(([m]) => m === 'mis_avisos')).toHaveLength(2)
    expect(
      root.querySelectorAll('[role="radio"]')[1].getAttribute('aria-checked'),
    ).toBe('true')
  })
})

describe('AvisameSheet mounted already open (Producto)', () => {
  it('loads my avisos and offers the one store with its minimum', async () => {
    state.replies.mis_avisos = []
    mount({
      open: true,
      doctype: 'Item',
      name: 'CONCHA',
      title: 'Concha',
      warehouses: [
        {
          warehouse: 'Centro - T',
          label: 'Centro',
          qty: 18,
          reorder_level: 19,
          watch: null,
        },
      ],
    })
    await flush()
    expect(state.calls.map(([m]) => m)).toContain('mis_avisos')
    expect(root.querySelector('[data-avisame-store]').textContent).toContain(
      'CentroHay 18 · Mínimo 19',
    )
    expect(root.querySelectorAll('input')).toHaveLength(0)
    expect(button('Avísame').disabled).toBe(false)
  })
})

describe('avisame helpers', () => {
  it("reads a store's minimum and knows which records offer it", () => {
    // A condition inside a sentence: only its first letter lowered.
    expect(conditionInSentence('Cuando baje de 4 en Bodega Centro')).toBe(
      'cuando baje de 4 en Bodega Centro',
    )
    expect(conditionInSentence('')).toBe('')
    expect(conditionInSentence(null)).toBe('')
    expect(storeMinimum({ reorder_level: 2.5 })).toBe(2.5)
    expect(storeMinimum({ reorder_level: 0 })).toBe(0)
    expect(storeMinimum({ reorder_level: null })).toBe(0)
    expect(storeMinimum(undefined)).toBe(0)
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

describe('RecipientsSheet', () => {
  it('toggles the team and the seller as checkbox rows and saves who receives', async () => {
    const saved = []
    root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp({
      render: () =>
        h(RecipientsSheet, {
          open: true,
          recipe: {
            title: 'Factura vencida',
            default_roles: ['Accounts Manager'],
            default_groups: ['Cobranza'],
            roles: ['Accounts Manager'],
            seller: false,
            seller_label: 'Vendedor',
            people: [{ user: 'ana@x.mx', name: 'Ana López' }],
          },
          onSave: (value) => saved.push(value),
        }),
    })
    app.mount(root)
    await flush()
    const boxes = [...root.querySelectorAll('[role="checkbox"]')]
    expect(boxes.map((b) => b.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
    ])
    boxes[0].click()
    boxes[1].click()
    await flush()
    expect(
      [...root.querySelectorAll('[role="checkbox"]')].map((b) =>
        b.getAttribute('aria-checked'),
      ),
    ).toEqual(['false', 'true'])
    root.querySelector('[aria-label="Quitar a Ana López"]').click()
    await flush()
    button('Guardar').click()
    expect(saved).toEqual([{ people: [], roles: [], seller: 1 }])
  })
})
