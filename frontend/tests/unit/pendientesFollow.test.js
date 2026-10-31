// Shell D8 follow-up: a record that can't hold pendientes hides its card, a
// record with only done work names the toggle, and the editor's Vence/Hora
// (D1's DateField) bridge Frappe's «HH:MM:SS» to the pendiente's «HH:MM».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'

const state = vi.hoisted(() => ({ api: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ fullPath: '/contactos/ana', params: {}, query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    Button: {
      props: ['label', 'disabled', 'loading', 'variant', 'type', 'form'],
      emits: ['click'],
      setup:
        (props, { emit }) =>
        () =>
          h(
            'button',
            {
              type: props.type || 'button',
              disabled: !!props.disabled,
              'data-label': props.label,
              onClick: () => emit('click'),
            },
            props.label,
          ),
    },
    // A textarea that answers every keystroke, like frappe-ui's own.
    FormControl: {
      props: ['modelValue', 'type', 'label'],
      emits: ['update:modelValue'],
      setup:
        (props, { emit }) =>
        () =>
          h('textarea', {
            'data-control': props.label,
            value: props.modelValue,
            onInput: (event) => emit('update:modelValue', event.target.value),
          }),
    },
    FeatherIcon: { render: () => null },
    call: vi.fn(async () => []),
  }
})
vi.mock('@/components/ui', async () => {
  const { h } = await import('vue')
  return {
    BottomSheet: {
      props: ['open'],
      setup:
        (props, { slots }) =>
        () =>
          props.open ? h('div', [slots.default?.(), slots.actions?.()]) : null,
    },
  }
})
// DateField stand-in: an input per mode that emits the stored form directly.
vi.mock('@/components/ui/DateField.vue', async () => {
  const { h } = await import('vue')
  return {
    default: {
      props: ['modelValue', 'mode', 'label'],
      emits: ['update:modelValue'],
      setup:
        (props, { emit }) =>
        () =>
          h('input', {
            'data-date-field': props.mode,
            value: props.modelValue,
            onInput: (event) => emit('update:modelValue', event.target.value),
          }),
    },
  }
})
vi.mock('@/composables/usePendientes', async (importOriginal) => ({
  ...(await importOriginal()),
  pendientesApi: (...args) => state.api(...args),
}))

import { shellBoot } from '@/composables/muelleShell'
import CreateDialog from '@/components/pendientes/CreateDialog.vue'
import RecordPendientes from '@/components/pendientes/RecordPendientes.vue'

const flush = async () => {
  for (let i = 0; i < 6; i++) await nextTick()
  await new Promise((done) => setTimeout(done, 0))
}
function type(node, value) {
  node.value = value
  node.dispatchEvent(new Event('input'))
}

let app, root
function mount(component, props = {}) {
  root = document.createElement('div')
  document.body.appendChild(root)
  const bound = reactive({ ...props })
  app = createApp({ render: () => h(component, bound) })
  app.config.globalProperties.__ = globalThis.__
  app.component('RouterLink', {
    setup:
      (_p, { slots }) =>
      () =>
        h('a', slots.default?.()),
  })
  app.mount(root)
  return bound
}

beforeEach(() => {
  state.api.mockReset()
  shellBoot.value = {
    modules: {
      pendientes: {
        key: 'pendientes',
        enabled: true,
        user: 'vendedor@example.test',
        today: '2026-10-18',
        capabilities: { read: true, create: true },
      },
    },
  }
})
afterEach(() => {
  app?.unmount()
  root?.remove()
})

