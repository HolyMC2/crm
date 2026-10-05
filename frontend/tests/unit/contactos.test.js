import { describe, expect, it } from 'vitest'
import {
  contactScope,
  contactoRoute,
  dueLabel,
  accessLost,
  callError,
  errorGuard,
  errorKind,
  mergeConflict,
  mergeTaskPage,
  optionLabel,
  recovery,
  enterContactScope,
  fieldOptions,
  formatDay,
  formatMoment,
  identityTypeLabel,
  legacyFilters,
  loadContactState,
  nextFollowup,
  purgeContactosState,
  saveContactState,
  saveSegmentScope,
  segmentScope,
  sourceSlug,
  stableRequest,
  writableFields,
} from '../../src/utils/contactos.js'

function storage() {
  const values = {}
  Object.defineProperties(values, {
    getItem: { value: (key) => values[key] ?? null },
    setItem: {
      value: (key, value) => {
        values[key] = String(value)
      },
    },
    removeItem: {
      value: (key) => {
        delete values[key]
      },
    },
  })
  return values
}
describe('Contactos source, draft and return contracts', () => {
  it('keeps native source routes distinct, including both prospect sources', () => {
    expect(sourceSlug('CRM Lead')).toBe('crm-lead')
    expect(sourceSlug('Lead')).toBe('lead')
    expect(contactoRoute({ doctype: 'Supplier', name: 'PROV-001' })).toEqual({
      name: 'Contacto',
      params: { source: 'supplier', name: 'PROV-001' },
    })
  })
  it('uses the server boot site and encoded session cookie to isolate drafts', () => {
    const boot = {
      site_name: 'tenant-a',
      document: { cookie: 'sid=private; user_id=worker%40shop.test' },
      location: { host: 'other-host' },
    }
    expect(contactScope(boot)).toBe('tenant-a:worker@shop.test')
  })
  it('purges only Contactos state on an actor/site switch', () => {
    const data = storage()
    data.setItem('unrelated', 'preserve')
    enterContactScope(data, 'shop:alice')
    saveContactState(data, 'shop:alice', 'draft:identity', {
      draft: { first_name: 'Ana' },
    })
    enterContactScope(data, 'shop:bob')
    expect(loadContactState(data, 'shop:alice', 'draft:identity')).toBeNull()
    expect(data.getItem('unrelated')).toBe('preserve')
    expect(data.getItem('contactos:active-scope')).toBe('shop:bob')
  })
  it('preserves page, cursor, filters, selection and scroll without storing record summaries', () => {
    const data = storage()
    const snapshot = {
      q: 'secondary@example.test',
      segment: 'customers',
      filters: { kind: 'person' },
      cursor: 'opaque-cursor',
      cursorStack: [null],
      selected: 'contact:C-01',
      scrollTop: 180,
    }
    saveContactState(data, 'shop:worker', 'list', snapshot)
    expect(loadContactState(data, 'shop:worker', 'list')).toMatchObject(
      snapshot,
    )
    expect(loadContactState(data, 'other:worker', 'list')).toBeNull()
    purgeContactosState(data)
    expect(loadContactState(data, 'shop:worker', 'list')).toBeNull()
  })
  it('keeps one request ID for explicit retry and changes it for materially edited payloads', () => {
    const first = stableRequest(null, {
      source: 'contact',
      fields: { first_name: 'Ana' },
    })
    const persisted = JSON.parse(JSON.stringify(first))
    expect(
      stableRequest(persisted, {
        source: 'contact',
        fields: { first_name: 'Ana' },
      }).id,
    ).toBe(first.id)
    expect(
      stableRequest(persisted, {
        source: 'contact',
        fields: { first_name: 'Bea' },
      }).id,
    ).not.toBe(first.id)
  })
  it('does not break navigation when private session storage is unavailable', () => {
    const denied = {
      setItem() {
        throw new Error('Denied')
      },
      getItem() {
        throw new Error('Denied')
      },
    }
    expect(() => enterContactScope(denied, 'shop:alice')).not.toThrow()
    expect(loadContactState(denied, 'shop:alice', 'list')).toBeNull()
    expect(saveContactState(denied, 'shop:alice', 'list', {})).toBe(false)
  })
})
describe('Contactos source field ownership and follow-up priority', () => {
  it('submits only changed, explicitly writable fields and excludes native links', () => {
    const meta = [
      { fieldname: 'first_name' },
      { fieldname: 'full_name', read_only: true },
      { fieldname: 'links' },
      { fieldname: 'phone_nos' },
    ]
    expect(
      writableFields(
        {
          first_name: 'Ana',
          full_name: 'Ana López',
          links: [],
          phone_nos: [{ phone: '+526671234567' }],
        },
        meta,
        { first_name: 'Ana', phone_nos: [] },
      ),
    ).toEqual({ phone_nos: [{ phone: '+526671234567' }] })
  })
  it('keeps required native Select values while preserving their labels', () => {
    expect(fieldOptions({ options: 'Individual\nCompany' })).toEqual([
      { label: 'Individual', value: 'Individual' },
      { label: 'Company', value: 'Company' },
    ])
  })
  it('prioritizes an own overdue task and does not reopen a cancelled or completed source', () => {
    const tasks = [
      { name: 'closed', status: 'Closed', date: '2026-09-01' },
      { name: 'cancelled', status: 'Cancelled', date: '2026-09-02' },
      { name: 'next', status: 'Open', date: '2026-10-10' },
      { name: 'due', status: 'Open', date: '2026-10-01' },
    ]
    expect(nextFollowup(tasks, '2026-10-04').name).toBe('due')
    expect(dueLabel(tasks[3], '2026-10-04')).toBe('Vencido')
    expect(dueLabel({ status: 'Open', date: '2026-10-04' }, '2026-10-04')).toBe(
      'Hoy',
    )
    expect(dueLabel(tasks[1], '2026-10-04')).toBe('Cancelado')
    expect(
      dueLabel({ status: 'Closed', source_status: 'Cancelled' }, '2026-10-04'),
    ).toBe('Cancelado')
    expect(
      nextFollowup([{ status: 'Open', source_status: 'Cancelled' }]),
    ).toBeNull()
  })
  it('does not infer a hidden commercial party type', () => {
    expect(identityTypeLabel({ source: 'customer', kind: 'unknown' })).toBe(
      'Registro',
    )
  })
  it('rejects old filters that cannot preserve exact list scope', () => {
    expect(
      legacyFilters([['customer_type', '=', 'Company']], 'customer'),
    ).toEqual({
      unsupported: false,
      filters: { source: 'customer', kind: 'company' },
    })
    expect(
      legacyFilters([['name', '=', 'Acme']], 'organization').unsupported,
    ).toBe(true)
    expect(
      legacyFilters([['phone', 'like', '%67%']], 'contact').unsupported,
    ).toBe(true)
    expect(legacyFilters('{bad json', 'contact').unsupported).toBe(true)
  })
})
describe('Contactos saved segment scope', () => {
  it('restores search and all native facets without changing their exact membership scope', () => {
    const saved = saveSegmentScope('secondary@example.test', {
      source: 'customer',
      kind: 'person',
      tags: 'Revisar RFC',
      disabled: false,
      native_filters: [['territory', '=', 'Sinaloa']],
    })
    const reopened = segmentScope(JSON.parse(JSON.stringify(saved)))
    expect(reopened.q).toBe('secondary@example.test')
    expect(reopened.filters).toEqual({
      source: 'customer',
      kind: 'person',
      tags: 'Revisar RFC',
      disabled: false,
      native_filters: [['territory', '=', 'Sinaloa']],
    })
    expect(reopened.filters).not.toHaveProperty('q')
    reopened.filters.native_filters[0][2] = 'Otro territorio'
    expect(saved.native_filters).toEqual([['territory', '=', 'Sinaloa']])
  })
  it('keeps an intentionally cleared search and does not reuse the saved search invisibly', () => {
    const original = { q: 'Ana', source: 'contact', missing_phone: true }
    const controls = segmentScope(original)
    const edited = saveSegmentScope('', controls.filters)
    expect(edited).toEqual({ q: '', source: 'contact', missing_phone: true })
    expect(original.q).toBe('Ana')
    expect(segmentScope({ source: 'supplier' })).toEqual({
      q: '',
      filters: { source: 'supplier' },
    })
  })
  it('requires review of malformed saved scope instead of opening the whole directory', () => {
    expect(() => segmentScope({ q: ['Ana'], source: 'contact' })).toThrow(
      /revisión/,
    )
    expect(() => segmentScope([])).toThrow(/revisión/)
    expect(() => segmentScope(null)).toThrow(/revisión/)
  })
})

