// Impresión (Shell D12): the print preview and the owner's format editor
// rules, plus the owner-default rule of the «Imprimir o PDF» curation.
import { describe, expect, it } from 'vitest'
import {
  applyTab,
  copyName,
  designerUrl,
  fieldSnippet,
  filterFields,
  filterGroups,
  fitScale,
  formatChips,
  formatSubtitle,
  groupTitle,
  insertAt,
  kindIcon,
  kindText,
  lineCount,
  pinchZoom,
  previewDocument,
  stepZoom,
  tableSnippet,
  valueSnippet,
  zoomText,
  ZOOMS,
} from '@/components/impresion/impresion'

describe('kinds and rows in the owner’s words', () => {
  it('names every kind the server sends, and a fallback', () => {
    expect(kindText('jinja')).toBe('Jinja')
    expect(kindText('pd')).toBe('Print Designer')
    expect(kindText('builder')).toBe('Constructor')
    expect(kindText('standard')).toBe('Estándar')
    expect(kindText('js')).toBe('Punto de venta')
    expect(kindText('nope')).toBe('Constructor')
    expect(kindIcon('jinja')).toBe('lucide-code')
    expect(kindIcon('pd')).toBe('lucide-palette')
    expect(kindIcon('builder')).toBe('lucide-file-text')
  })

  it('says standard and disabled on the second line, never English', () => {
    expect(
      formatSubtitle({ kind: 'jinja', standard: true, disabled: false }),
    ).toBe('Jinja · de fábrica')
    expect(
      formatSubtitle({ kind: 'pd', standard: false, disabled: true }),
    ).toBe('Print Designer · apagado')
    expect(formatSubtitle({ kind: 'standard' })).toBe(
      'Diseño básico con todos los campos',
    )
  })

  it('titles a section with the shell’s word for the type', () => {
    expect(
      groupTitle({ doctype: 'Sales Invoice', label: 'Factura de venta' }),
    ).toBe('Factura')
    expect(groupTitle({ doctype: 'Quotation', label: 'Cotización' })).toBe(
      'Cotización',
    )
    expect(groupTitle({ doctype: 'Dhru Order', label: 'Orden Dhru' })).toBe(
      'Orden Dhru',
    )
  })

  it('searches types and formats without accents', () => {
    const groups = [
      {
        doctype: 'Quotation',
        label: 'Cotización',
        formats: [{ label: 'Cotización' }, { label: 'Estándar' }],
      },
      {
        doctype: 'Sales Invoice',
        label: 'Factura de venta',
        formats: [
          { label: 'Factura CFDI 4.0' },
          { label: 'Ticket de enganche' },
        ],
      },
    ]
    expect(filterGroups(groups, 'cotizacion').map((g) => g.doctype)).toEqual([
      'Quotation',
    ])
    const found = filterGroups(groups, 'enganche')
    expect(found).toHaveLength(1)
    expect(found[0].formats.map((f) => f.label)).toEqual(['Ticket de enganche'])
    expect(filterGroups(groups, '')).toBe(groups)
  })
})

describe('preview scale and zoom', () => {
  it('fits an A4 page in a 412px phone and never upscales', () => {
    const s = fitScale(412, 800)
    expect(s).toBeCloseTo((412 - 32) / 800)
    expect(fitScale(1440, 800)).toBe(1)
    expect(fitScale(412, 302)).toBe(1) // an 80 mm ticket fits as is
    expect(fitScale(0, 800)).toBe(1)
    expect(fitScale(305, 800)).toBeGreaterThan(0.3)
  })

  it('steps through the zoom levels and clamps a pinch', () => {
    expect(stepZoom(1, 1)).toBe(1.25)
    expect(stepZoom(1, -1)).toBe(0.75)
    expect(stepZoom(ZOOMS.at(-1), 1)).toBe(ZOOMS.at(-1))
    expect(stepZoom(ZOOMS[0], -1)).toBe(ZOOMS[0])
    expect(stepZoom(1.1, 1)).toBe(1.25)
    expect(pinchZoom(1, 100, 200)).toBe(2)
    expect(pinchZoom(1, 100, 10)).toBe(ZOOMS[0])
    expect(pinchZoom(2, 100, 1000)).toBe(ZOOMS.at(-1))
    expect(pinchZoom(1.5, 0, 50)).toBe(1.5)
    expect(zoomText(1)).toBe('100%')
    expect(zoomText(0.75)).toBe('75%')
  })

  it('builds the iframe page with printview’s stylesheet and no scripts', () => {
    const doc = previewDocument({
      html: '<h1>Ana López</h1>',
      style: '.print-format{width:8.3in}',
      css: '/assets/frappe/dist/css/print.bundle.X.css',
    })
    expect(doc).toContain('<h1>Ana López</h1>')
    expect(doc).toContain('href="/assets/frappe/dist/css/print.bundle.X.css"')
    expect(doc).toContain('.print-format{width:8.3in}')
    expect(doc).toContain('lang="es-MX"')
    expect(doc).not.toContain('<script')
  })
})

