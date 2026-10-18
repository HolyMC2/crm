import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { createResource } from 'frappe-ui'
import { navItemAllowed, routeGroup } from '@/composables/navModel'
import { isNarrow } from '@/composables/breakpoint'
import {
  DESKTOP_ONLY,
  VENTAS_SECTIONS,
  ventasSection,
} from '@/composables/ventasSections'
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

export { DESKTOP_ONLY, VENTAS_SECTIONS, ventasSection }

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
        navItemAllowed(item, { isManager: isManager() }) &&
        !(item.desktopOnly && isNarrow.value),
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
