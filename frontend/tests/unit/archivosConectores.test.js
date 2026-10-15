import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  TOKEN_MASK,
  agoLabel,
  backfillAction,
  capacity,
  changedMaps,
  connectorMethod,
  deliveryLabel,
  durationLabel,
  formFromConnector,
  formProblems,
  healthLabel,
  healthTheme,
  monthsLabel,
  ocrReadable,
  ocrStep,
  parseIds,
  percent,
  queueLabel,
  relativeTime,
  ruleText,
  saveValues,
  senderProblem,
  timeline,
  versionLabel,
  viaLabel,
  viaTheme,
} from '../../src/utils/archivosConectores'
import ArchivoOcrAction from '../../src/components/archivos/ArchivoOcrAction.vue'
import ConnectorForm from '../../src/components/archivos/conectores/ConnectorForm.vue'
import ArchivosConectores from '../../src/pages/ArchivosConectores.vue'

const NOW = new Date('2026-10-15T12:00:00')
const here = dirname(fileURLToPath(import.meta.url))

describe('health and time', () => {
  it('names each health state with its colour', () => {
    expect([healthLabel('ok'), healthTheme('ok')]).toEqual([
      'Working normally',
      'green',
    ])
    expect(healthTheme('late')).toBe('orange')
    expect(healthTheme('error')).toBe('red')
    expect(healthTheme('paused')).toBe('gray')
    expect(healthTheme('waiting')).toBe('gray')
    expect(healthLabel('nonsense')).toBe(healthLabel('waiting'))
  })
  it('says how long ago in plain words', () => {
    expect(agoLabel(20)).toBe('just now')
    expect(agoLabel(5 * 60 + 3)).toBe('5 min ago')
    expect(agoLabel(3 * 3600)).toBe('3 h ago')
    expect(agoLabel(2 * 86400 + 5)).toBe('about 2 days ago')
    expect(agoLabel(null)).toBe('')
    expect(relativeTime('2026-10-15 11:55:00', NOW)).toBe('5 min ago')
    expect(relativeTime('', NOW)).toBe('')
    expect(relativeTime('not a date', NOW)).toBe('')
    expect(durationLabel(600)).toBe('10 min')
    expect(durationLabel(-1)).toBe('')
  })
  it('lists only the timestamps a connector has', () => {
    const rows = timeline(
      {
        last_checked: '2026-10-15 11:58:00',
        last_success: '2026-10-15 11:00:00',
        last_error_at: null,
      },
      NOW,
    )
    expect(rows.map((r) => r.label)).toEqual([
      'Last checked 2 min ago',
      'Last success 1 h ago',
    ])
  })
  it('shows version, delivery and queue in one line each', () => {
    expect(
      versionLabel({
        connector_type: 'Paperless',
        remote_version: 'v3.0.5',
        api_version: 10,
      }),
    ).toBe('Paperless 3.0.5 · API 10')
    expect(
      versionLabel({ connector_type: 'Mailbox', remote_version: '1' }),
    ).toBe('')
    expect(
      deliveryLabel({
        connector_type: 'Paperless',
        health: { poll_minutes: 10 },
      }),
    ).toBe('Checks every 10 min')
    expect(
      deliveryLabel(
        {
          connector_type: 'Paperless',
          last_webhook_at: '2026-10-15 11:50:00',
          health: { poll_minutes: 10, webhook: true },
        },
        NOW,
      ),
    ).toBe('Paperless notified Muelle 10 min ago; also checks every 10 min')
    expect(
      deliveryLabel({
        connector_type: 'Paperless',
        health: { poll_minutes: 10, webhook: true },
      }),
    ).toContain('none received yet')
    expect(queueLabel({ pending: 0, failed: 0 })).toBe('')
    expect(
      queueLabel({ pending: 3, oldest_pending_seconds: 120, failed: 1 }),
    ).toBe('3 pending, oldest 2 min ago · 1 failed')
  })
  it('reads filter ids from the stored JSON, ignoring junk', () => {
    expect(parseIds('[3, "4", 3, -1, "x"]')).toEqual([3, 4])
    expect(parseIds('not json')).toEqual([])
    expect(parseIds(null)).toEqual([])
    expect(parseIds([7])).toEqual([7])
  })
})

