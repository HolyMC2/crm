import { describe, expect, it } from 'vitest'
import { inboxSpace, inboxSpaceQuery } from '@/utils/inboxSpaces'

describe('Inbox spaces (CRM-S3.4: «Por aprobar» is an Inbox filter)', () => {
  it('opens «Negocios y actividad» by default and the others when asked', () => {
    expect(inboxSpace({})).toBe('activity')
    expect(inboxSpace({ workspace: 'conversations' })).toBe('conversations')
    expect(inboxSpace({ workspace: 'review' })).toBe('review')
    expect(inboxSpace({ conversation: 'c1' })).toBe('conversations')
    expect(inboxSpace({ conversation: 'c1', deal: 'D-1' })).toBe('activity')
  })

  it('without the marketing add-on only native conversations exist', () => {
    expect(inboxSpace({ workspace: 'review' }, false)).toBe('conversations')
  })

  it('switching keeps the way back and drops stale deep links', () => {
    const query = { return_to: '/pendientes', deal: 'D-1', conversation: 'c1' }
    expect(inboxSpaceQuery(query, 'review')).toEqual({
      return_to: '/pendientes',
      deal: undefined,
      conversation: undefined,
      workspace: 'review',
    })
    expect(inboxSpaceQuery(query, 'activity')).toMatchObject({
      workspace: undefined,
      conversation: undefined,
    })
    expect(inboxSpaceQuery(query, 'conversations')).toMatchObject({
      workspace: 'conversations',
      conversation: 'c1',
    })
  })
})
