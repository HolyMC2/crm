// «¿Ya llegó?» (crm docs/DINERO_EN_ORDEN.md §3e): the helpers' words, the
// check sheet's flow (typed receipt → Banxico → arrived) and the page's list.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({ call: vi.fn(), query: {}, replace: vi.fn() }))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: (...args) => state.call(...args),
    Button: {
      props: [
        'label',
        'variant',
        'loading',
        'disabled',
        'type',
        'theme',
        'icon',
      ],
      emits: ['click'],
      setup:
        (props, { emit, attrs }) =>
        () =>
          h(
            'button',
            {
              ...attrs,
              type: 'button',
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
  const slotDiv = (name) => ({
    props: [
      'open',
      'title',
      'label',
      'value',
      'hint',
      'tone',
      'pressed',
      'chips',
      'modelValue',
      'options',
      'state',
      'message',
    ],
    emits: ['click', 'update:modelValue'],
    setup:
      (p, { slots, attrs, emit }) =>
      () =>
        h(
          'div',
          { ...attrs, [`data-stub-${name}`]: '', onClick: () => emit('click') },
          [
            p.title ? h('h2', p.title) : null,
            p.label ? h('span', p.label) : null,
            p.value !== undefined ? h('span', String(p.value)) : null,
            p.hint ? h('span', p.hint) : null,
            p.message ? h('p', p.message) : null,
            ...(p.chips || []).map((c) =>
              h(
                'button',
                {
                  'data-chip': c.value,
                  onClick: (e) => (
                    e.stopPropagation(), emit('update:modelValue', c.value)
                  ),
                },
                `${c.label}${c.count ? ` ${c.count}` : ''}`,
              ),
            ),
            slots.default?.(),
            slots.actions?.(),
          ],
        ),
  })
  return {
    AppBar: {
      props: ['title'],
      setup:
        (p, { slots }) =>
        () =>
          h('header', [h('h1', p.title), slots.actions?.()]),
    },
    BottomSheet: {
      props: ['open', 'title', 'subtitle'],
      setup:
        (p, { slots }) =>
        () =>
          p.open
            ? h('div', { 'data-sheet': p.title }, [
                h('h2', p.title),
                slots.default?.(),
                slots.actions?.(),
              ])
            : null,
    },
    EmptyState: slotDiv('empty'),
    Fab: slotDiv('fab'),
    FilterChips: slotDiv('chips'),
    KpiTile: slotDiv('kpi'),
    Segmented: slotDiv('segmented'),
    StatusChip: {
      props: ['label', 'tone'],
      setup: (p) => () => h('span', { 'data-chip-estado': p.tone }, p.label),
    },
  }
})
vi.mock('@/components/ui/imageFiles', () => ({ prepareImage: async (f) => f }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: state.query, params: {} }),
  useRouter: () => ({ replace: state.replace }),
}))

import {
  bancoCorto,
  clabeEnGrupos,
  clabeValida,
  diaTexto,
  faltaParaRevisar,
  filtroChips,
  porDia,
  quienTexto,
  rango,
  rutaTexto,
  titleCase,
  transcurrido,
  ventaTexto,
} from '@/components/dinero/transferencias'
import RevisarTransferenciaSheet from '@/components/dinero/RevisarTransferenciaSheet.vue'
import Transferencias from '@/pages/Transferencias.vue'

const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

const SETUP = {
  activo: true,
  politica: 'dejar',
  avisar: true,
  ve_todas: true,
  cuentas: [
    {
      bank_account: 'BBVA Debito',
      nombre: 'BBVA Débito',
      banco: 'BBVA MEXICO',
      ultimos: '•9775',
    },
  ],
  sin_clabe: [],
  bancos: [
    { codigo: '40012', nombre: 'BBVA MEXICO', comun: true },
    { codigo: '40002', nombre: 'BANAMEX', comun: true },
    { codigo: '90722', nombre: 'Mercado Pago W', comun: true },
  ],
}

function check(over = {}) {
  return {
    name: 'TRF-2026-00001',
    estado: 'Searching',
    motivo: 'Buscando en Banxico.',
    monto: 500,
    currency: 'MXN',
    fecha: '2026-11-17',
    hora: '',
    ordenante: '',
    banco_emisor: 'BANAMEX',
    clave_rastreo: 'MBAN01002611170099',
    cuenta: SETUP.cuentas[0],
    intentos: 1,
    creada: new Date().toISOString(),
    mismo_banco: false,
    puede_reintentar: false,
    ...over,
  }
}