describe('capacity and the initial import', () => {
  it('summarises the monthly capacity, or nothing without a limit', () => {
    expect(capacity({ monthly_limit: 0 })).toBe(null)
    const cap = capacity({ monthly_limit: 500, used_this_month: 125 })
    expect(cap).toMatchObject({ left: 375, percent: 25, full: false })
    expect(cap.label).toBe('125 of 500 documents used this month')
    expect(capacity({ monthly_limit: 10, used_this_month: 12 }).full).toBe(true)
    expect(percent(5, 0)).toBe(0)
    expect(percent(150, 100)).toBe(100)
  })
  it('keeps «Start import» disabled until a fresh dry run exists', () => {
    const none = backfillAction({ state: 'Idle', report: null }, NOW)
    expect(none).toMatchObject({ action: 'start', disabled: true })
    expect(none.reason).toContain('First try without importing')
    const old = backfillAction(
      { state: 'Ready', report: { at: '2026-10-13 10:00:00' } },
      NOW,
    )
    expect(old.disabled).toBe(true)
    expect(old.reason).toContain('more than a day old')
    const fresh = backfillAction(
      { state: 'Ready', report: { at: '2026-10-15 11:00:00' } },
      NOW,
    )
    expect(fresh).toMatchObject({
      action: 'start',
      label: 'Start import',
      disabled: false,
    })
    expect(
      backfillAction(
        {
          state: 'Paused',
          resumable: true,
          report: { at: '2026-10-15 11:00:00' },
        },
        NOW,
      ).label,
    ).toBe('Resume import')
    expect(backfillAction({ state: 'Running' }, NOW).action).toBe(null)
  })
  it('says whether the import fits this month', () => {
    expect(monthsLabel({ fits_this_month: true })).toContain('Fits')
    expect(monthsLabel({ fits_this_month: false, months: 3 })).toBe(
      'Needs about 3 months of your plan capacity',
    )
    expect(monthsLabel({ fits_this_month: false, months: null })).toContain(
      'no monthly capacity',
    )
  })
})

describe('mappings', () => {
  it('labels where a mapping came from', () => {
    expect(viaLabel('RFC')).toBe('Automatic by RFC')
    expect(viaLabel('Name')).toBe('By name')
    expect(viaLabel('Guess')).toBe('Suggested')
    expect(viaTheme('Manual')).toBe('gray')
    expect(viaLabel('')).toBe('')
  })
  it('sends only changed rows and skips empty catalog rows', () => {
    const saved = [
      {
        map_type: 'Correspondent',
        remote_id: 1,
        remote_name: 'CFE',
        party_type: 'Supplier',
        party: 'CFE',
      },
      {
        map_type: 'Document Type',
        remote_id: 2,
        remote_name: 'Factura',
        document_kind: 'Invoice',
      },
    ]
    const rows = [
      { ...saved[0] },
      { ...saved[1], document_kind: 'Receipt' },
      {
        map_type: 'Correspondent',
        remote_id: 3,
        remote_name: 'Nuevo',
        party_type: '',
        party: '',
      },
      {
        map_type: 'Correspondent',
        remote_id: 4,
        remote_name: 'Telmex',
        party_type: 'Supplier',
        party: ' Telmex ',
      },
    ]
    expect(changedMaps(rows, saved)).toEqual([
      {
        map_type: 'Document Type',
        remote_id: 2,
        remote_name: 'Factura',
        document_kind: 'Receipt',
      },
      {
        map_type: 'Correspondent',
        remote_id: 4,
        remote_name: 'Telmex',
        party_type: 'Supplier',
        party: 'Telmex',
      },
    ])
  })
})

