import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import { Button, Dialog } from 'frappe-ui'
import AboutModal from '@/components/Modals/AboutModal.vue'

// A `bare` Dialog renders no header and no X (frappe-ui 1.0.2); AboutModal has
// to bring its own close control. UserDropdown is the only opener and the shell
// rail replaced it, so this is the only place the control is exercised.
let app
let root
async function settle() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
afterEach(() => {
  app?.unmount()
  root?.remove()
  document.body.innerHTML = ''
})

describe('AboutModal', () => {
  it('is bare and closes from its own labelled X', async () => {
    const show = ref(true)
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      render: () =>
        h(AboutModal, {
          modelValue: show.value,
          'onUpdate:modelValue': (v) => (show.value = v),
        }),
    })
    app.config.globalProperties.__ = globalThis.__
    app.component('Button', Button)
    app.component('Dialog', Dialog)
    app.mount(root)
    await settle()
    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog).toBeTruthy()
    expect(dialog.textContent).toContain('Built on Frappe CRM.')
    const closes = dialog.querySelectorAll('[aria-label="Close"]')
    expect(closes.length).toBe(1)
    closes[0].click()
    await settle()
    expect(show.value).toBe(false)
  })
})
