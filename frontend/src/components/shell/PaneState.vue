<template>
  <!-- One pane-level state (CRM S5.4): loading, empty, denied or error, each
       with words and, where it helps, the action that moves the worker on.
       Never a blank pane. -->
  <div
    class="flex min-h-[12rem] flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center"
    :role="state === 'error' || state === 'denied' ? 'alert' : 'status'"
    :aria-busy="state === 'loading' || undefined"
    :data-pane-state="state"
  >
    <span
      class="size-6 flex-none text-ink-gray-5"
      :class="[icon, state === 'loading' ? 'animate-spin' : '']"
      aria-hidden="true"
    />
    <p class="text-base font-medium text-ink-gray-8">{{ heading }}</p>
    <p v-if="detail" class="max-w-sm text-sm text-ink-gray-6">{{ detail }}</p>
    <div v-if="actionLabel" class="mt-2">
      <Button :label="actionLabel" @click="act" />
    </div>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { Button } from 'frappe-ui'

const props = defineProps({
  /** 'loading' | 'empty' | 'denied' | 'error' */
  state: { type: String, required: true },
  /** Overrides the default heading of the state. */
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  /** Label of the next action; `retry` is emitted when it is pressed. */
  action: { type: String, default: '' },
  /** Error/denied without a handler: reload the page (keeps the route). */
  reload: { type: Boolean, default: false },
})
const emit = defineEmits(['retry'])

const ICONS = {
  loading: 'lucide-loader-circle',
  empty: 'lucide-inbox',
  denied: 'lucide-lock',
  error: 'lucide-circle-alert',
}
const icon = computed(() => ICONS[props.state] || ICONS.empty)
const heading = computed(
  () =>
    props.title ||
    {
      loading: __('Loading…'),
      empty: __('Nothing here yet'),
      denied: __('You do not have access to this'),
      error: __('This could not be loaded'),
    }[props.state] ||
    '',
)
const detail = computed(
  () =>
    props.message ||
    {
      denied: __('Ask your manager for access, or go back.'),
      error: __('Check your connection and try again.'),
    }[props.state] ||
    '',
)
const actionLabel = computed(
  () =>
    props.action ||
    (props.reload && props.state === 'error' ? __('Reload') : ''),
)
function act() {
  if (props.reload && !props.action) window.location.reload()
  else emit('retry')
}
</script>
