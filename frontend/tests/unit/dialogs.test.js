import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

// src/utils/dialogs.jsx is the app's only JSX: Dialogs (mounted in App.vue)
// renders every createDialog / confirmDialog / inputDialog through
// @vitejs/plugin-vue-jsx, with object slots, onUpdate:open and v-html.
let app
let root
let mod
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
const dialogEl = () => document.body.querySelector('[role="dialog"]')

beforeEach(async () => {
  vi.resetModules()
  mod = await import('@/utils/dialogs')
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(mod.Dialogs) })
  app.mount(root)
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  document.body.innerHTML = ''
})

describe('Dialogs', () => {
  it('renders the title, message, html and action of a dialog', async () => {
    const onClick = vi.fn()
    mod.createDialog({
      title: 'Borrar contacto',
      message: 'Se borra para todos',
      html: '<b data-testid="html">Ana López</b>',
      actions: [{ label: 'Borrar', onClick }],
    })
    await settle()
    expect(mod.isDialogOpen()).toBe(true)
    const dlg = dialogEl()
    expect(dlg.textContent).toContain('Borrar contacto')
    expect(dlg.querySelector('p').textContent).toBe('Se borra para todos')
    expect(dlg.querySelector('[data-testid="html"]').textContent).toBe(
      'Ana López',
    )
    ;[...dlg.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'Borrar')
      .click()
    await settle()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('Escape closes a confirm dialog and runs its cancel path', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    mod.confirmDialog({ title: '¿Archivar?', onConfirm, onCancel })
    await settle()
    dialogEl().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    )
    await settle()
    expect(dialogEl()).toBeNull()
    expect(mod.isDialogOpen()).toBe(false)
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('an input dialog submits the typed value on Enter and closes', async () => {
    const onConfirm = vi.fn()
    mod.inputDialog({
      title: 'Motivo',
      placeholder: 'Escribe el motivo',
      onConfirm,
    })
    await settle()
    const input = dialogEl().querySelector('input[type="text"]')
    expect(input.placeholder).toBe('Escribe el motivo')
    input.value = '  cliente canceló  '
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    )
    await settle()
    expect(onConfirm).toHaveBeenCalledWith('cliente canceló')
    expect(dialogEl()).toBeNull()
  })
})
