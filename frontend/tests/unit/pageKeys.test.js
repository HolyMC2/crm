// Keyboard standard H3b: every shell page answers exactly the list/form keys
// it declares, and the Alt+H sheet («En esta página») lists exactly those.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  pageShortcuts,
  registerPageKeys,
  registerPageShortcuts,
  shellCheatSheet,
  useShellKeyboard,
} from '@/composables/shellKeyboard'
import { PAGE_KEYS, useFormKeys, useListKeys } from '@/composables/pageKeys'
import { powerListPageKeys } from '@/utils/powerList'

const LIST_FIXTURE = `
  <input data-list-search aria-label="Buscar" />
  <button id="elsewhere">Otra acción</button>
  <ul>
    ${[1, 2, 3, 4]
      .map(
        (n) => `<li data-key-row id="row${n}">
          <input type="checkbox" data-row-check aria-label="Seleccionar ${n}" />
          <a href="#r${n}" data-row-link>Registro ${n}</a>
          <button class="row-action">Llamar ${n}</button>
        </li>`,
      )
      .join('')}
  </ul>`

let app, host, content, opened, spies
const press = (init, target = document.activeElement || document.body) =>
  target.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
  )
const rowOf = () => document.activeElement?.closest?.('[data-key-row]')?.id
const checked = () =>
  [...content.querySelectorAll('[data-row-check]')].map((c) => c.checked)

function mountPage(register) {
  content = document.createElement('main')
  content.id = 'muelle-content'
  content.innerHTML = LIST_FIXTURE
  document.body.append(content)
  opened = []
  content.querySelectorAll('[data-row-link]').forEach((link) =>
    link.addEventListener('click', (event) => {
      event.preventDefault()
      opened.push(link.getAttribute('href'))
    }),
  )
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({
    setup() {
      useShellKeyboard({
        openPalette: vi.fn(),
        openHelp: vi.fn(),
        modules: ref([]),
        router: { push: vi.fn() },
      })
      register()
      return () => h('span')
    },
  })
  app.mount(host)
}

beforeEach(() => {
  globalThis.__ = (text, args) =>
    args ? text.replace(/{(\d+)}/g, (_, i) => args[i]) : text
  spies = { create: vi.fn(), close: vi.fn(), edit: vi.fn() }
})
afterEach(() => {
  app?.unmount()
  app = null
  host?.remove()
  content?.remove()
})

// The page sheet rows (list/form keys) and «Crear», for a worker whose shell
// has no module create target: only what the page answers. «[» (the rail) is
// a shell row on every page.
function sheetIds() {
  return shellCheatSheet({ shell: { create: false } })
    .flatMap((section) => section.rows.map((row) => row.id))
    .filter((id) => !['help', 'palette', 'records', 'sidebar'].includes(id))
}

const isList = (page) => page !== 'deal'

