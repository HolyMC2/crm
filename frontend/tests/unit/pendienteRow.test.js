// A Pendientes row reads like Google Tasks: people by name (never a login),
// the source chip only where sources mix, and the row menu reachable on a phone.
import { describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

vi.mock('vue-router', async () => {
  const { h } = await import('vue')
  return {
    RouterLink: {
      props: ['to'],
      setup:
        (_p, { slots, attrs }) =>
        () =>
          h('a', attrs, slots.default?.()),
    },
  }
})
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    Button: {
      props: ['icon'],
      setup:
        (_p, { attrs }) =>
        () =>
          h('button', attrs),
    },
    Dropdown: {
      setup:
        (_p, { slots }) =>
        () =>
          h('div', { 'data-menu': '' }, slots.default?.()),
    },
    FeatherIcon: { render: () => null },
  }
})

import PendienteRow from '@/components/pendientes/PendienteRow.vue'

globalThis.__ ??= (text, args = []) =>
  text.replace(/\{(\d+)\}/g, (_m, i) => args[i] ?? '')

function mount(props) {
  const el = document.createElement('div')
  const app = createApp({ render: () => h(PendienteRow, props) })
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  return { el, app }
}

const base = {
  doctype: 'CRM Task',
  name: '1079',
  description: 'Dar seguimiento',
  date: null,
  status: 'Open',
  group: 'undated',
  reference_type: 'CRM Deal',
  reference_name: 'CRM-DEAL-2026-00001',
  reference_label: 'Ana López',
}

describe('PendienteRow', () => {
  it('names the assignee of team work, never by e-mail, without a source chip', async () => {
    const { el, app } = mount({
      row: {
        ...base,
        mine: false,
        assigned_to: 'jeydici01@gmail.com',
        assigned_to_name: 'Jeydi Díaz',
      },
      showAssignee: true,
    })
    await nextTick()
    expect(el.textContent).toContain('Assigned to Jeydi Díaz')
    expect(el.textContent).not.toContain('@')
    expect(el.textContent).not.toContain('Sales task')
    expect(el.textContent).toContain('JD')
    app.unmount()
  })

  it('falls back to a name built from the login', async () => {
    const { el, app } = mount({
      row: { ...base, mine: false, assigned_to: 'rosa.magana@example.com' },
      showAssignee: true,
    })
    await nextTick()
    expect(el.textContent).toContain('Assigned to Rosa Magana')
    app.unmount()
  })

  it('offers its own work a round check and the row menu at every width', async () => {
    const { el, app } = mount({ row: { ...base, mine: true } })
    await nextTick()
    const check = el.querySelector('[role="checkbox"]')
    expect(check).not.toBeNull()
    expect(check.getAttribute('aria-checked')).toBe('false')
    const menu = el.querySelector('[data-menu]').parentElement
    expect(menu.className).not.toMatch(/(^|\s)hidden(\s|$)/)
    app.unmount()
  })
})