describe('helpers', () => {
  it('reads periods, days and people the way the counter says them', () => {
    const today = new Date(2026, 10, 17)
    expect(rango('hoy', today)).toEqual({
      desde: '2026-11-17',
      hasta: '2026-11-17',
    })
    expect(rango('7', today)).toEqual({
      desde: '2026-11-11',
      hasta: '2026-11-17',
    })
    expect(diaTexto('2026-11-17', today)).toBe('Hoy')
    expect(diaTexto('2026-11-16', today)).toBe('Ayer')
    expect(diaTexto('2026-11-11', today)).toBe('mié 11 nov')
    expect(titleCase('JOEL EDUARDO MEDINA DE LA ROSA')).toBe(
      'Joel Eduardo Medina de la Rosa',
    )
    expect(quienTexto({ ordenante: '', estado: 'Searching' })).toBe(
      'Aún sin nombre',
    )
    const fila = {
      banco_emisor: 'BANAMEX',
      cuenta: { banco: 'BBVA MEXICO', ultimos: '•9775' },
    }
    expect(rutaTexto(fila)).toBe('Banamex → BBVA •9775')
    expect(rutaTexto(fila, { unaCuenta: true })).toBe('Banamex')
    expect(bancoCorto('Mercado Pago W')).toBe('Mercado Pago')
    expect(ventaTexto({ estado: 'Arrived', venta: null, propia: false })).toBe(
      'Sin venta',
    )
    expect(ventaTexto({ estado: 'Arrived', venta: null, propia: true })).toBe(
      'Entre tus cuentas',
    )
    expect(ventaTexto({ estado: 'Not found' })).toBe('No aparece')
    expect(
      transcurrido(
        '2026-11-17 12:00:00',
        new Date('2026-11-17T12:01:20').getTime(),
      ),
    ).toBe('1 min 20 s')
  })

  it('groups rows by day and leads the views with «Todas»', () => {
    const groups = porDia([{ fecha: 'a' }, { fecha: 'a' }, { fecha: 'b' }])
    expect(groups.map((g) => g.filas.length)).toEqual([2, 1])
    const chips = filtroChips({ buscando: 2, sin_venta: 1 })
    expect(chips[0]).toEqual({ value: '', label: 'Todas' })
    expect(chips.find((c) => c.value === 'Searching').count).toBe(2)
  })

  it('says what a check still needs before Banxico', () => {
    expect(faltaParaRevisar({ monto: '' })).toMatch('monto')
    expect(faltaParaRevisar({ monto: 5, banco_emisor: '' })).toMatch('banco')
    expect(faltaParaRevisar({ monto: 5, banco_emisor: '40002' })).toMatch(
      'clave de rastreo',
    )
    expect(
      faltaParaRevisar({
        monto: 5,
        banco_emisor: '40002',
        clave_rastreo: 'AB-1',
      }),
    ).toMatch('letras y números')
    expect(
      faltaParaRevisar({
        monto: 5,
        banco_emisor: '40002',
        referencia: '0190926',
      }),
    ).toBe('')
    expect(
      faltaParaRevisar(
        { monto: 5, banco_emisor: '40012' },
        { mismoBanco: true },
      ),
    ).toBe('')
  })

  it('checks a CLABE digit by digit', () => {
    expect(clabeValida('012744015234369775')).toBe(true)
    expect(clabeValida('012744015234369776')).toBe(false)
    expect(clabeValida('0127')).toBe(false)
    expect(clabeEnGrupos('012744015234')).toBe('0127 4401 5234')
  })
})

