// Cobranza «Recordatorios automáticos»: state chips, the «Recordatorios de hoy»
// list and the switch-on sheet's guards (every block names its way out).
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  AUTO_ACTION_LABELS,
  AUTO_MISSING,
  SEGMENTS,
  autoChip,
  autoLine,
  normalizeSegment,
  ownerRequest,
  setupProblem,
} from '@/composables/useCobranza'
import { formatDay } from '@/utils/contactos'

const TODAY = '2026-10-14'

function auto(state, extra = {}) {
  return { state, date: null, code: null, reason: null, actions: [], ...extra }
}

describe('Cobranza automatic state chips', () => {
  it('stays silent while the reminders are off', () => {
    expect(autoChip(null, TODAY)).toBeNull()
    expect(autoChip(auto('off'), TODAY)).toBeNull()
    expect(autoLine(null, TODAY)).toBe('')
  })

  it.each([
    [auto('next', { date: TODAY }), 'Next reminder today', 'blue'],
    [
      auto('next', { date: '2026-10-16' }),
      `Next reminder ${formatDay('2026-10-16')}`,
      'blue',
    ],
    [
      auto('promise', { date: '2026-10-16' }),
      `Paused: promise until ${formatDay('2026-10-16')}`,
      'gray',
    ],
    [auto('replied', { date: TODAY }), 'Stopped: they replied', 'orange'],
    [auto('opted_out'), 'Does not accept messages', 'red'],
    [auto('manual', { code: 'suppressed' }), 'Does not accept messages', 'red'],
    [
      auto('manual', { code: 'conversation_owned' }),
      'Stopped: someone is in the chat',
      'orange',
    ],
    [auto('manual', { code: 'no_conversation' }), 'You send it', 'orange'],
    [auto('manual', { code: 'channel_manual' }), 'You send it', 'orange'],
    [auto('review_usd'), 'Review: invoice in USD', 'orange'],
    [auto('paused', { code: 'owner_only' }), 'Reminders paused', 'orange'],
    [auto('done'), 'All three reminders sent', 'gray'],
  ])('%o → %s', (state, label, theme) => {
    expect(autoChip(state, TODAY)).toEqual({ label, theme })
  })

  it('words the record line with the level and the server reason', () => {
    expect(
      autoLine(
        auto('next', { date: TODAY, level_label: 'Segundo aviso' }),
        TODAY,
      ),
    ).toBe('Next automatic reminder: today (Segundo aviso).')
    expect(
      autoLine(
        auto('manual', { reason: 'Ana atiende la conversación.' }),
        TODAY,
      ),
    ).toBe('You send this one: Ana atiende la conversación.')
    expect(
      autoLine(auto('paused', { reason: 'La cuenta no está activa.' }), TODAY),
    ).toBe('La cuenta no está activa.')
    expect(autoLine(auto('done'), TODAY)).toMatch(/Call or visit/)
  })
})

describe('Recordatorios de hoy segment', () => {
  it('is a Cobranza list with its own key', () => {
    expect(SEGMENTS.map((s) => s.value)).toContain('recordar')
    expect(normalizeSegment('recordar')).toBe('recordar')
    // Lane 1's «Due soon» keeps its key.
    expect(normalizeSegment('hoy')).toBe('hoy')
    expect(normalizeSegment('hoy-recordar')).toBe('vencidas')
  })
})

describe('Switch-on sheet guards', () => {
  const READY = {
    missing: [],
    ladder_ready: true,
    can_setup_ladder: true,
    mode: 'api',
    can_configure: true,
    templates: [
      { name: 'recordatorio_ok', problem: null },
      {
        name: 'recordatorio_revision',
        problem: 'template_pending',
        reason: 'La plantilla sigue en revisión por WhatsApp.',
      },
    ],
  }
  const FORM = {
    account: 'Dueño',
    template: 'recordatorio_ok',
    from: '10:00',
    to: '19:00',
  }

  it('lets the owner save a complete setup', () => {
    expect(setupProblem(READY, FORM)).toBeNull()
    expect(setupProblem(null, FORM)).toBeNull()
  })

  it('names the missing rights and offers the request for the owner', () => {
    const problem = setupProblem(
      { ...READY, missing: ['route_write', 'reminder_permission'] },
      FORM,
    )
    expect(problem.action).toBe('copy_request')
    expect(problem.text).toContain(AUTO_MISSING.route_write)
    expect(problem.text).toContain(AUTO_MISSING.reminder_permission)
    const request = ownerRequest(['sender_grant'], 'Doco MX')
    expect(request).toContain('Doco MX')
    expect(request).toContain(AUTO_MISSING.sender_grant)
  })

  it('a pending or missing template asks for another one', () => {
    const pending = setupProblem(READY, {
      ...FORM,
      template: 'recordatorio_revision',
    })
    expect(pending.action).toBe('choose_template')
    expect(pending.text).toMatch(/revisión.*Choose another template\./)
    expect(setupProblem(READY, { ...FORM, template: '' }).action).toBe(
      'choose_template',
    )
    expect(AUTO_ACTION_LABELS.choose_template).toBe('Choose another template')
  })

  it('a shop that sends from its phone needs no template', () => {
    expect(
      setupProblem({ ...READY, mode: 'manual' }, { ...FORM, template: '' }),
    ).toBeNull()
  })

  it('ladder, WhatsApp off, account and window each say what to do', () => {
    expect(setupProblem({ ...READY, ladder_ready: false }, FORM).action).toBe(
      'setup_ladder',
    )
    expect(
      setupProblem(
        { ...READY, ladder_ready: false, can_setup_ladder: false },
        FORM,
      ).action,
    ).toBe('copy_request')
    expect(setupProblem({ ...READY, mode: 'off' }, FORM).action).toBe(
      'whatsapp_settings',
    )
    expect(
      setupProblem({ ...READY, mode: 'off', can_configure: false }, FORM)
        .action,
    ).toBe('copy_request')
    expect(setupProblem(READY, { ...FORM, account: '' }).text).toMatch(
      /WhatsApp account/,
    )
    expect(
      setupProblem(READY, { ...FORM, from: '19:00', to: '10:00' }).text,
    ).toMatch(/start before it ends/)
  })
})

// Every line the sheet and the new states show has its Spanish.
const here = dirname(fileURLToPath(import.meta.url))
const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
const catalog = new Set()
for (const m of po.matchAll(
  /^(?:msgctxt "((?:[^"\\]|\\.)*)"\n)?msgid "((?:[^"\\]|\\.)*)"\nmsgstr "((?:[^"\\]|\\.)+)"/gm,
))
  catalog.add(m[2].replace(/\\"/g, '"'))

describe('Spanish for the automatic reminders', () => {
  const sheet = readFileSync(
    resolve(here, '../../src/components/cobranza/AutoSetupSheet.vue'),
    'utf8',
  )
  const strings = [...sheet.matchAll(/__\(\s*'((?:[^'\\]|\\.)*)'/g)].map(
    (m) => m[1],
  )
  it.each(strings)('%s', (text) => {
    expect(catalog.has(text)).toBe(true)
  })
  it.each([
    ...Object.values(AUTO_MISSING),
    ...Object.values(AUTO_ACTION_LABELS),
    "Today's reminders",
    'Next reminder {0}',
    'You send it',
    'Review: invoice in USD',
    'I sent it',
    'Resume reminders',
  ])('%s', (text) => {
    expect(catalog.has(text)).toBe(true)
  })
})
