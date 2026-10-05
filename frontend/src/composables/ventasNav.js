import { computed, watch } from 'vue'
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

// Ventas sections for the shell (desktop sidebar and phone «Más»): the former
// DocoNavRail / MobileSidebar items, gated by installed addons and role.
// Contactos is its own module now, so it is not repeated inside Ventas.
const badges = createResource({
  url: 'doco_marketing.api.shell.get_badge_counts',
  cache: 'shellBadgeCounts',
  auto: false,
})

export function useVentasNav() {
  const router = useRouter()
  const { isManager } = usersStore()
  loadCapabilities()
  const visible = (items) =>
    items.filter(
      (item) =>
        item.key !== 'contactos' &&
        navItemVisible(router.resolve(item.to).name, addonAvailable.value) &&
        navItemAllowed(item, { isManager: isManager() }),
    )
  watch(addonAvailable, (ok) => ok && badges.fetch(), { immediate: true })
  return {
    primary: computed(() => visible(navItems)),
    secondary: computed(() => visible(navItemsBottom)),
    groupOf: routeGroup,
    badgeFor(kind) {
      const data = badges.data || {}
      if (kind === 'unread') return data.unread_messages
      if (kind === 'pending') return data.pending_reviews
      if (kind === 'overdue') return data.overdue_tasks
      return 0
    },
  }
}
