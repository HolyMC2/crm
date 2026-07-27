// Shared data core + pure formatters for the Social content calendar (MA-23).
// Extracted from the former 1121-line SocialCalendar.vue monolith (W6 B0) — a pure
// structural refactor with no behavior change. `useSocialCalendar()` is the reactive
// data layer shared by the page shell, the calendar grid and the metrics panel
// (month nav + shop selector + the get_calendar/dashboard/leaderboard resources +
// the derived day buckets). The named exports below are pure helpers the grid and
// composer components both render with.
import { ref, computed, watch } from 'vue'
import { createResource, call as frappeCall, toast } from 'frappe-ui'

// Monday-first weekday header labels.
export const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export const KIND_EMOJI = { Producto: '🛒', Servicio: '🛠', Temporada: '🎉', Noticia: '📣', Testimonio: '💬', Aviso: 'ℹ️' }

export function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function chip(status) {
  return {
    Draft: 'bg-surface-gray-2 text-ink-gray-6',
    'Pending Approval': 'bg-surface-amber-1 text-ink-amber-3',
    Scheduled: 'bg-surface-blue-2 text-ink-blue-3',
    Publishing: 'bg-surface-blue-2 text-ink-blue-3',
    Published: 'bg-surface-green-2 text-ink-green-3',
    'Partially Published': 'bg-surface-amber-1 text-ink-amber-3',
    Failed: 'bg-surface-red-1 text-ink-red-4',
    Cancelado: 'bg-surface-gray-2 text-ink-gray-4 line-through',
  }[status] || 'bg-surface-gray-2 text-ink-gray-6'
}

export function chanIcons(chs) {
  // A2's get_calendar returns channels as {channel, status} dicts (was bare strings).
  // Read c.channel so the FB/IG emoji still resolve — the dict is kept intact for Wave B's
  // per-channel status chips. `?? c` tolerates a legacy string too, so the helper is
  // shape-agnostic (the ONE documented behavior touch-up in this B0 decompose).
  const has = (p) => (chs || []).some((c) => (c.channel ?? c).startsWith(p))
  return (has('FB') ? '🟦' : '') + (has('IG') ? '🟪' : '')
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

export function useSocialCalendar() {
  // ── month grid ─────────────────────────────────────────────────────────────
  const cursor = ref(new Date())
  function shiftMonth(d) {
    cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + d, 1)
  }
  const monthStart = computed(() => new Date(cursor.value.getFullYear(), cursor.value.getMonth(), 1))
  const monthLabel = computed(() => monthStart.value.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }))
  const days = computed(() => {
    const first = monthStart.value
    const start = new Date(first)
    start.setDate(1 - ((first.getDay() + 6) % 7)) // Monday-start
    const today = ymd(new Date())
    const out = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      out.push({ key: ymd(d), n: d.getDate(), inMonth: d.getMonth() === first.getMonth(), isToday: ymd(d) === today, date: d })
    }
    return out
  })

  // ── shop selector (D4) — declared before `cal` so its auto-fetch sees it ─────
  const shop = ref('') // '' = all shops (manager); resolved to the lone shop for an employee

  const cal = createResource({
    url: 'doco_marketing.api.social.get_calendar',
    makeParams: () => ({ start: days.value[0].key, end: days.value[41].key + ' 23:59:59', shop: shop.value || undefined }),
    auto: true,
  })

  // métricas view (S12) + per-shop leaderboard (D5)
  const view = ref('calendar')
  const dash = createResource({
    url: 'doco_marketing.api.social.get_dashboard',
    makeParams: () => ({ shop: shop.value || undefined }),
    auto: false,
  })
  const lb = createResource({ url: 'doco_marketing.api.social.get_leaderboard', auto: false })
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

  const postsByDay = computed(() => {
    const m = {}
    for (const p of cal.data?.scheduled || []) {
      if (!p.scheduled_time) continue
      // Bucket by the DATE STRING (site-tz naive, as the backend stores it) — NOT a
      // browser-local Date — so a post always lands on its stored day regardless of
      // the operator's browser timezone (frontend-3). Deployment is single-tz (MX).
      const k = p.scheduled_time.slice(0, 10)
      ;(m[k] = m[k] || []).push(p)
    }
    return m
  })

  // reload when the visible month changes (makeParams picks up the new range)
  watch(() => cursor.value, () => cal.reload())

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
    if (view.value === 'metrics') { dash.reload() }
  }

  // pending-approval posts across the loaded window + unscheduled tray
  const pendingPosts = computed(() => {
    const all = [...(cal.data?.scheduled || []), ...(cal.data?.drafts || [])]
    return all.filter((p) => p.status === 'Pending Approval')
  })

  // mobile agenda: only the month's days that have posts (plus hoy as an anchor)
  const agendaDays = computed(() =>
    days.value.filter((d) => d.inMonth && ((postsByDay.value[d.key] || []).length || d.isToday)).map((d) => ({
      ...d,
      label: new Date(d.date || d.key).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }),
    })),
  )

  // ── drag-reschedule (calendar drop / draft-tray drop) ────────────────────────
  async function reschedulePost(post, dayKey) {
    if (!post) return
    const t = (post.scheduled_time || '').slice(11, 16) || '10:00'
    try {
      await frappeCall('doco_marketing.api.social.reschedule', { name: post.name, scheduled_time: `${dayKey} ${t}:00` })
      toast.success(__('Reprogramado'))
      cal.reload()
    } catch (e) {
      toast.error(e?.messages?.[0] || __('No se pudo reprogramar'))
    }
  }

  return {
    // month nav
    cursor, monthStart, monthLabel, days, shiftMonth,
    // view + metrics resources
    view, dash, lb, lbTotals, showMetrics,
    // calendar data
    cal, postsByDay, pendingPosts, agendaDays, reschedulePost,
    // channels + shops
    channels, isManager, shopOptions, shopLabel, shop, onShopChange,
  }
}
