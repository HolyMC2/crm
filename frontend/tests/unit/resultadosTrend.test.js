import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

import {
  trendAxis,
  trendBuckets,
  trendGrain,
  trendLabels,
} from '../../src/components/resultados/trendBars.js'
import ResultadosTrend from '../../src/components/resultados/ResultadosTrend.vue'

const days = (from, n, value = (i) => (i + 1) * 100) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(`${from}T12:00:00`)
    d.setDate(d.getDate() + i)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { date: iso, value: value(i), tickets: 1 }
  })

describe('trend bars', () => {
  it('keeps a bar per day up to six weeks, then weeks, then months', () => {
    expect(trendGrain(1)).toBe('day')
    expect(trendGrain(45)).toBe('day')
    expect(trendGrain(46)).toBe('week')
    expect(trendGrain(190)).toBe('week')
    expect(trendGrain(191)).toBe('month')
  })

  it('rolls weeks up Monday to Sunday, the comparison over the same days', () => {
    // 2026-11-01 is a Sunday: it closes the week of 26 Oct on its own.
    const points = days('2026-11-01', 9)
    const prev = days('2026-10-23', 9, () => 10)
    const weeks = trendBuckets(points, prev, 'week')
    expect(weeks.map((w) => [w.from, w.to])).toEqual([
      ['2026-11-01', '2026-11-01'],
      ['2026-11-02', '2026-11-08'],
      ['2026-11-09', '2026-11-09'],
    ])
    expect(weeks.map((w) => w.value)).toEqual([100, 3500, 900])
    expect(weeks.map((w) => w.prev)).toEqual([10, 70, 10])
    expect(weeks[1].tickets).toBe(7)
    expect(weeks[1].prevFrom).toBe('2026-10-24')
  })

  it('leaves the comparison empty where it has no point', () => {
    const [first, second] = trendBuckets(days('2026-11-01', 2), [
      { date: '2026-10-01', value: 5 },
    ])
    expect(first.prev).toBe(5)
    expect(second.prev).toBeNull()
  })

  it('puts the value axis on round steps from zero', () => {
    expect(trendAxis([19880, 1800, 0]).ticks).toEqual([
      0, 5000, 10000, 15000, 20000,
    ])
    expect(trendAxis([340887, 90000]).max).toBe(400000)
    const mixed = trendAxis([-300, 900])
    expect(mixed.min).toBeLessThan(0)
    expect(mixed.ticks).toContain(0)
    expect(trendAxis([0, 0]).ticks).toEqual([0])
  })

  it('labels about six days by their number, the month only where it starts', () => {
    const buckets = trendBuckets(days('2026-10-28', 22), null, 'day')
    const labels = trendLabels(buckets, 'day')
    expect(labels.map((l) => l.i)).toEqual([0, 4, 8, 12, 16, 20])
    // 28 Oct carries its month, 1 Nov (the first label in November) its own.
    expect(labels[0].text).not.toBe('28')
    expect(labels[1].text).not.toBe('1')
    expect(labels[2].text).toBe('5')
  })
})

describe('ResultadosTrend', () => {
  let app
  afterEach(() => app?.unmount())

  async function mount(props) {
    const root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp({ render: () => h(ResultadosTrend, props) })
    app.config.globalProperties.__ = globalThis.__
    app.mount(root)
    await nextTick()
    const plot = root.querySelector('[data-testid="trend-plot"]')
    plot.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 300,
      height: 200,
    })
    return { root, plot }
  }
  function pointer(el, type, clientX, pointerType) {
    const event = new MouseEvent(type, { bubbles: true, clientX })
    Object.defineProperty(event, 'pointerType', { value: pointerType })
    el.dispatchEvent(event)
  }

  it('a click narrows the board to that day', async () => {
    const onFilter = vi.fn()
    const { root, plot } = await mount({
      points: days('2026-11-01', 3),
      onFilter,
    })
    pointer(plot, 'pointerdown', 150, 'mouse')
    await nextTick()
    expect(root.querySelector('[data-testid="trend-tooltip"]')).not.toBeNull()
    plot.click()
    expect(onFilter).toHaveBeenCalledWith({
      periodo: 'rango',
      desde: '2026-11-02',
      hasta: '2026-11-02',
    })
  })

  it('a first tap shows the day, the same bar tapped again narrows', async () => {
    const onFilter = vi.fn()
    const { root, plot } = await mount({
      points: days('2026-11-01', 3),
      onFilter,
    })
    pointer(plot, 'pointerdown', 250, 'touch')
    plot.click()
    await nextTick()
    expect(onFilter).not.toHaveBeenCalled()
    expect(
      root.querySelector('[data-testid="trend-hint"]').textContent,
    ).toContain('Tap again')
    pointer(plot, 'pointerdown', 250, 'touch')
    plot.click()
    expect(onFilter).toHaveBeenCalledWith({
      periodo: 'rango',
      desde: '2026-11-03',
      hasta: '2026-11-03',
    })
  })

  it('one day has nothing to narrow to', async () => {
    const onFilter = vi.fn()
    const { root, plot } = await mount({
      points: days('2026-11-01', 1),
      onFilter,
    })
    pointer(plot, 'pointerdown', 10, 'mouse')
    plot.click()
    await nextTick()
    expect(onFilter).not.toHaveBeenCalled()
    expect(root.querySelector('[data-testid="trend-hint"]')).toBeNull()
  })
})
