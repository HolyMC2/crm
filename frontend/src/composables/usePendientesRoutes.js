// Dependency-free so the router's entry chunk only gains these few lines.

/** /crm/tasks (mine) and the legacy /crm/tasks/view/* (everyone's) lists.
 *
 * `?open=<CRM Task>` (linked-task links, old notifications) opens that task's
 * record; its list return keeps the scope the old link came from. */
export function legacyTasksRoute(to) {
  const segment = to.path.startsWith('/tasks/view') ? 'team' : 'mine'
  const query = segment === 'mine' ? {} : { segment }
  const open = Array.isArray(to.query?.open) ? to.query.open[0] : to.query?.open
  if (typeof open === 'string' && /^[^/?#\\]{1,140}$/.test(open))
    return {
      name: 'Pendiente',
      params: { source: 'crm-task', name: open },
      query: segment === 'mine' ? {} : { list: `segment=${segment}` },
    }
  return { name: 'Pendientes', query }
}
