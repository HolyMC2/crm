// The `return_to` check on its own: the router's legacy Ventas redirects need it
// at boot, and importing it from ventasDocs put that whole module in the entry.
const RETURN_PREFIXES = ['/crm/']

/** The receiving app validates `return_to` again; this only refuses to send junk. */
export function safeReturnPath(path) {
  if (typeof path !== 'string' || path.length > 2048) return ''
  if (!RETURN_PREFIXES.some((prefix) => path.startsWith(prefix))) return ''
  if (
    path.includes('//') ||
    path.includes('\\') ||
    [...path].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)
  )
    return ''
  const pathname = path.split(/[?#]/)[0]
  let segments
  try {
    // browsers normalize %2e%2e to «..» before navigating: judge decoded segments
    segments = pathname.split('/').map((segment) => decodeURIComponent(segment))
  } catch {
    return ''
  }
  if (
    segments.some(
      (segment) =>
        segment === '.' ||
        segment === '..' ||
        /[\\/]/.test(segment) ||
        [...segment].some((ch) => ch.charCodeAt(0) < 32),
    )
  )
    return ''
  return path
}
