// «Usar en la tienda» on a product (doco.workspaces.product_equipo): the sheet
// asks the store, which piece (its serial number on a product that has them,
// else how many), who uses it and what for, says what stays for sale, and
// sends one request that a retry repeats with the same id. Never a sale.
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

import EquipoSheet from '@/components/productos/EquipoSheet.vue'
import {
  equipoDone,
  equipoPayload,
  equipoProblem,
} from '@/components/productos/equipo'

const mostrador = () => ({
  warehouse: 'Hidalgo - T',
  label: 'Hidalgo',
  actual_qty: 5,
})
const bodega = () => ({
  warehouse: 'Bodega - T',
  label: 'Bodega',
  actual_qty: 1,
})
const ACTION = {
  key: 'equipo',
  label: 'Usar en la tienda',
  enabled: true,
  people: [
    { employee: 'HR-EMP-1', name: 'Tere' },
    { employee: 'HR-EMP-2', name: 'Jenni' },
  ],
}
const TABLETS = {
  serials: {
    rows: [
      { serial: 'R8YX708GSQP', warehouse: 'Hidalgo - T' },
      { serial: 'R8YX708GZZZ', warehouse: 'Hidalgo - T' },
      { serial: 'R8YX708BODE', warehouse: 'Bodega - T' },
    ],
  },
}

