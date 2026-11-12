// «Primeros pasos» on Hoy: the owner's first-hour steps finish in Muelle. A row
// opens one of Hoy's sheets in place (business data and logo, one product,
// the invitation, the whole list) or a page of the shell, and the sheets call
// Abordo's own endpoints.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: (...args) => state.call(...args),
    toast: { success: vi.fn(), error: vi.fn() },
    Button: {
      props: ['label', 'variant', 'loading', 'disabled', 'type', 'form'],
      emits: ['click'],
      setup:
        (props, { emit, attrs }) =>
        () =>
          h(
            'button',
            {
              ...attrs,
              type: props.type || 'button',
              form: props.form,
              disabled: props.disabled,
              onClick: () => emit('click'),
            },
            props.label,
          ),
    },
  }
})
vi.mock('@/components/ui', async (importOriginal) => {
  const { h } = await import('vue')
  return {
    ...(await importOriginal()),
    BottomSheet: {
      props: ['open', 'title', 'subtitle'],
      setup:
        (props, { slots }) =>
        () =>
          props.open
            ? h('section', { role: 'dialog' }, [
                h('h2', props.title),
                props.subtitle
                  ? h('p', { 'data-subtitle': '' }, props.subtitle)
                  : null,
                slots.default?.(),
                h('footer', slots.actions?.()),
              ])
            : null,
    },
  }
})

import {
  decisionAnswers,
  decisionDraft,
  hojaOf,
  invitePayload,
  inviteProblems,
  negocioChanges,
  negocioDraft,
  negocioMissing,
  negocioProblems,
  todosGroups,
} from '@/components/primeros/primerosPasos'
import { continuarCards, sourceLink, withReturn } from '@/composables/useHoy'
import InvitarSheet from '@/components/primeros/InvitarSheet.vue'
import NegocioSheet from '@/components/primeros/NegocioSheet.vue'
import PrimerosPasosSheet from '@/components/primeros/PrimerosPasosSheet.vue'
import ProductoSheet from '@/components/primeros/ProductoSheet.vue'

const DATOS = {
  empresa: 'Abarrotes La Güera',
  telefono: '6691234567',
  correo: '',
  calle: '',
  colonia: '',
  ciudad: '',
  estado: '',
  cp: '',
  rfc: '',
  rfc_aplica: true,
  rfc_editable: true,
  logo: '',
}
const OPCIONES = {
  perfiles: [
    { name: 'Dueño', description: 'Todo el negocio.', pos: true },
    { name: 'Cajero', description: 'Cobra en la caja.', pos: true },
    { name: 'Contador', description: 'Contabilidad.', pos: false },
  ],
  pos_profiles: ['Caja 2', 'POS Principal'],
  pos_default: 'POS Principal',
  tecnico_en_equipo: true,
}
// Two of the catalog questions Abordo asks before the first product.
const PENDING = [
  {
    decision_key: 'catalog.serial_numbers',
    question: '¿Manejas equipos con número de serie o IMEI?',
    why: 'No se puede cambiar con ventas.',
    options: [
      { value: true, label: 'Sí, controlar cada serie o IMEI' },
      { value: false, label: 'No usar series' },
    ],
    default: true,
  },
  {
    decision_key: 'catalog.uom',
    question: '¿Cuál será la unidad base de tus artículos?',
    why: 'La unidad base no se cambia después.',
    options: [
      { value: 'pieza', label: 'Pieza' },
      { value: 'kg', label: 'Kilogramo' },
    ],
    default: 'pieza',
  },
]

