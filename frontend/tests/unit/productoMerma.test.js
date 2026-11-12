// «Registrar merma» on a product (doco.workspaces.product_merma): the sheet
// asks the store, how many (the serial numbers on a product that has them),
// the motivo and what happened, says what will be left, and sends one request
// that a retry repeats with the same id. The helpers put it in words.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'

vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    toast: { success: vi.fn(), error: vi.fn() },
    Button: {
      props: ['label', 'variant', 'loading', 'disabled'],
      emits: ['click'],
      setup:
        (props, { emit }) =>
        () =>
          h(
            'button',
            {
              disabled: props.disabled || props.loading,
              onClick: () => emit('click'),
            },
            props.label,
          ),
    },
    FormControl: {
      inheritAttrs: false,
      props: ['modelValue', 'label', 'type', 'placeholder'],
      emits: ['update:modelValue'],
      setup:
        (props, { emit, attrs }) =>
        () => {
          const rest = { ...attrs }
          delete rest.class
          return h('label', [
            props.label,
            h('input', {
              ...rest,
              value: props.modelValue,
              onInput: (event) => emit('update:modelValue', event.target.value),
            }),
          ])
        },
    },
  }
})
vi.mock('@/components/ui', async () => {
  const { h } = await import('vue')
  return {
    BottomSheet: {
      props: ['open', 'title', 'subtitle', 'dismissible'],
      setup:
        (props, { slots }) =>
        () =>
          props.open
            ? h('div', { role: 'dialog' }, [
                h('h2', props.title),
                h('p', { 'data-subtitle': '' }, props.subtitle),
                slots.default?.(),
                h('div', { 'data-actions': '' }, slots.actions?.()),
              ])
            : null,
    },
    ChipGroup: {
      props: ['modelValue', 'label', 'options', 'testid'],
      emits: ['update:modelValue'],
      setup:
        (props, { emit }) =>
        () =>
          h(
            'div',
            { 'data-chips': props.testid },
            props.options.map((option) =>
              h(
                'button',
                {
                  'data-chip': option.value,
                  'aria-pressed': String(props.modelValue === option.value),
                  onClick: () => emit('update:modelValue', option.value),
                },
                [option.label, option.count ? ` ${option.count}` : ''],
              ),
            ),
          ),
    },
    ListRow: {
      inheritAttrs: false,
      props: ['title', 'subtitle', 'selected'],
      setup:
        (props, { attrs, slots }) =>
        () =>
          h('button', { ...attrs }, [
            slots.leading?.(),
            props.title,
            props.subtitle ? h('span', ` ${props.subtitle}`) : null,
          ]),
    },
  }
})

import MermaSheet from '@/components/productos/MermaSheet.vue'
import {
  mermaDone,
  mermaPayload,
  mermaProblem,
  mermaQty,
  mermaStores,
  mermaUnits,
} from '@/components/productos/merma'

const centro = () => ({
  warehouse: 'Centro - T',
  label: 'Centro',
  actual_qty: 2,
})
const bodega = () => ({
  warehouse: 'Bodega - T',
  label: 'Bodega',
  actual_qty: 9,
})
const vacia = () => ({ warehouse: 'Norte - T', label: 'Norte', actual_qty: 0 })
const ACTION = {
  key: 'merma',
  label: 'Registrar merma',
  enabled: true,
  mode: 'confirm',
  reasons: [
    { key: 'danado', label: 'Dañado' },
    { key: 'caducado', label: 'Caducado' },
    { key: 'perdida', label: 'Robo o pérdida' },
    { key: 'otro', label: 'Otro' },
  ],
}

