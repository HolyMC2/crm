// @muelle/ui's photo pieces as the apps vendor them: the full-screen viewer
// (count, walking the set, leaving it), the quick editor (what its tools do
// and when «Guardar foto» is offered) and the arithmetic under both.
// Assertions are on what the worker sees and on events, not on classes.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const baked = vi.hoisted(() => ({ calls: [] }))
vi.mock('@/components/ui/imageEdit', async (original) => ({
  ...(await original()),
  // Drawing needs a canvas; what is asked of it is what matters here.
  bakeEdit: vi.fn(async (source, width, height, edit, options) => {
    baked.calls.push({ width, height, edit, options })
    return new Blob(['edited'], { type: options.type })
  }),
}))

import MediaViewer from '@/components/ui/MediaViewer.vue'
import PhotoEditor from '@/components/ui/PhotoEditor.vue'
import { mediaKind } from '@/components/ui/imageFiles'
import { fitWithin, prepareImage } from '@/components/ui/imageFiles'
import * as edits from '@/components/ui/imageEdit'

const { applyLight, dragCrop, flipEdit, isEdited, newEdit, outputSize } = edits
const { ratioCrop, shapeEdit, turnEdit } = edits

let app, root
const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}
async function mount(component, props = {}, slots = {}) {
  root = document.createElement('div')
  document.body.appendChild(root)
  const bound = reactive({ ...props })
  const events = []
  const listeners = {}
  for (const key of ['open', 'index', 'editing'])
    listeners[`onUpdate:${key}`] = (value) => {
      bound[key] = value
      events.push([`update:${key}`, value])
    }
  for (const name of ['cancel', 'save'])
    listeners[`on${name[0].toUpperCase()}${name.slice(1)}`] = (value) =>
      events.push([name, value])
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:any(.*)*', component: { render: () => null } }],
  })
  router.push('/')
  await router.isReady()
  app = createApp({
    render: () => h(component, { ...bound, ...listeners }, slots),
  })
  app.use(router)
  app.mount(root)
  await flush()
  return { bound, events }
}
const one = (selector) => document.querySelector(selector)
const all = (selector) => [...document.querySelectorAll(selector)]
const key = (name) =>
  one('[data-ui-viewer]').dispatchEvent(
    new KeyboardEvent('keydown', { key: name, bubbles: true }),
  )

afterEach(() => {
  app?.unmount()
  root?.remove()
  document.body.innerHTML = ''
  baked.calls.length = 0
})

const PHOTOS = [
  { key: 'a', url: '/files/a.jpg', thumb: '/files/a-s.webp', kind: 'image' },
  { key: 'b', url: '/files/b.jpg', kind: 'image' },
  { key: 'c', url: '/files/c.mp4', kind: 'video' },
]