describe('RecordPendientes', () => {
  it('hides the whole card when the server says the record cannot hold pendientes', async () => {
    state.api.mockResolvedValue({
      linkable: false,
      rows: [],
      done: [],
      has_more: false,
    })
    mount(RecordPendientes, { referenceType: 'Note', referenceName: 'n-1' })
    await flush()
    expect(state.api).toHaveBeenCalledWith('on_record', {
      reference_type: 'Note',
      reference_name: 'n-1',
    })
    expect(root.querySelector('[data-record-pendientes]')).toBeNull()
  })

  it('hides the whole card when I may not read the record (403)', async () => {
    state.api.mockRejectedValue(
      Object.assign(new Error('No permission'), {
        exc_type: 'PermissionError',
        status: 403,
      }),
    )
    mount(RecordPendientes, { referenceType: 'Contact', referenceName: 'ana' })
    await flush()
    expect(root.querySelector('[data-record-pendientes]')).toBeNull()
  })

  it('keeps the card and says why on any other failure', async () => {
    state.api.mockRejectedValue(new Error('Servidor ocupado'))
    mount(RecordPendientes, { referenceType: 'Contact', referenceName: 'ana' })
    await flush()
    const card = root.querySelector('[data-record-pendientes]')
    expect(card).not.toBeNull()
    expect(card.querySelector('[role="alert"]').textContent).toContain(
      'Servidor ocupado',
    )
  })

  it('names a bare list with only done rows in its toggle, without an empty heading', async () => {
    state.api.mockResolvedValue({
      rows: [],
      done: [
        { doctype: 'ToDo', name: '1', description: 'Llamar', mine: false },
      ],
      has_more: false,
    })
    mount(RecordPendientes, {
      referenceType: 'Contact',
      referenceName: 'ana',
      title: 'Encargados a otros',
      othersOnly: true,
      bare: true,
    })
    await flush()
    const card = root.querySelector('[data-record-pendientes]')
    expect(card.querySelector('h3')).toBeNull()
    expect(card.querySelector('button').textContent).toMatch(
      /^\s*Encargados a otros · /,
    )
  })
})

describe('CreateDialog Vence/Hora', () => {
  it('enables Guardar on the first keystroke and sends «HH:MM» from the time field', async () => {
    state.api.mockResolvedValue({ row: { name: 'new' } })
    mount(CreateDialog, { modelValue: true, today: '2026-10-18' })
    await flush()
    const save = () => root.querySelector('button[type="submit"]')
    expect(save().disabled).toBe(true)
    type(root.querySelector('textarea'), 'L')
    await nextTick()
    expect(save().disabled).toBe(false)
    type(root.querySelector('textarea'), 'Llamar a Ana')

    // Today is preset, so Hora shows; DateField speaks «HH:MM:SS».
    const time = root.querySelector('[data-date-field="time"]')
    expect(time.value).toBe('')
    type(time, '18:30:00')
    await nextTick()
    expect(root.querySelector('[data-date-field="time"]').value).toBe(
      '18:30:00',
    )
    root.querySelector('form').dispatchEvent(new Event('submit'))
    await flush()
    const [method, args] = state.api.mock.calls.at(-1)
    expect(method).toBe('create')
    expect(args).toMatchObject({
      description: 'Llamar a Ana',
      date: '2026-10-18',
      time: '18:30',
    })
  })

  it('shows a stored «HH:MM» as «HH:MM:SS» and «No time» (Sin hora) clears only the time', async () => {
    mount(CreateDialog, {
      modelValue: true,
      today: '2026-10-18',
      row: {
        doctype: 'ToDo',
        name: '7',
        description: 'Llevar mica',
        date: '2026-10-20',
        time: '09:15',
        modified: '2026-10-18 10:00:00',
      },
    })
    await flush()
    expect(root.querySelector('[data-date-field="time"]').value).toBe(
      '09:15:00',
    )
    root.querySelector('button[data-label="No time"]').click()
    await nextTick()
    expect(root.querySelector('[data-date-field="time"]').value).toBe('')
    expect(root.querySelector('[data-date-field="date"]').value).toBe(
      '2026-10-20',
    )
    expect(root.querySelector('button[data-label="No time"]')).toBeNull()
  })

  it('clearing Vence clears the time and hides Hora', async () => {
    mount(CreateDialog, {
      modelValue: true,
      today: '2026-10-18',
      row: {
        doctype: 'ToDo',
        name: '8',
        description: 'Ordenar vitrina',
        date: '2026-10-20',
        time: '09:15',
        modified: '2026-10-18 10:00:00',
      },
    })
    await flush()
    type(root.querySelector('[data-date-field="date"]'), '')
    await flush()
    expect(root.querySelector('[data-date-field="time"]')).toBeNull()
    type(root.querySelector('[data-date-field="date"]'), '2026-10-21')
    await flush()
    expect(root.querySelector('[data-date-field="time"]').value).toBe('')
  })
})

