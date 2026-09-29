import { onScopeDispose, reactive, watch } from 'vue'
import { call } from 'frappe-ui'
import { money } from '@/utils/numberFormat'

// The Reports page filters every doco_marketing.api.reports endpoint accepts.
// Company is a Sales-only dimension and is never sent here.
const MARKETING_FILTERS = ['from_date', 'to_date', 'owner', 'pipeline']

export function marketingFilters(filters) {
  return Object.fromEntries(
    MARKETING_FILTERS.filter((key) => filters?.[key]).map((key) => [
      key,
      filters[key],
    ]),
  )
}

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
// `list: true` asks a list endpoint for its filter/currency envelope
// (`with_meta`); `data` stays the row list and `meta` holds the rest.
export function useMarketingResource(method, params, { list = false } = {}) {
  const state = reactive({ data: null, meta: null, loading: true, error: '' })
  let request = 0
  async function reload() {
    const id = ++request
    state.loading = true
    state.error = ''
    state.data = null
    state.meta = null
    try {
      const data = await call(
        method,
        list ? { ...params(), with_meta: 1 } : params(),
      )
      if (id !== request) return
      if (list && data && !Array.isArray(data)) {
        const { rows, ...meta } = data
        state.data = rows || []
        state.meta = meta
      } else {
        state.data = data
        state.meta = list ? null : data
      }
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

const filterLabels = () => ({
  period: __('periodo'),
  owner: __('responsable'),
  pipeline: __('pipeline'),
})

function filterNames(keys) {
  const labels = filterLabels()
  return [
    ...new Set(
      keys.map((key) =>
        key === 'from_date' || key === 'to_date' ? 'period' : key,
      ),
    ),
  ].map((key) => labels[key] || key)
}

// Human note for the filters a response says it could not apply, overall
// (`ignored_filters`) and per metric (`metric_filters`, labelled by `metrics`).
export function scopeNote(meta, metrics = {}) {
  if (!meta) return ''
  const notes = []
  const ignored = meta.ignored_filters || []
  if (ignored.length)
    notes.push(__('Sin efecto aquí: {0}.', [filterNames(ignored).join(', ')]))
  const requested = [...(meta.applied_filters || [])]
  const byMissing = new Map()
  for (const [metric, keys] of Object.entries(meta.metric_filters || {})) {
    if (!metrics[metric]) continue
    const missing = filterNames(requested.filter((key) => !keys.includes(key)))
    if (!missing.length) continue
    const label = missing.join(', ')
    byMissing.set(label, [...(byMissing.get(label) || []), metrics[metric]])
  }
  for (const [missing, labels] of byMissing)
    notes.push(
      __('{0} no aplica a: {1}.', [missing, [...new Set(labels)].join(', ')]),
    )
  return notes.join(' ')
}

// The drill behind one number of a row, if the server offered one.
export function drillFor(row, key) {
  const drill = row?.drills?.[key] ?? (key === 'value' ? row?.drill : null)
  return drill && typeof drill.doctype === 'string' ? drill : null
}

// Money in the row's own currency; mixed-currency rows list each amount.
export function moneyText(row, key, currency = null) {
  const mixed = row?.currency === null && row?.amounts_by_currency?.[key]
  if (mixed && Object.keys(mixed).length)
    return Object.entries(mixed)
      .map(([code, amount]) => money(amount, code || currency))
      .join(' + ')
  return money(row?.[key] ?? 0, row?.currency || currency || null)
}

export function sourceRows(data) {
  function normalize(value) {
    const rows = Array.isArray(value) ? value : value?.data || []
    const result = new Map()
    for (const row of rows) {
      const name = row.name || row.source || row.label || row[0]
      if (!name) continue
      const seen = result.get(name)
      result.set(name, {
        count:
          (seen?.count || 0) + Number(row.value ?? row.count ?? row[1] ?? 0),
        // Two server rows under one label cannot share one exact drill.
        drill: seen ? null : drillFor(row, 'value'),
      })
    }
    return result
  }
  const leads = normalize(data?.leads_by_source)
  const deals = normalize(data?.deals_by_source)
  return [...new Set([...leads.keys(), ...deals.keys()])]
    .map((name) => ({
      name,
      leads: leads.get(name)?.count || 0,
      deals: deals.get(name)?.count || 0,
      drills: {
        leads: leads.get(name)?.drill || null,
        deals: deals.get(name)?.drill || null,
      },
    }))
    .sort((a, b) => b.leads - a.leads)
}
