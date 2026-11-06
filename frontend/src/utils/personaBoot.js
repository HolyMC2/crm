// The page boot (crm.www.crm.get_boot) says whether the owner already answered the
// persona wizard; the router reads it before its first route instead of asking.
export function bootPersonaCaptured() {
  const value =
    typeof window !== 'undefined' ? window.persona_captured : undefined
  if (value === undefined || value === null) return undefined
  return Boolean(Number(value))
}
