import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { Dialogs, dialog } from 'frappe-ui'

// frappe-ui 1.0.2 `dialog.confirm`: while `onConfirm` is pending the dialog
// holds (Escape, overlay and the X all route through update:open → onCancel,
// which returns early while loading), Cancel is disabled, and resolving
// closes it. Rejecting shows the error and re-enables the buttons.
let app
let root
async function settle() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
const buttons = () => [
  ...document.body.querySelectorAll('[role="dialog"] button'),
]
const byText = (text) => buttons().find((b) => b.textContent.trim() === text)
afterEach(() => {
  app?.unmount()
  root?.remove()
  document.body.innerHTML = ''
})

describe('dialog.confirm with a pending onConfirm', () => {
  it('holds the dialog until the promise settles and ignores cancel meanwhile', async () => {
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({ render: () => h(Dialogs) })
    app.mount(root)
    let resolveConfirm
    let cancelled = 0
    dialog.confirm({
      title: 'Borrar',
      message: 'Seguro?',
      confirmLabel: 'Confirmar',
      cancelLabel: 'Cancelar',
      onConfirm: () => new Promise((r) => (resolveConfirm = r)),
      onCancel: () => cancelled++,
    })
    await settle()
    expect(document.body.querySelector('[role="dialog"]')).toBeTruthy()
    byText('Confirmar').click()
    await settle()
    expect(byText('Cancelar').disabled).toBe(true)
    // Escape / overlay / X all end in update:open=false
    document.body
      .querySelector('[role="dialog"]')
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      )
    await settle()
    expect(document.body.querySelector('[role="dialog"]')).toBeTruthy()
    expect(cancelled).toBe(0)
    resolveConfirm()
    await settle()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    expect(cancelled).toBe(0)
  })

  it('shows a rejected onConfirm inline and re-enables Cancel', async () => {
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({ render: () => h(Dialogs) })
    app.mount(root)
    let cancelled = 0
    dialog.confirm({
      title: 'Borrar',
      confirmLabel: 'Confirmar',
      cancelLabel: 'Cancelar',
      onConfirm: () => Promise.reject(new Error('No se pudo')),
      onCancel: () => cancelled++,
    })
    await settle()
    byText('Confirmar').click()
    await settle()
    const dlg = document.body.querySelector('[role="dialog"]')
    expect(dlg.textContent).toContain('No se pudo')
    expect(byText('Cancelar').disabled).toBe(false)
    byText('Cancelar').click()
    await settle()
    expect(cancelled).toBe(1)
  })
})
