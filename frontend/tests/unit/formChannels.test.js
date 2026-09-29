// Form channel sections (components/Forms/channels/channelModel.js).
import { describe, it, expect } from 'vitest'
import {
  flowView,
  followupProblem,
  mailView,
} from '@/components/Forms/channels/channelModel'

describe('flowView', () => {
  it('needs the WhatsApp API before anything can be published', () => {
    expect(flowView({ mode: 'manual', flow: null })).toMatchObject({
      step: 'unavailable',
      canPublish: false,
      canBuild: true,
    })
    expect(flowView({ mode: 'off', flow: null })).toMatchObject({
      step: 'unavailable',
      canBuild: false,
    })
  })

  it('walks none → draft → published', () => {
    expect(flowView({ mode: 'api', flow: null }).step).toBe('none')
    const draft = flowView({
      mode: 'api',
      flow: { status: 'Draft', unsupported: [] },
    })
    expect(draft).toMatchObject({ step: 'draft', canPublish: true })
    expect(flowView({ mode: 'api', flow: { status: 'Published' } }).step).toBe(
      'published',
    )
  })

  it('blocks publishing when the form changed or a required question is unsupported', () => {
    expect(
      flowView({ mode: 'api', flow: { status: 'Draft', out_of_date: true } }),
    ).toMatchObject({ step: 'outdated', canPublish: false })
    const blocked = flowView({
      mode: 'api',
      flow: {
        status: 'Draft',
        unsupported: [
          { fieldname: 'a', required: true },
          { fieldname: 'b', required: false },
        ],
      },
    })
    expect(blocked.canPublish).toBe(false)
    expect(blocked.blocking.map((u) => u.fieldname)).toEqual(['a'])
  })

  it('treats other Meta states as not publishable from here', () => {
    expect(
      flowView({ mode: 'api', flow: { status: 'Blocked' } }),
    ).toMatchObject({ step: 'other', canPublish: false })
  })
})

describe('mailView', () => {
  it('passes readiness through with safe defaults', () => {
    expect(mailView(null)).toEqual({
      ready: false,
      sender: '',
      hint: '',
      reason: '',
    })
    expect(
      mailView({
        readiness: { ready: true, sender: 'a@b.test', reason: 'ok' },
      }),
    ).toMatchObject({ ready: true, sender: 'a@b.test' })
  })
})

describe('followupProblem', () => {
  const templates = [
    { name: 'ok', status: 'APPROVED' },
    { name: 'pending', status: 'PENDING' },
  ]
  const base = {
    mode: 'template',
    template: 'ok',
    templates,
    consentEnabled: true,
    whatsappMode: 'api',
  }
  it('is empty for no follow-up or a ready setup', () => {
    expect(followupProblem({ ...base, mode: 'none' })).toBe('')
    expect(followupProblem(base)).toBe('')
  })
  it('names the first thing to fix', () => {
    expect(followupProblem({ ...base, template: '' })).toMatch(
      /approved template/,
    )
    expect(followupProblem({ ...base, template: 'pending' })).toMatch(/PENDING/)
    expect(followupProblem({ ...base, consentEnabled: false })).toMatch(
      /consent/,
    )
    expect(followupProblem({ ...base, whatsappMode: 'manual' })).toMatch(/API/)
  })
})