describe('Intl date formatting', () => {
  const now = new Date('2026-10-04T12:00:00Z')
  const tz = { system: 'America/Mexico_City', user: 'America/Mexico_City' }
  it('formats date-only values in the user language without shifting the day', () => {
    expect(formatDay('2026-10-05', { lang: 'es-MX', now })).toMatch(/5.*oct/)
    expect(formatDay('2026-10-05', { lang: 'en', now })).toMatch(/Oct 5/)
    expect(formatDay('2025-01-02', { lang: 'es-MX', now })).toMatch(/2025/)
    expect(formatDay('')).toBe('')
  })
  it('reads naive server timestamps in the system zone and shows recent ones relatively', () => {
    const later = Date.parse('2026-10-04T21:22:01Z')
    expect(
      formatMoment('2026-10-04 13:22:01.123456', {
        lang: 'es-MX',
        timezone: tz,
        now: later,
      }),
    ).toBe('hace 2 horas')
    expect(
      formatMoment('2026-10-04 13:22:01', {
        lang: 'es-MX',
        timezone: { system: 'America/Mexico_City', user: 'America/Tijuana' },
        now: Date.parse('2026-10-08T21:22:01Z'),
      }),
    ).toMatch(/4 oct.*12:22/)
    expect(formatMoment('not a date')).toBe('not a date')
  })
})