describe('which sheet a link opens', () => {
  it('knows only Hoy’s own sheets', () => {
    expect(hojaOf('negocio')).toBe('negocio')
    expect(hojaOf('todos')).toBe('todos')
    expect(hojaOf('otra')).toBe('')
    expect(hojaOf(['negocio'])).toBe('')
  })

  it('a link to a sheet on Hoy opens it in place; any other link keeps the way back', () => {
    expect(sourceLink('/crm/hoy?paso=negocio')).toEqual({ hoja: 'negocio' })
    expect(sourceLink('/crm/hoy?paso=nada')).toEqual({
      to: withReturn('/hoy?paso=nada'),
    })
    expect(sourceLink('/crm/productos/nuevo')).toEqual({
      to: withReturn('/productos/nuevo'),
    })
    expect(sourceLink('/taller/setup')).toEqual({
      href: withReturn('/taller/setup'),
    })
  })

  it('the Primeros pasos card opens its steps and its whole list on Hoy', () => {
    const [pasos] = continuarCards({
      items: [],
      sources: [
        {
          key: 'abordo.primeros_pasos',
          label: 'Primeros pasos',
          detail: '1 de 5 listos',
          count: 3,
          url: '/crm/hoy?paso=todos',
          rows: [
            {
              name: 'negocio',
              title: 'Completa',
              url: '/crm/hoy?paso=negocio',
            },
            {
              name: 'precios',
              title: 'Precios',
              url: '/crm/productos/precios?vista=sin-precio',
            },
            { name: 'primera_venta', title: 'Vende', url: null },
          ],
          action: {
            label: 'Ocultar',
            method: 'abordo.primeros_pasos.hoy.hide',
          },
        },
      ],
    })
    expect(pasos.hoja).toBe('todos')
    expect(pasos.action).toBe('See all')
    expect(pasos.rows[0]).toMatchObject({ hoja: 'negocio' })
    expect(pasos.rows[1].to).toBe(
      withReturn('/productos/precios?vista=sin-precio'),
    )
    // A step that waits on another links nowhere.
    expect(pasos.rows[2]).toMatchObject({ href: '' })
    expect(pasos.rows[2].hoja).toBeUndefined()
    // A checklist: an open step is an empty circle (never a tick), one that
    // waits is a lock, as in the whole list.
    expect(pasos.rows.map((row) => row.icon)).toEqual([
      'lucide-circle',
      'lucide-circle',
      'lucide-lock',
    ])
  })
})

describe('business details', () => {
  it('sends only what changed, and the RFC only where it may change', () => {
    const form = negocioDraft(DATOS)
    expect(negocioChanges(form, DATOS)).toEqual({})
    form.correo = ' hola@laguera.mx '
    form.rfc = 'EKU9003173C9'
    expect(negocioChanges(form, DATOS)).toEqual({
      correo: 'hola@laguera.mx',
      rfc: 'EKU9003173C9',
    })
    expect(negocioChanges(form, { ...DATOS, rfc_editable: false })).toEqual({
      correo: 'hola@laguera.mx',
    })
  })

  it('says what the step still misses, in its own words', () => {
    expect(negocioMissing(negocioDraft(DATOS), '')).toEqual([
      'logo',
      'email',
      'address',
    ])
    const done = { ...negocioDraft(DATOS), correo: 'a@b.mx', cp: '82000' }
    expect(negocioMissing(done, '/files/logo.png')).toEqual([])
  })

  it('a malformed email stops the save; an empty one is fine', () => {
    expect(negocioProblems({ correo: 'hola' })).toHaveProperty('correo')
    expect(negocioProblems({ correo: '' })).toEqual({})
  })

  it('an address that changes keeps its street and city', () => {
    const stored = {
      ...DATOS,
      calle: 'Av. Juárez 10',
      ciudad: 'Mazatlán',
      cp: '82000',
    }
    // One field of a stored address: the rest stays, nothing to ask.
    expect(
      negocioProblems({ ...negocioDraft(stored), cp: '82100' }, stored),
    ).toEqual({})
    expect(
      Object.keys(
        negocioProblems({ ...negocioDraft(stored), ciudad: ' ' }, stored),
      ),
    ).toEqual(['ciudad'])
    // A first address from the postal code alone.
    expect(
      Object.keys(
        negocioProblems({ ...negocioDraft(DATOS), cp: '82000' }, DATOS),
      ),
    ).toEqual(['calle', 'ciudad'])
    // Clearing a field sends it empty: the server clears it.
    expect(
      negocioChanges({ ...negocioDraft(stored), telefono: '' }, stored),
    ).toEqual({ telefono: '' })
  })
})

