// The kit's Material 3 controls (components/ui: Button, Switch, Field,
// ListGroup), vendored from muelle/workspace/packages/ui@0.3.0.
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Switch from '@/components/ui/Switch.vue'
import Field from '@/components/ui/Field.vue'
import ListGroup from '@/components/ui/ListGroup.vue'

let app, host
function mount(render) {
  host = document.createElement('div')
  document.body.appendChild(host)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:all(.*)', component: { render: () => null } }],
  })
  app = createApp({ render })
  app.use(router)
  app.mount(host)
  return host
}
afterEach(() => {
  app?.unmount()
  host?.remove()
})
const tick = async () => {
  await nextTick()
  await nextTick()
}

describe('kit Button', () => {
  it('draws each variant as a pill: filled, tonal (the default), outlined, text', () => {
    mount(() => [
      h(Button, { variant: 'solid', label: 'Guardar' }),
      h(Button, { label: 'Ver' }),
      h(Button, { variant: 'outline', label: 'Filtrar' }),
      h(Button, { variant: 'ghost', label: 'Cancelar' }),
      h(Button, { variant: 'solid', theme: 'red', label: 'Borrar' }),
    ])
    const [solid, subtle, outline, ghost, red] = host.querySelectorAll('button')
    for (const b of [solid, subtle, outline, ghost])
      expect(b.className).toContain('rounded-full')
    expect(solid.className).toContain('bg-surface-gray-10')
    expect(subtle.className).toContain('--muelle-secondary-container')
    expect(subtle.dataset.kitButton).toBe('subtle')
    expect(outline.className).toContain('border')
    expect(ghost.className).not.toMatch(/\bbg-/)
    expect(red.className).toContain('bg-surface-red-7')
  })

  it('keeps frappe-ui’s heights per size', () => {
    mount(() =>
      ['xs', 'sm', 'md', 'lg'].map((size) => h(Button, { size, label: size })),
    )
    expect(
      [...host.querySelectorAll('button')].map(
        (b) => b.className.match(/\bh-(\d+)\b/)[1],
      ),
    ).toEqual(['6', '7', '8', '10'])
  })

  it('spins while loading, takes no tap, and says it is busy', async () => {
    let taps = 0
    mount(() =>
      h(Button, { loading: true, label: 'Guardar', onClick: () => taps++ }),
    )
    const b = host.querySelector('button')
    expect(b.disabled).toBe(true)
    expect(b.getAttribute('aria-busy')).toBe('true')
    expect(b.querySelector('.lucide-loader-circle')).not.toBeNull()
    b.click()
    expect(taps).toBe(0)
  })

  it('an icon button keeps its label for screen readers and the tooltip as its title', () => {
    mount(() =>
      h(Button, { icon: 'lucide-trash', label: 'Borrar', tooltip: 'Borrar' }),
    )
    const b = host.querySelector('button')
    expect(b.className).toContain('size-7')
    expect(b.querySelector('.lucide-trash')).not.toBeNull()
    expect(b.querySelector('.sr-only').textContent).toBe('Borrar')
    expect(b.title).toBe('Borrar')
  })

  it('holds the pressed look while its menu is open, and links when given a route', async () => {
    mount(() => [
      h(Button, { label: 'Más', 'data-state': 'open' }),
      h(Button, { label: 'Abrir', route: '/hoy' }),
    ])
    await tick()
    expect(host.querySelector('button').className).toContain('12%')
    expect(host.querySelector('a').getAttribute('href')).toBe('/hoy')
  })
})

describe('kit Switch', () => {
  it('turns on a tap, with its label as a row and a check on', async () => {
    const on = ref(false)
    mount(() =>
      h(Switch, {
        modelValue: on.value,
        label: 'Bolsas al cerrar',
        size: 'sm',
        'onUpdate:modelValue': (v) => (on.value = v),
        'data-x': 'uno',
      }),
    )
    const control = host.querySelector('[role="switch"]')
    expect(control.getAttribute('aria-checked')).toBe('false')
    expect(control.dataset.x).toBe('uno')
    // a tap on the label turns it too
    host.querySelector('[data-kit-switch-row] span').click()
    await tick()
    expect(on.value).toBe(true)
    expect(control.getAttribute('aria-checked')).toBe('true')
    expect(control.querySelector('.lucide-check')).not.toBeNull()
    control.click()
    await tick()
    expect(on.value).toBe(false)
  })

  it('does nothing while disabled', async () => {
    const on = ref(false)
    mount(() =>
      h(Switch, {
        modelValue: on.value,
        disabled: true,
        'aria-label': 'Activo',
        'onUpdate:modelValue': (v) => (on.value = v),
      }),
    )
    const control = host.querySelector('[role="switch"]')
    expect(control.getAttribute('aria-label')).toBe('Activo')
    control.click()
    await tick()
    expect(on.value).toBe(false)
  })
})

describe('kit Field', () => {
  it('a filled field with its label inside, an error line and no hint', () => {
    mount(() =>
      h(Field, {
        modelValue: '15',
        label: 'Cambio',
        type: 'money',
        currency: 'EUR',
        error: 'Escribe un número',
      }),
    )
    const input = host.querySelector('input')
    expect(input.getAttribute('inputmode')).toBe('decimal')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(host.querySelector('label').textContent).toContain('Cambio')
    expect(host.textContent).toContain('€')
    const error = host.querySelector('[data-kit-field-error]')
    expect(error.getAttribute('role')).toBe('alert')
    expect(input.getAttribute('aria-describedby')).toBe(error.id)
    expect(host.querySelectorAll('p')).toHaveLength(1)
  })

  it('a number field hands back a number; a select its option', async () => {
    const value = ref('')
    const pick = ref('b')
    mount(() => [
      h(Field, {
        modelValue: value.value,
        type: 'number',
        label: 'Piezas',
        'onUpdate:modelValue': (v) => (value.value = v),
      }),
      h(Field, {
        modelValue: pick.value,
        type: 'select',
        label: 'Tienda',
        options: [
          { value: 'a', label: 'Centro' },
          { value: 'b', label: 'Norte' },
        ],
        'onUpdate:modelValue': (v) => (pick.value = v),
      }),
    ])
    const input = host.querySelector('input')
    input.value = '12'
    input.dispatchEvent(new Event('input'))
    expect(value.value).toBe(12)
    const select = host.querySelector('select')
    select.value = 'a'
    select.dispatchEvent(new Event('change'))
    expect(pick.value).toBe('a')
  })
})

describe('kit ListGroup', () => {
  it('stacks its children as tonal tiles in one rounded group', () => {
    mount(() =>
      h(ListGroup, { tag: 'ul' }, () => [h('li', 'uno'), h('li', 'dos')]),
    )
    const group = host.querySelector('[data-ui-list-group]')
    expect(group.tagName).toBe('UL')
    expect(group.className).toContain('rounded-7')
    expect(group.className).toContain('--muelle-surface-container-low')
    expect(group.querySelectorAll('li')).toHaveLength(2)
  })
})
