import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  POLL_LIMIT_MS,
  POLL_MS,
  allowedTargets,
  capturaApi,
  capturaMessage,
  capturaReturn,
  capturaRoute,
  captureProblem,
  captureStatus,
  draftTarget,
  lineStateLabel,
  lineStateTheme,
  loadCapturaBoot,
  pendingLines,
  targetLabel,
  totalsSummary,
} from '../../src/composables/useCaptura.js'

const here = dirname(fileURLToPath(import.meta.url))
const source = (path) => readFileSync(resolve(here, '../../src', path), 'utf8')

describe('capturaRoute', () => {
  it('builds the review location with a safe return target', () => {
    expect(
      capturaRoute('CAP-0001', {
        doctype: 'Purchase Order',
        returnTo: '/crm/compras?segment=por-recibir',
        returnLabel: 'Compras',
      }),
    ).toEqual({
      name: 'CompraCaptura',
      params: { name: 'CAP-0001' },
      query: {
        return_to: '/crm/compras?segment=por-recibir',
        return_label: 'Compras',
      },
    })
  })
  it('drops an unsafe return target and its label', () => {
    for (const bad of [
      '//evil.test/x',
      'https://evil.test',
      '/crm/../app',
      '',
    ]) {
      expect(
        capturaRoute('CAP-1', { returnTo: bad, returnLabel: 'X' }).query,
      ).toEqual({})
    }
  })
  it('caps the label and flags a duplicate', () => {
    const route = capturaRoute('CAP-1', {
      returnTo: '/crm/gastos',
      returnLabel: 'x'.repeat(80),
      duplicate: true,
    })
    expect(route.query.duplicate).toBe('1')
    expect(Array.from(route.query.return_label).length).toBe(40)
  })
})

describe('capturaReturn', () => {
  it('reads the way back with a default label', () => {
    expect(capturaReturn({ return_to: '/crm/compras' })).toEqual({
      to: '/crm/compras',
      label: 'Compras',
    })
    expect(
      capturaReturn({
        return_to: '/crm/gastos/factura/PI-1',
        return_label: 'PI-1',
      }),
    ).toEqual({ to: '/crm/gastos/factura/PI-1', label: 'PI-1' })
    expect(capturaReturn({ return_to: '//evil' })).toBeNull()
    expect(capturaReturn({})).toBeNull()
  })
})

describe('draftTarget', () => {
  const back = { returnTo: '/crm/compras?segment=x', returnLabel: 'Compras' }
  it('opens shell drafts in the router, keeping the original return', () => {
    expect(
      draftTarget({ route: '/crm/compras/orden/PUR-ORD-2026-00012' }, back),
    ).toEqual({
      kind: 'router',
      to: {
        path: '/compras/orden/PUR-ORD-2026-00012',
        query: { return_to: '/crm/compras?segment=x', return_label: 'Compras' },
      },
    })
  })
  it('omits an unsafe return', () => {
    expect(
      draftTarget(
        { route: '/crm/gastos/factura/ACC-PINV-1' },
        { returnTo: 'https://evil.test', returnLabel: 'x' },
      ),
    ).toEqual({
      kind: 'router',
      to: { path: '/gastos/factura/ACC-PINV-1', query: {} },
    })
  })
  it('opens Desk drafts as a page load', () => {
    expect(
      draftTarget({ route: '/app/payment-entry/ACC-PAY-1' }, back),
    ).toEqual({ kind: 'href', href: '/app/payment-entry/ACC-PAY-1' })
  })
  it('refuses anything else', () => {
    for (const route of [
      '',
      null,
      '//evil.test/x',
      'https://evil.test',
      '/crm/../app/x',
      '/desk/x',
    ])
      expect(draftTarget({ route }, back)).toBeNull()
    expect(draftTarget(null)).toBeNull()
  })
})

describe('line states and status', () => {
  it('labels every line state', () => {
    expect(lineStateLabel('mapped')).toBe('Item assigned')
    expect(lineStateLabel('ask')).toBe('Choose the item')
    expect(lineStateLabel('new')).toBe('No item yet')
    expect(lineStateLabel('dropped')).toBe('Left out')
    expect(lineStateLabel('weird')).toBe('No item yet')
    expect(lineStateTheme('mapped')).toBe('green')
    expect(lineStateTheme('dropped')).toBe('gray')
  })
  it('counts lines still waiting for an item', () => {
    expect(
      pendingLines([
        { state: 'mapped' },
        { state: 'ask' },
        { state: 'new' },
        { state: 'dropped' },
      ]),
    ).toHaveLength(2)
  })
  it('says where the capture stands', () => {
    expect(captureStatus({ processing: true }).label).toBe('Reading')
    expect(captureStatus({ error: 'x' }).theme).toBe('red')
    expect(captureStatus({ created: { name: 'PO-1' } }).label).toBe(
      'Draft created',
    )
    expect(captureStatus({ status: 'Descartado' }).label).toBe('Discarded')
    expect(captureStatus({ status: 'Mapeado' }).label).toBe('To review')
  })
})

