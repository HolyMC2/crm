// CRM-S5.3: the record on screen declares its actions once; Ctrl+K lists them
// first and the keyed ones are page keys, listed in Alt+H «En esta página»
// only while the record is mounted.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  pageShortcuts,
  shellCheatSheet,
  useShellKeyboard,
} from '@/composables/shellKeyboard'
import {
  recordActionKeys,
  recordActions,
  runRecordAction,
  useRecordActions,
} from '@/composables/recordActions'
import { dealRecordActions } from '@/utils/dealRecordActions'
import { recordItem } from '@/utils/shellPalette'
import { takeCreateRequest } from '@/utils/shellCreate'

vi.mock('frappe-ui', () => ({ call: vi.fn() }))

let app, host
const press = (init, target = document.body) =>
  target.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
  )

/** Mount the shell's listener plus a record component declaring `getter`. */
function mountRecord(getter) {
  host = document.createElement('div')
  document.body.append(host)
  const shown = ref(true)
  const Record = {
    setup() {
      useRecordActions(getter)
      return () => h('p', 'record')
    },
  }
  app = createApp({
    setup() {
      useShellKeyboard({
        openPalette: vi.fn(),
        openHelp: vi.fn(),
        modules: ref([]),
        router: { push: vi.fn() },
      })
      return () => (shown.value ? h(Record) : h('p', 'list'))
    },
  })
  app.mount(host)
  return shown
}

const pageRows = () =>
  shellCheatSheet({ shell: { create: false } }).find((s) => s.id === 'page')
    ?.rows || []

beforeEach(() => {
  globalThis.__ = (text, args) =>
    args ? text.replace(/{(\d+)}/g, (_, i) => args[i]) : text
})
afterEach(() => {
  app?.unmount()
  app = null
  host?.remove()
  document.querySelectorAll('[aria-modal]').forEach((el) => el.remove())
  delete window.lang
})

