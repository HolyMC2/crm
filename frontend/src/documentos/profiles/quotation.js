// Cotizaciones (Quotation): curated profile. D2 owns it after D1.2.
import {
  formatDate,
  formatMoney,
  formatDue,
  statusLabel,
  statusTone,
} from '@/utils/display'
import { docStatus, titleOf } from './_generic'

const OPEN = ['Open', 'Replied', 'Partially Ordered']

export default {
  fields: ['quotation_to', 'party_name'],
  chips: [
    {
      value: 'abiertas',
      label: 'Abiertas',
      filters: [
        ['docstatus', '=', 1],
        ['status', 'in', OPEN],
      ],
    },
    {
      value: 'borradores',
      label: 'Borradores',
      filters: [['docstatus', '=', 0]],
    },
    {
      value: 'pedidas',
      label: 'Pedidas',
      filters: [['status', '=', 'Ordered']],
    },
    {
      value: 'vencidas',
      label: 'Vencidas',
      filters: [['status', '=', 'Expired']],
    },
    {
      value: 'perdidas',
      label: 'Perdidas',
      filters: [['status', '=', 'Lost']],
    },
    { value: '', label: 'Todas', filters: null },
  ],
  defaultChip: 'abiertas',
  sorts: [
    { value: '', label: 'Más recientes' },
    { value: 'valid_till asc', label: 'Vencen primero' },
    { value: 'grand_total desc', label: 'Importe mayor' },
  ],

  row(row) {
    const status = docStatus(row)
    const open = OPEN.includes(status) && row.due
    const due = open ? formatDue(row.due) : null
    const subtitle = due
      ? due.overdue
        ? due.label
        : `Válida hasta ${formatDate(row.due, { relative: false })}`
      : [statusLabel(status), formatDate(row.date)].filter(Boolean).join(' · ')
    return {
      title: titleOf(row, 'Quotation'),
      subtitle,
      subtitleTone: due?.overdue ? 'danger' : '',
      meta: formatMoney(row.amount, row.currency || 'MXN'),
      status,
      tone: statusTone(status),
      avatar: titleOf(row, 'Quotation'),
    }
  },
}