describe('MediaViewer', () => {
  it('says where the worker is in the set and walks it with the arrows and the keys', async () => {
    const { bound } = await mount(MediaViewer, {
      open: true,
      items: PHOTOS,
      index: 0,
      title: 'Funda iPhone 13',
    })
    expect(one('[data-ui-viewer-count]').textContent).toBe('1 of 3')
    expect(one('[data-ui-viewer]').textContent).toContain('Funda iPhone 13')
    // At the first picture there is nothing before it.
    expect(one('[data-ui-viewer-prev]')).toBeNull()

    one('[data-ui-viewer-next]').click()
    await flush()
    expect(bound.index).toBe(1)
    expect(one('[data-ui-viewer-count]').textContent).toBe('2 of 3')

    key('ArrowRight')
    await flush()
    expect(bound.index).toBe(2)
    expect(one('[data-ui-viewer-next]')).toBeNull()
    key('ArrowRight')
    await flush()
    expect(bound.index).toBe(2)
    key('Home')
    await flush()
    expect(bound.index).toBe(0)
  })

  it('jumps from the strip, plays a video in place and names every control', async () => {
    const { bound } = await mount(MediaViewer, {
      open: true,
      items: PHOTOS,
      index: 0,
    })
    const thumbs = all('[data-ui-viewer-thumb]')
    expect(thumbs.map((thumb) => thumb.getAttribute('aria-label'))).toEqual([
      'Photo 1',
      'Photo 2',
      'Video 3',
    ])
    // The strip shows the small copy, never the full file.
    expect(thumbs[0].querySelector('img').getAttribute('src')).toBe(
      '/files/a-s.webp',
    )
    thumbs[2].click()
    await flush()
    expect(bound.index).toBe(2)
    const video = one('video')
    expect(video.getAttribute('src')).toBe('/files/c.mp4')
    expect(video.hasAttribute('controls')).toBe(true)
    // A video has nothing to zoom.
    expect(one('[data-ui-viewer-zoom]')).toBeNull()
    for (const button of all('[data-ui-viewer] button'))
      expect(button.getAttribute('aria-label')).toBeTruthy()
  })

  it("says what the picture is above the strip, in the page's words", async () => {
    await mount(
      MediaViewer,
      { open: true, items: PHOTOS, index: 1 },
      { caption: ({ index }) => h('span', `Foto ${index + 1}: Antes`) },
    )
    expect(one('[data-ui-viewer-caption]').textContent).toBe('Foto 2: Antes')
  })

  it('paints the small copy until the full picture has loaded', async () => {
    await mount(MediaViewer, { open: true, items: PHOTOS, index: 0 })
    const cell = one('[data-ui-viewer-cell="0"]')
    expect(
      [...cell.querySelectorAll('img')].map((img) => img.getAttribute('src')),
    ).toEqual(['/files/a-s.webp', '/files/a.jpg'])
    cell
      .querySelector('[data-ui-viewer-photo]')
      .dispatchEvent(new Event('load'))
    await flush()
    expect(
      [...cell.querySelectorAll('img')].map((img) => img.getAttribute('src')),
    ).toEqual(['/files/a.jpg'])
  })

  it('closes with ✕, and leaves the editor before it leaves the viewer', async () => {
    const { bound, events } = await mount(
      MediaViewer,
      { open: true, items: PHOTOS, index: 1, editing: true },
      {
        editor: () => h('p', { 'data-editor': '' }, 'editing b'),
        actions: () => h('button', { 'data-action': '' }, 'Borrar'),
      },
    )
    // While editing, the pictures and their actions step aside.
    expect(one('[data-editor]').textContent).toBe('editing b')
    expect(one('[data-action]')).toBeNull()
    expect(one('[data-ui-viewer-count]')).toBeNull()

    one('[data-ui-viewer-close]').click()
    await flush()
    expect(bound.editing).toBe(false)
    expect(bound.open).toBe(true)
    expect(one('[data-action]')).not.toBeNull()

    one('[data-ui-viewer-close]').click()
    await flush()
    expect(events.at(-1)).toEqual(['update:open', false])
  })

  it('keeps the same picture on screen when the page reorders the set', async () => {
    const { bound } = await mount(MediaViewer, {
      open: true,
      items: PHOTOS,
      index: 1,
    })
    // «b» becomes the first of the set (a new principal).
    bound.items = [PHOTOS[1], PHOTOS[0], PHOTOS[2]]
    await flush()
    expect(bound.index).toBe(0)
    expect(one('[data-ui-viewer-count]').textContent).toBe('1 of 3')
  })

  it('stays inside the set when a picture is deleted under it, and closes on the last', async () => {
    const { bound, events } = await mount(MediaViewer, {
      open: true,
      items: PHOTOS,
      index: 2,
    })
    bound.items = PHOTOS.slice(0, 2)
    await flush()
    expect(bound.index).toBe(1)
    bound.items = []
    await flush()
    expect(events.at(-1)).toEqual(['update:open', false])
  })
})

