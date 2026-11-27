<!-- The one sign that the lists stopped following along: a grey cloud beside
     the bell (the phone's bar, the desktop's top bar), only while the live
     connection has been down past its grace and the browser is online (the
     amber banner speaks for an offline browser). A tap reconnects now. -->
<template>
  <button
    v-if="shown"
    type="button"
    class="press flex flex-none items-center rounded-6 text-ink-gray-6 hover:bg-surface-gray-2 hover:text-ink-gray-8"
    :class="
      bar
        ? 'h-7 gap-1.5 rounded-full px-2.5 text-sm'
        : rail && expanded
          ? 'h-8 w-full gap-3 px-2.5 text-sm'
          : rail
            ? 'size-10 justify-center'
            : 'size-11 justify-center rounded-full'
    "
    :aria-label="tip"
    :title="rail && !expanded ? undefined : tip"
    :data-tip="rail ? tip : undefined"
    :aria-busy="retrying ? 'true' : undefined"
    data-testid="live-sign"
    @click="retry"
  >
    <span
      :class="[
        retrying ? 'lucide-loader-circle animate-spin' : 'lucide-cloud-off',
        bar ? 'size-4' : rail ? 'size-[18px]' : 'size-5',
        'flex-none',
      ]"
      aria-hidden="true"
    />
    <span
      v-if="bar"
      class="hidden whitespace-nowrap lg:inline"
      aria-hidden="true"
      >{{ retrying ? __('Reconnecting…') : __('Not updating') }}</span
    >
    <template v-else-if="rail && expanded">
      <span class="flex-1 truncate text-left" aria-hidden="true">{{
        retrying ? __('Reconnecting…') : __('Not updating')
      }}</span>
      <span v-if="!retrying" class="num text-xs" aria-hidden="true">{{
        at
      }}</span>
    </template>
  </button>
</template>
<script setup>
import { computed } from 'vue'
import { useOnline } from '@vueuse/core'
import { liveConnection } from '@/composables/liveConnection'

defineProps({
  /** In the desktop's top bar: the cloud and its words. */
  bar: Boolean,
  rail: Boolean,
  expanded: Boolean,
})

const { down, since, retrying, retry } = liveConnection()
const online = useOnline()
const shown = computed(() => down.value && online.value)

const clock = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const at = computed(() => (since.value ? clock.format(since.value) : ''))
const tip = computed(() =>
  retrying.value
    ? __('Reconnecting…')
    : __('Reconnect: lists have not updated since {0}', [at.value]),
)
</script>
