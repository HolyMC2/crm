// Duplicate-merge summary formatting (spec 4.3b). Pure logic so it's unit-testable.
// Turns the backend `moved` dict (services/merge.py :: merge_conversation → {moved})
// into an es-MX one-liner for the success toast, e.g. {"WhatsApp Message": 3,
// "Comment": 1, "Tags": 2} → "3 mensajes, 1 comentario, 2 etiquetas". Keys the
// backend reports with a count of 0 are dropped; an all-zero merge yields ''.
//
// Labels are singular/plural pairs keyed by the SAME artifact names the backend
// returns — keep this map in lockstep with _summary_es in services/merge.py.
const LABELS = {
  'WhatsApp Message': ['mensaje de WhatsApp', 'mensajes de WhatsApp'],
  'Messenger Message': ['mensaje de Messenger', 'mensajes de Messenger'],
  Comment: ['comentario', 'comentarios'],
  ToDo: ['tarea', 'tareas'],
  'FCRM Note': ['nota', 'notas'],
  Tags: ['etiqueta', 'etiquetas'],
}

export function formatMovedCounts(moved) {
  if (!moved || typeof moved !== 'object') return ''
  const parts = []
  for (const [key, label] of Object.entries(LABELS)) {
    const n = Number(moved[key]) || 0
    if (n > 0) parts.push(`${n} ${label[n === 1 ? 0 : 1]}`)
  }
  return parts.join(', ')
}