describe('totalsSummary', () => {
  it('adds shipping to the lines and compares with the document', () => {
    const t = totalsSummary({
      lines: 11326.6,
      shipping: 249,
      tax: 0,
      document: 11575.6,
      currency: 'MXN',
      matches: true,
      draft: null,
    })
    expect(t.rows.map((r) => r.key)).toEqual(['lines', 'shipping'])
    expect(t.sum).toBe(11575.6)
    expect(t.difference).toBe(0)
    expect(t.verdict).toEqual({ label: 'Matches', theme: 'green' })
    expect(t.draft).toBeNull()
  })
  it('shows the difference when it does not match, and the draft total', () => {
    const t = totalsSummary({
      lines: 100,
      shipping: 0,
      tax: 16,
      document: 120,
      matches: false,
      draft: 116,
    })
    expect(t.rows.map((r) => r.key)).toEqual(['lines', 'tax'])
    expect(t.difference).toBe(4)
    expect(t.verdict.label).toBe('Does not match')
    expect(t.draft).toBe(116)
  })
  it('has nothing to compare without a document total', () => {
    const t = totalsSummary(null)
    expect(t.matches).toBeNull()
    expect(t.difference).toBeNull()
    expect(t.currency).toBe('MXN')
  })
})

describe('boot-driven helpers', () => {
  const boot = {
    targets: {
      'Purchase Order': true,
      'Purchase Invoice': false,
      'Payment Entry': true,
    },
    labels: { 'Purchase Order': 'Orden de compra' },
    max_mb: 10,
    accept: '.pdf,.png,.jpg,.jpeg,.webp,.heic,.xml',
  }
  it('offers only targets the user may create, in caller order', () => {
    expect(
      allowedTargets(boot, ['Purchase Invoice', 'Purchase Order', 'Item']),
    ).toEqual(['Purchase Order'])
    expect(allowedTargets(null, ['Purchase Order'])).toEqual([])
  })
  it('labels targets with the server label first', () => {
    expect(targetLabel('Purchase Order', boot)).toBe('Orden de compra')
    expect(targetLabel('Payment Entry', boot)).toBe('Payment')
  })
  it('checks file type and size against the boot limits', () => {
    expect(captureProblem(null, boot)).toBe('Choose a file or take a photo.')
    expect(captureProblem({ name: 'cotizacion.PDF', size: 1000 }, boot)).toBe(
      '',
    )
    expect(captureProblem({ name: 'IMG_1.heic', size: 1000 }, boot)).toBe('')
    expect(captureProblem({ name: 'notes.txt', size: 10 }, boot)).toMatch(/PDF/)
    expect(
      captureProblem({ name: 'big.pdf', size: 11 * 1024 * 1024 }, boot),
    ).toMatch(/10 MB/)
  })
  it('polls every 2.5 s for up to 4 minutes', () => {
    expect(POLL_MS).toBe(2500)
    expect(POLL_LIMIT_MS).toBe(240000)
  })
})

describe('capturaApi', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('posts JSON to the capture service and returns the message', async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ message: { name: 'CAP-1' } }),
    }))
    vi.stubGlobal('fetch', fetch)
    await expect(capturaApi('review', { name: 'CAP-1' })).resolves.toEqual({
      name: 'CAP-1',
    })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/api/method/doco.docoutils.books.shell_capture.review')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ name: 'CAP-1' })
  })
  it('surfaces the server message of a refusal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 417,
        json: async () => ({
          exc_type: 'ValidationError',
          _server_messages: JSON.stringify([
            JSON.stringify({ message: 'Elige el proveedor.' }),
          ]),
        }),
      })),
    )
    const error = await capturaApi('create_draft', { name: 'CAP-1' }).catch(
      (e) => e,
    )
    expect(capturaMessage(error)).toBe('Elige el proveedor.')
  })
  it('explains a lost connection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline')
      }),
    )
    const error = await capturaApi('boot').catch((e) => e)
    expect(capturaMessage(error)).toMatch(/No connection/)
  })
  it('caches the boot and degrades to no targets on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    )
    const boot = await loadCapturaBoot({ refresh: true })
    expect(boot.failed).toBe(true)
    expect(allowedTargets(boot, ['Purchase Order'])).toEqual([])
  })
})

