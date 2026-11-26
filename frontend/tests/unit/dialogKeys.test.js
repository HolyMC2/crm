// Every dialog and sheet confirms from the keyboard (composables/dialogKeys.js):
// Enter from a one-line field, Ctrl+Enter from anywhere in it, the filled
// button pressed as if clicked; the shell's page keys wait under it.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import {
  enterConfirms,
  firstField,
  nextField,
  onDialogKey,
  primaryOf,
  useDialogKeys,
} from '@/composables/dialogKeys'
import { registerPageKeys, useShellKeyboard } from '@/composables/shellKeyboard'

vi.mock('@/composables/useProductos', async (actual) => ({
  ...(await actual()),
  productosApi: vi.fn(async () => ({ ok: true })),
}))
const { productosApi } = await import('@/composables/useProductos')
const { default: PriceDialog } = await import(
  '@/components/productos/PriceDialog.vue'
)

let root
const mounted = []
afterEach(() => {
  while (mounted.length) mounted.pop()()
  root?.remove()
  root = null
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

// The markup reka renders for frappe-ui's Dialog and the kit's BottomSheet.
function dialog(body, { foot = '', state = 'open' } = {}) {
  root = document.createElement('div')
  root.innerHTML = `<div role="dialog" data-state="${state}" tabindex="-1">
    <button id="close" aria-label="Cerrar">x</button>
    ${body}
    <div data-slot="actions">${foot}</div>
  </div>`
  document.body.append(root)
  const el = root.firstElementChild
  const confirm = el.querySelector('#confirm')
  const clicks = vi.fn()
  confirm?.addEventListener('click', clicks)
  return { el, confirm, clicks }
}
const FOOT = `<button data-kit-button="subtle" id="cancel">Cancelar</button>
  <button data-kit-button="solid" id="confirm">Confirmar precio</button>`

function press(target, init = {}) {
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true,
    cancelable: true,
    ...init,
  })
  target.dispatchEvent(event)
  return { event, answered: onDialogKey(event, false) }
}