describe('the edit form', () => {
  it('sends the token only when a new one was typed', () => {
    const conn = {
      name: 'DCON-2026-00001',
      connector_type: 'Paperless',
      base_url: 'https://p.example.mx',
      remote_owner: 3,
      source_tag: 0,
      has_token: true,
      filter_document_types: '[4]',
      page_size: 25,
    }
    const form = formFromConnector(conn)
    expect(saveValues(form)).not.toHaveProperty('api_token')
    form.api_token = TOKEN_MASK
    expect(saveValues(form)).not.toHaveProperty('api_token')
    form.api_token = 'abc'
    const values = saveValues(form)
    expect(values).toMatchObject({
      name: 'DCON-2026-00001',
      api_token: 'abc',
      filter_document_types: [4],
      remote_owner: 3,
    })
    expect(values).not.toHaveProperty('enabled')
    expect(values).not.toHaveProperty('mail_rules')
  })
  it('sends mailbox fields and rules for a new mailbox, turned on', () => {
    const form = formFromConnector(null, 'Mailbox')
    expect(form.mail_rules).toHaveLength(1)
    Object.assign(form, {
      base_url: 'imaps://imap.gmail.com:993',
      remote_account: 'facturas@acme.mx',
      api_token: 'app-pass',
    })
    form.mail_rules[0].sender = '@proveedor.mx'
    expect(formProblems(form)).toEqual({})
    const values = saveValues(form)
    expect(values).toMatchObject({ connector_type: 'Mailbox', enabled: 1 })
    expect(values.mail_rules[0]).toEqual({
      enabled: 1,
      sender: '@proveedor.mx',
      subject: '',
      attachment_types: 'xml,pdf',
      visibility: 'Company',
    })
    expect(values).not.toHaveProperty('remote_owner')
  })
  it('flags what the server would refuse before saving', () => {
    const p = formProblems(formFromConnector(null, 'Paperless'))
    expect(Object.keys(p).sort()).toEqual([
      'api_token',
      'base_url',
      'remote_owner',
    ])
    expect(senderProblem('juan@')).not.toBe('')
    expect(senderProblem('@acme.mx')).toBe('')
    expect(senderProblem('')).toBe('')
  })
  it('describes a mail rule in one line', () => {
    expect(
      ruleText({
        enabled: 1,
        sender: '@cfe.mx',
        subject: 'Factura',
        attachment_types: 'xml,pdf',
        visibility: 'Company',
      }),
    ).toBe(
      'From @cfe.mx · subject contains «Factura» · xml, pdf · for everyone in the company',
    )
    expect(ruleText({ enabled: 0, attachment_types: 'pdf' })).toBe(
      'Off: Any sender · pdf · for everyone in the company',
    )
  })
})

describe('OCR', () => {
  it('names each task state', () => {
    expect(ocrStep({ state: 'Queued' }).label).toBe('Sending to the archive…')
    expect(ocrStep({ state: 'Submitted' }).label).toBe('Reading text…')
    expect(ocrStep({ state: 'Complete' }).tone).toBe('done')
    expect(ocrStep({ state: 'Failed', error_message: 'Sin red' })).toEqual({
      tone: 'error',
      label: 'Sin red',
    })
    expect(ocrStep(null)).toBe(null)
    expect(ocrReadable('application/pdf')).toBe(true)
    expect(ocrReadable('text/plain')).toBe(false)
  })
})

async function flush(n = 8) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
function stubFetch(handler) {
  const fn = vi.fn(async (url, init) => {
    const method = String(url).split('.').pop()
    const body = JSON.parse(init.body || '{}')
    const [ok, message, status = ok ? 200 : 417] = handler(method, body)
    return { ok, status, json: async () => (ok ? { message } : message) }
  })
  vi.stubGlobal('fetch', fn)
  return fn
}
function serverError(text) {
  return {
    exc_type: 'ValidationError',
    _server_messages: JSON.stringify([JSON.stringify({ message: text })]),
  }
}

