// Agenda page walk with a mocked doco.agenda transport: week view, event card, desktop
// drag-to-select (quick create) and drag-to-reschedule, soft-conflict recovery, the month
// grid, calendars and colors, and the create form's warning override.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
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
import { pageShortcuts, useShellKeyboard } from '@/composables/shellKeyboard'

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
async function mountAt(path, { shell = false } = {}) {
  const router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [{ path: '/agenda', component: Agenda }],
  })
  router.push(path)
  await router.isReady()
  root = document.createElement('div')
  document.body.appendChild(root)
  // `shell`: the shell's keyboard listener too, as inside MuelleShell.
  app = shell
    ? createApp({
        setup() {
          useShellKeyboard({
            openPalette() {},
            openHelp() {},
            modules: ref([]),
            router,
          })
          return () => h(Agenda)
        },
      })
    : createApp(Agenda)
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

  it('«c» inside the shell opens the event form once, without the shell’s ?create=1', async () => {
    const router = await mountAt('/agenda?view=week&date=2026-10-07', {
      shell: true,
    })
    expect(pageShortcuts.value.ids).toEqual(['create'])
    const event = new KeyboardEvent('keydown', {
      key: 'c',
      bubbles: true,
      cancelable: true,
    })
    document.body.dispatchEvent(event)
    await flush()
    expect(event.defaultPrevented).toBe(true)
    expect(
      document.body.querySelectorAll(
        'input[placeholder="Call, visit, delivery…"]',
      ),
    ).toHaveLength(1)
    expect(router.currentRoute.value.query.create).toBeUndefined()
  })

  it('names the business time zone in words when the worker is in another zone', async () => {
    const business = handler
    handler = (method, args) => {
      const answer = business(method, args)
      return method === 'crm.api.agenda.get_capabilities'
        ? { ...answer, user_time_zone: 'Europe/Madrid' }
        : answer
    }
    await mountAt('/agenda?view=day&date=2026-10-07')
    const note = [...root.querySelectorAll('p')].find((p) =>
      p.textContent.includes('business time zone'),
    )
    expect(note.textContent).not.toContain(TZ)
    expect(note.textContent).toMatch(/business time zone: \S/)
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
    // The phone schedule: the date on the left, each event a pill with its time.
    const day = root.querySelector('.ag-sch__day[data-day="2026-10-07"]')
    expect(day.querySelector('.ag-sch__num').textContent.trim()).toBe('7')
    expect(root.querySelector('.ag-sch__day[data-day="2026-10-08"]')).toBeNull()
    expect(root.querySelector('.mc-calendar')).toBeNull()
    // Two weeks load at once on a phone.
    expect(
      Date.parse(last('query').end) - Date.parse(last('query').start),
    ).toBe(14 * 86400000)
    const row = root.querySelector('.ag-sch__pill[data-event-id="EV-1"]')
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

  it('on a phone fills the month with colored chips and a tapped day opens it', async () => {
    window.innerWidth = 390
    window.dispatchEvent(new Event('resize'))
    const router = await mountAt('/agenda?view=month&date=2026-10-01')
    const chip = root.querySelector('.ag-month__chip')
    expect(chip.textContent).toContain('Cita EV-1')
    expect(chip.style.background).toMatch(/#039be5|rgb\(3, 155, 229\)/)
    root.querySelector('.ag-month [data-day="2026-10-07"]').click()
    await flush()
    expect(router.currentRoute.value.query).toMatchObject({
      view: 'day',
      date: '2026-10-07',
    })
  })

  it('on a phone the drawer lists the views and the title opens a month strip', async () => {
    window.innerWidth = 390
    window.dispatchEvent(new Event('resize'))
    const router = await mountAt('/agenda?view=month&date=2026-10-07')
    expect(root.querySelector('.ag-ptitle').textContent).toContain('October')
    root.querySelector('.ag-ptitle').click()
    await flush()
    const months = [...root.querySelectorAll('.ag-strip__month')]
    months.find((b) => b.dataset.month === '2026-12').click()
    await flush()
    expect(router.currentRoute.value.query.date).toBe('2026-12-01')
    root.querySelector('button[aria-label="Main menu"]').click()
    await flush()
    const views = [...document.body.querySelectorAll('.ag-drawer__item')]
    expect(views.map((b) => b.textContent.trim())).toEqual(
      expect.arrayContaining([
        'Schedule view',
        'Day',
        '3 days',
        'Week',
        'Month',
      ]),
    )
    views.find((b) => b.textContent.trim() === '3 days').click()
    await flush()
    expect(router.currentRoute.value.query.view).toBe('3day')
    expect(root.querySelectorAll('.ag-tg__dayhead')).toHaveLength(3)
    // The drawer slides away (its leave transition) once a view is picked.
    await new Promise((resolve) => setTimeout(resolve, 320))
    expect(document.body.querySelector('.ag-drawer')).toBeNull()
  })

  it('gives every doctor and technician their own calendar to filter by', async () => {
    const base = handler
    handler = (method, args) => {
      if (method === 'crm.api.agenda.get_capabilities')
        return {
          enabled: true,
          user_time_zone: TZ,
          sources: [
            { key: 'Event', enabled: true, timeZone: TZ, canCreate: true },
            { key: 'Patient Appointment', enabled: true, timeZone: TZ },
            { key: 'Taller', enabled: true, timeZone: TZ, label: 'Taller' },
          ],
        }
      if (method.endsWith('.query') && args.source === 'Patient Appointment')
        return {
          timeZone: TZ,
          resources: [
            { id: 'DR-1', title: 'Dra. Ruiz', timeZone: TZ },
            { id: 'DR-2', title: 'Dr. Soto', timeZone: TZ },
          ],
          events: [
            {
              ...event('PA-1', '2026-10-07T15:00:00Z', '2026-10-07T15:30:00Z'),
              source: 'Patient Appointment',
              title: 'Consulta Luis',
              resourceIds: ['DR-1'],
              appointmentTypeColor: '#d50000',
            },
            {
              ...event('PA-2', '2026-10-08T15:00:00Z', '2026-10-08T15:30:00Z'),
              source: 'Patient Appointment',
              title: 'Consulta Eva',
              resourceIds: ['DR-2'],
            },
          ],
        }
      if (method.endsWith('.query') && args.source === 'Taller')
        return {
          timeZone: TZ,
          resources: [
            { id: 'beto@example.test', title: 'Beto', timeZone: TZ },
            { id: '__unassigned__', title: 'Sin asignar', timeZone: TZ },
          ],
          events: [
            {
              ...event('RO-9', '2026-10-09T18:00:00Z', '2026-10-09T18:30:00Z'),
              source: 'Taller',
              title: 'RO-9 · iPhone 13',
              resourceIds: ['beto@example.test'],
              kind: 'taller',
            },
          ],
        }
      return base(method, args)
    }
    await mountAt('/agenda?view=week&date=2026-10-07')
    // Doctors start hidden (a team calendar); the workshop shows.
    expect(
      calls.some(([m, a]) => m.endsWith('.query') && a.source === 'Taller'),
    ).toBe(true)
    expect(
      calls.some(
        ([m, a]) => m.endsWith('.query') && a.source === 'Patient Appointment',
      ),
    ).toBe(false)
    const side = () => root.querySelector('.ag-sidebar')
    expect(side().textContent).toContain('Technicians')
    expect(side().textContent).toContain('Beto')
    expect(side().textContent).toContain('Unassigned')
    expect(root.querySelector('[data-event-id="RO-9"]')).not.toBeNull()

    // Turn the doctors on: each doctor is a calendar with their own color.
    const groupBox = [...side().querySelectorAll('.ag-side__groupcheck')].find(
      (el) => el.getAttribute('aria-label').includes('Doctors'),
    )
    groupBox.click()
    await flush()
    expect(side().textContent).toContain('Dra. Ruiz')
    expect(side().textContent).toContain('Dr. Soto')
    const ruiz = root.querySelector('.ag-event[data-event-id="PA-1"]')
    const soto = root.querySelector('.ag-event[data-event-id="PA-2"]')
    expect(ruiz).not.toBeNull()
    expect(soto).not.toBeNull()
    // The doctor's color, not the appointment type's, names whose visit it is.
    expect(ruiz.style.background).not.toMatch(/#d50000|rgb\(213, 0, 0\)/)
    expect(ruiz.style.background).not.toBe(soto.style.background)

    // Hide one doctor: their visits leave, the other's stay, nothing reloads.
    const queries = calls.filter(([m]) => m.endsWith('.query')).length
    const sotoBox = [...side().querySelectorAll('.ag-side__label')]
      .find((el) => el.textContent.includes('Dr. Soto'))
      .querySelector('input')
    sotoBox.dispatchEvent(new Event('change'))
    await flush()
    expect(root.querySelector('[data-event-id="PA-2"]')).toBeNull()
    expect(root.querySelector('[data-event-id="PA-1"]')).not.toBeNull()
    expect(calls.filter(([m]) => m.endsWith('.query')).length).toBe(queries)

    // Hand Dra. Ruiz's visit to Dr. Soto from its card.
    root.querySelector('.ag-event[data-event-id="PA-1"]').click()
    await flush()
    const select = document.body.querySelector(
      'select[aria-label="Assigned to"]',
    )
    expect([...select.options].map((o) => o.textContent.trim())).toEqual([
      'Dra. Ruiz',
      'Dr. Soto',
    ])
    select.value = 'DR-2'
    select.dispatchEvent(new Event('change'))
    await flush()
    expect(last('move')).toMatchObject({
      source: 'Patient Appointment',
      name: 'PA-1',
      resource_ids: JSON.stringify(['DR-2']),
      start: '2026-10-07T15:00:00Z',
    })

    // The doctors stay listed after a reload, before their calendars answer.
    app.unmount()
    root.remove()
    resetAgendaPrefsForTests()
    await mountAt('/agenda?view=week&date=2026-10-07')
    expect(root.querySelector('.ag-sidebar').textContent).toContain('Dr. Soto')
    expect(root.querySelector('[data-event-id="PA-2"]')).toBeNull()
    expect(root.querySelector('[data-event-id="PA-1"]')).not.toBeNull()
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
