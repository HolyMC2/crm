// Automatizaciones nativas (Shell D12): the words and guards of the shell's
// faces for Frappe Notification, Assignment Rule, Auto Repeat and Workflow.
import { describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => [])
vi.mock('frappe-ui', () => ({
  call: async (url, args) => {
    calls.push([url, args])
    return { ok: true }
  },
}))

import {
  FRECUENCIAS,
  PASOS_AVISO,
  autoApi,
  copiaTransicion,
  datosAviso,
  demostrativo,
  errorText,
  fechasInvalidas,
  fraseCondicion,
  fraseDestinatarios,
  fraseEvento,
  fraseRegla,
  frecuenciaLabel,
  hoyISO,
  insertarCampo,
  lineaRepeticion,
  listaY,
  ordenAcciones,
  pasoPendiente,
  resumenRepeticion,
  siguienteTexto,
} from '@/components/automatizaciones/automatizaciones'

const NOW = new Date(2026, 9, 18, 12, 0, 0) // 18 oct 2026, local

describe('Repetir cada…', () => {
  it('offers Frappe’s seven frequencies in worker words', () => {
    expect(FRECUENCIAS.map((f) => f.value)).toEqual([
      'Daily',
      'Weekly',
      'Fortnightly',
      'Monthly',
      'Quarterly',
      'Half-yearly',
      'Yearly',
    ])
    expect(FRECUENCIAS.map((f) => f.label)).toEqual([
      'Cada día',
      'Cada semana',
      'Cada 15 días',
      'Cada mes',
      'Cada 3 meses',
      'Cada 6 meses',
      'Cada año',
    ])
    expect(frecuenciaLabel('Fortnightly')).toBe('Cada 15 días')
    expect(frecuenciaLabel('Hourly')).toBe('')
  })

  it('says the confirm sentence with es-MX dates, never ISO', () => {
    const text = resumenRepeticion({
      demostrativo: demostrativo('la factura'),
      frecuencia: 'Monthly',
      inicio: '2026-11-01',
      now: NOW,
    })
    expect(text).toBe(
      'Se creará una copia de esta factura cada mes desde el 1 nov, sin fin.',
    )
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(
      resumenRepeticion({
        demostrativo: demostrativo('el pedido'),
        frecuencia: 'Weekly',
        inicio: '2026-10-18',
        fin: '2027-03-01',
        now: NOW,
      }),
    ).toBe(
      'Se creará una copia de este pedido cada semana hoy, hasta el 1 mar 2027.',
    )
    expect(
      resumenRepeticion({ frecuencia: 'Nope', inicio: '2026-11-01' }),
    ).toBe('')
  })

  it('refuses dates the server would refuse', () => {
    expect(fechasInvalidas({ inicio: '', now: NOW })).toBe(
      'Elige cuándo empieza.',
    )
    expect(fechasInvalidas({ inicio: '2026-10-17', now: NOW })).toMatch(
      /antes de hoy/,
    )
    expect(fechasInvalidas({ inicio: '2026-10-18', now: NOW })).toBe('')
    expect(
      fechasInvalidas({ inicio: '2026-11-01', fin: '2026-11-01', now: NOW }),
    ).toMatch(/después/)
    expect(
      fechasInvalidas({ inicio: '2026-11-01', fin: '2026-12-01', now: NOW }),
    ).toBe('')
    expect(hoyISO(NOW)).toBe('2026-10-18')
  })

  it('words the next copy, and an overdue one, from the server row', () => {
    const row = {
      activo: true,
      frecuencia: 'Monthly',
      frecuencia_texto: 'Cada mes',
      siguiente: '2026-11-01',
      fin: null,
    }
    expect(lineaRepeticion(row, { now: NOW })).toBe(
      'Cada mes · la siguiente el 1 nov · sin fin',
    )
    expect(
      siguienteTexto({ ...row, siguiente: '2026-09-01' }, { now: NOW }),
    ).toBe('atrasada desde el 1 sep')
    expect(siguienteTexto({ activo: false, estado: 'Terminada' })).toBe(
      'Terminada',
    )
  })
})

