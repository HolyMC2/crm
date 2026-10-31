// Agenda «Add a task»: the quick card writes the same native pendiente every other
// surface writes (ToDo or, on a deal, CRM Task), with «Para», priority and notes; the
// task chip opens that record with «Volver a Agenda», and «Más opciones» reaches the
// shared pendiente sheet instead of a bare event form.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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
import { createTask, taskRoute } from '@/composables/useAgenda'
import { resetAgendaPrefsForTests } from '@/composables/useAgendaPrefs'

const TZ = 'America/Mexico_City'
const task = (name = 'TD-1', extra = {}) => ({
  doctype: 'ToDo',
  name,
  date: '2026-10-08',
  description: 'Llamar a Ana',
  status: 'Open',
  modified: 'm1',
  ...extra,
})

const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
const methods = () => calls.map(([method]) => method.split('.').pop())
const last = (name) => calls.filter(([m]) => m.endsWith(`.${name}`)).at(-1)?.[1]
const buttonNamed = (label) =>
  [...document.body.querySelectorAll('button')].find(
    (b) =>
      b.textContent.trim() === label || b.getAttribute('aria-label') === label,
  )

let app
let root
async function mountAt(path) {
  const router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      { path: '/agenda', component: Agenda },
      { path: '/pendientes/:source/:name', component: { template: '<div />' } },
    ],
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

// The quick card opens from the sidebar's «Create > Task», as on the lab.
async function openTaskCard() {
  buttonNamed('Create').click()
  await flush()
  buttonNamed('Task').click()
  await flush()
}

beforeEach(() => {
  calls.length = 0
  localStorage.clear()
  resetAgendaPrefsForTests()
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (match, i) => values?.[i] ?? match)
  window.timezone = { system: TZ }
  window.innerWidth = 1440
  window.dispatchEvent(new Event('resize'))
  handler = (method, args) => {
    if (method === 'crm.api.agenda.get_capabilities')
      return {
        enabled: true,
        user: 'me@example.test',
        user_time_zone: TZ,
        sources: [
          { key: 'Event', enabled: true, timeZone: TZ, canCreate: true },
        ],
      }
    if (method === 'doco.pendientes.api.bootstrap') return { enabled: true }
    if (method === 'doco.pendientes.api.people')
      return {
        rows: [
          { user: 'me@example.test', name: 'Yo', me: true },
          { user: 'ana@example.test', name: 'Ana López', me: false },
        ],
      }
    if (method === 'doco.pendientes.api.queue') {
      if (args?.segment === 'mine' && handler.taskRows)
        return { sections: { today: { rows: handler.taskRows, count: {} } } }
      return { rows: [], sections: {} }
    }
    if (method === 'doco.pendientes.api.create')
      return {
        row: task('TD-9', {
          description: args.description,
          date: args.date,
          priority: args.priority,
        }),
        created: null,
      }
    if (method.endsWith('.query'))
      return { timeZone: TZ, resources: [], events: [] }
    return {}
  }
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  document.body.innerHTML = ''
})

describe('the task quick card writes a native pendiente', () => {
  it('sends «Para», priority, notes and the date to the shared writer', async () => {
    const router = await mountAt('/agenda?view=week&date=2026-10-07')
    await openTaskCard()

    const title = document.body.querySelector('.ag-qc__title')
    title.value = 'Revisar pedido de Ana'
    title.dispatchEvent(new Event('input', { bubbles: true }))

    // «Para»: the coworkers list opens on demand; pick Ana.
    document.body.querySelector('.ag-qc__person').click()
    await flush()
    const ana = [...document.body.querySelectorAll('.ag-qc__option')].find(
      (option) => option.textContent.includes('Ana López'),
    )
    ana.click()
    await flush()

    // Priority: High.
    buttonNamed('High').click()
    const notes = document.body.querySelector('.ag-qc__notes')
    notes.value = 'Confirmar la entrega'
    notes.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()

    document.body
      .querySelector('form.ag-qc')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flush()

    expect(last('people')).toBeTruthy()
    expect(last('create')).toMatchObject({
      description: 'Revisar pedido de Ana',
      date: '2026-10-07',
      priority: 'High',
      notes: 'Confirmar la entrega',
      assigned_to: 'ana@example.test',
    })
    expect(last('create').request_id).toBeTruthy()
    expect(methods()).toContain('create')
    expect(router.currentRoute.value.path).toBe('/agenda')
  })

  it('defaults «Para» to me: priority Medium, no assignee, no notes', async () => {
    await mountAt('/agenda?view=week&date=2026-10-07')
    await openTaskCard()
    const title = document.body.querySelector('.ag-qc__title')
    title.value = 'Comprar tóner'
    title.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    document.body
      .querySelector('form.ag-qc')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flush()
    expect(last('create')).toMatchObject({
      description: 'Comprar tóner',
      date: '2026-10-07',
      priority: 'Medium',
      notes: '',
      assigned_to: '',
    })
  })
})

