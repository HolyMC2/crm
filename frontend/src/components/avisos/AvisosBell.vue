<template>
  <div :class="rail ? '' : 'flex-none'">
    <!-- Rail: spans the rail so the 400px panel opens beside it, from the top. -->
    <div
      v-if="rail"
      class="pointer-events-none absolute left-0 top-0 h-full w-full [&>*]:pointer-events-auto"
    >
      <!-- Ventas adds its calendar reminders to the same panel. -->
      <VentasNotifications v-if="ventas" />
      <AvisosPanel v-else v-model:open="avisosPanelOpen" />
    </div>
    <button
      class="relative flex flex-none items-center rounded-lg hover:bg-surface-gray-2"
      :class="
        rail && expanded
          ? 'h-9 w-full gap-3 px-2.5 text-sm text-ink-gray-7'
          : rail
            ? 'size-10 justify-center text-ink-gray-6'
            : 'size-11 justify-center text-ink-gray-7'
      "
      :aria-label="ariaLabel"
      :title="rail && !expanded ? __('Avisos') : undefined"
      :aria-current="active ? 'page' : undefined"
      @click="open"
    >
      <span
        :class="['lucide-bell flex-none', rail ? 'size-[18px]' : 'size-5']"
        aria-hidden="true"
      />
      <span v-if="rail && expanded" class="flex-1 truncate text-left" aria-hidden="true">{{
        __('Avisos')
      }}</span>
      <span
        v-if="label"
        class="pointer-events-none min-w-4 rounded-full bg-surface-red-7 px-1 text-center text-[10px] font-semibold leading-4 text-ink-red-1"
        :class="rail && expanded ? '' : 'absolute right-0.5 top-0.5'"
        aria-hidden="true"
        >{{ label }}</span
      >
    </button>
  </div>
</template>
<script setup>
import {
  computed,
  defineAsyncComponent,
  getCurrentInstance,
  onMounted,
  watch,
} from 'vue'
import { useRouter } from 'vue-router'
import AvisosPanel from '@/components/avisos/AvisosPanel.vue'
import { shellBoot } from '@/composables/muelleShell'
import {
  avisosBadge,
  avisosPanelOpen,
  badgeLabel,
  startAvisosLive,
} from '@/composables/useAvisos'

// The Avisos entry of the shell (spec §1.1): desktop rail bell with the
// slide-over, phone header bell that opens the /avisos page.
const props = defineProps({
  rail: Boolean,
  /** Rail shown with names (shellRail): the bell reads «Avisos» and its count inline. */
  expanded: Boolean,
  ventas: Boolean,
  active: Boolean,
})
const VentasNotifications = defineAsyncComponent(
  () => import('@/components/Notifications.vue'),
)

const router = useRouter()
const socket = getCurrentInstance()?.appContext.config.globalProperties.$socket
const label = computed(() => badgeLabel(avisosBadge.value))
const ariaLabel = computed(() =>
  label.value
    ? __('Avisos, {0} to review', [label.value])
    : __('Avisos, nothing new'),
)

function open() {
  if (!props.rail) {
    router.push('/avisos')
    return
  }
  avisosPanelOpen.value = !avisosPanelOpen.value
}

// The boot carries the first count; live updates refresh it afterwards.
watch(
  () => shellBoot.value?.modules?.avisos?.badge,
  (badge) => {
    if (badge) avisosBadge.value = badge
  },
  { immediate: true },
)
onMounted(() => startAvisosLive(socket))
</script>
