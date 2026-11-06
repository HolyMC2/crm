// The emoji table loads when the picker opens, not when a composer mounts.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'

const state = vi.hoisted(() => ({ tableLoads: 0 }))

vi.mock('gemoji', () => {
  state.tableLoads++
  return {
    gemoji: [
      {
        emoji: '😀',
        description: 'grinning face',
        names: ['grinning'],
        tags: ['smile'],
        category: 'Smileys & Emotion',
      },
      {
        emoji: '🛠️',
        description: 'hammer and wrench',
        names: ['hammer_and_wrench'],
        tags: ['tools'],
        category: 'Objects',
      },
    ],
  }
})

vi.mock('frappe-ui', () => ({
  Popover: defineComponent({
    setup(_, { slots }) {
      const open = ref(false)
      const setOpen = (value) => (open.value = value)
      return () =>
        h('div', [
          slots.trigger?.({ open: open.value, setOpen }),
          open.value ? slots.default?.({ close: () => setOpen(false) }) : null,
        ])
    },
  }),
}))

import IconPicker from '@/components/IconPicker.vue'

const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

let app
let root

afterEach(() => {
  app?.unmount()
  root?.remove()
})

describe('IconPicker emoji table', () => {
  it('loads gemoji on the first open and offers its emojis', async () => {
    let picked = ''
    root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp({
      render: () =>
        h(
          IconPicker,
          {
            modelValue: '',
            'onUpdate:modelValue': (value) => (picked = value),
          },
          {
            default: ({ togglePopover }) =>
              h('button', { id: 'open', onClick: togglePopover }, 'abrir'),
          },
        ),
    })
    app.component('Button', { template: '<button><slot /></button>' })
    app.component('FormControl', { template: '<input />' })
    app.mount(root)
    await flush()
    expect(state.tableLoads).toBe(0)

    root.querySelector('#open').click()
    await flush()
    expect(state.tableLoads).toBe(1)
    const grinning = root.querySelector('button[title="grinning face"]')
    expect(grinning).not.toBeNull()
    expect(root.textContent).toContain('Objects')

    grinning.click()
    await flush()
    expect(picked).toBe('😀')
  })
})
