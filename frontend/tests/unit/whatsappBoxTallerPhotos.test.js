/* eslint-disable vue/one-component-per-file -- Test-local UI boundary doubles. */
// The composer's «Fotos del taller»: offered on a deal or lead conversation of a
// tenant with Taller (chip and «+» menu), never on an unassigned thread; the
// Reparación tab's «Enviar al chat» opens it on that same deal's conversation.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive } from 'vue'

const api = vi.hoisted(() => ({ inbox: null, capture: vi.fn() }))
vi.mock('frappe-ui', async () => {
  const { defineComponent, h } = await import('vue')
  const passthrough = (tag) =>
    defineComponent({
      inheritAttrs: false,
      setup:
        (_, { slots }) =>
        () =>
          h(tag, slots.default?.()),
    })
  return {
    createResource: () => ({
      data: [],
      loading: false,
      fetch: vi.fn(),
      reload: vi.fn(),
      submit: vi.fn(),
    }),
    call: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn() },
    Textarea: passthrough('div'),
    TextInput: passthrough('div'),
    Dialog: { render: () => null },
    Button: passthrough('span'),
    FileUploader: defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          h('div', slots.default?.({ openFileSelector: () => {} })),
    }),
    // the «+» menu: its options as buttons, so a test can read and tap them
    Dropdown: defineComponent({
      props: { options: { type: Array, default: () => [] } },
      setup: (props) => () =>
        h(
          'div',
          { 'data-testid': 'attach-menu' },
          props.options.map((o) =>
            h('button', { type: 'button', onClick: o.onClick }, o.label),
          ),
        ),
    }),
  }
})
vi.mock('frappe-ui/experimental', () => ({
  TextEditor: { render: () => null },
}))
vi.mock('@framework/ui', () => ({
  useTelemetry: () => ({ capture: api.capture }),
}))
vi.mock('@/stores/users', () => ({
  usersStore: () => ({ users: { data: null } }),
}))
vi.mock('@/composables/breakpoint', async () => {
  const { ref } = await import('vue')
  return { isMobile: ref(false) }
})
vi.mock('@/composables/inbox', async () => {
  const { ref } = await import('vue')
  api.inbox = {
    notifyTyping: () => {},
    aiEnabled: ref(false),
    composerDraft: ref(null),
    hasTaller: ref(true),
    tallerPhotosRequest: ref(null),
  }
  return api.inbox
})
vi.mock('@/utils/crmCapabilities', async () => {
  const { ref } = await import('vue')
  return { addonAvailable: ref(false) }
})
vi.mock('@/composables/outbox', () => ({ enqueueOutbox: vi.fn() }))
vi.mock('@/composables/composerCommands', async () => {
  const { reactive, ref } = await import('vue')
  return {
    renderTemplate: (t) => t,
    useComposerCommands: () => ({
      catalog: ref(null),
      catalogLoading: ref(false),
      loadCatalog: vi.fn(),
      docDialog: reactive({ open: false, doctype: '' }),
      saveDialog: reactive({ open: false, body: '' }),
      enabled: ref(false),
      items: ref([]),
    }),
  }
})
vi.mock('@/composables/slashCommands', async () => {
  const { ref } = await import('vue')
  return {
    stripSlash: (t) => t,
    fillHole: (t) => t,
    useSlashMenu: () => ({
      open: ref(false),
      ranked: ref([]),
      activeIndex: ref(0),
      scope: ref(''),
      update: () => {},
      close: () => {},
      onKeydown: () => {},
      pick: () => {},
    }),
  }
})
vi.mock('@/components/IconPicker.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/Composer/SlashCommandMenu.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/Composer/SendDocumentDialog.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/Composer/SaveTemplateDialog.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/Composer/TemplateHoles.vue', () => ({
  default: { render: () => null },
}))
// The sheet itself is tested on its own; here only what the composer hands it.
vi.mock('@/components/doco/TallerPhotoSheet.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    __esModule: true, // defineAsyncComponent unwraps .default only for a module
    default: defineComponent({
      props: {
        open: Boolean,
        doctype: String,
        name: String,
        to: String,
        account: String,
        preselect: Object,
      },
      setup: (props) => () =>
        props.open
          ? h('div', {
              'data-testid': 'taller-sheet',
              'data-doctype': props.doctype,
              'data-name': props.name,
              'data-to': props.to,
              'data-account': props.account,
              'data-order': props.preselect?.order || '',
            })
          : null,
    }),
  }
})
import WhatsAppBox from '@/components/Activities/WhatsAppBox.vue'

let app, root
// the sheet is an async component: its first import resolves on a later task
const settle = async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
const chip = () => root.querySelector('[data-testid="taller-photos-chip"]')
const menuItem = () =>
  [...root.querySelectorAll('[data-testid="attach-menu"] button')].find(
    (b) => b.textContent.trim() === 'Fotos del taller',
  )
const sheet = () => root.querySelector('[data-testid="taller-sheet"]')

async function mount(
  props = {},
  doc = { name: 'DEAL-1', mobile_no: '5215551112222' },
) {
  const state = reactive({ doc })
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(
    defineComponent({
      setup: () => () =>
        h(WhatsAppBox, {
          doctype: 'CRM Deal',
          modelValue: state.doc,
          whatsapp: { reload: vi.fn() },
          reply: {},
          ...props,
        }),
    }),
  )
  app.config.globalProperties.__ = globalThis.__
  app.mount(root)
  await settle()
  return state
}

beforeEach(() => {
  api.inbox.hasTaller.value = true
  api.inbox.tallerPhotosRequest.value = null
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
})

describe('WhatsApp composer «Fotos del taller»', () => {
  it('is offered on a deal and a lead conversation, from the chip and the «+» menu', async () => {
    await mount({ whatsappAccount: 'Taller Centro' })
    expect(chip()).toBeTruthy()
    expect(menuItem()).toBeTruthy()
    chip().click()
    await settle()
    expect(sheet().dataset).toMatchObject({
      doctype: 'CRM Deal',
      name: 'DEAL-1',
      to: '5215551112222',
      account: 'Taller Centro',
    })
    app.unmount()
    root.remove()
    await mount(
      { doctype: 'CRM Lead' },
      { name: 'LEAD-1', mobile_no: '521555' },
    )
    expect(chip()).toBeTruthy()
    menuItem().click()
    await settle()
    expect(sheet().dataset.name).toBe('LEAD-1')
  })

  it('is not offered without Taller or on an unassigned thread', async () => {
    api.inbox.hasTaller.value = false
    await mount()
    expect(chip()).toBeNull()
    expect(menuItem()).toBeUndefined()
    app.unmount()
    root.remove()
    api.inbox.hasTaller.value = true
    await mount({ doctype: '', replyOnly: true, toOverride: '521555' })
    expect(chip()).toBeNull()
    expect(menuItem()).toBeUndefined()
  })

  it('opens on the Reparación tab’s request only for that same deal', async () => {
    api.inbox.tallerPhotosRequest.value = {
      deal: 'DEAL-2',
      order: 'RO-9',
      photo: '',
    }
    await mount()
    expect(sheet()).toBeNull()
    expect(api.inbox.tallerPhotosRequest.value).not.toBeNull()
    api.inbox.tallerPhotosRequest.value = {
      deal: 'DEAL-1',
      order: 'RO-7',
      photo: '',
    }
    await settle()
    expect(sheet().dataset.order).toBe('RO-7')
    expect(api.inbox.tallerPhotosRequest.value).toBeNull()
  })
})
