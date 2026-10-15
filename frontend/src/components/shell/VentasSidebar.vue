<template>
  <aside
    class="hidden w-14 flex-none flex-col overflow-y-auto border-r border-outline-gray-1 bg-surface-gray-1 px-2 py-4 sm:flex lg:w-[220px]"
    :aria-label="__('Ventas sections')"
  >
    <!-- Below 1024 px (a tablet, or a laptop at 200 % zoom) the sections are
         icons only, with their names as tooltips; the page keeps its width. -->
    <div class="hidden px-2.5 pb-3 text-base font-semibold lg:block">
      {{ __('Ventas') }}
    </div>
    <nav class="flex flex-col gap-0.5" data-ventas-nav="daily">
      <SidebarEntry
        v-for="item in primary"
        :key="item.key"
        :item="item"
        :active="groupOf(route.path) === item.group"
        :badge="item.badge ? badgeFor(item.badge) : 0"
      />
    </nav>
    <template v-for="section in sections" :key="section.key">
      <div
        v-if="section.items.length"
        class="mt-3 border-t border-outline-gray-1 pt-3"
      >
        <button
          type="button"
          class="flex min-h-9 w-full items-center justify-center gap-2 rounded-lg px-2.5 text-left text-sm text-ink-gray-6 hover:bg-surface-gray-2 lg:justify-start"
          :title="__(section.label)"
          :aria-expanded="isOpen(section.key, route.path)"
          :aria-controls="`ventas-${section.key}`"
          :aria-disabled="!canClose(section.key, route.path) || undefined"
          :data-ventas-toggle="section.key"
          @click="toggle(section.key, route.path)"
        >
          <span
            class="hidden size-4 flex-none lg:block"
            :class="
              isOpen(section.key, route.path)
                ? 'lucide-chevron-down'
                : 'lucide-chevron-right'
            "
            aria-hidden="true"
          />
          <span
            class="size-4 flex-none lg:hidden"
            :class="section.icon"
            aria-hidden="true"
          />
          <span class="sr-only flex-1 font-medium lg:not-sr-only">{{
            __(section.label)
          }}</span>
          <span
            v-if="
              !isOpen(section.key, route.path) && sectionBadge(section.items)
            "
            class="hidden rounded-full bg-surface-gray-3 px-1.5 text-xs font-semibold text-ink-gray-8 lg:inline"
            >{{ badgeText(sectionBadge(section.items)) }}</span
          >
        </button>
        <nav
          v-show="isOpen(section.key, route.path)"
          :id="`ventas-${section.key}`"
          class="mt-0.5 flex flex-col gap-0.5"
          :data-ventas-nav="section.key"
          :aria-label="__(section.label)"
        >
          <SidebarEntry
            v-for="item in section.items"
            :key="item.key"
            :item="item"
            :active="groupOf(route.path) === item.group"
            :badge="item.badge ? badgeFor(item.badge) : 0"
          />
        </nav>
      </div>
    </template>
  </aside>
</template>
<script setup>
import { computed, defineComponent, h } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useVentasNav } from '@/composables/ventasNav'

const route = useRoute()
const {
  primary,
  more,
  settings,
  groupOf,
  badgeFor,
  sectionBadge,
  isOpen,
  canClose,
  toggle,
} = useVentasNav()
// Daily lists first; «Más» and «Configuración» (managers) fold away.
const sections = computed(() => [
  { key: 'more', label: 'More', icon: 'lucide-ellipsis', items: more.value },
  {
    key: 'settings',
    label: 'Settings',
    icon: 'lucide-settings',
    items: settings.value,
  },
])
const badgeText = (n) => (n > 99 ? '99+' : String(n))

const SidebarEntry = defineComponent({
  props: { item: Object, active: Boolean, badge: [Number, String] },
  setup: (props) => () =>
    h(
      RouterLink,
      {
        to: props.item.to,
        'aria-current': props.active ? 'page' : undefined,
        // Icons only below lg: the name is the tooltip and stays for readers.
        title: __(props.item.label),
        class: [
          'relative flex min-h-9 items-center justify-center gap-2.5 rounded-lg px-2.5 text-sm lg:justify-start',
          props.active
            ? 'bg-surface-gray-3 font-semibold text-ink-gray-9'
            : 'text-ink-gray-7 hover:bg-surface-gray-2',
        ],
      },
      () => [
        h(props.item.icon, {
          class: 'size-4 flex-none',
          'aria-hidden': 'true',
        }),
        h(
          'span',
          { class: 'sr-only min-w-0 flex-1 truncate lg:not-sr-only' },
          __(props.item.label),
        ),
        props.badge
          ? h(
              'span',
              {
                class:
                  'absolute -right-1 -top-1 rounded-full bg-surface-gray-3 px-1 text-[10px] font-semibold text-ink-gray-8 lg:static lg:px-1.5 lg:text-xs',
              },
              props.badge > 99 ? '99+' : String(props.badge),
            )
          : null,
      ],
    ),
})
</script>
