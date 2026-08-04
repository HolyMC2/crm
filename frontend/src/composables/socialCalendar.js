// Shared data core + pure formatters for the Social content calendar (MA-23).
// Extracted from the former monolith (W6 B0) and grown with the B1 "calendar juice":
// pillar colors, per-channel status dots, client-side filters, month/week/list views,
// season ribbons and optimistic drag-reschedule. `useSocialCalendar()` is the reactive
// data layer shared by the page shell + CalendarGrid + MetricsPanel; the named exports
// are pure helpers the grid renders with.
import { ref, computed, watch } from 'vue'
import { createResource, call as frappeCall, toast } from 'frappe-ui'

// Monday-first weekday header labels.
export const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export const KIND_EMOJI = { Producto: '🛒', Servicio: '🛠', Temporada: '🎉', Noticia: '📣', Testimonio: '💬', Aviso: 'ℹ️' }

// ── pillar (post_kind) color map — frappe-ui semantic tokens (auto light/dark) ──
export const PILLARS = [
  { kind: 'Producto', emoji: '🛒', chip: 'bg-surface-blue-2 text-ink-blue-3' },
  { kind: 'Servicio', emoji: '🛠', chip: 'bg-surface-violet-1 text-ink-violet-1' },
  { kind: 'Temporada', emoji: '🎉', chip: 'bg-surface-amber-2 text-ink-amber-3 dark:bg-amber-300/20 dark:text-amber-200' },
  { kind: 'Noticia', emoji: '📣', chip: 'bg-surface-red-2 text-ink-red-3' },
  { kind: 'Testimonio', emoji: '💬', chip: 'bg-surface-green-2 text-ink-green-3' },
  { kind: 'Aviso', emoji: 'ℹ️', chip: 'bg-surface-gray-3 text-ink-gray-7' },
]
const PILLAR_MAP = Object.fromEntries(PILLARS.map((p) => [p.kind, p.chip]))
// Unclassified → the neutral default (matches the old status chip default).
export function pillarChip(kind) {
  return PILLAR_MAP[kind] || 'bg-surface-gray-2 text-ink-gray-6'
}

// ── per-channel status dots — raw palette + explicit dark: pairs (vivid fills) ──
export const STATUS_DOT = {
  Published: 'bg-green-500 dark:bg-green-400',
  Scheduled: 'bg-blue-500 dark:bg-blue-400',
  Publishing: 'bg-blue-500 dark:bg-blue-400',
  Failed: 'bg-red-500 dark:bg-red-400',
  Skipped: 'bg-gray-400 dark:bg-gray-500',
  Pending: 'bg-gray-300 dark:bg-gray-600',
}
export function statusDot(s) {
  return STATUS_DOT[s] || 'bg-gray-300 dark:bg-gray-600'
}

// Post-level status filter vocabulary + es-MX labels (chip() gives their colors).
// Cancelado is NOT a calendar status anymore — the backend excludes it from
// get_calendar (still in Desk/reports); STATUS_LABEL/chip keep it for other surfaces.
export const STATUSES = ['Draft', 'Pending Approval', 'Scheduled', 'Publishing', 'Published', 'Partially Published', 'Failed']
export const STATUS_LABEL = {
  Draft: 'Borrador', 'Pending Approval': 'Por aprobar', Scheduled: 'Programada',
  Publishing: 'Publicando', Published: 'Publicada', 'Partially Published': 'Parcial',
  Failed: 'Falló', Cancelado: 'Cancelada',
}
export const CHANNEL_FAMILIES = [
  { key: 'FB', emoji: '🟦', label: 'Facebook' },
  { key: 'IG', emoji: '🟪', label: 'Instagram' },
]

function chanName(c) {
  return c && c.channel != null ? c.channel : c // A2 rows are {channel,status}; tolerate a bare string
}

