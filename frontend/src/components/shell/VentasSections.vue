<template>
  <section class="px-4 pt-5">
    <h2
      class="pb-2 text-xs font-semibold uppercase tracking-wide text-ink-gray-6"
    >
      Ventas
    </h2>
    <nav class="grid grid-cols-2 gap-1" :aria-label="__('Ventas sections')">
      <RouterLink
        v-for="item in [...primary, ...secondary]"
        :key="item.key"
        :to="item.to"
        class="flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 text-sm"
        :class="
          groupOf(route.path) === item.group
            ? 'bg-surface-gray-3 font-semibold'
            : 'bg-surface-gray-1'
        "
        :aria-current="groupOf(route.path) === item.group ? 'page' : undefined"
        @click="$emit('navigate')"
      >
        <component
          :is="item.icon"
          class="size-4 flex-none"
          aria-hidden="true"
        />
        <span class="min-w-0 flex-1 truncate">{{ __(item.label) }}</span>
        <span
          v-if="item.badge && badgeFor(item.badge)"
          class="rounded-full bg-surface-gray-3 px-1.5 text-xs font-semibold"
          >{{ badgeFor(item.badge) }}</span
        >
      </RouterLink>
    </nav>
    <!-- Web Push for conversations (was in the phone drawer); hidden when the
         browser or site cannot do it. -->
    <button
      v-if="
        addonAvailable && !['unsupported', 'unconfigured'].includes(pushState)
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
import { watch } from 'vue'
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
const { primary, secondary, groupOf, badgeFor } = useVentasNav()
watch(addonAvailable, (available) => available && refreshPushState(), {
  immediate: true,
})
function togglePush() {
  if (pushState.value === 'on') disablePush()
  else enablePush() // user gesture: the permission prompt may appear
}
</script>
