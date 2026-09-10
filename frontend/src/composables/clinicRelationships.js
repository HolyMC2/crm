import { onScopeDispose, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import {
  clinicContext,
  clinicErrorCode,
  clearsClinicData,
  retryIdentity,
} from '@/utils/clinicRelationships'

const PROVIDER = 'clinica:clinic'

export function useClinicRelationships(entity) {
  const context = ref(null)
  const loading = ref(false)
  const busy = ref(false)
  const errorCode = ref('')
  const cleared = ref(0)
  const candidates = ref([])
  const searching = ref(false)
  const options = ref(null)
  const identity = retryIdentity()
  let epoch = 0
  let read = 0
  let search = 0
  let disposed = false

  const clear = () => {
    epoch++
    read++
    search++
    context.value = null
    candidates.value = []
    options.value = null
    loading.value = busy.value = searching.value = false
    identity.clear()
    cleared.value++
  }
  const fail = (error) => {
    const code = clinicErrorCode(error)
    if (clearsClinicData(code)) clear()
    errorCode.value = code
    return code
  }
  const refresh = async () => {
    if (busy.value || disposed) return
    const record = entity()
    if (!record?.name) return
    const current = epoch
    const request = ++read
    loading.value = true
    try {
      const result = await call('doco.crm.api.context', {
        provider: PROVIDER,
        entity: record,
      })
      if (disposed || current !== epoch || request !== read) return
      if (result?.constraints) return fail(result)
      context.value = clinicContext(result)
      errorCode.value = ''
    } catch (error) {
      if (!disposed && current === epoch && request === read) fail(error)
    } finally {
      if (current === epoch && request === read) loading.value = false
    }
  }
  const execute = async (action, payload) => {
    if (busy.value || disposed || !context.value?.actions.includes(action))
      return false
    const current = epoch
    const record = entity()
    const request_id = identity.for(action, payload)
    read++ // A read begun before this mutation must never overwrite its result.
    loading.value = false
    busy.value = true
    errorCode.value = ''
    let stale = false
    try {
      const result = await call('doco.crm.api.execute', {
        provider: PROVIDER,
        entity: record,
        action,
        payload,
        version: context.value.version,
        request_id,
      })
      if (disposed || current !== epoch) return false
      if (result?.constraints) {
        stale = fail(result) === 'stale_version'
        return false
      }
      context.value = clinicContext(result?.context)
      identity.clear()
      return true
    } catch (error) {
      if (!disposed && current === epoch) fail(error)
      return false
    } finally {
      if (current === epoch) busy.value = false
      if (stale && !disposed && current === epoch) {
        await refresh()
        if (context.value) errorCode.value = 'stale_version'
      }
    }
  }
  const findPatients = async (text) => {
    const request = ++search
    candidates.value = []
    if (
      !context.value ||
      !context.value.actions.includes('link_patient') ||
      text.trim().length < 2
    )
      return
    const current = epoch
    searching.value = true
    try {
      const result = await call('clinica.api.patients', {
        text: text.trim().slice(0, 80),
      })
      if (disposed || current !== epoch || request !== search) return
      if (result?.constraints) return fail(result)
      if (!Array.isArray(result)) return fail({ code: 'provider_unavailable' })
      candidates.value = result
        .slice(0, 20)
        .filter(
          (row) =>
            typeof row?.name === 'string' &&
            typeof row.patient_name === 'string',
        )
        .map(({ name, patient_name }) => ({ name, patient_name }))
      errorCode.value = ''
    } catch (error) {
      if (!disposed && current === epoch && request === search) fail(error)
    } finally {
      if (current === epoch && request === search) searching.value = false
    }
  }
  const loadOptions = async () => {
    if (options.value) return options.value
    const current = epoch
    try {
      const result = await call('clinica.api.bootstrap')
      if (disposed || current !== epoch) return null
      if (result?.constraints) {
        fail(result)
        return null
      }
      if (!result?.canCreatePatient || !Array.isArray(result.sexes)) {
        errorCode.value = 'intake_unavailable'
        return null
      }
      options.value = {
        timeZone: result.timeZone,
        sexes: result.sexes
          .filter(
            (row) =>
              typeof row?.value === 'string' && typeof row.label === 'string',
          )
          .map(({ value, label }) => ({ value, label })),
      }
      return options.value
    } catch (error) {
      if (!disposed && current === epoch) fail(error)
      return null
    }
  }
  const stop = watch(
    () => JSON.stringify(entity()),
    () => {
      clear()
      errorCode.value = ''
      refresh()
    },
    { immediate: true },
  )
  const visible = () => {
    if (document.visibilityState !== 'hidden') refresh()
  }
  window.addEventListener('focus', visible)
  document.addEventListener('visibilitychange', visible)
  const interval = setInterval(visible, 60_000)
  onScopeDispose(() => {
    disposed = true
    stop()
    clear()
    clearInterval(interval)
    window.removeEventListener('focus', visible)
    document.removeEventListener('visibilitychange', visible)
  })
  return {
    context,
    loading,
    busy,
    errorCode,
    cleared,
    candidates,
    searching,
    options,
    refresh,
    execute,
    findPatients,
    loadOptions,
  }
}
