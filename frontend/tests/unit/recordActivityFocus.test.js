// «⋯ › Comentar» lands the cursor in the comment box: the «⋯» sheet that asked
// is still open (its focus trap refuses the box) and gives the focus back to
// «⋯» when it leaves; the box takes it after that.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'

vi.mock('@/documentos/api', async (actual) => ({
  ...(await actual()),
  docApi: vi.fn(async () => ({ events: [], correos: [], files: [] })),
}))
const { default: RecordActivity } = await import(
  '@/components/documentos/RecordActivity.vue'
)

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
let app, host
afterEach(() => {
  app?.unmount()
  host?.remove()
  document.body.innerHTML = ''
})

describe('«Comentar» from the «⋯» sheet', () => {
  it('focuses the comment box once the sheet has left and handed its focus back', async () => {
    const block = ref(null)
    host = document.createElement('div')
    document.body.append(host)
    app = createApp({
      render: () =>
        h(RecordActivity, {
          ref: block,
          doctype: 'Item',
          name: 'MOD00526',
          activity: { events: [], correos: [] },
        }),
    })
    app.config.globalProperties.__ = (text) => text
    app.mount(host)
    await nextTick()
    // The «⋯» button and its open sheet, its row focused.
    const trigger = document.createElement('button')
    trigger.textContent = '⋯'
    document.body.append(trigger)
    const sheet = document.createElement('div')
    sheet.setAttribute('role', 'dialog')
    sheet.innerHTML = '<button id="row">Comentar</button>'
    document.body.append(sheet)
    sheet.querySelector('#row').focus()

    block.value.open('comment')
    await frame()
    await frame()
    const box = document.querySelector('[data-testid="record-activity-text"]')
    expect(document.activeElement).not.toBe(box)
    // The sheet leaves and gives the focus back to «⋯» (reka's close focus).
    sheet.remove()
    trigger.focus()
    for (let i = 0; i < 6; i++) await frame()
    expect(document.activeElement).toBe(box)
  })
})
