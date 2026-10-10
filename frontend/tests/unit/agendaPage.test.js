// Agenda page walk with a mocked doco.agenda transport: week view, event panel, desktop
// drag-to-reschedule, soft-conflict recovery and the create form's warning override.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const calls = []
let handler
vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  call: vi.fn((method, args) => {
    calls.push([method, args])
    return Promise.resolve(handler(method, args))
  }),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

import Agenda from '@/pages/Agenda.vue'
import { pageShortcuts } from '@/composables/shellKeyboard'

const TZ = 'America/Mexico_City'
const event = (id, start, end, extra = {}) => ({
  id,
  source: 'Event',
  title: `Cita ${id}`,
  start,
  end,
  timeZone: TZ,
  resourceIds: ['ana@example.test'],
  status: 'Scheduled',
  version: '2026-10-05 08:00:00.000001',
  draggable: true,
  actions: [],
  canEdit: true,
  kind: 'event',
  ...extra,
})
// Router navigation and the drag layer's click guard settle on a macrotask.
const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
const methods = () => calls.map(([method]) => method.split('.').pop())
const last = (name) => calls.filter(([m]) => m.endsWith(`.${name}`)).at(-1)?.[1]

let app
let root
async function mountAt(path) {
  const router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [{ path: '/agenda', component: Agenda }],
  })
  router.push(path)
  await router.isReady()
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp(Agenda)
  app.use(router)
  app.config.globalProperties.__ = window.__
  app.mount(root)
  await flush()
  return router
}

beforeEach(() => {
  calls.length = 0
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (match, i) => values?.[i] ?? match)
  window.timezone = { system: TZ }
  window.innerWidth = 1440
  window.dispatchEvent(new Event('resize'))
  handler = (method) => {
    if (method === 'crm.api.agenda.get_capabilities')
      return {
        enabled: true,
        user_time_zone: TZ,
        sources: [
          { key: 'Event', enabled: true, timeZone: TZ, canCreate: true },
          { key: 'Turno', enabled: true, timeZone: TZ, readOnly: true },
        ],
      }
    if (method.endsWith('.query'))
      return {
        timeZone: TZ,
        resources: [],
        events: [event('EV-1', '2026-10-07T16:00:00Z', '2026-10-07T17:00:00Z')],
      }
    if (method.endsWith('.detail'))
      return {
        ...event('EV-1', '2026-10-07T16:00:00Z', '2026-10-07T17:00:00Z'),
        organizer: { user: 'ana@example.test', name: 'Ana', me: true },
        attendees: [],
        reminders: [],
        description: '',
        repeat: { on: '', till: '' },
        visibility: 'private',
      }
    return {}
  }
})
afterEach(() => {
  app?.unmount()
  root?.remove()
})

