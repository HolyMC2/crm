// Cuadre (Bancos, Shell DD19): «¿Cuadra con el banco?» says the two balances,
// the difference and its reasons in the worker's words, and links the pairs it
// found with one tap; what the engine refuses stays on the sheet, in words.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({ call: vi.fn(), openAssistant: vi.fn() }))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: (...args) => state.call(...args),
    Button: {
      props: ['label', 'variant', 'loading', 'disabled', 'type'],
      emits: ['click'],
      setup:
        (props, { emit, attrs }) =>
        () =>
          h(
            'button',
            {
              ...attrs,
              type: props.type || 'button',
              disabled: props.disabled,
              onClick: () => emit('click'),
            },
            props.label,
          ),
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
                h('p', { 'data-subtitle': '' }, props.subtitle),
                slots.default?.(),
                slots.actions?.(),
              ])
            : null,
    },
    ExpandTransition: {
      setup:
        (_p, { slots }) =>
        () =>
          slots.default?.(),
    },
  }
})
vi.mock('vue-router', async () => {
  const { h } = await import('vue')
  return {
    RouterLink: {
      props: ['to'],
      setup:
        (_p, { slots, attrs }) =>
        () =>
          h('a', attrs, slots.default?.()),
    },
  }
})
vi.mock('@/components/assistant/useAssistant', () => ({
  openAssistant: (...args) => state.openAssistant(...args),
}))

import {
  cuadreRows,
  differenceText,
  linkable,
  monthsText,
} from '@/components/bancos/cuadre'
import CuadreSheet from '@/components/bancos/CuadreSheet.vue'

const NOW = new Date(2026, 10, 16, 12, 0, 0)
const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

// BBVA débito on doco, 11-16, in the shape crm.api.bancos_cuadre.cuadre answers.
function debito(extra = {}) {
  return {
    cuenta: 'BBVA Debito - BBVA Mexico',
    kind: 'banco',
    currency: 'MXN',
    as_of: '2026-11-16',
    bank: 4663.09,
    bank_at: '2026-11-16 09:37:31',
    bank_source: 'conexion',
    books: -755,
    difference: 5418.09,
    agrees: false,
    start: '2026-09-02',
    first: '2026-03-21',
    holes: ['2026-05', '2026-06', '2026-07', '2026-08'],
    behind: false,
    before: { count: 24, from: '2026-03-21', to: '2026-04-18' },
    opening: { bank: -1200, books: 2200 },
    lines: [
      { key: 'pares', count: 2, amount: 3260, effect: 0 },
      { key: 'solo_banco', count: 70, amount: 8093.55, effect: 8093.55 },
      { key: 'solo_libros', count: 12, amount: -725.46, effect: 725.46 },
      { key: 'antes', count: 0, amount: -3400, effect: -3400 },
    ],
    pairs: [
      {
        movimiento: {
          name: 'ACC-BTN-2026-00437',
          date: '2026-10-07',
          amount: -385,
          title: 'CellCity',
          detail: 'Transferencia enviada',
        },
        registro: {
          doctype: 'Payment Entry',
          name: 'ACC-PAY-2026-00182',
          date: '2026-10-07',
          amount: -385,
          word: 'Pago',
          party: 'CellCity',
          matchable: true,
        },
        ligable: true,
      },
      {
        movimiento: {
          name: 'ACC-BTN-2026-00403',
          date: '2026-09-11',
          amount: 1920,
          title: 'Transferencia recibida',
          detail: '',
        },
        registro: {
          doctype: 'Sales Invoice',
          name: 'ACC-SINV-2026-03260',
          date: '2026-09-11',
          amount: 1920,
          word: 'Venta',
          party: 'Jesús Díaz',
          matchable: false,
        },
        ligable: false,
      },
    ],
    pairs_total: 2,
    only_bank: [],
    only_bank_total: 70,
    only_books: [],
    only_books_total: 12,
    conexion: null,
    can: { ligar: true, conectar: true },
    engine: 'contador',
    ...extra,
  }
}

