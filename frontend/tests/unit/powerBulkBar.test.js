// The selection bar: what it says the selection holds, and whether it offers
// its own way out when the page's bar already has one (Efectivo's bags).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'

vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    Button: {
      props: ['label'],
      emits: ['click'],
      setup:
        (props, { emit }) =>
        () =>
          h(
            'button',
            { type: 'button', onClick: () => emit('click') },
            props.label,
          ),
    },
  }
})

import PowerBulkBar from '@/components/power/PowerBulkBar.vue'

let app
let root
function mount(props) {
  root = document.createElement('div')
  document.body.appendChild(root)
  const cleared = vi.fn()
  app = createApp({
    render: () =>
      h(PowerBulkBar, { ...props, onClear: cleared }, () =>
        h('button', { type: 'button', 'data-main': '' }, 'Contar juntas'),
      ),
  })
  app.config.globalProperties.__ = globalThis.__
  app.mount(root)
  return cleared
}
const buttons = () =>
  [...root.querySelectorAll('button')].map((b) => b.textContent)

afterEach(() => {
  app?.unmount()
  root?.remove()
})

describe('PowerBulkBar', () => {
  it('says how many are chosen and clears them by default', () => {
    const cleared = mount({ count: 3 })
    expect(
      root.querySelector('[data-power-bulkbar-summary]').textContent.trim(),
    ).toBe('3 selected')
    expect(buttons()).toEqual(['Contar juntas', 'Clear selection'])
    root.querySelectorAll('button')[1].click()
    expect(cleared).toHaveBeenCalledOnce()
  })

  it("names the page's summary and leaves clearing to the page's bar", () => {
    mount({
      count: 4,
      summary: '4 bolsas · $8,171.50',
      stacked: true,
      clearable: false,
    })
    expect(
      root.querySelector('[data-power-bulkbar-summary]').textContent.trim(),
    ).toBe('4 bolsas · $8,171.50')
    expect(buttons()).toEqual(['Contar juntas'])
  })
})
