// «Palabras que significan lo mismo» (pages/PalabrasTienda.vue over doco
// workspaces.palabras): groups as chips, a word added in place or removed with
// its ×, a group of one word held back, «Probar» on the list on screen, one
// «Guardar palabras» while something changed, and the owner alone edits.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import {
  addWords,
  lonelyGroups,
  sameGroups,
  splitWords,
  toSave,
  withoutWord,
} from '@/components/productos/palabras'

const state = vi.hoisted(() => ({ call: vi.fn(), toast: vi.fn() }))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: (...args) => state.call(...args),
    toast: { success: (...a) => state.toast(...a), error: vi.fn() },
    Button: {
      props: ['label'],
      setup:
        (p, { attrs }) =>
        () =>
          h('button', { ...attrs }, p.label),
    },
  }
})
vi.mock('vue-router', () => ({ onBeforeRouteLeave: () => {} }))
vi.mock('@/composables/breakpoint', async () => {
  const { ref } = await import('vue')
  return { isMobile: ref(false) }
})
vi.mock('@/components/ui', async () => {
  const { h } = await import('vue')
  const pass =
    (tag) =>
    (_p, { slots, attrs }) =>
    () =>
      h(tag, attrs, slots.default?.())
  return {
    AppBar: { render: () => null },
    ListGroup: { setup: pass('ul') },
    ListRow: {
      props: ['title', 'subtitle', 'to'],
      setup:
        (p, { slots }) =>
        () =>
          h('div', { 'data-row': '' }, [p.title, slots.trailing?.()]),
    },
    StatusChip: {
      props: ['label'],
      setup:
        (p, { attrs }) =>
        () =>
          h('span', attrs, p.label),
    },
    EmptyState: {
      props: ['title', 'action'],
      emits: ['action'],
      setup:
        (p, { emit }) =>
        () =>
          h('button', { 'data-empty': '', onClick: () => emit('action') }, [
            p.title,
            p.action,
          ]),
    },
    Fab: {
      props: ['label', 'disabled'],
      setup:
        (p, { attrs }) =>
        () =>
          h(
            'button',
            { 'data-fab': '', disabled: p.disabled, onClick: attrs.onClick },
            p.label,
          ),
    },
    chipClass: () => 'chip',
  }
})

globalThis.__ = (text, args) =>
  String(text).replace(/\{(\d+)\}/g, (_m, i) => args?.[i] ?? '')

let app
let root
afterEach(() => {
  app?.unmount()
  root?.remove()
  state.call.mockReset()
  state.toast.mockReset()
  vi.useRealTimers()
})

const settle = async () => {
  for (let i = 0; i < 4; i += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

async function mount(answer) {
  state.call.mockImplementation(async (method, args) => {
    if (method.endsWith('.state')) return answer
    if (method.endsWith('.save'))
      return { groups: JSON.parse(args.groups), can_change: true }
    if (method.endsWith('.probar'))
      return {
        q: args.q,
        con_lista: 2,
        sin_lista: 1,
        rows: [
          { name: 'C1', title: 'Case A54', por_lista: false },
          { name: 'F1', title: 'Funda A54', por_lista: true },
        ],
      }
    return null
  })
  const Page = (await import('@/pages/PalabrasTienda.vue')).default
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(Page) })
  app.config.globalProperties.__ = globalThis.__
  app.mount(root)
  await settle()
  return root
}

const chips = (el) =>
  [...el.querySelectorAll('[data-palabras-grupo]')].map((group) =>
    [...group.querySelectorAll('[data-palabras-palabra]')].map((chip) =>
      chip.textContent.trim(),
    ),
  )

