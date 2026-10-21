import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MAX_PAGES,
  PAGE_MAX_BYTES,
  cameraProblem,
  fitSize,
  initialKind,
  movePage,
  offeredKinds,
  otsu,
  pageBox,
  pageBudget,
  pagesToPdf,
  scanName,
} from '../../src/components/captura/scanPages.js'
import {
  camera,
  looksLikeDocument,
  openCamera,
  settleCamera,
} from '../../src/components/captura/cameraDoor.js'

// Shell D7 (SPEC DD14): the document camera's pure parts and its doors.
const here = dirname(fileURLToPath(import.meta.url))
const source = (path) => readFileSync(resolve(here, '../../src', path), 'utf8')

/** A w×h RGBA frame: dark table, a bright page at [x0,x1)×[y0,y1). */
function frame(w, h, [x0, y0, x1, y1]) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const on = x >= x0 && x < x1 && y >= y0 && y < y1
      const v = on ? 240 : 60
      const p = (y * w + x) * 4
      data[p] = v
      data[p + 1] = v
      data[p + 2] = on ? 230 : 40
      data[p + 3] = 255
    }
  return data
}

describe('page crop', () => {
  it('finds the page on the table, with a small margin', () => {
    const box = pageBox(frame(160, 90, [50, 10, 110, 85]), 160, 90)
    expect(box).not.toBeNull()
    expect(box.x).toBeGreaterThan(0.25)
    expect(box.x).toBeLessThan(0.32)
    expect(box.x + box.width).toBeGreaterThan(0.68)
    expect(box.x + box.width).toBeLessThan(0.72)
    expect(box.y).toBeLessThan(0.12)
  })
  it('keeps the whole shot when no page stands out', () => {
    expect(pageBox(frame(100, 100, [0, 0, 100, 100]), 100, 100)).toBeNull()
    expect(pageBox(frame(100, 100, [40, 40, 45, 45]), 100, 100)).toBeNull()
  })
  it('splits paper from table with Otsu', () => {
    const h = new Array(256).fill(0)
    h[50] = 500
    h[230] = 500
    const cut = otsu(h)
    expect(cut).toBeGreaterThanOrEqual(50)
    expect(cut).toBeLessThan(230)
  })
})

describe('sizes', () => {
  it('downscales the long side and never upscales', () => {
    expect(fitSize(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 })
    expect(fitSize(800, 600, 2000)).toEqual({ width: 800, height: 600 })
  })
  it('keeps each page ≤ 2 MB and the bound file under the engine limit', () => {
    expect(pageBudget(1)).toBe(PAGE_MAX_BYTES)
    expect(pageBudget(MAX_PAGES) * MAX_PAGES).toBeLessThanOrEqual(
      10 * 1024 * 1024,
    )
    expect(MAX_PAGES).toBe(8) // extract_tiers.MAX_RENDER_PAGES
  })
})

describe('pagesToPdf', () => {
  const jpeg = (n) =>
    Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...Array(n).fill(7), 0xff, 0xd9])
  it('binds pages into one valid PDF with a correct xref', () => {
    const pages = [
      { bytes: jpeg(10), width: 1500, height: 2000 },
      { bytes: jpeg(20), width: 1200, height: 1600 },
    ]
    const pdf = pagesToPdf(pages)
    const text = new TextDecoder('latin1').decode(pdf)
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text).toContain('/Type /Pages /Kids [3 0 R 6 0 R] /Count 2')
    expect(text).toContain('/Width 1500 /Height 2000')
    expect(text).toContain('/MediaBox [0 0 720 960]')
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    // every xref offset points at its «n 0 obj»
    const xrefAt = Number(/startxref\n(\d+)/.exec(text)[1])
    expect(text.slice(xrefAt, xrefAt + 4)).toBe('xref')
    const rows = text
      .slice(xrefAt)
      .split('\n')
      .slice(3, 3 + 8)
    rows.forEach((row, i) => {
      const offset = Number(row.slice(0, 10))
      expect(
        text.slice(offset).startsWith(`${i + 1} 0 obj
`),
      ).toBe(true)
    })
    expect(/\/Size 9 /.test(text)).toBe(true)
  })
  it('refuses an empty scan', () => {
    expect(() => pagesToPdf([])).toThrow()
  })
})

