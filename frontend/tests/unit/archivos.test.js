import { describe, expect, it, vi, afterEach } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import {
  archivosHref,
  bankHandoffUrl,
  nextAfter,
  normalizeView,
  parseTarget,
  previewKind,
  problem,
  recordHref,
  safeReturn,
  uploadName,
  uploadProblem,
  withDone,
} from '../../src/composables/useArchivos.js'
import {
  hostedModules,
  isNeutralModule,
} from '../../src/composables/muelleShell.js'
import ArchivosRegistroPanel from '../../src/components/archivos/ArchivosRegistroPanel.vue'
import ArchivoUpload from '../../src/components/archivos/ArchivoUpload.vue'
import ArchivoDetail from '../../src/components/archivos/ArchivoDetail.vue'

describe('record-origin target', () => {
  it('splits doctype from names that contain slashes', () => {
    expect(parseTarget('Purchase Invoice/PINV/2026/7')).toEqual({
      doctype: 'Purchase Invoice',
      name: 'PINV/2026/7',
    })
  })
  it('rejects malformed or hostile targets', () => {
    for (const value of [
      '',
      'Supplier',
      '/X',
      'Supplier/',
      'A\\B/x',
      'Sup\nplier/x',
      null,
    ])
      expect(parseTarget(value)).toBeNull()
  })
})

describe('return-to protocol', () => {
  it('accepts local app paths including Desk forms', () => {
    for (const value of [
      '/crm/contactos/supplier/ACME',
      '/desk/purchase-invoice/PINV-1?x=1',
      '/taller/orders/RO-1',
      '/contador/bancos?tab=fuentes',
    ])
      expect(safeReturn(value)).toBe(value)
  })
  it('rejects traversal, foreign origins and control characters', () => {
    for (const value of [
      'https://evil.invalid/crm/',
      '//evil.invalid/crm/',
      '/%2F%2Fevil.invalid',
      '/crm/../desk',
      '/crm/%2e%2e/x',
      '/crm/\\evil',
      '/crm/%0aevil',
      '/login',
      '/crm/' + 'x'.repeat(2100),
      undefined,
    ])
      expect(safeReturn(value)).toBe('')
  })
  it('reports the completed record to the caller', () => {
    expect(
      withDone('/desk/purchase-invoice/PINV-1', 'Purchase Invoice', 'PINV-1'),
    ).toBe('/desk/purchase-invoice/PINV-1?done=Purchase%20Invoice%3APINV-1')
    expect(withDone('/crm/x?a=1#top', 'Supplier', 'A')).toBe(
      '/crm/x?a=1&done=Supplier%3AA#top',
    )
    expect(withDone('https://evil.invalid', 'Supplier', 'A')).toBe('')
  })
  it('builds Archivos links that keep target and return', () => {
    const href = archivosHref({
      document: 'DOC-1',
      target: { doctype: 'Supplier', name: 'A/B' },
      returnTo: '/crm/contactos/supplier/A%2FB',
      returnLabel: 'A/B',
    })
    const url = new URL(href, 'https://muelle.invalid')
    expect(url.pathname).toBe('/crm/archivos')
    expect(url.searchParams.get('target')).toBe('Supplier/A/B')
    expect(url.searchParams.get('return_to')).toBe(
      '/crm/contactos/supplier/A%2FB',
    )
    expect(archivosHref({ returnTo: '//evil' })).toBe('/crm/archivos')
  })
})

describe('queue continuation', () => {
  const rows = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
  it('opens the next item, or the previous one at the end', () => {
    expect(nextAfter(rows, 'A')).toBe('B')
    expect(nextAfter(rows, 'C')).toBe('B')
    expect(nextAfter([{ name: 'A' }], 'A')).toBe('')
    expect(nextAfter(rows, 'missing')).toBe('A')
  })
  it('falls back to the intake view', () => {
    expect(normalizeView('archivo')).toBe('archivo')
    expect(normalizeView('bogus')).toBe('por_clasificar')
  })
})