describe('entry points', () => {
  const button = (file) => {
    const text = source(file)
    expect(text).toContain(
      "import CapturarDocumentoButton from '@/components/captura/CapturarDocumentoButton.vue'",
    )
    return text
  }
  it('registers the review under the module it drafts into', () => {
    const router = source('router.js')
    expect(router).toMatch(
      /path: '\/compras\/captura\/:name',\s*name: 'CompraCaptura',\s*component: \(\) => import\('@\/pages\/CapturaRevision.vue'\),\s*props: true,\s*meta: \{ app: 'compras'/,
    )
    expect(router).toMatch(
      /path: '\/gastos\/captura\/:name',\s*name: 'GastoCaptura',\s*component: \(\) => import\('@\/pages\/CapturaRevision.vue'\),\s*props: true,\s*meta: \{ app: 'gastos'/,
    )
    expect(router).not.toMatch(/path: '\/captura\/:name'/)
  })
  it('routes a bill, payment or póliza review to Gastos', () => {
    for (const doctype of [
      'Purchase Invoice',
      'Payment Entry',
      'Journal Entry',
      undefined,
    ])
      expect(capturaRoute('CAP-2', { doctype }).name).toBe('GastoCaptura')
  })
  it('Compras offers orders and bills (desktop and phone)', () => {
    const text = button('pages/Compras.vue')
    const uses = text.match(
      /<CapturarDocumentoButton[^>]*:targets="\['Purchase Order', 'Purchase Invoice'\]"[^>]*return-label="Compras"/g,
    )
    expect(uses).toHaveLength(2)
  })
  it('Gastos offers bills (desktop and phone)', () => {
    const text = button('pages/Gastos.vue')
    expect(
      text.match(
        /<CapturarDocumentoButton[^>]*:targets="\['Purchase Invoice'\]"[^>]*return-label="Gastos"/g,
      ),
    ).toHaveLength(2)
  })
  it('a submitted bill with a balance captures its payment receipt', () => {
    const text = button('pages/GastoFactura.vue')
    expect(text).toMatch(
      /<CapturarDocumentoButton\s+v-if="\s*Number\(doc\.docstatus\) === 1 &&\s*Number\(doc\.outstanding_amount \|\| 0\) > 0\s*"\s*:label="__\('Capture payment receipt'\)"\s*:targets="\['Payment Entry'\]"\s*:invoice="props\.name"\s*:return-label="props\.name"/,
    )
  })
  it('the pay sheet offers the receipt capture for this bill', () => {
    const text = button('components/gastos/PayDialog.vue')
    expect(text).toContain('Already paid by transfer? Upload the receipt')
    expect(text).toMatch(
      /<CapturarDocumentoButton\s+v-model:open="captureOpen"\s+:trigger="false"[^>]*:targets="\['Payment Entry'\]"\s+:invoice="name"/,
    )
  })
  it('a supplier record offers orders and bills for that supplier', () => {
    const text = button('pages/Contacto.vue')
    expect(text).toMatch(
      /<CapturarDocumentoButton\s+v-if="record\.source === 'supplier' && record\.name"\s+:targets="\['Purchase Order', 'Purchase Invoice'\]"\s+:supplier="record\.name"/,
    )
  })
  it('the draft pages honour return_to', () => {
    expect(source('pages/CompraOrden.vue')).toContain(
      'safeReturn(route.query.return_to)',
    )
    expect(source('pages/GastoFactura.vue')).toContain(
      'ownerReturn(route.query)',
    )
  })
  it('the review never imports the buyer-only Compras pickers API', () => {
    const page = source('pages/CapturaRevision.vue')
    expect(page).not.toContain('comprasApi')
    expect(page).toContain("capturaApi('search'")
  })
  it('a payment review shows no lines totals card', () => {
    const page = source('pages/CapturaRevision.vue')
    expect(page).toMatch(
      /v-if="review\.doc_type !== 'Payment Entry'"\s*class="mb-4 space-y-2 rounded-xl border border-outline-gray-2 p-4"\s*:aria-label="__\('Totals'\)"/,
    )
  })
})
