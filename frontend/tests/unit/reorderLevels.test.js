// «Mínimos por tienda» (Shell SPEC §6 DD9): ERPNext's minimum and quantity
// to order per store, read from the record's `reorder` block. The helpers put
// a store in words (its line, its projection, its other ERPNext rules, state
// and watch, what its row offers) and check what was typed; MinimoSheet edits
// one store and sends only that row, says it warns only with the worker's own
// watch, asks before «Quitar mínimo» (naming the other rules it removes),
// keeps what was typed through a refusal or a reload, and only reads for who
// does not keep the catalog. The page itself is in productoRecord.test.js.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    toast,
    Button: {
      props: ['label', 'variant', 'theme', 'loading', 'disabled'],
      emits: ['click'],
      setup:
        (props, { emit, slots }) =>
        () =>
          h(
            'button',
            {
              disabled: props.disabled || props.loading,
              onClick: () => emit('click'),
            },
            slots.default?.() ?? props.label,
          ),
    },
    FormControl: {
      inheritAttrs: false,
      props: [
        'modelValue',
        'label',
        'type',
        'error',
        'disabled',
        'placeholder',
      ],
      emits: ['update:modelValue'],
      setup:
        (props, { emit, attrs }) =>
        () => {
          const { class: _class, ...rest } = attrs
          return h('label', [
            props.label,
            h('input', {
              ...rest,
              type: props.type,
              value: props.modelValue,
              placeholder: props.placeholder,
              disabled: props.disabled,
              onInput: (event) => emit('update:modelValue', event.target.value),
            }),
            props.error ? h('span', { 'data-error': '' }, props.error) : null,
          ])
        },
    },
  }
})
vi.mock('@/components/ui', async () => {
  const { h } = await import('vue')
  return {
    BottomSheet: {
      props: ['open', 'title', 'dismissible'],
      setup:
        (props, { slots }) =>
        () =>
          props.open
            ? h('div', { role: 'dialog' }, [
                h('h2', props.title),
                slots.default?.(),
                h('div', { 'data-actions': '' }, slots.actions?.()),
              ])
            : null,
    },
  }
})

import MinimoSheet from '@/components/productos/MinimoSheet.vue'
import {
  minimumActions,
  minimumChange,
  minimumLine,
  minimumOrder,
  minimumProblems,
  minimumState,
  otherRules,
  otherRulesLine,
  projectionLine,
  purchaseRoute,
  reorderNumber,
  reorderPayload,
  reorderText,
  watchChip,
} from '@/composables/useProductos'

const MODIFIED = '2026-10-20 09:15:00.000000'
const centro = () => ({
  warehouse: 'Centro - T',
  label: 'Centro',
  actual_qty: 2,
  reorder_level: 5,
  reorder_qty: 10,
  suggested_qty: 10,
  state: 'bajo',
  watch: { name: 'AV-1', status: 'activo' },
})
const norte = () => ({
  warehouse: 'Norte - T',
  label: 'Norte',
  actual_qty: 7,
  reorder_level: 0,
  reorder_qty: 0,
  suggested_qty: 0,
  state: 'sin_minimo',
  watch: null,
})

