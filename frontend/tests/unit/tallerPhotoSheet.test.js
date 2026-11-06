// «Fotos del taller» mounted with its real logic: it lists the photos of the
// conversation's repair orders (the order the seller came from first), sends
// the picked ones in the order picked with the text on the first, keeps the
// unsent ones picked after a refusal, and never offers an archived photo.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'

const api = vi.hoisted(() => ({ call: vi.fn(), toast: vi.fn() }))
vi.mock('frappe-ui', () => ({
  call: (...args) => api.call(...args),
  toast: { success: (...args) => api.toast(...args) },
}))
// The sheet's frame is the ui package's (tested there); here only its slots matter.
vi.mock('@/components/ui/BottomSheet.vue', async () => {
  const { h } = await import('vue')
  return {
    default: {
      props: ['open', 'title', 'subtitle', 'dismissible'],
      setup:
        (props, { slots }) =>
        () =>
          props.open
            ? h('div', { 'data-testid': 'sheet' }, [
                h('h2', props.title),
                slots.default?.(),
                h('footer', slots.actions?.()),
              ])
            : null,
    },
  }
})
import TallerPhotoSheet from '@/components/doco/TallerPhotoSheet.vue'

const PHOTOS =
  'taller.repair.repair_orders.conversation_photos.get_conversation_photos'
const SEND = 'crm.api.whatsapp.create_whatsapp_message'
const photo = (name, extra = {}) => ({
  name,
  photo_type: 'Antes',
  thumbnail_url: `/files/${name}-t.webp`,
  display_url: `/private/files/${name}.jpg`,
  attach: `/private/files/${name}.jpg`,
  blocked_reason: null,
  ...extra,
})
const orders = () => [
  {
    name: 'RO-1',
    device_model: 'Moto G',
    status: 'En Reparación',
    photos: [photo('P1')],
  },
  {
    name: 'RO-2',
    device_model: 'iPhone 12',
    status: 'Listo para Entregar',
    photos: [
      photo('P2'),
      photo('P3'),
      photo('P4', {
        attach: null,
        blocked_reason: 'Esta foto está archivada.',
      }),
    ],
  },
]

let app, root, events
const settle = async () => {
  for (let i = 0; i < 16; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
const tile = (name) => root.querySelector(`[data-photo="${name}"]`)
const sendButton = () =>
  root.querySelector('[data-testid="taller-photos-send"]')
const sends = () => api.call.mock.calls.filter(([url]) => url === SEND)

async function mount(extra = {}) {
  events = { open: [], sent: [] }
  const props = reactive({
    open: true,
    doctype: 'CRM Deal',
    name: 'DEAL-1',
    to: '5215550000000',
    account: 'Taller Centro',
    preselect: null,
    ...extra,
  })
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({
    setup: () => () =>
      h(TallerPhotoSheet, {
        ...props,
        'onUpdate:open': (value) => {
          events.open.push(value)
          props.open = value
        },
        onSent: (count) => events.sent.push(count),
      }),
  })
  app.config.globalProperties.__ = globalThis.__
  app.mount(root)
  await settle()
  return props
}

beforeEach(() => {
  api.call.mockReset()
  api.toast.mockReset()
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
})

describe('Fotos del taller sheet', () => {
  it('lists the conversation’s orders, the requested order first, with its photo picked', async () => {
    api.call.mockResolvedValue({ orders: orders() })
    await mount({ preselect: { order: 'RO-2', photo: 'P3' } })
    expect(api.call).toHaveBeenCalledWith(PHOTOS, {
      reference_doctype: 'CRM Deal',
      reference_name: 'DEAL-1',
    })
    const titles = [...root.querySelectorAll('h3')].map((n) =>
      n.textContent.trim(),
    )
    expect(titles).toEqual(['iPhone 12', 'Moto G'])
    expect(tile('P3').getAttribute('aria-pressed')).toBe('true')
    expect(sendButton().textContent).toContain('Enviar 1 foto')
  })

  it('sends the picked photos in the order picked, the text with the first only', async () => {
    api.call.mockImplementation(async (url) =>
      url === PHOTOS ? { orders: orders() } : 'WA-MSG',
    )
    await mount()
    expect(sendButton().disabled).toBe(true)
    expect(root.textContent).toContain('Elige al menos una foto')
    tile('P2').click()
    tile('P1').click()
    await settle()
    expect(sendButton().textContent).toContain('Enviar 2 fotos')
    const text = root.querySelector('textarea')
    text.value = 'Así quedó tu equipo'
    text.dispatchEvent(new Event('input'))
    sendButton().click()
    await settle()
    expect(sends().map(([, args]) => [args.attach, args.message])).toEqual([
      ['/private/files/P2.jpg', 'Así quedó tu equipo'],
      ['/private/files/P1.jpg', ''],
    ])
    expect(sends()[0][1]).toMatchObject({
      reference_doctype: 'CRM Deal',
      reference_name: 'DEAL-1',
      to: '5215550000000',
      content_type: 'image',
      whatsapp_account: 'Taller Centro',
    })
    expect(events.sent).toEqual([2])
    expect(api.toast).toHaveBeenCalledWith('Se enviaron 2 fotos')
    expect(events.open).toEqual([false])
  })

  it('keeps the unsent photos picked after a refusal and retries only those', async () => {
    let count = 0
    api.call.mockImplementation(async (url) => {
      if (url === PHOTOS) return { orders: orders() }
      count += 1
      if (count === 2)
        throw { messages: ['Esta foto pertenece a otra orden de reparación.'] }
      return 'WA-MSG'
    })
    await mount()
    tile('P1').click()
    tile('P2').click()
    tile('P3').click()
    await settle()
    sendButton().click()
    await settle()
    expect(sends()).toHaveLength(2)
    expect(root.textContent).toContain(
      'Se enviaron 1 de 3. Esta foto pertenece a otra orden de reparación.',
    )
    expect(tile('P1').getAttribute('aria-pressed')).toBe('false')
    expect(tile('P2').getAttribute('aria-pressed')).toBe('true')
    expect(sendButton().textContent).toContain('Reintentar')
    expect(events.sent).toEqual([1])
    expect(events.open).toEqual([])
    sendButton().click()
    await settle()
    expect(
      sends()
        .slice(2)
        .map(([, args]) => args.attach),
    ).toEqual(['/private/files/P2.jpg', '/private/files/P3.jpg'])
    expect(events.open).toEqual([false])
  })

  it('says why an archived photo cannot be picked', async () => {
    api.call.mockResolvedValue({ orders: orders() })
    await mount()
    tile('P4').click()
    await settle()
    expect(tile('P4').getAttribute('aria-pressed')).toBe('false')
    expect(root.textContent).toContain('Esta foto está archivada.')
    expect(sendButton().disabled).toBe(true)
  })

  it('explains an empty conversation instead of showing a blank sheet', async () => {
    api.call.mockResolvedValue({
      orders: [{ name: 'RO-1', device_model: 'Moto G', photos: [] }],
    })
    await mount()
    expect(root.textContent).toContain('Aún no hay fotos del taller')
    expect(sendButton()).toBeNull()
    api.call.mockResolvedValue({ orders: [] })
    app.unmount()
    root.remove()
    await mount()
    expect(root.textContent).toContain(
      'no tiene órdenes de reparación vinculadas',
    )
  })
})
