/**
 * The phone header title of a shell route: its meta.title in the reader's
 * language, else the owning module's label. Ventas pages that teleport their
 * own header cover it; the rest show this.
 */
export function shellTitle(route, module) {
  const title = route?.meta?.title
  if (title) return __(title)
  return module?.label || 'Muelle'
}