describe('PhotoEditor', () => {
  const reader = async () => ({
    source: {},
    width: 400,
    height: 300,
    type: 'image/jpeg',
    close: () => {},
  })
  const tool = (name) => one(`[data-ui-editor-tool="${name}"]`)

  it('offers «Guardar foto» only once something changed, and says what to do until then', async () => {
    await mount(PhotoEditor, { src: '/files/a.jpg', reader })
    expect(one('[data-ui-editor-save]').disabled).toBe(true)
    expect(one('[data-ui-editor-hint]').textContent).toContain(
      'Drag the corners to crop.',
    )
    expect(tool('undo')).toBeNull()

    tool('right').click()
    await flush()
    expect(one('[data-ui-editor-save]').disabled).toBe(false)
    expect(one('[data-ui-editor-hint]').textContent.trim()).toBe('')

    tool('undo').click()
    await flush()
    expect(one('[data-ui-editor-save]').disabled).toBe(true)
  })

  it('saves once, with the turns, the shape and the light the worker chose', async () => {
    const { events } = await mount(PhotoEditor, { src: '/files/a.jpg', reader })
    tool('right').click()
    tool('right').click()
    tool('left').click()
    one('[data-ui-editor-shape="square"]').click()
    await flush()
    expect(
      one('[data-ui-editor-shape="square"]').getAttribute('aria-pressed'),
    ).toBe('true')
    const light = one('[data-ui-editor-light]')
    light.value = '20'
    light.dispatchEvent(new Event('input'))
    await flush()

    one('[data-ui-editor-save]').click()
    await flush()
    expect(baked.calls).toHaveLength(1)
    const { width, height, edit, options } = baked.calls[0]
    expect([width, height, options.type]).toEqual([400, 300, 'image/jpeg'])
    expect(edit.turns).toBe(1)
    expect(edit.light).toBe(20)
    // A square on the turned picture (300 × 400): the full width, centred.
    expect(edit.crop.w).toBeCloseTo(1)
    expect(edit.crop.h).toBeCloseTo(0.75)
    expect(edit.crop.y).toBeCloseTo(0.125)
    const saved = events.find(([name]) => name === 'save')[1]
    expect(saved.blob).toBeInstanceOf(Blob)
    expect(saved.type).toBe('image/jpeg')
  })

  it('says so when the picture cannot be opened, and still lets the worker leave', async () => {
    const { events } = await mount(PhotoEditor, {
      src: '/files/gone.jpg',
      reader: async () => {
        throw new Error('fetch')
      },
    })
    expect(one('[role="alert"]').textContent).toContain(
      'This photo could not be opened for editing.',
    )
    expect(one('[data-ui-editor-save]').disabled).toBe(true)
    one('[data-ui-editor-cancel]').click()
    expect(events).toEqual([['cancel', undefined]])
  })
})

describe('the arithmetic of an edit', () => {
  it('turns and mirrors the crop with the picture', () => {
    const cropped = { ...newEdit(), crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.25 } }
    const right = turnEdit(cropped, 1)
    expect(right.turns).toBe(1)
    expect(right.crop.x).toBeCloseTo(0.55)
    expect(right.crop.y).toBeCloseTo(0.1)
    expect([right.crop.w, right.crop.h]).toEqual([0.25, 0.5])
    // Four quarter turns, or right then left, are where it started.
    const round = [1, 1, 1, 1].reduce((edit, by) => turnEdit(edit, by), cropped)
    for (const side of ['x', 'y', 'w', 'h'])
      expect(round.crop[side]).toBeCloseTo(cropped.crop[side])
    expect(round.turns).toBe(0)
    const back = turnEdit(right, -1)
    expect(back.turns).toBe(0)
    expect(back.crop.x).toBeCloseTo(0.1)

    const mirrored = flipEdit(cropped)
    expect(mirrored.flip).toBe(true)
    expect(mirrored.crop.x).toBeCloseTo(0.4)
    expect(isEdited(flipEdit(mirrored))).toBe(true) // the crop is still there
    expect(isEdited(flipEdit(flipEdit(newEdit())))).toBe(false)
  })

  it('fits a shape inside the picture as it shows', () => {
    // 4:3 landscape: a square takes the full height.
    expect(ratioCrop(400, 300, 0, 1)).toEqual({ x: 0.125, y: 0, w: 0.75, h: 1 })
    // The same picture turned is 3:4: a square takes the full width.
    const turned = ratioCrop(400, 300, 1, 1)
    expect(turned.w).toBeCloseTo(1)
    expect(turned.h).toBeCloseTo(0.75)
    expect(ratioCrop(400, 300, 0, 0)).toEqual({ x: 0, y: 0, w: 1, h: 1 })
    // «Libre» keeps the crop the worker already drew.
    const drawn = { ...newEdit(), crop: { x: 0.2, y: 0.2, w: 0.3, h: 0.3 } }
    expect(shapeEdit(drawn, 0, 400, 300).crop).toEqual(drawn.crop)
  })

  it('drags the frame without leaving the picture or collapsing', () => {
    const start = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 }
    // Moving stops at the edge.
    expect(dragCrop(start, 'move', 0.9, -0.9)).toEqual({
      x: 0.6,
      y: 0,
      w: 0.4,
      h: 0.4,
    })
    // A corner pulls two sides; the opposite corner stays.
    const grown = dragCrop(start, 'se', 0.1, 0.2)
    expect(grown.x).toBe(0.2)
    expect(grown.w).toBeCloseTo(0.5)
    expect(grown.h).toBeCloseTo(0.6)
    // Pushed past the other side, it keeps a smallest size.
    const tiny = dragCrop(start, 'se', -0.9, -0.9)
    expect(tiny.w).toBeCloseTo(edits.MIN_CROP)
    expect(tiny.h).toBeCloseTo(edits.MIN_CROP)
    // With a fixed shape both sides follow, and it still fits the picture.
    const square = dragCrop(start, 'se', 0.9, 0.1, 1)
    expect(square.w).toBeCloseTo(square.h)
    expect(square.x + square.w).toBeLessThanOrEqual(1 + 1e-9)
    expect(square.y + square.h).toBeLessThanOrEqual(1 + 1e-9)
  })

  it('sizes the saved file from the crop, and lightens without burning', () => {
    const edit = {
      ...newEdit(),
      turns: 1,
      crop: { x: 0, y: 0, w: 0.5, h: 0.5 },
    }
    // 4000 × 3000 turned is 3000 × 4000; half of each side, within 2000.
    expect(outputSize(4000, 3000, edit)).toEqual({ width: 1500, height: 2000 })
    const pixels = new Uint8ClampedArray([100, 200, 250, 255])
    applyLight(pixels, 20)
    expect([...pixels]).toEqual([120, 240, 255, 255])
    applyLight(pixels, 0)
    expect([...pixels]).toEqual([120, 240, 255, 255])
  })
})