describe('upload rules', () => {
  it('names camera photos and refuses oversize or unknown files', () => {
    const when = new Date('2026-10-05T09:30:00Z')
    expect(uploadName({ name: 'image.jpg', type: 'image/jpeg' }, when)).toBe(
      'foto-202610050930.jpg',
    )
    expect(uploadName({ name: 'factura.pdf' }, when)).toBe('factura.pdf')
    expect(uploadProblem({ name: 'a.pdf', size: 11 * 1024 * 1024 })).toMatch(
      /10 MB/,
    )
    expect(
      uploadProblem({
        name: 'a.exe',
        size: 10,
        type: 'application/x-msdownload',
      }),
    ).not.toBe('')
    expect(uploadProblem({ name: 'scan', size: 10, type: 'image/jpeg' })).toBe(
      '',
    )
  })
  it('previews by media type', () => {
    expect(previewKind('image/png')).toBe('image')
    expect(previewKind('application/pdf')).toBe('pdf')
    expect(previewKind('text/csv')).toBe('text')
    expect(previewKind('application/zip')).toBe('none')
  })
})

describe('owning destinations', () => {
  it('opens parties in Contactos, the rest in Desk, statements in Bancos', () => {
    expect(recordHref('Supplier', 'A/B')).toBe('/crm/contactos/supplier/A%2FB')
    expect(recordHref('Purchase Invoice', 'PINV-1')).toBe(
      '/desk/purchase-invoice/PINV-1',
    )
    const url = new URL(
      bankHandoffUrl(
        { company: 'Doco MX', name: 'DOC-1' },
        '/crm/archivos?document=DOC-1',
      ),
      'https://muelle.invalid',
    )
    expect(url.pathname).toBe('/contador/bancos')
    expect(url.searchParams.get('doc')).toBe('DOC-1')
    expect(url.searchParams.get('volver')).toBe('/crm/archivos?document=DOC-1')
  })
  it('Archivos is a hosted shell module that boots without the sales runtime', () => {
    expect(isNeutralModule('archivos')).toBe(true)
    expect(isNeutralModule('contactos')).toBe(true)
    expect(isNeutralModule('ventas')).toBe(false)
    expect(isNeutralModule(undefined)).toBe(false)
    expect(hostedModules.find((m) => m.key === 'archivos')?.to).toBe(
      '/archivos',
    )
  })
})

describe('guards', () => {
  it('keeps the server guard and its actions', () => {
    const error = new Error('x')
    error.guard = {
      code: 'not_reviewer',
      message: 'Ana lo recibió',
      actions: [{ label: 'Pedir', kind: 'call' }],
    }
    expect(problem(error)).toMatchObject({
      code: 'not_reviewer',
      actions: [{ kind: 'call' }],
    })
  })
  it('never leaves a refusal without an action', () => {
    expect(
      problem({ status: 403, exc_type: 'PermissionError', messages: ['No'] })
        .actions.length,
    ).toBeGreaterThan(0)
    expect(problem({ status: 500 }).actions[0].kind).toBe('retry')
    expect(problem({ status: 401 }).actions[0].kind).toBe('login')
  })
})

describe('«Archivos de este registro» panel', () => {
  let app, root
  async function mount(props) {
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({ render: () => h(ArchivosRegistroPanel, props) })
    app.config.globalProperties.__ = globalThis.__
    app.mount(root)
    for (let i = 0; i < 8; i++) {
      await Promise.resolve()
      await nextTick()
    }
  }
  afterEach(() => {
    app?.unmount()
    root?.remove()
    vi.unstubAllGlobals()
  })
  function respond(message, ok = true, status = 200) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok,
        status,
        json: async () => (ok ? { message } : message),
      })),
    )
  }
  it('shows evidence and native files once, with an intake link back here', async () => {
    respond({
      supported: true,
      evidence: [
        {
          name: 'DOC-1',
          title: 'Factura luz',
          document_kind: 'Invoice',
          status: 'Linked',
          modified: '2026-10-01',
        },
      ],
      files: [
        {
          name: 'F1',
          file_name: 'contrato.pdf',
          file_url: '/private/files/contrato.pdf',
          file_size: 2048,
          owner_label: 'Ana',
        },
      ],
    })
    await mount({
      doctype: 'Supplier',
      name: 'ACME',
      returnTo: '/crm/contactos/supplier/ACME',
      returnLabel: 'ACME',
    })
    expect(root.textContent).toContain('Factura luz')
    expect(root.textContent).toContain('contrato.pdf')
    const links = [...root.querySelectorAll('a')].map((a) =>
      a.getAttribute('href'),
    )
    expect(
      links.some((href) =>
        href.startsWith('/crm/archivos?target=Supplier%2FACME&return_to='),
      ),
    ).toBe(true)
    expect(links).toContain('/private/files/contrato.pdf')
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body).toEqual({
      reference_doctype: 'Supplier',
      reference_name: 'ACME',
    })
  })
  it('explains a refusal and offers to retry instead of an empty panel', async () => {
    respond(
      {
        exc_type: 'PermissionError',
        _server_messages: JSON.stringify([
          JSON.stringify({ message: 'Sin acceso' }),
        ]),
      },
      false,
      403,
    )
    await mount({ doctype: 'Supplier', name: 'ACME' })
    expect(root.textContent).toContain('Sin acceso')
    expect(root.querySelectorAll('button').length).toBeGreaterThan(0)
  })
})

