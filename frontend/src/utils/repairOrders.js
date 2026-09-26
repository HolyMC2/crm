// Intake state remains in memory: PINs, patterns and customer notes never enter storage.
export function emptyRepair(defaults = {}) {
  return {
    device_model: null,
    repair_to_be_done: null,
    falla_reportada: '',
    general_status: '',
    client: defaults.client || null,
    customer: defaults.customer || null,
    laboratorio: defaults.laboratorio || null,
    technician: null,
    imei: null,
    has_sim_tray: false,
    is_wet: false,
    turns_on: false,
    broken_screen: false,
    has_phone_case: false,
    unlock_method: 'none',
    phone_pin: '',
    phone_pattern: '',
    quote_amount: 0,
    advance_amount: 0,
  }
}

export function repairPayload(deal, draft) {
  const value = (input) =>
    input && typeof input === 'object' ? input.value : input
  if (!value(draft.device_model)) throw new Error('Device Model is required')
  if (!draft.falla_reportada?.trim())
    throw new Error('Falla reportada is required when creating a Repair Order.')
  const result = { deal_name: deal }
  for (const key of [
    'device_model',
    'repair_to_be_done',
    'client',
    'customer',
    'laboratorio',
    'technician',
    'imei',
  ])
    result[key] = value(draft[key]) || null
  result.falla_reportada = draft.falla_reportada.trim()
  result.general_status = draft.general_status || null
  for (const key of [
    'has_sim_tray',
    'is_wet',
    'turns_on',
    'broken_screen',
    'has_phone_case',
  ])
    result[key] = draft[key] ? 1 : 0
  result.phone_pin = draft.unlock_method === 'pin' ? draft.phone_pin || '' : ''
  result.phone_pattern =
    draft.unlock_method === 'pattern' ? draft.phone_pattern || '' : ''
  for (const key of ['quote_amount', 'advance_amount']) {
    result[key] = Number(draft[key] ?? 0)
    if (!Number.isFinite(result[key]) || result[key] < 0)
      throw new Error('Repair amounts must be valid nonnegative numbers')
  }
  return result
}

export function repairMoney(value, currency) {
  if (value === null || value === undefined || value === '') return '—'
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  if (!/^[A-Z]{3}$/.test(currency || ''))
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 6,
    }).format(amount)
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
  }).format(amount)
}

export function repairReturnPath(deal, fullPath) {
  const fallback = `/crm/deals/${encodeURIComponent(deal)}`
  if (
    typeof fullPath !== 'string' ||
    fullPath.length > 2048 ||
    [...fullPath].some((char) => char === '\\' || char.charCodeAt(0) < 32)
  )
    return fallback
  const publicPath = fullPath.startsWith('/crm/') ? fullPath : `/crm${fullPath}`
  try {
    const url = new URL(publicPath, 'https://crm.invalid')
    if (url.origin !== 'https://crm.invalid') return fallback
    const boundPaths = [fallback, `/crm/deal/${encodeURIComponent(deal)}`]
    if (url.pathname === '/crm/inbox') {
      // This producer runs only inside a mounted Deal repair panel. The legacy
      // queue keeps its actual selection in memory, so pin that verified context
      // rather than carrying an absent/stale selection or a conversation workspace.
      url.searchParams.set('deal', deal)
      url.searchParams.set('doctype', 'CRM Deal')
      url.searchParams.set('workspace', 'activity')
      url.searchParams.delete('conversation')
    } else if (!boundPaths.includes(url.pathname)) return fallback
    const result = url.pathname + url.search + url.hash
    return result.length <= 2048 ? result : fallback
  } catch {
    return fallback
  }
}

export function repairOrderHref(name, deal, fullPath) {
  const query = new URLSearchParams({
    crm_return_to: repairReturnPath(deal, fullPath),
  })
  return `/taller/orders/${encodeURIComponent(name)}?${query}`
}

export function repairError(error) {
  return (
    error?.messages?.join('\n') ||
    error?.message ||
    'No se pudo completar la solicitud.'
  )
}

export function repairIntakeDestination(name, redirect, requested) {
  if (!requested) return { ...redirect, params: { dealId: name } }
  return {
    name: 'Deal',
    params: { dealId: name },
    query: { ...redirect?.query, repair_intake: '1' },
    hash: '#data',
  }
}
