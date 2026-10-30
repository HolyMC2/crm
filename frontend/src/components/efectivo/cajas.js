import { call } from 'frappe-ui'
import { errorText, oneInstruction } from './efectivo'

// Cajas in the shell: the stores and their registers that POS Awesome's
// register foundation manages (api/register_foundation). Reads are its scoped
// queries; every change is its command, with the same request ID, revision
// check, capability and audit event the POS cajas workspace sends.
const BASE = 'posawesome.posawesome.api.register_foundation'
const SAFES = 'posawesome.posawesome.api.cash_transfer.safes'
const SCHEMA = 1

export const listStores = () => call(`${BASE}.queries.list_stores`, {})
export const listCajas = (store, filter = 'all', search = '', cursor = null) =>
  call(`${BASE}.queries.list_registers`, {
    store: store || null,
    filter,
    search,
    cursor,
  })
export const cajaDetail = (register) =>
  call(`${BASE}.queries.register_detail`, { register })
export const setupOptions = (store) =>
  call(`${BASE}.queries.setup_options`, { store })
export const cajaActivity = (register, cursor = null) =>
  call(`${BASE}.cajas.activity`, { register, cursor, page_length: 10 })
/** The company's enabled POS Profiles, for a store's permitted profiles. */
export const companyProfiles = (company) =>
  call('frappe.client.get_list', {
    doctype: 'POS Profile',
    filters: { company, disabled: 0 },
    fields: ['name'],
    order_by: 'name asc',
    limit_page_length: 200,
  }).then((rows) => (rows || []).map((r) => r.name))

/**
 * One command at `method`: its request ID survives a retry after a lost
 * answer, so the server replays the committed result instead of acting twice.
 */
export function command(method) {
  const one = oneInstruction()
  return async (args) => {
    try {
      return await one.send((request_id) =>
        call(method, { ...args, request_id, schema_version: SCHEMA }),
      )
    } catch (error) {
      throw new Error(errorText(error), { cause: error })
    }
  }
}

export function createStore() {
  const send = command(`${BASE}.commands.create_store`)
  return (values) =>
    send({
      ...values,
      warehouses: JSON.stringify([]),
      profiles: JSON.stringify(values.profiles || []),
    })
}
export function updateStore() {
  const send = command(`${BASE}.commands.update_store`)
  return (store, values) =>
    send({
      store: store.name,
      expected_revision: store.revision,
      values: JSON.stringify(values),
    })
}
export function createCaja() {
  const send = command(`${BASE}.commands.create_register`)
  return (store, values) => send({ store, ...values })
}
export function configureCaja() {
  const send = command(`${BASE}.commands.configure_register`)
  return (caja, values) =>
    send({
      register: caja.name,
      expected_revision: caja.revision,
      values: JSON.stringify(values),
    })
}
export async function createDrawerAccount(store, pos_profile) {
  try {
    return await call(`${BASE}.commands.create_drawer_account`, {
      store,
      pos_profile,
      schema_version: SCHEMA,
    })
  } catch (error) {
    throw new Error(errorText(error), { cause: error })
  }
}

// Words ------------------------------------------------------------------

export const LIFECYCLE = {
  Draft: { label: 'Por configurar', tone: 'warning' },
  Ready: { label: 'Lista', tone: 'neutral' },
  Suspended: { label: 'Suspendida', tone: 'danger' },
  Retired: { label: 'Retirada', tone: 'neutral' },
}
export const lifecycle = (value) =>
  LIFECYCLE[value] || { label: value || '', tone: 'neutral' }

export const WORK_STATE = {
  Available: 'Sin turno abierto',
  Open: 'Turno abierto',
  Handover: 'En relevo',
  Closing: 'Cerrando turno',
  Recovery: 'Turno por recuperar',
}
export const ATTENTION = {
  recovery: 'Su turno quedó por recuperar',
  older_shift: 'Tiene abierto un turno de otro día',
  boundary_pending: 'Falta el conteo del cambio de día',
  day_review: 'Hay un día por cerrar en la tienda',
  pending_configuration: 'Tiene cambios para su próxima apertura',
  setup_incomplete: 'Falta configurarla',
}

/** What a caja still needs before it can open, in the worker's words (key → sentence). */
export const READINESS = {
  store_active: 'La tienda no está activa.',
  profile: 'Elige un perfil de POS activo.',
  profile_company: 'El perfil de POS es de otra empresa.',
  profile_store: 'Agrega este perfil de POS a los permitidos de la tienda.',
  drawer_account: 'Elige la cuenta de efectivo propia del cajón.',
  drawer_exclusive:
    'Otra caja, caja fuerte o forma de pago ya usa esa cuenta de efectivo. Elige o crea una propia.',
  custody:
    'Este perfil guarda su efectivo en una caja fuerte de una sola caja. Conviértela en caja fuerte de la tienda desde el POS.',
  route_change:
    'La cuenta del cajón cambió respecto a la que usaba el perfil. Otra persona supervisora debe aprobar el cambio.',
  device: 'Conecta el dispositivo de esta caja.',
  legacy_shifts:
    'Cierra los turnos que se abrieron en este perfil antes de que existiera la caja.',
}
export const readinessText = (item) =>
  READINESS[item?.key] || item?.message || ''