describe('Mínimos por tienda helpers', () => {
  it('reads a typed minimum: empty is 0, up to 3 decimals, never negative', () => {
    expect(reorderNumber('')).toBe(0)
    expect(reorderNumber(' 5 ')).toBe(5)
    expect(reorderNumber('2.5')).toBe(2.5)
    expect(reorderNumber('2,5')).toBe(2.5)
    expect(reorderNumber('0.125')).toBe(0.125)
    // es-MX shows a thousand as «1,000»; typed back it stays a thousand.
    expect(reorderNumber('1,000')).toBe(1000)
    expect(reorderNumber('1,000.5')).toBe(1000.5)
    expect(reorderNumber('-1')).toBeNull()
    expect(reorderNumber('abc')).toBeNull()
    expect(reorderNumber('NaN')).toBeNull()
    expect(reorderNumber('1e3')).toBeNull()
    expect(reorderNumber('1.2345')).toBeNull()
    // Doco refuses more than a billion.
    expect(reorderNumber('1000000000')).toBe(1e9)
    expect(reorderNumber('1000000001')).toBeNull()
  })

  it('starts an input from what Doco has, empty for none', () => {
    expect(reorderText(5)).toBe('5')
    expect(reorderText(2.5)).toBe('2.5')
    expect(reorderText(0)).toBe('')
    expect(reorderText(null)).toBe('')
  })

  it('puts the state and the watch in words, colour only adds to them', () => {
    expect(minimumState({ state: 'sin_minimo' })).toEqual({
      key: 'sin_minimo',
      label: 'No minimum',
      theme: 'gray',
    })
    expect(minimumState({ state: 'faltan' })).toMatchObject({
      label: 'Without stock',
      theme: 'red',
    })
    expect(minimumState({ state: 'bajo' })).toMatchObject({
      label: 'Below minimum',
      theme: 'orange',
    })
    expect(minimumState({ state: 'ok' }).label).toBe('In order')
    // Where the stock read does not reach, Doco sends no state.
    expect(minimumState({ state: null })).toBeNull()
    expect(watchChip(null)).toBeNull()
    expect(watchChip({ name: 'AV-1', status: 'activo' }).label).toBe('Alert on')
    expect(watchChip({ name: 'AV-1', status: 'disparado' }).label).toBe(
      'Alert sent',
    )
    expect(watchChip({ name: 'AV-1', status: 'pausado' }).label).toBe(
      'Alert paused',
    )
  })

  it('says each store in one line: on hand, minimum and what to order', () => {
    expect(minimumLine(centro())).toBe('On hand 2 · Minimum 5 · Order 10')
    expect(minimumLine(norte())).toBe('On hand 7 · No minimum')
    // Not short: the quantity set to order; short without one: Doco's
    // suggestion (what is missing), never worked out here.
    const full = { ...centro(), actual_qty: 9, suggested_qty: 0, state: 'ok' }
    expect(minimumLine(full)).toBe('On hand 9 · Minimum 5 · Order 10')
    expect(minimumOrder({ reorder_qty: 0, suggested_qty: 3 })).toBe(3)
    // A store whose stock the worker does not read: no «Hay».
    expect(
      minimumLine({ ...centro(), actual_qty: null, suggested_qty: null }),
    ).toBe('Minimum 5 · Order 10')
  })

  it('says what the minimum is compared with only when it is not what is on hand', () => {
    // On hand 2, 4 on their way: the minimum is compared with 6.
    expect(projectionLine({ ...centro(), projected_qty: 6 })).toBe(
      '6 left counting what is reserved and what is on its way.',
    )
    // More reserved than there is.
    expect(projectionLine({ ...centro(), projected_qty: -1 })).toBe(
      '-1 left counting what is reserved and what is on its way.',
    )
    // The same number: nothing more to say.
    expect(projectionLine({ ...centro(), projected_qty: 2 })).toBe('')
    expect(projectionLine({ ...centro(), projected_qty: 2.0001 })).toBe('')
    // Where the stock read does not reach (Mercado shops), no numbers.
    expect(
      projectionLine({ ...centro(), actual_qty: null, projected_qty: null }),
    ).toBe('')
    expect(
      projectionLine({ ...centro(), actual_qty: null, projected_qty: 3 }),
    ).toBe('')
    expect(projectionLine(centro())).toBe('')
    expect(projectionLine(null)).toBe('')
  })

  it("lists a store's other ERPNext rules, read only, with the type in words", () => {
    expect(otherRules(centro())).toBe('')
    expect(otherRulesLine(centro())).toBe('')
    expect(otherRulesLine({ ...centro(), other_rows: [] })).toBe('')
    const store = {
      ...centro(),
      request_type: 'Purchase',
      other_rows: [
        { request_type: 'Transfer', reorder_level: 3, reorder_qty: 6 },
        { request_type: 'Material Issue', reorder_level: 1, reorder_qty: 2 },
        { request_type: 'Manufacture', reorder_level: 2.5, reorder_qty: 5 },
        // A type the page does not know shows as it comes.
        { request_type: 'Customer Provided', reorder_level: 1, reorder_qty: 1 },
      ],
    }
    expect(otherRules(store)).toBe(
      'Transfer (min. 3, order 6), Material Issue (min. 1, order 2), Manufacture (min. 2.5, order 5), Customer Provided (min. 1, order 1)',
    )
    expect(
      otherRulesLine({
        ...centro(),
        other_rows: [
          { request_type: 'Transfer', reorder_level: 3, reorder_qty: 6 },
        ],
      }),
    ).toBe('This store also has other rules: Transfer (min. 3, order 6).')
  })

  it('offers per store «Reordenar», one watch action and «Poner mínimo»', () => {
    const short = { ...centro(), watch: null }
    const buyer = { canEdit: true, canPurchase: true }
    expect(minimumActions(short, buyer)).toEqual(['reorder', 'watch'])
    expect(minimumActions(short, { canPurchase: false })).toEqual(['watch'])
    expect(minimumActions({ ...short, state: 'faltan' }, buyer)).toEqual([
      'reorder',
      'watch',
    ])
    // No suggestion, or not short: nothing to reorder.
    expect(minimumActions({ ...short, suggested_qty: 0 }, buyer)).toEqual([
      'watch',
    ])
    expect(minimumActions({ ...short, state: 'ok' }, buyer)).toEqual(['watch'])
    // A watch already there: only «Quitar aviso».
    expect(minimumActions(centro(), buyer)).toEqual(['reorder', 'unwatch'])
    // No minimum: who keeps the catalog may set one; a paused watch can go.
    expect(minimumActions(norte(), buyer)).toEqual(['set'])
    expect(minimumActions(norte(), { canEdit: false })).toEqual([])
    expect(
      minimumActions(
        { ...norte(), watch: { name: 'AV-2', status: 'pausado' } },
        buyer,
      ),
    ).toEqual(['unwatch', 'set'])
  })

  it('checks what was typed as Doco does: numbers of 0 or more; a minimum and its amount to order go together', () => {
    expect(minimumProblems({ level: '5', qty: '10' }, centro())).toEqual({})
    expect(minimumProblems({ level: '0', qty: '0' }, centro())).toEqual({})
    expect(minimumProblems({ level: '-1', qty: 'x' }, centro())).toEqual({
      level: 'Write a number of 0 or more.',
      qty: 'Write a number of 0 or more.',
    })
    expect(minimumProblems({ level: '', qty: '4' }, centro())).toEqual({
      qty: 'Set the minimum to be able to order.',
    })
    // ERPNext keeps no minimum without its amount to order: Doco's words,
    // with the store's name.
    const noAmount = {
      qty: 'Also set the amount to order in Centro: without it the minimum is not saved.',
    }
    expect(minimumProblems({ level: '5', qty: '' }, centro())).toEqual(noAmount)
    expect(minimumProblems({ level: '5', qty: '0' }, centro())).toEqual(
      noAmount,
    )
    expect(
      minimumProblems({ level: '5', qty: '' }, { warehouse: 'Sur - T' }).qty,
    ).toBe(
      'Also set the amount to order in Sur - T: without it the minimum is not saved.',
    )
  })

  it('sends one store only when it changed and every value is valid', () => {
    const store = centro()
    expect(minimumChange(store, { level: '5', qty: '10' })).toBeNull()
    expect(minimumChange(store, { level: '5.0', qty: '10' })).toBeNull()
    expect(minimumChange(store, { level: '6', qty: '10' })).toEqual({
      warehouse: 'Centro - T',
      level: 6,
      qty: 10,
    })
    // Emptied: level 0 clears the minimum.
    expect(minimumChange(store, { level: '', qty: '' })).toEqual({
      warehouse: 'Centro - T',
      level: 0,
      qty: 0,
    })
    expect(minimumChange(store, { level: 'abc', qty: '10' })).toBeNull()
    // A minimum without its amount to order is not sent.
    expect(minimumChange(norte(), { level: '3', qty: '' })).toBeNull()
    expect(minimumChange(store, { level: '5', qty: '0' })).toBeNull()
    expect(minimumChange(norte(), { level: '3', qty: '6' })).toEqual({
      warehouse: 'Norte - T',
      level: 3,
      qty: 6,
    })
  })

  it('builds the save_reorder call and the purchase for a store', () => {
    expect(
      reorderPayload({
        item: 'CONCHA',
        modified: MODIFIED,
        rows: [{ warehouse: 'Centro - T', level: 6, qty: 12 }],
        requestId: 'rid-1',
      }),
    ).toEqual({
      request_id: 'rid-1',
      item: 'CONCHA',
      modified: MODIFIED,
      rows: '[{"warehouse":"Centro - T","level":6,"qty":12}]',
    })
    expect(
      purchaseRoute('CONCHA', { warehouse: 'Centro - T', qty: 10 }),
    ).toMatchObject({
      name: 'CompraNueva',
      query: { item: 'CONCHA', warehouse: 'Centro - T', qty: '10' },
    })
  })
})