describe('«Read text (OCR)»', () => {
  let app, root
  async function mount(props, listeners = {}) {
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      render: () => h(ArchivoOcrAction, { ...props, ...listeners }),
    })
    app.config.globalProperties.__ = globalThis.__
    app.mount(root)
    await flush()
  }
  afterEach(() => {
    app?.unmount()
    root?.remove()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
  const base = {
    document: 'DOC-1',
    available: true,
    guard: null,
    task: null,
    has_text: false,
    extracted_text: '',
  }

  it('shows the guard in grey when OCR is not available', async () => {
    stubFetch(() => [
      true,
      { ...base, available: false, guard: 'Un administrador debe conectar…' },
    ])
    await mount({ document: 'DOC-1' })
    expect(root.textContent).toContain('Un administrador debe conectar…')
    expect(root.querySelector('button')).toBe(null)
  })
  it('offers to read again when the document has text', async () => {
    stubFetch(() => [true, { ...base, has_text: true, extracted_text: 'x' }])
    await mount({ document: 'DOC-1' })
    expect(root.textContent).toContain('Read text again (OCR)')
  })
  it('does not call the server for files that are text already', async () => {
    const fetchMock = stubFetch(() => [true, base])
    await mount({ document: 'DOC-1', mediaType: 'text/csv' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('requests, follows the task every 5 s and emits the text', async () => {
    vi.useFakeTimers()
    let calls = 0
    const fetchMock = stubFetch((method) => {
      if (method === 'request_ocr')
        return [true, { ...base, task: { name: 'T1', state: 'Queued' } }]
      calls += 1
      if (calls === 1) return [true, base]
      if (calls === 2)
        return [true, { ...base, task: { name: 'T1', state: 'Submitted' } }]
      return [
        true,
        {
          ...base,
          has_text: true,
          extracted_text: 'Total 116.00',
          task: { name: 'T1', state: 'Complete' },
        },
      ]
    })
    const onText = vi.fn()
    await mount({ document: 'DOC-1' }, { onText })
    root.querySelector('button').click()
    await flush()
    expect(root.textContent).toContain('Sending to the archive…')
    await vi.advanceTimersByTimeAsync(5000)
    await flush()
    expect(root.textContent).toContain('Reading text…')
    await vi.advanceTimersByTimeAsync(5000)
    await flush()
    expect(root.textContent).toContain('Text ready')
    expect(onText).toHaveBeenCalledWith('Total 116.00')
    const methods = fetchMock.mock.calls.map((c) =>
      String(c[0]).split('.').pop(),
    )
    expect(methods).toEqual([
      'ocr_status',
      'request_ocr',
      'ocr_status',
      'ocr_status',
    ])
  })
  it('shows a failure with its message and a retry', async () => {
    stubFetch(() => [
      true,
      {
        ...base,
        task: {
          name: 'T1',
          state: 'Failed',
          error_message: 'Paperless no responde',
        },
      },
    ])
    await mount({ document: 'DOC-1' })
    expect(root.textContent).toContain('Paperless no responde')
    expect(root.querySelector('button').textContent).toContain('Try again')
  })
})

describe('connection form', () => {
  let app, root
  afterEach(() => {
    app?.unmount()
    root?.remove()
    vi.unstubAllGlobals()
  })
  it('shows the server refusal next to the form', async () => {
    const fetchMock = stubFetch(() => [
      false,
      serverError('Indica la cuenta de correo que se leerá.'),
    ])
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      render: () =>
        h(ConnectorForm, {
          company: 'ACME',
          connector: {
            name: 'DCON-2026-00002',
            connector_type: 'Mailbox',
            base_url: 'imaps://imap.gmail.com:993',
            remote_account: 'f@acme.mx',
            has_token: true,
            mail_rules: [
              {
                enabled: 1,
                sender: '@cfe.mx',
                subject: '',
                attachment_types: 'xml,pdf',
                visibility: 'Company',
              },
            ],
          },
        }),
    })
    app.config.globalProperties.__ = globalThis.__
    app.mount(root)
    await flush()
    root.querySelector('form').dispatchEvent(new Event('submit'))
    await flush()
    expect(root.querySelector('[role="alert"]').textContent).toContain(
      'Indica la cuenta de correo que se leerá.',
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.company).toBe('ACME')
    expect(body.values).not.toHaveProperty('api_token')
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `/api/method/${connectorMethod('save')}`,
    )
  })
})

describe('the connections page', () => {
  let app, root
  afterEach(() => {
    app?.unmount()
    root?.remove()
    vi.unstubAllGlobals()
  })
  async function mountPage(
    overview,
    path = '/archivos/conectores?company=ACME',
  ) {
    const fetchMock = stubFetch(() => [true, overview])
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/archivos',
          name: 'Archivos',
          component: { render: () => null },
        },
        {
          path: '/archivos/conectores',
          name: 'ArchivosConectores',
          component: ArchivosConectores,
        },
      ],
    })
    router.push(path)
    await router.isReady()
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({ render: () => h(ArchivosConectores) })
    app.config.globalProperties.__ = globalThis.__
    app.use(router)
    app.mount(root)
    await flush(12)
    return fetchMock
  }
  const overview = {
    companies: ['ACME'],
    company: 'ACME',
    can_configure: true,
    automation_enabled: true,
    stopped: false,
    monthly_limit: 500,
    used_this_month: 500,
    types: ['Paperless', 'Mailbox'],
    kinds: ['Unknown', 'Invoice'],
    connectors: [
      {
        name: 'DCON-2026-00001',
        title: 'Archivo',
        company: 'ACME',
        connector_type: 'Paperless',
        enabled: 1,
        base_url: 'https://p.example.mx',
        remote_version: '3.0.5',
        api_version: 10,
        can_manage: true,
        health: {
          status: 'error',
          hint: 'La última consulta falló.',
          pending: 2,
          failed: 0,
          poll_minutes: 10,
          webhook: false,
        },
        backfill: { state: 'Idle', percent: 0, report: null },
      },
    ],
  }
  it('shows health, capacity and keeps the company on the way back', async () => {
    const fetchMock = await mountPage(overview)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      company: 'ACME',
    })
    const text = root.textContent
    expect(text).toContain('Connections')
    expect(text).toContain('Not working')
    expect(text).toContain('La última consulta falló.')
    expect(text).toContain('Paperless 3.0.5 · API 10')
    expect(text).toContain('500 of 500 documents used this month')
    expect(text).toContain('The monthly capacity is used up')
    const back = root.querySelector('a')
    expect(back.getAttribute('href')).toBe('/archivos?company=ACME')
  })
  it('explains the guards with a next step', async () => {
    await mountPage({
      ...overview,
      can_configure: false,
      automation_enabled: false,
      connectors: [],
    })
    const text = root.textContent
    expect(text).toContain('Activate Documents in your plan')
    expect(text).toContain('Only an administrator can set up connections')
    expect(text).toContain('Copy request for an administrator')
    expect(text).not.toContain('New connection')
  })
  it('offers both types when nothing is connected yet', async () => {
    await mountPage({ ...overview, connectors: [] })
    expect(root.textContent).toContain('Nothing connected yet')
    expect(root.textContent).toContain('Paperless archive')
    expect(root.textContent).toContain('Invoice mailbox')
  })
})

