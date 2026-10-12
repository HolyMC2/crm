// Agenda page walk with a mocked doco.agenda transport: week view, event card, desktop
// drag-to-select (quick create) and drag-to-reschedule, soft-conflict recovery, the month
// grid, calendars and colors, and the create form's warning override.
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
import { resetAgendaPrefsForTests } from '@/composables/useAgendaPrefs'

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

// Grid geometry: a 700px-wide week (100px a day) with 48px hours from the top.
const realRect = Element.prototype.getBoundingClientRect
function grid() {
  Element.prototype.getBoundingClientRect = function () {
    return {
      left: 0,
      top: 0,
      right: 700,
      bottom: 1152,
      width: 700,
      height: 1152,
      x: 0,
      y: 0,
    }
  }
}
const pointer = (type, x, y, target = window) =>
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      button: 0,
      clientX: x,
      clientY: y,
      pointerType: 'mouse',
    }),
  )

beforeEach(() => {
  calls.length = 0
  localStorage.clear()
  resetAgendaPrefsForTests()
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
  Element.prototype.getBoundingClientRect = realRect
  document.body.innerHTML = ''
})

describe('Agenda page', () => {
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
    expect(document.body.textContent).toContain('Reschedule')
    expect(
      document.body.querySelector('button[aria-label="Copy link"]'),
    ).not.toBeNull()
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
    grid()
    const chip = root.querySelector('.ag-event[data-event-id="EV-1"]')
    // 10:00 on Wednesday (y = 10 h × 48 px) to 10:00 on Thursday (x = day 4 of 7).
    pointer('pointerdown', 250, 480, chip)
    pointer('pointermove', 350, 480)
    await nextTick()
    expect(root.querySelector('.ag-ghost.is-move')).not.toBeNull()
    pointer('pointerup', 350, 480)
    await flush()
    const first = last('move')
    // 10:00 local (16:00Z) on Thursday; one hour long.
    expect(first).toMatchObject({
      source: 'Event',
      name: 'EV-1',
      start: '2026-10-08T16:00:00.000Z',
      end: '2026-10-08T17:00:00.000Z',
      scope: 'single',
      confirm: 0,
    })
    expect(root.textContent).toContain('Ya tienes «Visita»')
    const confirm = [...document.body.querySelectorAll('button')].find((b) =>
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
      (b) =>
        b.textContent.trim() === label ||
        b.getAttribute('aria-label') === label,
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
    expect(
      document.body.querySelector('[aria-label="Event details"]'),
    ).toBeNull()
    pending['EV-1'](DETAIL)
    await flush()
    expect(
      document.body.querySelector('[aria-label="Event details"]'),
    ).toBeNull()
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
    const chip = root.querySelector('.ag-month__item[data-event-id="EV-1"]')
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
    const cell = (date) => root.querySelector(`[data-agenda-date="${date}"]`)
    document.elementsFromPoint = (x) => [
      cell(x < 50 ? '2026-10-07' : '2026-10-21'),
    ]
    pointer('pointerdown', 10, 10, chip)
    pointer('pointermove', 80, 120)
    await nextTick()
    expect(root.querySelector('.ag-month__ghost')).not.toBeNull()
    pointer('pointerup', 80, 120)
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
    document.elementsFromPoint = () => [day]
    pointer('pointerdown', 10, 10, day)
    pointer('pointerup', 10, 10)
    await flush()
    expect(
      document.body.querySelector('input[placeholder="Add title"]'),
    ).not.toBeNull()
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
    expect(root.querySelector('.ag-month__item')).toBeNull()
    expect(root.textContent).toContain('Nothing scheduled')
    const days = [...root.querySelectorAll('.ag-month [data-day]')]
    const seventh = days.find((el) =>
      el.getAttribute('aria-label')?.endsWith('1 events'),
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

  // --- calendar-style interactions (10-12) ------------------------------------------

  it('drag-selects a time range, draws it in the calendar color and saves from the quick card', async () => {
    await mountAt('/agenda?view=week&date=2026-10-07')
    grid()
    const column = root.querySelector('.ag-tg__col[data-date="2026-10-08"]')
    pointer('pointerdown', 350, 14 * 48 + 5, column)
    pointer('pointermove', 350, 15 * 48)
    pointer('pointermove', 350, 16 * 48 - 2)
    await nextTick()
    const ghost = root.querySelector('.ag-ghost')
    expect(ghost).not.toBeNull()
    expect(ghost.style.background).toMatch(/#039be5|rgb\(3, 155, 229\)/)
    expect(ghost.textContent).toContain('2 h')
    pointer('pointerup', 350, 16 * 48 - 2)
    await flush()
    // The range stays drawn while the quick card is open.
    expect(root.querySelector('.ag-ghost')).not.toBeNull()
    const title = document.body.querySelector('input[placeholder="Add title"]')
    title.value = 'Entrega Ana'
    title.dispatchEvent(new Event('input', { bubbles: true }))
    document.body.querySelector('[aria-label="Tomato"]').click()
    await flush()
    document.body
      .querySelector('form.ag-qc')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flush()
    const payload = JSON.parse(last('create').payload)
    expect(payload).toMatchObject({
      title: 'Entrega Ana',
      start: '2026-10-08T20:00:00.000Z',
      end: '2026-10-08T22:00:00.000Z',
      allDay: false,
      color: '#d50000',
    })
  })

  it('a click on an empty slot opens the quick card with the default length', async () => {
    await mountAt('/agenda?view=day&date=2026-10-07')
    grid()
    const column = root.querySelector('.ag-tg__col[data-date="2026-10-07"]')
    pointer('pointerdown', 50, 9 * 48 + 2, column)
    pointer('pointerup', 50, 9 * 48 + 2)
    await flush()
    const inputs = [
      ...document.body.querySelectorAll('.ag-qc input[type="time"]'),
    ]
    expect(inputs.map((input) => input.value)).toEqual(['09:00', '10:00'])
  })

  it('colors events by calendar and shows another calendar when it is turned on', async () => {
    await mountAt('/agenda?view=week&date=2026-10-07')
    expect(
      calls.filter(([m, a]) => m.endsWith('.query') && a.source === 'Turno'),
    ).toHaveLength(0)
    const chip = root.querySelector('.ag-event[data-event-id="EV-1"]')
    expect(chip.style.background).toMatch(/#039be5|rgb\(3, 155, 229\)/)
    const turnos = [...root.querySelectorAll('.ag-side__label')].find((label) =>
      label.textContent.includes('Shifts'),
    )
    turnos.querySelector('input').dispatchEvent(new Event('change'))
    await flush()
    expect(
      calls.filter(([m, a]) => m.endsWith('.query') && a.source === 'Turno'),
    ).toHaveLength(1)
    expect(
      JSON.parse(localStorage.getItem('muelle.agenda.prefs:me')).hidden,
    ).not.toContain('Turno')
  })

  it('shows my pendientes as tasks and marks one done from its card', async () => {
    const base = handler
    handler = (method, args) => {
      if (method === 'doco.pendientes.api.bootstrap') return { enabled: true }
      if (method === 'doco.pendientes.api.queue')
        return args.segment === 'mine'
          ? {
              sections: {
                today: {
                  rows: [
                    {
                      doctype: 'ToDo',
                      name: 'TD-1',
                      date: '2026-10-08',
                      description: 'Llamar a Ana',
                      status: 'Open',
                      modified: 'm1',
                    },
                  ],
                },
              },
            }
          : { rows: [] }
      if (method === 'doco.pendientes.api.complete')
        return { doctype: 'ToDo', name: 'TD-1' }
      return base(method, args)
    }
    await mountAt('/agenda?view=week&date=2026-10-07')
    const bar = root.querySelector('.ag-bar[data-event-id="ToDo:TD-1"]')
    expect(bar.textContent).toContain('Llamar a Ana')
    bar.click()
    await flush()
    buttonNamed('Mark as done').click()
    await flush()
    expect(last('complete')).toMatchObject({
      doctype: 'ToDo',
      name: 'TD-1',
      modified: 'm1',
    })
  })

  it('switches views from the menu and keyboard, and keeps them in the URL', async () => {
    const router = await mountAt('/agenda?view=week&date=2026-10-07')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }))
    await flush()
    expect(router.currentRoute.value.query.view).toBe('month')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }))
    await flush()
    expect(router.currentRoute.value.query.view).toBe('4day')
    expect(root.querySelectorAll('.ag-tg__col')).toHaveLength(4)
  })

  it('finds an event by title on any date and opens it on its day', async () => {
    const base = handler
    handler = (method, args) => {
      if (method === 'frappe.client.get_list')
        return [
          {
            name: 'EV-9',
            subject: 'Congreso dental',
            starts_on: '2026-11-20 09:00:00',
            color: '#8e24aa',
          },
        ]
      return base(method, args)
    }
    const router = await mountAt('/agenda?view=week&date=2026-10-07')
    root.querySelector('button[aria-label="Search events"]').click()
    await flush()
    const input = root.querySelector('input[aria-label="Search events"]')
    input.value = 'congreso'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 300))
    await flush()
    expect(last('get_list')).toMatchObject({
      doctype: 'Event',
      filters: [['subject', 'like', '%congreso%']],
    })
    ;[...root.querySelectorAll('.ag-search__row')][0].click()
    await flush()
    expect(router.currentRoute.value.query).toMatchObject({
      date: '2026-11-20',
      event: 'Event:EV-9',
    })
  })
})
