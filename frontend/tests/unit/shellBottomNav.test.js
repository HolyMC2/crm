// The phone bottom bar (Shell program S1.2): «Más» is lit while the page is a
// module the bar does not hold. Mounted with its real template; assertions are
// on ARIA state (SPEC D7), not on Tailwind classes.
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h } from 'vue'
import ShellBottomNav from '@/components/shell/ShellBottomNav.vue'

// RouterLink is a plain anchor here: the test is about which tab is lit.
const RouterLink = {
  props: ['to'],
  setup(props, { slots, attrs }) {
    return () => h('a', { href: props.to, ...attrs }, slots.default?.())
  },
}
const bar = [
  { key: 'hoy', label: 'Hoy', icon: 'lucide-house', to: '/hoy' },
  {
    key: 'contactos',
    label: 'Contactos',
    icon: 'lucide-users',
    to: '/contactos',
  },
]

let app
let host
afterEach(() => {
  app?.unmount()
  host?.remove()
})

function mountNav(active) {
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({
    render: () => h(ShellBottomNav, { slots: bar, active }),
  })
  app.config.globalProperties.__ = globalThis.__
  app.component('RouterLink', RouterLink)
  app.mount(host)
  return host
}

describe('ShellBottomNav «Más»', () => {
  it('a bar module is current and «Más» is not lit', () => {
    const root = mountNav('contactos')
    const current = root.querySelector('[aria-current="page"]')
    expect(current.textContent).toContain('Contactos')
    expect(root.querySelector('button').getAttribute('aria-current')).toBeNull()
  })

  it('a module from «Más» lights «Más» and no bar tab', () => {
    const root = mountNav('cobranza')
    const more = root.querySelector('button')
    expect(more.getAttribute('aria-current')).toBe('page')
    expect(root.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
    expect(root.querySelector('a[aria-current]')).toBeNull()
  })

  it('no active module lights nothing', () => {
    const root = mountNav('')
    expect(root.querySelector('[aria-current]')).toBeNull()
  })
})
