// Etiquetas straight to this computer's label printer (Muelle QZ): what QZ
// is asked to print, which printers it lists, and the worker's words when it
// cannot.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const qz = vi.hoisted(() => ({
  websocket: {
    isActive: vi.fn(() => true),
    connect: vi.fn(async () => {}),
    setClosedCallbacks: vi.fn(),
  },
  security: {
    setCertificatePromise: vi.fn(),
    setSignatureAlgorithm: vi.fn(),
    setSignaturePromise: vi.fn(),
  },
  printers: { find: vi.fn(async () => ['M110S', 'EPSON-TM-T20IIIL']) },
  configs: { create: vi.fn((printer, options) => ({ printer, options })) },
  print: vi.fn(async () => {}),
}))
vi.mock('qz-tray', () => ({ default: qz }))

import {
  QZ_UNAVAILABLE,
  labelPdfConfig,
  listQzPrinters,
  printLabelPdfViaQz,
} from '@/services/doco/qzTray'
import {
  chooseLabelPrinter,
  directProblem,
  findLabelPrinters,
  labelPrinter,
  printDirect,
  printsDirect,
} from '@/composables/etiquetasDirecto'

beforeEach(() => {
  localStorage.clear()
  qz.websocket.isActive.mockReturnValue(true)
  qz.print.mockClear()
  qz.configs.create.mockClear()
})
afterEach(() => chooseLabelPrinter(''))

describe('QZ, a PDF of labels', () => {
  it('prints at the label size with no margins and no orientation', () => {
    const config = labelPdfConfig({
      printerName: 'M110S',
      widthMm: 38,
      heightMm: 25,
      jobName: 'Cambios de precio',
    })
    expect(config).toMatchObject({
      size: { width: 38, height: 25 },
      units: 'mm',
      margins: 0,
      jobName: 'Cambios de precio',
    })
    // An orientation reaches the printer as a job option and turns the label.
    expect('orientation' in config).toBe(false)
  })

  it('sends the PDF to the printer named, as base64', async () => {
    await printLabelPdfViaQz('JVBERi0x', {
      printerName: 'M110S',
      widthMm: 38,
      heightMm: 25,
    })
    expect(qz.configs.create).toHaveBeenCalledWith(
      'M110S',
      expect.objectContaining({ size: { width: 38, height: 25 } }),
    )
    expect(qz.print.mock.calls[0][1]).toEqual([
      { type: 'pixel', format: 'pdf', flavor: 'base64', data: 'JVBERi0x' },
    ])
  })

  it('lists the printers without choosing the ticket printer', async () => {
    localStorage.setItem('doco_qz_printer_name', 'EPSON-TM-T20IIIL')
    expect(await listQzPrinters()).toEqual(['M110S', 'EPSON-TM-T20IIIL'])
    expect(localStorage.getItem('doco_qz_printer_name')).toBe(
      'EPSON-TM-T20IIIL',
    )
  })

  it('says QZ is not there when it does not answer', async () => {
    qz.websocket.isActive.mockReturnValue(false)
    qz.websocket.connect.mockRejectedValueOnce(new Error('refused'))
    await expect(listQzPrinters()).rejects.toThrow(QZ_UNAVAILABLE)
  })
})

describe('the label printer of this computer', () => {
  const LABEL = { w_mm: 38, h_mm: 25 }

  it('is kept in this browser', () => {
    chooseLabelPrinter('M110S')
    expect(labelPrinter.value).toBe('M110S')
    expect(localStorage.getItem('muelle:etiquetas:impresora')).toBe('M110S')
    chooseLabelPrinter('')
    expect(localStorage.getItem('muelle:etiquetas:impresora')).toBeNull()
  })

  it('prints direct on a computer with one, for a label with a size', () => {
    expect(printsDirect({ printer: 'M110S', layout: LABEL })).toBe(true)
    expect(printsDirect({ printer: '', layout: LABEL })).toBe(false)
    expect(printsDirect({ printer: 'M110S', layout: LABEL, phone: true })).toBe(
      false,
    )
    expect(
      printsDirect({ printer: 'M110S', layout: { w_mm: 0, h_mm: 0 } }),
    ).toBe(false)
  })

  it('says what went wrong and the way on', () => {
    expect(directProblem(new Error(QZ_UNAVAILABLE), 'M110S')).toBe(
      'Muelle QZ no está abierto en este equipo. Ábrelo y vuelve a intentar, o imprime con el diálogo.',
    )
    expect(
      directProblem(
        new Error('Cannot find printer with name "M110S"'),
        'M110S',
      ),
    ).toContain('ya no tiene la impresora «M110S»')
    expect(directProblem(new Error('boom'), 'M110S')).toContain(
      '«M110S» no recibió las etiquetas',
    )
  })

  it('prints through QZ and answers how it went', async () => {
    expect(
      await printDirect('JVBERi0x', {
        printer: 'M110S',
        layout: LABEL,
        title: 'Cambios de precio',
      }),
    ).toEqual({ ok: true })
    expect(qz.configs.create.mock.calls[0][1]).toMatchObject({
      size: { width: 38, height: 25 },
      jobName: 'Cambios de precio',
    })
    qz.print.mockRejectedValueOnce(new Error('boom'))
    expect(
      await printDirect('JVBERi0x', { printer: 'M110S', layout: LABEL }),
    ).toEqual({
      ok: false,
      reason: expect.stringContaining('«M110S» no recibió las etiquetas'),
    })
  })

  it('finds no printers and says so when QZ is not open', async () => {
    qz.websocket.isActive.mockReturnValue(false)
    qz.websocket.connect.mockRejectedValueOnce(new Error('refused'))
    expect(await findLabelPrinters()).toEqual({ printers: [], missing: true })
  })
})
