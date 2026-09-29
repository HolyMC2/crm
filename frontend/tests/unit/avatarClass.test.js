// Avatar colours as theme token classes (MobileRecordCard): a name always gets
// the same pair, from the same small palette the inline-style helper uses.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

vi.mock('frappe-ui', () => ({
  Dropdown: {
    setup:
      (_, { slots }) =>
      () =>
        slots.default?.(),
  },
}))
import {
  AVATAR_CLASSES,
  avatarClass,
  avatarColor,
} from '@/composables/crmFormat'
import MobileRecordCard from '@/components/doco/MobileRecordCard.vue'

const NAMES = ['Ana López', 'Bruno', 'Carla Díaz', 'Taller Centro', '?', '']

describe('avatarClass', () => {
  it('is deterministic and always from the token palette', () => {
    for (const name of NAMES) {
      expect(avatarClass(name)).toBe(avatarClass(name))
      expect(AVATAR_CLASSES).toContain(avatarClass(name))
    }
  })

  it('picks the same palette slot as avatarColor', () => {
    for (const name of NAMES) {
      const i = AVATAR_CLASSES.indexOf(avatarClass(name))
      const [bg, ink] = avatarColor(name)
      expect(AVATAR_CLASSES[i]).toBe(
        `bg-${bg.slice(6, -1)} text-${ink.slice(6, -1)}`,
      )
    }
  })

  it('spreads names over more than one slot', () => {
    const used = new Set(
      Array.from({ length: 40 }, (_, i) => avatarClass(`Cliente ${i}`)),
    )
    expect(used.size).toBeGreaterThan(1)
  })

  it('uses theme token classes only, never a raw colour', () => {
    for (const cls of AVATAR_CLASSES)
      expect(cls).toMatch(/^bg-surface-[a-z]+-\d+ text-ink-[a-z]+-\d+$/)
  })
})

describe('MobileRecordCard avatar', () => {
  const apps = []
  afterEach(() => apps.splice(0).forEach((a) => a.unmount()))

  it('renders the token class and no inline colour style', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp({
      render: () => h(MobileRecordCard, { title: 'Ana López' }),
    })
    app.config.globalProperties.__ = globalThis.__
    app.mount(el)
    apps.push(app)
    await nextTick()
    const avatar = el.querySelector('[aria-hidden="true"]')
    expect(avatar.className).toContain(avatarClass('Ana López'))
    expect(avatar.getAttribute('style') || '').not.toMatch(/background|color/)
    expect(avatar.textContent.trim()).toBe('AL')
  })
})
