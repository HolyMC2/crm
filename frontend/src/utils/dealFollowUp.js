export const FOLLOW_UP_QUEUES = [
  { key: 'all', label: 'Todos', description: 'Todos los tratos que coinciden con tus filtros.' },
  { key: 'overdue', label: 'Vencidos', description: 'Seguimientos pendientes de días anteriores. Abre el trato para completar o reprogramar la tarea.' },
  { key: 'today', label: 'Para hoy', description: 'Seguimientos pendientes para hoy, según la zona horaria del sitio.' },
  { key: 'undated', label: 'Sin fecha', description: 'Ya tienen una tarea pendiente: abre el trato y asigna una fecha al seguimiento.' },
  { key: 'missing', label: 'Sin seguimiento', description: 'Tratos abiertos sin tarea pendiente. Programa el próximo paso desde el resumen.' },
]

// Frappe AND filters: the same constraints serve the rows, totals and export.
export function followUpFilters(queue, today, closedStatuses = []) {
  if (queue === 'missing') return [
    ['next_activity_task', 'is', 'not set'],
    ...(closedStatuses.length ? [['status', 'not in', closedStatuses]] : []),
  ]
  if (queue === 'undated') return [['next_activity_task', 'is', 'set'], ['next_activity_at', 'is', 'not set']]
  if (queue === 'overdue') return [['next_activity_task', 'is', 'set'], ['next_activity_at', '<', `${today} 00:00:00`]]
  if (queue === 'today') return [['next_activity_task', 'is', 'set'], ['next_activity_at', 'between', [`${today} 00:00:00`, `${today} 23:59:59.999999`]]]
  return []
}
