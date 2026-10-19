// Correo (Shell D12): the compose sheet's rules (recipients, review, the PDF
// name), the queue's words (time, category rows, who) and where a linked
// record opens.
import { describe, expect, it, vi } from 'vitest'

const calls = []
vi.mock('frappe-ui', () => ({
  call: (method, params) => {
    calls.push({ method, params })
    return Promise.resolve({})
  },
}))

const {
  addRecipients,
  attachmentName,
  bandeja,
  categoryLabel,
  cleanSubject,
  documentChip,
  documentTo,
  emptyCopy,
  enviar,
  isEmail,
  newRequestId,
  recipientName,
  reviewOf,
  rowWho,
  scrollSheetToTop,
  senderInitials,
  senderName,
  sentToast,
  shortWhen,
  splitEmails,
  splitTemplates,
} = await import('@/components/correo/correo')

const NOW = new Date(2026, 9, 18, 17, 0)

describe('recipients', () => {
  it('accepts plain addresses only and keeps typos in the field', () => {
    expect(isEmail('ana@cliente.mx')).toBe(true)
    for (const bad of ['ana', 'ana@', 'ana@cliente', 'a b@x.mx', ''])
      expect(isEmail(bad)).toBe(false)
    expect(splitEmails('Ana <Ana@X.mx>, beto@y.mx; ana@x.mx')).toEqual([
      'ana@x.mx',
      'beto@y.mx',
    ])
    expect(addRecipients(['ana@x.mx'], 'beto@y.mx, mal@, ana@x.mx')).toEqual({
      para: ['ana@x.mx', 'beto@y.mx'],
      invalid: ['mal@'],
    })
  })

  it('names people by the suggestion, never inventing one', () => {
    const sugg = [{ email: 'ana@x.mx', nombre: 'Ana López' }]
    expect(recipientName('ana@x.mx', sugg)).toBe('Ana López')
    expect(recipientName('beto@y.mx', sugg)).toBe('beto@y.mx')
    expect(sentToast(['ana@x.mx'], sugg)).toBe('Enviado a Ana López')
    expect(sentToast(['ana@x.mx', 'beto@y.mx'], sugg)).toBe(
      'Enviado a Ana López y beto@y.mx',
    )
    expect(sentToast(['a@x.mx', 'b@x.mx', 'c@x.mx'])).toBe(
      'Enviado a a@x.mx y 2 más',
    )
  })
})

describe('review before sending', () => {
  const base = {
    puede: true,
    para: ['ana@x.mx'],
    asunto: ' Factura ACC-SINV-2026-03523 de Grupo Doco ',
    cuerpo: 'Hola Ana,\n\nTe compartimos la factura.',
    pdf: true,
    formato: 'Factura CFDI 4.0',
    adjunto: attachmentName('Factura', 'ACC-SINV-2026-03523'),
  }

  it('shows exactly what goes, trimmed, with the PDF name', () => {
    const r = reviewOf(base)
    expect(r.ok).toBe(true)
    expect(r.para).toEqual(['ana@x.mx'])
    expect(r.asunto).toBe('Factura ACC-SINV-2026-03523 de Grupo Doco')
    expect(r.adjunto).toBe('Factura ACC-SINV-2026-03523.pdf')
    expect(reviewOf({ ...base, pdf: false }).adjunto).toBe('')
  })

  it('says why it cannot go yet, permission first', () => {
    expect(reviewOf({ ...base, puede: false, motivo: 'Sin permiso' })).toEqual({
      ok: false,
      reason: 'Sin permiso',
    })
    expect(reviewOf({ ...base, para: [] }).reason).toMatch(/destinatario/)
    expect(reviewOf({ ...base, para: ['mal@'] }).reason).toMatch(/Revisa/)
    expect(reviewOf({ ...base, asunto: '  ' }).reason).toMatch(/asunto/)
    expect(reviewOf({ ...base, cuerpo: '' }).reason).toMatch(/mensaje/)
  })

  it('makes one key per confirmed send', () => {
    const a = newRequestId(1000, () => 0.5)
    expect(a).toBe(newRequestId(1000, () => 0.5))
    expect(a).not.toBe(newRequestId(1001, () => 0.5))
    expect(a.startsWith('correo-')).toBe(true)
  })

  it('puts the templates made for this record first', () => {
    const { propias, otras } = splitTemplates([
      { name: 'A', encaja: false },
      { name: 'B', encaja: true },
    ])
    expect(propias.map((p) => p.name)).toEqual(['B'])
    expect(otras.map((p) => p.name)).toEqual(['A'])
  })

  it('sends lists as JSON and drops empty arguments', async () => {
    calls.length = 0
    await enviar({
      doctype: 'Sales Invoice',
      name: 'X',
      para: ['a@x.mx'],
      cc: '',
    })
    expect(calls[0].method).toBe('crm.api.correo.enviar')
    expect(calls[0].params).toEqual({
      doctype: 'Sales Invoice',
      name: 'X',
      para: '["a@x.mx"]',
    })
    await bandeja({ vista: 'enviados', inicio: 0 })
    expect(calls[1].params).toEqual({ vista: 'enviados', inicio: 0 })
  })
})