describe('the catalog questions before the first product', () => {
  it('start on the recommended answer and send each option’s own value', () => {
    const picked = decisionDraft(PENDING)
    expect(picked).toEqual({
      'catalog.serial_numbers': '0',
      'catalog.uom': '0',
    })
    expect(decisionAnswers(PENDING, { ...picked, 'catalog.uom': '1' })).toEqual(
      {
        'catalog.serial_numbers': true,
        'catalog.uom': 'kg',
      },
    )
    // A default that is not among the options leaves the question unanswered.
    const odd = [{ ...PENDING[1], default: 'caja' }]
    expect(decisionDraft(odd)).toEqual({ 'catalog.uom': '' })
    expect(decisionAnswers(odd, decisionDraft(odd))).toBeNull()
  })
})

describe('the invitation', () => {
  const ready = {
    nombre: ' Karla Méndez ',
    email: ' Karla@LaGuera.mx ',
    telefono: '',
    perfil: 'Cajero',
    pos_profile: '',
    entrega: 'correo',
  }

  it('sends the register only for a puesto that sells', () => {
    expect(invitePayload(ready, OPCIONES)).toEqual({
      nombre: 'Karla Méndez',
      email: 'karla@laguera.mx',
      telefono: '',
      perfil: 'Cajero',
      entrega: 'correo',
      pos_profile: 'POS Principal',
    })
    expect(
      invitePayload({ ...ready, perfil: 'Contador' }, OPCIONES),
    ).not.toHaveProperty('pos_profile')
    expect(
      invitePayload({ ...ready, pos_profile: 'Caja 2' }, OPCIONES).pos_profile,
    ).toBe('Caja 2')
  })

  it('asks for a name, the email they sign in with, a puesto, and a phone for WhatsApp', () => {
    expect(inviteProblems(ready, OPCIONES)).toEqual({})
    expect(
      Object.keys(
        inviteProblems(
          { ...ready, nombre: '', email: 'x', perfil: 'Jefe' },
          OPCIONES,
        ),
      ),
    ).toEqual(['nombre', 'email', 'perfil'])
    expect(
      inviteProblems({ ...ready, entrega: 'whatsapp' }, OPCIONES),
    ).toHaveProperty('telefono')
  })
})

describe('the whole list', () => {
  it('opens with what is left (the next step first), then done, then hidden', () => {
    const groups = todosGroups({
      siguiente: 'productos',
      pasos: [
        { key: 'negocio', hecho: true, oculto: false, bloqueado: false },
        { key: 'precios', hecho: false, oculto: false, bloqueado: true },
        { key: 'productos', hecho: false, oculto: false, bloqueado: false },
        { key: 'equipo', hecho: false, oculto: true, bloqueado: false },
      ],
    })
    expect(groups.open.map((s) => s.key)).toEqual(['productos', 'precios'])
    expect(groups.done.map((s) => s.key)).toEqual(['negocio'])
    expect(groups.hidden.map((s) => s.key)).toEqual(['equipo'])
  })
})

// ── the sheets ────────────────────────────────────────────────────────────

let app, root
const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
async function mount(component, props = {}) {
  const events = []
  root = document.createElement('div')
  document.body.appendChild(root)
  const listeners = {}
  for (const name of [
    'close',
    'saved',
    'invited',
    'tecnico',
    'hoja',
    'changed',
  ])
    listeners[`on${name[0].toUpperCase()}${name.slice(1)}`] = (...args) =>
      events.push([name, ...args])
  app = createApp({
    render: () => h(component, { open: true, ...props, ...listeners }),
  })
  app.config.globalProperties.__ = (...args) => window.__(...args)
  app.mount(root)
  await flush()
  return events
}
function type(selector, value) {
  const input = root.querySelector(selector)
  input.value = value
  input.dispatchEvent(new Event('input'))
}

beforeEach(() => {
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
  state.call.mockReset()
})
afterEach(() => {
  app?.unmount()
  root?.remove()
})

