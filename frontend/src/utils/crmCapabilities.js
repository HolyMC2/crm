// Installed-app capability source for the CRM shell.
//
// The FCRM redesign surfaces (Inbox, Campaigns, Social, custom list pages, …) are
// backed by the optional `doco_marketing` addon. A tenant without it (e.g. the
// demo site: frappe/erpnext/doco/posawesome/crm/print_designer) must still be able
// to enter the CRM and reach the native Lead / Deal / Task / Call lists.
//
// This module answers ONE question — "is app X installed on this site?" — and
// nothing else. It is availability, not permission: server-side authorization is
// unchanged and every gated page still enforces its own checks.
//
// Source of truth, in order:
//   1. `window.installed_apps` when the www boot exports it (no round-trip).
//   2. `crm.api.capabilities.get_capabilities`, fetched once and cached.
// States: 'pending' (not loaded yet) → 'resolved' (list known) | 'unknown' (the
// lookup failed). Only 'resolved' + listed counts as present; unknown never
// unlocks an addon surface, so a broken lookup degrades to the native pages.
import { ref, computed } from 'vue'
import { call } from 'frappe-ui'

export const CAPABILITIES_URL = 'crm.api.capabilities.get_capabilities'
export const ADDON_APP = 'doco_marketing'
export const CAPABILITIES_TIMEOUT_MS = 2000

const state = ref('pending') // 'pending' | 'resolved' | 'unknown'
const installedApps = ref([])
let inflight = null

function appsFromBoot() {
  const apps = typeof window !== 'undefined' ? window.installed_apps : null
  return Array.isArray(apps) ? apps : null
}

function resolveWith(apps) {
  installedApps.value = apps.map(String)
  state.value = 'resolved'
}

// Idempotent: concurrent callers share one request; a resolved answer is final.
// A failed lookup leaves state 'unknown' and lets the next caller retry.
export function loadCapabilities() {
  if (state.value === 'resolved') return Promise.resolve()
  if (inflight) return inflight
  const boot = appsFromBoot()
  if (boot) {
    resolveWith(boot)
    return Promise.resolve()
  }
  let timer
  inflight = Promise.race([
    Promise.resolve().then(() => call(CAPABILITIES_URL)),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), CAPABILITIES_TIMEOUT_MS)
    }),
  ])
    .then((res) => {
      const apps = res?.installed_apps
      if (Array.isArray(apps)) resolveWith(apps)
      else state.value = 'unknown'
    })
    .catch(() => {
      state.value = 'unknown'
    })
    .finally(() => {
      clearTimeout(timer)
      inflight = null
    })
  return inflight
}

export const capabilitiesState = computed(() => state.value)

// 'present' | 'missing' | 'pending' | 'unknown'
export function appState(app) {
  if (state.value !== 'resolved') return state.value
  return installedApps.value.includes(app) ? 'present' : 'missing'
}

export function hasApp(app) {
  return appState(app) === 'present'
}

export const addonAvailable = computed(() => hasApp(ADDON_APP))

// ── shell route gates ─────────────────────────────────────────────────────────
// Route NAME → where to send the user when the addon is missing. Native lists
// keep their URL semantics through the upstream `/…/view/:viewType?` routes; the
// Deal 360° page falls back to the upstream Deal page for the same record;
// addon-only surfaces go Home (which itself resolves to the native Leads list).
const HOME = { name: 'Home' }
export const GATED_ROUTES = Object.freeze({
  'Leads List': { name: 'Leads' },
  'Deals List': { name: 'Deals' },
  'Tasks List': { name: 'Tasks' },
  'Calls List': { name: 'Call Logs' },
  'Deal 360': (to) => ({ name: 'Deal', params: { dealId: to?.params?.dealId } }),
  Inbox: HOME,
  'WhatsApp Queue': HOME,
  Campaigns: HOME,
  Campaign: HOME,
  Chatflows: HOME,
  Social: HOME,
  'Social Evergreen': HOME,
  'Social Mentions': HOME,
  Reports: HOME,
  Workload: HOME,
  'Score Rules': HOME,
  Webshop: HOME,
  'Pipeline Analysis': HOME,
})

// Routes with no native equivalent: hidden from navigation without the addon.
export function isAddonOnlyRoute(routeName) {
  return GATED_ROUTES[routeName] === HOME
}

// Returns the redirect target for `to`, or null when the route may proceed.
// `available` defaults to the live answer; tests pass it explicitly.
export function gateRoute(to, available = hasApp(ADDON_APP)) {
  const name = to?.name
  if (name === 'Home') return available ? { name: 'Inbox' } : { name: 'Leads' }
  const fallback = GATED_ROUTES[name]
  if (!fallback || available) return null
  const target = typeof fallback === 'function' ? fallback(to) : { ...fallback }
  if (target.name !== 'Home') {
    if (to.query) target.query = to.query
    if (to.hash) target.hash = to.hash
  }
  return target
}

// Nav entries pointing at addon-only routes disappear without the addon; entries
// with a native fallback stay (the router swaps in the native page).
export function navItemVisible(routeName, available = hasApp(ADDON_APP)) {
  return available || !isAddonOnlyRoute(routeName)
}
