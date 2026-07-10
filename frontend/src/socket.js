import { io } from 'socket.io-client'
import { socketio_port } from '../../../../sites/common_site_config.json'
import { getCachedListResource, getCachedResource } from 'frappe-ui'

export function initSocket() {
  let host = window.location.hostname
  let siteName = window.site_name
  let port = window.location.port ? `:${socketio_port}` : ''
  let protocol = port ? 'http' : 'https'
  let url = `${protocol}://${host}${port}/${siteName}`

  // No reconnectionAttempts cap: the old `5` meant a laptop-sleep / long network
  // blip permanently killed realtime for the tab (socket.io stops retrying after
  // the cap) — every message after that needed an F5. Retry forever (default),
  // with capped backoff so a down server isn't hammered.
  let socket = io(url, {
    withCredentials: true,
    reconnectionDelayMax: 30000,
  })
  // Any gap in connectivity is a window where events were silently lost. Announce
  // recovery so data owners (inbox, threads) can refetch and catch up — socket.io's
  // `recovered` flag marks server-side session recovery with no missed packets.
  socket.on('disconnect', () => {
    socket._hadDrop = true
  })
  socket.io.on('reconnect', () => {
    if (socket._hadDrop && !socket.recovered) {
      window.dispatchEvent(new CustomEvent('socket:reconnected'))
    }
    socket._hadDrop = false
  })
  socket.on('refetch_resource', (data) => {
    if (data.cache_key) {
      let resource =
        getCachedResource(data.cache_key) ||
        getCachedListResource(data.cache_key)
      if (resource) {
        resource.reload()
      }
    }
  })
  return socket
}