describe('a picture before it travels', () => {
  it('knows a photo from a video, by name or by type', () => {
    expect(mediaKind('/files/Frente.JPG?v=2')).toBe('image')
    expect(mediaKind('clip.mov')).toBe('video')
    expect(mediaKind('captura', 'image/png')).toBe('image')
    expect(mediaKind('lista.pdf', 'application/pdf')).toBe('')
  })

  it('never makes a picture larger', () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 })
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 })
  })

  it('cuts a phone photo down, keeps a PNG a PNG, and lets the rest through', async () => {
    const drawn = []
    const tools = {
      decode: async () => ({ source: {}, width: 4000, height: 3000 }),
      canvas: (width, height) => ({
        getContext: () => ({
          fillRect: () => {},
          drawImage: (...args) => drawn.push(args.slice(1)),
        }),
        size: [width, height],
      }),
      blobOf: async (canvas, type) => new Blob(['small'], { type }),
    }
    const photo = new File([new Uint8Array(5000)], 'IMG_0001.HEIC', {
      type: 'image/heic',
    })
    const sent = await prepareImage(photo, tools)
    expect([sent.name, sent.type]).toEqual(['IMG_0001.jpg', 'image/jpeg'])
    expect(drawn[0]).toEqual([0, 0, 2000, 1500])

    const cutout = new File([new Uint8Array(5000)], 'logo.png', {
      type: 'image/png',
    })
    const kept = await prepareImage(cutout, tools)
    expect([kept.name, kept.type]).toEqual(['logo.png', 'image/png'])

    // Evidence asks for JPEG whatever came in.
    const flat = await prepareImage(cutout, { ...tools, keepPng: false })
    expect([flat.name, flat.type]).toEqual(['logo.jpg', 'image/jpeg'])

    // Already small and light: it goes up as it is.
    const small = new File([new Uint8Array(900)], 'chica.jpg', {
      type: 'image/jpeg',
    })
    expect(
      await prepareImage(small, {
        ...tools,
        decode: async () => ({ source: {}, width: 800, height: 600 }),
      }),
    ).toBe(small)
    // …unless the screen wants every picture re-encoded (its camera data dropped).
    const fresh = await prepareImage(small, {
      ...tools,
      lightBytes: 0,
      blobOf: async (canvas, type) => new Blob(['s'], { type }),
      decode: async () => ({ source: {}, width: 800, height: 600 }),
    })
    expect(fresh).not.toBe(small)
    expect(fresh.type).toBe('image/jpeg')

    const clip = new File(['v'], 'demo.mp4', { type: 'video/mp4' })
    expect(await prepareImage(clip, tools)).toBe(clip)
    const broken = new File(['x'], 'rota.jpg', { type: 'image/jpeg' })
    const unreadable = async () => {
      throw new Error('decode')
    }
    expect(await prepareImage(broken, { ...tools, decode: unreadable })).toBe(
      broken,
    )
  })
})
