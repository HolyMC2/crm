// Atención a clientes in Conversaciones: «Por responder», the plain due chip,
// «Resolver» (+ «Siguiente») and the Encuestas side of «¿Cómo te atendimos?».
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  REPLY_TAB,
  dueChip,
  goToReturn,
  guardRoute,
  headerResolveLabel,
  nextReplyRow,
  resolveLabel,
  span,
  tabFromQuery,
  urlWithTab,
} from '../../src/utils/atencion.js'
import {
  bucketLabel,
  conversationHref,
  kindLabel,
  normalizeKind,
  satisfactionText,
  scoreLabel,
  serviceAskNotice,
} from '../../src/composables/useEncuestas.js'

// frappe-ui mock for the inbox composable: resources by url, a swappable `call`.
vi.mock('frappe-ui', () => {
  const resources = {}
  const callState = { calls: [], behavior: async () => ({}) }
  return {
    __resources: resources,
    __callState: callState,
    createResource: (opts = {}) => {
      const r = {
        url: opts.url,
        data: null,
        loading: false,
        lastParams: null,
        submit: vi.fn(async (params) => {
          r.lastParams = params
          return r.data
        }),
        fetch: vi.fn(),
        reload: vi.fn(),
      }
      resources[opts.url] = r
      return r
    },
    call: (...a) => {
      callState.calls.push(a)
      return callState.behavior(...a)
    },
    toast: { success: vi.fn(), error: vi.fn() },
  }
})
vi.mock('@/utils/statusGuard', () => ({
  guardStatusChange: vi.fn((_, __, cb) => cb && cb()),
}))

const here = dirname(fileURLToPath(import.meta.url))
const REPLY_URL = 'doco_marketing.api.inbox.get_reply_queue'

describe('the due chip, in plain words', () => {
  it('says how late, how soon or how long, and nothing when nobody waits', () => {
    expect(
      dueChip({ waiting_secs: 3300, sla_overdue: true, due_in_secs: -1500 }),
    ).toEqual({ tone: 'red', text: 'Overdue by 25 min' })
    expect(
      dueChip({ waiting_secs: 1080, sla_overdue: false, due_in_secs: 720 }),
    ).toEqual({ tone: 'amber', text: 'Due in 12 min' })
    expect(
      dueChip({ waiting_secs: 10800, sla_overdue: false, due_in_secs: null }),
    ).toEqual({ tone: 'gray', text: 'Waiting 3 h' })
    expect(dueChip({ waiting_secs: null, sla_overdue: false })).toBeNull()
    expect(dueChip(null)).toBeNull()
    expect([span(59), span(3600), span(90000), span(-1500)]).toEqual([
      '1 min',
      '1 h',
      '1 d',
      '25 min',
    ])
  })
})

describe('Por responder in the URL and the next conversation', () => {
  it('keeps ?tab=por-responder for Por responder only', () => {
    expect(tabFromQuery({ tab: 'por-responder' })).toBe(REPLY_TAB)
    expect(tabFromQuery({ tab: 'vencidos' })).toBeNull()
    expect(urlWithTab('/crm/inbox?deal=D-1', REPLY_TAB)).toBe(
      '/crm/inbox?deal=D-1&tab=por-responder',
    )
    expect(urlWithTab('/crm/inbox?tab=por-responder&deal=D-1', 'all')).toBe(
      '/crm/inbox?deal=D-1',
    )
  })

  it('picks the next row owed an answer, never the one just resolved', () => {
    const rows = [
      { name: 'D-1', ref_doctype: 'CRM Deal' },
      { name: 'L-1', ref_doctype: 'CRM Lead' },
    ]
    expect(nextReplyRow(rows, 'CRM Deal', 'D-1').name).toBe('L-1')
    expect(nextReplyRow(rows, 'CRM Lead', 'L-1').name).toBe('D-1')
    expect(nextReplyRow([rows[0]], 'CRM Deal', 'D-1')).toBeNull()
    expect(nextReplyRow([], 'CRM Deal', 'D-1')).toBeNull()
  })

  it('names «Resolver» by what happens next', () => {
    expect(headerResolveLabel('queue')).toBe('Resolve and next')
    expect(headerResolveLabel(null)).toBe('Resolve')
    expect(resolveLabel({ ask: true, next: 'queue' })).toBe('Resolve and next')
    expect(resolveLabel({ ask: false, next: 'queue' })).toBe(
      'Resolve without asking and next',
    )
    expect(resolveLabel({ ask: true, next: 'return' })).toBe(
      'Resolve and go back',
    )
    expect(resolveLabel({ ask: false })).toBe('Resolve without asking')
  })

  it('sends a guard action to its screen with the way back', () => {
    expect(
      guardRoute(
        '/contactos?create=1',
        '/crm/inbox?deal=D-1&doctype=CRM+Deal',
        'Conversaciones',
      ),
    ).toBe(
      '/contactos?create=1&return_to=%2Fcrm%2Finbox%3Fdeal%3DD-1%26doctype%3DCRM%2BDeal&return_label=Conversaciones',
    )
    expect(guardRoute('https://evil.test/x', '/crm/inbox')).toBeNull()
    expect(guardRoute(undefined, '/crm/inbox')).toBeNull()
  })

  it('goes back inside the SPA by the router, elsewhere by a page load', () => {
    const router = { push: vi.fn() }
    expect(goToReturn(router, '/crm/encuestas/QF-1')).toBe(true)
    expect(router.push).toHaveBeenCalledWith('/encuestas/QF-1')
    const assign = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, assign },
    })
    try {
      goToReturn(router, '/taller/orders/RO-1')
      expect(assign).toHaveBeenCalledWith('/taller/orders/RO-1')
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: original,
      })
    }
    expect(goToReturn(router, null)).toBe(false)
  })
})