describe('equipo helpers', () => {
  it('says what is missing before it can be sent', () => {
    expect(equipoProblem({ qty: 1, max: 2 })).toBe('')
    expect(equipoProblem({ qty: 0, max: 2, serial: true })).toBe(
      'Elige el número de serie de la pieza.',
    )
    expect(equipoProblem({ qty: null, max: 2 })).toBe(
      'Escribe cuántas piezas se quedan en la tienda.',
    )
    expect(equipoProblem({ qty: 3, max: 2 })).toBe(
      'Hay 2: no puedes tomar más.',
    )
    expect(equipoProblem({ qty: 1, max: 2, lots: true, batch: '' })).toBe(
      'Elige el lote.',
    )
  })

  it('sends what Doco asks for', () => {
    expect(
      equipoPayload({
        item: 'TAB',
        warehouse: 'Hidalgo - T',
        qty: 1,
        serials: ['R8YX708GSQP'],
        batch: '',
        custodian: 'HR-EMP-1',
        note: ' Mostrador ',
        requestId: 'r1',
      }),
    ).toEqual({
      request_id: 'r1',
      item: 'TAB',
      warehouse: 'Hidalgo - T',
      qty: 1,
      serials: ['R8YX708GSQP'],
      batch: '',
      custodian: 'HR-EMP-1',
      note: 'Mostrador',
    })
  })

  it('says what happened: equipment, not a sale, and who uses it', () => {
    const one = equipoDone({
      qty: 1,
      uom: 'Nos',
      store: 'Hidalgo',
      custodian: 'Tere',
      assets: [{ asset: 'ACC-ASS-1', serial: 'R8YX708GSQP' }],
    })
    expect(one).toEqual({
      toast: 'Ya es equipo de la tienda',
      text: 'SN R8YX708GSQP salió de Hidalgo como equipo de la tienda, no como venta. Lo usa Tere.',
      link: 'Ver el activo',
      asset: 'ACC-ASS-1',
    })
    const two = equipoDone({
      qty: 2,
      store: 'Hidalgo',
      assets: [{ asset: 'A1' }, { asset: 'A2' }],
    })
    expect(two.text).toBe(
      '2 piezas salió de Hidalgo como equipo de la tienda, no como venta.',
    )
    expect(two.link).toBe('')
    expect(two.asset).toBe('')
  })
})

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
    item: 'TAB',
    itemName: 'Samsung Tab A9',
    uom: 'Nos',
    rows: [mostrador(), bodega()],
    store: '',
    action: ACTION,
    units: TABLETS,
    serial: true,
    lots: false,
    ...props,
  })
  app = createApp({
    render: () =>
      h(EquipoSheet, {
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
    .filter((request) => request.url.endsWith('product_equipo.register'))
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

describe('EquipoSheet', () => {
  it('asks which tablet by its serial number in the fullest store', async () => {
    mount()
    await flush()
    expect(text('h2')).toBe('Usar en la tienda')
    expect(text('[data-subtitle]')).toBe('Samsung Tab A9')
    expect(
      all('[data-chips="equipo-tienda"] button').map((b) => b.textContent),
    ).toEqual(['Hidalgo 5 pzas', 'Bodega 1 pza'])
    expect(all('[data-equipo-serie]').map((b) => b.textContent.trim())).toEqual(
      ['R8YX708GSQP', 'R8YX708GZZZ'],
    )
    expect(find('input[data-equipo-qty]')).toBeNull()
    expect(find('[data-actions] button').disabled).toBe(true)
    expect(text('[data-equipo-falta]')).toBe(
      'Elige el número de serie de la pieza.',
    )
  })

  it('sends the serial, who uses it and what for, then closes and hands the answer over', async () => {
    const { bound, events } = mount()
    await flush()
    all('[data-equipo-serie]')[0].click()
    await flush()
    expect(text('[data-equipo-efecto]')).toBe(
      'Sale del inventario a su costo y queda como equipo de la tienda. Quedan 4 pzas para vender en Hidalgo.',
    )
    await type(find('[data-equipo-quien]'), 'HR-EMP-1')
    await type(find('[data-equipo-nota]'), 'Tableta del mostrador')
    const done = {
      qty: 1,
      store: 'Hidalgo',
      left: 4,
      custodian: 'Tere',
      assets: [{ asset: 'ACC-ASS-1', serial: 'R8YX708GSQP' }],
    }
    server.replies.push(answer(done))
    await tap('[data-actions] button')
    expect(sent()).toHaveLength(1)
    expect(sent()[0]).toMatchObject({
      item: 'TAB',
      warehouse: 'Hidalgo - T',
      qty: 1,
      serials: ['R8YX708GSQP'],
      custodian: 'HR-EMP-1',
      note: 'Tableta del mostrador',
    })
    expect(sent()[0].request_id).toBeTruthy()
    expect(bound.open).toBe(false)
    expect(events.saved).toEqual([done])
  })

  it('without serial numbers asks how many and never more than there is', async () => {
    mount({ serial: false, units: null, store: 'Bodega - T' })
    await flush()
    expect(find('input[data-equipo-qty]').value).toBe('1')
    expect(find('[data-equipo-mas]').disabled).toBe(true)
    await type(find('input[data-equipo-qty]'), '2')
    expect(find('[data-actions] button').disabled).toBe(true)
    expect(text('[data-equipo-falta]')).toBe('Hay 1: no puedes tomar más.')
  })

  it('keeps the pick through a refusal, says why and asks the page to reload', async () => {
    const { bound, events } = mount()
    await flush()
    all('[data-equipo-serie]')[1].click()
    await flush()
    server.replies.push(refusal('R8YX708GZZZ ya no está en Hidalgo.'))
    await tap('[data-actions] button')
    expect(bound.open).toBe(true)
    expect(text('[data-equipo-error]')).toBe(
      'R8YX708GZZZ ya no está en Hidalgo.',
    )
    expect(events.refresh).toBe(1)
    expect(all('[data-equipo-serie]')[1].getAttribute('aria-checked')).toBe(
      'true',
    )
  })

  it('repeats the same request after an answer that never came', async () => {
    mount()
    await flush()
    all('[data-equipo-serie]')[0].click()
    await flush()
    server.replies.push('offline')
    await tap('[data-actions] button')
    expect(text('[data-equipo-error]')).toContain(
      'We do not know if it was saved',
    )
    server.replies.push(answer({ assets: [] }))
    await tap('[data-actions] button')
    const [first, second] = sent()
    expect(second.request_id).toBe(first.request_id)
  })
})