describe('every page context: the sheet lists exactly the keys it answers', () => {
  for (const [page, ids] of Object.entries(PAGE_KEYS)) {
    it(`${page}: ${ids.join(' ')}`, async () => {
      mountPage(() => {
        if (!isList(page)) {
          useFormKeys({ page, edit: spies.edit, close: spies.close })
          return
        }
        useListKeys({
          page,
          search: ids.includes('search'),
          rows: ids.includes('row.next'),
          open: ids.includes('row.open'),
          select: ids.includes('select.toggle'),
          create: ids.includes('create') ? spies.create : undefined,
          close: ids.includes('close') ? spies.close : undefined,
        })
      })
      await nextTick()
      // Declared == answered == listed (Esc is a universal row on every page).
      expect([...pageShortcuts.value.ids].sort()).toEqual([...ids].sort())
      const listed = sheetIds()
      for (const id of ids) expect(listed).toContain(id)
      for (const id of listed)
        expect(id === 'close' || ids.includes(id)).toBe(true)

      // And each listed key does what its row says.
      if (ids.includes('search')) {
        press({ key: '/' }, document.body)
        expect(document.activeElement.matches('[data-list-search]')).toBe(true)
        // `/` types inside the field; Ctrl+Shift+K works while typing.
        document.activeElement.blur()
        content.querySelector('#elsewhere').focus()
        press({ key: 'K', ctrlKey: true, shiftKey: true })
        expect(document.activeElement.matches('[data-list-search]')).toBe(true)
        if (ids.includes('close'))
          spies.close.mockImplementationOnce(() => false)
        // Esc in the search hands the keyboard back to the list.
        press({ key: 'Escape' })
        expect(document.activeElement).toBe(document.body)
      }
      if (ids.includes('row.next')) {
        press({ key: 'j' }, document.body)
        expect(rowOf()).toBe('row1')
        press({ key: 'j' })
        press({ key: 'ArrowDown' })
        expect(rowOf()).toBe('row3')
        press({ key: 'k' })
        press({ key: 'ArrowUp' })
        expect(rowOf()).toBe('row1')
      }
      if (ids.includes('row.open')) {
        content.querySelector('#row2 [data-row-link]').focus()
        press({ key: 'Enter' })
        expect(opened).toEqual(['#r2'])
        // Enter on a row's own button keeps the button's meaning.
        content.querySelector('#row2 .row-action').focus()
        press({ key: 'Enter' })
        expect(opened).toEqual(['#r2'])
      }
      if (ids.includes('select.toggle')) {
        content.querySelector('#row1 [data-row-link]').focus()
        press({ key: 'x' })
        expect(checked()).toEqual([true, false, false, false])
        press({ key: 'j' })
        press({ key: 'j' })
        press({ key: 'X', shiftKey: true })
        expect(checked()).toEqual([true, true, true, false])
        press({ key: 'a', ctrlKey: true })
        expect(checked()).toEqual([true, true, true, true])
      }
      if (ids.includes('create')) {
        press({ key: 'c' }, document.body)
        expect(spies.create).toHaveBeenCalledTimes(1)
      }
      if (ids.includes('edit')) {
        press({ key: 'e' }, document.body)
        expect(spies.edit).toHaveBeenCalledTimes(1)
      }
      if (ids.includes('close')) {
        spies.close.mockClear()
        press({ key: 'Escape' }, document.body)
        expect(spies.close).toHaveBeenCalledTimes(1)
      }
      // Keys a page does not answer keep their native meaning.
      const keys = {
        'select.toggle': { key: 'x' },
        create: { key: 'c' },
        edit: { key: 'e' },
      }
      for (const [id, init] of Object.entries(keys)) {
        if (ids.includes(id)) continue
        const event = new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          ...init,
        })
        document.body.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(false)
      }
    })
  }
})

describe('page keys and the shell', () => {
  it('a page refuses handlers that differ from its PAGE_KEYS row', () => {
    expect(() =>
      mountPage(() => useListKeys({ page: 'hoy', search: true, rows: true })),
    ).toThrow(/hoy answers/)
  })

  it('`when` keeps a key out of the sheet and unanswered while not allowed', async () => {
    const allowed = ref(false)
    mountPage(() =>
      useListKeys({
        page: 'pendientes',
        search: true,
        rows: true,
        open: true,
        create: spies.create,
        when: { create: () => allowed.value },
      }),
    )
    expect(pageShortcuts.value.ids).not.toContain('create')
    press({ key: 'c' }, document.body)
    expect(spies.create).not.toHaveBeenCalled()
    allowed.value = true
    expect(pageShortcuts.value.ids).toContain('create')
    expect(sheetIds()).toContain('create')
    press({ key: 'c' }, document.body)
    expect(spies.create).toHaveBeenCalledTimes(1)
  })

  it('no list key fires under a dialog, and leaving the page removes its rows', async () => {
    mountPage(() =>
      useListKeys({ page: 'avisos', search: true, rows: true, open: true }),
    )
    const dialog = document.createElement('div')
    dialog.setAttribute('aria-modal', 'true')
    document.body.append(dialog)
    press({ key: 'j' }, document.body)
    expect(rowOf()).toBeUndefined()
    dialog.remove()
    press({ key: 'j' }, document.body)
    expect(rowOf()).toBe('row1')
    app.unmount()
    app = null
    expect(pageShortcuts.value.ids).toEqual([])
  })

  it('back on the list, j starts at the row the worker opened', () => {
    mountPage(() =>
      useListKeys({ page: 'avisos', search: true, rows: true, open: true }),
    )
    content.querySelector('#row3').setAttribute('data-row-current', '')
    press({ key: 'j' }, document.body)
    expect(rowOf()).toBe('row3')
  })

  it('a power list answering its own keys is listed, never called by the shell', () => {
    // Cobranza/Compras/Gastos/Garantías: usePowerList keeps its own listener.
    const own = vi.fn()
    mountPage(() => registerPageShortcuts('list'))
    window.addEventListener('keydown', own)
    expect(pageShortcuts.value.contexts).toEqual(['list'])
    expect(sheetIds()).toContain('row.next')
    const event = new KeyboardEvent('keydown', {
      key: 'j',
      bubbles: true,
      cancelable: true,
    })
    document.body.dispatchEvent(event)
    expect(own).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(false)
    expect(rowOf()).toBeUndefined()
    window.removeEventListener('keydown', own)
  })
})

