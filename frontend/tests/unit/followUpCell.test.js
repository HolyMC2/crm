// The inline «Próximo paso» cell: what a rep sees on the row, and what the row
// does when they schedule from it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'

const api = vi.hoisted(() => ({ calls: [], behavior: async () => ({}) }))
const toasts = vi.hoisted(() => ({ success: [], error: [] }))
vi.mock('frappe-ui', () => ({
  call: (...args) => {
    api.calls.push(args)
    return api.behavior(...args)
  },
  toast: {
    success: (m) => toasts.success.push(m),
    error: (m) => toasts.error.push(m),
  },
}))

import FollowUpCell from '@/components/doco/deals/FollowUpCell.vue'

const ACTIVITY = {
  next_activity_task: '77',
  next_activity_at: '2026-09-16 09:15:00',
  next_activity_title: 'Confirmar entrega',
  next_activity_type: 'Call',
}
const DEAL = { name: 'CRM-DEAL-2026-00042', deal_name: 'Pantalla iPhone 13', deal_owner: 'ana@example.invalid' }

const mounted = []
const saved = []
const rowClicks = { count: 0 }

function mount(row) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const rowRef = ref({ ...row })
  const app = createApp(
    defineComponent({
      setup: () => () =>
        // a stand-in for the list row: clicking it opens the deal, which the
        // cell must not trigger
        h('div', { onClick: () => (rowClicks.count += 1) }, [
          h(FollowUpCell, {
            row: rowRef.value,
            today: '2026-09-15',
            onSaved: (activity) => saved.push(activity),
          }),
        ]),
    }),
  )
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  mounted.push({ app, el })
  return { el, row: rowRef }
}

const panel = () => document.querySelector('[role="dialog"]')
const button = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(text))
const type = (input, value) => {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
async function flush() {
  for (let i = 0; i < 6; i += 1) await Promise.resolve()
  await nextTick()
}

beforeEach(() => {
  api.calls = []
  toasts.success = []
  toasts.error = []
  saved.length = 0
  rowClicks.count = 0
  api.behavior = async (method) => (method === 'frappe.client.get_value' ? { ...ACTIVITY } : { name: '77' })
})
afterEach(() => {
  mounted.splice(0).forEach(({ app, el }) => {
    app.unmount()
    el.remove()
  })
})

describe('the follow-up cell on the row', () => {
  it('says a deal has no follow-up and names the deal for a screen reader', () => {
    const { el } = mount(DEAL)
    const trigger = el.querySelector('button[aria-haspopup="dialog"]')
    expect(trigger.textContent).toContain('Sin seguimiento')
    expect(trigger.getAttribute('aria-label')).toBe('Programar seguimiento de Pantalla iPhone 13')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('distinguishes a task that exists but carries no date', () => {
    const { el } = mount({ ...DEAL, next_activity_task: '77', next_activity_title: 'Llamar' })
    expect(el.querySelector('button[aria-haspopup="dialog"]').textContent).toContain('Pendiente sin fecha')
  })

  it('opens the popover without opening the deal behind it', async () => {
    const { el } = mount(DEAL)
    el.querySelector('button[aria-haspopup="dialog"]').click()
    await nextTick()
    expect(panel()).toBeTruthy()
    expect(rowClicks.count).toBe(0)
  })

  it('offers the site’s today, not the browser’s, as the default and as shortcuts', async () => {
    const { el } = mount(DEAL)
    el.querySelector('button[aria-haspopup="dialog"]').click()
    await nextTick()
    expect(panel().querySelector('input[type="date"]').value).toBe('2026-09-15')
    button(panel(), 'En 3 d').click()
    await nextTick()
    expect(panel().querySelector('input[type="date"]').value).toBe('2026-09-18')
  })

  it('refuses an empty title and writes nothing', async () => {
    const { el } = mount(DEAL)
    el.querySelector('button[aria-haspopup="dialog"]').click()
    await nextTick()
    type(panel().querySelector('input[type="text"]'), '   ')
    button(panel(), 'Guardar').click()
    await flush()
    expect(api.calls).toEqual([])
    expect(panel().querySelector('[role="alert"]').textContent).toContain('Escribe qué sigue')
  })

  it('creates the task, updates the row from the derived fields and closes', async () => {
    const { el, row } = mount(DEAL)
    el.querySelector('button[aria-haspopup="dialog"]').click()
    await nextTick()
    type(panel().querySelector('input[type="text"]'), 'Confirmar entrega')
    type(panel().querySelector('input[type="date"]'), '2026-09-16')
    type(panel().querySelector('input[type="time"]'), '09:15')
    button(panel(), 'Llamada').click()
    await nextTick()
    button(panel(), 'Guardar').click()
    await flush()

    expect(api.calls[0][0]).toBe('frappe.client.insert')
    expect(api.calls[0][1].doc).toMatchObject({
      doctype: 'CRM Task',
      reference_docname: 'CRM-DEAL-2026-00042',
      assigned_to: 'ana@example.invalid',
      activity_type: 'Call',
      title: 'Confirmar entrega',
      due_date: '2026-09-16 09:15:00',
    })
    expect(saved).toEqual([ACTIVITY])
    expect(panel()).toBeFalsy()
    // the row now reads the scheduled activity without a list reload
    Object.assign(row.value, saved[0])
    await nextTick()
    expect(el.textContent).toContain('Confirmar entrega')
  })

  it('reschedules the task the deal already points at', async () => {
    const { el } = mount({ ...DEAL, ...ACTIVITY })
    el.querySelector('button[aria-haspopup="dialog"]').click()
    await nextTick()
    expect(panel().querySelector('input[type="text"]').value).toBe('Confirmar entrega')
    expect(panel().querySelector('input[type="date"]').value).toBe('2026-09-16')
    expect(panel().querySelector('input[type="time"]').value).toBe('09:15')
    button(panel(), 'Guardar').click()
    await flush()
    expect(api.calls[0][0]).toBe('frappe.client.set_value')
    expect(api.calls[0][1]).toMatchObject({ doctype: 'CRM Task', name: '77' })
  })

  it('keeps the draft and explains a refused write', async () => {
    api.behavior = async () => {
      throw { messages: ['No tienes permiso para editar la tarea'] }
    }
    const { el } = mount(DEAL)
    el.querySelector('button[aria-haspopup="dialog"]').click()
    await nextTick()
    type(panel().querySelector('input[type="text"]'), 'Confirmar entrega')
    button(panel(), 'Guardar').click()
    await flush()
    expect(panel()).toBeTruthy()
    expect(panel().querySelector('[role="alert"]').textContent).toContain('No tienes permiso')
    expect(saved).toEqual([])
  })

  it('closes on Escape and returns focus to the cell', async () => {
    const { el } = mount(DEAL)
    const trigger = el.querySelector('button[aria-haspopup="dialog"]')
    trigger.click()
    await nextTick()
    panel().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(panel()).toBeFalsy()
    expect(document.activeElement).toBe(trigger)
  })
})