describe('Spanish catalog', () => {
  it('has an es entry for every string of the connections page and OCR action', () => {
    const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
    const catalog = new Map()
    for (const m of po.matchAll(
      /^msgid "((?:[^"\\]|\\.)*)"\nmsgstr "((?:[^"\\]|\\.)*)"/gm,
    ))
      catalog.set(m[1], m[2])
    const strings = []
    for (const file of [
      '../../src/pages/ArchivosConectores.vue',
      '../../src/components/archivos/ArchivoOcrAction.vue',
      '../../src/components/archivos/conectores/ConnectorCard.vue',
      '../../src/components/archivos/conectores/ConnectorForm.vue',
      '../../src/components/archivos/conectores/MailRulesEditor.vue',
      '../../src/components/archivos/conectores/RemotePicker.vue',
      '../../src/components/archivos/conectores/BackfillPanel.vue',
      '../../src/components/archivos/conectores/MappingsPanel.vue',
      '../../src/components/archivos/conectores/SetupPanel.vue',
    ]) {
      const source = readFileSync(resolve(here, file), 'utf8')
      strings.push(
        ...[...source.matchAll(/__\(\s*(['"])((?:(?!\1).)+)\1/gs)].map(
          (m) => m[2],
        ),
      )
    }
    const helpers = readFileSync(
      resolve(here, '../../src/utils/archivosConectores.js'),
      'utf8',
    )
    // Label tables and tr() calls in the helpers.
    strings.push(
      ...[...helpers.matchAll(/\btr\(\s*(['"])((?:(?!\1).)+)\1/gs)].map(
        (m) => m[2],
      ),
      ...[
        ...helpers.matchAll(
          /^\s+\w+: \[\s*'([^']+)',\s*'(?:gray|green|orange|red|blue|archive|mail)'/gm,
        ),
      ].map((m) => m[1]),
      ...[...helpers.matchAll(/\['\w+', '([^']+\{0\}[^']*)'\]/g)].map(
        (m) => m[1],
      ),
    )
    expect(strings.length).toBeGreaterThan(150)
    const missing = [...new Set(strings)].filter((text) => !catalog.get(text))
    expect(missing).toEqual([])
  })
})
