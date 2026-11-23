// The phone bottom bar (Shell program S1.2): «Más» is lit while the page is a
// module the bar does not hold. Mounted with its real template; assertions are
// on ARIA state (SPEC D7), not on Tailwind classes.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
vi.mock('frappe-ui', () => ({ call: vi.fn(async () => ({})) }))
import { call } from 'frappe-ui'
import ShellBottomNav from '@/components/shell/ShellBottomNav.vue'
import { railCounts, resetRailCountsForTests } from '@/composables/shellRail'

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
  resetRailCountsForTests()
})

function mountNav(active, modules = []) {
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({
    render: () => h(ShellBottomNav, { slots: bar, active, modules }),
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

// The staff queue's «14» showed on the desktop rail only: a phone mounts no
// rail. The bar reads the same counts, on its tabs and summed on «Más».
describe('ShellBottomNav counts', () => {
  const modules = [
    ...bar,
    { key: 'ventas', label: 'Ventas', icon: 'lucide-inbox', to: '/ventas' },
    { key: 'pendientes', label: 'Pendientes', icon: 'lucide-check', to: '/p' },
    { key: 'avisos', label: 'Avisos', icon: 'lucide-bell', to: '/avisos' },
  ]

  it('reads the counts itself when it mounts', async () => {
    mountNav('hoy', modules)
    await nextTick()
    expect(call).toHaveBeenCalledWith('crm.api.shell.rail_counts')
  })

  it('a bar module shows what waits in it', async () => {
    call.mockResolvedValueOnce({ contactos: { count: 3, urgent: false } })
    const root = mountNav('hoy', modules)
    await vi.waitFor(() =>
      expect(root.querySelectorAll('[data-bar-count]')).toHaveLength(1),
    )
    const tab = root.querySelector('a[href="/contactos"]')
    expect(tab.querySelector('[data-bar-count]').textContent).toBe('3')
  })

  it('«Más» adds up the modules the bar leaves out, never Avisos', async () => {
    call.mockResolvedValueOnce({
      ventas: { count: 14, urgent: false },
      pendientes: { count: 2, urgent: true },
      avisos: { count: 9, urgent: false },
    })
    const root = mountNav('hoy', modules)
    const more = root.querySelector('button')
    await vi.waitFor(() =>
      expect(more.querySelector('[data-bar-count]')?.textContent).toBe('16'),
    )
    expect(more.textContent).toContain('· 16')
    expect(more.querySelector('[data-bar-count]').className).toContain(
      'bg-surface-red-7',
    )
    expect(railCounts.value.ventas.count).toBe(14)
  })
})