describe('record actions registry', () => {
  it('lists keyed actions in «En esta página» only while the record is mounted', async () => {
    const call = vi.fn()
    const shown = mountRecord(() => [
      { id: 'a.call', title: 'Call the contact', keys: ['l'], run: call },
      { id: 'a.won', title: 'Mark as won', run: vi.fn() },
      // No run: neither an action nor a key.
      { id: 'a.broken', title: 'Broken', keys: ['b'] },
    ])
    await nextTick()
    expect(recordActions.value.map((a) => a.id)).toEqual(['a.call', 'a.won'])
    expect(pageRows()).toEqual([
      { id: 'record.a.call', keys: ['L'], description: 'Call the contact' },
    ])
    press({ key: 'l' })
    expect(call).toHaveBeenCalledTimes(1)
    press({ key: 'b' })
    shown.value = false
    await nextTick()
    expect(recordActions.value).toEqual([])
    expect(pageShortcuts.value.extra).toEqual([])
    expect(pageRows()).toEqual([])
    press({ key: 'l' })
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('follows the record: an action that stops applying leaves the sheet', async () => {
    const mobile = ref('+52 55 1234 5678')
    mountRecord(() =>
      mobile.value
        ? [{ id: 'a.call', title: 'Call', keys: ['l'], run: vi.fn() }]
        : [],
    )
    await nextTick()
    expect(pageRows().map((row) => row.id)).toEqual(['record.a.call'])
    mobile.value = ''
    await nextTick()
    expect(pageRows()).toEqual([])
    expect(recordActions.value).toEqual([])
  })

  it('never fires while typing or under a dialog', async () => {
    const run = vi.fn()
    mountRecord(() => [{ id: 'a.w', title: 'W', keys: ['w'], run }])
    await nextTick()
    const input = document.createElement('textarea')
    document.body.append(input)
    input.focus()
    press({ key: 'w' }, input)
    expect(run).not.toHaveBeenCalled()
    input.remove()
    const dialog = document.createElement('div')
    dialog.setAttribute('aria-modal', 'true')
    document.body.append(dialog)
    press({ key: 'w' })
    expect(run).not.toHaveBeenCalled()
    dialog.remove()
    press({ key: 'w' })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('runRecordAction runs by id, and says when the record is gone', async () => {
    const run = vi.fn()
    const shown = mountRecord(() => [{ id: 'a.q', title: 'Q', run }])
    await nextTick()
    expect(runRecordAction('a.q')).toBe(true)
    expect(run).toHaveBeenCalledTimes(1)
    shown.value = false
    await nextTick()
    expect(runRecordAction('a.q')).toBe(false)
  })

  it('keys declare the action under a record.* id with its English title', () => {
    const run = vi.fn()
    const [entry] = recordActionKeys([
      { id: 'x', title: 'Prepare quotation', keys: ['q'], run },
      { id: 'y', title: 'Mark as lost', run },
    ])
    expect(entry).toMatchObject({
      id: 'record.x',
      keys: ['q'],
      description: 'Prepare quotation',
    })
    entry.run()
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('palette rows of the record', () => {
  it('a row per action: Spanish title, both languages findable, its first key', () => {
    window.lang = 'es-MX'
    globalThis.__ = (text) => ({ 'Call the contact': 'Llamar' })[text] ?? text
    expect(
      recordItem({
        id: 'deal.call',
        title: 'Call the contact',
        keywords: 'telefono',
        icon: 'lucide-phone',
        keys: ['l'],
        run: vi.fn(),
      }),
    ).toEqual({
      id: 'record.deal.call',
      group: 'acciones',
      title: 'Llamar',
      keywords: 'Call the contact telefono',
      icon: 'lucide-phone',
      action: 'record',
      args: { id: 'deal.call' },
      shortcut: 'l',
    })
    expect(
      recordItem({ id: 'deal.won', title: 'Mark as won', run: vi.fn() }),
    ).not.toHaveProperty('shortcut')
  })
})

describe('deal record actions (DealHeader)', () => {
  const STAGES = [
    { name: 'Nuevo', type: 'Open' },
    { name: 'Negociación', type: 'Ongoing' },
    { name: 'Ganado', type: 'Won' },
    { name: 'Cancelado', type: 'Lost' },
    { name: 'Abandonado', type: 'Lost' },
  ]
  const fns = () => ({
    call: vi.fn(),
    focusReply: vi.fn(),
    prepareQuote: vi.fn(),
    changeStage: vi.fn(),
  })

  it('a deal with a phone: l · w · q, then won and lost from the palette only', () => {
    const f = fns()
    const actions = dealRecordActions({
      isDeal: true,
      mobile: '+525512345678',
      status: 'Negociación',
      stages: STAGES,
      ...f,
    })
    expect(actions.map((a) => [a.id, a.keys?.join() || ''])).toEqual([
      ['deal.call', 'l'],
      ['deal.whatsapp', 'w'],
      ['deal.quote', 'q'],
      ['deal.won', ''],
      ['deal.lost', ''],
    ])
    for (const action of actions) action.run()
    expect(f.call).toHaveBeenCalledTimes(1)
    expect(f.focusReply).toHaveBeenCalledTimes(1)
    expect(f.prepareQuote).toHaveBeenCalledTimes(1)
    // Lost goes through changeStage → requestStage, which asks the reason.
    expect(f.changeStage.mock.calls).toEqual([['Ganado'], ['Cancelado']])
  })

  it('«Programar seguimiento» comes first, palette only (n is the next-step key)', () => {
    const schedule = vi.fn()
    const actions = dealRecordActions({
      isDeal: true,
      mobile: '1',
      stages: STAGES,
      ...fns(),
      scheduleNextStep: schedule,
    })
    expect(actions[0].id).toBe('deal.next-step')
    expect(actions[0].keys).toBeUndefined()
    actions[0].run()
    expect(schedule).toHaveBeenCalledOnce()
  })

  it('no phone, no «Llamar»; a won deal offers only «Marcar como perdido»', () => {
    const actions = dealRecordActions({
      isDeal: true,
      mobile: '',
      status: 'Ganado',
      stages: STAGES,
      ...fns(),
    })
    expect(actions.map((a) => a.id)).toEqual([
      'deal.whatsapp',
      'deal.quote',
      'deal.lost',
    ])
  })

  it('a lead (or no record) has none; a tenant without Won/Lost has no stage rows', () => {
    expect(dealRecordActions({ isDeal: false, ...fns() })).toEqual([])
    const open = dealRecordActions({
      isDeal: true,
      mobile: '1',
      stages: [{ name: 'Nuevo', type: 'Open' }],
      ...fns(),
    })
    expect(open.map((a) => a.id)).toEqual([
      'deal.call',
      'deal.whatsapp',
      'deal.quote',
    ])
  })

  it('DealHeader wires its own call, focusReply, changeStage and the Artículos tab', () => {
    const header = readFileSync(
      resolve(__dirname, '../../src/components/doco/inbox/DealHeader.vue'),
      'utf8',
    )
    expect(header).toMatch(
      /useRecordActions\(\(\) =>\s*dealRecordActions\(\{[\s\S]*?isDeal: isDeal\.value && !!activeDeal\.value,[\s\S]*?call,\s*focusReply,\s*prepareQuote: \(\) => \(activeTab\.value = 'items'\),\s*changeStage,/,
    )
    // «Preparar cotización» in Resumen does the same: the Artículos tab.
    const overview = readFileSync(
      resolve(__dirname, '../../src/components/doco/inbox/DealOverview.vue'),
      'utf8',
    )
    expect(overview).toMatch(
      /\$emit\('navigate', 'items'\)"\s*>\s*\{\{ __\('Preparar cotización'\) \}\}/,
    )
  })

  it('every title is in the es-MX catalog', () => {
    const po = readFileSync(
      resolve(__dirname, '../../../crm/locale/es.po'),
      'utf8',
    )
    const actions = dealRecordActions({
      isDeal: true,
      mobile: '1',
      stages: STAGES,
      ...fns(),
    })
    for (const { title } of actions) {
      const entry = new RegExp(`msgid "${title}"\\nmsgstr "([^"]+)"`)
      expect(po, title).toMatch(entry)
    }
    expect(po).toMatch(/msgid "New Deal"\nmsgstr "Nuevo trato"/)
  })
})

describe('«Nuevo trato» by URL on the deals list', () => {
  it('the query leaves first; the list mounted again opens the dialog once', () => {
    const router = { replace: vi.fn() }
    const history = { state: { back: '/hoy' }, replaceState: vi.fn() }
    const route = { query: { create: '1', layout: 'list' } }
    expect(takeCreateRequest(route, router, history)).toBe(false)
    expect(router.replace).toHaveBeenCalledWith({
      query: { layout: 'list' },
      state: { muelleCreate: 1 },
    })
    history.state = { back: '/hoy', muelleCreate: 1 }
    expect(
      takeCreateRequest({ query: { layout: 'list' } }, router, history),
    ).toBe(true)
    expect(history.replaceState).toHaveBeenCalledWith(
      { back: '/hoy', muelleCreate: null },
      '',
    )
    history.state = { back: '/hoy', muelleCreate: null }
    expect(takeCreateRequest({ query: {} }, router, history)).toBe(false)
  })
})
