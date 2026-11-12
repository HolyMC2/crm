// Bancos conectados (syncfy_connector inside Bancos): a bank login reads as
// its state and the one step that settles it; that step calls the
// connector's own endpoint or opens Syncfy's window on the login; the widget
// registers what Syncfy reports even when the window closes; and someone
// without the manager role reads who can act instead of a button.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'

const state = vi.hoisted(() => ({
  call: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  route: { query: {}, params: {} },
  openSyncfy: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: (...args) => state.call(...args),
    toast: state.toast,
    Button: {
      props: ['label', 'variant', 'loading', 'disabled'],
      emits: ['click'],
      setup:
        (props, { emit, attrs }) =>
        () =>
          h(
            'button',
            {
              ...attrs,
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
  const pass = (tag) => ({
    setup:
      (_, { slots }) =>
      () =>
        h(tag, slots.default?.()),
  })
  return {
    AppBar: {
      props: ['title', 'context'],
      setup:
        (props, { slots }) =>
        () =>
          h('header', [h('h1', props.title), slots.actions?.()]),
    },
    ListRow: {
      props: ['title', 'subtitle', 'meta', 'icon', 'to'],
      emits: ['click'],
      setup:
        (props, { slots, emit, attrs }) =>
        () =>
          h(
            'div',
            {
              ...attrs,
              'data-row': props.title,
              'data-to': props.to ? JSON.stringify(props.to) : undefined,
              onClick: () => emit('click'),
            },
            [
              h('span', { 'data-title': '' }, props.title),
              h('span', { 'data-subtitle': '' }, props.subtitle),
              slots.trailing?.(),
            ],
          ),
    },
    ExpandTransition: pass('div'),
    EmptyState: pass('div'),
    BottomSheet: pass('div'),
    ChipGroup: pass('div'),
    DateField: pass('div'),
  }
})
vi.mock('vue-router', async () => {
  const { h } = await import('vue')
  return {
    useRoute: () => state.route,
    useRouter: () => ({ push: state.push, replace: state.replace }),
    RouterLink: {
      props: ['to'],
      setup:
        (_, { slots, attrs }) =>
        () =>
          h('a', attrs, slots.default?.()),
    },
  }
})
vi.mock('@/utils/listCache', () => ({
  createListCache: () => ({ key: () => '', paint: () => {}, save: () => {} }),
}))
vi.mock('@/composables/liveList', () => ({
  useLiveList: () => ({ fresh: { value: new Set() }, mark: () => {} }),
}))
vi.mock('@/components/bancos/syncfyWidget', async (original) => ({
  ...(await original()),
  openSyncfy: (...args) => state.openSyncfy(...args),
}))

import {
  askText,
  conexionBank,
  conexionFullName,
  conexionLine,
  conexionName,
  conexionListLine,
  jobOf,
  needsChipText,
  sameAccountName,
  syncfyAccountTitle,
  ledgerLabel,
  readyText,
  stepLabel,
  unlinkedText,
  waitingOf,
  waitingText,
} from '@/components/bancos/conectados'
import { useConexionStep } from '@/components/bancos/useConexionStep'
import ConexionDetalle from '@/components/bancos/ConexionDetalle.vue'
import ConexionesSeccion from '@/components/bancos/ConexionesSeccion.vue'
import CuentasLista from '@/components/bancos/CuentasLista.vue'

const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

const LOGIN = {
  name: 'cred-1',
  title: 'BBVA · ana',
  bank: 'BBVA',
  user: 'usuario ana',
  kind: 'Bank',
  kind_word: 'Banco',
  status: 'Needs attention',
  word: 'Hay que reconectar',
  tone: 'needs',
  step: 'reconnect',
  detail:
    'La institución rechazó el acceso. Reconecta y revisa usuario y contraseña.',
  asks_code: false,
  ready_at: '',
  refreshed_at: '',
  pulled_at: '',
  feeds_contador: false,
  company: 'Grupo Doco',
  credential: 'cred-1',
  accounts: [
    {
      name: 'acc-1',
      label: 'Cuenta de cheques',
      last4: '1234',
      type: 'Checking',
      currency: 'MXN',
      balance: 1500,
      cuenta: 'BBVA Debito - BBVA',
      cuenta_label: 'BBVA Debito',
      linked: true,
      contador: false,
      waiting: { revisar: 1, sin_enlazar: 0 },
    },
    {
      name: 'acc-2',
      label: 'Tarjeta oro',
      last4: '9876',
      type: 'Credit Card',
      currency: 'MXN',
      balance: -300,
      cuenta: null,
      cuenta_label: '',
      linked: false,
      contador: false,
      waiting: { revisar: 0, sin_enlazar: 12 },
    },
  ],
}
const REVISAR = [
  {
    name: 'mov-1',
    account: 'acc-1',
    date: '2026-11-06',
    title: 'Transferencia recibida',
    detail: 'Mercado Pago',
    amount: 190,
    currency: 'MXN',
    removed: false,
    reason: 'El movimiento está en USD pero la cuenta contable está en MXN.',
  },
  {
    name: 'mov-2',
    account: 'acc-1',
    date: '2026-11-05',
    title: 'Pago con tarjeta',
    detail: '',
    amount: -80,
    currency: 'MXN',
    removed: false,
    contador: true,
    reason: 'Contador detuvo este lote para revisarlo.',
  },
]

describe('bancos conectados words', () => {
  it('names the bank of a login and the logins that need the person', () => {
    expect(conexionBank({ title: 'Acme Bank · t**t' })).toBe('Acme Bank')
    expect(needsChipText([])).toBe('')
    expect(
      needsChipText([
        { title: 'Acme Bank · t**t', word: 'Hay que reconectar' },
      ]),
    ).toBe('Acme Bank: hay que reconectar')
    expect(needsChipText([{ title: '', word: 'No se pudo sincronizar' }])).toBe(
      'No se pudo sincronizar',
    )
    expect(needsChipText([{ title: 'A' }, { title: 'B' }])).toBe(
      '2 conexiones necesitan atención',
    )
  })

  it('names a login by its bank, and says who logs in only to tell two apart', () => {
    const a = { name: 'a', bank: 'Acme Bank', user: 'usuario t**t' }
    const b = { name: 'b', bank: 'Acme Bank', user: 'usuario m**a' }
    const c = { name: 'c', bank: 'BBVA', user: 'usuario a**a' }
    expect(conexionName(a, [a, c])).toBe('Acme Bank')
    expect(conexionName(a, [a, b, c])).toBe('Acme Bank, usuario t**t')
    // The same user twice at one bank: the user tells nothing apart.
    expect(conexionName(a, [a, { ...a, name: 'a2' }])).toBe('Acme Bank')
    expect(conexionFullName(c)).toBe('BBVA, usuario a**a')
    // An older server sends only the connector's title.
    expect(conexionName({ name: 'x', title: 'Acme Bank · t**t' })).toBe(
      'Acme Bank',
    )
    expect(conexionFullName({ title: '' })).toBe('Conexión')
  })

  it('reads two names of one account as the same', () => {
    expect(sameAccountName('ACME Checking', 'ACME Checking ••0001')).toBe(true)
    expect(sameAccountName('Débito BBVA', 'debito-bbva')).toBe(true)
    expect(sameAccountName('BBVA Debito', 'Cuenta de cheques ••1234')).toBe(
      false,
    )
    expect(sameAccountName('', '')).toBe(false)
  })

  it('names the one button by the step the server chose', () => {
    expect(stepLabel({ step: 'sync', status: 'Connected' })).toBe(
      'Sincronizar ahora',
    )
    expect(stepLabel({ step: 'sync', status: 'Error' })).toBe(
      'Intentar de nuevo',
    )
    expect(stepLabel({ step: 'code', status: 'Waiting for code' })).toBe(
      'Escribir el código',
    )
    expect(stepLabel({ step: 'code', status: 'Connected' })).toBe(
      'Sincronizar con código',
    )
    expect(stepLabel({ step: 'reconnect' })).toBe('Reconectar')
    expect(stepLabel({ step: 'connect' })).toBe('Conectar de nuevo')
    expect(stepLabel({ step: 'disconnect' })).toBe('Desconectar')
    expect(stepLabel({ step: null })).toBe('')
  })

  it('tells someone without the manager role what to ask for, by step', () => {
    expect(askText({ step: 'sync', tone: 'ok' })).toBe(
      'Quien administra Bancos puede sincronizarla.',
    )
    expect(askText({ step: 'sync', tone: 'needs' })).toBe(
      'Pide a quien administra Bancos que la revise.',
    )
    expect(askText({ step: 'reconnect', tone: 'needs' })).toBe(
      'Pide a quien administra Bancos que la reconecte.',
    )
    expect(askText({ step: 'connect', tone: 'off' })).toBe(
      'Quien administra Bancos puede conectarla de nuevo.',
    )
    expect(askText({ step: 'disconnect', tone: 'needs' })).toBe(
      'Pide a quien administra Bancos que la desconecte.',
    )
    expect(askText({ step: null })).toBe('')
  })

  it('says when Syncfy lets the login sync again, only while it waits', () => {
    const now = new Date(2026, 10, 7, 14, 0, 0)
    expect(readyText({ ready_at: '2026-11-07 14:05:00' }, now)).toMatch(
      /^Syncfy deja sincronizar otra vez a las 14:05/,
    )
    expect(readyText({ ready_at: '2026-11-07 13:55:00' }, now)).toBe('')
    expect(readyText({ ready_at: '' }, now)).toBe('')
    // Disconnecting or connecting again starts no sync, so the cool-down never holds it.
    const later = '2026-11-07 14:05:00'
    expect(readyText({ ready_at: later, step: 'disconnect' }, now)).toBe('')
    expect(readyText({ ready_at: later, step: 'connect' }, now)).toBe('')
  })

  it('gives the reason on the list when the chip already shows the state', () => {
    const now = new Date(2026, 10, 7, 14, 0, 0)
    const refused = {
      tone: 'needs',
      word: 'Hay que reconectar',
      detail: 'La institución rechazó el acceso.',
      refreshed_at: '2026-11-07 12:00:00',
    }
    expect(conexionListLine(refused, now)).toBe(
      'La institución rechazó el acceso.',
    )
    expect(conexionListLine({ ...refused, detail: '' }, now)).toMatch(
      /^Actualizada hace 2 h/,
    )
    expect(conexionListLine({ tone: 'busy', word: 'Conectando' }, now)).toBe(
      'Conectando',
    )
  })

  it('reads a working login by its freshness and any other by its state', () => {
    const now = new Date(2026, 10, 7, 14, 0, 0)
    expect(
      conexionLine(
        { tone: 'ok', word: 'Conectada', refreshed_at: '2026-11-07 12:00:00' },
        now,
      ),
    ).toMatch(/^Actualizada hace 2 h/)
    expect(conexionLine({ tone: 'needs', word: 'Pide un código' }, now)).toBe(
      'Pide un código',
    )
  })

  it('names an account without repeating the bank its header names', () => {
    const login = { title: 'Acme Bank · t**t' }
    expect(
      syncfyAccountTitle(
        { label: 'Acme Bank · ACME Checking · ••0001', last4: '0001' },
        login,
      ),
    ).toBe('ACME Checking ••0001')
    expect(
      syncfyAccountTitle({ label: 'Cuenta de cheques', last4: '1234' }, login),
    ).toBe('Cuenta de cheques ••1234')
    expect(syncfyAccountTitle({ label: '' }, login)).toBe('Cuenta')
  })

  it('tells two logins at one bank apart by the code one asks', () => {
    const now = new Date(2026, 10, 7, 14, 0, 0)
    expect(
      conexionLine(
        {
          tone: 'ok',
          word: 'Conectada',
          asks_code: true,
          refreshed_at: '2026-11-07 13:00:00',
        },
        now,
      ),
    ).toMatch(/^Pide código, actualizada hace 1 h$/)
  })

  it('adds up what waits for the person, in words', () => {
    expect(waitingOf(LOGIN)).toEqual({ revisar: 1, sin_enlazar: 12 })
    expect(waitingText(waitingOf(LOGIN))).toBe(
      '1 por revisar, 12 esperan una cuenta',
    )
    expect(waitingText({ revisar: 0, sin_enlazar: 1 })).toBe(
      '1 espera una cuenta',
    )
    expect(waitingText({})).toBe('')
    expect(waitingText({ revisar: 1200, sin_enlazar: 7562 })).toBe(
      '1,200 por revisar, 7,562 esperan una cuenta',
    )
  })

  it('says on the list how many accounts are unlinked and what they hold back', () => {
    // doco 2026-11-11: BBVA synced 96 movements into two unlinked accounts and read as broken.
    const bbva = {
      accounts: [
        {
          name: 'deb',
          linked: false,
          type: 'Checking',
          waiting: { sin_enlazar: 80 },
        },
        {
          name: 'oro',
          linked: false,
          type: 'Credit Card',
          waiting: { sin_enlazar: 16 },
        },
        { name: 'sat', linked: false, type: 'Tax' },
      ],
    }
    expect(unlinkedText(bbva, 96)).toBe(
      '2 cuentas sin enlazar: 96 movimientos esperan',
    )
    expect(unlinkedText({ accounts: [bbva.accounts[0]] }, 1)).toBe(
      '1 cuenta sin enlazar: 1 movimiento espera',
    )
  })

  it('reads the job id Syncfy reports and drops the company suffix', () => {
    expect(
      jobOf({ status: 'https://x/v1/jobs/5e1f0c2a9d1b4c3a2f1e0d9c/status' }),
    ).toBe('5e1f0c2a9d1b4c3a2f1e0d9c')
    expect(jobOf({})).toBeNull()
    expect(ledgerLabel('BBVA Debito - GD')).toBe('BBVA Debito')
  })
})

describe('openSyncfy', () => {
  let instances
  beforeEach(() => {
    state.call.mockReset()
    instances = []
    window.SyncfyWidget = class {
      constructor(options) {
        this.options = options
        this.handlers = {}
        this.closed = 0
        instances.push(this)
      }
      on(event, fn) {
        ;(this.handlers[event] ||= []).push(fn)
      }
      open() {}
      close() {
        this.closed++
      }
      setToken(token) {
        this.token = token
      }
      emit(event, ...args) {
        return (this.handlers[event] || []).map((fn) => fn(...args))[0]
      }
    }
    state.call.mockImplementation(async (method) => {
      if (method.endsWith('.context'))
        return { enabled: true, country: 'MX', locale: 'es' }
      if (method.endsWith('.widget_session')) return { token: 't-1' }
      if (method.endsWith('.register'))
        return { name: 'cred-9', status: 'Connecting' }
    })
  })
  afterEach(() => {
    delete window.SyncfyWidget
    document.getElementById('syncfy-widget-host')?.remove()
    document.getElementById('syncfy-waiting-note')?.remove()
  })

  it('opens on the login and registers what Syncfy reports', async () => {
    const { openSyncfy } = await vi.importActual(
      '@/components/bancos/syncfyWidget',
    )
    const done = openSyncfy({ company: 'Grupo Doco', credential: 'cred-1' })
    await flush()
    const widget = instances[0]
    expect(widget.options.token).toBe('t-1')
    expect(widget.options.config.entrypoint).toEqual({
      country: 'MX',
      credential: 'cred-1',
    })
    expect(document.getElementById('syncfy-widget-host')).toBeTruthy()
    widget.emit('success', {
      id_credential: 'cred-9',
      status: '/v1/jobs/5e1f0c2a9d1b4c3a2f1e0d9c/status',
    })
    // The person closes the window while the registration is on its way.
    widget.emit('closed')
    const result = await done
    expect(result.connection.name).toBe('cred-9')
    expect(state.call).toHaveBeenCalledWith(
      'syncfy_connector.api.connect.register',
      {
        company: 'Grupo Doco',
        id_credential: 'cred-9',
        id_job: '5e1f0c2a9d1b4c3a2f1e0d9c',
      },
    )
  })

  it('resolves to nothing when the window closes before any login', async () => {
    const { openSyncfy } = await vi.importActual(
      '@/components/bancos/syncfyWidget',
    )
    const done = openSyncfy({ company: 'Grupo Doco', types: ['Bank'] })
    await flush()
    expect(
      instances[0].options.config.navigation.displaySiteOrganizationTypes,
    ).toEqual(['Bank'])
    instances[0].emit('closed')
    expect(await done).toBeNull()
    expect(state.call.mock.calls.some(([m]) => m.endsWith('.register'))).toBe(
      false,
    )
  })

  it('asks for patience while the institution answers, not while it waits on the person', async () => {
    const { openSyncfy, WAITING_TEXT } = await vi.importActual(
      '@/components/bancos/syncfyWidget',
    )
    const done = openSyncfy({ company: 'Grupo Doco' })
    await flush()
    const widget = instances[0]
    const note = () => document.getElementById('syncfy-waiting-note')
    expect(note().hidden).toBe(true)
    widget.emit('submitted')
    expect(note().hidden).toBe(false)
    expect(note().textContent).toBe(WAITING_TEXT)
    expect(note().getAttribute('role')).toBe('status')
    widget.emit('status', { code: 101 })
    expect(note().hidden).toBe(false)
    // The bank asks for a one-time code: the person has to act.
    widget.emit('status', { code: 410 })
    expect(note().hidden).toBe(true)
    widget.emit('submitted')
    expect(note().hidden).toBe(false)
    widget.emit('success', { id_credential: 'cred-9' })
    expect(note().hidden).toBe(true)
    expect((await done).connection.name).toBe('cred-9')
    expect(note()).toBeNull()
  })

  it('draws the window again on a second «Conectar» without a reload', async () => {
    // Syncfy's bundle is a Vue app mounted on the element it is given
    // (createApp(root).mount(element)). On a reused, emptied element Vue
    // patched the first window's detached tree, so the second window opened
    // nowhere until the page was reloaded (doco, 2026-11-11).
    const Root = defineComponent({
      setup(_, { expose }) {
        const visible = ref(false)
        expose({
          open: () => (visible.value = true),
          close: () => (visible.value = false),
        })
        // A fragment root with the modal shown on open, as Syncfy's widget draws.
        return () => [
          h('span'),
          visible.value
            ? h('div', { class: 'syncfy-modal', 'data-open': 'true' })
            : null,
        ]
      },
    })
    window.SyncfyWidget = class {
      constructor(options) {
        this.handlers = {}
        this.app = createApp(Root).mount(options.element)
        instances.push(this)
      }
      on(event, fn) {
        this.handlers[event] = fn
      }
      open() {
        this.app.open()
      }
      close() {
        this.app.close()
      }
      emit(event, ...args) {
        return this.handlers[event]?.(...args)
      }
    }
    const { openSyncfy } = await vi.importActual(
      '@/components/bancos/syncfyWidget',
    )
    const open = () =>
      document.querySelectorAll('.syncfy-modal[data-open="true"]')
    const first = openSyncfy({ company: 'Grupo Doco' })
    await flush()
    expect(open()).toHaveLength(1)
    instances[0].emit('closed')
    expect(await first).toBeNull()
    await flush()
    expect(open()).toHaveLength(0)

    const second = openSyncfy({ company: 'Grupo Doco' })
    await flush()
    expect(instances).toHaveLength(2)
    expect(open()).toHaveLength(1)
    expect(document.querySelectorAll('#syncfy-widget-host')).toHaveLength(1)
    instances[1].emit('closed')
    expect(await second).toBeNull()
  })
})

describe('useConexionStep', () => {
  beforeEach(() => {
    state.call.mockReset()
    state.openSyncfy.mockReset()
    state.toast.success.mockReset()
  })

  it('syncs in place, or opens Syncfy when the bank wants a code', async () => {
    const step = useConexionStep()
    state.call.mockResolvedValueOnce({ widget: false, job: 'j' })
    await step.run({ ...LOGIN, step: 'sync', status: 'Connected' })
    expect(state.call).toHaveBeenCalledWith(
      'syncfy_connector.api.connections.sync_now',
      { name: 'cred-1' },
    )
    expect(state.openSyncfy).not.toHaveBeenCalled()
    expect(state.toast.success).toHaveBeenCalledWith(
      'Sincronizando. Los movimientos nuevos llegan en unos minutos.',
    )

    state.call.mockResolvedValueOnce({ widget: true, credential: 'cred-1' })
    state.openSyncfy.mockResolvedValueOnce({ connection: { name: 'cred-1' } })
    await step.run({ ...LOGIN, step: 'sync', status: 'Connected' })
    expect(state.openSyncfy).toHaveBeenCalledWith({
      company: 'Grupo Doco',
      credential: 'cred-1',
    })
  })

  it('reconnects and changes the password on the login itself', async () => {
    const step = useConexionStep()
    state.openSyncfy.mockResolvedValue(null)
    await step.run(LOGIN)
    expect(state.openSyncfy).toHaveBeenLastCalledWith({
      company: 'Grupo Doco',
      credential: 'cred-1',
    })
    await step.run(LOGIN, 'update')
    expect(state.openSyncfy).toHaveBeenLastCalledWith({
      company: 'Grupo Doco',
      update: 'cred-1',
    })
    expect(state.call).not.toHaveBeenCalled()
  })

  it('keeps the server reason when a sync is refused', async () => {
    const step = useConexionStep()
    state.call.mockRejectedValueOnce({
      messages: ['La institución permite otra sincronización a las 14:05.'],
    })
    await step.run({ ...LOGIN, step: 'sync', status: 'Connected' })
    expect(step.problem.value).toBe(
      'La institución permite otra sincronización a las 14:05.',
    )
  })
})

describe('ConexionDetalle', () => {
  let host, app
  beforeEach(() => {
    state.call.mockReset()
    state.openSyncfy.mockReset()
    state.route = { query: {}, params: {} }
    host = document.createElement('div')
    document.body.appendChild(host)
  })
  afterEach(() => {
    app?.unmount()
    host.remove()
  })
  const mount = (can, conexion = LOGIN) => {
    // The server stops listing a movement once it is retried or skipped.
    const decided = new Set()
    state.call.mockImplementation(async (method, args) => {
      if (method === 'crm.api.bancos.conexion')
        return {
          conexion,
          revisar: REVISAR.filter((r) => !decided.has(r.name)),
          can,
        }
      if (/(retry|skip)_movement$/.test(method)) decided.add(args.name)
      return {}
    })
    app = createApp({
      render: () => h(ConexionDetalle, { name: 'cred-1' }),
    })
    app.mount(host)
  }

  it('shows the state, its reason and the one step for a manager', async () => {
    mount({ conectados: true, conectar: true })
    await flush()
    expect(host.querySelector('h1').textContent).toBe('BBVA')
    expect(
      host.querySelector('[data-bancos-conexion-tipo]').textContent.trim(),
    ).toBe('Banco, usuario ana')
    expect(
      host.querySelector('[data-bancos-conexion-estado]').textContent.trim(),
    ).toBe('Hay que reconectar')
    expect(host.textContent).toContain('La institución rechazó el acceso.')
    const button = host.querySelector('[data-bancos-conexion-paso]')
    expect(button.textContent).toBe('Reconectar')
    state.openSyncfy.mockResolvedValue(null)
    button.click()
    await flush()
    expect(state.openSyncfy).toHaveBeenCalledWith({
      company: 'Grupo Doco',
      credential: 'cred-1',
    })
  })

  it('says where each account lands and offers to link the one that waits', async () => {
    mount({ conectados: true, conectar: true })
    await flush()
    const rows = [...host.querySelectorAll('[data-syncfy-account]')]
    expect(
      rows.map((r) => r.querySelector('[data-title]').textContent),
    ).toEqual(['Cuenta de cheques ••1234', 'Tarjeta oro ••9876'])
    expect(rows[0].querySelector('[data-subtitle]').textContent).toBe(
      'Llega a BBVA Debito, 1 por revisar',
    )
    expect(rows[1].querySelector('[data-subtitle]').textContent).toBe(
      'Sin enlazar, 12 movimientos esperan',
    )
    // The unlinked row itself is the «Enlazar» button; a linked one opens its account.
    expect(rows[0].querySelector('[data-bancos-enlazar-abrir]')).toBeNull()
    expect(rows[0].querySelector('[data-to]')).toBeTruthy()
    const open = rows[1].querySelector('[data-bancos-enlazar-abrir]')
    expect(open.textContent).toContain('Enlazar')
  })

  it('does not repeat the name of an account created from this one', async () => {
    const [first, second] = LOGIN.accounts
    mount(
      { conectados: true, conectar: true },
      {
        ...LOGIN,
        accounts: [
          { ...first, cuenta_label: 'Cuenta de cheques' },
          {
            ...second,
            cuenta_label: 'Tarjeta Oro',
            linked: true,
            contador: true,
          },
        ],
      },
    )
    await flush()
    const lines = [
      ...host.querySelectorAll('[data-syncfy-account] [data-subtitle]'),
    ]
    expect(lines.map((l) => l.textContent)).toEqual([
      'Llega a su cuenta en Bancos, 1 por revisar',
      'Llega a su cuenta en Bancos (Contador)',
    ])
  })

  it('retries or skips a held movement with the connector', async () => {
    mount({ conectados: true, conectar: true })
    await flush()
    const row = host.querySelector('[data-syncfy-movimiento="mov-1"]')
    expect(row.textContent).toContain('está en USD')
    const [retry, skip] = row.querySelectorAll('button')
    expect(retry.textContent).toBe('Reintentar')
    expect(skip.textContent).toBe('No importarlo')
    retry.click()
    await flush()
    expect(state.call).toHaveBeenCalledWith(
      'syncfy_connector.api.connections.retry_movement',
      { name: 'mov-1' },
    )
    expect(host.querySelector('[data-syncfy-movimiento="mov-1"]')).toBeNull()
  })

  it('offers to link again an account Contador stopped taking', async () => {
    const stopped = {
      ...LOGIN,
      accounts: [
        { ...LOGIN.accounts[0], contador: true, relink: true },
        LOGIN.accounts[1],
      ],
    }
    mount({ conectados: true, conectar: true }, stopped)
    await flush()
    const row = host.querySelector('[data-syncfy-account="acc-1"]')
    expect(row.querySelector('[data-subtitle]').textContent).toBe(
      'Contador dejó de recibirla, vuelve a enlazarla',
    )
    expect(row.querySelector('[data-bancos-enlazar-abrir]')).toBeTruthy()
  })

  it('sends a movement Contador held to Contador, without retrying it here', async () => {
    mount({ conectados: true, conectar: true, contador: true })
    await flush()
    const row = host.querySelector('[data-syncfy-movimiento="mov-2"]')
    const link = row.querySelector('[data-bancos-revisar-contador]')
    expect(link.textContent.trim()).toBe('Revisar en Contador')
    expect(link.getAttribute('href')).toBe('/contador/bancos')
    expect(row.querySelectorAll('button')).toHaveLength(0)
  })

  it('tells someone without Contador whom to ask about a movement Contador held', async () => {
    mount({ conectados: true, conectar: true, contador: false })
    await flush()
    const row = host.querySelector('[data-syncfy-movimiento="mov-2"]')
    expect(row.querySelector('[data-bancos-revisar-contador]')).toBeNull()
    expect(
      row
        .querySelector('[data-bancos-revisar-contador-pide]')
        .textContent.trim(),
    ).toBe('Se revisa en Contador. Pide al área de contabilidad que lo vea.')
    expect(row.querySelectorAll('button')).toHaveLength(0)
  })

  it('asks to disconnect an institution Syncfy dropped, from the hero', async () => {
    const retired = {
      ...LOGIN,
      status: 'Retired',
      word: 'Ya no se puede conectar',
      tone: 'needs',
      step: 'disconnect',
      ready_at: '2099-01-01 00:00:00',
      detail:
        'Syncfy ya no soporta esta institución. Desconéctala y usa estados de cuenta.',
    }
    mount({ conectados: true, conectar: true }, retired)
    await flush()
    const paso = host.querySelector('[data-bancos-conexion-paso]')
    expect(paso.textContent.trim()).toBe('Desconectar')
    expect(paso.disabled).toBe(false)
    expect(
      host.querySelector('[data-bancos-conexion-acciones]').textContent,
    ).not.toContain('Cambiar usuario')
    state.call.mockClear()
    paso.click()
    await flush()
    // It asks first: nothing reaches Syncfy or the connector on the tap itself.
    expect(state.openSyncfy).not.toHaveBeenCalled()
    expect(state.call).not.toHaveBeenCalledWith(
      'syncfy_connector.api.connections.disconnect',
      expect.anything(),
    )
  })

  it('tells someone without the manager role who can act', async () => {
    mount({ conectados: true, conectar: false })
    await flush()
    expect(host.querySelector('[data-bancos-conexion-paso]')).toBeNull()
    expect(
      host.querySelector('[data-bancos-conexion-pide]').textContent.trim(),
    ).toBe('Pide a quien administra Bancos que la reconecte.')
    expect(host.querySelector('[data-bancos-enlazar-abrir]')).toBeNull()
    expect(
      host.querySelector('[data-syncfy-movimiento="mov-1"] button'),
    ).toBeNull()
    expect(host.querySelector('[data-bancos-conexion-acciones]')).toBeNull()
  })
})

describe('ConexionesSeccion', () => {
  let host, app
  beforeEach(() => {
    state.call.mockReset()
    state.replace.mockReset()
    state.route = { query: {}, params: {} }
    host = document.createElement('div')
    document.body.appendChild(host)
  })
  afterEach(() => {
    app?.unmount()
    host.remove()
  })
  const OK = {
    ...LOGIN,
    name: 'cred-2',
    title: 'Banorte · ana',
    bank: 'Banorte',
    status: 'Connected',
    word: 'Conectada',
    tone: 'ok',
    step: 'sync',
    refreshed_at: '',
    accounts: [],
  }
  const OFF = {
    ...OK,
    name: 'cred-3',
    title: 'HSBC · ana',
    bank: 'HSBC',
    word: 'Desconectada',
    tone: 'off',
  }
  let reported
  const mount = (can, conexiones = [LOGIN, OK, OFF]) => {
    reported = []
    state.call.mockResolvedValue({ enabled: true, conexiones, can })
    app = createApp({
      render: () =>
        h(ConexionesSeccion, {
          company: 'Grupo Doco',
          can,
          onNeeds: (list) => reported.push(list.map((c) => c.name)),
        }),
    })
    app.mount(host)
  }

  it('reports the logins that need the person, for the chip on the total', async () => {
    mount({ conectados: true, conectar: true })
    await flush()
    expect(reported.at(-1)).toEqual(['cred-1'])
    app.unmount()
    expect(reported.at(-1)).toEqual([])
  })

  it('lists the logins, flags the one that needs the person, folds the off ones', async () => {
    mount({ conectados: true, conectar: true })
    await flush()
    expect(state.call).toHaveBeenCalledWith('crm.api.bancos.conexiones', {
      company: 'Grupo Doco',
    })
    const rows = [...host.querySelectorAll('[data-conexion]')]
    expect(rows.map((r) => r.dataset.conexion)).toEqual(['cred-1', 'cred-2'])
    expect(rows[0].querySelector('[data-conexion-aviso]').textContent).toBe(
      'Hay que reconectar',
    )
    expect(rows[1].querySelector('[data-conexion-aviso]')).toBeNull()
    expect(
      host.querySelector('[data-bancos-conexiones-apagadas]').textContent,
    ).toContain('Desconectadas')
    expect(host.textContent).not.toContain('HSBC')
    expect(
      host.querySelector('[data-bancos-conectar-fila] [data-title]')
        .textContent,
    ).toBe('Conectar otro banco')
  })

  it('names each login by its bank, and two at one bank by who logs in', async () => {
    const TWIN = { ...LOGIN, name: 'cred-4', user: 'usuario m**a' }
    mount({ conectados: true, conectar: true }, [LOGIN, OK])
    await flush()
    const titles = () =>
      [...host.querySelectorAll('[data-conexion] [data-title]')].map(
        (t) => t.textContent,
      )
    expect(titles()).toEqual(['BBVA', 'Banorte'])
    app.unmount()
    mount({ conectados: true, conectar: true }, [LOGIN, TWIN, OK])
    await flush()
    expect(titles()).toEqual([
      'BBVA, usuario ana',
      'BBVA, usuario m**a',
      'Banorte',
    ])
  })

  it('invites a manager to connect the first bank, and nobody else', async () => {
    mount({ conectados: true, conectar: true }, [])
    await flush()
    expect(host.querySelector('[data-bancos-conexiones-invita]')).toBeTruthy()
    expect(
      host.querySelector('[data-bancos-conectar-fila] [data-title]')
        .textContent,
    ).toBe('Conectar un banco')
    app.unmount()
    mount({ conectados: true, conectar: false }, [])
    await flush()
    expect(host.querySelector('[data-bancos-conexiones-invita]')).toBeNull()
    expect(host.querySelector('[data-bancos-conectar-fila]')).toBeNull()
  })

  it('stays out of the page where Bancos conectados is off', async () => {
    mount({ conectados: false, conectar: false })
    await flush()
    expect(host.querySelector('[data-bancos-conexiones]')).toBeNull()
    expect(state.call).not.toHaveBeenCalled()
  })
})

describe('CuentasLista', () => {
  let host, app
  beforeEach(() => {
    state.call.mockReset()
    state.push.mockReset()
    state.route = { query: { empresa: 'Grupo Doco' }, params: {} }
    host = document.createElement('div')
    document.body.appendChild(host)
  })
  afterEach(() => {
    app?.unmount()
    host.remove()
  })
  const SECOND = {
    ...LOGIN,
    name: 'cred-9',
    title: 'Banorte · ana',
    bank: 'Banorte',
  }
  const mount = (conexiones) => {
    state.call.mockImplementation(async (method) => {
      if (method === 'crm.api.bancos.cuentas')
        return {
          company: 'Grupo Doco',
          empresas: ['Grupo Doco'],
          currency: 'MXN',
          total: 1500,
          pending: 3,
          cards: [],
          can: { conectados: true, conectar: true, catalogo: false },
        }
      if (method === 'crm.api.bancos.conexiones')
        return { enabled: true, conexiones, can: { conectar: true } }
      return {}
    })
    app = createApp({ render: () => h(CuentasLista) })
    app.mount(host)
  }
  const settle = async () => {
    await flush()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()
  }

  it('brings a login that needs the person up to the total and opens it', async () => {
    mount([LOGIN])
    await settle()
    expect(host.querySelector('[data-bancos-pending]').textContent).toContain(
      '3 movimientos sin conciliar',
    )
    const chip = host.querySelector('[data-bancos-conexion-aviso]')
    expect(chip.textContent.trim()).toBe('BBVA: hay que reconectar')
    chip.click()
    expect(state.push).toHaveBeenCalledWith({
      name: 'BancoConexion',
      params: { conexion: 'cred-1' },
      query: { empresa: 'Grupo Doco' },
    })
  })

  it('counts several and shows nothing when every login works', async () => {
    mount([LOGIN, SECOND])
    await settle()
    expect(
      host.querySelector('[data-bancos-conexion-aviso]').textContent.trim(),
    ).toBe('2 conexiones necesitan atención')
    app.unmount()
    mount([{ ...LOGIN, tone: 'ok', word: 'Conectada' }])
    await settle()
    expect(host.querySelector('[data-bancos-conexion-aviso]')).toBeNull()
  })
})