export function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function chip(status) {
  return {
    Draft: 'bg-surface-gray-2 text-ink-gray-6',
    'Pending Approval': 'bg-surface-amber-1 text-ink-amber-3 dark:bg-amber-300/15 dark:text-amber-200',
    Scheduled: 'bg-surface-blue-2 text-ink-blue-3',
    Publishing: 'bg-surface-blue-2 text-ink-blue-3',
    Published: 'bg-surface-green-2 text-ink-green-3',
    'Partially Published': 'bg-surface-amber-1 text-ink-amber-3 dark:bg-amber-300/15 dark:text-amber-200',
    Failed: 'bg-surface-red-1 text-ink-red-4',
    Cancelado: 'bg-surface-gray-2 text-ink-gray-4 line-through',
  }[status] || 'bg-surface-gray-2 text-ink-gray-6'
}

export function chanIcons(chs) {
  // A2's get_calendar returns channels as {channel, status} dicts (was bare strings).
  // Read c.channel so the FB/IG emoji still resolve. `?? c` tolerates a legacy string.
  const has = (p) => (chs || []).some((c) => (c.channel ?? c).startsWith(p))
  return (has('FB') ? '🟦' : '') + (has('IG') ? '🟪' : '')
}

// One badge per channel: family emoji + a status-colored dot (B1). Preserves the dict.
export function channelBadges(chs) {
  return (chs || []).map((c) => {
    const ch = chanName(c) || ''
    const status = (c && c.status != null) ? c.status : ''
    return {
      channel: ch,
      status,
      emoji: ch.startsWith('IG') ? '🟪' : ch.startsWith('FB') ? '🟦' : '•',
      dot: statusDot(status),
    }
  })
}

export const chLabel = (ch) => (ch.startsWith('IG') ? __('Ver en Instagram') : __('Ver en Facebook'))

export function toDtLocal(dt) {
  return dt ? dt.replace(' ', 'T').slice(0, 16) : ''
}
export function fromDtLocal(v) {
  return v ? v.replace('T', ' ') + ':00' : null
}

// A pristine composer form.
export function blankForm() {
  return { name: '', title: '', shop: '', channels: [], captions: {}, media: [], scheduled_time: '', cta_type: 'WhatsApp', cta_link: '', status: '', channelStates: [] }
}

const CAL_VIEW_KEY = 'social:calView'
function readLS(key, fallback) {
  try { return localStorage.getItem(key) || fallback } catch { return fallback }
}
function writeLS(key, val) {
  try { localStorage.setItem(key, val) } catch { /* private mode / SSR — non-fatal */ }
}

function startOfWeek(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)) // back up to Monday
  return x
}