describe('cuadre words', () => {
  it('names the months without bank movements', () => {
    expect(monthsText(['2026-05', '2026-06', '2026-07', '2026-08'], NOW)).toBe(
      'mayo, junio, julio y agosto',
    )
    expect(monthsText(['2025-12', '2026-01'], NOW)).toBe(
      'diciembre 2025 y enero 2026',
    )
    expect(monthsText(['2025-07'], NOW)).toBe('julio 2025')
    expect(monthsText([], NOW)).toBe('')
  })

  it('says whether the books agree with the bank', () => {
    expect(differenceText(0.001, 'MXN')).toBe('Cuadra con el banco')
    expect(differenceText(-6745.09, 'MXN')).toMatch(
      /^No cuadra por \$6,745\.09$/,
    )
    expect(differenceText(null, 'MXN')).toBe('')
  })

  it('reads the reasons in the order they get fixed', () => {
    const rows = cuadreRows(debito(), NOW)
    expect(rows.map((r) => r.key)).toEqual([
      'pares',
      'solo_banco',
      'solo_libros',
      'antes',
    ])
    expect(rows[0].title).toBe('2 movimientos ya están en tus libros')
    expect(rows[0].amount).toBeNull()
    expect(rows[1].title).toBe('70 movimientos del banco sin registrar')
    expect(rows[2].title).toBe('12 registros sin movimiento del banco')
    expect(rows[3].title).toBe('Antes del 2 sep')
    expect(rows[3].detail).toContain(
      '24 movimientos sueltos del 21 mar al 18 abr',
    )
  })

  it('a card speaks of charges and payments', () => {
    const rows = cuadreRows(
      debito({
        kind: 'tarjeta',
        lines: [{ key: 'solo_banco', count: 1, amount: 99, effect: 99 }],
      }),
      NOW,
    )
    expect(rows[0].title).toBe('1 cargo o pago de la tarjeta sin registrar')
  })

  it('only payments and journal entries are linked from the shell', () => {
    expect(linkable(debito().pairs)).toEqual([
      {
        movimiento: 'ACC-BTN-2026-00437',
        doctype: 'Payment Entry',
        name: 'ACC-PAY-2026-00182',
      },
    ])
  })
})

