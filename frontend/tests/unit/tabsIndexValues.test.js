import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import { Tabs } from 'frappe-ui'
import { indexTabs } from '@/utils/tabs'

vi.mock('@/data/document', () => ({
  useDocument: () => ({ document: {} }),
}))
vi.mock('@/components/FieldLayout/Section.vue', async () => {
  const { h } = await import('vue')
  return {
    default: {
      props: ['section'],
      setup: (props) => () =>
        h('div', { 'data-section': props.section.name }, props.section.name),
    },
  }
})

let app
let root
async function settle() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
function mount(render) {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render })
  app.config.globalProperties.__ = globalThis.__
  app.mount(root)
}
// reka keeps an empty, `hidden` element for every inactive panel.
const panelText = () =>
  [...root.querySelectorAll('[role="tabpanel"]:not([hidden])')]
    .map((panel) => panel.textContent)
    .join('|')

afterEach(() => {
  app?.unmount()
  root?.remove()
  document.body.innerHTML = ''
})

describe('indexTabs', () => {
  it('gives each item its position as value and keeps its fields', () => {
    const tabs = [{ name: 'Activity', label: 'Activity' }, { name: 'Notes' }]
    expect(indexTabs(tabs)).toEqual([
      { name: 'Activity', label: 'Activity', value: 0 },
      { name: 'Notes', value: 1 },
    ])
    expect(tabs[0]).not.toHaveProperty('value')
  })
})

describe('frappe-ui Tabs fed by indexTabs', () => {
  it('mounts the panel of the tab at the numeric v-model', async () => {
    const tabIndex = ref(1)
    const tabs = indexTabs([{ label: 'Details' }, { label: 'Failure Logs' }])
    mount(() =>
      h(
        Tabs,
        {
          modelValue: tabIndex.value,
          'onUpdate:modelValue': (v) => (tabIndex.value = v),
          tabs,
        },
        { 'tab-panel': ({ tab }) => h('span', tab.label) },
      ),
    )
    await settle()
    expect(panelText()).toBe('Failure Logs')

    tabIndex.value = 0
    await settle()
    expect(panelText()).toBe('Details')
  })
})

describe('FieldLayout', () => {
  it('renders the sections of a quick-entry layout, whose tabs carry no value', async () => {
    const { default: FieldLayout } = await import(
      '@/components/FieldLayout/FieldLayout.vue'
    )
    const layout = [
      {
        name: 'first_tab',
        sections: [
          { name: 'contact_details_section', columns: [] },
          { name: 'organization_section', hidden: true, columns: [] },
          { name: 'deal_section', columns: [] },
        ],
      },
    ]
    mount(() => h(FieldLayout, { tabs: layout, doctype: 'CRM Deal' }))
    await settle()
    const sections = [...root.querySelectorAll('[data-section]')].map((el) =>
      el.getAttribute('data-section'),
    )
    expect(sections).toEqual([
      'contact_details_section',
      'organization_section',
      'deal_section',
    ])
  })
})
