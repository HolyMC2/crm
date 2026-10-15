import { describe, expect, it, vi, afterEach } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import CfdiCard from '../../src/components/archivos/CfdiCard.vue'
import HuecosFiscales from '../../src/components/archivos/HuecosFiscales.vue'
import {
  fiscalDate,
  money,
  taxRate,
} from '../../src/components/archivos/fiscalFormat.js'

const FISCAL = 'doco.docoutils.documents.fiscal'
const UUID = 'A1B2C3D4-E5F6-4711-8899-AABBCCDDEEFF'

function cfdiCard(extra = {}) {
  return {
    schema: 'cfdi/1',
    version: '4.0',
    tipo: 'I',
    tipo_label: 'Ingreso',
    uuid: UUID,
    stamped: true,
    serie: 'A',
    folio: '123',
    fecha: '2026-09-20T10:11:12',
    date: '2026-09-20',
    moneda: 'MXN',
    tipo_cambio: 1,
    metodo_pago: 'PUE',
    metodo_pago_label: 'Pago en una sola exhibición',
    forma_pago: '03',
    forma_pago_label: 'Transferencia electrónica de fondos',
    subtotal: 1000,
    descuento: 0,
    total: 1160,
    emisor: {
      rfc: 'AAA010101AAA',
      nombre: 'Refacciones del Norte',
      regimen_fiscal: '601',
      regimen_fiscal_label: 'General de Ley Personas Morales',
    },
    receptor: {
      rfc: 'DOC010101XX1',
      nombre: 'Doco MX',
      uso_cfdi: 'G01',
      uso_cfdi_label: 'Adquisición de mercancías',
    },
    conceptos: Array.from({ length: 12 }, (_, i) => ({
      no_identificacion: `P-${i + 1}`,
      cantidad: 1,
      valor_unitario: 1000 / 12,
      importe: 1000 / 12,
      descripcion: `Pantalla ${i + 1}`,
    })),
    conceptos_count: 12,
    impuestos: {
      traslados: [
        {
          impuesto: '002',
          impuesto_label: 'IVA',
          tipo_factor: 'Tasa',
          tasa_o_cuota: 0.16,
          base: 1000,
          importe: 160,
        },
      ],
      retenciones: [],
      traslados_total: 160,
      retenciones_total: 0,
    },
    relaciones: [],
    timbre: { fecha_timbrado: '2026-09-20T10:15:00' },
    pagos: {},
    warnings: [],
    verify_url: `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${UUID}`,
    ...extra,
  }
}
function cardResponse(extra = {}) {
  return {
    document: 'DOC-1',
    modified: '2026-10-15 10:00:00.000001',
    available: true,
    reason: '',
    source: 'xml',
    card: cfdiCard(),
    direction: 'received',
    party: { doctype: 'Supplier', name: 'REFNORTE', title: 'Refacciones' },
    party_missing: null,
    records: [],
    sat: { available: true, estado: 'Vigente', efos: '', row: null },
    rendition: null,
    purchase: { allowed: true, reason: '', existing: null },
    can_edit: true,
    ...extra,
  }
}

async function settle() {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve()
    await nextTick()
    await new Promise((r) => setTimeout(r, 0))
  }
}

// `routes` maps a method suffix to a response (or a function of the args, or
// a list consumed one call at a time).
function stubApi(routes) {
  const calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      const method = url.split('/api/method/')[1]
      const args = JSON.parse(init.body)
      calls.push([method, args])
      const key = Object.keys(routes).find((k) => method.endsWith(k))
      let message = key ? routes[key] : null
      if (Array.isArray(message) && key !== '.gaps')
        message = message.length > 1 ? message.shift() : message[0]
      if (typeof message === 'function') message = message(args)
      if (message?.__error)
        return {
          ok: false,
          status: message.status || 417,
          json: async () => message.body,
        }
      return { ok: true, status: 200, json: async () => ({ message }) }
    }),
  )
  return calls
}

let app, root
function mount(component, props) {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(component, props) })
  app.config.globalProperties.__ = globalThis.__
  app.mount(root)
  return settle()
}
function button(label) {
  return [...root.querySelectorAll('button')].find(
    (b) => b.textContent.trim() === label,
  )
}
function click(el) {
  el.dispatchEvent(new Event('click'))
  return settle()
}

