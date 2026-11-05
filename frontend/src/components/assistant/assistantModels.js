// The composer's model picker (doco assistant/model_choice.py through
// shell_api.models / model_set): which brain answers THIS conversation. Every
// conversation starts on the site default; a pick lasts until «Nueva
// conversación». The list is the one the owner published; staff choose only
// when the owner allows it, and then the picker shows the current model and
// the reason instead of a menu. A server without the endpoints hides it.
import { reactive } from 'vue'
import { call } from 'frappe-ui'
import { ASSISTANT_API } from './assistantDoor'

export const models = reactive({
  available: false,
  canChoose: false,
  /** why the person may not choose (the server's es-MX sentence) */
  message: '',
  chosen: false,
  current: { model: '', effort: '', label: '' },
  defaults: { model: '', effort: '' },
  list: [],
  busy: false,
  error: '',
})

/** Effort levels in the server's ladder → the worker's words. */
export function effortLabel(effort) {
  return (
    {
      off: __('No reasoning'),
      low: __('Low'),
      medium: __('Medium'),
      high: __('High'),
      xhigh: __('Very high'),
      max: __('Maximum'),
    }[effort] || ''
  )
}

/** «Claude Haiku 5.5» → «Haiku 5.5»: the chip has room for little. */
export function shortLabel(label) {
  return String(label || '').replace(/^claude\s+/i, '')
}

function take(out) {
  if (!out) return
  Object.assign(models, {
    available: true,
    canChoose: Boolean(out.can_choose),
    message: out.message || '',
    chosen: Boolean(out.chosen),
    current: {
      model: out.current?.model || '',
      effort: out.current?.effort || '',
      label: out.current?.label || out.current?.model || '',
    },
    defaults: {
      model: out.default?.model || '',
      effort: out.default?.effort || '',
    },
    list: out.models || [],
  })
}

function errorText(error) {
  const message = error?.messages?.[0] || error?.message || ''
  return message && !/^\s*</.test(message)
    ? String(message)
    : __('Muelle did not answer. Check your connection and try again.')
}

export async function loadModels() {
  try {
    take(await call(`${ASSISTANT_API}.models`))
  } catch {
    // an older doco without shell_api.models: no picker
    models.available = false
  }
}

async function change(args) {
  if (models.busy) return false
  models.busy = true
  models.error = ''
  try {
    take(await call(`${ASSISTANT_API}.model_set`, args))
    return true
  } catch (error) {
    models.error = errorText(error)
    return false
  } finally {
    models.busy = false
  }
}

/** The pick for this conversation; an effort the model lacks falls back to its first. */
export function selectModel(model, effort) {
  const entry = models.list.find((m) => m.model === model)
  if (!entry) return Promise.resolve(false)
  const efforts = entry.efforts || []
  const wanted = effort || models.current.effort || models.defaults.effort
  return change({
    model,
    effort: efforts.includes(wanted) ? wanted : efforts[0],
  })
}

export function resetModel() {
  return change({ reset: 1 })
}

/** Tests only. */
export function _resetModels() {
  Object.assign(models, {
    available: false,
    canChoose: false,
    message: '',
    chosen: false,
    current: { model: '', effort: '', label: '' },
    defaults: { model: '', effort: '' },
    list: [],
    busy: false,
    error: '',
  })
}