// The Productos service answers through fetch (useCompras.comprasApi).
const server = { requests: [], replies: [] }
function answer(message) {
  return { ok: true, status: 200, data: { message } }
}
function refusal(excType, text, status = 417) {
  return {
    ok: false,
    status,
    data: {
      exc_type: excType,
      _server_messages: JSON.stringify([JSON.stringify({ message: text })]),
    },
  }
}
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
  const events = { saved: [], refresh: 0, request: [] }
  const bound = reactive({
    open: true,
    item: 'CONCHA',
    store: centro(),
    modified: MODIFIED,
    canEdit: true,
    requestLabel: '',
    ...props,
  })
  app = createApp({
    render: () =>
      h(MinimoSheet, {
        ...bound,
        'onUpdate:open': (value) => (bound.open = value),
        onSaved: (result) => events.saved.push(result),
        onRefresh: () => events.refresh++,
        onRequest: (store) => events.request.push(store),
      }),
  })
  app.config.globalProperties.__ = globalThis.__
  app.mount(root)
  return { bound, events }
}
const find = (selector) => root.querySelector(selector)
const text = (selector) =>
  find(selector)?.textContent.replace(/\s+/g, ' ').trim()
async function type(input, value) {
  input.value = value
  input.dispatchEvent(new Event('input'))
  await flush()
}
const sent = () =>
  server.requests
    .filter((request) => request.url.endsWith('.save_reorder'))
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
  toast.success.mockClear()
  toast.error.mockClear()
})

