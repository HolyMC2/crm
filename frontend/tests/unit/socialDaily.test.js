// Post diario del taller (Redes): the composer's next step, who has the post, the
// photo pick and the manual-publish link check.
import { describe, expect, it } from 'vitest'
import * as daily from '@/composables/socialDaily'

const load = async () => daily

const picture = { media_file: '/files/a.jpg', media_type: 'Image' }

describe('nextStep: what a saved post needs next', () => {
  it('a post without a picture asks for the taller photos first', async () => {
    const { nextStep } = await load()
    expect(nextStep({ name: 'SP-1', status: 'Draft', media: [] }).key).toBe(
      'fotos',
    )
  })

  it('a caption with a problem is fixed before anything else', async () => {
    const { nextStep } = await load()
    const step = nextStep(
      { name: 'SP-1', status: 'Pending Approval', media: [picture] },
      { issues: ['garantía no documentada'] },
    )
    expect(step.key).toBe('texto')
    expect(step.text).toContain('garantía no documentada')
  })

  it('a pending post: a manager approves, anyone else waits for one', async () => {
    const { nextStep } = await load()
    const post = { name: 'SP-1', status: 'Pending Approval', media: [picture] }
    expect(nextStep(post, { canApprove: true }).key).toBe('aprobar')
    expect(nextStep(post, { canApprove: false }).key).toBe('gestor')
  })

  it('a hand-published post asks for the link, whoever looks', async () => {
    const { nextStep } = await load()
    const post = {
      name: 'SP-1',
      status: 'Pending Approval',
      manual_publish: 1,
      media: [picture],
    }
    expect(nextStep(post, { canApprove: true }).key).toBe('mano')
  })

  it('a scheduled post says its hour; a published one has nothing left', async () => {
    const { nextStep } = await load()
    expect(
      nextStep({
        name: 'SP-1',
        status: 'Scheduled',
        scheduled_time: '2026-11-16 19:00:00',
        media: [picture],
      }).text,
    ).toBe('Sale sola a las 19:00.')
    expect(nextStep({ name: 'SP-1', status: 'Published' }).key).toBe('hecho')
    expect(nextStep({ name: '' })).toBeNull()
  })
})

describe('reviewLine and initials', () => {
  it('names who has it open, else who did it', async () => {
    const { reviewLine } = await load()
    expect(
      reviewLine([
        { user: 'j', full_name: 'Jennifer Corona', status: 'Open' },
        { user: 't', full_name: 'Teresa García', status: 'Open' },
      ]),
    ).toBe('Lo revisan Jennifer Corona y Teresa García')
    expect(
      reviewLine([
        { user: 'j', full_name: 'Jennifer Corona', status: 'Closed' },
      ]),
    ).toBe('Lo revisó Jennifer Corona')
    expect(reviewLine([])).toBe('')
  })

  it('grey initials from a full name', async () => {
    const { initials } = await load()
    expect(initials('Teresa Rubí García')).toBe('TR')
    expect(initials('')).toBe('?')
  })
})

describe('the photo pick', () => {
  const one = { name: 'RPH-3', type: 'Después' }
  const other = { name: 'RPH-4', type: 'Después' }

  it('one photo after the repair: a new tap replaces it', async () => {
    const { pickPhoto } = await load()
    expect(pickPhoto(null, one)).toBe(one)
    expect(pickPhoto(one, other)).toBe(other)
  })

  it('a second tap takes it out', async () => {
    const { pickPhoto } = await load()
    expect(pickPhoto(one, one)).toBeNull()
  })
})

describe('links and songs', () => {
  it('knows a Facebook or Instagram link and nothing else', async () => {
    const { linkPlatform } = await load()
    expect(linkPlatform('https://www.facebook.com/doco/posts/1')).toBe(
      'Facebook',
    )
    expect(linkPlatform('https://fb.watch/abc')).toBe('Facebook')
    expect(linkPlatform('https://www.instagram.com/p/xyz/')).toBe('Instagram')
    expect(linkPlatform('https://evil.com/instagram.com')).toBe('')
    expect(linkPlatform('no es un enlace')).toBe('')
  })

  it('a song length reads m:ss', async () => {
    const { songLength } = await load()
    expect(songLength(65.4)).toBe('1:05')
    expect(songLength(null)).toBe('')
  })
})
