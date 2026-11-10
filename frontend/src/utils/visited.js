// The record pages a worker opens in the shell, kept for the palette's
// Recientes (the awesomebar lists recent pages the same way). Paths only:
// the palette turns each into a reference and the server confirms read
// access before a title shows (utils/shellPalette). Small on purpose: the
// shell loads this, the palette's own module loads later.
import { bootScope } from '@/vendor/muelle-shell/contracts'

const KEEP = 12
// A record's page: a contact, a deal, a document (on the generic floor or a
// curated list), a product. «/documentos/tipo/X» alone is a list.
const RECORD =
  /^\/(contactos\/[a-z-]+|ventas\/deal|documentos\/tipo\/[^/]+|(documentos|inventario)\/(?!tipo\/)[^/]+|productos)\/[^/]+$/

function key() {
  const user = decodeURIComponent(
    document.cookie
      .split('; ')
      .find((part) => part.startsWith('user_id='))
      ?.slice(8) || '',
  )
  return `muelle:visited:${bootScope(window.site_name || location.host, user)}`
}
function read() {
  try {
    const paths = JSON.parse(sessionStorage.getItem(key()) || '[]')
    return Array.isArray(paths)
      ? paths.filter((path) => typeof path === 'string')
      : []
  } catch {
    return []
  }
}
function write(paths) {
  try {
    sessionStorage.setItem(key(), JSON.stringify(paths))
  } catch {
    // No storage: Recientes keeps what the palette itself opened.
  }
}

/** Remember a route's path when it is a record's page, newest last. */
export function noteVisit(path) {
  const clean = String(path || '').split(/[?#]/)[0]
  if (!RECORD.test(clean) || /\/(nuevo|nueva)$/.test(clean)) return
  write([...read().filter((seen) => seen !== clean), clean].slice(-KEEP))
}

/**
 * The pages opened since the palette last asked, oldest first, and forget
 * them. The page on screen stays for next time: it is where the worker is,
 * not somewhere to go back to.
 */
export function takeVisits(current = '') {
  const here = String(current || '').split(/[?#]/)[0]
  const paths = read()
  write(paths.filter((path) => path === here))
  return paths.filter((path) => path !== here)
}
