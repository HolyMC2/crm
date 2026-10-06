// AgendaEventForm serialization: untouched native fields stay untouched on edit.
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, nextTick } from 'vue'
import AgendaEventForm from '@/components/agenda/AgendaEventForm.vue'

const TZ = 'America/Mexico_City'
const REMINDERS = [
  { type: 'Email', before: 10, interval: 'minutes' },
  { type: 'Notification', before: 1, interval: 'hours' },
]
let app
let root
function mountForm(initial, mode = 'edit') {
  const saved = []
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (match, i) => values?.[i] ?? match)
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp(AgendaEventForm, {
    initial: {
      title: 'Visita',
      start: '2026-10-07T16:00:00Z',
      end: '2026-10-07T17:00:00Z',
      ...initial,
    },
    mode,
    timeZone: TZ,
    onSave: (payload) => saved.push(payload),
  })
  app.config.globalProperties.__ = window.__
  const vm = app.mount(root)
  return { vm, saved }
}
afterEach(() => {
  app?.unmount()
  root?.remove()
})

describe('Agenda event form', () => {
  it('shows several reminders as the current setting and leaves them alone', async () => {
    const { vm, saved } = mountForm({ reminders: REMINDERS })
    expect(vm.form.reminder).toBe('custom')
    expect(root.textContent).toContain('Reminder')
    vm.submit()
    expect(saved[0].reminders ?? REMINDERS).toEqual(REMINDERS)
  })

  it('does not mistake an email reminder for the notification preset', () => {
    const only = [{ type: 'Email', before: 10, interval: 'minutes' }]
    const { vm, saved } = mountForm({ reminders: only })
    expect(vm.form.reminder).toBe('custom')
    vm.submit()
    expect(saved[0].reminders ?? only).toEqual(only)
  })

  it('replaces the reminders only when another one is chosen', async () => {
    const { vm, saved } = mountForm({ reminders: REMINDERS })
    vm.form.reminder = '30m'
    await nextTick()
    vm.submit()
    expect(saved[0].reminders).toEqual([
      { type: 'Notification', before: 30, interval: 'minutes' },
    ])
    vm.form.reminder = ''
    await nextTick()
    vm.submit()
    expect(saved[1].reminders).toEqual([])
  })

  it('sends the chosen weekdays of a weekly series', async () => {
    const { vm, saved } = mountForm({
      repeat: 'weekly',
      repeatDays: ['monday', 'wednesday'],
    })
    vm.submit()
    expect('repeatDays' in saved[0]).toBe(false)
    vm.form.repeatDays = ['tuesday', 'thursday']
    await nextTick()
    vm.submit()
    expect(saved[1]).toMatchObject({
      repeat: 'weekly',
      repeatDays: ['tuesday', 'thursday'],
    })
  })
})
