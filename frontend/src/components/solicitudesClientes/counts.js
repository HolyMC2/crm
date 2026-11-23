// What waits in «Solicitudes de clientes» for this person, shared by the Ventas
// section (its badge, and whether it shows at all) and the page (a step reads
// it again). The cell answers null when the person reads no queue or the site
// has no online store (doco storefront_support_staff.counts); the rail's Ventas
// badge adds the same figure on the cell (hook muelle_rail_counts).
import { ref } from 'vue'
import { readCounts } from './api'

/** undefined: not read yet; null: no queue here; {count, urgent} */
export const solicitudesCounts = ref(undefined)
export const COUNTS_GAP_MS = 20000
let readAt = 0
let reading = null

/** Reads the counts again unless they are fresher than COUNTS_GAP_MS. */
export function refreshSolicitudesCounts({ force = false } = {}) {
  if (reading) return reading
  if (
    !force &&
    solicitudesCounts.value !== undefined &&
    Date.now() - readAt < COUNTS_GAP_MS
  )
    return Promise.resolve(solicitudesCounts.value)
  readAt = Date.now()
  try {
    reading = Promise.resolve(readCounts())
  } catch (error) {
    reading = Promise.reject(error)
  }
  reading = reading
    .then((answer) => {
      solicitudesCounts.value =
        answer && typeof answer === 'object' ? answer : null
      return solicitudesCounts.value
    })
    .catch(() => {
      // An older cell or a blip: a section never read stays hidden; one that
      // showed keeps its last figure until the next read.
      if (solicitudesCounts.value === undefined) solicitudesCounts.value = null
      return solicitudesCounts.value
    })
    .finally(() => (reading = null))
  return reading
}

/** The Ventas section shows only to whoever reads one of the queues. */
export const solicitudesShown = () => !!solicitudesCounts.value

/** The section's badge: what waits, 0 for nothing. */
export const solicitudesBadge = () =>
  Number(solicitudesCounts.value?.count) || 0

/** Tests: start from a clean slate. */
export function resetSolicitudesCountsForTests(value = undefined) {
  solicitudesCounts.value = value
  readAt = 0
  reading = null
}