afterEach(() => {
  app?.unmount()
  root?.remove()
  app = root = null
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('es-MX fiscal formatting', () => {
  it('reads money, rates and CFDI dates the Mexican way', () => {
    expect(money(1160, 'MXN')).toBe('$1,160.00')
    expect(money(5, 'XYZ1')).toBe('5.00 XYZ1')
    expect(taxRate({ tipo_factor: 'Tasa', tasa_o_cuota: 0.16 })).toMatch(/16/)
    expect(taxRate({ tipo_factor: 'Exento' })).toBe('')
    expect(fiscalDate('2026-09-20')).toMatch(/20.*septiembre.*2026/)
    expect(fiscalDate('bogus')).toBe('bogus')
  })
})

describe('CFDI card', () => {
  it('shows who, how much, the fiscal folio and the SAT check', async () => {
    const calls = stubApi({ '.card': cardResponse() })
    await mount(CfdiCard, { name: 'DOC-1', rawText: '<cfdi:Comprobante/>' })
    expect(calls[0]).toEqual([`${FISCAL}.card`, { name: 'DOC-1' }])
    const text = root.textContent
    expect(text).toContain('Refacciones del Norte')
    expect(text).toContain('RFC AAA010101AAA')
    expect(text).toContain('Ingreso')
    expect(text).toContain('A-123')
    expect(text).toContain('$1,160.00')
    expect(text).toContain(UUID)
    expect(text).toContain('Stamped')
    expect(text).toContain('Valid at the SAT')
    expect(text).toContain('Tax transferred: IVA 16')
    const verify = [...root.querySelectorAll('a')].find((a) =>
      a.textContent.includes('Verify at the SAT'),
    )
    expect(verify.getAttribute('href')).toContain('verificacfdi')
    expect(verify.getAttribute('target')).toBe('_blank')
    expect(verify.getAttribute('rel')).toBe('noopener')
    // First 10 concepts, then the expander.
    expect(root.querySelectorAll('tbody tr')).toHaveLength(10)
    await click(button('See all 12 items'))
    expect(root.querySelectorAll('tbody tr')).toHaveLength(12)
    // The raw XML stays one tap away.
    expect(root.querySelector('pre')).toBeNull()
    await click(button('View XML'))
    expect(root.querySelector('pre').textContent).toContain('cfdi:Comprobante')
  })

  it('shows the exchange rate and a cancelled SAT state', async () => {
    stubApi({
      '.card': cardResponse({
        card: cfdiCard({ moneda: 'USD', tipo_cambio: 17.25 }),
        sat: { available: true, estado: 'Cancelado', efos: 'Definitivo' },
      }),
    })
    await mount(CfdiCard, { name: 'DOC-1' })
    expect(root.textContent).toContain('USD at an exchange rate of 17.25')
    expect(root.textContent).toContain('Cancelled at the SAT')
    expect(root.textContent).toContain(
      'Issuer on the SAT 69-B list: Definitivo',
    )
  })

  it('«Crear compra» opens the purchase Compras created and reports the change', async () => {
    const detail = { name: 'DOC-1', status: 'Linked' }
    const open =
      '/crm/gastos/factura/ACC-PINV-0009?return_to=%2Fcrm%2Farchivos%3Fdocument%3DDOC-1&return_label=Archivos'
    const calls = stubApi({
      '.card': cardResponse(),
      '.create_purchase': {
        status: 'created',
        purchase_invoice: 'ACC-PINV-0009',
        open_url: open,
        detail,
      },
    })
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    const changed = vi.fn()
    await mount(CfdiCard, { name: 'DOC-1', onChanged: changed })
    await click(button('Create purchase from this CFDI'))
    expect(calls.find(([m]) => m.endsWith('.create_purchase'))).toEqual([
      `${FISCAL}.create_purchase`,
      { name: 'DOC-1', expected_modified: '2026-10-15 10:00:00.000001' },
    ])
    expect(assign).toHaveBeenCalledWith(open)
    expect(changed).toHaveBeenCalledWith(detail)
  })

  it('needs_items: choosing a candidate teaches the line, then retries the purchase', async () => {
    const calls = stubApi({
      '.card': cardResponse(),
      '.create_purchase': [
        {
          status: 'needs_items',
          supplier: 'REFNORTE',
          matched: [],
          to_create: [
            {
              line: 1,
              descripcion: 'Pantalla iPhone 12',
              no_identificacion: 'P-1',
              cantidad: 2,
              rate: 500,
              candidates: [{ item_code: 'PANT-12', item_name: 'Pantalla 12' }],
            },
          ],
          items_url: '/desk/cfdi-import?uuid=x',
        },
        {
          status: 'created',
          purchase_invoice: 'ACC-PINV-0010',
          open_url: '/crm/gastos/factura/ACC-PINV-0010',
          detail: { name: 'DOC-1' },
        },
      ],
      '.learn_cfdi_line': { item_code: 'PANT-12', supplier_part_no: 'P-1' },
    })
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    await mount(CfdiCard, { name: 'DOC-1' })
    await click(button('Create purchase from this CFDI'))
    expect(root.textContent).toContain('Pantalla iPhone 12')
    expect(root.textContent).toContain('Pantalla 12')
    const inventario = [...root.querySelectorAll('a')].find((a) =>
      a.textContent.includes('Add them in Inventario'),
    )
    expect(inventario.getAttribute('href')).toBe('/desk/cfdi-import?uuid=x')
    await click(button('This is the product'))
    const methods = calls.map(([m]) => m)
    const learn = calls.find(([m]) => m.endsWith('.learn_cfdi_line'))
    expect(learn).toEqual([
      'doco.docoutils.cfdi_purchase_import.learn_cfdi_line',
      {
        supplier: 'REFNORTE',
        item_code: 'PANT-12',
        no_identificacion: 'P-1',
        descripcion: 'Pantalla iPhone 12',
      },
    ])
    expect(methods.filter((m) => m.endsWith('.create_purchase'))).toHaveLength(
      2,
    )
    expect(methods.lastIndexOf(`${FISCAL}.create_purchase`)).toBeGreaterThan(
      methods.indexOf(learn[0]),
    )
    expect(assign).toHaveBeenCalledWith('/crm/gastos/factura/ACC-PINV-0010')
  })

  it('needs_supplier: adds the supplier, then retries the purchase', async () => {
    const calls = stubApi({
      '.card': cardResponse({ party: null }),
      '.create_purchase': [
        {
          status: 'needs_supplier',
          emisor: { rfc: 'AAA010101AAA', nombre: 'Refacciones del Norte' },
          can_create_supplier: true,
        },
        { status: 'needs_items', supplier: 'REFNORTE', to_create: [] },
      ],
      '.create_supplier': { supplier: 'REFNORTE', created: true },
    })
    await mount(CfdiCard, { name: 'DOC-1' })
    await click(button('Create purchase from this CFDI'))
    expect(root.textContent).toContain(
      'Refacciones del Norte is not one of your suppliers yet.',
    )
    await click(button('Add supplier'))
    const methods = calls.map(([m]) => m.split('.').pop())
    expect(methods).toEqual([
      'card',
      'create_purchase',
      'create_supplier',
      'card',
      'create_purchase',
    ])
  })

  it('shows why a purchase cannot be created, or opens the existing one', async () => {
    stubApi({
      '.card': cardResponse({
        purchase: { allowed: false, reason: 'No es un CFDI de ingreso.' },
      }),
    })
    await mount(CfdiCard, { name: 'DOC-1' })
    expect(button('Create purchase from this CFDI').disabled).toBe(true)
    expect(root.textContent).toContain('No es un CFDI de ingreso.')
    app.unmount()
    root.remove()
    stubApi({
      '.card': cardResponse({
        purchase: { allowed: false, reason: '', existing: 'ACC-PINV-0001' },
      }),
    })
    await mount(CfdiCard, { name: 'DOC-1' })
    const link = [...root.querySelectorAll('a')].find((a) =>
      a.textContent.includes('Open purchase ACC-PINV-0001'),
    )
    expect(link.getAttribute('href')).toMatch(
      /^\/crm\/gastos\/factura\/ACC-PINV-0001\?return_to=%2Fcrm%2Farchivos%3Fdocument%3DDOC-1/,
    )
  })

  it('an automatic link can be undone from the card', async () => {
    const detail = { name: 'DOC-1', status: 'Review' }
    const calls = stubApi({
      '.card': cardResponse({
        records: [
          {
            doctype: 'Purchase Invoice',
            name: 'ACC-PINV-0003',
            title: 'ACC-PINV-0003',
            subtitle: 'Refacciones',
            reason: 'Mismo folio fiscal',
            linked: true,
            auto: true,
            can_undo: true,
          },
        ],
      }),
      '.undo_link': detail,
    })
    const changed = vi.fn()
    await mount(CfdiCard, { name: 'DOC-1', onChanged: changed })
    expect(root.textContent).toContain('Mismo folio fiscal')
    expect(root.textContent).toContain('Linked automatically')
    const record = [...root.querySelectorAll('a')].find((a) =>
      a.textContent.includes('ACC-PINV-0003'),
    )
    expect(record.getAttribute('href')).toMatch(
      /^\/crm\/gastos\/factura\/ACC-PINV-0003\?return_to=/,
    )
    await click(button('Undo'))
    expect(calls.find(([m]) => m.endsWith('.undo_link'))).toEqual([
      `${FISCAL}.undo_link`,
      {
        name: 'DOC-1',
        reference_doctype: 'Purchase Invoice',
        reference_name: 'ACC-PINV-0003',
        expected_modified: '2026-10-15 10:00:00.000001',
      },
    ])
    expect(changed).toHaveBeenCalledWith(detail)
    expect(calls.filter(([m]) => m.endsWith('.card'))).toHaveLength(2)
  })

  it('a file that is not a CFDI shows only the reason', async () => {
    stubApi({
      '.card': {
        document: 'DOC-2',
        available: false,
        reason: 'Este XML no es un CFDI.',
      },
    })
    await mount(CfdiCard, { name: 'DOC-2', rawText: '<x/>' })
    expect(root.textContent.trim()).toBe('Este XML no es un CFDI.')
    expect(root.querySelectorAll('button')).toHaveLength(0)
  })

  it('a CFDI PDF shows its fiscal folio and RFC until the XML arrives', async () => {
    stubApi({
      '.card': cardResponse({
        source: 'pdf',
        card: null,
        pdf_hints: { uuid: UUID, rfcs: ['AAA010101AAA'] },
        purchase: null,
      }),
    })
    await mount(CfdiCard, { name: 'DOC-3' })
    expect(root.textContent).toContain(`Fiscal folio ${UUID}`)
    expect(root.textContent).toContain('AAA010101AAA')
    expect(button('Create purchase from this CFDI')).toBeUndefined()
  })

  it('a failed load explains itself and retries', async () => {
    stubApi({
      '.card': {
        __error: true,
        status: 500,
        body: { exc_type: 'Exception' },
      },
    })
    await mount(CfdiCard, { name: 'DOC-1' })
    expect(button('Try again')).toBeTruthy()
    stubApi({ '.card': cardResponse() })
    await click(button('Try again'))
    expect(root.textContent).toContain('Refacciones del Norte')
  })
})

describe('Huecos fiscales', () => {
  function gaps(extra = {}) {
    return {
      company: 'Doco MX',
      kinds: [
        {
          key: 'sin_cfdi',
          label: 'Compras sin CFDI',
          count: 100,
          more: true,
          hint: 'Compras de hace más de 7 días sin su CFDI.',
        },
        { key: 'pdf_sin_xml', label: 'PDF sin XML', count: 1, more: false },
      ],
      kind: 'sin_cfdi',
      rows: [
        {
          key: 'sin_cfdi:Purchase Invoice:ACC-PINV-0001',
          kind: 'sin_cfdi',
          doctype: 'Purchase Invoice',
          name: 'ACC-PINV-0001',
          title: 'Refacciones del Norte',
          subtitle: 'ACC-PINV-0001',
          date: '2026-09-20',
          amount: 1160,
          currency: 'MXN',
          reason: 'Registrada hace 12 días sin CFDI.',
          actions: [
            {
              label: 'Subir CFDI',
              kind: 'route',
              target:
                '/crm/archivos?target=Purchase%20Invoice%2FACC-PINV-0001&return_to=%2Fcrm%2Farchivos',
            },
            {
              label: 'Abrir compra',
              kind: 'route',
              target: '/crm/gastos/factura/ACC-PINV-0001',
            },
            { label: 'Ver PDF', kind: 'open_document', target: 'DOC-7' },
            {
              label: 'Revisar',
              kind: 'call',
              target: 'doco.docoutils.documents.fiscal_gaps.recheck',
              args: { name: 'ACC-PINV-0001' },
            },
          ],
        },
      ],
      has_more: false,
      sat_enabled: true,
      sat_reason: '',
      ...extra,
    }
  }

  it('lists kinds with counts and rows with their next step', async () => {
    const calls = stubApi({
      '.gaps': gaps(),
      '.recheck': { message: 'Revisada.' },
    })
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    const openDocument = vi.fn()
    await mount(HuecosFiscales, {
      company: 'Doco MX',
      returnTo: '/crm/archivos?view=huecos_fiscales',
      onOpenDocument: openDocument,
    })
    expect(calls[0]).toEqual([
      'doco.docoutils.documents.fiscal_gaps.gaps',
      { company: 'Doco MX', kind: '', page: 1, days: 7 },
    ])
    const tabs = [...root.querySelectorAll('[role="tab"]')]
    expect(tabs.map((t) => t.textContent.replace(/\s+/g, ' ').trim())).toEqual([
      'Compras sin CFDI 100+',
      'PDF sin XML 1',
    ])
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(root.textContent).toContain('Compras de hace más de 7 días')
    expect(root.textContent).toContain('Registrada hace 12 días sin CFDI.')
    expect(root.textContent).toContain('$1,160.00')

    // A route that already returns somewhere keeps it.
    await click(button('Subir CFDI'))
    expect(assign).toHaveBeenLastCalledWith(
      '/crm/archivos?target=Purchase%20Invoice%2FACC-PINV-0001&return_to=%2Fcrm%2Farchivos',
    )
    // One without a way back returns to this queue.
    await click(button('Abrir compra'))
    const opened = new URL(assign.mock.lastCall[0], 'https://muelle.invalid')
    expect(opened.pathname).toBe('/crm/gastos/factura/ACC-PINV-0001')
    expect(opened.searchParams.get('return_to')).toBe(
      '/crm/archivos?view=huecos_fiscales',
    )

    await click(button('Ver PDF'))
    expect(openDocument).toHaveBeenCalledWith('DOC-7')

    await click(button('Revisar'))
    expect(calls.find(([m]) => m.endsWith('.recheck'))[1]).toEqual({
      name: 'ACC-PINV-0001',
    })
    expect(root.textContent).toContain('Revisada.')
    expect(calls.filter(([m]) => m.endsWith('.gaps'))).toHaveLength(2)
  })

  it('a kind change reloads and tells the host, with an empty state per kind', async () => {
    const calls = stubApi({
      '.gaps': (args) =>
        args.kind === 'pdf_sin_xml'
          ? gaps({ kind: 'pdf_sin_xml', rows: [] })
          : gaps(),
    })
    const kindChange = vi.fn()
    await mount(HuecosFiscales, {
      company: 'Doco MX',
      onKindChange: kindChange,
    })
    const tab = [...root.querySelectorAll('[role="tab"]')][1]
    await click(tab)
    expect(kindChange).toHaveBeenCalledWith('pdf_sin_xml')
    expect(calls.at(-1)[1].kind).toBe('pdf_sin_xml')
    expect(root.textContent).toContain(
      'Every PDF with a fiscal folio has its XML. All in order.',
    )
  })

  it('says why the SAT kinds are missing, and pages', async () => {
    const calls = stubApi({
      '.gaps': (args) =>
        gaps({
          sat_enabled: false,
          sat_reason: 'Tu plan no incluye la consulta al SAT.',
          has_more: args.page === 1,
          rows: gaps().rows.map((r) => ({
            ...r,
            key: `${r.key}:${args.page}`,
          })),
        }),
    })
    await mount(HuecosFiscales, { company: 'Doco MX', kind: 'sin_cfdi' })
    expect(root.querySelector('[role="note"]').textContent).toContain(
      'Tu plan no incluye la consulta al SAT.',
    )
    await click(button('Load more'))
    expect(calls.at(-1)[1]).toMatchObject({ kind: 'sin_cfdi', page: 2 })
    expect(root.querySelectorAll('ul > li')).toHaveLength(2)
    expect(button('Load more')).toBeUndefined()
  })

  it('a failed load offers a retry', async () => {
    stubApi({
      '.gaps': { __error: true, status: 500, body: { exc_type: 'Exception' } },
    })
    await mount(HuecosFiscales, { company: 'Doco MX' })
    expect(button('Try again')).toBeTruthy()
    stubApi({ '.gaps': gaps({ rows: [] }) })
    await click(button('Try again'))
    expect(root.textContent).toContain(
      'No purchases without a CFDI. All in order.',
    )
  })
})

describe('Spanish catalog', () => {
  it('has an es entry for every string the CFDI card and the gaps queue show', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
    const catalog = new Map()
    for (const m of po.matchAll(
      /^msgid "((?:[^"\\]|\\.)*)"\nmsgstr "((?:[^"\\]|\\.)*)"/gm,
    ))
      catalog.set(m[1], m[2])
    for (const file of ['CfdiCard.vue', 'HuecosFiscales.vue']) {
      const source = readFileSync(
        resolve(here, '../../src/components/archivos', file),
        'utf8',
      )
      const strings = [
        ...source.matchAll(/__\(\s*(['"])((?:(?!\1).)+)\1/gs),
      ].map((m) => m[2])
      expect(strings.length, file).toBeGreaterThan(10)
      for (const text of strings)
        expect(catalog.get(text), `${file}: ${text}`).toBeTruthy()
    }
  })
})