/** The row's second line: who has it open, or why it needs someone. */
export function cajaLine(caja, when = (v) => v) {
  const first = (caja.attention || []).find(
    (a) => ATTENTION[a] && a !== 'setup_incomplete',
  )
  if (caja.lifecycle !== 'Ready') {
    const state = lifecycle(caja.lifecycle).label
    return first ? `${state} · ${ATTENTION[first]}` : state
  }
  if (first) return ATTENTION[first]
  if (caja.opening_shift) {
    const who = caja.is_mine ? 'tú' : caja.cashier_name || 'alguien'
    return caja.opened_at
      ? `Abierta · ${who} desde ${when(caja.opened_at)}`
      : `Abierta · ${who}`
  }
  return caja.mode === 'Cashless' ? 'Disponible · sin efectivo' : 'Disponible'
}

export const FILTERS = [
  { value: 'all', label: 'Todas', key: 'total' },
  { value: 'attention', label: 'Por atender', key: 'attention' },
  { value: 'open', label: 'Abiertas', key: 'open' },
  { value: 'available', label: 'Disponibles' },
  { value: 'setup', label: 'Por configurar', key: 'setup' },
]

/** A caja's history in a sentence (`cajas.activity` event types). */
export const ACTIVITY = {
  'register.created': 'Creó la caja',
  'register.configured': 'Cambió su configuración',
  'register.lifecycle': 'Cambió su estado',
  'register.route_approved': 'Aprobó la cuenta nueva del cajón',
  'register.opened': 'Abrió turno',
  'register.closed': 'Cerró turno',
  'register.connectivity_changed': 'Cambió su conexión',
  'register.pointer_healed': 'El sistema corrigió su turno activo',
  'device.challenge_issued': 'Generó un código para conectar un dispositivo',
  'device.challenge_cancelled': 'Canceló un código de conexión',
  'device.bound': 'Conectó un dispositivo',
  'device.revoked': 'Desconectó un dispositivo',
}
const LIFECYCLE_VERB = {
  Ready: 'La activó',
  Suspended: 'La suspendió',
  Retired: 'La retiró',
  Draft: 'La regresó a configuración',
}
export function activityText(item) {
  if (item?.action === 'register.lifecycle' && item.details?.lifecycle)
    return LIFECYCLE_VERB[item.details.lifecycle] || ACTIVITY[item.action]
  return ACTIVITY[item?.action] || 'Movimiento de la caja'
}

// Steps (PasoSheet through StepHost) --------------------------------------

function lifecycleStep(caja, target, props, toast) {
  const send = command(`${BASE}.commands.set_register_lifecycle`)
  return {
    sheet: 'paso',
    props,
    submit: async (v) => ({
      ...(await send({
        register: caja.name,
        target,
        expected_revision: caja.revision,
        reason: v.reason || undefined,
      })),
      toast,
    }),
  }
}

/** Ready from Draft or Suspended: the server checks every requirement again. */
export const activateCaja = (caja) =>
  lifecycleStep(
    caja,
    'Ready',
    {
      title: `Activar ${caja.label}`,
      custody:
        'Queda lista para que una persona cajera abra turno en ella con su dispositivo.',
      confirmLabel: 'Activar caja',
    },
    'Caja activada',
  )

export const suspendCaja = (caja) =>
  lifecycleStep(
    caja,
    'Suspended',
    {
      title: `Suspender ${caja.label}`,
      custody:
        'Nadie puede abrir turno en ella hasta que la actives. Un turno abierto sigue hasta su cierre.',
      fields: [{ key: 'reason', label: 'Por qué se suspende', kind: 'reason' }],
      confirmLabel: 'Suspender caja',
      danger: true,
    },
    'Caja suspendida',
  )

export const retireCaja = (caja, guard = '') =>
  lifecycleStep(
    caja,
    'Retired',
    {
      title: `Retirar ${caja.label}`,
      custody:
        'Deja de aparecer en la tienda y no vuelve a abrir. Su historial y sus ventas se conservan.',
      guard,
      fields: [{ key: 'reason', label: 'Por qué se retira', kind: 'reason' }],
      confirmLabel: 'Retirar caja',
      danger: true,
    },
    'Caja retirada',
  )

