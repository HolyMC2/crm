import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'

const { phone } = vi.hoisted(() => ({ phone: { value: false } }))
vi.mock('@/components/ui/host', async (importOriginal) => ({
  ...(await importOriginal()),
  isMobile: (await import('vue')).toRef(phone, 'value'),
}))
import Autocomplete from '@/components/frappe-ui/Autocomplete.vue'

const options = [
  { label: 'Pantallas', value: 'Pantallas' },
  { label: 'Fundas', value: 'Fundas' },
  { label: 'Cargadores', value: 'Cargadores' },
]

const cleanups = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  phone.value = false
})

async function frames(n = 4) {
  for (let i = 0; i < n; i++) {
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await nextTick()
  }
}

async function mount(props = {}) {
  const el = document.createElement('div')
  document.body.append(el)
  const model = ref('')
  const app = createApp({
    render: () =>
      h(Autocomplete, {
        id: 'grupo',
        title: 'Grupo',
        options,
        modelValue: model.value,
        'onUpdate:modelValue': (v) => (model.value = v?.value ?? v),
        ...props,
      }),
  })
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  await nextTick()
  return { el, model, button: el.querySelector('#grupo') }
}

function press(target, key) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(event)
  return event
}

const searchField = () => document.querySelector('[data-autocomplete-search]')
const shownLabels = () =>
  [...document.querySelectorAll('[role="option"]')].map((o) =>
    o.textContent.trim(),
  )

describe('Autocomplete: typing on the closed field', () => {
  it('opens the search with the typed letter and filters by it', async () => {
    const { button } = await mount()
    button.focus()
    const event = press(button, 'f')
    expect(event.defaultPrevented).toBe(true)
    await frames()
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(searchField().value).toBe('f')
    expect(document.activeElement).toBe(searchField())
    expect(shownLabels()).toEqual(['Fundas'])
  })

  it('keeps every key typed before the search field takes focus', async () => {
    const { button } = await mount()
    press(button, 'c')
    press(button, 'a')
    await frames()
    expect(searchField().value).toBe('ca')
    press(searchField(), 'r')
    expect(shownLabels()).toEqual(['Cargadores'])
  })

  it('gives focus back to the field after a pick', async () => {
    const { button, model } = await mount()
    press(button, 'f')
    await frames()
    press(searchField(), 'ArrowDown')
    await nextTick()
    press(searchField(), 'Enter')
    await frames()
    expect(model.value).toBe('Fundas')
    expect(document.activeElement).toBe(button)
  })

  it('opens the whole list on the down arrow', async () => {
    const { button } = await mount()
    press(button, 'ArrowDown')
    await frames()
    expect(searchField().value).toBe('')
    expect(shownLabels()).toEqual(['Pantallas', 'Fundas', 'Cargadores'])
  })

  it('ignores shortcuts and keys on a disabled field', async () => {
    const { button } = await mount()
    const shortcut = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    button.dispatchEvent(shortcut)
    press(button, 'Tab')
    await frames()
    expect(shortcut.defaultPrevented).toBe(false)
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })

  it('says nothing matches what was typed', async () => {
    const { button } = await mount()
    press(button, 'z')
    await frames()
    expect(
      document.querySelector('[data-autocomplete-empty]').textContent.trim(),
    ).toBe('Nothing matches «z».')
  })

  it('marks the current choice', async () => {
    const { button } = await mount({ modelValue: 'Fundas' })
    press(button, 'ArrowDown')
    await frames()
    const marked = document.querySelector('[data-selected]')
    expect(marked.textContent.trim()).toBe('Fundas')
  })

  it('picks in a sheet on a phone, titled with the field', async () => {
    phone.value = true
    const { button } = await mount()
    button.click()
    await vi.waitFor(() =>
      expect(document.querySelector('[data-ui-sheet]')).not.toBeNull(),
    )
    await frames(6)
    const sheet = document.querySelector('[data-ui-sheet]')
    expect(sheet.textContent).toContain('Grupo')
    expect(sheet.querySelector('[data-autocomplete-search]')).not.toBeNull()
    expect(document.querySelector('[data-autocomplete-panel]')).toBeNull()
  })
})
