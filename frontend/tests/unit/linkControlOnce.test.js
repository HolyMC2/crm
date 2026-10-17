import { describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

// SPEC §4: no API called twice for one render. The Link control's doctype and
// filters watchers both fire at mount with the same query.
const reloads = []
vi.mock('frappe-ui', () => ({
  createResource: (options) => {
    const resource = {
      data: null,
      loading: false,
      params: options.params,
      update({ params }) {
        resource.params = params
      },
      reload() {
        reloads.push(JSON.stringify(resource.params))
        resource.loading = true
      },
    }
    return resource
  },
}))
vi.mock('@/components/frappe-ui/Autocomplete.vue', () => ({
  default: { render: () => h('div') },
}))

const { default: Link } = await import('@/components/Controls/Link.vue')

describe('Link control', () => {
  it('asks once at mount', async () => {
    vi.useFakeTimers()
    globalThis.__ = (s) => s
    const host = document.createElement('div')
    const app = createApp({
      render: () =>
        h(Link, { doctype: 'User', filters: { name: ['in', ['a', 'b']] } }),
    })
    app.mount(host)
    await nextTick()
    await vi.advanceTimersByTimeAsync(1000)
    expect(reloads).toHaveLength(1)
    app.unmount()
    vi.useRealTimers()
  })
})