export function approveRoute(caja) {
  const send = command(`${BASE}.commands.approve_route_change`)
  return {
    sheet: 'paso',
    props: {
      title: 'Aprobar la cuenta del cajón',
      message: `${caja.label} registra ahora su efectivo en otra cuenta, distinta de la que usaba su perfil.`,
      custody:
        'Desde su próxima apertura, el efectivo del cajón se registra en la cuenta nueva.',
      fields: [{ key: 'reason', label: 'Por qué se aprueba', kind: 'reason' }],
      confirmLabel: 'Aprobar cambio',
    },
    submit: async (v) => ({
      ...(await send({
        register: caja.name,
        expected_revision: caja.revision,
        reason: v.reason,
      })),
      toast: 'Cambio aprobado',
    }),
  }
}

async function challenge(args) {
  try {
    return await call(`${BASE}.commands.issue_device_challenge`, args)
  } catch (error) {
    throw new Error(errorText(error), { cause: error })
  }
}

/** A one-time code the new device types to become this caja's register. */
export function connectDevice(caja) {
  return {
    sheet: 'paso',
    props: {
      title: `Conectar un dispositivo a ${caja.label}`,
      custody:
        'Te damos un código de un solo uso. Escríbelo en el POS del dispositivo, en «Conectar este dispositivo», antes de que caduque.',
      confirmLabel: 'Generar código',
    },
    submit: async () => ({
      code: await challenge({ register: caja.name, purpose: 'Enroll' }),
    }),
  }
}

/** Replacing a device: the old one may hold unsent work, so it takes a reason and the password. */
export function replaceDevice(caja) {
  return {
    sheet: 'paso',
    props: {
      title: `Cambiar el dispositivo de ${caja.label}`,
      message: caja.device?.label
        ? `Ahora está conectado ${caja.device.label}.`
        : '',
      custody:
        'El dispositivo actual deja de vender en cuanto el nuevo se conecte con el código.',
      fields: [
        { key: 'reason', label: 'Por qué se cambia', kind: 'reason' },
        {
          key: 'acknowledge',
          label:
            'Entiendo que el dispositivo anterior puede tener ventas sin enviar.',
          kind: 'confirm',
        },
        {
          key: 'password',
          label: 'Tu contraseña',
          kind: 'password',
          hint: 'Firma el cambio de dispositivo.',
        },
      ],
      confirmLabel: 'Generar código',
      danger: true,
    },
    submit: async (v) => ({
      code: await challenge({
        register: caja.name,
        purpose: 'Replace',
        reason: v.reason,
        password: v.password,
        acknowledge_recovery: v.acknowledge ? 1 : 0,
      }),
    }),
  }
}

/** Link the caja to a store safe: its drops and floats go through that safe. */
export function linkSafe(caja, safe) {
  const send = command(`${SAFES}.link_register`)
  return {
    sheet: 'paso',
    props: {
      title: `Usar ${safe.title || safe.name}`,
      custody: `${caja.label} deja su efectivo en ${safe.title || safe.name} y recibe de ahí su fondo. Si tiene turno abierto, el cambio vale desde su próxima apertura.`,
      confirmLabel: 'Vincular caja fuerte',
    },
    submit: async () => ({
      ...(await send({
        safe: safe.name,
        register: caja.name,
        can_receive: 1,
        can_deposit: 1,
      })),
      toast: 'Caja fuerte vinculada',
    }),
  }
}

export function unlinkSafe(caja, link) {
  const send = command(`${SAFES}.unlink_register`)
  return {
    sheet: 'paso',
    props: {
      title: `Desvincular ${link.safe_title}`,
      custody: `${caja.label} deja de guardar su efectivo en ${link.safe_title}. Antes cierra su turno y termina sus traslados y bolsas.`,
      fields: [
        { key: 'reason', label: 'Por qué se desvincula', kind: 'reason' },
      ],
      confirmLabel: 'Desvincular',
      danger: true,
    },
    submit: async (v) => ({
      ...(await send({
        link: link.link,
        expected_revision: link.revision,
        reason: v.reason,
      })),
      toast: 'Caja fuerte desvinculada',
    }),
  }
}

/** Store: suspend (no new openings) or reactivate. */
export function storeStatus(store, status) {
  const send = command(`${BASE}.commands.set_store_status`)
  const suspend = status === 'Suspended'
  return {
    sheet: 'paso',
    props: {
      title: suspend
        ? `Suspender ${store.store_name}`
        : `Reactivar ${store.store_name}`,
      custody: suspend
        ? 'Ninguna de sus cajas puede abrir turno. Los turnos abiertos siguen hasta su cierre.'
        : 'Sus cajas listas pueden volver a abrir turno.',
      fields: [{ key: 'reason', label: 'Motivo', kind: 'reason' }],
      confirmLabel: suspend ? 'Suspender tienda' : 'Reactivar tienda',
      danger: suspend,
    },
    submit: async (v) => ({
      ...(await send({
        store: store.name,
        status,
        expected_revision: store.revision,
        reason: v.reason,
      })),
      toast: suspend ? 'Tienda suspendida' : 'Tienda reactivada',
    }),
  }
}
