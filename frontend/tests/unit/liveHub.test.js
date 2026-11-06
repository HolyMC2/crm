// The tab's live hub (composables/liveHub.js): invoices and payments join no
// room where Mercado or Taller announces them per reader, and their
// `muelle_change` envelopes reach the views that show those doctypes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLiveSync } from '@/vendor/muelle-shell/live-sync'
import { muelleChange, scopedDoctypes } from '@/composables/liveHub'

describe('live hub', () => {
  it('scopes the doctypes the installed apps announce per reader', () => {
    expect(scopedDoctypes(['frappe', 'crm'])).toEqual([])
    expect(scopedDoctypes(['crm', 'mercado'])).toEqual([
      'Sales Invoice',
      'POS Invoice',
      'Payment Entry',
    ])
    expect(scopedDoctypes(['mercado', 'taller']).sort()).toEqual([
      'POS Invoice',
      'Payment Entry',
      'Repair Order',
      'Sales Invoice',
      'Trade In',
    ])
    expect(scopedDoctypes(undefined)).toEqual([])
  })

  it('reads a muelle_change envelope as the record it announces', () => {
    expect(
      muelleChange({
        v: 1,
        id: 'e1',
        doctype: 'Sales Invoice',
        name: 'SINV-1',
        op: 'submit',
        modified: '2026-11-06 14:00:00',
      }),
    ).toEqual({
      doctype: 'Sales Invoice',
      name: 'SINV-1',
      op: 'submit',
      modified: '2026-11-06 14:00:00',
      id: 'e1',
    })
    expect(muelleChange({ doctype: 'Sales Invoice', op: 'bulk' }).name).toBe(
      undefined,
    )
    expect(muelleChange(null)).toBe(null)
  })

  describe('on a site with Mercado', () => {
    let socket, hub
    beforeEach(async () => {
      vi.useFakeTimers()
      const handlers = {}
      socket = {
        connected: true,
        emitted: [],
        on: (event, fn) => (handlers[event] ||= []).push(fn),
        off: () => {},
        emit(...args) {
          this.emitted.push(args)
        },
        fire: (event, data) => (handlers[event] || []).forEach((f) => f(data)),
      }
      hub = createLiveSync({
        socket,
        channel: false,
        reconcileMs: 0,
        events: { muelle_change: muelleChange },
        scopedDoctypes: scopedDoctypes(['mercado']),
        env: { random: () => 0 },
      })
      await Promise.resolve()
      await Promise.resolve()
    })
    afterEach(() => {
      hub.destroy()
      vi.useRealTimers()
    })

    it('joins no invoice room and hears the per-reader announcement', async () => {
      const refetch = vi.fn()
      hub.watch(['Sales Invoice', 'POS Closing Shift'], refetch)
      expect(socket.emitted).toEqual([
        ['doctype_subscribe', 'POS Closing Shift'],
      ])
      socket.fire('muelle_change', {
        id: 'e2',
        doctype: 'Sales Invoice',
        name: 'SINV-2',
        op: 'submit',
      })
      await vi.advanceTimersByTimeAsync(1000)
      expect(refetch).toHaveBeenCalledTimes(1)
      expect(refetch.mock.calls[0][0].names).toEqual(['SINV-2'])
    })
  })
})