describe('MinimoSheet', () => {
  it('edits one store: what it does in words; Save waits for a change and sends only that row', async () => {
    const { bound, events } = mount()
    await flush()
    expect(text('h2')).toBe('Centro')
    expect(find('[data-minimo-mode]').dataset.minimoMode).toBe('edit')
    const level = find('input[data-minimo-level]')
    const order = find('input[data-minimo-qty]')
    expect(level.value).toBe('5')
    expect(order.value).toBe('10')
    expect(level.getAttribute('inputmode')).toBe('decimal')
    // Empty «Pedir» shows what Doco would suggest.
    expect(order.placeholder).toBe('10')
    // The worker watches Centro: the minimum warns them.
    expect(text('[data-minimo-story]')).toBe(
      'When there are fewer than 5 in Centro, I let you know once and suggest ordering 10.',
    )
    expect(text('[data-minimo-watch]')).toBe(
      'Your alert for this store follows this minimum on its own.',
    )
    expect(text('[data-minimo-hint]')).toBe(
      'What you put in Order is the least each order is for; if more is missing to reach the minimum, what is missing gets ordered.',
    )
    expect(find('[data-minimo-save]').disabled).toBe(true)

    await type(level, '8')
    expect(text('[data-minimo-story]')).toBe(
      'When there are fewer than 8 in Centro, I let you know once and suggest ordering at least 10.',
    )
    // «Pedir» emptied: a minimum needs it (Doco's words), and the story
    // points at it instead of a number worked out here.
    await type(order, '')
    expect(text('[data-minimo-story]')).toBe(
      'When there are fewer than 8 in Centro, I let you know once and suggest ordering what you put in Order.',
    )
    expect(
      find('[data-minimo-qty]').closest('label').querySelector('[data-error]')
        .textContent,
    ).toBe(
      'Also set the amount to order in Centro: without it the minimum is not saved.',
    )
    expect(find('[data-minimo-save]').disabled).toBe(true)
    await type(order, '12')
    expect(find('[data-minimo-save]').disabled).toBe(false)

    const reorder = {
      modified: '2026-10-20 09:20:00.000000',
      can_edit: true,
      stores: [{ ...centro(), reorder_level: 8, reorder_qty: 12 }],
    }
    server.replies.push(
      answer({
        item: 'CONCHA',
        modified: '2026-10-20 09:20:00.000000',
        reorder,
      }),
    )
    find('[data-minimo-save]').click()
    await flush()
    expect(sent()).toHaveLength(1)
    expect(sent()[0]).toMatchObject({
      item: 'CONCHA',
      modified: MODIFIED,
      rows: '[{"warehouse":"Centro - T","level":8,"qty":12}]',
    })
    expect(typeof sent()[0].request_id).toBe('string')
    expect(toast.success).toHaveBeenCalledWith(
      'Done: the minimum of Centro is 8.',
    )
    expect(bound.open).toBe(false)
    expect(events.saved).toEqual([
      { item: 'CONCHA', modified: '2026-10-20 09:20:00.000000', reorder },
    ])
  })

  it('without the worker’s own «Avísame» there, says the minimum only suggests and how to be warned', async () => {
    mount({ store: { ...centro(), watch: null } })
    await flush()
    expect(text('[data-minimo-story]')).toBe(
      'When there are fewer than 5 in Centro, I suggest ordering 10. To get an alert, turn on «Alert me» in this store.',
    )
    expect(find('[data-minimo-watch]')).toBeNull()
    await type(find('input[data-minimo-level]'), '8')
    expect(text('[data-minimo-story]')).toBe(
      'When there are fewer than 8 in Centro, I suggest ordering at least 10. To get an alert, turn on «Alert me» in this store.',
    )
    // A typed «Pedir» is the least that gets ordered, not the whole order.
    await type(find('input[data-minimo-qty]'), '3')
    expect(text('[data-minimo-story]')).toBe(
      'When there are fewer than 8 in Centro, I suggest ordering at least 3. To get an alert, turn on «Alert me» in this store.',
    )
    // No minimum typed: the sentence asks for one.
    await type(find('input[data-minimo-level]'), '')
    expect(text('[data-minimo-story]')).toBe(
      'Set a minimum so I can let you know and suggest ordering here.',
    )
  })

  it('shows the store’s other ERPNext rules read only; «Quitar mínimo» says they go too, with «Cancelar» focused', async () => {
    const store = {
      ...centro(),
      watch: null,
      request_type: 'Purchase',
      other_rows: [
        { request_type: 'Transfer', reorder_level: 3, reorder_qty: 6 },
      ],
    }
    const { bound } = mount({ store })
    await flush()
    expect(text('[data-minimo-other-rules]')).toBe(
      'This store also has other rules: Transfer (min. 3, order 6).',
    )
    // Only the minimum is typed here.
    expect(root.querySelectorAll('input')).toHaveLength(2)
    find('[data-minimo-clear]').click()
    await flush()
    expect(text('[data-minimo-confirm] p')).toBe(
      'Remove the minimum of Centro? These go too: Transfer (min. 3, order 6). I stop suggesting orders there.',
    )
    expect(find('[data-minimo-paused]')).toBeNull()
    expect(document.activeElement).toBe(find('[data-minimo-cancel]'))
    find('[data-minimo-cancel]').click()
    await flush()
    // Without other rules, the question is the plain one.
    bound.store = { ...store, other_rows: [] }
    await flush()
    expect(find('[data-minimo-other-rules]')).toBeNull()
    find('[data-minimo-clear]').click()
    await flush()
    expect(text('[data-minimo-confirm] p')).toBe(
      'Remove the minimum of Centro? I stop suggesting orders there.',
    )
    expect(document.activeElement).toBe(find('[data-minimo-cancel]'))
  })

  it('says inline what cannot be saved', async () => {
    mount()
    await flush()
    await type(find('input[data-minimo-level]'), '-2')
    expect(
      find('[data-minimo-level]').closest('label').querySelector('[data-error]')
        .textContent,
    ).toBe('Write a number of 0 or more.')
    expect(find('[data-minimo-save]').disabled).toBe(true)
    await type(find('input[data-minimo-level]'), '')
    await type(find('input[data-minimo-qty]'), '4')
    const qtyError = () =>
      find('[data-minimo-qty]').closest('label').querySelector('[data-error]')
        ?.textContent
    expect(qtyError()).toBe('Set the minimum to be able to order.')
    expect(find('[data-minimo-save]').disabled).toBe(true)
    // A minimum with «Pedir» at 0 is refused before Doco refuses it.
    await type(find('input[data-minimo-level]'), '6')
    await type(find('input[data-minimo-qty]'), '0')
    expect(qtyError()).toBe(
      'Also set the amount to order in Centro: without it the minimum is not saved.',
    )
    expect(find('[data-minimo-save]').disabled).toBe(true)
    await type(find('input[data-minimo-qty]'), '3')
    expect(qtyError()).toBeUndefined()
    expect(find('[data-minimo-save]').disabled).toBe(false)
  })

  it('asks before «Quitar mínimo», with «Cancelar» focused; the answer pauses the watch', async () => {
    mount()
    await flush()
    find('[data-minimo-clear]').click()
    await flush()
    expect(text('[data-minimo-confirm] p')).toBe(
      'Remove the minimum of Centro? I stop suggesting orders there.',
    )
    expect(text('[data-minimo-paused]')).toBe(
      'Your alert for this store is paused until you set a minimum.',
    )
    expect(document.activeElement).toBe(find('[data-minimo-cancel]'))
    expect(find('input[data-minimo-level]')).toBeNull()
    // «Cancelar»: back to the minimum as it was.
    find('[data-minimo-cancel]').click()
    await flush()
    expect(find('[data-minimo-confirm]')).toBeNull()
    expect(find('input[data-minimo-level]').value).toBe('5')
    // Emptying «Mínimo» and saving asks the same.
    await type(find('input[data-minimo-level]'), '')
    await type(find('input[data-minimo-qty]'), '')
    find('[data-minimo-save]').click()
    await flush()
    expect(find('[data-minimo-confirm]')).not.toBeNull()
    expect(sent()).toHaveLength(0)

    server.replies.push(
      answer({ item: 'CONCHA', modified: MODIFIED, reorder: null }),
    )
    find('[data-minimo-clear-confirm]').click()
    await flush()
    expect(sent()[0].rows).toBe(
      '[{"warehouse":"Centro - T","level":0,"qty":0}]',
    )
    expect(toast.success).toHaveBeenCalledWith(
      'Removed the minimum of Centro. Your alert for this store is paused until you set a minimum.',
    )
  })

  it('keeps what was typed through a refusal, and a retry after an unknown outcome sends the same request', async () => {
    const { bound, events } = mount()
    await flush()
    await type(find('input[data-minimo-level]'), '7')
    // No answer (offline): the same request id goes again.
    server.replies.push('offline')
    find('[data-minimo-save]').click()
    await flush()
    // The outcome is not known: said first, then what to do.
    expect(text('[data-minimo-error-title]')).toBe(
      'We do not know if it was saved',
    )
    expect(text('[data-minimo-error]')).toBe(
      'We do not know if it was saved No connection. Your changes stay on screen; reconnect and check the result.',
    )
    expect(find('input[data-minimo-level]').value).toBe('7')
    expect(bound.open).toBe(true)
    expect(events.refresh).toBe(1)
    server.replies.push(
      refusal(
        'TimestampMismatchError',
        'Otro usuario cambió este artículo. Actualiza y compara; tus cambios siguen aquí.',
      ),
    )
    find('[data-minimo-save]').click()
    await flush()
    expect(sent()[1].request_id).toBe(sent()[0].request_id)
    // Doco's words, with no title: the outcome is known; the page reloads
    // for the new modified.
    expect(text('[data-minimo-error]')).toBe(
      'Otro usuario cambió este artículo. Actualiza y compara; tus cambios siguen aquí.',
    )
    expect(find('[data-minimo-error-title]')).toBeNull()
    expect(find('input[data-minimo-level]').value).toBe('7')
    expect(events.refresh).toBe(2)
    bound.modified = '2026-10-20 09:30:00.000000'
    await flush()
    server.replies.push(
      answer({ item: 'CONCHA', modified: bound.modified, reorder: null }),
    )
    find('[data-minimo-save]').click()
    await flush()
    expect(sent()[2].request_id).not.toBe(sent()[0].request_id)
    expect(sent()[2].modified).toBe('2026-10-20 09:30:00.000000')
  })

  it('a reload brings the new values without wiping what was typed', async () => {
    const { bound } = mount()
    await flush()
    await type(find('input[data-minimo-level]'), '9')
    bound.store = { ...centro(), reorder_level: 6, reorder_qty: 15 }
    await flush()
    expect(find('input[data-minimo-level]').value).toBe('9')
    expect(find('input[data-minimo-qty]').value).toBe('15')
  })

  it('a store without a minimum asks for one; there is nothing to remove', async () => {
    mount({ store: norte() })
    await flush()
    expect(text('[data-minimo-story]')).toBe(
      'Set a minimum so I can let you know and suggest ordering here.',
    )
    expect(find('[data-minimo-clear]')).toBeNull()
    expect(find('input[data-minimo-level]').value).toBe('')
    expect(find('input[data-minimo-qty]').placeholder).toBe('')
  })

  it('only reads for who does not keep the catalog, and may ask for the change', async () => {
    const { bound, events } = mount({
      canEdit: false,
      requestLabel: 'Pedir cambio',
    })
    await flush()
    expect(find('[data-minimo-mode]').dataset.minimoMode).toBe('read')
    expect(root.querySelectorAll('input')).toHaveLength(0)
    expect(text('[data-minimo-line]')).toBe('On hand 2 · Minimum 5 · Order 10')
    expect(text('[data-minimo-readonly]')).toBe(
      'The minimum is set by whoever keeps the catalog.',
    )
    expect(find('[data-minimo-save]')).toBeNull()
    expect(find('[data-minimo-other-rules]')).toBeNull()
    find('[data-minimo-request]').click()
    await flush()
    expect(bound.open).toBe(false)
    expect(events.request.map((store) => store.warehouse)).toEqual([
      'Centro - T',
    ])
    app.unmount()
    root.remove()
    // Without the request either: nothing to press. The other ERPNext rules
    // read here too.
    mount({
      canEdit: false,
      requestLabel: '',
      store: {
        ...centro(),
        other_rows: [
          { request_type: 'Manufacture', reorder_level: 1, reorder_qty: 4 },
        ],
      },
    })
    await flush()
    expect(root.querySelectorAll('button')).toHaveLength(0)
    expect(text('[data-minimo-other-rules]')).toBe(
      'This store also has other rules: Manufacture (min. 1, order 4).',
    )
  })
})
