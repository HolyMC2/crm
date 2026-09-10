// Mount the real Activities controller with presentation children stubbed.
// Assert requests and realtime behavior, not source text or copied conditions.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, effectScope, nextTick, ref } from 'vue'
const h = vi.hoisted(() => ({ requests: [], handlers: {}, addon: null, whatsapp: null }))
vi.mock('@/utils/crmCapabilities', () => ({ addonAvailable: h.addon }))
vi.mock('@/composables/whatsapp', () => ({ whatsappEnabled: h.whatsapp }))
vi.mock('@/composables/inbox', () => ({ catalogOpen: false, openCatalog: () => {} }))
vi.mock('@/utils', () => ({ startCase: (s) => s }))
vi.mock('@/stores/users', () => ({ usersStore: () => ({ getUser: () => ({ full_name: 'Fictional user' }) }) }))
vi.mock('@/stores/global', () => ({ globalStore: () => ({ $socket: {
  on: (name, fn) => { h.handlers[name] = fn },
  off: (name) => { delete h.handlers[name] }, emit: () => {},
} }) }))
vi.mock('@/composables/useTimelinePreferences', () => ({ useTimelinePreferences: () => ({ isNewestFirst: false }) }))
vi.mock('@/data/document', () => ({ useDocument: () => ({ document: { doc: {}, reload: () => {} } }) }))
vi.mock('vue-router', () => ({ useRoute: () => ({ hash: '' }) }))
vi.mock('frappe-ui/frappe', () => ({ useTelemetry: () => ({ capture: () => {} }) }))
vi.mock('frappe-ui', async () => {
  const { reactive } = await import('vue')
  return {
    Button: { inheritAttrs: false, template: '<button />' }, Tooltip: { inheritAttrs: false, template: '<span />' }, toast: { error: () => {} },
    createResource: (options) => {
      const request = (params) => { h.requests.push({ url: options.url, params }); return Promise.resolve() }
      if (options.auto) request(options.params)
      return reactive({ data: null, loading: false, fetch: request, reload: request, submit: request })
    },
  }
})
vi.mock('@/components/Activities/ActivityHeader.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Activities/EmailArea.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Activities/CommentArea.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Activities/CallArea.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Activities/NoteArea.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Activities/TaskArea.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Activities/AttachmentArea.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Activities/DataFields.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/UserAvatar.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Icons/ActivityIcon.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Icons/EmailIcon.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Icons/DetailsIcon.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Icons/CalendarIcon.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Icons/PhoneIcon.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Icons/NoteIcon.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Icons/TaskIcon.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Icons/AttachmentIcon.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Icons/WhatsAppIcon.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Activities/EventArea.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Activities/WhatsAppArea.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Activities/WhatsAppBox.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Activities/MessengerArea.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Activities/MessengerBox.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/doco/inbox/CatalogPicker.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Icons/LoadingIndicator.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/ListViews/EmptyState.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Icons/LeadsIcon.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Icons/DealsIcon.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Icons/DotIcon.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Icons/CommentIcon.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Icons/SelectIcon.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Icons/MissedCallIcon.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Icons/DeclinedCallIcon.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Icons/InboundCallIcon.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Icons/OutboundCallIcon.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/FadedScrollableDiv.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/CommunicationArea.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Modals/WhatsappTemplateSelectorModal.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Activities/WhatsappTemplateReview.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/doco/ConversationReviewStrip.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/doco/inbox/ConversationAutoAckStrip.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Activities/AllModals.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/FilesUploader/FilesUploader.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))
vi.mock('@/components/Activities/TimelineTimestamp.vue', () => ({ default: { inheritAttrs: false, template: '<span />' } }))

let app, container, scope
h.addon = ref(false)
h.whatsapp = ref(false)
beforeEach(() => {
  h.requests = []
  h.handlers = {}
  h.addon.value = false
  h.whatsapp.value = false
  scope = effectScope()
})
afterEach(() => { app?.unmount(); app = null; container?.remove(); scope.stop() })
async function mountActivities(addon, whatsapp, title = 'Activity') {
  h.addon.value = addon
  h.whatsapp.value = whatsapp
  // reset module so each instance gets this test's capability refs.
  vi.resetModules()
  const { default: Activities } = await import('@/components/Activities/Activities.vue')
  container = document.createElement('div')
  document.body.appendChild(container)
  app = createApp(Activities, { doctype: 'CRM Deal', docname: 'fictional-deal', tabs: [{ name: title }] })
  app.config.globalProperties.__ = globalThis.__
  app.config.warnHandler = () => {}
  app.mount(container)
  await nextTick()
}

describe('native Activities with optional messaging', () => {
  it('core and clinic-only views load native activities without optional requests, including realtime', async () => {
    await mountActivities(false, false)
    expect(h.requests.map((r) => r.url)).toEqual(['crm.api.activities.get_activities'])
    for (const event of ['whatsapp_message', 'messenger_message', 'doco_marketing:thread_update']) {
      h.handlers[event]?.({ reference_doctype: 'CRM Deal', reference_name: 'fictional-deal' })
    }
    expect(h.requests.map((r) => r.url)).toEqual(['crm.api.activities.get_activities'])
  })

  it('configured WhatsApp works without starting marketing resources', async () => {
    await mountActivities(false, true, 'WhatsApp')
    expect(h.requests.some((r) => r.url === 'crm.api.whatsapp.get_whatsapp_messages')).toBe(true)
    expect(h.requests.some((r) => r.url.startsWith('doco_marketing.'))).toBe(false)
    h.handlers.whatsapp_message({ reference_doctype: 'CRM Deal', reference_name: 'fictional-deal' })
    expect(h.requests.some((r) => r.url.startsWith('doco_marketing.'))).toBe(false)
  })

  it('installed marketing retains its extra resources and realtime refresh', async () => {
    await mountActivities(true, true, 'WhatsApp')
    expect(h.requests.some((r) => r.url === 'doco_marketing.api.inbox.get_contact_refs')).toBe(true)
    const before = h.requests.filter((r) => r.url.endsWith('get_communications')).length
    h.handlers.messenger_message({ reference_name: 'fictional-deal' })
    expect(h.requests.filter((r) => r.url.endsWith('get_communications'))).toHaveLength(before + 1)
  })
})