describe('the word list helpers', () => {
  it('splits on commas and keeps each word once', () => {
    expect(splitWords(' funda ,  case;carcasa ,')).toEqual([
      'funda',
      'case',
      'carcasa',
    ])
    expect(addWords(['Batería'], 'bateria, pila')).toEqual(['Batería', 'pila'])
  })
  it('holds back a group of one word and saves no empty one', () => {
    expect(lonelyGroups([['funda', 'case'], ['mica'], []])).toEqual([1])
    expect(toSave([['funda', 'case'], []])).toEqual([['funda', 'case']])
    expect(sameGroups([['a', 'b'], []], [['a', 'b']])).toBe(true)
    expect(withoutWord([['a', 'b']], 0, 'a')).toEqual([['b']])
  })
})

describe('the word list screen', () => {
  it('shows the groups as chips and saves a word added in place', async () => {
    const el = await mount({
      groups: [['funda', 'case']],
      can_change: true,
    })
    expect(chips(el)).toEqual([['funda', 'case']])
    expect(el.querySelector('[data-fab]')).toBeNull()
    el.querySelector('[data-palabras-agregar]').click()
    await settle()
    const input = el.querySelector('[data-palabras-nueva]')
    input.value = 'carcasa'
    input.dispatchEvent(new Event('input'))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await settle()
    expect(chips(el)).toEqual([['funda', 'case', 'carcasa']])
    el.querySelector('[data-fab]').click()
    await settle()
    const save = state.call.mock.calls.find(([m]) => m.endsWith('.save'))
    expect(JSON.parse(save[1].groups)).toEqual([['funda', 'case', 'carcasa']])
    expect(state.toast).toHaveBeenCalledWith('Words saved')
  })

  it('a group left with one word cannot be saved', async () => {
    const el = await mount({ groups: [['funda', 'case']], can_change: true })
    el.querySelector('[aria-label="Remove «case»"]').click()
    await settle()
    expect(el.querySelector('[data-palabras-falta]')).not.toBeNull()
    expect(el.querySelector('[data-fab]').disabled).toBe(true)
  })

  it('a group goes with two taps, the bin then «Borrar»', async () => {
    const el = await mount({
      groups: [
        ['funda', 'case'],
        ['mica', 'cristal'],
      ],
      can_change: true,
    })
    el.querySelector('[data-palabras-borrar]').click()
    await settle()
    expect(chips(el)).toHaveLength(2)
    el.querySelector('[data-palabras-borrar-si]').click()
    await settle()
    expect(chips(el)).toEqual([['mica', 'cristal']])
  })

  it('«Probar» tries the list on screen and marks what only it finds', async () => {
    vi.useFakeTimers()
    const el = await mount({ groups: [['funda', 'case']], can_change: true })
    const field = el.querySelector('[data-palabras-probar]')
    field.value = 'case a54'
    field.dispatchEvent(new Event('input'))
    await vi.advanceTimersByTimeAsync(300)
    await settle()
    const probar = state.call.mock.calls.find(([m]) => m.endsWith('.probar'))
    expect(probar[1].q).toBe('case a54')
    expect(JSON.parse(probar[1].groups)).toEqual([['funda', 'case']])
    expect(el.querySelector('[data-palabras-con]').textContent).toContain('2')
    expect(el.querySelectorAll('[data-palabras-por-lista]')).toHaveLength(1)
  })

  it('who is not the owner reads the words and changes nothing', async () => {
    const el = await mount({ groups: [['funda', 'case']], can_change: false })
    expect(chips(el)).toEqual([['funda', 'case']])
    expect(el.querySelector('[data-palabras-solo-dueno]')).not.toBeNull()
    expect(el.querySelector('[data-palabras-agregar]')).toBeNull()
    expect(el.querySelector('[data-palabras-borrar]')).toBeNull()
    expect(el.querySelector('[aria-label="Remove «case»"]')).toBeNull()
  })

  it('an empty list starts a new group from its empty state', async () => {
    const el = await mount({ groups: [], can_change: true })
    el.querySelector('[data-empty]').click()
    await settle()
    expect(el.querySelector('[data-palabras-nueva]')).not.toBeNull()
  })
})
