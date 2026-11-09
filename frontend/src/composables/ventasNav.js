import { computed, markRaw, ref, watch } from 'vue'
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
import { moduleLayout, openSectionsSheet } from '@/composables/muelleShell'
import { arrangeSections } from '@/utils/shellLayout'
import { userScopedKey } from '@/utils/storageKeys'
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

// «Solo íconos»: the sections sidebar keeps only its icons on a wide screen,
// like the shell rail (below 1024 px it always does). Per user, per browser.
const COMPACT_BASE = 'muelle.ventas.compact'
function readCompact() {
  try {
    return localStorage.getItem(userScopedKey(COMPACT_BASE)) === '1'
  } catch {
    return false
  }
}
export const ventasCompact = ref(
  typeof localStorage === 'undefined' ? false : readCompact(),
)
export function toggleVentasCompact() {
  ventasCompact.value = !ventasCompact.value
  try {
    localStorage.setItem(
      userScopedKey(COMPACT_BASE),
      ventasCompact.value ? '1' : '0',
    )
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
  // The daily lists and «Más» as the worker's layout arranges them (the
  // owner's per puesto, or their own); «Configuración» stays as it ships.
  const daily = computed(() => visible(ventasSection('daily')))
  const lists = computed(() => [
    ...daily.value,
    ...visible(ventasSection('more')),
  ])
  const arranged = computed(() =>
    arrangeSections({
      items: lists.value,
      top: daily.value.map((item) => item.key),
      layout: moduleLayout('ventas'),
    }),
  )
  const primary = computed(() => arranged.value.top)
  const more = computed(() =>
    arranged.value.rest.filter((item) => !arranged.value.hidden.has(item.key)),
  )
  const settings = computed(() => visible(ventasSection('settings')))
  // The part that holds `path` as arranged; Configuración as it ships.
  function sectionOf(path) {
    const group = routeGroup(path)
    if (group && primary.value.some((item) => item.group === group))
      return 'daily'
    if (group && arranged.value.rest.some((item) => item.group === group))
      return 'more'
    return ventasSectionOf(path)
  }
  /** «Ordenar Ventas»: the daily lists and «Más», from the module's title. */
  function arrange() {
    openSectionsSheet({
      module: 'ventas',
      title: __('Ventas'),
      items: lists.value.map((item) => ({
        key: item.key,
        label: __(item.label),
        icon: item.icon && markRaw(item.icon),
      })),
      top: daily.value.map((item) => item.key),
      parts: { top: __('Daily lists'), rest: __('Other lists') },
    })
  }
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
      return Boolean(open.value[section]) || sectionOf(path) === section
    },
    /** Whether the section can close here (not while its page is shown). */
    canClose(section, path) {
      return sectionOf(path) !== section
    },
    toggle(section, path) {
      if (sectionOf(path) === section) return
      setOpen(section, !open.value[section])
    },
    arrange,
  }
}