describe('«Datos de tu negocio»', () => {
  beforeEach(() => {
    state.call.mockImplementation(async (method, args) => {
      if (method === 'abordo.primeros_pasos.negocio.datos') return { ...DATOS }
      if (method === 'abordo.primeros_pasos.negocio.guardar')
        return { ...DATOS, ...args }
      throw new Error(`unexpected ${method}`)
    })
  })

  it('shows the business by its name and what is missing, and saves only the changes', async () => {
    const events = await mount(NegocioSheet)
    expect(root.querySelector('[data-subtitle]').textContent).toBe(
      'Abarrotes La Güera',
    )
    expect(
      root.querySelector('[data-testid="negocio-falta"]').textContent,
    ).toContain('Missing: logo, email, address.')
    const save = root.querySelector('[data-testid="negocio-guardar"]')
    expect(save.disabled).toBe(true) // nothing changed yet
    type('[data-field="correo"] input', 'hola@laguera.mx')
    type('[data-field="cp"] input', '82000')
    await flush()
    expect(save.disabled).toBe(false)
    // A first address needs its street and city, asked in the sheet's words.
    root.querySelector('form').dispatchEvent(new Event('submit'))
    await flush()
    expect(state.call).not.toHaveBeenCalledWith(
      'abordo.primeros_pasos.negocio.guardar',
      expect.anything(),
    )
    expect(root.querySelector('[data-field="calle"]').textContent).toContain(
      'Write the street and number',
    )
    type('[data-field="calle"] input', 'Av. Juárez 10')
    type('[data-field="ciudad"] input', 'Mazatlán')
    await flush()
    root.querySelector('form').dispatchEvent(new Event('submit'))
    await flush()
    expect(state.call).toHaveBeenCalledWith(
      'abordo.primeros_pasos.negocio.guardar',
      {
        correo: 'hola@laguera.mx',
        calle: 'Av. Juárez 10',
        ciudad: 'Mazatlán',
        cp: '82000',
      },
    )
    expect(events.map(([name]) => name)).toEqual(['saved'])
  })

  it('fixing one field of a stored address sends that field alone', async () => {
    const stored = {
      ...DATOS,
      calle: 'Av. Juárez 10',
      colonia: 'Centro',
      ciudad: 'Mazatlán',
      estado: 'Sinaloa',
      cp: '82000',
    }
    state.call.mockImplementation(async (method, args) => {
      if (method.endsWith('.datos')) return { ...stored }
      return { ...stored, ...args }
    })
    const events = await mount(NegocioSheet)
    type('[data-field="cp"] input', '82100')
    await flush()
    root.querySelector('form').dispatchEvent(new Event('submit'))
    await flush()
    expect(state.call).toHaveBeenCalledWith(
      'abordo.primeros_pasos.negocio.guardar',
      { cp: '82100' },
    )
    expect(events.map(([name]) => name)).toEqual(['saved'])
  })

  it('a stamped RFC reads as text and says where it changes', async () => {
    state.call.mockImplementation(async () => ({
      ...DATOS,
      rfc: 'EKU9003173C9',
      rfc_editable: false,
    }))
    await mount(NegocioSheet)
    const rfc = root.querySelector('[data-field="rfc"]')
    expect(rfc.querySelector('input')).toBeNull()
    expect(rfc.textContent).toContain('EKU9003173C9')
    expect(rfc.textContent).toContain('turn stamping on')
  })

  it('outside Mexico there is no RFC to ask for', async () => {
    state.call.mockImplementation(async () => ({
      ...DATOS,
      rfc_aplica: false,
      rfc_editable: false,
    }))
    await mount(NegocioSheet)
    expect(root.querySelector('[data-field="rfc"]')).toBeNull()
  })

  it('a refusal stays in the sheet, in the server’s words', async () => {
    state.call.mockImplementation(async (method) => {
      if (method.endsWith('.datos')) return { ...DATOS }
      throw Object.assign(new Error('x'), {
        messages: ['El RFC no es válido.'],
      })
    })
    const events = await mount(NegocioSheet)
    type('[data-field="correo"] input', 'hola@laguera.mx')
    await flush()
    root.querySelector('form').dispatchEvent(new Event('submit'))
    await flush()
    expect(
      root.querySelector('[data-testid="negocio-problema"]').textContent,
    ).toContain('El RFC no es válido.')
    expect(events).toEqual([])
  })
})

