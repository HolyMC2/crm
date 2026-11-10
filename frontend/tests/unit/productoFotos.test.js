// A product's photos as the worker handles them, with a mocked transport: the
// principal first and only the tools the worker has; a picked file is a tile
// before it has left the device and one request files it; the star and the
// bin answer on the tap and go back, saying why, when the server refuses.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const sent = vi.hoisted(() => ({ post: null, toast: null }))
vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  toast: Object.assign(vi.fn(), {
    success: (...args) => sent.toast('success', ...args),
    error: (...args) => sent.toast('error', ...args),
  }),
}))
vi.mock('@/utils/catalogUpload', () => ({
  postPicture: (...args) => sent.post(...args),
}))
// Cutting a picture to size needs a canvas; here it travels as picked.
vi.mock('@/components/ui/imageFiles', async (original) => ({
  ...(await original()),
  prepareImage: async (file) => file,
}))

import PhotoGallery from '@/components/productos/PhotoGallery.vue'
import { useProductPhotos } from '@/composables/useProductPhotos'

const PHOTOS = 'doco.workspaces.product_media.photos'
const ADD = 'doco.workspaces.product_media.add_photo'
const DELETE = 'doco.workspaces.product_media.delete_photo'
const SET = 'doco.workspaces.products.set_photo'

let app, root, calls, answers, changes, uploads
const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
const gallery = (over = {}) => ({
  item: 'IPN1',
  rows: [
    {
      file_url: '/files/a.jpg',
      media: {
        original: { url: '/files/a.jpg' },
        variants: {
          card: { url: '/files/a-s.webp' },
          detail: { url: '/files/a-m.webp' },
        },
        version: 'v1',
      },
      kind: 'image',
      principal: true,
    },
    { file_url: '/files/b.jpg', kind: 'image', principal: false },
  ],
  can_manage: true,
  can_edit: true,
  can_share: false,
  limits: { photo_bytes: 15 << 20, video_bytes: 64 << 20, count: 60 },
  reason: null,
  ...over,
})
async function mount() {
  root = document.createElement('div')
  document.body.appendChild(root)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:any(.*)*', component: { render: () => null } }],
  })
  router.push('/')
  await router.isReady()
  app = createApp({
    setup() {
      const photos = useProductPhotos(() => 'IPN1', {
        onChange: (change) => changes.push(change),
        say: (text) => sent.toast('success', text),
      })
      return () => h(PhotoGallery, { photos, item: 'IPN1', title: 'Funda' })
    },
  })
  app.use(router)
  app.config.globalProperties.__ = window.__
  app.mount(root)
  await flush()
}
const one = (selector) => document.querySelector(selector)
const all = (selector) => [...document.querySelectorAll(selector)]
const tiles = () => all('[data-foto]')
const shown = () =>
  tiles().map((tile) => tile.querySelector('img')?.getAttribute('src'))
const principal = () =>
  one('[data-testid="foto-principal"]')?.closest('[data-foto]').dataset.foto
function pick(...files) {
  const input = one('[data-testid="fotos-input"]')
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  input.dispatchEvent(new Event('change'))
}
const refused = (sentence, status = 417) => {
  const error = new Error('refused')
  error.status = status
  error.messages = [sentence]
  return error
}

