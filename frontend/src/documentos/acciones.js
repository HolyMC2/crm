// «Acciones» (the bolt on a document list): what the worker can do with the
// list as a whole, for every doctype. Pure like tools.js: the page renders the
// groups and runs what comes back.
//
// A group is { key, title, items, tiles? }. An item is
//   { key, label, icon, hint, allowed, reason, to?, options? }
// with `to` a route the item opens, `options` a dropdown that unfolds in place
// ({ value, label, selected }), and neither a command the page runs by key.
//
// A profile adds its own:
//   createOptions(ctx) → [{ key, label, icon, hint, query }]: kinds of new
//     document, opened as `/nuevo?<query>` (documentos/form.js prefillFromQuery).
//   listActions(ctx) → [{ key, label, icon, hint, to, app? }]: anything else;
//     an item with `app` shows only while that shell module is on.

const ok = (item) => ({ allowed: true, reason: '', hint: '', ...item })

function createGroup(profile, ctx) {
  if (!ctx.createTo || typeof profile.createOptions !== 'function') return null
  const items = (profile.createOptions(ctx) || []).map((option) =>
    ok({
      key: `crear:${option.key}`,
      label: option.label,
      icon: option.icon,
      hint: option.hint || '',
      to: { path: ctx.createTo.path, query: { ...(option.query || {}) } },
    }),
  )
  return items.length
    ? { key: 'crear', title: 'Crear', tiles: true, items }
    : null
}

function profileGroup(profile, ctx) {
  if (typeof profile.listActions !== 'function') return null
  const modules = ctx.modules || {}
  const items = (profile.listActions(ctx) || [])
    .filter((item) => !item.app || modules[item.app]?.enabled)
    .map(ok)
  return items.length ? { key: 'atajos', title: 'Ir a', items } : null
}

function listGroup(profile, ctx) {
  const items = []
  const sorts = profile.sorts || []
  if (sorts.length > 1) {
    const current = sorts.find((s) => s.value === (ctx.sort || '')) || sorts[0]
    items.push(
      ok({
        key: 'ordenar',
        label: 'Ordenar',
        icon: 'lucide-arrow-up-down',
        hint: current.label,
        options: sorts.map((s) => ({
          value: s.value,
          label: s.label,
          selected: s.value === current.value,
        })),
      }),
    )
  }
  if (ctx.vistas)
    items.push(
      ok({
        key: 'vistas',
        label: 'Vistas',
        icon: 'lucide-bookmark',
        hint: ctx.saved
          ? ctx.saved === 1
            ? '1 guardada'
            : `${ctx.saved} guardadas`
          : 'Guarda estos filtros con un nombre',
      }),
    )
  items.push({
    key: 'seleccionar',
    label: 'Seleccionar varios',
    icon: 'lucide-square-check-big',
    hint: 'Asignar, etiquetar, imprimir o exportar a la vez',
    allowed: ctx.rows > 0,
    reason: 'La lista está vacía. Quita un filtro o crea un documento.',
  })
  if (ctx.hasFilters)
    items.push(
      ok({
        key: 'limpiar',
        label: 'Quitar filtros',
        icon: 'lucide-x',
        hint: 'Vuelve a la lista como abre',
      }),
    )
  return { key: 'lista', title: 'Esta lista', items }
}

/** The bolt's groups for a list: Crear, the profile's own, then Esta lista. */
export function listActionsFor(profile, ctx = {}) {
  if (!profile) return []
  return [
    createGroup(profile, ctx),
    profileGroup(profile, ctx),
    listGroup(profile, ctx),
  ].filter(Boolean)
}

// The tools of «⋯» that follow a record up rather than handle it: on a record
// the bolt holds them, under its steps.
export const FOLLOW_UP = ['pendiente', 'avisame', 'repetir', 'preguntar']

/**
 * The bolt's groups for one record: its steps (the profile's next step and the
 * other steps of this state, then «Editar» on a draft the worker may change),
 * then what keeps it in sight. A step picks as `paso:<i>` in the order given.
 * @param steps  [{ label, icon }] (DocumentoRecord's `step` then `altSteps`)
 * @param tools  documentos/tools.js toolsFor entries
 */
export function recordActionsFor({ steps = [], canEdit = false, tools = [] }) {
  const next = steps.map((s, i) =>
    ok({ key: `paso:${i}`, label: s.label, icon: s.icon || 'lucide-check' }),
  )
  if (canEdit)
    next.push(
      ok({
        key: 'editar',
        label: 'Editar',
        icon: 'lucide-pencil',
        hint: 'Cambia el borrador',
      }),
    )
  const follow = FOLLOW_UP.map((key) => tools.find((t) => t.key === key))
    .filter(Boolean)
    .map((t) => ok({ ...t }))
  return [
    next.length && { key: 'pasos', title: 'Siguiente paso', items: next },
    follow.length && { key: 'seguir', title: 'Dar seguimiento', items: follow },
  ].filter(Boolean)
}