describe('CuadreSheet', () => {
  let host, app
  beforeEach(() => {
    state.call.mockReset()
    state.openAssistant.mockReset()
    host = document.createElement('div')
    document.body.appendChild(host)
  })
  afterEach(() => {
    app?.unmount()
    host.remove()
  })
  const mount = () => {
    const events = { ver: [], changed: 0, open: [] }
    app = createApp({
      render: () =>
        h(CuadreSheet, {
          open: true,
          cuenta: 'BBVA Debito - BBVA Mexico',
          label: 'BBVA Débito',
          onVer: (e) => events.ver.push(e),
          onChanged: () => events.changed++,
          'onUpdate:open': (v) => events.open.push(v),
        }),
    })
    app.mount(host)
    return events
  }

  it('shows both balances, the difference and its reasons', async () => {
    state.call.mockResolvedValue(debito())
    mount()
    await flush()
    expect(state.call).toHaveBeenCalledWith('crm.api.bancos_cuadre.cuadre', {
      cuenta: 'BBVA Debito - BBVA Mexico',
    })
    const cifras = host.querySelector('[data-bancos-cuadre-cifras]').textContent
    expect(cifras).toContain('En el banco')
    expect(cifras).toContain('$4,663.09')
    expect(cifras).toContain('−$755.00')
    expect(
      host.querySelector('[data-bancos-cuadre-diferencia]').textContent.trim(),
    ).toMatch(/^\+\$5,418\.09$/)
    expect(host.querySelector('h3').textContent.trim()).toBe(
      'Por qué no cuadra',
    )
    expect(
      host.querySelector('[data-bancos-cuadre-huecos]').textContent,
    ).toContain('mayo, junio, julio y agosto')
    // A synced balance needs no typing.
    expect(host.querySelector('[data-bancos-cuadre-saldo]')).toBeNull()
  })

  it('links the pairs the engine can link, and says what it refused', async () => {
    state.call.mockImplementation(async (method) => {
      if (method.endsWith('.cuadre')) return debito()
      if (method.endsWith('.ligar'))
        return {
          ligados: [
            { movimiento: 'ACC-BTN-2026-00437', name: 'ACC-PAY-2026-00182' },
          ],
          rechazados: [],
        }
    })
    const events = mount()
    await flush()
    host.querySelector('[data-bancos-cuadre-pares]').click()
    await flush()
    const lista = host.querySelector('[data-bancos-cuadre-lista]')
    expect(lista.textContent).toContain('CellCity')
    expect(lista.textContent).toContain('Aún no se puede ligar desde aquí')
    const button = host.querySelector('[data-bancos-cuadre-ligar]')
    expect(button.textContent).toBe('Ligar 1 movimiento')
    button.click()
    await flush()
    const [method, args] = state.call.mock.calls.find(([m]) =>
      m.endsWith('.ligar'),
    )
    expect(method).toBe('crm.api.bancos_cuadre.ligar')
    expect(JSON.parse(args.pares)).toEqual([
      {
        movimiento: 'ACC-BTN-2026-00437',
        doctype: 'Payment Entry',
        name: 'ACC-PAY-2026-00182',
      },
    ])
    expect(lista.textContent).toContain('Ligado')
    expect(lista.textContent).not.toContain('ACC-PAY')
    expect(host.textContent).toContain('1 ligado')
    expect(host.querySelector('[data-bancos-cuadre-ligar]')).toBeNull()
    expect(events.changed).toBe(1)
  })

  it('a refused link stays on its row in words', async () => {
    state.call.mockImplementation(async (method) => {
      if (method.endsWith('.cuadre')) return debito()
      if (method.endsWith('.ligar'))
        return {
          ligados: [],
          rechazados: [
            {
              movimiento: 'ACC-BTN-2026-00437',
              name: 'ACC-PAY-2026-00182',
              message: 'El mes de octubre está cerrado.',
            },
          ],
        }
    })
    const events = mount()
    await flush()
    host.querySelector('[data-bancos-cuadre-pares]').click()
    await flush()
    host.querySelector('[data-bancos-cuadre-ligar]').click()
    await flush()
    expect(host.textContent).toContain('El mes de octubre está cerrado.')
    expect(host.textContent).toContain('1 no se pudo')
    // A refused pair is not offered again.
    expect(host.querySelector('[data-bancos-cuadre-ligar]')).toBeNull()
    expect(events.changed).toBe(0)
  })

  it('without a bank figure the person types it and compares', async () => {
    state.call.mockImplementation(async (method, args) => {
      if (args.saldo_banco)
        return debito({
          bank: 12000,
          bank_source: 'escrito',
          bank_at: null,
          difference: 12755,
        })
      return debito({
        bank: null,
        bank_source: null,
        difference: null,
        opening: null,
      })
    })
    mount()
    await flush()
    expect(host.querySelector('h3').textContent.trim()).toBe(
      'Lo que falta ligar o registrar',
    )
    const input = host.querySelector('#cuadre-saldo')
    input.value = '12,000'
    input.dispatchEvent(new Event('input'))
    await flush()
    host
      .querySelector('[data-bancos-cuadre-saldo]')
      .dispatchEvent(new Event('submit'))
    await flush()
    expect(state.call).toHaveBeenLastCalledWith(
      'crm.api.bancos_cuadre.cuadre',
      {
        cuenta: 'BBVA Debito - BBVA Mexico',
        saldo_banco: '12,000',
      },
    )
    expect(
      host.querySelector('[data-bancos-cuadre-cifras]').textContent,
    ).toContain('lo escribiste tú')
  })

  it('hands the bank-only movements to the assistant', async () => {
    state.call.mockResolvedValue(debito())
    state.openAssistant.mockResolvedValue(true)
    const events = mount()
    await flush()
    host.querySelector('[data-bancos-cuadre-asistente]').click()
    // The assistant module loads on the tap.
    await vi.waitFor(() => expect(events.open).toEqual([false]))
    expect(state.openAssistant).toHaveBeenCalledWith({
      text: 'Explícame los movimientos del banco sin registrar de BBVA Débito y ayúdame a registrarlos.',
      send: true,
    })
  })

  it('a server traceback never reaches the worker', async () => {
    state.call.mockRejectedValue(new Error('Traceback (most recent call last)'))
    mount()
    await flush()
    expect(host.querySelector('[data-bancos-problem]').textContent.trim()).toBe(
      'Revisa tu conexión e inténtalo de nuevo.',
    )
  })
})
