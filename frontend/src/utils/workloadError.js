// frappeRequest exposes exc_type + HTTP status. Never infer a permission denial
// from a generic exception or from human-readable server text.
export function workloadError(error) {
  const type = error?.exc_type || error?.name
  const status = Number(error?.status || error?.response?.status)
  if (type === 'AuthenticationError' || status === 401) return 'session'
  if (type === 'PermissionError' || status === 403) return 'permission'
  if (
    ['ModuleNotFoundError', 'ImportError', 'DoesNotExistError'].includes(
      type,
    ) ||
    [404, 503].includes(status)
  )
    return 'unavailable'
  return 'transient'
}
