// «En el almacén» on a supplier bill: what Escáner does with its goods
// (crm.api.gastos.bill_warehouse). Pure helpers, so the page, its bolt and the
// tests read the same rows and links.
import { call } from 'frappe-ui'

function tr(message, replace, context = null) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace, context)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

export function loadBillWarehouse(name) {
  return call('crm.api.gastos.bill_warehouse', { name })
}

/** An Escáner page with the way back to this bill (shared return protocol). */
export function scannerHref(path, query = {}, back = null) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query))
    if (value !== undefined && value !== null && value !== '')
      params.set(key, value)
  if (back?.to) {
    params.set('return_to', back.to)
    params.set('return_label', back.label || 'Gastos')
  }
  const text = params.toString()
  return `/scan${path}${text ? `?${text}` : ''}`
}

const TASK_KINDS = {
  count: () => tr('Count', null, 'Escáner'),
  putaway: () => tr('Put away', null, 'Escáner'),
  pick: () => tr('Pick', null, 'Escáner'),
  move: () => tr('Move', null, 'Escáner'),
  receive: () => tr('Receive', null, 'Escáner'),
}

export function taskKind(type) {
  return TASK_KINDS[type]?.() || tr('Task', null, 'Escáner')
}

/** A receiving in Escáner, in the worker's words. */
export function inboundState(inbound) {
  if (inbound.status === 'Completed') return tr('Put away')
  if (inbound.status === 'Cancelled') return tr('Cancelled', null, 'Gastos')
  return inbound.verified ? tr('Verified, to put away') : tr('To verify')
}

/**
 * The rows of «En el almacén», in the order the work happens: receive (or the
 * receiving already started), the receipts that brought the goods, Escáner's
 * open tasks, then labels. Each row is
 * { key, icon, title, subtitle, href?, to?, action?, reason? }.
 */
export function warehouseRows(data, { bill, back, labels = false } = {}) {
  if (!data?.stock) return []
  const rows = []
  const open = !!(data.scanner && data.can_open)
  for (const inbound of data.inbounds || [])
    rows.push({
      key: `in:${inbound.name}`,
      icon: 'lucide-package-open',
      title: tr('Receiving in Escáner'),
      subtitle: [inboundState(inbound), inbound.warehouse, inbound.assigned_to]
        .filter(Boolean)
        .join(' · '),
      href: open
        ? scannerHref(`/inbound/${encodeURIComponent(inbound.name)}`, {}, back)
        : '',
    })
  const receive = data.receive
  if (receive && !(data.inbounds || []).length) {
    if (receive.allowed && open)
      for (const warehouse of data.warehouses || [])
        rows.push({
          key: `recibir:${warehouse}`,
          icon: 'lucide-scan-barcode',
          title: tr('Verify and put away'),
          subtitle:
            (data.warehouses || []).length > 1
              ? warehouse
              : tr('Count the boxes in Escáner and file each product'),
          href: scannerHref(
            '/inbound',
            {
              source_doctype: 'Purchase Invoice',
              source_name: bill,
              warehouse,
            },
            back,
          ),
          step: true,
        })
    else
      rows.push({
        key: 'recibir',
        icon: 'lucide-scan-barcode',
        title: tr('Verify and put away'),
        reason: !open
          ? tr(
              'Receiving is done in Escáner, which needs the scanner user role. Ask your manager for it.',
            )
          : receive.reason || '',
        // Only a manager can start it: «Pedir que la reciban» asks one.
        ask: open && receive.code === 'manager',
      })
  }
  for (const receipt of data.receipts || [])
    rows.push({
      key: `pr:${receipt.name}`,
      icon: 'lucide-truck',
      title: tr('Purchase receipt'),
      subtitle:
        receipt.docstatus === 1
          ? tr('Goods received')
          : receipt.docstatus === 2
            ? tr('Cancelled', null, 'Gastos')
            : tr('Draft', null, 'Gastos'),
      receipt: receipt.name,
    })
  if (!data.update_stock && !(data.receipts || []).length)
    rows.push({
      key: 'sin-recepcion',
      icon: 'lucide-truck',
      title: tr('No receipt yet'),
      reason: tr(
        'This bill does not move stock: its goods come in with a purchase receipt.',
      ),
    })
  for (const task of data.tasks || [])
    rows.push({
      key: `task:${task.name}`,
      icon: 'lucide-clipboard-check',
      title: taskKind(task.task_type),
      subtitle: [
        task.status === 'In Progress'
          ? tr('In progress', null, 'Escáner')
          : tr('Open', null, 'Escáner'),
        task.assigned_to,
      ]
        .filter(Boolean)
        .join(' · '),
      href: open
        ? scannerHref(`/tasks/${encodeURIComponent(task.name)}`, {}, back)
        : '',
    })
  if (labels)
    rows.push({
      key: 'etiquetas',
      icon: 'lucide-tag',
      title: tr('Print labels'),
      subtitle: tr('One per piece on this bill'),
      labels: true,
    })
  return rows
}
