import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { createResource } from 'frappe-ui'
import {
  navItemAllowed,
  navItems,
  navItemsBottom,
  routeGroup,
} from '@/composables/navModel'
import { usersStore } from '@/stores/users'
import {
  addonAvailable,
  loadCapabilities,
  navItemVisible,
} from '@/utils/crmCapabilities'

// Ventas sections for the shell (desktop sidebar and phone «Más»), CRM program
// S5.1: the seller sees the daily lists first, everything else is one click
// away under «Más», and the set-up screens sit under «Configuración» for
// managers only. Hoy, Contactos and Agenda are shell modules of their own (the
// rail and the phone bar), so Ventas does not repeat them.
const badges = createResource({
  url: 'doco_marketing.api.shell.get_badge_counts',
  cache: 'shellBadgeCounts',
  auto: false,
})

// Keys of navModel entries, in order. «Prospectos» is the Leads list today;
// when the unified Prospectos list lands (CRM-S3, D4) it replaces `leads` and
// `inquiries` here.
export const VENTAS_SECTIONS = Object.freeze({
  daily: ['deals', 'leads', 'inbox'],
  more: [
    'dashboard',
    'inquiries',
    'wa-queue',
    'tasks',
    'calls',
    'reports',
    'funnel',
    'workload',
  ],
  settings: [
    'campaigns',
    'forms',
    'social',
    'automations',
    'score-rules',
    'webshop',
  ],
})

// Labels that differ from navModel's (English source, es-MX in crm/locale/es.po).
// Inbox keeps «Bandeja de entrada», the page's own title: its «Conversaciones»
// tab is one of the two spaces inside it.
const LABELS = {}
// Manager views besides the whole «Configuración» section.
const MANAGER_ONLY = new Set(['workload', ...VENTAS_SECTIONS.settings])
// Shell-module entries never shown inside Ventas.
const NOT_IN_VENTAS = new Set(['contactos', 'calendar'])

const ALL = [...navItems, ...navItemsBottom]

/** navModel entries of one section, with the Ventas label and role gate. */
export function ventasSection(section) {
  return VENTAS_SECTIONS[section]
    .map((key) => ALL.find((item) => item.key === key))
    .filter((item) => item && !NOT_IN_VENTAS.has(item.key))
    .map((item) => ({
      ...item,
      label: LABELS[item.key] || item.label,
      managerOnly: item.managerOnly || MANAGER_ONLY.has(item.key),
    }))
}

/** The section that holds `path` («daily», «more», «settings») or ''. */
export function ventasSectionOf(path) {
  const group = routeGroup(path)
  if (!group) return ''
  for (const section of Object.keys(VENTAS_SECTIONS))
    if (ventasSection(section).some((item) => item.group === group))
      return section
  return ''
}

// The open/closed choice of «Más» and «Configuración», kept per browser.
const OPEN_KEY = 'muelle.ventas.open'
function readOpen() {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY) || '{}') || {}
  } catch {
    return {}
  }
}
const open = ref(typeof localStorage === 'undefined' ? {} : readOpen())
function setOpen(section, value) {
  open.value = { ...open.value, [section]: value }
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify(open.value))
  } catch {
    // private mode: the choice lasts for this tab
  }
}

export function useVentasNav() {
  const router = useRouter()
  const { isManager } = usersStore()
  loadCapabilities()
  const visible = (items) =>
    items.filter(
      (item) =>
        navItemVisible(router.resolve(item.to).name, addonAvailable.value) &&
        navItemAllowed(item, { isManager: isManager() }),
    )
  watch(addonAvailable, (ok) => ok && badges.fetch(), { immediate: true })
  const primary = computed(() => visible(ventasSection('daily')))
  const more = computed(() => visible(ventasSection('more')))
  const settings = computed(() => visible(ventasSection('settings')))
  function badgeFor(kind) {
    const data = badges.data || {}
    if (kind === 'unread') return data.unread_messages
    if (kind === 'pending') return data.pending_reviews
    if (kind === 'overdue') return data.overdue_tasks
    return 0
  }
  return {
    primary,
    more,
    settings,
    /** Everything after the daily lists (older callers). */
    secondary: computed(() => [...more.value, ...settings.value]),
    groupOf: routeGroup,
    badgeFor,
    /** Badge total of a collapsed section, so a waiting queue is not hidden. */
    sectionBadge(items) {
      return items.reduce(
        (sum, item) =>
          sum + (item.badge ? Number(badgeFor(item.badge)) || 0 : 0),
        0,
      )
    },
    /** Open when chosen, and always while the current page lives in it. */
    isOpen(section, path) {
      return Boolean(open.value[section]) || ventasSectionOf(path) === section
    },
    /** Whether the section can close here (not while its page is shown). */
    canClose(section, path) {
      return ventasSectionOf(path) !== section
    },
    toggle(section, path) {
      if (ventasSectionOf(path) === section) return
      setOpen(section, !open.value[section])
    },
  }
}