describe('«Agregar producto» without Mercado', () => {
  const calls = (method) =>
    state.call.mock.calls.filter(([name]) => name === method)

  it('needs a name and a price, then writes the item and its price', async () => {
    state.call.mockImplementation(async (method) =>
      method === 'abordo.guides.api.catalog_pending'
        ? []
        : { item: 'Coca 600', precio: 22 },
    )
    const events = await mount(ProductoSheet)
    expect(root.querySelector('[data-decision]')).toBeNull()
    root.querySelector('form').dispatchEvent(new Event('submit'))
    await flush()
    expect(calls('abordo.api.crear_producto')).toEqual([])
    expect(root.textContent).toContain('Write the product name.')
    expect(root.textContent).toContain('Write its selling price.')
    type('[data-field="nombre"] input', 'Coca 600')
    type('[data-field="precio"] input', '22,50')
    await flush()
    root.querySelector('form').dispatchEvent(new Event('submit'))
    await flush()
    expect(state.call).toHaveBeenCalledWith('abordo.api.crear_producto', {
      nombre: 'Coca 600',
      precio: 22.5,
      codigo_barras: '',
    })
    expect(events.map(([name]) => name)).toEqual(['saved'])
  })

  it('a new shop answers its catalog questions first, on the recommended answers, then adds the product', async () => {
    state.call.mockImplementation(async (method, args) => {
      if (method === 'abordo.guides.api.catalog_pending') return PENDING
      if (method === 'abordo.guides.api.answer_decisions')
        return Object.keys(args.answers).map((key) => ({ decision_key: key }))
      return { item: 'Funda', precio: 150 }
    })
    const events = await mount(ProductoSheet)
    const questions = [...root.querySelectorAll('[data-decision]')]
    expect(
      questions.map((q) => q.querySelector('p').textContent.trim()),
    ).toEqual(PENDING.map((d) => d.question))
    expect(root.textContent).not.toContain('catalog.') // never a stored key
    expect(root.querySelector('[data-field="nombre"]')).toBeNull()
    const chip = (q, label) =>
      [...q.querySelectorAll('button')].find(
        (b) => b.textContent.trim() === label,
      )
    // Recommended answers start chosen; a second tap keeps one chosen.
    expect(
      chip(questions[0], 'Sí, controlar cada serie o IMEI').getAttribute(
        'aria-pressed',
      ),
    ).toBe('true')
    chip(questions[0], 'Sí, controlar cada serie o IMEI').click()
    chip(questions[1], 'Kilogramo').click()
    await flush()
    expect(
      chip(questions[0], 'Sí, controlar cada serie o IMEI').getAttribute(
        'aria-pressed',
      ),
    ).toBe('true')
    expect(
      root.querySelector('[data-testid="decisiones-guardar"]').textContent,
    ).toBe('Save answers')
    root.querySelector('form').dispatchEvent(new Event('submit'))
    await flush()
    expect(calls('abordo.guides.api.answer_decisions')).toEqual([
      [
        'abordo.guides.api.answer_decisions',
        { answers: { 'catalog.serial_numbers': true, 'catalog.uom': 'kg' } },
      ],
    ])
    // On to the product.
    expect(root.querySelector('[data-decision]')).toBeNull()
    type('[data-field="nombre"] input', 'Funda')
    type('[data-field="precio"] input', '150')
    await flush()
    root.querySelector('form').dispatchEvent(new Event('submit'))
    await flush()
    expect(calls('abordo.api.crear_producto')).toHaveLength(1)
    expect(events.map(([name]) => name)).toEqual(['saved'])
  })

  it('answers that are refused stay on the questions, in the server’s words', async () => {
    state.call.mockImplementation(async (method) => {
      if (method === 'abordo.guides.api.catalog_pending') return PENDING
      throw Object.assign(new Error('x'), {
        messages: ['Solo el dueño o la gerencia puede responder.'],
      })
    })
    const events = await mount(ProductoSheet)
    root.querySelector('form').dispatchEvent(new Event('submit'))
    await flush()
    expect(
      root.querySelector('[data-testid="producto-problema"]').textContent,
    ).toContain('Solo el dueño o la gerencia puede responder.')
    expect(root.querySelectorAll('[data-decision]')).toHaveLength(2)
    expect(events).toEqual([])
  })
})