describe('Enter and Ctrl+Enter confirm a dialog', () => {
  it('Enter in a price field presses the filled button', () => {
    const { el, clicks } = dialog('<input type="number" id="price" />', {
      foot: FOOT,
    })
    const { event } = press(el.querySelector('#price'))
    expect(clicks).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('Shift+Enter in a one-line field confirms too; Alt+Enter does not', () => {
    const { el, clicks } = dialog('<input id="name" />', { foot: FOOT })
    press(el.querySelector('#name'), { shiftKey: true })
    press(el.querySelector('#name'), { altKey: true })
    expect(clicks).toHaveBeenCalledTimes(1)
  })

  it('Ctrl+Enter confirms from a textarea and from the dialog itself; Enter there keeps its meaning', () => {
    const { el, clicks } = dialog('<textarea id="note"></textarea>', {
      foot: FOOT,
    })
    const note = el.querySelector('#note')
    expect(press(note).answered).toBe(false)
    expect(press(el).answered).toBe(false)
    expect(clicks).not.toHaveBeenCalled()
    press(note, { ctrlKey: true })
    press(el, { ctrlKey: true })
    expect(clicks).toHaveBeenCalledTimes(2)
  })

  it('⌘↵ on Apple, never Ctrl+Enter there', () => {
    const { el, clicks } = dialog('<textarea id="note"></textarea>', {
      foot: FOOT,
    })
    const note = el.querySelector('#note')
    const ctrl = new KeyboardEvent('keydown', {
      key: 'Enter',
      ctrlKey: true,
      cancelable: true,
    })
    note.dispatchEvent(ctrl)
    expect(onDialogKey(ctrl, true)).toBe(false)
    const meta = new KeyboardEvent('keydown', {
      key: 'Enter',
      metaKey: true,
      cancelable: true,
    })
    note.dispatchEvent(meta)
    expect(onDialogKey(meta, true)).toBe(true)
    expect(clicks).toHaveBeenCalledTimes(1)
  })

  it('Ctrl+Enter with the focus left outside goes to the open dialog on top', () => {
    const { clicks } = dialog('<input id="a" />', { foot: FOOT })
    const outside = document.createElement('button')
    document.body.append(outside)
    press(outside, { ctrlKey: true })
    expect(clicks).toHaveBeenCalledTimes(1)
    // A plain Enter on the page under it is the page's.
    expect(press(outside).answered).toBe(false)
  })

  it('a search, a combobox, a datalist or an open list keeps its Enter', () => {
    const { el, clicks } = dialog(
      `<input type="search" id="s" />
       <input role="combobox" id="c" />
       <input aria-autocomplete="list" id="ac" />
       <input list="opts" id="l" />
       <input aria-expanded="true" id="x" />
       <div data-list-search><input id="ls" /></div>
       <div data-enter-keeps><input id="k" /></div>`,
      { foot: FOOT },
    )
    for (const id of ['s', 'c', 'ac', 'l', 'x', 'ls', 'k'])
      expect(press(el.querySelector(`#${id}`)).answered).toBe(false)
    expect(clicks).not.toHaveBeenCalled()
  })

  it('a dialog that answered Ctrl+Enter itself is left alone', () => {
    const { el, clicks } = dialog('<textarea id="note"></textarea>', {
      foot: FOOT,
    })
    const note = el.querySelector('#note')
    note.addEventListener('keydown', (event) => event.preventDefault())
    press(note, { ctrlKey: true })
    expect(clicks).not.toHaveBeenCalled()
  })

  it('while the button is disabled, Enter walks to the field still missing', () => {
    const { el, confirm, clicks } = dialog(
      `<input id="price" />
       <label><input type="checkbox" id="ack" /> Lo revisé</label>`,
      { foot: FOOT },
    )
    confirm.disabled = true
    const price = el.querySelector('#price')
    const ack = el.querySelector('#ack')
    const { event } = press(price)
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(ack)
    expect(nextField(el, price)).toBe(ack)
    // Checked, the button is ready, and Enter on the checkbox confirms.
    ack.checked = true
    confirm.disabled = false
    press(ack)
    expect(clicks).toHaveBeenCalledTimes(1)
  })

  it('a form that submits itself keeps its native Enter; Ctrl+Enter submits a form without a filled button', () => {
    const { el } = dialog(
      `<form id="f"><input id="a" /><button type="submit">Ir</button></form>
       <form id="g"><input id="b" /><textarea id="t"></textarea></form>`,
    )
    expect(press(el.querySelector('#a')).answered).toBe(false)
    const g = el.querySelector('#g')
    const submit = vi.fn((event) => event.preventDefault())
    g.addEventListener('submit', submit)
    press(el.querySelector('#t'), { ctrlKey: true })
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('the shell’s own layers answer their keys themselves', () => {
    const { el, clicks } = dialog('<input id="q" />', { foot: FOOT })
    el.setAttribute('data-shell-layer', 'palette')
    expect(press(el.querySelector('#q')).answered).toBe(false)
    el.setAttribute('data-shell-layer', 'precios-ajustar')
    press(el.querySelector('#q'))
    expect(clicks).toHaveBeenCalledTimes(1)
  })
})

describe('which button confirms', () => {
  it('the one filled button; with two, the one in the foot; a marked one first', () => {
    const { el, confirm } = dialog('<input />', { foot: FOOT })
    expect(primaryOf(el)).toBe(confirm)
    const extra = document.createElement('button')
    extra.dataset.kitButton = 'solid'
    el.prepend(extra)
    expect(primaryOf(el)).toBe(confirm)
    const marked = document.createElement('button')
    marked.setAttribute('data-dialog-submit', '')
    el.append(marked)
    expect(primaryOf(el)).toBe(marked)
  })

  it('a nested dialog’s button belongs to it, not to the dialog under it', () => {
    const { el } = dialog(
      '<div role="dialog"><button data-kit-button="solid" id="inner">Sí</button></div>',
    )
    const inner = el.querySelector('#inner')
    expect(primaryOf(el)).toBe(null)
    expect(primaryOf(inner.closest('[role="dialog"]'))).toBe(inner)
  })

  it('Enter only counts in one-line fields and checkboxes', () => {
    const make = (html) => {
      const box = document.createElement('div')
      box.innerHTML = html
      return box.firstElementChild
    }
    expect(enterConfirms(make('<input />'))).toBe(true)
    expect(enterConfirms(make('<input type="number" />'))).toBe(true)
    expect(enterConfirms(make('<input type="checkbox" />'))).toBe(true)
    expect(enterConfirms(make('<input type="file" />'))).toBe(false)
    expect(enterConfirms(make('<textarea></textarea>'))).toBe(false)
    expect(enterConfirms(make('<button>x</button>'))).toBe(false)
    expect(enterConfirms(make('<select></select>'))).toBe(false)
  })
})

describe('the field a dialog opens on (desktop)', () => {
  it('its marked field, else its first field you type in, else none', () => {
    let { el } = dialog(
      '<input id="a" /><div data-autofocus><input id="b" /></div>',
    )
    expect(firstField(el).id).toBe('b')
    ;({ el } = dialog('<input id="a" /><textarea id="t"></textarea>'))
    expect(firstField(el).id).toBe('a')
    ;({ el } = dialog('<select id="s"></select><input id="a" />'))
    expect(firstField(el)).toBe(null)
    ;({ el } = dialog('<input id="a" readonly />'))
    expect(firstField(el)).toBe(null)
    ;({ el } = dialog('<input type="search" id="q" />'))
    expect(firstField(el).id).toBe('q')
  })
})

function mount(setup) {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ setup, render: () => null })
  app.config.globalProperties.__ = (text) => text
  app.mount(host)
  const unmount = () => {
    if (!host.isConnected) return
    app.unmount()
    host.remove()
  }
  mounted.push(unmount)
  return unmount
}
const frames = () =>
  new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)))

