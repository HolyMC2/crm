import { ref } from 'vue'
import { call } from 'frappe-ui'

// What the server tells the desktop top bar about the worker's own things,
// only while one is off (crm.api.shell.bar_status): `caja`, the POS shift
// they left open from an earlier day. Read a moment after the shell opens and
// again when the worker comes back to the tab (a caja closed in the POS leaves).

export const BAR_STATUS_GAP_MS = 30_000

/** {caja: {name, pos_profile, since} | null} */
export const barStatus = ref({ caja: null })
let readAt = 0
let reading = null

/** Reads again unless the last read is fresher than BAR_STATUS_GAP_MS. */
export function refreshBarStatus({ force = false } = {}) {
  if (reading) return reading
  if (!force && Date.now() - readAt < BAR_STATUS_GAP_MS)
    return Promise.resolve()
  readAt = Date.now()
  reading = call('crm.api.shell.bar_status')
    .then((found) => (barStatus.value = { caja: found?.caja || null }))
    .catch(() => {})
    .finally(() => (reading = null))
  return reading
}

/** Tests: start from a clean slate. */
export function resetBarStatusForTests() {
  barStatus.value = { caja: null }
  readAt = 0
  reading = null
}
