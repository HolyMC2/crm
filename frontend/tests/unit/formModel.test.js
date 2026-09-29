// Forms pages (components/Forms/formModel.js): layout grouping, publish
// readiness, tagged share links, embed snippet and the form return path.
import { describe, it, expect } from 'vitest'
import {
  channelLinks,
  fillBusiness,
  iframeSnippet,
  invalidDomains,
  isPublishable,
  isValidRoute,
  layoutFromFields,
  outcome,
  publicUrl,
  readiness,
  slugify,
  whatsappShareUrl,
  withUtm,
} from '@/components/Forms/formModel'
import { navItemAllowed, navItems, routeGroup } from '@/composables/navModel'
import { safeQueueReturn } from '@/utils/salesQueueContext'

const field = (fieldname, extra = {}) => ({
  fieldname,
  fieldtype: 'Data',
  label: fieldname,
  ...extra,
})
const brk = (fieldtype, label = '') => ({
  fieldname: `${fieldtype}-${label}`,
  fieldtype,
  label,
})

describe('slugify / routes', () => {
  it('makes a web address from any title, accents included', () => {
    expect(slugify('  Cotización Rápida!  ')).toBe('cotizacion-rapida')
    expect(slugify('Contact us')).toBe('contact-us')
  })
  it('accepts only lowercase dash-separated addresses', () => {
    expect(isValidRoute('contact-us-2')).toBe(true)
    for (const bad of ['', 'Contact', 'a--b', '-a', 'a b', 'a/b'])
      expect(isValidRoute(bad)).toBe(false)
  })
})

describe('layoutFromFields', () => {
  it('groups rows into sections and columns and drops empty unlabeled ones', () => {
    const layout = layoutFromFields([
      brk('Section Break', 'You'),
      field('first_name'),
      brk('Column Break'),
      field('email'),
      brk('Section Break'),
    ])
    expect(layout).toHaveLength(1)
    expect(layout[0].label).toBe('You')
    expect(layout[0].columns.map((c) => c.map((f) => f.fieldname))).toEqual([
      ['first_name'],
      ['email'],
    ])
  })
})

describe('readiness', () => {
  const base = {
    title: 'Contact us',
    route: 'contact-us',
    fields: [field('first_name'), field('mobile_no')],
  }
  const byKey = (items) => Object.fromEntries(items.map((i) => [i.key, i]))

  it('is publishable with a title, address, a field and every hidden value', () => {
    const items = readiness({
      form: base,
      hiddenFields: [{ fieldname: 'status', default: 'New' }],
      settings: { assign_mode: 'rules' },
    })
    expect(isPublishable(items)).toBe(true)
    expect(byKey(items).contact.ok).toBe(true)
  })

  it('blocks on a missing hidden value and names it', () => {
    const items = readiness({
      form: base,
      hiddenFields: [{ fieldname: 'status', label: 'Status', default: '' }],
      settings: {},
    })
    expect(isPublishable(items)).toBe(false)
    expect(byKey(items).hidden.hint).toBe('Status')
  })

  it('blocks without fields or a valid address; a missing contact field only advises', () => {
    const items = readiness({
      form: { title: 'X', route: 'Bad Route', fields: [brk('Section Break')] },
      hiddenFields: [],
      settings: {},
    })
    const k = byKey(items)
    expect(k.fields.ok).toBe(false)
    expect(k.route.ok).toBe(false)
    expect(k.contact.blocking).toBe(false)
    expect(isPublishable(items)).toBe(false)
  })
})

describe('share links', () => {
  const url = publicUrl('https://shop.example', 'contact-us')

  it('builds the public address', () => {
    expect(url).toBe('https://shop.example/crm-form/contact-us')
  })

  it('tags each channel so submissions carry their source', () => {
    const links = channelLinks(url, 'contact-us')
    const ig = links.find((l) => l.key === 'instagram')
    const params = new URL(ig.url).searchParams
    expect(params.get('utm_source')).toBe('instagram')
    expect(params.get('utm_medium')).toBe('social')
    expect(params.get('utm_campaign')).toBe('contact-us')
    expect(new Set(links.map((l) => l.key)).size).toBe(links.length)
  })

  it('appends tags to a link that already has a query', () => {
    expect(
      withUtm('https://x/y?embed=1', { utm_source: 'a', bogus: 'b' }),
    ).toBe('https://x/y?embed=1&utm_source=a')
    expect(withUtm('https://x/y', {})).toBe('https://x/y')
  })

  it('shares to WhatsApp with the link encoded', () => {
    expect(whatsappShareUrl('Hola', url)).toBe(
      `https://wa.me/?text=${encodeURIComponent(`Hola ${url}`)}`,
    )
  })

  it('embeds with the embed flag and escapes the title', () => {
    const s = iframeSnippet(url, 'Say "hi"')
    expect(s).toContain('/crm-form/contact-us?embed=1&utm_source=website')
    expect(s).toContain('title="Say &quot;hi&quot;"')
  })

  it('flags domains the server would drop from the frame policy', () => {
    expect(
      invalidDomains('https://ok.example *.shop.example bad;domain'),
    ).toEqual(['bad;domain'])
  })
})

describe('texts and outcomes', () => {
  it('fills the business name wherever the token appears', () => {
    expect(fillBusiness('{business} · {business}', 'Acme')).toBe('Acme · Acme')
    expect(fillBusiness('', 'Acme')).toBe('')
  })
  it('reports lead forms by conversion and deal forms by wins', () => {
    expect(outcome({ total: 4, deals: 1, won: 1 }, 'CRM Lead')).toMatchObject({
      primary: 1,
      rate: 25,
      won: 1,
    })
    expect(outcome({ total: 4, won: 2 }, 'CRM Deal')).toMatchObject({
      rate: 50,
    })
    expect(outcome({ total: 0 }, 'CRM Lead')).toBeNull()
  })
})

describe('navigation', () => {
  it('shows Forms to managers only and lights its own group', () => {
    const forms = navItems.find((i) => i.key === 'forms')
    expect(forms.to).toBe('/forms')
    expect(navItemAllowed(forms, { isManager: false })).toBe(false)
    expect(navItemAllowed(forms, { isManager: true })).toBe(true)
    expect(navItemAllowed(navItems[0], {})).toBe(true)
    expect(routeGroup('/forms/contact-us')).toBe('forms')
  })

  it('carries a return to the form submissions, and nothing foreign', () => {
    const back = '/forms/contact-us?tab=submissions'
    expect(safeQueueReturn(back)).toBe(back)
    for (const bad of [
      '/forms',
      '/forms/',
      '//evil.test/forms/x',
      '/forms/a/b',
      '/forms/a\\b',
    ])
      expect(safeQueueReturn(bad)).toBe('')
  })
})
