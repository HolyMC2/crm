// Notification-ping decisions (audit-front named this untested; extracted pure).
import { describe, it, expect } from 'vitest'
import { shouldPingWa, shouldPingMessenger, recentSelfSend, SELF_SEND_WINDOW_MS } from '@/utils/pingLogic'

const T = 1_000_000

describe('pingLogic', () => {
  it('pings when unread count rises and no recent self-send', () => {
    expect(shouldPingWa(3, 2, T - 10_000, T)).toBe(true)
  })

  it('never pings on equal or falling unread (status echoes, reads)', () => {
    expect(shouldPingWa(2, 2, T - 10_000, T)).toBe(false)
    expect(shouldPingWa(1, 2, T - 10_000, T)).toBe(false)
  })

  it('suppresses within the self-send window (own outbound echo)', () => {
    expect(shouldPingWa(3, 2, T - (SELF_SEND_WINDOW_MS - 1), T)).toBe(false)
    expect(shouldPingWa(3, 2, T - (SELF_SEND_WINDOW_MS + 1), T)).toBe(true)
  })

  it('messenger pings only on Incoming outside the window', () => {
    expect(shouldPingMessenger('Incoming', T - 10_000, T)).toBe(true)
    expect(shouldPingMessenger('Outgoing', T - 10_000, T)).toBe(false)
    expect(shouldPingMessenger('Incoming', T - 1000, T)).toBe(false)
    expect(shouldPingMessenger(undefined, T - 10_000, T)).toBe(false)
  })

  it('recentSelfSend boundary is inclusive', () => {
    expect(recentSelfSend(T - SELF_SEND_WINDOW_MS, T)).toBe(true)
  })
})
