import { describe, expect, it } from 'vitest'
import { agentReason } from '@/components/doco/inbox/agentDraft'

describe('agent drafts in Por aprobar', () => {
  it('says why the reply waits', () => {
    expect(agentReason('agent:ungrounded:$700')).toContain('$700')
    expect(agentReason('agent:promise')).toBe(
      'Asistente: promete algo al cliente',
    )
    expect(agentReason('agent:borrador')).toBe('Asistente para clientes')
  })
})
