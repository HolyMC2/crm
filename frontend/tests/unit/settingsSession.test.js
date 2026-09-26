import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
const resources = vi.hoisted(() => ({ cached: null, create: vi.fn() }))
vi.mock('frappe-ui', () => ({
  createDocumentResource: (...args) => resources.create(...args),
  getCachedDocumentResource: () => resources.cached,
}))
import {
  createSettingsSession,
  discardSettingsDocument,
  settingsDocumentResource,
  settingsErrorKind,
} from '@/composables/settingsSession'

describe('settings session', () => {
  it('keeps dirty state across inactive categories and waits for every save', async () => {
    const session = createSettingsSession()
    const dirty = ref(false),
      pending = ref(false)
    const remove = session.register({ dirty, pending })
    dirty.value = true
    await nextTick()
    expect(session.dirty.value).toBe(true)
    const confirm = vi.fn(() => true)
    pending.value = true
    expect(session.canLeave(confirm)).toBe(false)
    expect(confirm).not.toHaveBeenCalled()
    pending.value = false
    expect(session.canLeave(confirm)).toBe(true)
    remove()
    expect(session.dirty.value).toBe(false)
  })
  it('cancel leaves all drafts intact; confirmed discard resets shared document data', () => {
    const session = createSettingsSession()
    const resource = {
      originalDoc: { title: 'Saved', rows: [{ qty: 2 }] },
      doc: { title: 'Draft' },
    }
    const discard = vi.fn(() => discardSettingsDocument(resource))
    session.register({ dirty: () => true, discard })
    expect(session.canLeave(() => false)).toBe(false)
    expect(discard).not.toHaveBeenCalled()
    expect(resource.doc.title).toBe('Draft')
    expect(session.canLeave(() => true)).toBe(true)
    expect(resource.doc).toEqual(resource.originalDoc)
    resource.doc.rows[0].qty = 9
    expect(resource.originalDoc.rows[0].qty).toBe(2)
  })
  it('does not reload a shared dirty User when opening another editor', () => {
    resources.create.mockClear()
    resources.cached = { isDirty: true, doc: { first_name: 'Unsent' } }
    const result = settingsDocumentResource({
      doctype: 'User',
      name: 'actor@example.invalid',
    })
    expect(result).toBe(resources.cached)
    expect(resources.create).not.toHaveBeenCalled()
    resources.cached = null
    settingsDocumentResource({ doctype: 'User', name: 'other@example.invalid' })
    expect(resources.create).toHaveBeenCalledOnce()
  })
  it.each([
    [{ exc_type: 'PermissionError' }, 'denied'],
    [{ response: { status: 403 } }, 'denied'],
    [{ exc_type: 'DoesNotExistError' }, 'not_configured'],
    [new Error('network timeout'), 'unavailable'],
    [
      { message: 'proxy mentions permission while unavailable', status: 503 },
      'unavailable',
    ],
  ])(
    'classifies actual refusal separately from missing setup and outage',
    (error, kind) => {
      expect(settingsErrorKind(error)).toBe(kind)
    },
  )
})
