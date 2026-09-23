/* eslint-disable vue/one-component-per-file -- Small render stubs isolate the real Kanban component. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'

vi.mock('@/utils', () => ({
  isTouchScreenDevice: () => false,
  colors: ['blue'],
  parseColor: () => '',
}))
vi.mock('@/composables/breakpoint', () => ({ isMobile: ref(true) }))
vi.mock('frappe-ui', () => ({
  Combobox: { render: () => null },
  Dropdown: { render: () => null },
  Popover: { render: () => null },
}))
vi.mock('vuedraggable', () => ({
  default: defineComponent({
    props: { list: { type: Array, default: () => [] } },
    setup(props, { slots }) {
      return () =>
        h(
          'div',
          props.list.map((element) => slots.item({ element })),
        )
    },
  }),
}))

import KanbanView from '@/components/Kanban/KanbanView.vue'

let app, root, model
let viewportWidth
const column = (name, all_count = 10, data = []) => ({
  column: { name, all_count, color: 'blue' },
  data,
  fields: [],
})
const board = () =>
  root.querySelector('[data-kanban-column]')?.parentElement.parentElement
const pager = () => root.querySelector('[role="group"], [role="tablist"]')
const chips = () => Array.from(pager()?.querySelectorAll('button') || [])
const currentChip = () =>
  pager()?.querySelector('[aria-current="true"], [aria-selected="true"]')
const rect = (left, width) => ({
  left,
  right: left + width,
  width,
  top: 0,
  bottom: 44,
  height: 44,
})

beforeEach(() => {
  viewportWidth = 390
  // happy-dom has no layout. Model the two independently scrolling containers;
  // selectors and rendered reactive state still come from the real component.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function () {
      if (this === board() || this === pager()) return rect(0, viewportWidth)
      if (this.hasAttribute('data-kanban-column')) {
        const elements = Array.from(
          board().querySelectorAll('[data-kanban-column]'),
        )
        return rect(8 + elements.indexOf(this) * 335 - board().scrollLeft, 335)
      }
      if (this.parentElement === pager()) {
        return rect(chips().indexOf(this) * 126 - pager().scrollLeft, 120)
      }
      return rect(0, 0)
    },
  )
  vi.spyOn(Element.prototype, 'scrollTo').mockImplementation(function ({
    left,
  }) {
    this.scrollLeft = left
  })
})

afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.restoreAllMocks()
})

async function mount(columns) {
  model = ref({ data: { view_type: 'kanban', data: columns } })
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(KanbanView, { modelValue: model.value }) })
  // eslint-disable-next-line vue/no-reserved-component-names -- frappe-ui registers this name globally.
  app.component('Button', { render: () => h('button') })
  app.config.globalProperties.__ = (text) => text
  app.mount(root)
  await nextTick()
}

async function select(index) {
  chips()[index].click()
  await nextTick()
}

describe('phone Kanban pager', () => {
  it('uses a labelled button group and exposes only the current column', async () => {
    await mount([column('New'), column('Working')])
    expect(pager()?.getAttribute('aria-label')).toBe('Columns')
    expect(pager()?.getAttribute('role')).toBe('group')
    expect(root.querySelector('[role="tablist"], [role="tab"]')).toBeNull()
    expect(currentChip()?.textContent).toContain('New')
    expect(chips()[1].hasAttribute('aria-current')).toBe(false)
    await select(1)
    expect(currentChip()?.textContent).toContain('Working')
    expect(board().scrollLeft).toBe(343)
  })

  it('uses server totals including zero and falls back only for nullish totals', async () => {
    await mount([
      column('Total', 120, [{ name: 'one' }]),
      column('Zero', 0, [{ name: 'one' }]),
      column('Null', null, [{ name: 'one' }, { name: 'two' }]),
      { ...column('Missing'), column: { name: 'Missing', color: 'blue' } },
    ])
    expect(
      chips().map((chip) => chip.querySelector('.tabular-nums').textContent),
    ).toEqual(['120', '0', '2', '0'])
  })

  it('keeps the active chip visible when the board scrolls across 24 columns', async () => {
    await mount(Array.from({ length: 24 }, (_, i) => column(`Stage ${i + 1}`)))
    board().scrollLeft = 8 + 21 * 335
    board().dispatchEvent(new Event('scroll'))
    await nextTick()
    expect(currentChip()?.textContent).toContain('Stage 22')
    expect(pager().scrollLeft).toBeGreaterThan(0)
    expect(currentChip().getBoundingClientRect().left).toBeGreaterThanOrEqual(0)
    expect(currentChip().getBoundingClientRect().right).toBeLessThanOrEqual(390)
    viewportWidth = 320
    window.dispatchEvent(new Event('resize'))
    expect(currentChip().getBoundingClientRect().right).toBeLessThanOrEqual(320)
    board().scrollLeft = 8
    board().dispatchEvent(new Event('scroll'))
    await nextTick()
    expect(currentChip()?.textContent).toContain('Stage 1')
    expect(pager().scrollLeft).toBe(0)
  })

  it('preserves the selected column through reorder, insertion and deletion before it', async () => {
    await mount([column('New'), column('Working'), column('Done')])
    await select(1)
    model.value.data.data.push(model.value.data.data.shift())
    await nextTick()
    expect(currentChip()?.textContent).toContain('Working')
    expect(board().scrollLeft).toBe(8)
    model.value.data.data.unshift(column('Added'))
    await nextTick()
    expect(currentChip()?.textContent).toContain('Working')
    expect(board().scrollLeft).toBe(343)
    model.value.data.data[0].column.delete = true
    await nextTick()
    expect(currentChip()?.textContent).toContain('Working')
    expect(board().scrollLeft).toBe(8)
  })

  it('clamps a deleted selection, handles an empty board, and selects the first new column', async () => {
    await mount([column('New'), column('Working'), column('Done')])
    await select(1)
    model.value.data.data[1].column.delete = true
    await nextTick()
    expect(currentChip()?.textContent).toContain('Done')
    model.value.data.data[2].column.delete = true
    await nextTick()
    expect(currentChip()?.textContent).toContain('New')
    model.value.data.data = []
    await nextTick()
    expect(pager()).toBeNull()
    model.value.data.data = [column('Fresh')]
    await nextTick()
    expect(currentChip()?.textContent).toContain('Fresh')
  })
})