export function useSocialCalendar() {
  // ── view + range (month grid | week row | agenda list), choice persisted ─────
  const calView = ref(readLS(CAL_VIEW_KEY, 'month')) // 'month' | 'week' | 'list'
  watch(calView, (v) => writeLS(CAL_VIEW_KEY, v))
  const todayKey = ymd(new Date())

  const cursor = ref(new Date()) // a day anchor (month views pin it to the 1st)
  function shift(dir) {
    if (calView.value === 'week') {
      const d = new Date(cursor.value)
      d.setDate(d.getDate() + dir * 7)
      cursor.value = d
    } else {
      cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + dir, 1)
    }
  }
  const gridStart = computed(() => {
    if (calView.value === 'week') return startOfWeek(cursor.value)
    return startOfWeek(new Date(cursor.value.getFullYear(), cursor.value.getMonth(), 1))
  })
  const gridLen = computed(() => (calView.value === 'week' ? 7 : 42))
  const days = computed(() => {
    const start = gridStart.value
    const focusMonth = cursor.value.getMonth()
    const out = []
    for (let i = 0; i < gridLen.value; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      out.push({
        key: ymd(d), n: d.getDate(),
        // week view has no "other month" dimming; month/list dim the pad days.
        inMonth: calView.value === 'week' ? true : d.getMonth() === focusMonth,
        isToday: ymd(d) === todayKey, date: d,
      })
    }
    return out
  })
  const rangeLabel = computed(() => {
    if (calView.value === 'week') {
      const a = days.value[0].date, b = days.value[6].date
      const fmt = (x, o) => x.toLocaleDateString('es-MX', o)
      return a.getMonth() === b.getMonth()
        ? `${a.getDate()}–${b.getDate()} ${fmt(b, { month: 'short', year: 'numeric' })}`
        : `${fmt(a, { day: 'numeric', month: 'short' })} – ${fmt(b, { day: 'numeric', month: 'short', year: 'numeric' })}`
    }
    return new Date(cursor.value.getFullYear(), cursor.value.getMonth(), 1)
      .toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
  })
  // Only re-fetch when the fetched window actually changes (month↔list share a range).
  const rangeKey = computed(() => `${days.value[0].key}|${days.value[days.value.length - 1].key}`)

  // ── shop selector (D4) — declared before `cal` so its auto-fetch sees it ─────
  const shop = ref('') // '' = all shops (manager); resolved to the lone shop for an employee

  const cal = createResource({
    url: 'doco_marketing.api.social.get_calendar',
    makeParams: () => ({ start: days.value[0].key, end: days.value[days.value.length - 1].key + ' 23:59:59', shop: shop.value || undefined }),
    auto: true,
  })
  // season ribbons (B1) — clipped spans over the visible window
  const seasonsRes = createResource({
    url: 'doco_marketing.api.social.get_seasons',
    makeParams: () => ({ start: days.value[0].key, end: days.value[days.value.length - 1].key }),
    auto: true,
  })
  watch(rangeKey, () => { cal.reload(); seasonsRes.reload() })

  // métricas view (S12) + per-shop leaderboard (D5)
  const view = ref('calendar')
  const dash = createResource({
    url: 'doco_marketing.api.social.get_dashboard',
    makeParams: () => ({ shop: shop.value || undefined }),
    auto: false,
  })
  const lb = createResource({
    url: 'doco_marketing.api.social.get_leaderboard',
    makeParams: () => ({ shop: shop.value || undefined }),
    auto: false,
  })
  const lbTotals = computed(() => {
    const acc = { posts: 0, reach: 0, impressions: 0, engagement: 0, link_clicks: 0, leads: 0 }
    for (const r of lb.data || []) for (const k in acc) acc[k] += r[k] || 0
    return acc
  })
  function showMetrics() {
    view.value = 'metrics'
    dash.reload()
    lb.reload()
  }

  // ── client-side filters (pillar / status / channel family), combinable ───────
  const filterKinds = ref([])
  const filterStatuses = ref([])
  const filterFamilies = ref([])
  function toggleFilter(dim, val) {
    const r = { kind: filterKinds, status: filterStatuses, family: filterFamilies }[dim]
    if (!r) return
    const i = r.value.indexOf(val)
    if (i >= 0) r.value.splice(i, 1)
    else r.value.push(val)
  }
  function clearFilters() {
    filterKinds.value = []
    filterStatuses.value = []
    filterFamilies.value = []
  }
  const activeFilterCount = computed(() => filterKinds.value.length + filterStatuses.value.length + filterFamilies.value.length)
  function postFamilies(p) {
    const out = new Set()
    for (const c of p.channels || []) {
      const ch = chanName(c) || ''
      if (ch.startsWith('FB')) out.add('FB')
      else if (ch.startsWith('IG')) out.add('IG')
    }
    return out
  }
  function matchesFilters(p) {
    if (filterKinds.value.length && !filterKinds.value.includes(p.post_kind || '')) return false
    if (filterStatuses.value.length && !filterStatuses.value.includes(p.status)) return false
    if (filterFamilies.value.length) {
      const fams = postFamilies(p)
      if (!filterFamilies.value.some((f) => fams.has(f))) return false
    }
    return true
  }
  // Counts are over the whole loaded window (so a chip's count doesn't drop to 0 the
  // moment you select it) — the classic multi-facet filter behavior.
  const filterCounts = computed(() => {
    const all = [...(cal.data?.scheduled || []), ...(cal.data?.drafts || [])]
    const kinds = {}, statuses = {}, families = { FB: 0, IG: 0 }
    for (const p of all) {
      const k = p.post_kind || ''
      kinds[k] = (kinds[k] || 0) + 1
      statuses[p.status] = (statuses[p.status] || 0) + 1
      const f = postFamilies(p)
      if (f.has('FB')) families.FB++
      if (f.has('IG')) families.IG++
    }
    return { kinds, statuses, families }
  })

  const filteredScheduled = computed(() => (cal.data?.scheduled || []).filter(matchesFilters))
  const visibleDrafts = computed(() => (cal.data?.drafts || []).filter(matchesFilters))

  const postsByDay = computed(() => {
    const m = {}
    for (const p of filteredScheduled.value) {
      if (!p.scheduled_time) continue
      // Bucket by the DATE STRING (site-tz naive, as the backend stores it) — NOT a
      // browser-local Date — so a post always lands on its stored day regardless of
      // the operator's browser timezone (frontend-3). Deployment is single-tz (MX).
      const k = p.scheduled_time.slice(0, 10)
      ;(m[k] = m[k] || []).push(p)
    }
    return m
  })

  const channelsRes = createResource({ url: 'doco_marketing.api.social.get_channels', auto: true })
  const channels = computed(() => channelsRes.data || ['FB Feed', 'FB Reel', 'IG Feed', 'IG Reel', 'IG Story'])

  // shop selector data (D4): managers get every enabled shop + the 'Todas' option; an
  // employee is auto-pinned to their (single) branch so filters + composer are concrete.
  const shopsRes = createResource({ url: 'doco_marketing.api.social.get_shops', auto: true })
  const isManager = computed(() => !!shopsRes.data?.is_manager)
  const shopOptions = computed(() => shopsRes.data?.shops || [])
  const shopLabel = (name) => shopOptions.value.find((s) => s.name === name)?.shop_name || name
  watch(shopOptions, (opts) => {
    if (!isManager.value && opts.length && !shop.value) shop.value = opts[0].name
  }, { immediate: true })
  function onShopChange() {
    cal.reload()
    if (view.value === 'metrics') { dash.reload(); lb.reload() }
  }

  // pending-approval posts across the loaded window + unscheduled tray
  const pendingPosts = computed(() => {
    const all = [...(cal.data?.scheduled || []), ...(cal.data?.drafts || [])]
    return all.filter((p) => p.status === 'Pending Approval')
  })

  // agenda (list view): only the range's days that have posts (plus hoy as an anchor)
  const agendaDays = computed(() =>
    days.value.filter((d) => d.inMonth && ((postsByDay.value[d.key] || []).length || d.isToday)).map((d) => ({
      ...d,
      label: new Date(d.date || d.key).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }),
    })),
  )

  // season ribbons: dayKey → [{...span, isStart}] for the grid strips
  const seasonByDay = computed(() => {
    const m = {}
    for (const s of seasonsRes.data || []) {
      for (const d of days.value) {
        if (d.key >= s.start && d.key <= s.end) {
          ;(m[d.key] = m[d.key] || []).push({ ...s, isStart: d.key === s.start })
        }
      }
    }
    return m
  })

  // ── drag-reschedule with optimistic move + revert on a server guard throw ────
  async function reschedulePost(post, dayKey) {
    if (!post) return
    if (dayKey < todayKey) return // past days aren't droppable (guard mirrors the grid)
    const prev = post.scheduled_time
    const t = (prev || '').slice(11, 16) || '10:00'
    const next = `${dayKey} ${t}:00`
    post.scheduled_time = next // optimistic — the tile jumps immediately
    try {
      await frappeCall('doco_marketing.api.social.reschedule', { name: post.name, scheduled_time: next })
      toast.success(__('Reprogramado'))
      cal.reload()
    } catch (e) {
      post.scheduled_time = prev // revert; surface the es-MX server guard (Meta-handed / past slot)
      toast.error(e?.messages?.[0] || __('No se pudo reprogramar'))
    }
  }

  return {
    // view + range
    calView, cursor, days, rangeLabel, shift, todayKey,
    // top-level view + metrics resources
    view, dash, lb, lbTotals, showMetrics,
    // calendar data (filtered)
    cal, postsByDay, pendingPosts, agendaDays, visibleDrafts, reschedulePost, seasonByDay,
    // filters
    filterKinds, filterStatuses, filterFamilies, toggleFilter, clearFilters, activeFilterCount, filterCounts,
    // channels + shops
    channels, isManager, shopOptions, shopLabel, shop, onShopChange,
  }
}
