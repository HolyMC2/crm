// The «/» menu carries the composer's «Edit quick replies» in its footer, now
// that the saved replies no longer sit as chips over the composer.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'
import SlashCommandMenu from '@/components/Composer/SlashCommandMenu.vue'

const cleanups = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

function mount(props) {
  const el = document.createElement('div')
  document.body.append(el)
  const app = createApp({ render: () => h(SlashCommandMenu, props) })
  app.config.globalProperties.__ = (s, args) =>
    String(s).replace(/\{(\d)\}/g, (_, i) => args?.[i] ?? '')
  app.mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  return el
}
const item = {
  id: 'quick:0',
  type: 'quick',
  label: 'Horario',
  hint: 'Abrimos de 10 a 7.',
  keywords: ['horario'],
  shortcut: '',
  payload: { label: 'Horario', text: 'Abrimos de 10 a 7.' },
  available: true,
  reason: '',
}

describe('«/» menu footer action', () => {
  it('offers the composer’s action and reports the tap', () => {
    const onManage = vi.fn()
    const el = mount({
      items: [item],
      manageLabel: 'Edit quick replies',
      onManage,
    })
    const action = el.querySelector('[data-testid="slash-manage"]')
    expect(action.textContent.trim()).toBe('Edit quick replies')
    action.click()
    expect(onManage).toHaveBeenCalledOnce()
  })

  it('shows no action where the composer gives none', () => {
    const el = mount({ items: [item] })
    expect(el.querySelector('[data-testid="slash-manage"]')).toBeNull()
  })
})
