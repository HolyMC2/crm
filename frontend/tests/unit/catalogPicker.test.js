// Catalog picker: filters, offers, templates, the review step and what a send carries.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive, ref } from 'vue'
import {
  closingWithStore,
  forChannel,
  itemValues,
  money,
  parsePrice,
  renderCaption,
  renderMessage,
  DEFAULT_CAPTION,
} from '../../src/utils/catalogMessage.js'

const SALE = {
  item_code: 'FUN-15PM',
  item_name: 'Casetify Reflect iPhone 15 Pro Max',
  item_group: 'Fundas',
  price: 250,
  sale_price: 200,
  discount_pct: 20,
  low_stock: 2,
  stock: 2,
  link: 'https://docomexico.com/producto/fun-15pm',
}
const PLAIN = {
  item_code: 'MICA-9H',
  item_name: 'Mica 9H iPhone 15 Pro Max',
  item_group: 'Micas',
  price: 50,
  stock: 38,
}

describe('what a catalog message says (mirrors services/catalog_message.py)', () => {
  it('writes the sale line only for an item on sale', () => {
    expect(renderCaption(DEFAULT_CAPTION, itemValues(SALE))).toBe(
      '*Casetify Reflect iPhone 15 Pro Max*\n$200\nAntes ~$250~ · -20%',
    )
    expect(
      renderCaption(
        DEFAULT_CAPTION + '\nAntes: {{precio_antes}}\n{{quedan}}\n{{otra}}',
        itemValues(PLAIN),
      ),
    ).toBe('*Mica 9H iPhone 15 Pro Max*\n$50\n{{otra}}')
  })

  it('takes the operator’s price for this message and drops the sale line', () => {
    expect(renderCaption(DEFAULT_CAPTION, itemValues(SALE, 180))).toBe(
      '*Casetify Reflect iPhone 15 Pro Max*\n$180',
    )
    expect(itemValues({ item_name: 'Sin precio' }).precio).toBe(
      'Precio a consultar',
    )
    expect(itemValues(SALE).quedan).toBe('Quedan 2')
  })

  it('formats and reads prices the way the chat writes them', () => {
    expect(money(1234.5)).toBe('$1,234.50')
    expect(money(200)).toBe('$200')
    expect(parsePrice('$1,200')).toBe(1200)
    expect(parsePrice('abc')).toBeNull()
    expect(parsePrice('')).toBeNull()
  })

  it('lets an empty name disappear from the message', () => {
    const values = { nombre: '', busqueda: 'fundas', cantidad: '2', tienda: '' }
    expect(
      renderMessage('Hola {{nombre}}, te paso {{busqueda}} 👇', values),
    ).toBe('Hola, te paso fundas 👇')
    expect(renderMessage('{{tienda}}\n¿Te aparto alguna?', values)).toBe(
      '¿Te aparto alguna?',
    )
  })

  it('adds the store line once', () => {
    expect(closingWithStore('¿Te aparto alguna?', true)).toBe(
      '¿Te aparto alguna?\nVe más en la tienda: {{tienda}}',
    )
    expect(closingWithStore('Mira: {{tienda}}', true)).toBe('Mira: {{tienda}}')
    expect(closingWithStore('', false)).toBe('')
  })

  it('keeps WhatsApp markup and plain words elsewhere', () => {
    const text = '*Funda* ~$250~ 2*3*4 snake_case_word'
    expect(forChannel(text, 'whatsapp')).toBe(text)
    expect(forChannel(text, 'messenger')).toBe(
      'Funda $250 2*3*4 snake_case_word',
    )
  })
})

// ── the mounted picker ─────────────────────────────────────────────────────
const inbox = vi.hoisted(() => ({ state: null }))
vi.mock('frappe-ui', async () => {
  const { defineComponent } = await import('vue')
  return {
    call: vi.fn(async () => ({ id: 'TPL-1' })),
    createResource: () => ({
      data: [{ name: 'QR-1', title: 'Saludo', body: 'Hola, te comparto 👇' }],
      loading: false,
      submit() {},
    }),
    toast: { success: vi.fn(), error: vi.fn() },
    Dropdown: defineComponent({ render: () => null }),
  }
})
vi.mock('@/composables/salesDocs', () => ({ addItemsToQuotation: vi.fn() }))
vi.mock('@/composables/inbox', () => {
  const s = {
    catalogResults: reactive({ data: null, loading: false, error: null }),
    catalogQuery: ref('15 pro max'),
    catalogCtx: ref({
      reference_doctype: '',
      reference_name: '',
      channel: 'messenger',
      to: '990000000000001',
      customer_name: 'Ana López',
    }),
    catalogFilters: reactive({
      group: '',
      brand: '',
      inStock: true,
      onSale: false,
      priceMin: '',
      priceMax: '',
    }),
    catalogTemplates: reactive({ data: [], submit: vi.fn() }),
    salesDocsEnabled: ref(false),
    runCatalogSearch: vi.fn(),
    onCatalogQuery: vi.fn(),
    closeCatalog: vi.fn(),
    setComposerDraft: vi.fn(),
    sendCatalogItems: vi.fn(async () => ({ sent_count: 2, skipped: [] })),
    catalogStoreLink: vi.fn(async () => ({
      url: 'https://ventas.test/e/ab3cd5',
    })),
    catalogChannel: () => 'messenger',
  }
  inbox.state = s
  return s
})

