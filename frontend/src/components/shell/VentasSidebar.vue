<template>
  <aside
    class="hidden w-[220px] flex-none flex-col overflow-y-auto border-r border-outline-gray-1 bg-surface-gray-1 px-2 py-4 sm:flex"
    :aria-label="__('Ventas sections')"
  >
    <div class="px-2.5 pb-3 text-base font-semibold">Ventas</div>
    <nav class="flex flex-col gap-0.5">
      <SidebarEntry
        v-for="item in primary"
        :key="item.key"
        :item="item"
        :active="groupOf(route.path) === item.group"
        :badge="item.badge ? badgeFor(item.badge) : 0"
      />
    </nav>
    <div class="my-3 h-px bg-outline-gray-1" />
    <nav class="flex flex-col gap-0.5">
      <SidebarEntry
        v-for="item in secondary"
        :key="item.key"
        :item="item"
        :active="groupOf(route.path) === item.group"
      />
    </nav>
  </aside>
</template>
<script setup>
import { defineComponent, h } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useVentasNav } from '@/composables/ventasNav'

const route = useRoute()
const { primary, secondary, groupOf, badgeFor } = useVentasNav()

const SidebarEntry = defineComponent({
  props: { item: Object, active: Boolean, badge: [Number, String] },
  setup: (props) => () =>
    h(
      RouterLink,
      {
        to: props.item.to,
        'aria-current': props.active ? 'page' : undefined,
        class: [
          'flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm',
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
        h('span', { class: 'min-w-0 flex-1 truncate' }, __(props.item.label)),
        props.badge
          ? h(
              'span',
              {
                class:
                  'rounded-full bg-surface-gray-3 px-1.5 text-xs font-semibold text-ink-gray-8',
              },
              props.badge > 99 ? '99+' : String(props.badge),
            )
          : null,
      ],
    ),
})
</script>