describe('«Invitar a alguien»', () => {
  const RESULT = {
    message: 'Usuario creado.',
    entrega: 'correo',
    mail_sent: true,
    access_url: 'https://tienda.example/acceso',
    whatsapp_url: 'https://wa.me/5216691234567?text=Hola',
    qr_data_uri: 'data:image/svg+xml,%3Csvg%2F%3E',
  }

  it('offers the site’s puestos by name, sends the invitation and shows the link once', async () => {
    state.call.mockImplementation(async (method) => {
      if (method === 'abordo.api.invitar_opciones') return OPCIONES
      if (method === 'abordo.api.invitar_usuario') return RESULT
      throw new Error(`unexpected ${method}`)
    })
    const events = await mount(InvitarSheet)
    const puestos = [
      ...root.querySelectorAll('[data-testid^="invitar-puesto-"]'),
    ].map((b) => b.textContent.trim())
    expect(puestos).toEqual(['Dueño', 'Cajero', 'Contador'])
    type('[data-field="nombre"] input', 'Karla Méndez')
    type('[data-field="email"] input', 'karla@laguera.mx')
    root.querySelector('[data-testid="invitar-puesto-Cajero"]').click()
    await flush()
    expect(root.textContent).toContain('Cobra en la caja.')
    // Two registers: the owner picks the one this person sells at.
    expect(root.querySelector('[data-field="pos_profile"] select').value).toBe(
      'POS Principal',
    )
    root.querySelector('form').dispatchEvent(new Event('submit'))
    await flush()
    expect(state.call).toHaveBeenCalledWith('abordo.api.invitar_usuario', {
      nombre: 'Karla Méndez',
      email: 'karla@laguera.mx',
      telefono: '',
      perfil: 'Cajero',
      entrega: 'correo',
      pos_profile: 'POS Principal',
    })
    expect(root.querySelector('h2').textContent).toBe('Invitation ready')
    // Said once, in the sheet's words: the mail went, the link is the backup.
    expect(
      root.querySelector('[data-testid="invitar-resultado"]').textContent,
    ).toContain('We sent the invitation to their email.')
    expect(
      root
        .querySelector('[data-testid="invitar-whatsapp"]')
        .getAttribute('href'),
    ).toBe(RESULT.whatsapp_url)
    expect(events.map(([name]) => name)).toEqual(['invited'])
    root.querySelector('[data-testid="invitar-cerrar"]').click()
    await flush()
    expect(events.map(([name]) => name)).toEqual(['invited', 'close'])
  })

  it('a mail that did not go out says so and offers the link', async () => {
    state.call.mockImplementation(async (method) => {
      if (method === 'abordo.api.invitar_opciones') return OPCIONES
      return { ...RESULT, mail_sent: false }
    })
    await mount(InvitarSheet)
    type('[data-field="nombre"] input', 'Karla Méndez')
    type('[data-field="email"] input', 'karla@laguera.mx')
    root.querySelector('[data-testid="invitar-puesto-Contador"]').click()
    await flush()
    root.querySelector('form').dispatchEvent(new Event('submit'))
    await flush()
    expect(
      root.querySelector('[data-testid="invitar-resultado"]').textContent,
    ).toContain('The email did not go out')
    expect(root.textContent).not.toContain('Usuario creado.')
  })

  it('a technician is added in Equipo instead', async () => {
    state.call.mockResolvedValue(OPCIONES)
    const events = await mount(InvitarSheet)
    root.querySelector('[data-testid="invitar-tecnico"]').click()
    expect(events).toEqual([['tecnico']])
  })

  it('without a puesto nothing is sent', async () => {
    state.call.mockResolvedValue(OPCIONES)
    await mount(InvitarSheet)
    type('[data-field="nombre"] input', 'Karla')
    type('[data-field="email"] input', 'karla@laguera.mx')
    root.querySelector('form').dispatchEvent(new Event('submit'))
    await flush()
    expect(state.call).toHaveBeenCalledTimes(1) // only the read
    expect(root.textContent).toContain('Choose their puesto.')
  })
})

