import { userScopedKey } from '@/utils/storageKeys'
const PREFIX = 'crm-repair-recovery-v1'
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
export const repairActorKey = () => userScopedKey(PREFIX)
function receipts(actor) {
  const raw = sessionStorage.getItem(actor)
  if (!raw) return []
  if (raw.length > 8192)
    throw new Error('La referencia guardada excede el límite de recuperación.')
  const rows = JSON.parse(raw)
  if (
    !Array.isArray(rows) ||
    rows.length > 20 ||
    new Set(rows.map((row) => row?.deal)).size !== rows.length ||
    rows.some(
      (row) =>
        !row ||
        Object.keys(row).sort().join(',') !== 'client_uuid,deal' ||
        typeof row.deal !== 'string' ||
        !row.deal ||
        row.deal.length > 140 ||
        !UUID.test(row.client_uuid),
    )
  )
    throw new Error(
      'La referencia de reparación guardada necesita revisión. No crees otra solicitud.',
    )
  return rows
}
export function readRepairReceipt(deal, actor = repairActorKey()) {
  return receipts(actor).find((row) => row.deal === deal) || null
}
export function saveRepairReceipt(deal, client_uuid, actor = repairActorKey()) {
  if (
    typeof deal !== 'string' ||
    !deal ||
    deal.length > 140 ||
    !UUID.test(client_uuid)
  )
    throw new Error('Referencia de reparación inválida.')
  const rows = receipts(actor).filter((row) => row.deal !== deal)
  if (rows.length >= 20)
    throw new Error(
      'Revisa las reparaciones pendientes antes de guardar otra referencia.',
    )
  rows.push({ deal, client_uuid })
  sessionStorage.setItem(actor, JSON.stringify(rows))
  if (readRepairReceipt(deal, actor)?.client_uuid !== client_uuid)
    throw new Error('No se pudo guardar la referencia de reparación.')
}
export function clearRepairReceipt(deal, actor = repairActorKey()) {
  const rows = receipts(actor).filter((row) => row.deal !== deal)
  if (rows.length) sessionStorage.setItem(actor, JSON.stringify(rows))
  else sessionStorage.removeItem(actor)
}