describe('CatalogPicker', () => {
  let app
  let el
  beforeEach(async () => {
    await import('@/composables/inbox') // builds the mocked state
    const s = inbox.state
    s.catalogResults.data = {
      items: [SALE, PLAIN],
      groups: [
        { name: 'Fundas', count: 23 },
        { name: 'Micas', count: 12 },
      ],
      brands: [{ name: 'Casetify', count: 3 }],
      store: true,
      offers: true,
    }
    s.catalogTemplates.data = [
      {
        id: '',
        title: 'Básica',
        intro: '',
        caption: DEFAULT_CAPTION,
        closing: '',
        store_link: 0,
      },
      {
        id: 'TPL-1',
        title: 'Fundas con enlace',
        intro: 'Hola {{nombre}}, esto tenemos de {{busqueda}} 👇',
        caption: '🔥 {{articulo}}\n{{precio}}\n{{oferta}}',
        closing: '¿Te aparto alguna?',
        store_link: 1,
      },
    ]
    for (const k of [
      'runCatalogSearch',
      'sendCatalogItems',
      'catalogStoreLink',
    ])
      s[k].mockClear()
  })
  afterEach(() => {
    app?.unmount()
    el?.remove()
  })

  async function mount() {
    const { default: CatalogPicker } = await import(
      '../../src/components/doco/inbox/CatalogPicker.vue'
    )
    el = document.createElement('div')
    document.body.appendChild(el)
    app = createApp({ render: () => h(CatalogPicker) })
    app.config.globalProperties.__ = globalThis.__
    app.mount(el)
    await nextTick()
    return el
  }
  const flush = async () => {
    for (let i = 0; i < 4; i++) await nextTick()
    await new Promise((r) => setTimeout(r, 0))
  }
  const click = async (node) => {
    node.dispatchEvent(new Event('click', { bubbles: true }))
    await flush()
  }
  const cards = (root) =>
    [...root.querySelectorAll('[aria-pressed]')].filter((b) =>
      b.getAttribute('aria-label')?.includes('iPhone'),
    )

  it('shows the sale price, the percent off and the result groups', async () => {
    const root = await mount()
    expect(root.querySelector('[data-testid="sale-badge"]').textContent).toBe(
      '-20%',
    )
    expect(root.textContent).toContain('$250')
    const groups = [...root.querySelectorAll('[data-testid="filter-group"]')]
    expect(
      groups.map((g) => g.textContent.replace(/\s+/g, ' ').trim()),
    ).toEqual(['Fundas 23', 'Micas 12'])
    await click(groups[1])
    expect(inbox.state.catalogFilters.group).toBe('Micas')
    expect(inbox.state.runCatalogSearch).toHaveBeenCalled()
    await click(root.querySelector('[data-testid="filter-on-sale"]'))
    expect(inbox.state.catalogFilters.onSale).toBe(true)
  })

  it('reviews the texts, takes a price for this message and sends what it shows', async () => {
    const root = await mount()
    for (const card of cards(root)) await click(card)
    const footer = root.querySelector('[data-testid="footer-template"]')
    footer.value = 'TPL-1'
    footer.dispatchEvent(new Event('change'))
    await flush()
    await click(root.querySelector('[data-testid="catalog-review-open"]'))
    const review = root.querySelector('[data-testid="catalog-review"]')
    expect(review).not.toBeNull()
    expect(inbox.state.catalogStoreLink).toHaveBeenCalledTimes(1)
    expect(
      root.querySelector('[data-testid="store-link"]').textContent,
    ).toContain('https://ventas.test/e/ab3cd5')
    const price = review.querySelector('input[inputmode="decimal"]')
    price.value = '180'
    price.dispatchEvent(new Event('input'))
    await flush()
    await click(root.querySelector('[data-testid="catalog-send"]'))
    const [codes, words] = inbox.state.sendCatalogItems.mock.calls[0]
    expect(codes).toEqual(['FUN-15PM', 'MICA-9H'])
    expect(words.captions).toEqual({
      'FUN-15PM': '🔥 Casetify Reflect iPhone 15 Pro Max\n$180',
      'MICA-9H': '🔥 Mica 9H iPhone 15 Pro Max\n$50',
    })
    expect(words.intro).toBe('Hola Ana, esto tenemos de 15 pro max 👇')
    expect(words.closing).toBe(
      '¿Te aparto alguna?\nVe más en la tienda: https://ventas.test/e/ab3cd5',
    )
  })

  it('sends straight from the grid with the chosen template', async () => {
    const root = await mount()
    await click(cards(root)[0])
    await click(root.querySelector('[data-testid="catalog-send"]'))
    const [, words] = inbox.state.sendCatalogItems.mock.calls[0]
    expect(words.captions['FUN-15PM']).toBe(
      '*Casetify Reflect iPhone 15 Pro Max*\n$200\nAntes ~$250~ · -20%',
    )
    expect(words.intro).toBe('')
    expect(inbox.state.catalogStoreLink).not.toHaveBeenCalled()
  })
})