describe('Resolver through the inbox composable', () => {
  let inbox, frappe

  beforeEach(async () => {
    vi.resetModules()
    vi.useFakeTimers()
    localStorage.clear()
    inbox = await import('@/composables/inbox')
    frappe = await import('frappe-ui')
    frappe.__callState.calls.length = 0
    frappe.__callState.behavior = async () => ({})
  })
  afterEach(() => vi.useRealTimers())

  it('resolves with the question and one request id, then refreshes Por responder', async () => {
    frappe.__callState.behavior = async (method) =>
      method.endsWith('.resolve')
        ? { ok: true, asked: true, review: 'WSR-1' }
        : {}
    const out = await inbox.resolveConversation('CRM Deal', 'D-1', {
      ask: true,
      requestId: 'req-12345678',
    })
    expect(out.asked).toBe(true)
    const [method, args] = frappe.__callState.calls.find(([m]) =>
      m.endsWith('.resolve'),
    )
    expect(method).toBe('doco_marketing.api.inbox.resolve')
    expect(args).toEqual({
      reference_doctype: 'CRM Deal',
      reference_name: 'D-1',
      ask: 1,
      request_id: 'req-12345678',
    })
    expect(frappe.__resources[REPLY_URL].submit).toHaveBeenCalled()
  })

  it('«Resolver sin preguntar» on the chip asks nothing and puts the chip back if refused', async () => {
    const queue =
      frappe.__resources['doco_marketing.api.inbox.get_conversation_queue']
    queue.data = [
      {
        name: 'D-2',
        deal: 'D-2',
        ref_doctype: 'CRM Deal',
        unread: true,
        waiting_secs: 900,
      },
    ]
    await inbox.reloadQueue()
    frappe.__callState.behavior = async () => {
      throw new Error('Not permitted')
    }
    await inbox.clearResponder('CRM Deal', 'D-2')
    const [, args] = frappe.__callState.calls.find(([m]) =>
      m.endsWith('.resolve'),
    )
    expect(args.ask).toBe(0)
    expect(inbox.queueRows.value[0].waiting_secs).toBe(900)
    expect(frappe.toast.error).toHaveBeenCalled()
  })

  it('«Siguiente» opens the next conversation owed an answer on its conversation tab', async () => {
    const reply = frappe.__resources[REPLY_URL]
    reply.data = {
      count: 2,
      overdue: 1,
      mine: 1,
      conversations: [
        { name: 'D-1', ref_doctype: 'CRM Deal' },
        { name: 'L-9', ref_doctype: 'CRM Lead' },
      ],
    }
    inbox.selectDeal('D-1', 'CRM Deal', { fromReplyQueue: true })
    expect(inbox.activeTab.value).toBe('conversation')
    const next = await inbox.openNextToAnswer('CRM Deal', 'D-1')
    expect(next.name).toBe('L-9')
    expect(inbox.activeDeal.value).toBe('L-9')
    expect(inbox.activeDealDoctype.value).toBe('CRM Lead')
    expect(inbox.fromReplyQueue.value).toBe(true)

    reply.data = {
      count: 0,
      overdue: 0,
      mine: 0,
      conversations: [{ name: 'L-9', ref_doctype: 'CRM Lead' }],
    }
    expect(await inbox.openNextToAnswer('CRM Lead', 'L-9')).toBeNull()
    expect(inbox.inboxTab.value).toBe(REPLY_TAB)
    expect(inbox.activeDeal.value).toBeNull()
    expect(inbox.mobileView.value).toBe('list')
  })

  it('«Míos» narrows Por responder on the server', async () => {
    await inbox.setReplyMine(true)
    expect(frappe.__resources[REPLY_URL].lastParams).toMatchObject({ mine: 1 })
    await inbox.setReplyMine(false)
    expect(frappe.__resources[REPLY_URL].lastParams).toMatchObject({ mine: 0 })
  })

  it('counts overdue conversations, not every one owed, as unattended', () => {
    frappe.__resources[REPLY_URL].data = { count: 5, overdue: 2, mine: 1 }
    expect(inbox.unattendedTotal.value).toBe(2)
  })
})