describe('merma helpers', () => {
  it('offers the stores that have pieces, the fullest first', () => {
    expect(
      mermaStores([centro(), vacia(), bodega()]).map((row) => row.label),
    ).toEqual(['Bodega', 'Centro'])
    expect(mermaStores(null)).toEqual([])
  })

  it('reads the serial numbers and lots of one store', () => {
    const units = {
      serials: {
        rows: [
          { serial: 'IMEI-1', warehouse: 'Centro - T' },
          { serial: 'IMEI-2', warehouse: 'Bodega - T' },
        ],
      },
      batches: {
        rows: [
          { batch: 'L-1', warehouse: 'Centro - T', qty: 4, expired: true },
        ],
      },
    }
    expect(mermaUnits(units, 'Centro - T')).toEqual({
      serials: ['IMEI-1'],
      batches: [
        { batch: 'L-1', warehouse: 'Centro - T', qty: 4, expired: true },
      ],
    })
    expect(mermaUnits(null, 'Centro - T')).toEqual({ serials: [], batches: [] })
  })

  it('takes pieces above zero only', () => {
    expect(mermaQty('2')).toBe(2)
    expect(mermaQty('1.5')).toBe(1.5)
    expect(mermaQty('0')).toBeNull()
    expect(mermaQty('')).toBeNull()
    expect(mermaQty('dos')).toBeNull()
  })

  it('says what is missing before it can be sent', () => {
    const ok = { qty: 1, max: 2, reason: 'danado', note: '' }
    expect(mermaProblem(ok)).toBe('')
    expect(mermaProblem({ ...ok, qty: null })).toBe(
      'Escribe cuántas piezas se dan de baja.',
    )
    expect(mermaProblem({ ...ok, qty: 3 })).toBe(
      'Hay 2: no puedes dar de baja más.',
    )
    expect(mermaProblem({ ...ok, reason: 'otro' })).toBe('Escribe qué pasó.')
    expect(mermaProblem({ ...ok, reason: 'otro', note: 'Muestra' })).toBe('')
    expect(mermaProblem({ ...ok, qty: 0, serial: true })).toBe(
      'Elige los números de serie que se dan de baja.',
    )
    expect(mermaProblem({ ...ok, lots: true, batch: '' })).toBe(
      'Elige el lote.',
    )
  })

  it('sends what Doco asks for', () => {
    expect(
      mermaPayload({
        item: 'MICA',
        warehouse: 'Centro - T',
        qty: 2,
        reason: 'danado',
        note: ' Se cayó ',
        serials: [],
        batch: '',
        requestId: 'r1',
      }),
    ).toEqual({
      request_id: 'r1',
      item: 'MICA',
      warehouse: 'Centro - T',
      qty: 2,
      reason: 'danado',
      note: 'Se cayó',
      serials: null,
      batch: '',
    })
  })

  it('says what happened: out of stock now, or a draft that waits', () => {
    const done = { qty: 2, uom: 'Nos', store: 'Centro', left: 8 }
    expect(mermaDone({ ...done, confirmed: true })).toEqual({
      toast: 'Merma registrada',
      text: 'Merma registrada: 2 pzas menos en Centro. Quedan 8.',
      link: 'Ver la salida',
    })
    expect(mermaDone({ ...done, confirmed: true, left: 1 }).text).toBe(
      'Merma registrada: 2 pzas menos en Centro. Queda 1.',
    )
    const draft = mermaDone({ ...done, confirmed: false, left: 10 })
    expect(draft.toast).toBe('Merma guardada como borrador')
    expect(draft.text).toContain('la existencia baja cuando la confirma')
    expect(draft.link).toBe('Abrir borrador')
  })
})

// The Productos service answers through fetch (useCompras.comprasApi).
const server = { requests: [], replies: [] }
const answer = (message) => ({ ok: true, status: 200, data: { message } })
const refusal = (text, status = 417) => ({
  ok: false,
  status,
  data: {
    exc_type: 'ValidationError',
    _server_messages: JSON.stringify([JSON.stringify({ message: text })]),
  },
})
const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
let app, root
function mount(props = {}) {
  root = document.createElement('div')
  document.body.appendChild(root)
  const events = { saved: [], refresh: 0 }
  const bound = reactive({
    open: true,
    item: 'MICA',
    itemName: 'Mica iPhone 11',
    uom: 'Nos',
    rows: [centro(), bodega(), vacia()],
    store: '',
    action: ACTION,
    units: null,
    serial: false,
    lots: false,
    ...props,
  })
  app = createApp({
    render: () =>
      h(MermaSheet, {
        ...bound,
        'onUpdate:open': (value) => (bound.open = value),
        onSaved: (result) => events.saved.push(result),
        onRefresh: () => events.refresh++,
      }),
  })
  app.config.globalProperties.__ = globalThis.__
  app.mount(root)
  return { bound, events }
}
const find = (selector) => root.querySelector(selector)
const all = (selector) => [...root.querySelectorAll(selector)]
const text = (selector) =>
  find(selector)?.textContent.replace(/\s+/g, ' ').trim()