describe('receiving a file', () => {
  let app, root
  afterEach(() => {
    app?.unmount()
    root?.remove()
    vi.unstubAllGlobals()
  })
  async function settle() {
    for (let i = 0; i < 12; i++) {
      await Promise.resolve()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
  function choose(input, file) {
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    input.dispatchEvent(new Event('change'))
  }
  it('a photo taken while the first one is sending stays selected and the panel stays open', async () => {
    let answer
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            answer = () =>
              resolve({
                ok: true,
                status: 200,
                json: async () => ({
                  message: { name: 'DOC-A', company: 'Doco MX' },
                }),
              })
          }),
      ),
    )
    const received = vi.fn()
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      render: () =>
        h(ArchivoUpload, { company: 'Doco MX', onReceived: received }),
    })
    app.config.globalProperties.__ = globalThis.__
    app.mount(root)
    await settle()
    const [camera] = root.querySelectorAll('input[type="file"]')
    choose(camera, new File(['a'], 'camera-A.jpg', { type: 'image/jpeg' }))
    await settle()
    root
      .querySelector('button.min-h-11, button')
      .dispatchEvent(new Event('click'))
    await settle()
    expect(fetch).toHaveBeenCalledTimes(1)
    // Capture B while A is still on its way.
    choose(camera, new File(['bb'], 'camera-B.jpg', { type: 'image/jpeg' }))
    await settle()
    answer()
    await settle()
    expect(JSON.parse(fetch.mock.calls[0][1].body).filename).toBe(
      'camera-A.jpg',
    )
    expect(received).toHaveBeenCalledTimes(1)
    expect(received.mock.calls[0][1]).toEqual({ pending: true })
    expect(root.textContent).toContain('camera-B.jpg')
  })
})

