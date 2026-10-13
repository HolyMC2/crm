// The follow-up chip's hover text says what, which kind and when in words:
// «Send proposal document · Tarea · dom, 11 oct», never «Task · 2026-10-11 00:00:00».
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import NextActivityChip from '@/components/doco/NextActivityChip.vue'
import { formatDay } from '@/utils/contactos'

const mounted = []
async function chip(props) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp({ render: () => h(NextActivityChip, props) })
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  mounted.push(() => {
    app.unmount()
    el.remove()
  })
  await nextTick()
  return el.querySelector('[title]')?.getAttribute('title')
}
afterEach(() => mounted.splice(0).forEach((fn) => fn()))

describe('next activity chip hover text', () => {
  it('names the kind in Spanish and shows a date-only due without an hour', async () => {
    const title = await chip({
      at: '2026-10-11 00:00:00',
      title: 'Send proposal document',
      type: 'Task',
      overdue: true,
      days: -2,
    })
    expect(title).toBe(
      `Send proposal document · Tarea · ${formatDay('2026-10-11')}`,
    )
    expect(title).not.toMatch(/Task|00:00|2026-10-11/)
  })
  it('adds the hour when the follow-up has one', async () => {
    const title = await chip({
      at: '2026-10-19 15:30:00',
      title: 'Confirm annual plan details',
      type: 'Call',
      overdue: false,
      days: 6,
    })
    expect(title).toBe(
      `Confirm annual plan details · Llamada · ${formatDay('2026-10-19')}, 15:30`,
    )
  })
  it('keeps a kind it does not know as written', async () => {
    const title = await chip({
      at: '2026-10-19 09:00:00',
      title: 'Revisar',
      type: 'Visita',
      overdue: false,
      days: 6,
    })
    expect(title).toBe(`Revisar · Visita · ${formatDay('2026-10-19')}, 09:00`)
  })
})