describe('pages and names', () => {
  it('reorders pages', () => {
    expect(movePage(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(movePage(['a', 'b'], 0, -1)).toEqual(['a', 'b'])
  })
  it('names a scan by local date and time', () => {
    expect(scanName(new Date(2026, 9, 18, 13, 5), 'pdf')).toBe(
      'escaneo-2026-10-18-1305.pdf',
    )
  })
  it('says why the camera did not open', () => {
    expect(cameraProblem({ name: 'NotAllowedError' })).toBe('denied')
    expect(cameraProblem({ name: 'NotFoundError' })).toBe('missing')
    expect(cameraProblem({ name: 'NotReadableError' })).toBe('busy')
    expect(cameraProblem({}, { secure: false })).toBe('insecure')
    expect(cameraProblem(new Error('x'))).toBe('other')
  })
})

describe('«¿Qué es?» choices', () => {
  const options = [
    { kind: 'factura_proveedor', target: 'Purchase Invoice', allowed: true },
    { kind: 'ticket', target: 'Purchase Invoice', allowed: true },
    { kind: 'transferencia', target: 'Payment Entry', allowed: true },
    { kind: 'cotizacion_proveedor', target: 'Purchase Order', allowed: false },
    { kind: 'identificacion', file: 'Contact', allowed: true },
  ]
  it('offers only what the user may do, and what the door asked for', () => {
    expect(offeredKinds(options).map((o) => o.kind)).toEqual([
      'factura_proveedor',
      'ticket',
      'transferencia',
      'identificacion',
    ])
    expect(
      offeredKinds(options, { targets: ['Purchase Invoice'] }).map(
        (o) => o.kind,
      ),
    ).toEqual(['factura_proveedor', 'ticket'])
    expect(
      offeredKinds(options, { invoice: 'PINV-1' }).map((o) => o.kind),
    ).toEqual(['transferencia'])
  })
  it('starts on the guess when it is offered', () => {
    const offered = offeredKinds(options)
    expect(initialKind('ticket', offered)).toBe('ticket')
    // a guess the worker may not create is no guess
    expect(initialKind('cotizacion_proveedor', offered)).toBe('')
    expect(initialKind(null, [])).toBe('')
  })
  it('makes no guess of its own on the shell-wide door', () => {
    const offered = offeredKinds(options)
    expect(initialKind(null, offered)).toBe('')
    expect(initialKind(null, offered, { preset: true })).toBe(
      'factura_proveedor',
    )
    expect(initialKind(null, offered.slice(0, 1))).toBe('factura_proveedor')
  })
})

describe('«¿Qué es?» description', () => {
  it('sends the description with the capture, only on capture kinds', () => {
    const sheet = source('components/captura/CameraSheet.vue')
    expect(sheet).toMatch(/captureScan\(\{[^}]*note: note\.value\.trim\(\)/)
    expect(sheet).toMatch(/v-if="chosen\?\.target"\s+v-model="note"/)
  })
})

describe('camera door', () => {
  it('opens once and settles with the result or null', async () => {
    const first = openCamera({ targets: ['Purchase Invoice'] })
    expect(camera.open).toBe(true)
    expect(camera.wanted).toBe(true)
    const second = openCamera({ record: { doctype: 'Item', name: 'X' } })
    expect(await first).toBeNull() // a second door replaces the first
    expect(camera.options.record.name).toBe('X')
    settleCamera({ file: 'F-1' })
    expect(await second).toEqual({ file: 'F-1' })
    expect(camera.open).toBe(false)
  })
  it('reads a palette query as «scan a paper»', () => {
    for (const q of ['escanear', 'ticket gasolina', 'factura', 'foto', 'INE'])
      expect(looksLikeDocument(q)).toBe(true)
    for (const q of ['Jose Lopez', 'cobranza', ''])
      expect(looksLikeDocument(q)).toBe(false)
  })
  it('every door opens the same lazy sheet (no static import of it)', () => {
    const shell = source('components/shell/MuelleShell.vue')
    expect(shell).toContain('defineAsyncComponent(loadCameraSheet)')
    expect(shell).not.toMatch(/import CameraSheet/)
    expect(shell).toMatch(
      /data-testid="shell-camera"[\s\S]*?@click="openCamera\(\)"/,
    )
    expect(source('components/shell/MoreSheet.vue')).toContain(
      'data-testid="more-camera"',
    )
    expect(source('utils/shellPalette.js')).toContain("action: 'camera'")
    expect(source('components/shell/CommandPalette.vue')).toContain(
      "if (item.action === 'camera') nextTick(() => openCamera())",
    )
    expect(source('components/captura/CapturarDocumentoButton.vue')).toContain(
      'await openCamera({',
    )
  })
  it('the sheet asks for the rear camera and keeps a native fallback', () => {
    const sheet = source('components/captura/CameraSheet.vue')
    expect(sheet).toContain("facingMode: { ideal: 'environment' }")
    expect(sheet).toContain('capture="environment"')
    expect(sheet).toContain('applyConstraints({ advanced: [{ torch')
  })
})
