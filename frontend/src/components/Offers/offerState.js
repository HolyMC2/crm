import { onBeforeUnmount, reactive } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'

// Owned by the Deal page: switching tabs must not discard a proposal or command.
export function useOfferState() {
  const state = reactive({
    deal: '',
    offers: [],
    selected: null,
    draft: null,
    baseline: '',
    loading: false,
    busy: false,
    pending: null,
    error: '',
    reviewRequired: false,
    loadError: '',
    canCreate: false,
    erpAvailable: false,
    hasMore: false,
    total: 0,
    epoch: 0,
    decision: '',
    channel: 'Email',
    evidence: '',
    preview: '',
    erp: null,
    reviewNote: '',
  })
  const unsaved = () =>
    !!state.draft && JSON.stringify(state.draft) !== state.baseline
  function leave(event) {
    if (!state.busy && !state.pending && !unsaved()) return
    event.preventDefault()
    event.returnValue = ''
  }
  window.addEventListener('beforeunload', leave)
  onBeforeUnmount(() => window.removeEventListener('beforeunload', leave))
  const mayLeave = () => {
    if (state.busy || state.pending) return false
    return !unsaved() || window.confirm(__('Leave this unsaved offer draft?'))
  }
  onBeforeRouteLeave(mayLeave)
  onBeforeRouteUpdate(
    (to, from) => to.params.dealId === from.params.dealId || mayLeave(),
  )
  return state
}

export function draftValues(source = {}) {
  return {
    title: source.title || source.deal_name || '',
    currency: source.currency || '',
    valid_until: source.valid_until || '',
    terms: source.terms || '',
    products: (source.products || []).map((row) => ({
      product_code: row.product_code || '',
      product_name: row.product_name || '',
      qty: row.qty ?? 1,
      rate: row.rate ?? 0,
      discount_percentage: row.discount_percentage ?? 0,
    })),
  }
}