describe('the queue', () => {
  it('writes time as Gmail does', () => {
    expect(shortWhen('2026-10-18 09:05:00', { now: NOW })).toBe('09:05')
    expect(shortWhen('2026-10-17 09:05:00', { now: NOW })).toBe('ayer')
    expect(shortWhen('2026-10-02 09:05:00', { now: NOW })).toMatch(/^2 oct/)
    expect(shortWhen('2025-12-02 09:05:00', { now: NOW })).toMatch(/2025/)
    expect(shortWhen('', { now: NOW })).toBe('')
  })

  it('folds alerts into one row with a count, in Spanish', () => {
    const cat = {
      categoria: 'sistema',
      titulo: 'System alerts',
      total: 424,
      nuevos: 0,
      remitentes: ['System'],
      asuntos: [
        '⚠️ Saldo TAECEL bajo en 2 bolsa(s)',
        'MAT-MR-1 has been received',
      ],
    }
    expect(categoryLabel(cat)).toEqual({
      title: 'Avisos del sistema',
      line: '424 avisos automáticos',
      badge: '424',
      fresh: false,
    })
    // No raw (English) alert subject; the latest one's time instead.
    expect(
      categoryLabel({ ...cat, fecha: '2026-10-18 14:00:00' }, { now: NOW })
        .line,
    ).toBe('424 avisos automáticos · último hace 3 h')
    expect(categoryLabel({ ...cat, total: 1 }).line).toBe('1 aviso automático')
    expect(categoryLabel({ ...cat, nuevos: 12 }).badge).toBe('12 nuevos')
    expect(categoryLabel({ ...cat, nuevos: 1 }).badge).toBe('1 nuevo')
    expect(
      categoryLabel({
        categoria: 'asunto',
        titulo: '⚠️ Pedido listo',
        remitentes: ['Proveedor'],
        total: 4,
        nuevos: 0,
      }).title,
    ).toBe('Pedido listo')
    expect(cleanSubject('¿Me mandas la factura?')).toBe(
      '¿Me mandas la factura?',
    )
  })

  it('names who: the sender, «Sistema» for alerts, «Para …» for sent mail', () => {
    expect(senderName({ nombre: 'System', correo: '' })).toBe('Sistema')
    expect(senderInitials({ nombre: 'System', correo: '' })).toBe('')
    expect(senderInitials({ nombre: 'Ana López', correo: 'ana@x.mx' })).toBe(
      'AL',
    )
    expect(
      rowWho({
        direccion: 'enviado',
        de: { nombre: 'Yo', correo: 'yo@x.mx' },
        para: [{ correo: 'ana@x.mx', nombre: 'Ana López' }],
      }),
    ).toBe('Para Ana López')
    expect(
      rowWho({
        direccion: 'enviado',
        para: [
          { correo: 'a@x.mx' },
          { correo: 'b@x.mx' },
          { correo: 'c@x.mx' },
        ],
      }),
    ).toBe('Para a@x.mx y 2 más')
    expect(
      rowWho({
        direccion: 'recibido',
        de: { nombre: 'Ana', correo: 'a@x.mx' },
      }),
    ).toBe('Ana')
  })

  it('titles the document chip by party, never the ID alone', () => {
    expect(
      documentChip({
        etiqueta: 'Factura',
        titulo: 'Cliente prueba D5',
        nombre: 'ACC-SINV-2026-03523',
      }),
    ).toBe('Factura · Cliente prueba D5')
    expect(documentChip({ etiqueta: 'Factura', titulo: '', nombre: 'X' })).toBe(
      'Factura',
    )
    expect(documentChip(null)).toBe('')
  })

  it('opens a linked invoice on its shell page, and nothing when unreadable', () => {
    const to = documentTo({
      doctype: 'Sales Invoice',
      nombre: 'ACC-SINV-2026-03523',
      ruta: '/documentos/tipo/Sales%20Invoice/ACC-SINV-2026-03523',
    })
    expect(to.path).toBe('/documentos/facturas/ACC-SINV-2026-03523')
    expect(
      documentTo({ doctype: 'Sales Invoice', nombre: 'X', ruta: null }),
    ).toBe(null)
    expect(
      documentTo({
        doctype: 'Note',
        nombre: 'n1',
        ruta: '/documentos/tipo/Note/n1',
      }).path,
    ).toBe('/documentos/tipo/Note/n1')
  })

  it('explains an empty queue in plain Spanish', () => {
    const recibidos = emptyCopy({ vista: 'recibidos', cuentas: 2 })
    expect(recibidos.message).toMatch(/cuentas que puedes leer/)
    expect(emptyCopy({ vista: 'recibidos', cuentas: 0 }).message).toMatch(
      /encargado/,
    )
    expect(emptyCopy({ vista: 'enviados' }).title).toBe('Aún no hay enviados')
    expect(emptyCopy({ buscar: 'taecel' }).message).toMatch(/taecel/)
  })
})

describe('sheet steps', () => {
  it('starts each step at the top of the sheet scroller', () => {
    document.body.innerHTML = `<div data-ui-sheet-body style="overflow-y:auto;height:100px">
      <div><span id="anchor"></span><div style="height:900px"></div></div></div>`
    const body = document.querySelector('[data-ui-sheet-body]')
    body.scrollTop = 83
    expect(scrollSheetToTop(document.getElementById('anchor'))).toBe(body)
    expect(body.scrollTop).toBe(0)
  })
  it('does nothing outside a sheet', () => {
    document.body.innerHTML = '<span id="loose"></span>'
    expect(scrollSheetToTop(document.getElementById('loose'))).toBeNull()
    expect(scrollSheetToTop(null)).toBeNull()
  })
})
