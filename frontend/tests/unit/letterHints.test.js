// «Saltar con letras»: with the switch on, `f` tags everything that can be
// pressed, typing a tag presses it, and a tag also shows the element's own key.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'
import {
  HINT_LETTERS,
  hideHints,
  hintLabels,
  hintTargets,
  hintsShown,
  letterHintsOn,
  onHintKey,
  onHintTrigger,
  shortcutOf,
  showHints,
  useLetterHints,
} from '@/composables/letterHints'
import {
  registerPageKeys,
  shellCheatSheet,
  useShellKeyboard,
} from '@/composables/shellKeyboard'
import { userScopedKey } from '@/utils/storageKeys'

// jsdom has no layout: each element says its box in data-rect="left,top,w,h".
const rectOf = (el) => {
  const [left, top, width, height] = (el.dataset.rect || '0,0,0,0')
    .split(',')
    .map(Number)
  return { left, top, width, height, right: left + width, bottom: top + height }
}
const geometry = {
  rectOf,
  reachable: (box) => !box.closest('[data-covered]'),
  width: 1280,
  height: 900,
}

let root
function page(html) {
  root = document.createElement('main')
  root.innerHTML = html
  document.body.append(root)
  return root
}
const key = (k, init = {}, target = document.body) => {
  const event = new KeyboardEvent('keydown', {
    key: k,
    bubbles: true,
    cancelable: true,
    ...init,
  })
  target.dispatchEvent(event)
  return event
}
const typeLabel = (label) => {
  for (const letter of label) onHintKey(key(letter))
}

beforeEach(() => {
  letterHintsOn.value = true
})
afterEach(() => {
  hideHints()
  root?.remove()
  letterHintsOn.value = false
  vi.restoreAllMocks()
})

describe('tags', () => {
  it('are all one length, so none starts another', () => {
    expect(hintLabels(3)).toEqual(['s', 'a', 'd'])
    expect(hintLabels(HINT_LETTERS.length)).toHaveLength(HINT_LETTERS.length)
    const many = hintLabels(40)
    expect(new Set(many).size).toBe(40)
    expect(many.every((label) => label.length === 2)).toBe(true)
    expect(hintLabels(0)).toEqual([])
  })
})

describe('what gets a tag', () => {
  it('everything on screen that can be pressed, in reading order; not what is off, hidden or covered', () => {
    page(`
      <button id="b2" data-rect="200,100,80,40">Dos</button>
      <button id="b1" data-rect="10,100,80,40">Uno</button>
      <button id="off" disabled data-rect="10,200,80,40">Apagado</button>
      <div aria-hidden="true"><button id="hidden" data-rect="10,300,80,40">x</button></div>
      <div data-covered><button id="under" data-rect="10,400,80,40">Bajo la hoja</button></div>
      <button id="away" data-rect="10,2000,80,40">Más abajo</button>
      <label id="lbl" data-rect="10,500,200,40"><input type="checkbox" class="sr-only" id="chk" data-rect="10,500,1,1" /> Revisado</label>
      <a href="#x" id="link" data-rect="10,600,120,40"><button id="inner" data-rect="10,600,120,40">Dentro</button></a>
    `)
    const ids = hintTargets(document, geometry).map((t) => t.el.id)
    expect(ids).toEqual(['b1', 'b2', 'chk', 'inner'])
    // The visually hidden checkbox is tagged at its label.
    const chk = hintTargets(document, geometry).find((t) => t.el.id === 'chk')
    expect(chk.box.id).toBe('lbl')
  })

  it('shows the element’s own key: data-shortcut, the rail’s go-to, the list search, aria-keyshortcuts', () => {
    page(`
      <button id="a" data-shortcut="a">Acciones</button>
      <a id="hoy" data-module="hoy">Hoy</a>
      <button id="k" aria-keyshortcuts="Control+K Control+G">Buscar</button>
      <button id="dot" aria-keyshortcuts=".">⋯</button>
      <div data-list-search><input id="q" /></div>
      <button id="plain">Nada</button>
    `)
    const of = (id) => shortcutOf(document.getElementById(id))
    expect(of('a')).toBe('A')
    expect(of('hoy')).toBe('G → H')
    expect(of('k')).toBe('Ctrl+K')
    expect(of('dot')).toBe('.')
    expect(of('plain')).toBe('')
    // `/` only where the page answers its search.
    expect(of('q')).toBe('')
    const remove = registerPageKeys({ keys: { search: () => {} } })
    expect(of('q')).toBe('/')
    remove()
  })
})

