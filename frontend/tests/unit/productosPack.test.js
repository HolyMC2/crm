// «Armar pack» and the photo gallery with a mocked transport: the pack takes
// the list's codes from doco and asks Mercado for the message; the gallery
// shows the main photo first and offers only what the worker may do.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'

vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

import PackDialog from '@/components/productos/PackDialog.vue'
import PhotoGallery from '@/components/productos/PhotoGallery.vue'
import LabelDialog from '@/components/productos/LabelDialog.vue'

const calls = []
let answers = {}
const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
let app
let root
function mount(component, props) {
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(component, props()) })
  app.config.globalProperties.__ = window.__
  app.mount(root)
}

beforeEach(() => {
  calls.length = 0
  window.__ = globalThis.__
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      const method = String(url).split('/api/method/').pop()
      const args = JSON.parse(init?.body || '{}')
      calls.push([method, args])
      const answer = answers[method]
      return {
        ok: Boolean(answer),
        status: answer ? 200 : 404,
        json: async () => ({ message: answer ? answer(args) : null }),
      }
    }),
  )
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('Productos › Armar pack', () => {
  it('sends the list codes, in order, to Mercado and shows the message', async () => {
    answers = {
      'doco.workspaces.products.catalog_codes': () => ({
        codes: ['IPN1', 'IPN2'],
        total: 300,
        cap: 240,
      }),
      'mercado.api.exports.share_message': (args) => ({
        text: `Pack ${JSON.parse(args.item_codes).join(',')}`,
      }),
    }
    const open = ref(false)
    mount(PackDialog, () => ({
      modelValue: open.value,
      'onUpdate:modelValue': (value) => (open.value = value),
      filters: { search: 'funda', store: '', group: 'Fundas' },
      label: 'funda · Fundas',
    }))
    open.value = true
    await flush()
    expect(calls[0]).toEqual([
      'doco.workspaces.products.catalog_codes',
      { search: 'funda', store: '', group: 'Fundas' },
    ])
    expect(document.body.textContent).toContain(
      'The first 2 of 300 products of this list, in its order.',
    )
    const message = [...document.querySelectorAll('[role="radio"]')].find((b) =>
      b.textContent.includes('Message'),
    )
    message.click()
    await flush()
    const build = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Build',
    )
    build.click()
    await flush()
    expect(calls.at(-1)).toEqual([
      'mercado.api.exports.share_message',
      { item_codes: '["IPN1","IPN2"]', filter_label: 'funda · Fundas' },
    ])
    expect(document.querySelector('textarea').value).toBe('Pack IPN1,IPN2')
  })
})

describe('Productos › fotos', () => {
  it('shows the main photo first and only the actions the worker has', async () => {
    answers = {
      'doco.workspaces.product_media.photos': () => ({
        item: 'IPN1',
        rows: [
          { file_url: '/files/a.png', principal: true },
          { file_url: '/files/b.png', principal: false },
        ],
        can_manage: false,
        can_turn: true,
        can_share: true,
        reason: 'Ask whoever keeps the catalogue.',
      }),
    }
    mount(PhotoGallery, () => ({ item: 'IPN1' }))
    await flush()
    const text = root.textContent
    expect(
      [...root.querySelectorAll('img')].map((i) => i.getAttribute('src')),
    ).toEqual(['/files/a.png', '/files/b.png'])
    expect(text).toContain('Main')
    expect(text).toContain('Ask whoever keeps the catalogue.')
    expect(text).not.toContain('Make main')
    expect(text).not.toContain('Add photo')
    expect(root.querySelectorAll('[aria-label="Turn right"]')).toHaveLength(2)
    expect(root.querySelector('[aria-label="Delete photo"]')).toBeNull()
  })
})

describe('Productos › etiquetas', () => {
  it('prints one label per chosen serial number, with the product data', async () => {
    answers = {
      'mercado.api.labels.resolve_label_items': () => ({
        items: {
          IPN1: {
            item_code: 'IPN1',
            item_name: 'Cel',
            barcode: '75',
            price: 10,
          },
        },
      }),
      'mercado.api.labels.render_label_batch': () => ({ html: '<p>label</p>' }),
    }
    const written = []
    const tab = {
      document: {
        open: () => {},
        write: (html) => written.push(html),
        close: () => {},
      },
      close: vi.fn(),
    }
    vi.stubGlobal(
      'open',
      vi.fn(() => tab),
    )
    window.open = globalThis.open
    const open = ref(false)
    mount(LabelDialog, () => ({
      modelValue: open.value,
      'onUpdate:modelValue': (value) => (open.value = value),
      item: 'IPN1',
      hasSerial: true,
      onHand: [{ serial: 'SN-1' }, { serial: 'SN-2' }],
    }))
    open.value = true
    await flush()
    const boxes = document.querySelectorAll('input[type="checkbox"]')
    expect(boxes).toHaveLength(2)
    boxes[1].click()
    await flush()
    const print = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Print',
    )
    print.click()
    await flush()
    const call = calls.find(([method]) => method.endsWith('render_label_batch'))
    expect(JSON.parse(call[1].rows)).toEqual([
      {
        item_code: 'IPN1',
        item_name: 'Cel',
        barcode: '75',
        price: 10,
        serial_no: 'SN-1',
        qty: 1,
      },
    ])
    expect(call[1].auto_print).toBe(1)
    expect(written).toEqual(['<p>label</p>'])
  })
})