describe('the check sheet', () => {
  let host, app
  beforeEach(() => {
    state.call.mockReset()
    host = document.createElement('div')
    document.body.appendChild(host)
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  })
  afterEach(() => {
    app?.unmount()
    host.remove()
    vi.useRealTimers()
  })

  it('sends the typed receipt and follows Banxico until it arrives', async () => {
    const revisada = vi.fn()
    state.call.mockImplementation(async (method) => {
      if (method.endsWith('.revisar')) return check()
      if (method.endsWith('.ver'))
        return check({
          estado: 'Arrived',
          ordenante: 'ANA LOPEZ RUIZ',
          hora: '12:01:02',
          motivo: 'Llegó: Banxico la registra de ANA LOPEZ RUIZ.',
        })
      throw new Error(method)
    })
    app = createApp({
      render: () =>
        h(RevisarTransferenciaSheet, {
          open: true,
          setup: SETUP,
          onRevisada: revisada,
        }),
    })
    app.mount(host)
    await flush()
    const monto = host.querySelector('[data-revisar-monto]')
    monto.value = '500'
    monto.dispatchEvent(new Event('input'))
    host.querySelector('[data-revisar-banco="40002"]').click()
    const clave = host.querySelector('[data-revisar-clave]')
    clave.value = 'mban01002611170099'
    clave.dispatchEvent(new Event('input'))
    await flush()
    host.querySelector('[data-revisar-enviar]').click()
    await flush()
    const [method, args] = state.call.mock.calls[0]
    expect(method).toBe('doco.workspaces.transferencias.revisar')
    expect(JSON.parse(args.datos)).toMatchObject({
      monto: '500',
      banco_emisor: '40002',
      clave_rastreo: 'mban01002611170099',
      bank_account: 'BBVA Debito',
    })
    expect(host.querySelector('[data-revisar-estado]').textContent).toContain(
      'Buscando en Banxico',
    )
    vi.advanceTimersByTime(3000)
    await flush()
    const done = host.querySelector('[data-revisar-estado]')
    expect(done.dataset.estado).toBe('Arrived')
    expect(done.textContent).toContain('Llegó')
    expect(done.textContent).toContain('Ana Lopez Ruiz')
    expect(revisada).toHaveBeenLastCalledWith(
      expect.objectContaining({ estado: 'Arrived' }),
    )
  })

  it('a transfer between two accounts of the same bank waits for the bank, no key asked', async () => {
    app = createApp({
      render: () => h(RevisarTransferenciaSheet, { open: true, setup: SETUP }),
    })
    app.mount(host)
    await flush()
    host.querySelector('[data-revisar-banco="40012"]').click()
    await flush()
    expect(
      host.querySelector('[data-revisar-mismo-banco]').textContent,
    ).toContain('no pasa por')
    expect(host.querySelector('[data-revisar-clave]')).toBeNull()
    expect(host.querySelector('[data-revisar-enviar]').textContent).toBe(
      'Revisar en el banco',
    )
  })

  it('tells what is missing instead of calling Banxico', async () => {
    app = createApp({
      render: () => h(RevisarTransferenciaSheet, { open: true, setup: SETUP }),
    })
    app.mount(host)
    await flush()
    host.querySelector('[data-revisar-enviar]').click()
    await flush()
    expect(state.call).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Escribe el monto')
  })
})

describe('the page', () => {
  let host, app
  beforeEach(() => {
    state.call.mockReset()
    state.query = {}
    host = document.createElement('div')
    document.body.appendChild(host)
  })
  afterEach(() => {
    app?.unmount()
    host.remove()
  })

  it('shows the totals, a row per transfer and what lacks a sale', async () => {
    state.call.mockImplementation(async (method) => {
      if (method.endsWith('.inicio')) return SETUP
      if (method.endsWith('.lista'))
        return {
          filas: [
            {
              name: 'TRF-1',
              estado: 'Arrived',
              monto: 2290,
              fecha: '2026-11-17',
              hora: '16:02',
              ordenante: 'MARCO ANTONIO PONCE VALDEZ',
              banco_emisor: 'Mercado Pago W',
              cuenta: SETUP.cuentas[0],
              venta: null,
              propia: true,
              sin_venta: false,
              revisada_por: '',
            },
            {
              name: 'TRF-2',
              estado: 'Arrived',
              monto: 150.1,
              fecha: '2026-11-17',
              hora: '13:24',
              ordenante: 'JOEL EDUARDO MEDINA LOPEZ',
              banco_emisor: 'BANAMEX',
              cuenta: SETUP.cuentas[0],
              venta: null,
              propia: false,
              sin_venta: true,
              revisada_por: 'Tere',
            },
            {
              name: 'TRF-3',
              estado: 'Searching',
              monto: 500,
              fecha: '2026-11-17',
              hora: '17:40',
              ordenante: '',
              banco_emisor: 'BANAMEX',
              cuenta: SETUP.cuentas[0],
              venta: null,
              revisada_por: 'Tere',
            },
          ],
          resumen: {
            llegaron: 2,
            llegaron_total: 2440.1,
            buscando: 1,
            no_coinciden: 0,
            no_aparecen: 0,
            sin_venta: 1,
            sin_venta_total: 150.1,
            propias: 1,
          },
          ve_todas: true,
          currency: 'MXN',
        }
      throw new Error(method)
    })
    app = createApp({ render: () => h(Transferencias) })
    app.mount(host)
    await flush()
    expect(host.querySelector('h1').textContent).toBe('Transferencias')
    const resumen = host.querySelector(
      '[data-transferencias-resumen]',
    ).textContent
    expect(resumen).toContain('$2,440.10')
    expect(resumen).toContain('1 sin cobrar')
    const rows = host.querySelectorAll('[data-transferencia-fila]')
    expect(rows).toHaveLength(3)
    expect(rows[0].textContent).toContain('Entre tus cuentas')
    expect(rows[1].textContent).toContain('Joel Eduardo Medina Lopez')
    expect(rows[1].textContent).toContain('Sin venta')
    expect(rows[2].textContent).toContain('Aún sin nombre')
    expect(rows[2].textContent).toContain('Buscando')
    const lista = state.call.mock.calls.find(([m]) => m.endsWith('.lista'))[1]
    expect(lista.desde).toBe(lista.hasta)
  })
})