describe('jumping', () => {
  it('f puts the tags up, typing one presses it, Esc and Backspace work', () => {
    page(`
      <button id="b1" data-rect="10,10,80,40">Uno</button>
      <button id="b2" data-rect="10,60,80,40">Dos</button>
      <input id="campo" value="12" data-rect="10,110,200,40" />
    `)
    const clicks = vi.fn()
    document.getElementById('b2').addEventListener('click', clicks)
    expect(showHints({ geometry })).toBe(true)
    expect(hintsShown.value.map((h) => h.label)).toEqual(['s', 'a', 'd'])
    expect(
      document.querySelectorAll('[data-letter-hints] .letter-hint'),
    ).toHaveLength(3)
    // A letter that is no tag changes nothing; Esc takes the tags away.
    onHintKey(key('z'))
    expect(hintsShown.value).toHaveLength(3)
    onHintKey(key('Escape'))
    expect(hintsShown.value).toEqual([])
    expect(document.querySelector('[data-letter-hints]')).toBeNull()

    showHints({ geometry })
    const label = hintsShown.value.find((h) => h.el.id === 'b2').label
    typeLabel(label)
    expect(clicks).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-letter-hints]')).toBeNull()

    // A field takes the focus, its text selected.
    showHints({ geometry })
    typeLabel(hintsShown.value.find((h) => h.el.id === 'campo').label)
    expect(document.activeElement.id).toBe('campo')
  })

  it('with many targets the tags have two letters; Backspace undoes one', () => {
    page(
      Array.from(
        { length: 20 },
        (_, i) =>
          `<button id="b${i}" data-rect="10,${i * 42},80,40">${i}</button>`,
      ).join(''),
    )
    showHints({ geometry })
    const target = hintsShown.value[17]
    expect(target.label).toHaveLength(2)
    const clicks = vi.fn()
    target.el.addEventListener('click', clicks)
    onHintKey(key(target.label[0]))
    const visible = () =>
      [...document.querySelectorAll('.letter-hint')].filter((t) => !t.hidden)
        .length
    const after = visible()
    expect(after).toBeLessThan(20)
    onHintKey(key('Backspace'))
    expect(visible()).toBe(20)
    typeLabel(target.label)
    expect(clicks).toHaveBeenCalledTimes(1)
  })

  it('Shift+F opens a link in another tab', () => {
    page(`<a id="l" href="/crm/hoy" data-rect="10,10,80,40">Hoy</a>`)
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    showHints({ newTab: true, geometry })
    typeLabel(hintsShown.value[0].label)
    expect(open).toHaveBeenCalledWith(
      expect.stringContaining('/crm/hoy'),
      '_blank',
      'noopener',
    )
  })

  it('a key with Ctrl or ⌘ leaves the tags and keeps its own meaning', () => {
    page(`<button data-rect="10,10,80,40">Uno</button>`)
    showHints({ geometry })
    const event = key('k', { ctrlKey: true })
    expect(onHintKey(event)).toBe(false)
    expect(event.defaultPrevented).toBe(false)
    expect(hintsShown.value).toEqual([])
  })
})

describe('the switch and the f key', () => {
  it('f does nothing while the switch is off, in a field, or with a modifier', () => {
    page(`<input id="campo" /><button id="b">Uno</button>`)
    letterHintsOn.value = false
    expect(onHintTrigger(key('f'))).toBe(false)
    letterHintsOn.value = true
    expect(onHintTrigger(key('f', {}, document.getElementById('campo')))).toBe(
      false,
    )
    expect(onHintTrigger(key('f', { ctrlKey: true }))).toBe(false)
  })

  it('is remembered per person in this browser, and starts off', () => {
    expect(localStorage.getItem(userScopedKey('muelle.letterHints'))).toBe('on')
    letterHintsOn.value = false
    return nextTick().then(() =>
      expect(
        localStorage.getItem(userScopedKey('muelle.letterHints')),
      ).toBeNull(),
    )
  })

  it('while on, f is the letters’ before a page’s own f (Compras’ «Registrar factura»)', async () => {
    const bill = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp({
      setup() {
        useLetterHints()
        useShellKeyboard({
          openPalette: vi.fn(),
          openHelp: vi.fn(),
          modules: ref([]),
          router: { push: vi.fn() },
        })
        registerPageKeys({
          extra: [
            {
              id: 'compras.bill',
              keys: ['f'],
              description: "Register the supplier's bill",
              run: bill,
            },
          ],
        })
      },
      render: () => null,
    })
    app.mount(host)
    await nextTick()
    letterHintsOn.value = false
    key('f')
    expect(bill).toHaveBeenCalledTimes(1)
    letterHintsOn.value = true
    key('f')
    expect(bill).toHaveBeenCalledTimes(1)
    // The sheet lists the letters and not the page's f.
    const rows = shellCheatSheet({ modules: [] }).flatMap((s) =>
      s.rows.map((r) => r.id),
    )
    expect(rows).toEqual(expect.arrayContaining(['letters', 'letters.tab']))
    expect(rows).not.toContain('compras.bill')
    letterHintsOn.value = false
    const off = shellCheatSheet({ modules: [] }).flatMap((s) =>
      s.rows.map((r) => r.id),
    )
    expect(off).not.toContain('letters')
    expect(off).toContain('compras.bill')
    app.unmount()
    host.remove()
  })
})