describe('a pendiente keeps its hour on the Agenda', () => {
  it('«Create > Task» starts with no time; unticking «No time» sends the hour', async () => {
    await mountAt('/agenda?view=week&date=2026-10-07')
    await openTaskCard()
    const title = document.body.querySelector('.ag-qc__title')
    title.value = 'Llamar al proveedor'
    title.dispatchEvent(new Event('input', { bubbles: true }))
    const noTime = [...document.body.querySelectorAll('form.ag-qc label')].find(
      (label) => label.textContent.trim() === 'No time',
    )
    expect(noTime.querySelector('input').checked).toBe(true)
    noTime.querySelector('input').click()
    await flush()
    const time = document.body.querySelector('form.ag-qc input[type=time]')
    time.value = '11:30'
    time.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    document.body
      .querySelector('form.ag-qc')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flush()
    expect(last('create')).toMatchObject({
      description: 'Llamar al proveedor',
      date: '2026-10-07',
      time: '11:30',
    })
  })

  it('draws a timed pendiente at its hour and an untimed one as a chip of its day', async () => {
    handler.taskRows = [
      task('TD-2', { time: '10:30' }),
      task('TD-3', { description: 'Sin hora' }),
    ]
    await mountAt('/agenda?view=week&date=2026-10-07')
    expect(
      document.body.querySelector('.ag-event[data-event-id="ToDo:TD-2"]'),
    ).not.toBeNull()
    expect(
      document.body.querySelector('.ag-event[data-event-id="ToDo:TD-3"]'),
    ).toBeNull()
    expect(document.body.textContent).toContain('Sin hora')
  })
})

describe('the task chip opens its native record and comes back', () => {
  it('«Open task» keeps the Agenda view as the way back', async () => {
    handler.taskRows = [task()]
    const router = await mountAt('/agenda?view=week&date=2026-10-07')
    const bar = root.querySelector('.ag-bar[data-event-id="ToDo:TD-1"]')
    expect(bar.textContent).toContain('Llamar a Ana')
    bar.click()
    await flush()
    buttonNamed('Open task').click()
    await flush()

    const route = router.currentRoute.value
    expect(route.path).toBe('/pendientes/todo/TD-1')
    // The way back is the very view (and selected task) the worker left.
    expect(route.query.return_to).toMatch(
      /^\/crm\/agenda\?view=week&date=2026-10-07/,
    )
    expect(route.query.return_label).toBe('Agenda')
  })
})

describe('«Más opciones» on a task', () => {
  it('opens the shared pendiente sheet with what the card already typed', async () => {
    await mountAt('/agenda?view=week&date=2026-10-07')
    await openTaskCard()
    const title = document.body.querySelector('.ag-qc__title')
    title.value = 'Enviar cotización'
    title.dispatchEvent(new Event('input', { bubbles: true }))
    const notes = document.body.querySelector('.ag-qc__notes')
    notes.value = 'Versión 2'
    notes.dispatchEvent(new Event('input', { bubbles: true }))
    buttonNamed('High').click()
    await flush()

    buttonNamed('More options').click()
    await flush()

    // The card is gone and the full sheet is up (loaded on first use), prefilled.
    // Its first import is transformed on demand, past waitFor's 1 s under a full run.
    expect(document.body.querySelector('form.ag-qc')).toBeNull()
    await vi.waitFor(
      () =>
        expect(
          [...document.body.querySelectorAll('textarea')].find(
            (area) => area.value === 'Enviar cotización',
          ),
        ).toBeTruthy(),
      { timeout: 8000 },
    )
    // Details and priority live behind the sheet's chips, as in Pendientes.
    buttonNamed('Details').click()
    await flush()
    const details = [...document.body.querySelectorAll('textarea')].find(
      (area) => area.value === 'Versión 2',
    )
    expect(details).toBeTruthy()
    // The card's priority chip follows the value into the sheet.
    expect(
      [...document.body.querySelectorAll('button')].some(
        (b) => b.textContent.trim() === 'Priority: high',
      ),
    ).toBe(true)
  })
})

describe('task route and catalogue', () => {
  it('a task with no way back is still a plain pendiente', () => {
    expect(taskRoute({ task: task() })).toBe('/pendientes/todo/TD-1')
    expect(taskRoute({ task: { doctype: 'CRM Task', name: '12' } })).toBe(
      '/pendientes/crm-task/12',
    )
    // Only same-shell return paths are carried.
    expect(taskRoute({ task: task() }, 'https://evil.example/')).toBe(
      '/pendientes/todo/TD-1',
    )
  })

  it('createTask defaults to a medium, unassigned, deadline-only pendiente', async () => {
    await createTask({ title: 'Llamar', date: '2026-10-08' })
    expect(last('create')).toMatchObject({
      description: 'Llamar',
      date: '2026-10-08',
      priority: 'Medium',
      notes: '',
      assigned_to: '',
      reference_type: null,
      reference_name: null,
    })
  })

  it('every string the card shows is in the Spanish catalogue', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
    const entries = new Set()
    for (const m of po.matchAll(
      /^(msgctxt "((?:[^"\\]|\\.)*)"\n)?msgid "((?:[^"\\]|\\.)*)"\nmsgstr "((?:[^"\\]|\\.)*)"/gm,
    ))
      entries.add(`${m[2] ? `${m[3]}:${m[2]}` : m[3]}`)
    for (const key of [
      'For:Pendiente',
      'Me',
      'Priority',
      'Notes',
      'Add details',
      'Search a coworker',
      'More options',
      'Open task',
      'Task saved',
      'Low',
      'Medium',
      'High',
      'No time',
      'Time',
    ])
      expect(entries.has(key), key).toBe(true)
  })
})
