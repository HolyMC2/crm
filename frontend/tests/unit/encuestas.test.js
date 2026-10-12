import { describe, expect, it } from 'vitest'
import {
  hostedModules,
  isNeutralModule,
  moduleKeyFor,
} from '../../src/composables/muelleShell.js'
import {
  askNotice,
  bucketLabel,
  bucketName,
  bucketOf,
  customerHref,
  followUpLabel,
  followUpTheme,
  garantiaHref,
  greeting,
  inApp,
  normalizeBucket,
  normalizePeriod,
  normalizeView,
  periodLabel,
  recommendationText,
  recordRoute,
  scoreLabel,
  viewLabel,
  whatsappHref,
} from '../../src/composables/useEncuestas.js'
import { recoveryModule } from '../../src/utils/shellRoutes.js'
import { createPrefill } from '../../src/composables/useGarantias.js'
import { safeReturn } from '../../src/composables/useCompras.js'

describe('Encuestas boot', () => {
  it('is its own module and boots without the sales runtime', () => {
    expect(isNeutralModule('encuestas')).toBe(true)
    expect(hostedModules.find((m) => m.key === 'encuestas')?.to).toBe(
      '/encuestas',
    )
    expect(moduleKeyFor({ path: '/encuestas/QA-FB-00001', meta: {} })).toBe(
      'encuestas',
    )
    expect(recoveryModule('/encuestas/QA-FB-00001')).toBe('encuestas')
  })
})

describe('queue', () => {
  it('keeps unknown views on Por atender and unknown filters off', () => {
    expect(normalizeView('todas')).toBe('todas')
    expect(normalizeView('x')).toBe('atender')
    expect(normalizeView(undefined)).toBe('atender')
    expect(normalizeBucket('promoter')).toBe('promoter')
    expect(normalizeBucket('nps')).toBe('')
    expect(normalizePeriod('90')).toBe(90)
    expect(normalizePeriod('7')).toBe(30)
    expect(viewLabel('seguimiento')).toBe('In progress')
    expect(periodLabel(365)).toBe('Last 12 months')
    expect(periodLabel(30)).toBe('Last 30 days')
  })

  it('uses the standard buckets: 9-10 happy, 7-8 neutral, 0-6 unhappy', () => {
    expect([0, 6, 7, 8, 9, 10].map(bucketOf)).toEqual([
      'detractor',
      'detractor',
      'passive',
      'passive',
      'promoter',
      'promoter',
    ])
    expect(bucketLabel('detractor')).toBe('Unhappy (0–6)')
    expect(bucketName('promoter')).toBe('Happy')
    expect(scoreLabel(0)).toBe('0 of 10')
  })

  it('shows the recommendation number with its sign, and a dash before any answer', () => {
    expect(recommendationText({ value: 33 })).toBe('+33')
    expect(recommendationText({ value: 0 })).toBe('0')
    expect(recommendationText({ value: -20 })).toBe('-20')
    expect(recommendationText({ value: null })).toBe('—')
    expect(recommendationText(null)).toBe('—')
  })

  it('names the follow-up state in shop words', () => {
    expect(followUpLabel(null)).toBe('Nobody yet')
    expect(followUpLabel('Open')).toBe('In progress')
    expect(followUpTheme('Completed')).toBe('green')
    expect(recordRoute('QA-FB-1')).toEqual({
      name: 'Encuesta',
      params: { name: 'QA-FB-1' },
    })
  })
})

describe('the survey switch', () => {
  it('sends the owner to the switch and everyone else to ask the owner', () => {
    expect(askNotice({ state: 'on' }, { setup: true })).toBeNull()
    expect(askNotice(null, {})).toBeNull()
    expect(
      askNotice({ state: 'off', reason: 'Apagada' }, { setup: true }),
    ).toEqual({ state: 'off', reason: 'Apagada', action: 'setup' })
    expect(askNotice({ state: 'no_template' }, { setup: true }).action).toBe(
      'setup',
    )
    expect(askNotice({ state: 'off' }, { setup: false }).action).toBe('request')
    expect(askNotice({ state: 'no_app' }, { setup: true }).action).toBe(
      'request',
    )
    expect(askNotice({ state: 'no_link' }, { setup: true }).action).toBe(
      'shop_page',
    )
  })
})

describe('record hand-offs', () => {
  const record = {
    name: 'QA-FB-00007',
    customer: 'Ana López',
    customer_name: 'Ana López',
    buyer_name: 'Ana',
    sale_doctype: 'Sales Invoice',
    sale: 'ACC-SINV-2026-00012',
  }

  it('opens the customer in Contactos with the way back to the answer', () => {
    const href = customerHref(record)
    const url = new URL(href, 'https://x')
    expect(url.pathname).toBe('/contactos/customer/Ana%20L%C3%B3pez')
    expect(url.searchParams.get('return_to')).toBe('/crm/encuestas/QA-FB-00007')
    expect(url.searchParams.get('return_label')).toBe('Encuestas')
    expect(customerHref({ name: 'QA-FB-1' })).toBeNull()
  })

  it('opens a Garantías case prefilled with the sale, and Garantías reads it', () => {
    const href = garantiaHref(record)
    const url = new URL(href, 'https://x')
    expect(url.pathname).toBe('/garantias')
    const query = Object.fromEntries(url.searchParams)
    expect(query.create).toBe('1')
    expect(createPrefill(query)).toEqual({
      against_doctype: 'Sales Invoice',
      against_name: 'ACC-SINV-2026-00012',
    })
    expect(safeReturn(query.return_to)).toBe('/crm/encuestas/QA-FB-00007')
    expect(garantiaHref({ name: 'QA-FB-1' })).toBeNull()
  })

  it('keeps router paths inside the SPA', () => {
    expect(inApp('/crm/garantias?create=1')).toBe('/garantias?create=1')
    expect(inApp('/taller/orders/1')).toBe('/taller/orders/1')
  })

  it('writes on WhatsApp only to a usable number, greeting by first name', () => {
    expect(whatsappHref('+52 669 123 4567', 'Hola')).toBe(
      'https://wa.me/526691234567?text=Hola',
    )
    expect(whatsappHref('123', 'Hola')).toBeNull()
    expect(whatsappHref(null, 'Hola')).toBeNull()
    expect(greeting(record)).toContain('Hi Ana,')
    expect(greeting({})).toMatch(/^Hi, thanks/)
  })
})