beforeEach(() => {
  calls = []
  changes = []
  uploads = []
  answers = { [PHOTOS]: () => gallery() }
  window.__ = globalThis.__
  sent.toast = vi.fn()
  sent.post = vi.fn(async (method, args, file, options) => {
    uploads.push({ method, args, file })
    options?.onProgress?.(40)
    const answer = answers[method]
    if (!answer) throw refused('No se pudo.')
    return answer(args, file)
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      const method = String(url).split('/api/method/').pop()
      const args = JSON.parse(init?.body || '{}')
      calls.push([method, args])
      const answer = answers[method]
      if (!answer) return { ok: false, status: 404, json: async () => ({}) }
      let message
      try {
        message = await answer(args)
      } catch (sentence) {
        return {
          ok: false,
          status: 417,
          json: async () => ({
            exc_type: 'ValidationError',
            _server_messages: JSON.stringify([
              JSON.stringify({ message: sentence }),
            ]),
          }),
        }
      }
      return { ok: true, status: 200, json: async () => ({ message }) }
    }),
  )
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('Producto › fotos', () => {
  it('shows the principal first, from the small copy, with the tools of whoever keeps the catalogue', async () => {
    await mount()
    expect(shown()).toEqual(['/files/a-s.webp', '/files/b.jpg'])
    expect(principal()).toBe('/files/a.jpg')
    // The principal has no star; the other has one. Both can be deleted.
    expect(all('[data-testid="foto-hacer-principal"]')).toHaveLength(1)
    expect(all('[data-testid="foto-borrar"]')).toHaveLength(2)
    expect(one('[data-testid="fotos-agregar"]').textContent).toContain(
      'Add photos or videos',
    )
  })

  it('shows a reader the pictures and why they cannot change them, and no tools', async () => {
    answers[PHOTOS] = () =>
      gallery({
        can_manage: false,
        can_edit: false,
        reason: 'Ask whoever keeps the catalogue.',
      })
    await mount()
    expect(shown()).toHaveLength(2)
    expect(root.textContent).toContain('Ask whoever keeps the catalogue.')
    expect(one('[data-testid="foto-hacer-principal"]')).toBeNull()
    expect(one('[data-testid="foto-borrar"]')).toBeNull()
    expect(one('[data-testid="fotos-agregar"]')).toBeNull()
  })

  it('moves the principal on the tap, and tells the page', async () => {
    let answer
    answers[SET] = () => new Promise((resolve) => (answer = resolve))
    await mount()
    one('[data-testid="foto-hacer-principal"]').click()
    await vi.waitFor(() => expect(answer).toBeTypeOf('function'))
    // The server has been asked and has not said anything yet.
    expect(principal()).toBe('/files/b.jpg')
    expect(shown()[0]).toBe('/files/b.jpg')
    answer({
      item: 'IPN1',
      image: '/files/b.jpg',
      modified: '2026-11-10 14:00:00',
    })
    await flush()
    expect(calls.find(([method]) => method === SET)[1].file_url).toBe(
      '/files/b.jpg',
    )
    expect(changes).toEqual([
      { image: '/files/b.jpg', modified: '2026-11-10 14:00:00' },
    ])
  })

  it('puts the principal back and says why when the server refuses', async () => {
    answers[SET] = () => {
      throw 'La foto de este artículo la cambia quien mantiene el catálogo.'
    }
    await mount()
    one('[data-testid="foto-hacer-principal"]').click()
    await flush()
    expect(principal()).toBe('/files/a.jpg')
    expect(shown()[0]).toBe('/files/a-s.webp')
    expect(one('[role="alert"]').textContent).toContain(
      'la cambia quien mantiene el catálogo',
    )
    expect(changes).toEqual([])
  })

  it('deletes in two taps in place, at once, and promotes what the server says', async () => {
    answers[DELETE] = () => ({
      item: 'IPN1',
      image: '/files/b.jpg',
      modified: 'm2',
    })
    await mount()
    all('[data-testid="foto-borrar"]')[0].click()
    await nextTick()
    // Nothing is deleted on the first tap.
    expect(calls.some(([method]) => method === DELETE)).toBe(false)
    one('[data-testid="foto-borrar-si"]').click()
    await nextTick()
    expect(shown()).toEqual(['/files/b.jpg'])
    await flush()
    expect(calls.find(([method]) => method === DELETE)[1].file_url).toBe(
      '/files/a.jpg',
    )
    expect(principal()).toBe('/files/b.jpg')
    expect(changes).toEqual([{ image: '/files/b.jpg', modified: 'm2' }])
  })

  it('puts a deleted picture back where it was when the server refuses', async () => {
    answers[DELETE] = () => {
      throw 'Esa foto ya no está en este artículo. Vuelve a cargar la página.'
    }
    await mount()
    all('[data-testid="foto-borrar"]')[1].click()
    await nextTick()
    one('[data-testid="foto-borrar-si"]').click()
    await flush()
    expect(shown()).toEqual(['/files/a-s.webp', '/files/b.jpg'])
    expect(one('[role="alert"]').textContent).toContain('Vuelve a cargar')
  })

  it('shows picked pictures at once and files each with one request', async () => {
    let n = 0
    answers[ADD] = (args, file) => ({
      item: 'IPN1',
      image: '/files/a.jpg',
      modified: `m${++n}`,
      row: {
        file_url: `/files/${file.name}`,
        file_name: file.name,
        kind: 'image',
        principal: false,
      },
    })
    await mount()
    pick(
      new File(['1'], 'uno.jpg', { type: 'image/jpeg' }),
      new File(['2'], 'dos.jpg', { type: 'image/jpeg' }),
    )
    await nextTick()
    // Four tiles before any answer: the principal stays first.
    expect(tiles()).toHaveLength(4)
    expect(tiles().map((tile) => tile.dataset.estado)).toEqual([
      'saved',
      'sending',
      'sending',
      'saved',
    ])
    expect(root.textContent).toContain('Uploading')
    await flush()
    expect(uploads.map((upload) => upload.method)).toEqual([ADD, ADD])
    expect(uploads.map((upload) => upload.args.item)).toEqual(['IPN1', 'IPN1'])
    // A picture that joins the gallery does not ask to be the principal.
    expect(uploads.every((upload) => !('principal' in upload.args))).toBe(true)
    expect(tiles().map((tile) => tile.dataset.foto)).toEqual([
      '/files/a.jpg',
      '/files/uno.jpg',
      '/files/dos.jpg',
      '/files/b.jpg',
    ])
    expect(tiles().every((tile) => tile.dataset.estado === 'saved')).toBe(true)
    // Only one read of the gallery: adding never reloads it.
    expect(calls.filter(([method]) => method === PHOTOS)).toHaveLength(1)
  })

  it('makes the first picture of a product its principal, as the server answers', async () => {
    answers[PHOTOS] = () => gallery({ rows: [] })
    answers[ADD] = (args, file) => ({
      item: 'IPN1',
      image: `/files/${file.name}`,
      modified: 'm1',
      row: { file_url: `/files/${file.name}`, kind: 'image', principal: true },
    })
    await mount()
    expect(tiles()).toHaveLength(0)
    pick(new File(['1'], 'frente.jpg', { type: 'image/jpeg' }))
    await flush()
    expect(principal()).toBe('/files/frente.jpg')
    expect(changes).toEqual([{ image: '/files/frente.jpg', modified: 'm1' }])
  })

  it('keeps a picture that did not go up, with the reason and a way to try again', async () => {
    answers[ADD] = () => {
      throw refused('La foto pesa más de 15 MB. Elige una más ligera.')
    }
    await mount()
    pick(new File(['1'], 'pesada.jpg', { type: 'image/jpeg' }))
    await flush()
    const failed = tiles().find((tile) => tile.dataset.estado === 'failed')
    expect(failed.textContent).toContain('La foto pesa más de 15 MB')
    expect(failed.textContent).toContain('Retry')
    // The same file goes again, with the same request id (no second copy).
    answers[ADD] = (args, file) => ({
      item: 'IPN1',
      image: '/files/a.jpg',
      modified: 'm1',
      row: { file_url: `/files/${file.name}`, kind: 'image', principal: false },
    })
    ;[...failed.querySelectorAll('button')]
      .find((button) => button.textContent.includes('Retry'))
      .click()
    await flush()
    expect(uploads).toHaveLength(2)
    expect(uploads[1].args.request_id).toBe(uploads[0].args.request_id)
    expect(tiles().every((tile) => tile.dataset.estado === 'saved')).toBe(true)
  })

  it('refuses a video over the limit, and a file that is neither, before sending anything', async () => {
    answers[PHOTOS] = () =>
      gallery({ limits: { photo_bytes: 100, video_bytes: 2 << 20, count: 60 } })
    await mount()
    const heavy = new File([new Uint8Array(3 << 20)], 'largo.mp4', {
      type: 'video/mp4',
    })
    pick(heavy)
    await flush()
    expect(one('[role="alert"]').textContent).toContain('over 2 MB')
    pick(new File(['x'], 'lista.pdf', { type: 'application/pdf' }))
    await flush()
    expect(one('[role="alert"]').textContent).toContain(
      'Only photos and videos go here.',
    )
    expect(uploads).toEqual([])
    expect(tiles()).toHaveLength(2)
  })

  it('says a picture was already there instead of showing it twice', async () => {
    answers[ADD] = () => ({
      item: 'IPN1',
      image: '/files/a.jpg',
      modified: 'm1',
      duplicate: true,
      row: { file_url: '/files/b.jpg', kind: 'image', principal: false },
    })
    await mount()
    pick(new File(['1'], 'otra-vez.jpg', { type: 'image/jpeg' }))
    await flush()
    expect(tiles().map((tile) => tile.dataset.foto)).toEqual([
      '/files/a.jpg',
      '/files/b.jpg',
    ])
    expect(sent.toast).toHaveBeenCalledWith(
      'success',
      'That photo was already on this product.',
    )
  })

  it('paints a list row from the small copy, and from the original while there is none', async () => {
    const { photoOf } = await import('@/composables/useProductos')
    const row = {
      name: 'IPN1',
      image: '/files/a.jpg',
      media: { variants: { card: { url: '/files/a-s.webp' } } },
    }
    expect(photoOf(row)).toBe('/files/a-s.webp')
    // A hero asks for the larger copy and takes the nearest one there is.
    expect(photoOf(row, 'detail')).toBe('/files/a-s.webp')
    expect(photoOf({ image: '/files/b.jpg', media: { variants: {} } })).toBe(
      '/files/b.jpg',
    )
    expect(photoOf({ image: '/files/c.jpg' })).toBe('/files/c.jpg')
    expect(photoOf({})).toBe('')
  })

  it('opens a tile full screen with the same tools at the thumb', async () => {
    answers[SET] = () => ({
      item: 'IPN1',
      image: '/files/b.jpg',
      modified: 'm1',
    })
    await mount()
    tiles()[1].querySelector('button').click()
    // The viewer is its own chunk: it arrives on the first picture opened.
    await vi.waitFor(() => expect(one('[data-ui-viewer]')).not.toBeNull())
    await flush()
    const viewer = one('[data-ui-viewer]')
    expect(one('[data-ui-viewer-count]').textContent).toBe('2 of 2')
    expect(viewer.textContent).toContain('Funda')
    for (const name of ['principal', 'editar', 'girar', 'borrar'])
      expect(one(`[data-testid="visor-${name}"]`)).not.toBeNull()
    one('[data-testid="visor-principal"]').click()
    await flush()
    // It is the principal now, and it is the first of the set.
    expect(one('[data-ui-viewer-count]').textContent).toBe('1 of 2')
    expect(one('[data-testid="visor-principal"]').disabled).toBe(true)
    expect(one('[data-testid="visor-principal"]').textContent).toContain('Main')
  })
})