describe('Nuevo aviso', () => {
  it('has the seven picker steps in order', () => {
    expect(PASOS_AVISO.map((p) => p.title)).toEqual([
      'Documento',
      'Cuándo',
      'Condición',
      'A quién',
      'Por dónde',
      'Mensaje',
      'Confirmar',
    ])
  })

  it('says when an aviso fires in words, like the server', () => {
    const a = 'una factura'
    expect(fraseEvento({ evento: 'New', articulo: a })).toBe(
      'Al crear una factura',
    )
    expect(fraseEvento({ evento: 'Submit', articulo: a })).toBe(
      'Al confirmar una factura',
    )
    expect(
      fraseEvento({
        evento: 'Days Before',
        campo: 'Fecha de vencimiento',
        dias: 3,
      }),
    ).toBe('3 días antes de la fecha de vencimiento')
    expect(
      fraseEvento({ evento: 'Days After', campo: 'Entrega', dias: 1 }),
    ).toBe('1 día después de la fecha «Entrega»')
    expect(fraseEvento({ evento: 'Days After', campo: 'Fecha', dias: 0 })).toBe(
      'El mismo día de la fecha',
    )
    expect(fraseEvento({ evento: 'Value Change', campo: 'Estado' })).toBe(
      'Cuando cambia estado',
    )
    expect(fraseEvento({ evento: 'Value Change', campo: 'RFC' })).toBe(
      'Cuando cambia RFC',
    )
  })

  it('words a condition with the option label, never the stored value', () => {
    const estado = {
      label: 'Estado',
      fieldtype: 'Select',
      options: [{ value: 'Overdue', label: 'Vencida' }],
    }
    expect(fraseCondicion(estado, 'Overdue')).toBe('Estado es Vencida')
    expect(fraseCondicion({ label: 'Público', fieldtype: 'Check' }, '1')).toBe(
      'Público es sí',
    )
    expect(fraseCondicion(estado, '')).toBe('')
  })

  it('says who receives it', () => {
    expect(listaY(['Ana', 'Beto', 'Carla'])).toBe('Ana, Beto y Carla')
    expect(
      fraseDestinatarios({
        roles: [{ role: 'Accounts Manager', label: 'Gerente de cuentas' }],
        dueno: true,
        campo: { fieldname: 'contact_email', label: 'Correo del contacto' },
      }),
    ).toBe('Gerente de cuentas, el dueño del documento y correo del contacto')
  })

  it('does not move on until each step has what the server needs', () => {
    expect(pasoPendiente('documento', {})).toBeTruthy()
    expect(pasoPendiente('cuando', { evento: 'Days Before' })).toBe(
      'Elige la fecha.',
    )
    expect(pasoPendiente('cuando', { evento: 'New' })).toBe('')
    expect(pasoPendiente('condicion', { condicion: null })).toBe('')
    expect(
      pasoPendiente('condicion', {
        condicion: { campo: { fieldname: 'status' }, valor: '' },
      }),
    ).toBeTruthy()
    expect(
      pasoPendiente('quien', { destinatarios: { roles: [] } }),
    ).toBeTruthy()
    expect(pasoPendiente('quien', { destinatarios: { dueno: true } })).toBe('')
    expect(pasoPendiente('mensaje', { asunto: '  ' })).toBe(
      'Escribe el título.',
    )
    expect(pasoPendiente('mensaje', { asunto: 'x'.repeat(141) })).toBeTruthy()
  })

  it('inserts a field as a [Campo] token at the cursor, not as Jinja', () => {
    expect(insertarCampo('Factura de', 10, 'Cliente')).toEqual({
      text: 'Factura de [Cliente]',
      cursor: 20,
    })
    expect(insertarCampo('Hola ', 5, 'Número').text).toBe('Hola [Número]')
    expect(insertarCampo('', undefined, 'Total').text).toBe('[Total]')
  })

  it('sends only picks (names, never labels or code) to the server', () => {
    const payload = datosAviso({
      doctype: 'Sales Invoice',
      evento: 'Days After',
      campo: 'due_date',
      dias: '3',
      condicion: {
        campo: { fieldname: 'status', label: 'Estado' },
        valor: 'Overdue',
      },
      destinatarios: {
        roles: [{ role: 'Accounts Manager', label: 'Gerente de cuentas' }],
        dueno: true,
        campo: null,
      },
      canal: 'System Notification',
      asunto: '[Cliente] no ha pagado',
      mensaje: '',
    })
    expect(payload).toMatchObject({
      doctype: 'Sales Invoice',
      evento: 'Days After',
      campo: 'due_date',
      dias: 3,
      condicion: { campo: 'status', valor: 'Overdue' },
      destinatarios: { roles: ['Accounts Manager'], dueno: 1 },
      canal: 'System Notification',
    })
    expect(JSON.stringify(payload)).not.toMatch(/\{\{|\{%/)
    expect(
      datosAviso({ evento: 'New', destinatarios: {} }).dias,
    ).toBeUndefined()
  })
})

describe('Reglas de asignación', () => {
  it('says a rule as one sentence', () => {
    expect(
      fraseRegla({
        plural: 'las garantías',
        modo: 'Round Robin',
        usuarios: ['Ana', 'Beto'],
      }),
    ).toBe('Las garantías se reparten por turnos entre Ana y Beto')
    expect(
      fraseRegla({
        plural: 'las facturas',
        modo: 'Load Balancing',
        usuarios: ['Ana'],
        condicion: 'Estado es Vencida',
      }),
    ).toBe(
      'Las facturas cuando Estado es Vencida se reparten al que tenga menos pendientes entre Ana',
    )
    expect(
      fraseRegla({
        plural: 'los tratos',
        modo: 'Based on Field',
        campo: 'Vendedor',
      }),
    ).toBe('Los tratos se asignan a la persona de «Vendedor»')
  })
})

describe('Aprobaciones', () => {
  it('puts the filled action first and confirms with the next state', () => {
    const order = ordenAcciones([
      { accion: 'Reject', label: 'Rechazar', tono: 'danger' },
      { accion: 'Review', label: 'Revisar', tono: 'tonal' },
      { accion: 'Approve', label: 'Aprobar', tono: 'filled' },
    ])
    expect(order.map((a) => a.label)).toEqual([
      'Aprobar',
      'Revisar',
      'Rechazar',
    ])
    expect(
      copiaTransicion({ ...order[0], siguiente: 'Aprobada' }, 'Cliente prueba'),
    ).toEqual({
      title: '¿Aprobar?',
      message: '«Cliente prueba» quedará en «Aprobada».',
      confirm: 'Aprobar',
      tone: 'primary',
    })
    expect(copiaTransicion(order[0]).message).toBe(
      'El documento cambia de estado.',
    )
    expect(
      copiaTransicion({
        label: 'Rechazar',
        siguiente: 'Rechazada',
        tono: 'danger',
      }),
    ).toEqual({
      title: '¿Rechazar?',
      message: 'El documento quedará en «Rechazada».',
      confirm: 'Rechazar',
      tone: 'danger',
    })
    expect(copiaTransicion(null)).toBeNull()
  })
})

describe('calls', () => {
  it('reaches crm.api.automatizaciones with JSON for objects', async () => {
    await autoApi('crear_aviso', { datos: { doctype: 'Note' }, vacio: '' })
    expect(calls.at(-1)).toEqual([
      'crm.api.automatizaciones.crear_aviso',
      { datos: '{"doctype":"Note"}' },
    ])
  })

  it('shows the server’s Spanish reason, never a traceback', () => {
    expect(
      errorText({
        messages: ['Solo el dueño puede cambiar las automatizaciones.'],
      }),
    ).toBe('Solo el dueño puede cambiar las automatizaciones.')
    expect(errorText({ message: 'Traceback (most recent call last)' })).toMatch(
      /conexión/,
    )
    expect(errorText({ message: 'ValidationError' }, 'Otra vez')).toBe(
      'Otra vez',
    )
  })
})
