// Mounted intake owners register navigation checks, never drafts or PINs.
// Disposal removes the callback so ordinary Inbox work has no sticky guard.
const guards = new Set()
export function registerRepairNavigationGuard(guard) {
  guards.add(guard)
  return () => guards.delete(guard)
}
export function canLeaveRepairWork() {
  for (const guard of guards) if (guard() === false) return false
  return true
}
