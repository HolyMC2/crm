const RELATIONSHIPS = new Set(['Patient', 'Guardian', 'Payer'])
const ACTIONS = new Set([
  'link_patient',
  'register_patient',
  'unlink_patient',
  'book_appointment',
])

export function clinicContext(value) {
  if (
    value?.schemaVersion !== 1 ||
    typeof value.version !== 'string' ||
    !value.version ||
    !Array.isArray(value.links) ||
    value.links.length > 20 ||
    !Array.isArray(value.appointments) ||
    value.appointments.length > 20 ||
    !Array.isArray(value.actions)
  ) {
    throw Object.assign(new Error('Invalid clinic context'), {
      code: 'provider_unavailable',
    })
  }
  const text = (value, limit = 200) =>
    typeof value === 'string' && value.length <= limit
  if (
    value.links.some(
      (row) =>
        !row ||
        !text(row.id, 140) ||
        !row.id ||
        !text(row.label) ||
        !RELATIONSHIPS.has(row.relationship),
    ) ||
    value.appointments.some(
      (row) =>
        !row ||
        !['id', 'link', 'start', 'end', 'status', 'label'].every((key) =>
          text(row[key]),
        ) ||
        !Number.isFinite(Date.parse(row.start)) ||
        !Number.isFinite(Date.parse(row.end)),
    )
  ) {
    throw Object.assign(new Error('Invalid clinic context'), {
      code: 'provider_unavailable',
    })
  }
  return {
    schemaVersion: 1,
    version: value.version,
    links: value.links.map(({ id, label, relationship }) => ({
      id,
      label,
      relationship,
    })),
    appointments: value.appointments.map(
      ({ id, link, start, end, status, label }) => ({
        id,
        link,
        start,
        end,
        status,
        label,
      }),
    ),
    actions: value.actions.filter((action) => ACTIONS.has(action)),
  }
}

export function clinicErrorCode(error) {
  const status = error?.status ?? error?.response?.status
  if (
    [401, 403, 404].includes(status) ||
    ['PermissionError', 'AuthenticationError', 'DoesNotExistError'].includes(
      error?.exc_type,
    )
  )
    return 'permission_denied'
  return error?.constraints?.[0]?.code || error?.code || 'network_error'
}

export function clearsClinicData(code) {
  return [
    'permission_denied',
    'relationship_unavailable',
    'provider_unavailable',
    'clinic_setup_required',
  ].includes(code)
}

export function clinicMessage(code) {
  return (
    {
      permission_denied:
        'El acceso a Clínica cambió. Se borraron los datos de este panel; solicita una revisión de permisos.',
      relationship_unavailable:
        'Este vínculo dejó de estar disponible. Actualiza el panel para revisar los vínculos autorizados.',
      provider_unavailable:
        'La conexión con Clínica necesita una revisión de configuración. Puedes continuar trabajando en CRM.',
      clinic_setup_required:
        'Falta completar la configuración de Clínica. Solicita una revisión a la administración.',
      stale_version:
        'Los vínculos cambiaron. Revisa la información actualizada y vuelve a confirmar; conservamos tu formulario.',
      relationship_conflict:
        'Este registro ya representa a otro paciente. Revisa los vínculos antes de continuar.',
      relationship_limit:
        'Este registro alcanzó el límite de vínculos. Revisa los existentes antes de agregar otro.',
      request_conflict:
        'Este intento ya se utilizó con otros datos. Actualiza y revisa el resultado antes de continuar.',
      possible_duplicate:
        'Puede existir un paciente con estos datos. Busca y verifica su identidad antes de registrar otro.',
      invalid_name: 'Revisa los nombres y apellidos.',
      invalid_dob: 'Elige una fecha de nacimiento válida, hasta hoy.',
      invalid_mobile:
        'Revisa el teléfono: 10 dígitos mexicanos o un número internacional con código de país.',
      invalid_sex: 'Selecciona una opción de sexo de la lista.',
      invalid_input: 'Revisa los datos del formulario antes de continuar.',
      intake_unavailable:
        'El registro de pacientes requiere una revisión de configuración. Puedes vincular un paciente existente.',
      operation_rejected:
        'No se pudo completar la acción. Revisa los datos y permisos; conservamos tu formulario.',
    }[code] ||
    'No pudimos confirmar el resultado. Conservamos tu formulario; reintenta la misma acción para comprobarlo.'
  )
}

export function bookingRoute(link) {
  return `/clinica#crm-link=${encodeURIComponent(link)}`
}

// One request identity per unchanged submitted action. Version is deliberately
// excluded: a stale-version refresh can retry the same intent safely.
export function retryIdentity(uuid = () => crypto.randomUUID()) {
  let previous = null
  return {
    for(action, payload) {
      const signature = JSON.stringify([action, payload])
      if (previous?.signature !== signature)
        previous = { signature, id: uuid() }
      return previous.id
    },
    clear() {
      previous = null
    },
  }
}
