// The key a frame gives the routed page. A split page (Documentos
// master-detail at ≥1024) keeps one instance while its record changes; a
// `stableKey` page remounts on its path only, so a query rewrite such as
// ?tab= keeps the record mounted; every other page remounts on its full path.
export function routeKey(route) {
  const split = route.meta?.splitKey?.(route)
  if (split) return split
  return route.meta?.stableKey ? route.path : route.fullPath
}
