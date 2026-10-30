// «Pedir firma» on a deal quote: the quote becomes the customer's page to sign, accept
// and (with «Cobro en línea») pay. The panel says why it cannot ask, offers the switch
// to whoever may turn it on, and sends the link's message into the deal's chat.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'

const calls = []
let handler
vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  call: vi.fn((method, args) => {
    calls.push([method, args])
    return Promise.resolve(handler(method, args))
  }),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/composables/inbox', () => ({
  salesDocsEnabled: { value: false },
}))
vi.mock('@/composables/crmFormat', () => ({
  formatMoney: (n) => `$${Number(n || 0).toFixed(2)}`,
}))

import QuoteFirmaPanel from '@/components/doco/inbox/QuoteFirmaPanel.vue'
import { firmaLine, paymentLine } from '@/utils/quoteFirma'

const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
const short = (method) => method.split('.').pop()
const buttonNamed = (label) =>
  [...document.body.querySelectorAll('button')].find(
    (b) => b.textContent.trim() === label,
  )

let app
async function mount(sheet) {
  calls.length = 0
  handler = (method) => {
    const name = short(method)
    if (name === 'deal_sheet') return sheet
    if (name === 'deal_request')
      return {
        ok: true,
        created: true,
        share: {
          url: 'https://x/f/abc',
          text: 'Hola Ana, acéptala aquí: https://x/f/abc',
        },
      }
    if (name === 'deal_enable') return { ...sheet, off: null }
    return {}
  }
  const root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp(QuoteFirmaPanel, {
    deal: 'CRM-DEAL-1',
    quotation: 'SAL-QTN-1',
    to: '5216691234567',
  })
  app.config.globalProperties.__ = (text) => text
  app.mount(root)
  await flush()
}

afterEach(() => {
  app?.unmount()
  document.body.innerHTML = ''
})

const base = {
  available: true,
  can_ask: true,
  off: null,
  problems: [],
  stamp: 'c:100.00:abc',
  amount: 100,
  currency: 'MXN',
  payment_enabled: true,
  request: null,
  share: null,
  payment: null,
}

describe('QuoteFirmaPanel', () => {
  it('switched off: says so and offers the switch to whoever may turn it on', async () => {
    await mount({
      ...base,
      off: {
        code: 'off',
        message: 'La aceptación en línea de cotizaciones está apagada.',
        actions: ['enable'],
      },
    })
    expect(document.body.textContent).toContain('está apagada')
    buttonNamed('Encender aceptación en línea').click()
    await flush()
    expect(calls.map(([m]) => short(m))).toContain('deal_enable')
    expect(buttonNamed('Crear enlace y enviarlo al chat')).toBeTruthy()
  })

  it('creates the link once and sends its message into the deal chat', async () => {
    await mount(base)
    buttonNamed('Crear enlace y enviarlo al chat').click()
    await flush()
    const request = calls.find(([m]) => short(m) === 'deal_request')[1]
    expect(request).toMatchObject({
      deal: 'CRM-DEAL-1',
      quotation: 'SAL-QTN-1',
      expected_stamp: 'c:100.00:abc',
    })
    expect(request.request_uuid).toMatch(/^[0-9a-f]{32}$/)
    const send = calls.find(
      ([m]) => m === 'doco_marketing.api.inbox.send_message',
    )[1]
    expect(send).toMatchObject({
      reference_doctype: 'CRM Deal',
      reference_name: 'CRM-DEAL-1',
      channel: 'whatsapp',
      content: 'Hola Ana, acéptala aquí: https://x/f/abc',
      to: '5216691234567',
    })
  })

  it('a quote that cannot be asked shows why and no send button', async () => {
    await mount({
      ...base,
      problems: [
        {
          code: 'answered',
          message: 'La cotización ya tiene su orden de venta.',
          actions: [],
        },
      ],
    })
    expect(document.body.textContent).toContain('ya tiene su orden de venta')
    expect(buttonNamed('Crear enlace y enviarlo al chat')).toBeFalsy()
  })

  it('a signed quote shows who accepted and the pay step', async () => {
    await mount({
      ...base,
      problems: [
        {
          code: 'answered',
          message: 'La cotización ya tiene su orden de venta.',
          actions: [],
        },
      ],
      request: {
        name: 'FIR-1',
        state: 'Firmada',
        signer_name: 'Ana López',
        decided_at: '',
      },
      payment: {
        state: 'open',
        amount: 100,
        currency: 'MXN',
        url: 'https://mp',
      },
    })
    expect(document.body.textContent).toContain('Aceptó con firma · Ana López')
    expect(document.body.textContent).toContain('Enlace de pago listo por')
    expect(buttonNamed('Cancelar enlace')).toBeFalsy()
  })
})

describe('firma lines', () => {
  it('an open link says whether the customer opened it', () => {
    expect(
      firmaLine({ state: 'Pendiente', created: '', opened_at: 'x' }),
    ).toContain('abrió la cotización')
    expect(firmaLine({ state: 'Reemplazada' })).toContain(
      'La cotización cambió',
    )
  })
  it('the pay step in the worker’s words', () => {
    expect(paymentLine({ state: 'paid', amount: 5 }, (n) => `$${n}`)).toBe(
      'Pagó $5',
    )
    expect(paymentLine(null)).toBe('')
  })
})