describe('the whole «Primeros pasos» list', () => {
  const TODOS = {
    en_hoy: true,
    hechos: 1,
    total: 3,
    siguiente: 'productos',
    pasos: [
      {
        key: 'negocio',
        titulo: 'Completa los datos de tu negocio',
        detalle: 'Datos y logo listos.',
        hecho: true,
        oculto: false,
        bloqueado: false,
        accion: { label: 'Subir logo', url: '/crm/hoy?paso=negocio' },
        otras: [],
      },
      {
        key: 'productos',
        titulo: 'Sube tus productos',
        detalle: 'Todavía no tienes artículos a la venta.',
        hecho: false,
        oculto: false,
        bloqueado: false,
        accion: { label: 'Agregar producto', url: '/crm/hoy?paso=producto' },
        otras: [
          {
            label: 'Importar desde Excel',
            url: '/app/abordo-wizard?etapa=catalogo&accion=importar',
          },
        ],
      },
      {
        key: 'equipo',
        titulo: 'Invita a tu equipo',
        detalle: '1 persona con acceso.',
        hecho: false,
        oculto: true,
        bloqueado: false,
        accion: { label: 'Invitar', url: '/crm/hoy?paso=invitar' },
        otras: [],
      },
    ],
  }

  it('lists every step, opens a sheet from a row, and hides a step in place', async () => {
    state.call.mockImplementation(async (method) => {
      if (method === 'abordo.primeros_pasos.hoy.todos') return TODOS
      if (method === 'abordo.primeros_pasos.api.ocultar_paso') return {}
      throw new Error(`unexpected ${method}`)
    })
    const events = await mount(PrimerosPasosSheet)
    expect(root.querySelector('[data-subtitle]').textContent).toBe(
      '1 of 3 done',
    )
    const order = [...root.querySelectorAll('[data-paso]')].map(
      (li) => li.dataset.paso,
    )
    expect(order).toEqual(['productos', 'negocio', 'equipo'])
    root.querySelector('[data-paso="productos"] [data-ui-list-row]').click()
    expect(events).toEqual([['hoja', 'producto']])
    // The spreadsheet import stays a Desk link beside the step.
    expect(
      root.querySelector('[data-paso="productos"] a').getAttribute('href'),
    ).toContain('/app/abordo-wizard?etapa=catalogo&accion=importar')
    root.querySelector('[data-testid="paso-ocultar-productos"]').click()
    await flush()
    expect(state.call).toHaveBeenCalledWith(
      'abordo.primeros_pasos.api.ocultar_paso',
      { paso: 'productos' },
    )
    expect(events.at(-1)).toEqual(['changed'])
    expect(
      state.call.mock.calls.filter(([m]) => m.endsWith('.hoy.todos')).length,
    ).toBe(2)
  })

  it('a done step keeps its row and leaves its other ways out', async () => {
    const done = {
      ...TODOS,
      pasos: TODOS.pasos.map((step) =>
        step.key === 'productos' ? { ...step, hecho: true } : step,
      ),
    }
    state.call.mockImplementation(async (method) =>
      method.endsWith('.todos') ? done : {},
    )
    await mount(PrimerosPasosSheet)
    expect(root.querySelector('[data-paso="productos"]')).not.toBeNull()
    expect(root.querySelector('[data-paso="productos"] a')).toBeNull()
  })

  it('takes the card off Hoy from the list', async () => {
    state.call.mockImplementation(async (method) =>
      method.endsWith('.todos') ? TODOS : {},
    )
    await mount(PrimerosPasosSheet)
    root.querySelector('[data-testid="primeros-en-hoy"]').click()
    await flush()
    expect(state.call).toHaveBeenCalledWith(
      'abordo.primeros_pasos.api.mostrar_en_hoy',
      { mostrar: 0 },
    )
  })
})
