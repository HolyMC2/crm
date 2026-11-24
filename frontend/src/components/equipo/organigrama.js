// Equipo › Organigrama: the tree, the search and the «¿Quién puede…?» lens,
// computed from doco.erp_experience.organigrama.get_chart's flat `people`.
// Pure functions, so the page stays a view and the rules have tests.
import { matchTokens } from '@/vendor/muelle-shell/contracts/search'

export const CHART = 'doco.erp_experience.organigrama.get_chart'
export const MOVE = 'doco.erp_experience.organigrama.set_reports_to'
export const MOVE_MANY = 'doco.erp_experience.organigrama.set_reports_to_many'
// Prospects and deals follow this tree when the owner turns it on (crm's team tree).
export const CRM_SCOPE = 'crm.api.sales_hierarchy.people_scope'
export const CRM_FOLLOW = 'crm.api.sales_hierarchy.follow_org_chart'

const byName = (a, b) =>
  (a.full_name || '').localeCompare(b.full_name || '', undefined, {
    sensitivity: 'base',
  })

/**
 * The forest: roots first (the owner, then by name), each node with its
 * `children` and how many people are under it (`total`). A boss outside the
 * reader's view, or a loop in old data, roots the person instead of hiding
 * them.
 */
export function buildTree(people = []) {
  const nodes = new Map(
    people.map((p) => [p.employee, { ...p, children: [], total: 0 }]),
  )
  const roots = []
  // Edges kept so far, so a loop in old data roots one person instead of two.
  const parent = new Map()
  const reaches = (start, target) => {
    for (let at = start; at; at = parent.get(at)) if (at === target) return true
    return false
  }
  for (const node of nodes.values()) {
    const boss = node.reports_to && nodes.get(node.reports_to)
    if (boss && !reaches(boss.employee, node.employee)) {
      parent.set(node.employee, boss.employee)
      boss.children.push(node)
    } else roots.push(node)
  }
  const count = (node) => {
    node.children.sort(byName)
    node.total = node.children.reduce((n, c) => n + 1 + count(c), 0)
    return node.total
  }
  roots.forEach(count)
  roots.sort(
    (a, b) =>
      Number(b.puesto === 'Dueño') - Number(a.puesto === 'Dueño') ||
      b.total - a.total ||
      byName(a, b),
  )
  return { roots, nodes }
}

/** Every employee under `node` (not the node itself). */
export function descendants(node) {
  const out = new Set()
  const stack = [...(node?.children || [])]
  while (stack.length) {
    const n = stack.pop()
    out.add(n.employee)
    stack.push(...n.children)
  }
  return out
}

/** The chain from the top down to the person's boss: «Diana › Teresa». */
export function chainOf(employee, nodes) {
  const chain = []
  const seen = new Set([employee])
  let at = nodes.get(nodes.get(employee)?.reports_to)
  while (at && !seen.has(at.employee)) {
    chain.unshift(at)
    seen.add(at.employee)
    at = nodes.get(at.reports_to)
  }
  return chain
}

/**
 * The search keeps the people who match and the bosses above them, so a
 * match is read in its place. null: no search, everyone shows.
 */
export function visibleFor(query, nodes) {
  const text = (query || '').trim()
  if (!text) return null
  const keep = new Set()
  for (const node of nodes.values()) {
    if (
      !matchTokens(
        text,
        node.full_name || '',
        node.puesto || '',
        node.designation || '',
        node.branch || '',
      )
    )
      continue
    let at = node
    while (at && !keep.has(at.employee)) {
      keep.add(at.employee)
      at = nodes.get(at.reports_to)
    }
  }
  return keep
}

/** Whom the person may report to: everyone else but their own team. */
export function bossOptions(employee, nodes) {
  const self = nodes.get(employee)
  if (!self) return []
  const under = descendants(self)
  return [...nodes.values()]
    .filter((n) => n.employee !== employee)
    .map((n) => ({
      ...n,
      current: n.employee === self.reports_to,
      under: under.has(n.employee),
    }))
    .sort(
      (a, b) =>
        Number(b.current) - Number(a.current) ||
        Number(a.under) - Number(b.under) ||
        b.total - a.total ||
        byName(a, b),
    )
}

/** May `source` be dropped on `target` (null target: the top)? */
export function canDrop(source, target) {
  if (!source?.editable) return false
  if (!target) return Boolean(source.reports_to)
  if (source.employee === target.employee) return false
  if (source.reports_to === target.employee) return false
  return !descendants(source).has(target.employee)
}

/** The people the lens `key` answers yes for. */
export function lensSet(key, people = []) {
  if (!key) return null
  return new Set(
    people
      .filter((p) => (p.capabilities || []).includes(key))
      .map((p) => p.employee),
  )
}

/** The flat list after a move, for the screen to show it before the server answers. */
export function withMove(people, employee, boss) {
  return people.map((p) =>
    p.employee === employee
      ? { ...p, reports_to: boss || null, loose: !boss, boss_gone: false }
      : p,
  )
}

/** The person's line under their name: puesto, then what HR calls the job. */
export function roleLine(person) {
  const parts = [person?.puesto, person?.designation].filter(Boolean)
  return [...new Set(parts)].join(', ')
}

const TODAY_DOT = {
  dentro: 'bg-surface-green-6',
  retardo: 'bg-surface-amber-5',
  sin_entrada: 'bg-surface-red-5',
}
/** Today's attendance as a dot class, only for the states that matter now. */
export function todayDot(status) {
  return TODAY_DOT[status] || ''
}

/** Does the chart decide who sees whose prospects and deals? */
export function crmFollows(crm) {
  const state = crm?.state
  return Boolean(state?.enabled && state.follows_org_chart)
}

/** What a person sees of prospects and deals, in sentences; '' when they use none. */
export function crmLine(scope) {
  if (!scope) return ''
  if (scope.scope === 'all') return __('Sees every prospect and deal.')
  const team = scope.scope === 'team' ? scope.team || 0 : 0
  const parts = [
    team > 1
      ? __(
          'Sees their own prospects and deals and those of the {0} people under them.',
          [team],
        )
      : team === 1
        ? __(
            'Sees their own prospects and deals and those of the person under them.',
          )
        : __('Sees their own prospects and deals.'),
  ]
  if (scope.shops?.length)
    parts.push(__('Also those of {0}.', [scope.shops.join(', ')]))
  if (scope.unowned) parts.push(__('Also the ones nobody owns yet.'))
  return parts.join(' ')
}

/**
 * Will `boss` start seeing `person`'s prospects and deals once `person` reports
 * to them? Only when the chart decides it, `person` works with prospects, and
 * the boss does not already see every one.
 */
export function crmGain(crm, person, boss) {
  if (!crmFollows(crm) || !person?.user || !boss?.user) return false
  const people = crm.people || {}
  return Boolean(people[person.user]) && people[boss.user]?.scope === 'team'
}