describe('Agenda page', () => {
  it('declares its t/d/w/m/l/j/k/c keys for the Alt+H sheet while it is open', async () => {
    const router = await mountAt('/agenda?view=week&date=2026-10-07')
    expect(pageShortcuts.value.contexts).toEqual([])
    expect(pageShortcuts.value.extra.map((s) => [s.id, s.keys.join()])).toEqual(
      [
        ['agenda.create', 'c'],
        ['agenda.today', 't'],
        ['agenda.day', 'd'],
        ['agenda.week', 'w'],
        ['agenda.month', 'm'],
        ['agenda.list', 'l'],
        ['agenda.next', 'j'],
        ['agenda.prev', 'k'],
      ],
    )
    // Declared keys are the ones the page answers: «d» opens the day view.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }))
    await flush()
    expect(router.currentRoute.value.query.view).toBe('day')
    app.unmount()
    app = null
    expect(pageShortcuts.value.extra).toEqual([])
  })

  it('loads only the selected calendars for the URL week', async () => {
    await mountAt('/agenda?view=week&date=2026-10-07')
    expect(methods()).toContain('get_capabilities')
    const query = last('query')
    expect(query.source).toBe('Event')
    // Monday–Sunday in the business zone.
    expect(query.start).toBe('2026-10-05T06:00:00.000Z')
    expect(calls.filter(([m]) => m.endsWith('.query'))).toHaveLength(1)
    expect(root.querySelector('[data-event-id="EV-1"]')).not.toBeNull()
  })

  it('opens the panel from a chip and loads the detail', async () => {
    const router = await mountAt('/agenda?view=week&date=2026-10-07')
    root.querySelector('[data-event-id="EV-1"]').click()
    await flush()
    expect(router.currentRoute.value.query.event).toBe('Event:EV-1')
    expect(last('detail')).toEqual({ source: 'Event', name: 'EV-1' })
    expect(root.textContent).toContain('Reschedule')
  })

  it('drags to a slot, offers «Schedule anyway» on a warning and resends with confirm', async () => {
    await mountAt('/agenda?view=week&date=2026-10-07')
    let moves = 0
    const base = handler
    handler = (method, args) => {
      if (method.endsWith('.move')) {
        moves++
        return moves === 1
          ? {
              constraints: [
                {
                  code: 'overlap',
                  message: 'Ya tienes «Visita»',
                  severity: 'warn',
                },
              ],
            }
          : event('EV-1', args.start, args.end)
      }
      return base(method, args)
    }
    const chip = root.querySelector('[data-event-id="EV-1"]')
    const column = root.querySelector(
      '[data-mc-selection-column][data-date="2026-10-08"]',
    )
    const slot = column.querySelector('[data-mc-slot-index="6"]')
    document.elementsFromPoint = () => [slot, column]
    chip.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: 10,
        clientY: 10,
        pointerType: 'mouse',
      }),
    )
    window.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 60, clientY: 90 }),
    )
    window.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 60, clientY: 90 }),
    )
    await flush()
    const first = last('move')
    // Slot 6 from 7:00 is 10:00 local (16:00Z) on Thursday; one hour long.
    expect(first).toMatchObject({
      source: 'Event',
      name: 'EV-1',
      start: '2026-10-08T16:00:00.000Z',
      end: '2026-10-08T17:00:00.000Z',
      scope: 'single',
      confirm: 0,
    })
    expect(root.textContent).toContain('Ya tienes «Visita»')
    const confirm = [...root.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Schedule anyway'),
    )
    confirm.click()
    await flush()
    expect(last('move')).toMatchObject({
      confirm: 1,
      start: '2026-10-08T16:00:00.000Z',
    })
    expect(moves).toBe(2)
  })

  it('opens the create form from record context and carries the link', async () => {
    const router = await mountAt(
      '/agenda?view=week&date=2026-10-07&create=1&ref_doctype=CRM%20Deal&ref_name=D-1&ref_label=Trato%20Ana&return_to=%2Fcrm%2Fdeals%2FD-1&return_label=Trato',
    )
    expect(router.currentRoute.value.query.create).toBeUndefined()
    expect(router.currentRoute.value.query.return_to).toBe('/crm/deals/D-1')
    expect(document.body.textContent).toContain('Trato Ana')
    expect(root.textContent).toContain('Back to Trato')
  })

  it('defaults to the agenda list on a phone and opens the event in a sheet', async () => {
    window.innerWidth = 390
    window.dispatchEvent(new Event('resize'))
    const router = await mountAt('/agenda?date=2026-10-07')
    expect(root.textContent).toContain('Cita EV-1')
    expect(root.textContent).toContain('Nothing scheduled')
    expect(root.querySelector('.mc-calendar')).toBeNull()
    const row = [...root.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Cita EV-1'),
    )
    row.click()
    await flush()
    expect(router.currentRoute.value.query.event).toBe('Event:EV-1')
    expect(document.body.textContent).toContain('Reschedule')
  })

  // --- review 2026-10-05: edits keep what the worker did not change -----------------

  const DETAIL = {
    ...event('EV-1', '2026-10-07T16:00:00Z', '2026-10-07T17:00:00Z'),
    source: 'Event',
    organizer: { user: 'ana@example.test', name: 'Ana', me: true },
    description: 'Llevar catálogo',
    location: 'Mostrador',
    attendees: [
      {
        doctype: 'User',
        name: 'luis@example.test',
        label: 'Luis',
        email: 'luis@example.test',
      },
      {
        doctype: 'Contact',
        name: '',
        label: 'guest@example.test',
        email: 'guest@example.test',
      },
    ],
    reminders: [
      { type: 'Email', before: 10, interval: 'minutes' },
      { type: 'Notification', before: 1, interval: 'hours' },
    ],
    reference: { doctype: 'CRM Deal', name: 'D-1', label: 'Trato Ana' },
    repeat: { on: '', till: '', days: [] },
    visibility: 'public',
  }
  const buttonNamed = (label) =>
    [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === label,
    )
  const titleInput = () =>
    document.body.querySelector('input[placeholder="Call, visit, delivery…"]')
  function type(input, value) {
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  async function saveForm() {
    document.body
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flush()
  }
  function withDetail(detailFn, update = () => event('EV-1', 'a', 'b')) {
    const base = handler
    handler = (method, args) => {
      if (method.endsWith('.detail')) return detailFn(args)
      if (method.endsWith('.update')) return update(args)
      return base(method, args)
    }
  }

  it('waits for the event detail before editing and keeps every native field', async () => {
    let release
    withDetail(() => new Promise((resolve) => (release = resolve)))
    await mountAt('/agenda?view=week&date=2026-10-07&event=Event:EV-1')
    buttonNamed('Edit').click()
    await flush()
    // No form built from the bare calendar row while the detail is on its way.
    expect(titleInput()).toBeNull()
    release(DETAIL)
    await flush()
    expect(titleInput().value).toBe('Cita EV-1')
    type(titleInput(), 'Visita con catálogo')
    await saveForm()
    const payload = JSON.parse(last('update').payload)
    expect(payload.title).toBe('Visita con catálogo')
    expect(payload.description).toBe('Llevar catálogo')
    expect(payload.visibility).toBe('public')
    expect(payload.reference).toEqual({ doctype: 'CRM Deal', name: 'D-1' })
    // Untouched reminders and invitations are not rewritten.
    expect(payload.reminders ?? DETAIL.reminders).toEqual(DETAIL.reminders)
    expect('attendees' in payload).toBe(false)
  })

  it('offers a retry when the event detail fails and edits once it loads', async () => {
    let fail = true
    withDetail(() => {
      if (fail) return Promise.reject(new Error('Network down'))
      return DETAIL
    })
    await mountAt('/agenda?view=week&date=2026-10-07&event=Event:EV-1')
    buttonNamed('Edit').click()
    await flush()
    expect(titleInput()).toBeNull()
    fail = false
    const retry = [...document.body.querySelectorAll('button')].filter((b) =>
      b.textContent.includes('Try again'),
    )
    expect(retry.length).toBeGreaterThan(0)
    retry.at(-1).click()
    await flush()
    expect(titleInput()?.value).toBe('Cita EV-1')
  })

  it('ignores a detail that arrives for an event no longer selected', async () => {
    const pending = {}
    withDetail(
      ({ name }) => new Promise((resolve) => (pending[name] = resolve)),
    )
    const router = await mountAt(
      '/agenda?view=week&date=2026-10-07&event=Event:EV-1',
    )
    await router.replace({
      query: { ...router.currentRoute.value.query, event: '' },
    })
    await flush()
    expect(root.querySelector('[aria-label="Event details"]')).toBeNull()
    pending['EV-1'](DETAIL)
    await flush()
    expect(root.querySelector('[aria-label="Event details"]')).toBeNull()
  })

  it('keeps several reminders unless the worker picks another one', async () => {
    withDetail(() => DETAIL)
    await mountAt('/agenda?view=week&date=2026-10-07&event=Event:EV-1')
    buttonNamed('Edit').click()
    await flush()
    await saveForm()
    const payload = JSON.parse(last('update').payload)
    expect(payload.reminders ?? DETAIL.reminders).toEqual(DETAIL.reminders)
  })

  it('keeps email-only invitations when another attendee changes', async () => {
    withDetail(() => DETAIL)
    await mountAt('/agenda?view=week&date=2026-10-07&event=Event:EV-1')
    buttonNamed('Edit').click()
    await flush()
    document.body.querySelector('button[aria-label="Remove Luis"]').click()
    await flush()
    await saveForm()
    const payload = JSON.parse(last('update').payload)
    expect(payload.attendees).toEqual([{ email: 'guest@example.test' }])
  })

  it('resolves «series_weekday» by choosing the weekdays in the form', async () => {
    const series = {
      ...DETAIL,
      id: 'EV-1@2026-10-07',
      seriesId: 'EV-1',
      repeat: { on: 'weekly', till: '', days: ['monday', 'wednesday'] },
    }
    const base = handler
    handler = (method, args) => {
      if (method.endsWith('.query'))
        return { timeZone: TZ, resources: [], events: [series] }
      if (method.endsWith('.detail')) return series
      if (method.endsWith('.update')) {
        const payload = JSON.parse(args.payload)
        return payload.repeatDays
          ? { ...series, id: 'EV-1@2026-10-08' }
          : {
              constraints: [
                {
                  code: 'series_weekday',
                  message: 'This series repeats on several weekdays.',
                  severity: 'block',
                },
              ],
            }
      }
      return base(method, args)
    }
    await mountAt(
      '/agenda?view=week&date=2026-10-07&event=Event:EV-1@2026-10-07',
    )
    buttonNamed('Edit').click()
    await flush()
    await saveForm()
    expect(document.body.textContent).toContain(
      'This series repeats on several weekdays.',
    )
    buttonNamed('Edit series').click()
    await flush()
    const day = (name) =>
      document.body.querySelector(`button[data-weekday="${name}"]`)
    expect(day('monday').getAttribute('aria-pressed')).toBe('true')
    day('monday').click()
    day('thursday').click()
    await flush()
    await saveForm()
    const payload = JSON.parse(last('update').payload)
    expect(payload.repeat).toBe('weekly')
    expect(payload.repeatDays).toEqual(['wednesday', 'thursday'])
    expect(document.body.querySelector('form')).toBeNull()
  })

  it('returns to a sibling app with a plain link, and to CRM with the router', async () => {
    await mountAt(
      '/agenda?view=week&date=2026-10-07&return_to=%2Ftaller%2Forden%2FRO-1&return_label=Taller',
    )
    const back = [...root.querySelectorAll('a')].find((a) =>
      a.textContent.includes('Back to Taller'),
    )
    expect(back.getAttribute('href')).toBe('/taller/orden/RO-1')
    app.unmount()
    root.remove()
    await mountAt(
      '/agenda?view=week&date=2026-10-07&return_to=%2Fcrm%2Fdeals%2FD-1&return_label=Trato',
    )
    const crm = [...root.querySelectorAll('a')].find((a) =>
      a.textContent.includes('Back to Trato'),
    )
    expect(crm.getAttribute('href')).toBe('/crm/deals/D-1')
  })

  // --- month view (10-08) ------------------------------------------------------------

  it('draws the month from one query and drags a chip to another day', async () => {
    await mountAt('/agenda?view=month&date=2026-10-07')
    const queries = calls.filter(([m]) => m.endsWith('.query'))
    expect(queries).toHaveLength(1)
    // Monday 28 Sep to Sunday 8 Nov in the business zone.
    expect(queries[0][1].start).toBe('2026-09-28T06:00:00.000Z')
    expect(queries[0][1].end).toBe('2026-11-09T06:00:00.000Z')
    const chip = root.querySelector('.agenda-month [data-event-id="EV-1"]')
    expect(chip).not.toBeNull()
    let moved = null
    const base = handler
    handler = (method, args) => {
      if (method.endsWith('.move')) {
        moved = args
        return event('EV-1', args.start, args.end)
      }
      return base(method, args)
    }
    const target = root.querySelector('[data-agenda-date="2026-10-21"]')
    document.elementsFromPoint = () => [target]
    chip.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: 10,
        clientY: 10,
        pointerType: 'mouse',
      }),
    )
    window.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 80, clientY: 120 }),
    )
    window.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 80, clientY: 120 }),
    )
    await flush()
    expect(moved).toMatchObject({
      name: 'EV-1',
      start: '2026-10-21T16:00:00.000Z',
      end: '2026-10-21T17:00:00.000Z',
      scope: 'single',
      confirm: 0,
    })
  })

  it('creates on the clicked month day and opens a day from its number', async () => {
    const router = await mountAt('/agenda?view=month&date=2026-10-07')
    const day = root.querySelector('[data-agenda-date="2026-10-15"]')
    day.querySelector('button[aria-label^="Schedule on"]').click()
    await flush()
    expect(titleInput()).not.toBeNull()
    root
      .querySelector(
        '[data-agenda-date="2026-10-16"] button[aria-label^="Open"]',
      )
      .click()
    await flush()
    expect(router.currentRoute.value.query).toMatchObject({
      view: 'day',
      date: '2026-10-16',
    })
  })

  it('on a phone shows the tapped day below the month and a second tap schedules', async () => {
    window.innerWidth = 390
    window.dispatchEvent(new Event('resize'))
    const router = await mountAt('/agenda?view=month&date=2026-10-01')
    expect(root.querySelector('.agenda-month [data-event-id]')).toBeNull()
    expect(root.textContent).toContain('Nothing scheduled')
    const days = [...root.querySelectorAll('.agenda-month [data-day]')]
    const seventh = days.find((el) =>
      el.getAttribute('aria-label')?.endsWith('1 event'),
    )
    seventh.click()
    await flush()
    expect(router.currentRoute.value.query.date).toBe('2026-10-07')
    expect(root.textContent).toContain('Cita EV-1')
    expect(calls.filter(([m]) => m.endsWith('.query'))).toHaveLength(1)
    seventh.click()
    await flush()
    expect(titleInput()).not.toBeNull()
  })
})
