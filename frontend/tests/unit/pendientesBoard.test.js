// Tablero (Shell D8): the list's rows in columns by state; a card moves by
// drag and drop or by its «Move to…» menu, and only work I may move moves.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    Button: {
      props: ['ariaLabel'],
      setup: (props) => () => h('button', { 'aria-label': props.ariaLabel }),
    },
    // The menu's options as plain buttons, so a test can choose one.
    Dropdown: {
      props: ['options'],
      setup:
        (props, { slots }) =>
        () =>
          h('div', [
            slots.default?.(),
            ...(props.options || []).map((option) =>
              h(
                'button',
                { 'data-option': option.label, onClick: option.onClick },
                option.label,
              ),
            ),
          ]),
    },
  }
})

import PendientesBoard from '@/components/pendientes/PendientesBoard.vue'
import { boardColumn } from '@/composables/usePendientes'

const row = (name, values = {}) => ({
  doctype: 'ToDo',
  name,
  description: `Tarea ${name}`,
  status: 'Open',
  state: 'open',
  date: '2026-10-05',
  modified: 'v1',
  mine: true,
  ...values,
})

let app, root
function mount(props) {
  const moves = []
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({
    render: () =>
      h(PendientesBoard, {
        today: '2026-10-05',
        ...props,
        onMove: (item, state) => moves.push([item.name, state]),
      }),
  })
  app.config.globalProperties.__ = globalThis.__
  app.component('RouterLink', {
    setup:
      (_p, { slots }) =>
      () =>
        h('a', slots.default?.()),
  })
  app.mount(root)
  return moves
}
afterEach(() => {
  app?.unmount()
  root?.remove()
})
const column = (state) => root.querySelector(`[data-board-column="${state}"]`)
const card = (key) => root.querySelector(`[data-board-card="${key}"]`)

describe('Pendientes board', () => {
  it('puts each row in its state column; someday is «to do», cancelled stays off', () => {
    expect(boardColumn(row('a', { state: 'backlog' }))).toBe('open')
    expect(boardColumn(row('b', { state: 'blocked' }))).toBe('blocked')
    expect(boardColumn(row('c', { status: 'Closed', state: undefined }))).toBe(
      'done',
    )
    expect(boardColumn(row('d', { cancelled: true }))).toBe('')
    mount({
      rows: [
        row('1'),
        row('2', { state: 'in_progress' }),
        row('3', { state: 'blocked' }),
        row('4', { status: 'Closed', state: 'done' }),
        row('5', { cancelled: true, state: 'cancelled' }),
      ],
    })
    expect(column('open').textContent).toContain('Tarea 1')
    expect(column('in_progress').textContent).toContain('Tarea 2')
    expect(column('blocked').textContent).toContain('Tarea 3')
    expect(column('done').textContent).toContain('Tarea 4')
    expect(root.textContent).not.toContain('Tarea 5')
  })

  it('moves a card by drag and drop and by «Move to…», never onto its own column', async () => {
    const moves = mount({ rows: [row('1'), row('2', { state: 'blocked' })] })
    const transfer = { setData: vi.fn(), effectAllowed: '' }
    const drag = new Event('dragstart', { bubbles: true })
    drag.dataTransfer = transfer
    card('ToDo1').dispatchEvent(drag)
    column('in_progress').dispatchEvent(new Event('drop', { bubbles: true }))
    card('ToDo1').dispatchEvent(drag)
    column('open').dispatchEvent(new Event('drop', { bubbles: true }))
    await nextTick()
    card('ToDo2').querySelector('[data-option]').click()
    expect(moves).toEqual([
      ['1', 'in_progress'],
      ['2', 'open'],
    ])
  })

  it("offers no move on someone else's work unless I asked for it", () => {
    mount({ rows: [row('9', { mine: false })] })
    expect(card('ToDo9').getAttribute('draggable')).toBe('false')
    expect(card('ToDo9').querySelector('[data-option]')).toBeNull()
    app.unmount()
    root.remove()
    mount({ rows: [row('9', { mine: false })], movableAll: true })
    expect(card('ToDo9').getAttribute('draggable')).toBe('true')
  })
})