describe('field snippets', () => {
  it('prints plain fields as is and money, numbers and dates formatted', () => {
    expect(
      valueSnippet({ fieldname: 'customer_name', fieldtype: 'Data' }),
    ).toBe('{{ doc.customer_name }}')
    expect(
      valueSnippet({ fieldname: 'grand_total', fieldtype: 'Currency' }),
    ).toBe('{{ doc.get_formatted("grand_total") }}')
    expect(fieldSnippet({ fieldname: 'posting_date', fieldtype: 'Date' })).toBe(
      '{{ doc.get_formatted("posting_date") }}',
    )
    expect(
      fieldSnippet({ fieldname: 'qty', fieldtype: 'Float', row: true }),
    ).toBe('{{ row.get_formatted("qty") }}')
  })

  it('loops a child table with its usual columns', () => {
    const items = {
      fieldname: 'items',
      table: true,
      children: [
        { fieldname: 'item_code', fieldtype: 'Link' },
        { fieldname: 'item_name', fieldtype: 'Data' },
        { fieldname: 'description', fieldtype: 'Text Editor' },
        { fieldname: 'qty', fieldtype: 'Float' },
        { fieldname: 'rate', fieldtype: 'Currency' },
        { fieldname: 'amount', fieldtype: 'Currency' },
      ],
    }
    const loop = fieldSnippet(items)
    expect(loop.split('\n')[0]).toBe('{% for row in doc.items %}')
    expect(loop.split('\n').at(-1)).toBe('{% endfor %}')
    expect(loop).toContain('{{ row.item_name }}')
    expect(loop).toContain('{{ row.get_formatted("qty") }}')
    expect(loop).not.toContain('row.description')
    expect(loop).not.toContain('row.item_code')
    // A table without the usual columns loops over its first ones.
    expect(
      tableSnippet({
        fieldname: 'taxes',
        table: true,
        children: [{ fieldname: 'account_head', fieldtype: 'Link' }],
      }),
    ).toContain('{{ row.account_head }}')
  })

  it('finds fields by Spanish label or name', () => {
    const fields = [
      { fieldname: 'customer_name', label: 'Nombre del cliente' },
      { fieldname: 'tax_id', label: 'RFC' },
    ]
    expect(filterFields(fields, 'rfc').map((f) => f.fieldname)).toEqual([
      'tax_id',
    ])
    expect(filterFields(fields, 'customer')).toHaveLength(1)
    expect(filterFields(fields, '')).toBe(fields)
  })
})

describe('the code editor', () => {
  it('counts lines and inserts at the caret', () => {
    expect(lineCount('')).toBe(1)
    expect(lineCount('a\nb\n')).toBe(3)
    expect(insertAt('<p></p>', 3, 3, '{{ doc.x }}')).toEqual({
      text: '<p>{{ doc.x }}</p>',
      start: 14,
      end: 14,
    })
    expect(insertAt('abc', 1, 2, 'X').text).toBe('aXc')
  })

  it('indents with Tab and outdents with Shift+Tab', () => {
    expect(applyTab('ab', 1, 1)).toEqual({ text: 'a  b', start: 3, end: 3 })
    const block = applyTab('a\nb\nc', 0, 3)
    expect(block.text).toBe('  a\n  b\nc')
    expect(applyTab(block.text, 0, 7, true).text).toBe('a\nb\nc')
    expect(applyTab('  a', 3, 3, true)).toEqual({ text: 'a', start: 1, end: 1 })
    expect(applyTab('a', 1, 1, true).text).toBe('a')
  })

  it('names a copy and links Print Designer', () => {
    expect(copyName('Factura CFDI 4.0')).toBe('Factura CFDI 4.0 (copia)')
    expect(copyName('X', ['X (copia)'])).toBe('X (copia 2)')
    expect(designerUrl('Sales Invoice PD Format v2')).toBe(
      '/desk/print-designer/Sales%20Invoice%20PD%20Format%20v2',
    )
  })
})

describe('Vista previa format chips', () => {
  const formats = [
    { name: 'Standard', label: 'Standard', default: true },
    { name: 'Factura CFDI 4.0', label: 'Factura CFDI 4.0' },
  ]
  it('says «Estándar» and keeps the curated order', () => {
    expect(formatChips(formats, 'Standard')).toEqual([
      { value: 'Standard', label: 'Estándar' },
      { value: 'Factura CFDI 4.0', label: 'Factura CFDI 4.0' },
    ])
  })
  it('puts the opening format first when the list left it out', () => {
    expect(formatChips(formats, 'Ticket').map((c) => c.value)).toEqual([
      'Ticket',
      'Standard',
      'Factura CFDI 4.0',
    ])
    expect(formatChips([], '')).toEqual([])
  })
})

describe('Compartir from the preview', () => {
  it('shares the PDF without the letterhead when «Membrete» is off', async () => {
    const { shareDocument } = await import('@/documentos/tools')
    const urls = []
    const shared = []
    const prev = { fetch: globalThis.fetch, nav: globalThis.navigator }
    globalThis.fetch = async (url) => {
      urls.push(String(url))
      return { ok: true, blob: async () => new Blob(['%PDF']) }
    }
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { canShare: () => true, share: async (data) => shared.push(data) },
    })
    try {
      const base = {
        doctype: 'Sales Invoice',
        name: 'ACC-1',
        title: 'Factura ACC-1',
      }
      expect(await shareDocument({ ...base, letterhead: false })).toBe('shared')
      expect(await shareDocument(base)).toBe('shared')
    } finally {
      globalThis.fetch = prev.fetch
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: prev.nav,
      })
    }
    expect(urls[0]).toContain('no_letterhead=1')
    expect(urls[1]).not.toContain('no_letterhead')
    expect(shared[0].files[0].name).toBe('Factura ACC-1.pdf')
  })
})