describe('useDialogKeys in the shell', () => {
  it('focuses the first field, shows the key on the filled button, and Enter confirms', async () => {
    const unmount = mount(() => useDialogKeys({ fine: () => true }))
    await nextTick()
    const { el, confirm, clicks } = dialog(
      '<input type="number" id="price" />',
      { foot: FOOT },
    )
    el.querySelector('#close').focus()
    await frames()
    expect(document.activeElement.id).toBe('price')
    expect(confirm.dataset.keyHint).toBe('Ctrl+↵')
    expect(confirm.getAttribute('aria-keyshortcuts')).toBe('Control+Enter')
    document.activeElement.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }),
    )
    expect(clicks).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('a phone keeps the sheet’s own focus and shows no key', async () => {
    const unmount = mount(() => useDialogKeys({ fine: () => false }))
    await nextTick()
    const { el, confirm } = dialog('<input id="a" />', { foot: FOOT })
    el.focus()
    await frames()
    expect(document.activeElement).toBe(el)
    expect(confirm.dataset.keyHint).toBeUndefined()
    unmount()
  })

  it('a click or a key inside before the field arrives keeps the worker’s choice', async () => {
    mount(() => useDialogKeys({ fine: () => true }))
    await nextTick()
    for (const move of ['pointerdown', 'keydown']) {
      const { el } = dialog('<div id="later"></div>', { foot: FOOT })
      await frames()
      const cancel = el.querySelector('#cancel')
      cancel.focus()
      cancel.dispatchEvent(
        move === 'pointerdown'
          ? new PointerEvent('pointerdown', { bubbles: true })
          : new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
      )
      el.querySelector('#later').innerHTML = '<input id="a" />'
      await frames()
      expect(document.activeElement).toBe(cancel)
      root.remove()
    }
    // Untouched, the field that arrives with the data takes the focus.
    const { el } = dialog('<div id="later"></div>', { foot: FOOT })
    await frames()
    el.querySelector('#later').innerHTML = '<input id="a" />'
    await frames()
    expect(document.activeElement.id).toBe('a')
  })

  it('the shell’s page keys wait under an open dialog', async () => {
    const create = vi.fn()
    const unmount = mount(() => {
      useShellKeyboard({
        openPalette: vi.fn(),
        openHelp: vi.fn(),
        modules: ref([]),
        router: { push: vi.fn() },
      })
      registerPageKeys({ keys: { create } })
    })
    await nextTick()
    const c = () =>
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'c',
          bubbles: true,
          cancelable: true,
        }),
      )
    c()
    expect(create).toHaveBeenCalledTimes(1)
    dialog('<input />', { foot: FOOT })
    c()
    expect(create).toHaveBeenCalledTimes(1)
    unmount()
  })
})

describe('«Cambiar precio» from the keyboard', () => {
  const rows = [
    {
      price_list: 'Precio de venta',
      rate: 1050,
      currency: 'MXN',
      uom: 'Nos',
      stock_uom: 'Nos',
      can_write: true,
      warning_percent: 50,
    },
    {
      price_list: 'Precios Payjoy',
      rate: null,
      currency: 'MXN',
      uom: 'Nos',
      stock_uom: 'Nos',
      can_write: true,
      warning_percent: 50,
    },
  ]

  it('opens on the price, and Enter after 900 confirms it', async () => {
    const open = ref(false)
    const saved = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp({
      setup() {
        useDialogKeys({ fine: () => true })
        return () =>
          h(PriceDialog, {
            item: 'MOD00526',
            rows,
            modelValue: open.value,
            'onUpdate:modelValue': (value) => (open.value = value),
            onSaved: saved,
          })
      },
    })
    app.config.globalProperties.__ = globalThis.__
    app.mount(host)
    open.value = true
    await nextTick()
    await frames()
    await frames()
    const input = document.activeElement
    expect(input?.tagName).toBe('INPUT')
    expect(input.closest('[role="dialog"]')).not.toBe(null)
    input.value = '900'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }),
    )
    await vi.waitFor(() => expect(productosApi).toHaveBeenCalled())
    const [method, args] = productosApi.mock.calls[0]
    expect(method).toBe('change_price')
    expect(args.item).toBe('MOD00526')
    expect(JSON.stringify(args)).toContain('900')
    await vi.waitFor(() => expect(saved).toHaveBeenCalled())
    app.unmount()
    host.remove()
  })
})