describe('archive delivery that may have happened', () => {
  let app, root
  afterEach(() => {
    app?.unmount()
    root?.remove()
    vi.unstubAllGlobals()
    localStorage.clear()
  })
  async function settle() {
    for (let i = 0; i < 12; i++) {
      await Promise.resolve()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
  let detail = (tasks) => {
    return {
      name: 'DOC-9',
      title: 'Factura luz',
      company: 'Doco MX',
      status: 'Review',
      visibility: 'Company',
      modified: '2026-10-05 10:00:00',
      can_edit: true,
      links: [],
      sources: [],
      tasks,
    }
  }
  async function mount(tasks) {
    const calls = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, init) => {
        const method = url.split('/api/method/')[1]
        calls.push([method, JSON.parse(init.body)])
        const message = method.endsWith('.detail')
          ? detail(tasks)
          : method.endsWith('.suggest')
            ? []
            : { name: 'T-1', state: 'Complete' }
        return { ok: true, status: 200, json: async () => ({ message }) }
      }),
    )
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      render: () =>
        h(ArchivoDetail, {
          name: 'DOC-9',
          boot: { kinds: [], link_types: [], user: 'ana@example.invalid' },
        }),
    })
    app.config.globalProperties.__ = globalThis.__
    app.mount(root)
    await settle()
    return calls
  }
  const buttons = () =>
    [...root.querySelectorAll('button')].map((b) => b.textContent.trim())
  it('uncertain and submitting deliveries offer verification with the archive id, never a resend', async () => {
    const calls = await mount([
      { name: 'T-1', state: 'Uncertain', error_message: '' },
      { name: 'T-2', state: 'Submitting', error_message: '' },
    ])
    expect(buttons().filter((b) => b === 'Verify delivery')).toHaveLength(2)
    expect(buttons()).not.toContain('Try again')
    ;[...root.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'Verify delivery')
      .dispatchEvent(new Event('click'))
    await settle()
    const input = root.querySelector('input[inputmode="numeric"]')
    input.value = '42'
    input.dispatchEvent(new Event('input'))
    await settle()
    ;[...root.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'Verify')
      .dispatchEvent(new Event('click'))
    await settle()
    const resolve = calls.find(([m]) => m.endsWith('.resolve_task'))
    expect(resolve).toEqual([
      'doco.docoutils.documents.api.resolve_task',
      { name: 'T-1', remote_id: '42' },
    ])
    expect(calls.some(([m]) => m.endsWith('.retry_task'))).toBe(false)
  })
  it('legacy OCR and expense-draft actions continue on the Desk page for this document', async () => {
    const original = detail
    detail = (tasks) => ({
      ...original(tasks),
      can_archive: true,
      can_prepare_purchase: true,
    })
    try {
      await mount([])
    } finally {
      detail = original
    }
    const links = [...root.querySelectorAll('a')].map((a) => [
      a.textContent.trim(),
      a.getAttribute('href'),
    ])
    const classic = '/desk/documentos?clasico=1&document=DOC-9'
    expect(links).toContainEqual(['Send to the archive for OCR', classic])
    expect(links).toContainEqual(['Prepare purchase draft', classic])
  })
  it('without those actions the Desk continuation is not offered', async () => {
    await mount([])
    expect(root.innerHTML).not.toContain('clasico=1')
  })
  it('a failed delivery still offers Try again', async () => {
    await mount([{ name: 'T-3', state: 'Failed', error_message: 'Timeout' }])
    expect(buttons()).toContain('Try again')
    expect(buttons()).not.toContain('Verify delivery')
  })
})

describe('saving details', () => {
  let app, root
  afterEach(() => {
    app?.unmount()
    root?.remove()
    vi.unstubAllGlobals()
    sessionStorage.clear()
  })
  async function settle() {
    for (let i = 0; i < 12; i++) {
      await Promise.resolve()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
  it('what is typed while saving stays on screen and unsaved', async () => {
    const base = {
      name: 'DOC-5',
      title: 'Original',
      company: 'Doco MX',
      status: 'Review',
      visibility: 'Company',
      tags: '',
      modified: 'v1',
      can_edit: true,
      links: [],
      sources: [],
      tasks: [],
    }
    let answer
    vi.stubGlobal(
      'fetch',
      vi.fn((url, init) => {
        const method = url.split('/api/method/')[1]
        if (method.endsWith('.classify'))
          return new Promise((resolve) => {
            answer = () =>
              resolve({
                ok: true,
                status: 200,
                json: async () => ({
                  message: {
                    ...base,
                    ...JSON.parse(init.body).values,
                    modified: 'v2',
                  },
                }),
              })
          })
        const message = method.endsWith('.detail') ? base : []
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ message }),
        })
      }),
    )
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      render: () =>
        h(ArchivoDetail, {
          name: 'DOC-5',
          boot: { kinds: [], link_types: [], user: 'ana@example.invalid' },
        }),
    })
    app.config.globalProperties.__ = globalThis.__
    app.mount(root)
    await settle()
    const title = [...root.querySelectorAll('input')].find(
      (i) => i.value === 'Original',
    )
    title.value = 'First edit'
    title.dispatchEvent(new Event('input'))
    await settle()
    ;[...root.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'Save details')
      .dispatchEvent(new Event('click'))
    await settle()
    title.value = 'Newer edit'
    title.dispatchEvent(new Event('input'))
    await settle()
    answer()
    await settle()
    expect(title.value).toBe('Newer edit')
    const save = [...root.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Save details',
    )
    expect(save.disabled).toBe(false)
  })
})
