<template>
  <section>
    <h2
      v-if="part === 'daily'"
      class="pb-2 text-sm font-semibold text-ink-gray-7"
    >
      {{ __('Ventas') }}
    </h2>
    <template v-for="section in sections" :key="section.key">
      <h3
        v-if="section.label && section.items.length"
        class="pb-1.5 pt-3 text-xs font-medium text-ink-gray-5"
      >
        {{ __(section.label) }}
      </h3>
      <nav
        v-if="section.items.length"
        class="grid grid-cols-2 gap-1"
        :aria-label="section.label ? __(section.label) : __('Ventas sections')"
        :data-ventas-nav="section.key"
      >
        <RouterLink
          v-for="item in section.items"
          :key="item.key"
          :to="item.to"
          class="flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 text-sm"
          :class="
            groupOf(route.path) === item.group
              ? 'bg-surface-gray-3 font-semibold'
              : 'bg-surface-gray-1'
          "
          :aria-current="
            groupOf(route.path) === item.group ? 'page' : undefined
          "
          @click="$emit('navigate')"
        >
          <component
            :is="item.icon"
            class="size-4 flex-none"
            aria-hidden="true"
          />
          <!-- At 305px a label wraps to two lines between words (SPEC §1.3)
               instead of ending in «…». -->
          <span class="line-clamp-2 min-w-0 flex-1 py-1 leading-tight">{{
            __(item.label)
          }}</span>
          <span
            v-if="item.badge && badgeFor(item.badge)"
            class="rounded-full bg-surface-gray-3 px-1.5 text-xs font-semibold"
            >{{ badgeFor(item.badge) }}</span
          >
        </RouterLink>
      </nav>
    </template>
    <!-- Web Push for conversations (was in the phone drawer); hidden when the
         browser or site cannot do it. -->
    <button
      v-if="
        part === 'rest' &&
        addonAvailable &&
        !['unsupported', 'unconfigured'].includes(pushState)
      "
      class="mt-2 flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm"
      role="switch"
      :aria-checked="pushState === 'on'"
      :disabled="pushBusy || pushState === 'denied'"
      @click="togglePush"
    >
      <span class="lucide-bell-ring size-4 flex-none" aria-hidden="true" />
      <span class="flex-1">
        {{
          pushState === 'denied'
            ? __('Notifications blocked')
            : __('Push notifications')
        }}
      </span>
      <span
        v-if="pushState !== 'denied'"
        class="relative h-5 w-9 flex-none rounded-full"
        :class="pushState === 'on' ? 'bg-surface-gray-7' : 'bg-surface-gray-4'"
        aria-hidden="true"
      >
        <span
          class="absolute top-0.5 size-4 rounded-full bg-surface-base"
          :class="pushState === 'on' ? 'left-[18px]' : 'left-0.5'"
        />
      </span>
    </button>
  </section>
</template>
<script setup>
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useVentasNav } from '@/composables/ventasNav'
import {
  disablePush,
  enablePush,
  pushBusy,
  pushState,
  refreshPushState,
} from '@/composables/push'
import { addonAvailable } from '@/utils/crmCapabilities'

defineEmits(['navigate'])
const route = useRoute()
const { primary, more, settings, groupOf, badgeFor } = useVentasNav()
// Phone «Más»: `daily` is the three lists a seller works from (Tratos,
// Prospectos, Bandeja); `rest` is everything else, shown under «Configuración».
const props = defineProps({
  part: { type: String, default: 'daily' },
})
const sections = computed(() =>
  props.part === 'daily'
    ? [{ key: 'daily', label: '', items: primary.value }]
    : [
        // The sheet itself is «Más», so this heading says «Otras listas».
        { key: 'more', label: 'Other lists', items: more.value },
        { key: 'settings', label: 'Settings', items: settings.value },
      ],
)
watch(addonAvailable, (available) => available && refreshPushState(), {
  immediate: true,
})
function togglePush() {
  if (pushState.value === 'on') disablePush()
  else enablePush() // user gesture: the permission prompt may appear
}
</script>
