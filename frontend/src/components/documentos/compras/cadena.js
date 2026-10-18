// The purchase chain in words (Shell SPEC §6 DD6/DD7), from
// crm.api.documentos_compras.cadena: one step per document in chain order,
// and the next step that has not happened yet.

const KIND = {
  'Material Request': 'Requisición',
  'Request for Quotation': 'Solicitud de cotización',
  'Supplier Quotation': 'Cotización de proveedor',
  'Purchase Order': 'Orden de compra',
  'Purchase Receipt': 'Recepción',
  'Purchase Invoice': 'Factura de proveedor',
  'Payment Entry': 'Pago',
}

// What is still to come after the last stage reached (cotización is optional).
const NEXT = {
  requisicion: {
    key: 'orden',
    label: 'Orden de compra',
    line: 'Todavía no se pide',
  },
  cotizacion: {
    key: 'orden',
    label: 'Orden de compra',
    line: 'Todavía no se pide',
  },
  orden: { key: 'recepcion', label: 'Recepción', line: 'Todavía no llega' },
  recepcion: {
    key: 'factura',
    label: 'Factura de proveedor',
    line: 'Todavía no se factura',
  },
  factura: { key: 'pago', label: 'Pago', line: 'Todavía no se paga' },
}

/** [{ stage, doctype, name, label, title, status, date, amount, currency, here, people }] */
export function chainSteps(data) {
  const out = []
  for (const stage of data?.stages || []) {
    for (const doc of stage.docs || []) {
      out.push({
        ...doc,
        stage: stage.key,
        label: KIND[doc.doctype] || stage.label,
      })
    }
  }
  return out
}

/**
 * The next step, greyed, when the chain is moving: nothing after a payment, a
 * draft or a cancelled document here, or when the last document is a draft.
 */
export function pendingStep(data) {
  const stages = (data?.stages || []).filter((s) => (s.docs || []).length)
  if (!stages.length) return null
  const last = stages[stages.length - 1]
  if ((last.docs || []).some((d) => d.docstatus !== 1)) return null
  const here = stages.flatMap((s) => s.docs).find((d) => d.here)
  if (here && here.docstatus !== 1) return null
  if (['Closed', 'Stopped', 'Expired'].includes(here?.status)) return null
  const statuses = last.docs.map((d) => d.status)
  if (statuses.every((s) => ['Completed', 'Paid', 'Closed'].includes(s)))
    return null
  // An order with nothing to receive (services) goes straight to its bill.
  if (last.key === 'orden' && statuses.every((s) => s === 'To Bill'))
    return NEXT.recepcion
  return NEXT[last.key] || null
}
