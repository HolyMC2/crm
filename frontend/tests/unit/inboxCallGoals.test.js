// Bandeja › Servicio: the call goals sit beside the reply goals, and only where the
// server has them (CRM Inbox Settings call_callback_minutes / call_pickup_goal, S47).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'

vi.mock('frappe-ui', () => ({
  FormControl: {
    props: ['label', 'modelValue'],
    setup: (props) => () =>
      h(
        'label',
        { 'data-field': '' },
        `${props.label}: ${props.modelValue ?? ''}`,
      ),
  },
}))
vi.mock('@/components/Controls/Link.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/Settings/Inbox/WeekHours.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/Settings/Inbox/SettingSwitch.vue', () => ({
  default: { render: () => null },
}))

import InboxService from '@/components/Settings/Inbox/InboxService.vue'

const cleanups = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

async function fields(doc) {
  const el = document.createElement('div')
  document.body.append(el)
  const app = createApp({
    render: () => h(InboxService, { doc: reactive(doc) }),
  })
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  await nextTick()
  return [...el.querySelectorAll('[data-field]')].map(
    (node) => node.textContent,
  )
}

describe('call goals in the inbox service settings', () => {
  it('shows the call-back time and the pickup goal beside the reply goals', async () => {
    const shown = await fields({
      first_response_minutes: 15,
      resolution_hours: 24,
      call_callback_minutes: 30,
      call_pickup_goal: 80,
    })
    expect(shown).toContain('Return a missed call within (minutes): 30')
    expect(shown).toContain('Calls picked up goal (%): 80')
    expect(shown.indexOf('Close within (hours): 24')).toBeLessThan(
      shown.indexOf('Return a missed call within (minutes): 30'),
    )
  })

  it('leaves them out on a server without them', async () => {
    const shown = await fields({
      first_response_minutes: 15,
      resolution_hours: 24,
    })
    expect(shown.join('\n')).not.toMatch(/missed call|picked up/)
  })
})
