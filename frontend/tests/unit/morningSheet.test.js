// «Resumen de ayer» (crm.api.morning): yesterday's rows with their buttons,
// and the owner's choice of whether it arrives each morning and at what hour.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const state = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({ call: (...args) => state.call(...args) }))
vi.mock('@/components/ui', async () => {
  const { h } = await import('vue')
  return {
    BottomSheet: {
      props: ['open', 'title', 'subtitle'],
      setup:
        (p, { slots }) =>
        () =>
          p.open
            ? h('div', { 'data-sheet': p.title, 'data-sub': p.subtitle }, [
                slots.default?.(),
              ])
            : null,
    },
    Segmented: {
      props: ['modelValue', 'options', 'label'],
      emits: ['update:modelValue'],
      setup:
        (p, { emit, attrs }) =>
        () =>
          h(
            'div',
            attrs,
            p.options.map((o) =>
              h(
                'button',
                {
                  'data-segment': o.value,
                  'aria-pressed': String(p.modelValue === o.value),
                  onClick: () => emit('update:modelValue', o.value),
                },
                o.label,
              ),
            ),
          ),
    },
  }
})

import MorningSheet from '@/components/hoy/MorningSheet.vue'

globalThis.__ ??= (text, args = []) =>
  String(text).replace(/\{(\d+)\}/g, (_, index) => args[index] ?? '')

const SUMMARY = {
  day: '2026-11-20',
  day_label: 'viernes 20 de noviembre',
  rows: [
    {
      key: 'ventas',
      title: 'Ventas de ayer',
      value: '$12,400',
      detail: '14 tickets',
      to: '/resultados?periodo=ayer',
      attention: false,
    },
    {
      key: 'seguimientos',
      title: 'Seguimientos sin hacer',
      value: '26',
      detail: 'Jenni 14, Tere 9',
      to: '/deals?follow_up=overdue',
      attention: true,
    },
    {
      key: 'taller.vencidos',
      title: 'Pendientes vencidos del taller',
      value: '3',
      detail: '',
      href: '/taller/orders?group=waiting&overdue=1',
      attention: true,
    },
  ],
  settings: {
    morning: true,
    morning_hour: 8,
    hours: [7, 8, 9],
    can_change: true,
  },
}

let app
let host
const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
async function mount(summary = SUMMARY) {
  state.call.mockResolvedValueOnce(JSON.parse(JSON.stringify(summary)))
  host = document.createElement('div')
  document.body.appendChild(host)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:all(.*)', component: { render: () => null } }],
  })
  app = createApp({ render: () => h(MorningSheet, { open: true }) })
  app.config.globalProperties.__ = globalThis.__
  app.use(router)
  app.mount(host)
  await flush()
}
const $ = (sel) => host.querySelector(sel)

afterEach(() => {
  app?.unmount()
  host?.parentNode?.removeChild(host)
  state.call.mockReset()
})

describe('Resumen de ayer', () => {
  it('lists yesterday with a button per row', async () => {
    await mount()
    expect(state.call).toHaveBeenCalledWith('crm.api.morning.summary')
    expect($('[data-sheet]').getAttribute('data-sub')).toBe(
      'viernes 20 de noviembre',
    )
    const sales = $('[data-morning="ventas"] a')
    expect(sales.textContent).toContain('$12,400')
    expect(sales.getAttribute('href')).toContain('/resultados?periodo=ayer')
    expect(sales.getAttribute('href')).toContain('return_to=')
    expect($('[data-morning="taller.vencidos"] a').getAttribute('href')).toBe(
      '/taller/orders?group=waiting&overdue=1',
    )
  })

  it('says so when nothing from yesterday needs you', async () => {
    await mount({ ...SUMMARY, rows: [] })
    expect($('[data-morning-clear]')).toBeTruthy()
  })

  it('lets the owner choose the hour and turn it off', async () => {
    await mount()
    state.call.mockResolvedValueOnce({
      settings: { ...SUMMARY.settings, morning_hour: 7 },
    })
    $('[data-morning-hour] [data-segment="7"]').click()
    await flush()
    expect(state.call).toHaveBeenLastCalledWith(
      'crm.api.morning.save_settings',
      { changes: { morning_hour: 7 } },
    )
    state.call.mockResolvedValueOnce({
      settings: { ...SUMMARY.settings, morning: false },
    })
    $('[data-morning-switch] [role="switch"], [data-morning-switch]').click()
    await flush()
    expect(state.call).toHaveBeenLastCalledWith(
      'crm.api.morning.save_settings',
      { changes: { morning: false } },
    )
    expect($('[data-morning-hour]')).toBeNull()
  })

  it('has no setting for someone who may not change it', async () => {
    await mount({
      ...SUMMARY,
      settings: { ...SUMMARY.settings, can_change: false },
    })
    expect($('[data-morning-switch]')).toBeNull()
  })
})
