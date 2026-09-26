import { computed, onScopeDispose, reactive, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import { registerRepairNavigationGuard } from '@/utils/repairNavigationGuard'
import { emptyRepair, repairError, repairPayload } from '@/utils/repairOrders'
import {
  repairActorKey,
  readRepairReceipt,
  saveRepairReceipt,
  clearRepairReceipt,
} from '@/utils/repairRecovery'

const CONTEXT = 'taller.repair.repair_orders.get_deal_repair_context'
const CREATE = 'taller.repair.repair_orders.create_and_link_repair_order'
const RESOLVE = 'taller.repair.repair_orders.resolve_deal_repair_request'

export function useRepairOrders(
  deal,
  { initiallyOpen = false, onCreated = () => {} } = {},
) {
  const sessions = reactive(new Map())
  const state = ref(null)
  let disposed = false
  const actor = repairActorKey()
  let actorChanged = false
  function session(name) {
    if (!sessions.has(name)) {
      const draft = emptyRepair()
      sessions.set(
        name,
        ref({
          deal: name,
          context: null,
          loading: true,
          loadError: '',
          read: 0,
          showForm: initiallyOpen,
          draft,
          baseline: JSON.stringify(draft),
          creating: false,
          intent: null,
          createError: '',
          createdName: '',
          notice: '',
          resolving: false,
          recoveryOnly: false,
          recoveryError: '',
          allowStoredLeave: false,
        }).value,
      )
      const s = sessions.get(name)
      try {
        const receipt = readRepairReceipt(name, actor)
        if (receipt) {
          s.intent = { deal_name: name, client_uuid: receipt.client_uuid }
          s.recoveryOnly = true
          s.showForm = true
        }
      } catch (error) {
        s.recoveryError = repairError(error)
      }
    }
    return sessions.get(name)
  }
  const dirty = computed(() =>
    [...sessions.values()].some((s) => JSON.stringify(s.draft) !== s.baseline),
  )
  const pending = computed(() =>
    [...sessions.values()].some(
      (s) => s.creating || s.resolving || (s.intent && !s.allowStoredLeave),
    ),
  )
  const otherPending = computed(() =>
    [...sessions.values()].filter(
      (s) => s !== state.value && (s.creating || s.intent),
    ),
  )
  function sameActor() {
    if (!actorChanged && actor === repairActorKey()) return true
    actorChanged = true
    for (const s of sessions.values()) {
      ++s.read
      s.context = null
      s.draft = emptyRepair()
      s.baseline = JSON.stringify(s.draft)
      s.intent = null
      s.creating = s.resolving = false
      s.createdName = s.notice = s.createError = ''
      s.loadError =
        'La sesión cambió. Vuelve a abrir el trato con tu usuario actual.'
      s.loading = false
      s.recoveryError = s.loadError
    }
    return false
  }
  function persist(s) {
    try {
      saveRepairReceipt(s.deal, s.intent.client_uuid, actor)
      s.recoveryError = ''
      return true
    } catch (error) {
      s.recoveryError =
        'No se pudo guardar la referencia pendiente. Conserva esta ventana abierta. ' +
        repairError(error)
      return false
    }
  }
  function acknowledge(s, name) {
    s.notice = s.createError = ''
    try {
      clearRepairReceipt(s.deal, actor)
    } catch {
      s.notice =
        'Resultado confirmado; no se pudo limpiar la referencia local. La próxima consulta volverá a verificarla.'
    }
    s.intent = null
    s.recoveryOnly = false
    s.recoveryError = ''
    s.allowStoredLeave = false
    s.createdName = name
    s.showForm = false
    s.draft = emptyRepair(s.context?.defaults)
    s.baseline = JSON.stringify(s.draft)
    if (state.value === s) onCreated(name)
  }
  async function resolve(s = state.value) {
    if (!sameActor() || !s?.intent || s.creating || s.resolving || disposed)
      return false
    s.resolving = true
    s.createError = ''
    try {
      const response = await call(RESOLVE, {
        deal_name: s.deal,
        client_uuid: s.intent.client_uuid,
      })
      if (disposed || !sameActor()) return false
      if (
        response?.status === 'created' &&
        typeof response.name === 'string' &&
        response.name
      ) {
        acknowledge(s, response.name)
        await refresh(s)
        return true
      }
      s.createError =
        'Todavía no se confirmó la reparación. Conservamos la misma referencia; no se creará otra solicitud.'
      return false
    } catch (error) {
      if (!disposed && sameActor())
        s.createError =
          'No se pudo consultar el resultado. ' + repairError(error)
      return false
    } finally {
      s.resolving = false
    }
  }
  function saveForLater(s = state.value) {
    if (!sameActor() || s.creating || s.resolving || !s.intent || !persist(s))
      return false
    s.allowStoredLeave = true
    // Acknowledged leaving drops sensitive data but keeps only the server lookup
    // identity. It cannot be turned into a new create command after remount.
    s.recoveryOnly = true
    s.intent = { deal_name: s.deal, client_uuid: s.intent.client_uuid }
    s.draft = emptyRepair(s.context?.defaults)
    s.baseline = JSON.stringify(s.draft)
    s.notice =
      'Referencia pendiente guardada para tu usuario en esta pestaña. La reparación sigue sin confirmar; al volver consultaremos el resultado.'
    return true
  }
  const currency = computed(() => {
    const s = state.value
    const selected = s?.context?.laboratorios?.find(
      (row) => row.name === s.draft.laboratorio,
    )
    if (selected) return selected.currency || null
    return s?.draft.laboratorio === s?.context?.defaults?.laboratorio
      ? s?.context?.currency || null
      : null
  })
  async function refresh(s = state.value) {
    if (!sameActor() || !s?.deal || s.creating || disposed) return
    const request = ++s.read
    s.loading = true
    s.context = null
    s.loadError = ''
    try {
      if (s.recoveryError && !s.intent) {
        const receipt = readRepairReceipt(s.deal, actor)
        s.recoveryError = ''
        if (receipt) {
          s.intent = { deal_name: s.deal, client_uuid: receipt.client_uuid }
          s.recoveryOnly = true
          s.showForm = true
        }
      }
      const response = await call(CONTEXT, { deal_name: s.deal })
      if (disposed || !sameActor() || request !== s.read) return
      if (
        !response ||
        !Array.isArray(response.orders) ||
        typeof response.can_create !== 'boolean'
      )
        throw new Error(
          'La respuesta del Taller no está disponible. Reintenta la consulta.',
        )
      s.context = response
      if (!s.intent && JSON.stringify(s.draft) === s.baseline) {
        s.draft = emptyRepair(response.defaults)
        s.baseline = JSON.stringify(s.draft)
      }
    } catch (error) {
      if (!disposed && sameActor() && request === s.read)
        s.loadError = repairError(error)
    } finally {
      if (!disposed && request === s.read) s.loading = false
    }
  }
  function toggleForm() {
    const s = state.value
    if (!sameActor()) return false
    if (s.creating || s.resolving || s.intent) {
      s.createError =
        'Confirma el resultado reintentando la misma solicitud antes de cerrar.'
      return false
    }
    if (
      s.showForm &&
      JSON.stringify(s.draft) !== s.baseline &&
      !window.confirm('¿Descartar los datos de esta reparación?')
    )
      return false
    if (s.showForm) {
      s.draft = emptyRepair(s.context?.defaults)
      s.baseline = JSON.stringify(s.draft)
      s.createError = ''
    }
    s.showForm = !s.showForm
    return true
  }
  async function createFor(s) {
    if (
      !sameActor() ||
      s.creating ||
      s.resolving ||
      s.recoveryOnly ||
      (s.recoveryError && !s.intent) ||
      (!s.intent && !s.context?.can_create) ||
      disposed
    )
      return false
    s.createError = ''
    const retrying = !!s.intent
    let created = false
    if (!s.intent) {
      try {
        s.intent = {
          ...repairPayload(s.deal, s.draft),
          client_uuid: crypto.randomUUID(),
        }
      } catch (error) {
        s.createError = repairError(error)
        return false
      }
    }
    persist(s)
    s.allowStoredLeave = false
    s.creating = true
    s.createdName = ''
    ++s.read
    try {
      const name = await call(CREATE, { ...s.intent })
      if (disposed || !sameActor()) return false
      if (typeof name !== 'string' || !name)
        throw new Error('Respuesta de creación no confirmada.')
      created = true
      s.notice = ''
      acknowledge(s, name)
      return true
    } catch (error) {
      if (disposed || !sameActor()) return false
      const rejected =
        !retrying &&
        ['ValidationError', 'PermissionError', 'MandatoryError'].includes(
          error?.exc_type,
        )
      // A confirmed rolled-back rejection permits an edited new command. A timeout
      // or command conflict retains its exact identity; it never becomes another RO.
      if (rejected) {
        try {
          clearRepairReceipt(s.deal, actor)
        } catch {
          /* Confirmed rejection has no server effect; stale receipt remains lookup-only after reload. */
        }
        s.intent = null
      }
      s.createError = rejected
        ? repairError(error)
        : `No pudimos confirmar el resultado. Reintenta la misma solicitud. ${repairError(error)}`
      return false
    } finally {
      s.creating = false
      if (!disposed && created) await refresh(s)
    }
  }
  const create = () => createFor(state.value)
  const retryPending = (name) => {
    const s = sessions.get(name)
    return s?.intent ? (s.recoveryOnly ? resolve(s) : createFor(s)) : false
  }
  function canLeave() {
    if (!sameActor()) return true
    if (pending.value) {
      state.value.notice =
        'Hay una creación pendiente de confirmar. Reintenta la misma solicitud antes de salir.'
      return false
    }
    if (!dirty.value) return true
    if (!window.confirm('¿Descartar el borrador de reparación y salir?'))
      return false
    for (const s of sessions.values()) {
      s.draft = emptyRepair(s.context?.defaults)
      s.baseline = JSON.stringify(s.draft)
    }
    return true
  }
  watch(
    deal,
    (name) => {
      const current = session(name)
      state.value = current
      refresh(current).then(() => {
        if (current.intent && current.recoveryOnly && !disposed && sameActor())
          resolve(current)
      })
    },
    { immediate: true },
  )
  const unregisterGuard = registerRepairNavigationGuard(canLeave)
  window.addEventListener('focus', sameActor)
  onScopeDispose(() => {
    unregisterGuard()
    window.removeEventListener('focus', sameActor)
    disposed = true
    sessions.clear()
  })
  return {
    state,
    dirty,
    pending,
    otherPending,
    retryPending,
    resolve,
    saveForLater,
    currency,
    refresh,
    toggleForm,
    create,
    canLeave,
  }
}
