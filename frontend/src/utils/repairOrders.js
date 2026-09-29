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

// Taller owns repair intake. The CRM hands the operator to /taller/intake with the
// Deal and a CRM-only return path; taller prefills from the Deal server-side, links
// the new Repair Order and offers «Volver al trato».
export function tallerIntakeHref(deal, fullPath) {
  if (typeof deal !== 'string' || !deal) return null
  const back = repairReturnPath(deal, fullPath)
  return `/taller/intake?deal=${encodeURIComponent(deal)}&return=${encodeURIComponent(back)}`
}

// Same tab (assign keeps the CRM page in history so Back returns to it).
export function goToTallerIntake(href) {
  if (href) window.location.assign(href)
}
