// «Tus datos»: the owner asks for a copy of the business data and downloads it
// as one zip of CSV files, over doco's data_export (the Mi plan roles, like the
// whole page). export_status says the latest export and whether a new one may
// start; request_export starts one (3 a day; a refusal names the next time);
// the file stays 7 days. While one is being prepared the block asks again
// every few seconds, and sooner when doco's realtime `doco_data_export` says it
// ended. Nothing is mailed: the file is downloaded here. The views are pure;
// createExport holds the block's state.
import { computed, ref } from 'vue'
import { errorText } from '@/utils/errorText'
import { exportDownloadPath, exportStatus, requestExport } from './api'

const t = (text, replace) => __(text, replace, 'Cuenta')

export const REALTIME_EVENT = 'doco_data_export'
// Every few seconds while it is prepared, then less often: a big shop's
// export can take many minutes, and the realtime event comes first anyway.
export const POLL_MS = 4000
export const SLOW_POLL_MS = 15000
export const FAST_POLL_FOR_MS = 120000

/**
 * The block as the owner reads it, from export_status (or null before the
 * first answer): `state` none | running | ready | failed | expired, the line
 * under the title, whether «Pedir mis datos» may go and the sentence that says
 * why not, and the download of a ready file.
 */
export function exportView(status) {
  const row = status?.export || null
  const state = row?.running
    ? 'running'
    : row?.ready
      ? 'ready'
      : row?.failed
        ? 'failed'
        : row?.expired
          ? 'expired'
          : 'none'
  const refusal =
    state !== 'running' && typeof status?.refusal === 'string'
      ? status.refusal
      : ''
  const canAsk = state !== 'running' && status?.can_request === true
  let line
  if (state === 'running')
    line = t(
      'It can take a few minutes. You can keep working; it shows here when it is ready.',
    )
  else if (state === 'ready')
    line =
      row.size_label && row.expires_label
        ? t('Ready: {0}. You can download it until {1}.', [
            row.size_label,
            row.expires_label,
          ])
        : t('Your copy is ready.')
  else if (state === 'failed')
    line =
      (typeof row.error === 'string' && row.error.trim()) ||
      t('We could not prepare your copy. Ask for it again.')
  else if (state === 'expired')
    line = t('Your last copy is no longer available. Ask for a new one.')
  else
    line = t(
      'Everything your business has in the system, in one zip of spreadsheet files (CSV).',
    )
  return {
    state,
    line,
    canAsk,
    refusal,
    askLabel:
      state === 'ready' || state === 'failed' || state === 'expired'
        ? t('Ask for a new copy')
        : t('Ask for my data'),
    download: state === 'ready' && row.name ? exportDownloadPath(row.name) : '',
  }
}

// A same-origin file link: the browser saves it, the page stays (no new tab).
function saveFile(url) {
  const link = document.createElement('a')
  link.href = url
  link.download = ''
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

/**
 * The block's state: the first read, «Pedir mis datos», the follow-up while
 * it runs, the download. `listen(event, fn)` binds the realtime event and
 * returns its unbind; without it the block only polls. `readError` says a
 * read failed; `askError` what refused «Pedir mis datos» (the daily limit's
 * sentence among them).
 */
export function createExport({
  status = exportStatus,
  request = requestExport,
  save = saveFile,
  listen = null,
  // Wrapped: a browser's setTimeout called as `timers.set()` throws «Illegal invocation».
  timers = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (id) => clearTimeout(id),
  },
  now = () => Date.now(),
} = {}) {
  const data = ref(null)
  const loaded = ref(false)
  const loading = ref(false)
  const asking = ref(false)
  const readError = ref('')
  const askError = ref('')
  const view = computed(() => exportView(data.value))
  let timer = 0
  let runningSince = null
  let disposed = false
  // Only the latest read lands: one started before «Pedir mis datos» answered
  // must not put the block back to «Pedir».
  let seq = 0

  function stopPoll() {
    if (timer) timers.clear(timer)
    timer = 0
  }
  function schedule() {
    stopPoll()
    if (disposed || view.value.state !== 'running') {
      runningSince = null
      return
    }
    if (runningSince === null) runningSince = now()
    const wait =
      now() - runningSince < FAST_POLL_FOR_MS ? POLL_MS : SLOW_POLL_MS
    timer = timers.set(() => {
      timer = 0
      load()
    }, wait)
  }

  /** Reads export_status. */
  async function load() {
    const mine = ++seq
    stopPoll()
    loading.value = true
    try {
      const out = await status()
      if (disposed || mine !== seq) return
      if (out && typeof out === 'object') data.value = out
      readError.value = ''
    } catch (e) {
      if (disposed || mine !== seq) return
      readError.value = errorText(
        e,
        t('We could not check your copy of the data. Try again.'),
      )
    } finally {
      if (!disposed && mine === seq) {
        loading.value = false
        loaded.value = true
        schedule()
      }
    }
  }

  /** «Pedir mis datos»: one export at a time; the daily limit says its sentence. */
  async function ask() {
    if (asking.value || view.value.state === 'running') return
    asking.value = true
    askError.value = ''
    try {
      const out = await request()
      if (disposed) return
      if (out?.export)
        data.value = { ...(data.value || {}), export: out.export }
    } catch (e) {
      if (disposed) return
      askError.value = errorText(
        e,
        t('We could not ask for your copy. Try again in a moment.'),
      )
    }
    // can_request and the next allowed time come with the status.
    try {
      await load()
    } finally {
      asking.value = false
    }
  }

  /**
   * From the cancel sheet: a copy being prepared or ready is shown as it is;
   * otherwise one is asked for when the day's limit allows it.
   */
  async function start() {
    if (!loaded.value) await load()
    const current = view.value
    if (current.state === 'running' || current.state === 'ready') return
    if (current.canAsk) await ask()
  }

  function download() {
    if (view.value.download) save(view.value.download)
  }

  const unbind =
    typeof listen === 'function'
      ? listen(REALTIME_EVENT, () => {
          if (!disposed) load()
        })
      : null

  function dispose() {
    disposed = true
    stopPoll()
    if (typeof unbind === 'function') unbind()
  }

  return {
    data,
    loaded,
    loading,
    asking,
    readError,
    askError,
    view,
    load,
    ask,
    start,
    download,
    dispose,
  }
}