async function type(input, value) {
  input.value = value
  input.dispatchEvent(new Event('input'))
  await flush()
}
async function tap(selector) {
  find(selector).click()
  await flush()
}
const sent = () =>
  server.requests
    .filter((request) => request.url.endsWith('product_merma.register'))
    .map((request) => request.body)

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      server.requests.push({ url, body: JSON.parse(init.body) })
      const reply = server.replies.shift()
      if (reply === 'offline') throw new TypeError('Failed to fetch')
      return {
        ok: reply.ok,
        status: reply.status,
        json: async () => reply.data,
      }
    }),
  )
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
  vi.unstubAllGlobals()
  server.requests = []
  server.replies = []
})

describe('MermaSheet', () => {
  it('starts on the fullest store with one damaged piece and says what is left', async () => {
    mount()
    await flush()
    expect(text('h2')).toBe('Registrar merma')
    expect(text('[data-subtitle]')).toBe('Mica iPhone 11')
    // Only the stores with pieces, each with how many.
    expect(
      all('[data-chips="merma-tienda"] button').map((b) => b.textContent),
    ).toEqual(['Bodega 9 pzas', 'Centro 2 pzas'])
    expect(find('[data-chip="Bodega - T"]').getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(find('input[data-merma-qty]').value).toBe('1')
    expect(find('[data-chip="danado"]').getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(text('[data-merma-hay]')).toBe('Hay 9 pzas en Bodega')
    expect(text('[data-merma-efecto]')).toBe(
      'Sale del inventario ahora. Quedan 8 pzas en Bodega.',
    )
    expect(find('[data-actions] button').disabled).toBe(false)
  })

  it('opens on the store whose row asked for it, and never lets more out than it has', async () => {
    mount({ store: 'Centro - T' })
    await flush()
    expect(find('[data-chip="Centro - T"]').getAttribute('aria-pressed')).toBe(
      'true',
    )
    await tap('[data-merma-mas]')
    expect(find('input[data-merma-qty]').value).toBe('2')
    expect(find('[data-merma-mas]').disabled).toBe(true)
    await type(find('input[data-merma-qty]'), '3')
    expect(find('[data-actions] button').disabled).toBe(true)
    // The disabled button has its sentence beside it.
    expect(text('[data-merma-falta]')).toBe('Hay 2: no puedes dar de baja más.')
    expect(find('[data-merma-efecto]')).toBeNull()
  })

  it('sends the store, the pieces and the motivo, then closes and hands the answer over', async () => {
    const { bound, events } = mount({ store: 'Centro - T' })
    await flush()
    await tap('[data-merma-mas]')
    await tap('[data-chip="perdida"]')
    await type(find('[data-merma-nota]'), 'No aparecen')
    const done = {
      entry: 'MAT-STE-1',
      confirmed: true,
      qty: 2,
      left: 0,
      store: 'Centro',
    }
    server.replies.push(answer(done))
    await tap('[data-actions] button')
    expect(sent()).toHaveLength(1)
    expect(sent()[0]).toMatchObject({
      item: 'MICA',
      warehouse: 'Centro - T',
      qty: 2,
      reason: 'perdida',
      note: 'No aparecen',
      serials: null,
      batch: '',
    })
    expect(sent()[0].request_id).toBeTruthy()
    expect(bound.open).toBe(false)
    expect(events.saved).toEqual([done])
  })

  it('«Otro» waits for what happened', async () => {
    mount()
    await flush()
    await tap('[data-chip="otro"]')
    expect(find('[data-actions] button').disabled).toBe(true)
    expect(text('[data-merma-falta]')).toBe('Escribe qué pasó.')
    await type(find('[data-merma-nota]'), 'Se regaló de muestra')
    expect(find('[data-actions] button').disabled).toBe(false)
  })

  it('keeps what was typed through a refusal, says why and asks the page to reload', async () => {
    const { bound, events } = mount({ store: 'Centro - T' })
    await flush()
    server.replies.push(refusal('En Centro hay 0: no puedes dar de baja 1.'))
    await tap('[data-actions] button')
    expect(bound.open).toBe(true)
    expect(text('[data-merma-error]')).toBe(
      'En Centro hay 0: no puedes dar de baja 1.',
    )
    expect(events.refresh).toBe(1)
    expect(events.saved).toEqual([])
    expect(find('input[data-merma-qty]').value).toBe('1')
  })

  it('repeats the same request after an answer that never came, so it is not written off twice', async () => {
    mount({ store: 'Centro - T' })
    await flush()
    server.replies.push('offline')
    await tap('[data-actions] button')
    expect(text('[data-merma-error]')).toContain(
      'We do not know if it was saved',
    )
    server.replies.push(answer({ entry: 'MAT-STE-1', confirmed: true }))
    await tap('[data-actions] button')
    const [first, second] = sent()
    expect(second.request_id).toBe(first.request_id)
  })

  it('a serial product gives up the serial numbers ticked, in the store shown', async () => {
    mount({
      serial: true,
      rows: [centro()],
      units: {
        serials: {
          rows: [
            { serial: 'IMEI-1', warehouse: 'Centro - T' },
            { serial: 'IMEI-2', warehouse: 'Centro - T' },
            { serial: 'IMEI-9', warehouse: 'Bodega - T' },
          ],
        },
      },
    })
    await flush()
    // One store: no chips to pick it. No stepper: the serials are the count.
    expect(find('[data-chips="merma-tienda"]')).toBeNull()
    expect(find('input[data-merma-qty]')).toBeNull()
    expect(all('[data-merma-serie]').map((b) => b.textContent.trim())).toEqual([
      'IMEI-1',
      'IMEI-2',
    ])
    expect(find('[data-actions] button').disabled).toBe(true)
    expect(text('[data-merma-falta]')).toBe(
      'Elige los números de serie que se dan de baja.',
    )
    all('[data-merma-serie]')[1].click()
    await flush()
    expect(all('[data-merma-serie]')[1].getAttribute('aria-checked')).toBe(
      'true',
    )
    expect(text('[data-merma-efecto]')).toBe(
      'Sale del inventario ahora. Queda 1 pza en Centro.',
    )
    server.replies.push(answer({ entry: 'MAT-STE-2', confirmed: true }))
    await tap('[data-actions] button')
    expect(sent()[0]).toMatchObject({ qty: 1, serials: ['IMEI-2'] })
  })

  it('a product with lots asks which one and takes at most what it holds', async () => {
    mount({
      lots: true,
      rows: [bodega()],
      units: {
        batches: {
          rows: [
            {
              batch: 'L-1',
              warehouse: 'Bodega - T',
              qty: 3,
              expiry: '2026-10-01',
              expired: true,
            },
            {
              batch: 'L-2',
              warehouse: 'Bodega - T',
              qty: 6,
              expiry: null,
              expired: false,
            },
          ],
        },
      },
    })
    await flush()
    expect(find('[data-actions] button').disabled).toBe(true)
    all('[data-merma-lote]')[0].click()
    await flush()
    // An expired lot is why it is written off.
    expect(find('[data-chip="caducado"]').getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(text('[data-merma-hay]')).toBe('Hay 3 pzas en el lote L-1')
    server.replies.push(answer({ entry: 'MAT-STE-3', confirmed: true }))
    await tap('[data-actions] button')
    expect(sent()[0]).toMatchObject({
      qty: 1,
      batch: 'L-1',
      reason: 'caducado',
    })
  })

  it('tells who cannot confirm that it stays a draft', async () => {
    mount({ action: { ...ACTION, mode: 'draft' } })
    await flush()
    expect(text('[data-merma-efecto]')).toBe(
      'Queda como borrador: la existencia baja cuando lo confirma quien administra el inventario.',
    )
  })
})
