import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import GitHubIcon from '@/components/Icons/GitHubIcon.vue'
import InstagramIcon from '@/components/Icons/InstagramIcon.vue'
import AboutModal from '@/components/Modals/AboutModal.vue'
import CommentWorkspace from '@/components/doco/inbox/CommentWorkspace.vue'

const fixture = vi.hoisted(() => ({ channel: 'FB' }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('frappe-ui', async () => {
  const { reactive } = await import('vue')
  return {
    toast: { success: vi.fn(), error: vi.fn() },
    createResource: ({ url }) => {
      const resource = reactive({
        data: null,
        loading: false,
        submit: vi.fn(async () => {
          resource.data = url.endsWith('get_post_preview')
            ? { channel: fixture.channel, comments: 0 }
            : { comments: [], has_more: false }
          return resource.data
        }),
      })
      return resource
    },
  }
})
vi.mock('@/composables/breakpoint', async () => {
  const { ref } = await import('vue')
  return { isMobile: ref(false) }
})
vi.mock('@/composables/inbox', async () => {
  const { ref } = await import('vue')
  return {
    activeCommentPost: ref('synthetic-post'),
    catalogOpen: ref(false),
    mobileBack: vi.fn(),
    replyComment: vi.fn(),
    convertCommentToLead: vi.fn(),
    hideComment: vi.fn(),
    openMessengerForPsid: vi.fn(),
    openCatalog: vi.fn(),
    timeAgo: vi.fn(),
  }
})
vi.mock('@/components/doco/social/FbPostCard.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/doco/inbox/CannedReplyPicker.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/components/doco/inbox/CatalogPicker.vue', () => ({
  default: { render: () => null },
}))

const cleanups = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

const DialogBody = (_, { slots }) => h('section', slots.body?.())
DialogBody.props = { open: Boolean, size: String }

function mount(component, props = {}) {
  const el = document.createElement('div')
  document.body.append(el)
  const app = createApp({ render: () => h(component, props) })
  app.config.globalProperties.__ = globalThis.__
  // eslint-disable-next-line vue/no-reserved-component-names -- Match Frappe UI's global component name.
  app.component('Dialog', DialogBody)
  app.mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  return el
}

function expectDecorative(svg) {
  expect(svg).not.toBeNull()
  expect(svg.getAttribute('aria-hidden')).toBe('true')
  expect(svg.getAttribute('focusable')).toBe('false')
  expect(svg.querySelector('path')).not.toBeNull()
  expect(svg.hasAttribute('data-lucide-missing')).toBe(false)
}

describe('local brand icons in worker surfaces', () => {
  it.each([
    ['GitHub', GitHubIcon],
    ['Instagram', InstagramIcon],
  ])(
    'renders the %s mark with caller sizing and inherited color',
    (_, icon) => {
      const el = mount(icon, { class: 'size-4', style: { color: '#123456' } })
      const svg = el.querySelector('svg')
      expectDecorative(svg)
      expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
      expect(svg.getAttribute('stroke')).toBe('currentColor')
      expect(svg.classList.contains('size-4')).toBe(true)
      expect(svg.style.color).toBe('#123456')
      expect(el.querySelector('[id]')).toBeNull()
      if (icon === InstagramIcon) {
        expect(svg.querySelector('rect').getAttribute('rx')).toBe('5')
        expect(svg.querySelector('line')).not.toBeNull()
      } else {
        expect(svg.querySelector('path').getAttribute('d')).toMatch(/^M9 19/)
      }
    },
  )

  it('renders the GitHub mark beside the existing named repository link', () => {
    const el = mount(AboutModal, { modelValue: true })
    const link = [...el.querySelectorAll('a')].find((node) =>
      node.textContent.includes('GitHub Repository'),
    )
    expect(link.getAttribute('href')).toBe('https://github.com/HolyMC2/crm')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expectDecorative(link.querySelector('svg'))
    expect(link.querySelector('svg path').getAttribute('d')).toMatch(/^M9 19/)
  })

  it.each([
    ['FB', 'Facebook'],
    ['IG', 'Instagram'],
  ])(
    'renders the %s comment header mark with its visible label',
    async (channel, label) => {
      fixture.channel = channel
      const el = mount(CommentWorkspace)
      await nextTick()
      expect(el.textContent).toContain(`Publicación de ${label}`)
      expect(el.textContent).toContain('Sin comentarios')
      const svg = el.querySelector('svg')
      expectDecorative(svg)
      if (channel === 'IG') {
        expect(svg.querySelector('rect').getAttribute('rx')).toBe('5')
      } else {
        // The existing local Facebook asset, not an unavailable Lucide brand.
        expect(svg.querySelector('path[style*="#0866ff"]')).not.toBeNull()
        expect(svg.querySelector('path[style*="#ffffff"]')).not.toBeNull()
      }
    },
  )
})