describe('Encuestas: «¿Cómo te atendimos?» next to the recommendation', () => {
  it('reads a service answer as «2 of 5» in its own groups', () => {
    expect(scoreLabel(2, 5)).toBe('2 of 5')
    expect(scoreLabel(7)).toBe('7 of 10')
    expect(bucketLabel('detractor', 'service')).toBe('Unhappy (1–2)')
    expect(bucketLabel('detractor')).toBe('Unhappy (0–6)')
    expect(kindLabel('service')).toBe('Service')
    expect([normalizeKind('service'), normalizeKind('x')]).toEqual([
      'service',
      '',
    ])
    expect(satisfactionText({ satisfaction: { value: 40 } })).toBe('40 %')
    expect(satisfactionText({ satisfaction: { value: null } })).toBe('—')
  })

  it('opens the resolved conversation with the way back to the answer', () => {
    expect(
      conversationHref({
        name: 'QA-FB-0001',
        conversation_link: { doctype: 'CRM Deal', name: 'CRM-DEAL-1' },
      }),
    ).toBe(
      '/inbox?deal=CRM-DEAL-1&doctype=CRM+Deal&return_to=%2Fcrm%2Fencuestas%2FQA-FB-0001&return_label=Encuestas',
    )
    expect(conversationHref({ name: 'QA-FB-0001' })).toBeNull()
  })

  it('sends the owner to the switch and everyone else to ask the owner', () => {
    expect(serviceAskNotice({ state: 'on' })).toBeNull()
    expect(
      serviceAskNotice({ state: 'no_template', reason: 'x' }, { setup: true })
        .action,
    ).toBe('setup')
    expect(
      serviceAskNotice({ state: 'off', reason: 'x' }, { setup: false }).action,
    ).toBe('request')
  })
})

describe('every new word has its es-MX entry', () => {
  const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
  const catalog = new Map()
  for (const m of po.matchAll(
    /^(?:msgctxt "((?:[^"\\]|\\.)*)"\n)?msgid "((?:[^"\\]|\\.)*)"\nmsgstr "((?:[^"\\]|\\.)*)"/gm,
  ))
    catalog.set(`${m[1] || ''}\u0004${m[2]}`, m[3])
  const strings = (file, pattern) =>
    [
      ...readFileSync(resolve(here, '../../src', file), 'utf8').matchAll(
        pattern,
      ),
    ].map((m) => m[2])

  it('covers the resolve sheet and the due chip words', () => {
    const found = [
      ...strings(
        'components/doco/inbox/ResolveSheet.vue',
        /__\(\s*(['"])((?:(?!\1).)+)\1/gs,
      ),
      ...strings('utils/atencion.js', /tr\(\s*(['"])((?:(?!\1).)+)\1/gs),
    ]
    expect(found.length).toBeGreaterThan(12)
    for (const text of found)
      expect(catalog.get(`\u0004${text}`), text).toBeTruthy()
  })

  it('covers the queue tab, the chip and the setup dialog', () => {
    for (const text of [
      'To answer',
      'Mine',
      'Most overdue first',
      'Nobody is waiting for your answer.',
      'Resolve without asking',
      'Ask how we did after resolving a conversation',
      'Set up the template',
      'Satisfaction',
    ])
      expect(catalog.get(`\u0004${text}`), text).toBeTruthy()
    for (const text of ['Service', 'Purchase', '{0} of 5', 'Unhappy (1–2)'])
      expect(catalog.get(`Encuestas\u0004${text}`), text).toBeTruthy()
  })
})