describe('structured recovery (finding 7)', () => {
  const spanish =
    'Alguien cambió estos datos. Recarga y compara antes de guardar.'
  it('classifies conflicts from the exception type, not the Spanish text', () => {
    const error = Object.assign(new Error(spanish), {
      exc_type: 'TimestampMismatchError',
      messages: [spanish],
    })
    expect(errorKind(error)).toBe('conflict')
    expect(recovery(error).kind).toBe('conflict')
    // The same wording without a stable signal is not guessed as a conflict.
    expect(errorKind(new Error(spanish))).toBe(null)
  })
  it('reads a GuardDTO code from the error or its server messages', () => {
    const guard = { code: 'version_conflict', message: spanish, actions: [] }
    expect(errorGuard({ guard })).toEqual(guard)
    expect(errorKind({ messages: [JSON.stringify(guard)] })).toBe('conflict')
    const permission = {
      code: 'permission',
      message: 'Sin permiso',
      actions: [],
    }
    expect(recovery({ exc_guard: permission }).kind).toBe('permission')
    expect(errorKind({ exc_type: 'PermissionError' })).toBe('permission')
    expect(errorKind({ status: 401 })).toBe('session')
  })
})

describe('three-way draft comparison (finding 3)', () => {
  it('keeps my change, shows theirs and rebases onto the latest', () => {
    const base = { first_name: 'Ana', last_name: 'López' }
    const mine = { first_name: 'Ana María', last_name: 'López' }
    const latest = { first_name: 'Ana', last_name: 'Pérez' }
    const result = mergeConflict(base, mine, latest)
    expect(result.overlap).toBe(false)
    expect(result.rebased).toEqual({
      first_name: 'Ana María',
      last_name: 'Pérez',
    })
    expect(result.rows.map((row) => row.field).sort()).toEqual([
      'first_name',
      'last_name',
    ])
  })
  it('flags fields both people changed differently', () => {
    const result = mergeConflict({ city: 'A' }, { city: 'B' }, { city: 'C' })
    expect(result.overlap).toBe(true)
    expect(result.rows[0]).toMatchObject({ mine: 'B', theirs: 'C' })
  })
})

describe('follow-up refresh (finding 8)', () => {
  it('replaces the page unless more was explicitly requested', () => {
    const first = [{ name: 'A' }]
    expect(mergeTaskPage(first, [{ name: 'A' }], { saved: true })).toEqual([
      { name: 'A' },
    ])
    expect(mergeTaskPage(first, [{ name: 'B' }], true)).toEqual([
      { name: 'A' },
      { name: 'B' },
    ])
  })
})

describe('es-MX select labels (finding 12)', () => {
  it('localizes labels and keeps native values', () => {
    expect(fieldOptions({ options: 'Company\nIndividual' }, 'es-MX')).toEqual([
      { label: 'Empresa', value: 'Company' },
      { label: 'Persona', value: 'Individual' },
    ])
    expect(optionLabel('Billing', 'es-MX')).toBe('Facturación')
    expect(optionLabel('Shipping', 'es')).toBe('Envío')
    expect(optionLabel('Billing', 'en')).toBe('Billing')
    expect(optionLabel('Unknown', 'es-MX')).toBe('Unknown')
  })
})

describe('guard-preserving call errors', () => {
  it('keeps the top-level guard and readable messages of a refusal', () => {
    const guard = {
      code: 'channel_set_required',
      message: 'Incluye todos',
      actions: [],
    }
    const error = callError('doco.contactos.api.save_record', 417, {
      exc_type: 'TimestampMismatchError',
      _server_messages: JSON.stringify([
        JSON.stringify({ message: 'Incluye todos' }),
      ]),
      guard,
    })
    expect(error.guard).toEqual(guard)
    expect(error.messages).toEqual(['Incluye todos'])
    expect(error.status).toBe(417)
    expect(errorKind(error)).toBe('conflict')
    expect(callError('m', 500, {}).messages).toEqual([
      'No pudimos completar la acción.',
    ])
  })
})

describe('storage scope', () => {
  it('ignores a DOM element exposed as window.user and uses the session cookie', () => {
    const element = { toString: () => '[object SVGSymbolElement]' }
    const scope = contactScope({
      site_name: 'tienda.example',
      user: element,
      document: { cookie: 'sid=x; user_id=ana%40tienda.example' },
    })
    expect(scope).toBe('tienda.example:ana@tienda.example')
    expect(
      contactScope({ site_name: 's', document: { cookie: 'user_id=b%40s' } }),
    ).not.toBe(scope)
  })
})

describe('follow-up access loss (R2 M7)', () => {
  it('treats unavailable sections and permission refusals as lost access', () => {
    expect(accessLost({ unavailable: true })).toBe(true)
    expect(accessLost({ exc_type: 'PermissionError' })).toBe(true)
    expect(accessLost({ status: 403 })).toBe(true)
    expect(accessLost(new Error('Network down'))).toBe(false)
  })
})
