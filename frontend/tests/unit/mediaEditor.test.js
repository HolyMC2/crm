import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'

const upload = vi.hoisted(() => vi.fn())
vi.mock('frappe-ui', () => ({
  toast: { error: vi.fn() },
  FileUploadHandler: class {
    upload(file, options) {
      return upload(file, options)
    }
  },
}))
import MediaEditor from '@/components/doco/social/composer/MediaEditor.vue'

let app, root
function mountMedia(initial) {
  const media = ref(initial)
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({
    render: () =>
      h(MediaEditor, {
        media: media.value,
        canCancel: true,
        'onUpdate:media': (value) => {
          media.value = value
        },
      }),
  })
  app.config.globalProperties.__ = (value) => value
  app.mount(root)
  return media
}
const initialMedia = () =>
  Object.freeze([
    Object.freeze({
      media_file: '/first.jpg',
      media_type: 'Image',
      alt_text: 'First',
    }),
    Object.freeze({
      media_file: '/second.jpg',
      media_type: 'Image',
      alt_text: 'Second',
    }),
  ])
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.clearAllMocks()
})
describe('media editor parent updates', () => {
  it('updates alternative text and removes a photo without mutating the parent input', async () => {
    const original = initialMedia()
    const media = mountMedia(original)
    const input = root.querySelector('[data-testid="alt-text-input-0"]')
    input.value = 'Updated description'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(media.value[0].alt_text).toBe('Updated description')
    expect(original[0].alt_text).toBe('First')
    const second = root.querySelector('[data-testid="alt-text-input-1"]')
    second.value = 'Another description'
    second.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(media.value.map((row) => row.alt_text)).toEqual([
      'Updated description',
      'Another description',
    ])
    root.querySelector('[title="Quitar foto"]').click()
    await nextTick()
    expect(media.value.map((row) => row.media_file)).toEqual(['/second.jpg'])
    expect(original).toHaveLength(2)
  })
  it('reorders the parent media list without mutating the original array', async () => {
    const original = initialMedia()
    const media = mountMedia(original)
    const tiles = root.querySelectorAll('[draggable="true"]')
    tiles[0].dispatchEvent(new Event('dragstart', { bubbles: true }))
    tiles[1].dispatchEvent(
      new Event('drop', { bubbles: true, cancelable: true }),
    )
    await nextTick()
    expect(media.value.map((row) => row.media_file)).toEqual([
      '/second.jpg',
      '/first.jpg',
    ])
    expect(original.map((row) => row.media_file)).toEqual([
      '/first.jpg',
      '/second.jpg',
    ])
  })
  it('keeps each completed upload in the parent list', async () => {
    const media = mountMedia(Object.freeze([]))
    upload.mockImplementation(async (file) => ({ file_url: '/' + file.name }))
    const input = root.querySelector('input[type="file"]')
    const files = [
      new File(['one'], 'one.jpg', { type: 'image/jpeg' }),
      new File(['two'], 'two.png', { type: 'image/png' }),
    ]
    Object.defineProperty(input, 'files', { value: files })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    for (let i = 0; i < 6; i++) {
      await Promise.resolve()
      await nextTick()
    }
    expect(media.value.map((row) => row.media_file)).toEqual([
      '/one.jpg',
      '/two.png',
    ])
    expect(upload).toHaveBeenCalledWith(files[0], { private: false })
  })
})
