// Funnel bars take theme token backgrounds from the status colour, whatever
// form it arrives in, with a neutral fallback (components/doco/FunnelView).
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { parseColor } from '@/utils'
import {
  NEUTRAL_FUNNEL_COLORS,
  funnelColorClasses,
  statusColorName,
} from '@/utils/statusColors'
import { pipelineStageOptions } from '@/utils/dealsListSummary'
import FunnelView from '@/components/doco/FunnelView.vue'

// the CRM Deal Status `color` Select options
const OPTIONS = [
  'black',
  'gray',
  'blue',
  'green',
  'red',
  'pink',
  'orange',
  'amber',
  'yellow',
  'cyan',
  'teal',
  'violet',
  'purple',
]

describe('statusColorName', () => {
  it('reads raw names and the statuses store text classes alike', () => {
    for (const name of OPTIONS) {
      expect(statusColorName(name)).toBe(name)
      expect(statusColorName(parseColor(name))).toBe(name)
    }
    expect(statusColorName('text-ink-blue-9')).toBe('blue')
  })

  it('is empty for anything else', () => {
    for (const bad of [
      '',
      null,
      undefined,
      42,
      '#ff0000',
      'var(--surface-gray-4)',
      'magenta',
      '!text-magenta-600',
    ])
      expect(statusColorName(bad)).toBe('')
  })
})

describe('funnelColorClasses', () => {
  it('maps every status colour to surface token backgrounds', () => {
    for (const name of OPTIONS) {
      const { bar, dot } = funnelColorClasses(parseColor(name))
      expect(bar).toMatch(/^bg-surface-[a-z]+-\d+$/)
      expect(dot).toMatch(/^bg-surface-[a-z]+-\d+$/)
    }
    expect(funnelColorClasses('red')).toEqual({
      bar: 'bg-surface-red-3',
      dot: 'bg-surface-red-7',
    })
    expect(funnelColorClasses('!text-green-700').bar).toBe('bg-surface-green-3')
  })

  it('falls back to neutral tokens, never a hex', () => {
    expect(funnelColorClasses('')).toEqual(NEUTRAL_FUNNEL_COLORS)
    expect(funnelColorClasses('#25d366')).toEqual(NEUTRAL_FUNNEL_COLORS)
    expect(funnelColorClasses(undefined)).toEqual(NEUTRAL_FUNNEL_COLORS)
  })
})

describe('pipelineStageOptions colour', () => {
  const statuses = [{ name: 'Nuevo', color: '!text-blue-600' }]
  it('carries the stage colour, else the status row colour', () => {
    const pipelines = [
      {
        name: 'P',
        stages: [
          { name: 'Nuevo', color: '' },
          { name: 'Ganado', color: 'green' },
        ],
      },
    ]
    expect(
      pipelineStageOptions(pipelines, 'P', statuses).map((s) => s.color),
    ).toEqual(['!text-blue-600', 'green'])
    expect(pipelineStageOptions([], '', statuses)[0].color).toBe(
      '!text-blue-600',
    )
  })
})

describe('FunnelView', () => {
  const apps = []
  afterEach(() => apps.splice(0).forEach((a) => a.unmount()))

  it('paints bars with token classes, not an inline background', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp({
      render: () =>
        h(FunnelView, {
          groups: [
            { value: 'Nuevo', label: 'Nuevo', color: '!text-red-600' },
            { value: 'Otro', label: 'Otro' },
          ],
          counts: { Nuevo: { count: 4 }, Otro: { count: 2 } },
        }),
    })
    app.config.globalProperties.__ = globalThis.__
    app.mount(el)
    apps.push(app)
    await nextTick()
    expect(el.querySelector('.bg-surface-red-3')).not.toBeNull()
    expect(el.querySelector('.bg-surface-red-7')).not.toBeNull()
    expect(el.querySelector('.bg-surface-gray-3')).not.toBeNull()
    expect(el.innerHTML).not.toMatch(/background:/)
  })
})
