// Prefer the tenant's visible canonical ready stage; retain the pre-rename
// Spanish name while a site's Taller configuration is still being upgraded.
export function repairReadyStage(statuses = []) {
  const visible = statuses.filter((row) => !Number(row.hidden || 0) && row.type === 'Open')
  for (const name of ['Listo para Entregar', 'Ready for Pickup', 'Ready to Ship', 'Por Entregar']) {
    const stage = visible.find((row) => row.name === name)
    if (stage) return stage
  }
  return null
}