describe('every shell page is wired to its PAGE_KEYS row', () => {
  const src = (file) =>
    readFileSync(resolve(__dirname, '../../src', file), 'utf8')
  const WIRING = {
    hoy: ['pages/Hoy.vue', 'components/hoy/HoyTask.vue'],
    contactos: ['pages/Contactos.vue'],
    ventas: ['pages/DealsView.vue'],
    deal: ['pages/Deal360.vue'],
    pendientes: [
      'pages/Pendientes.vue',
      'components/pendientes/PendienteRow.vue',
    ],
    archivos: ['pages/Archivos.vue', 'components/archivos/ArchivosBrowser.vue'],
    avisos: ['pages/Avisos.vue', 'components/avisos/AvisosList.vue'],
    workload: ['components/Workload/WorkloadQueue.vue'],
    inbox: ['components/doco/inbox/LegacyConversationQueue.vue'],
    'inbox-conversations': ['components/Inbox/ConversationQueue.vue'],
  }
  it('lists every page once', () => {
    expect(Object.keys(WIRING).sort()).toEqual(Object.keys(PAGE_KEYS).sort())
  })
  for (const [page, files] of Object.entries(WIRING)) {
    it(`${page}: registers its row and marks what its keys need`, () => {
      const code = files.map(src).join('\n')
      expect(code).toContain(`page: '${page}'`)
      const ids = PAGE_KEYS[page]
      if (ids.includes('row.next')) expect(code).toContain('data-key-row')
      if (ids.includes('select.toggle'))
        expect(code).toContain('data-row-check')
      if (ids.includes('search')) expect(code).toContain('data-list-search')
      // No page keeps a keydown listener of its own for these keys.
      expect(code).not.toMatch(/addEventListener\('keydown'/)
    })
  }
  it('Agenda answers «c» through the shell and skips a key the shell took', () => {
    const code = src('pages/Agenda.vue')
    expect(code).toContain('registerPageKeys(')
    expect(code).toMatch(
      /function onKey\(event\) {\s*if \(\s*event\.defaultPrevented/,
    )
  })
  it('power lists keep their own listener and declare exactly what it answers', () => {
    for (const file of ['composables/usePowerList.js', 'pages/Cobranza.vue']) {
      expect(src(file)).toMatch(/registerPageKeys\(\s*powerListPageKeys\(/)
      expect(src(file)).not.toContain("registerPageShortcuts('list'")
    }
    // usePowerList passes the page's bulk-action switch through.
    expect(src('composables/usePowerList.js')).toMatch(
      /powerListPageKeys\(\{\s*focusSearch,\s*selectable,/,
    )
  })
})

describe('power lists (Cobranza, Compras, Gastos, Garantías) in Alt+H', () => {
  it('list j/k/Enter, selection only with a bulk action, never Ctrl+Enter; the shell answers the search', async () => {
    const selectable = ref(true)
    const focusSearch = vi.fn(() =>
      content.querySelector('[data-list-search]').focus(),
    )
    mountPage(() =>
      registerPageKeys(
        powerListPageKeys({
          focusSearch,
          selectable: () => selectable.value,
          shortcuts: () => [
            { id: 'cobranza.pay', keys: ['$'], description: 'Record payment' },
          ],
        }),
      ),
    )
    await nextTick()
    expect([...pageShortcuts.value.ids].sort()).toEqual(
      [
        'row.next',
        'row.prev',
        'row.open',
        'search',
        'select.toggle',
        'select.range',
        'select.page',
      ].sort(),
    )
    const listed = sheetIds()
    expect(listed).not.toContain('row.split')
    expect(listed).toContain('cobranza.pay')
    selectable.value = false
    await nextTick()
    expect(sheetIds()).not.toContain('select.toggle')
    expect(sheetIds()).not.toContain('select.page')
    // Ctrl+Shift+K works while typing, as the sheet's «search» row says.
    const other = document.createElement('input')
    content.append(other)
    other.focus()
    press({ key: 'K', ctrlKey: true, shiftKey: true })
    expect(focusSearch).toHaveBeenCalledTimes(1)
    expect(document.activeElement.matches('[data-list-search]')).toBe(true)
  })

  it('a paused or guarded list lists and answers nothing', async () => {
    const focusSearch = vi.fn()
    mountPage(() =>
      registerPageKeys(
        powerListPageKeys({ focusSearch, enabled: () => false }),
      ),
    )
    await nextTick()
    expect(pageShortcuts.value.ids).toEqual([])
    press({ key: '/' }, document.body)
    expect(focusSearch).not.toHaveBeenCalled()
  })
})
