import { call } from 'frappe-ui'

// Hoy is the landing page: its one read starts while the shell boot is still
// in flight (router beforeEnter), and the page takes it when it mounts.
let pending = null

export function prefetchHoy() {
  if (!pending) {
    pending = call('crm.api.hoy.page')
    // Taken or not, a failed prefetch never surfaces on its own.
    pending.catch(() => {})
  }
}

/** The prefetched read, once; null when none is waiting. */
export function takeHoy() {
  const taken = pending
  pending = null
  return taken
}