describe('CreateDialog «Para» in one tap', () => {
  const people = [
    { user: 'ana@example.test', name: 'Ana López', often: true },
    { user: 'beto@example.test', name: 'Beto Ruiz', often: true },
    { user: 'vendedor@example.test', name: 'Vero Vendedora', me: true },
    { user: 'carla@example.test', name: 'Carla Díaz' },
    { user: 'dani@example.test', name: 'Dani Paz' },
    { user: 'eva@example.test', name: 'Eva Sol' },
  ]
  const answer = (rows = people) =>
    state.api.mockImplementation(async (method) =>
      method === 'people' ? { rows } : { row: { name: 'new' } },
    )
  const quickRow = () =>
    [...root.querySelectorAll('[data-testid=pendiente-para] [role=radio]')].map(
      (chip) => [
        chip.querySelector('.truncate').textContent.trim(),
        chip.getAttribute('aria-checked'),
      ],
    )

  it('shows me first, then the people I hand pendientes to most; one tap assigns', async () => {
    answer()
    mount(CreateDialog, { modelValue: true, today: '2026-10-18' })
    await flush()
    expect(state.api).toHaveBeenCalledWith('people', { search: '' })
    expect(quickRow()).toEqual([
      ['Me', 'true'],
      ['Ana López', 'false'],
      ['Beto Ruiz', 'false'],
      ['Carla Díaz', 'false'],
      ['Dani Paz', 'false'],
    ])
    type(root.querySelector('textarea'), 'Mandar la cotización')
    ;[...root.querySelectorAll('[data-testid=pendiente-para] [role=radio]')][1].click()
    await nextTick()
    expect(quickRow()[1][1]).toBe('true')
    expect(quickRow()[0][1]).toBe('false')
    root.querySelector('form').dispatchEvent(new Event('submit'))
    await flush()
    const [method, args] = state.api.mock.calls.at(-1)
    expect(method).toBe('create')
    expect(args.assigned_to).toBe('ana@example.test')
  })

  it('keeps the current assignee in the row and searches everyone else from «Otra persona»', async () => {
    answer()
    mount(CreateDialog, {
      modelValue: true,
      today: '2026-10-18',
      row: {
        doctype: 'ToDo',
        name: '9',
        description: 'Cerrar caja',
        date: '2026-10-20',
        assigned_to: 'zoe@example.test',
        assigned_to_name: 'Zoe Mar',
        modified: '2026-10-18 10:00:00',
      },
    })
    await flush()
    expect(quickRow()[1]).toEqual(['Zoe Mar', 'true'])
    expect(quickRow()).toHaveLength(5)
    expect(root.querySelector('[data-control="For"]')).toBeNull()
    root.querySelector('[data-testid=pendiente-para-otro]').click()
    await flush()
    expect(root.querySelector('[data-control="For"]')).not.toBeNull()
    // Back to me: the edit sends me as the one who does it.
    ;[...root.querySelectorAll('[data-testid=pendiente-para] [role=radio]')][0].click()
    root.querySelector('form').dispatchEvent(new Event('submit'))
    await flush()
    const [method, args] = state.api.mock.calls.at(-1)
    expect(method).toBe('update')
    expect(args.values).toEqual({ assigned_to: 'vendedor@example.test' })
  })

  it('still offers «Me» and «Otra persona» when the coworkers cannot be read', async () => {
    state.api.mockRejectedValue(new Error('offline'))
    mount(CreateDialog, { modelValue: true, today: '2026-10-18' })
    await flush()
    expect(quickRow()).toEqual([['Me', 'true']])
    expect(root.querySelector('[data-testid=pendiente-para-otro]')).not.toBeNull()
  })
})
