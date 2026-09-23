import { describe, expect, it } from 'vitest'
import { controlView, needsReason } from '@/utils/conversationControl'

const t = (s, args = []) => s.replace(/\{(\d)\}/g, (_, i) => args[i])
const base = {
  name: 'conv',
  actor: 'ana@x.invalid',
  control_state: 'Human',
  human_owner: null,
  provider_control: 'Not Applicable',
  allowed_actions: [],
  generation: 3,
}

describe('conversation control strip', () => {
  it('stays hidden without a native conversation', () => {
    expect(controlView(null, t)).toBeNull()
    expect(controlView({ name: null, denied: true }, t)).toBeNull()
  })

  it('tells an unowned conversation that replying takes it, with no extra click', () => {
    const view = controlView({ ...base, allowed_actions: ['take', 'pause'] }, t)
    expect(view.text).toBe('Sin responsable · al responder tomarás el control')
    expect(view.actions).toEqual([])
  })

  it('offers the owner release and names who asked for control', () => {
    const view = controlView(
      {
        ...base,
        human_owner: 'ana@x.invalid',
        allowed_actions: ['take', 'transfer', 'release'],
        control_requests: [{ actor_user: 'luis@x.invalid' }],
      },
      t,
    )
    expect(view.tone).toBe('green')
    expect(view.text).toBe('Atiendes tú · luis@x.invalid pidió el control')
    expect(view.actions.map((a) => a.action)).toEqual(['release'])
  })

  it('lets a colleague request control and a manager take it with a reason', () => {
    const owned = { ...base, human_owner: 'luis@x.invalid', owner_name: 'Luis' }
    expect(
      controlView({ ...owned, allowed_actions: ['request'] }, t),
    ).toMatchObject({
      text: 'Luis atiende esta conversación',
      actions: [{ action: 'request', label: 'Solicitar control' }],
    })
    const manager = {
      ...owned,
      allowed_actions: ['take', 'transfer', 'release'],
      manager_reason_required: true,
    }
    expect(controlView(manager, t).actions.map((a) => a.action)).toEqual([
      'take',
    ])
    expect(needsReason(manager, 'take')).toBe(true)
    expect(
      needsReason({ ...owned, manager_reason_required: false }, 'take'),
    ).toBe(false)
    expect(
      needsReason(
        { ...base, control_state: 'Bot', manager_reason_required: true },
        'take',
      ),
    ).toBe(false)
  })

  it('hands a bot run or a pause to a person, reopens a closed one, and defers to the business app', () => {
    expect(
      controlView(
        { ...base, control_state: 'Bot', allowed_actions: ['take', 'pause'] },
        t,
      ),
    ).toMatchObject({
      tone: 'blue',
      actions: [{ action: 'take' }],
    })
    expect(
      controlView(
        { ...base, control_state: 'Paused', allowed_actions: ['take'] },
        t,
      ).actions[0].action,
    ).toBe('take')
    expect(
      controlView(
        { ...base, control_state: 'Closed', allowed_actions: ['reopen'] },
        t,
      ).actions[0].action,
    ).toBe('reopen')
    expect(
      controlView({ ...base, control_state: 'Closed', allowed_actions: [] }, t)
        .actions,
    ).toEqual([])
    expect(
      controlView(
        { ...base, provider_control: 'Other', allowed_actions: ['take'] },
        t,
      ),
    ).toMatchObject({
      tone: 'amber',
      actions: [],
    })
  })
})
