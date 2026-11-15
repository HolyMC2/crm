// Shell F14c: a record page names the projects its pendientes belong to and
// starts one; a Taller order hands a new project to Proyectos and gets the way
// back; RecordPendientes rows name their project.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'

const state = vi.hoisted(() => ({ api: vi.fn(), pendientes: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({
    fullPath: '/ventas/deal/DEAL-1?tab=overview',
    params: {},
    query: {},
  }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    Button: {
      props: ['label'],
      emits: ['click'],
      setup:
        (props, { emit }) =>
        () =>
          h('button', { onClick: () => emit('click') }, props.label),
    },
    call: vi.fn(async () => []),
  }
})
vi.mock('@/composables/useProyectos', async (importOriginal) => ({
  ...(await importOriginal()),
  proyectosApi: state.api,
}))
vi.mock('@/composables/usePendientes', async (importOriginal) => ({
  ...(await importOriginal()),
  pendientesApi: state.pendientes,
}))
// The sheets are their own units; here only that the door opens them matters.
vi.mock('@/components/proyectos/ProyectoSheet.vue', async () => {
  const { h } = await import('vue')
  return {
    __esModule: true,
    default: {
      props: ['modelValue', 'initialName'],
      setup: (props) => () =>
        props.modelValue
          ? h('div', { 'data-sheet': '', 'data-name': props.initialName })
          : null,
    },
  }
})
vi.mock('@/components/pendientes/CreateDialog.vue', async () => ({
  __esModule: true,
  default: { render: () => null },
}))

import { shellBoot } from '@/composables/muelleShell'
import { recordProyectoLine } from '@/composables/useProyectos'
import RecordProyectos from '@/components/proyectos/RecordProyectos.vue'
import RecordPendientes from '@/components/pendientes/RecordPendientes.vue'
import {
  handoffFrom,
  handoffQuery,
  returnFrom,
  withoutHandoff,
} from '@/utils/proyectoHandoff'

const flush = async () => {
  for (let i = 0; i < 6; i++) await nextTick()
  await new Promise((done) => setTimeout(done, 0))
}

let app, root, links
function mount(component, props = {}) {
  root = document.createElement('div')
  document.body.appendChild(root)
  links = []
  app = createApp({ render: () => h(component, reactive({ ...props })) })
  app.config.globalProperties.__ = globalThis.__
  app.component('RouterLink', {
    props: ['to'],
    setup:
      (props, { slots }) =>
      () => {
        links.push(props.to)
        return h(
          'a',
          { 'data-to': JSON.stringify(props.to) },
          slots.default?.(),
        )
      },
  })
  app.mount(root)
}

beforeEach(() => {
  state.api.mockReset()
  state.pendientes.mockReset()
  shellBoot.value = {
    modules: {
      pendientes: {
        enabled: true,
        today: '2026-11-15',
        capabilities: { create: true },
      },
      proyectos: { enabled: true, capabilities: { create: true } },
    },
  }
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  shellBoot.value = null
})

describe('RecordProyectos', () => {
  it('names each project with its progress and opens its plan with the way back', async () => {
    state.api.mockResolvedValue({
      rows: [
        {
          name: 'PROJ-1',
          project_name: 'Motor Tsuru',
          status: 'Open',
          total: 9,
          done: 4,
        },
        { name: null, project_name: null, status: null, total: 1, done: 0 },
      ],
      can_create: true,
    })
    mount(RecordProyectos, {
      referenceType: 'CRM Deal',
      referenceName: 'DEAL-1',
      referenceLabel: 'iPhone 13 de Ana',
      returnLabel: 'el trato',
    })
    await flush()
    expect(state.api).toHaveBeenCalledWith('de_registro', {
      reference_type: 'CRM Deal',
      reference_name: 'DEAL-1',
    })
    const text = root.textContent
    expect(text).toContain('Motor Tsuru')
    expect(text).toContain('4 of 9 done')
    // a project this worker cannot read: no name, no link
    expect(text).toContain('In a project')
    expect(root.querySelectorAll('[data-record-proyecto]')).toHaveLength(1)
    const to = links.find((link) => link?.name === 'Proyecto')
    expect(to.params.name).toBe('PROJ-1')
    expect(to.query.return_to).toBe('/crm/ventas/deal/DEAL-1?tab=overview')
    expect(to.query.return_label).toBe('el trato')
  })

  it('offers a project for this record, named after it', async () => {
    state.api.mockResolvedValue({ rows: [], can_create: true })
    mount(RecordProyectos, {
      referenceType: 'CRM Deal',
      referenceName: 'DEAL-1',
      referenceLabel: 'iPhone 13 de Ana',
    })
    await flush()
    root.querySelector('[data-record-proyecto-create]').click()
    await flush()
    expect(root.querySelector('[data-sheet]').dataset.name).toBe(
      'iPhone 13 de Ana',
    )
  })

  it('says nothing without projects and without the right to create one', async () => {
    state.api.mockResolvedValue({ rows: [], can_create: false })
    mount(RecordProyectos, {
      referenceType: 'CRM Deal',
      referenceName: 'DEAL-1',
    })
    await flush()
    expect(root.querySelector('[data-record-proyectos]')).toBeNull()
  })

  it('keeps the record page whole when the read fails', async () => {
    state.api.mockRejectedValue(new Error('boom'))
    mount(RecordProyectos, {
      referenceType: 'CRM Deal',
      referenceName: 'DEAL-1',
    })
    await flush()
    expect(root.querySelector('[data-record-proyectos]')).toBeNull()
  })
})

describe('RecordPendientes names the project of a row', () => {
  it('shows the project beside the date', async () => {
    state.pendientes.mockResolvedValue({
      linkable: true,
      rows: [
        {
          doctype: 'CRM Task',
          name: '7',
          description: 'Pedir la pieza',
          date: '2026-11-20',
          state: 'open',
          mine: true,
          project: 'PROJ-1',
          project_name: 'Motor Tsuru',
        },
      ],
      done: [],
      has_more: false,
    })
    mount(RecordPendientes, {
      referenceType: 'CRM Deal',
      referenceName: 'DEAL-1',
    })
    await flush()
    const chip = root.querySelector('[data-record-pendiente-proyecto]')
    expect(chip?.textContent).toContain('Motor Tsuru')
  })
})

describe('recordProyectoLine', () => {
  it('reads progress, and the state when the project is not running', () => {
    expect(recordProyectoLine({ status: 'Open', total: 9, done: 4 })).toBe(
      '4 of 9 done',
    )
    expect(recordProyectoLine({ status: 'On hold', total: 2, done: 0 })).toBe(
      '0 of 2 done · On hold',
    )
    expect(recordProyectoLine(null)).toBe('')
  })
})

describe('the Taller handoff', () => {
  it('reads the record a project is made from, and refuses junk', () => {
    expect(
      handoffFrom({
        ref_type: 'Repair Order',
        ref_name: 'RO-1',
        ref_label: 'iPhone 13',
      }),
    ).toEqual({
      reference_type: 'Repair Order',
      reference_name: 'RO-1',
      reference_label: 'iPhone 13',
    })
    expect(handoffFrom({ ref_type: 'Repair Order' })).toBeNull()
    expect(
      handoffFrom({ ref_type: 'Repair Order', ref_name: 'a\nb' }),
    ).toBeNull()
    expect(
      handoffFrom({ ref_type: 'Repair Order', ref_name: 'RO-1' })
        .reference_label,
    ).toBe('RO-1')
  })

  it('forwards the record and the way back, then forgets the one-shot keys', () => {
    const query = {
      nuevo: '1',
      ref_type: 'Repair Order',
      ref_name: 'RO-1',
      return_to: '/taller/orders/RO-1',
      return_label: 'la orden',
      list: 'all',
    }
    expect(handoffQuery(query)).toEqual({
      ref_type: 'Repair Order',
      ref_name: 'RO-1',
      return_to: '/taller/orders/RO-1',
      return_label: 'la orden',
    })
    expect(withoutHandoff({ ...query, nuevo_pendiente: '1' })).toEqual({
      return_to: '/taller/orders/RO-1',
      return_label: 'la orden',
      list: 'all',
    })
  })

  it('goes back to Taller by link and to a shell page by route', () => {
    expect(
      returnFrom({
        return_to: '/taller/orders/RO-1',
        return_label: 'la orden',
      }),
    ).toEqual({
      href: '/taller/orders/RO-1',
      label: 'la orden',
    })
    expect(
      returnFrom({
        return_to: '/crm/ventas/deal/D-1',
        return_label: 'el trato',
      }),
    ).toEqual({
      route: '/ventas/deal/D-1',
      label: 'el trato',
    })
    expect(returnFrom({ return_to: 'https://evil.test/' })).toBeNull()
    expect(returnFrom({ return: '/taller/orders/RO-1' })).toBeNull()
  })
})
