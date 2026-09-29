import { onScopeDispose, reactive, watch } from 'vue'
import { call } from 'frappe-ui'

export function marketingError(error) {
  const type = String(
    error?.exc_type || error?.exception || error?.message || '',
  )
  if (
    error?.httpStatus === 403 ||
    /PermissionError|Not permitted/i.test(type)
  ) {
    return __('No tienes permiso para consultar este bloque.')
  }
  return __('No se pudo cargar este bloque. Intenta de nuevo.')
}

// Each block owns its request, error and latest-response guard.
export function useMarketingResource(method, params) {
  const state = reactive({ data: null, loading: true, error: '' })
  let request = 0
  async function reload() {
    const id = ++request
    state.loading = true
    state.error = ''
    state.data = null
    try {
      const data = await call(method, params())
      if (id === request) state.data = data
    } catch (error) {
      if (id === request) state.error = marketingError(error)
    } finally {
      if (id === request) state.loading = false
    }
  }
  watch(() => JSON.stringify(params()), reload, { immediate: true })
  onScopeDispose(() => {
    request++
  })
  return Object.assign(state, { reload })
}

export function sourceRows(data) {
  function normalize(value) {
    const rows = Array.isArray(value) ? value : value?.data || []
    const result = new Map()
    for (const row of rows) {
      const name = row.name || row.source || row.label || row[0]
      if (!name) continue
      result.set(
        name,
        (result.get(name) || 0) + Number(row.value ?? row.count ?? row[1] ?? 0),
      )
    }
    return result
  }
  const leads = normalize(data?.leads_by_source)
  const deals = normalize(data?.deals_by_source)
  return [...new Set([...leads.keys(), ...deals.keys()])]
    .map((name) => ({
      name,
      leads: leads.get(name) || 0,
      deals: deals.get(name) || 0,
    }))
    .sort((a, b) => b.leads - a.leads)
}
