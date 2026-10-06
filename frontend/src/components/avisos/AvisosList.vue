<template>
  <ul class="divide-y divide-outline-gray-1" :aria-label="label">
    <li v-for="group in groups" :key="group.key" class="relative">
      <div
        class="flex min-h-16 items-start gap-3 px-4 py-2.5"
        :class="group.unread ? '' : 'opacity-80'"
      >
        <span
          class="mt-1.5 size-2 shrink-0 rounded-full"
          :class="group.unread ? 'bg-surface-blue-3' : 'bg-transparent'"
          :aria-label="group.unread ? __('Unread') : undefined"
        />
        <FeatherIcon
          :name="categoryMeta(group.category).icon"
          class="mt-0.5 size-4 shrink-0 text-ink-gray-6"
          aria-hidden="true"
        />
        <button
          class="min-w-0 flex-1 rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
          :aria-expanded="
            expanded === group.key || needsReason(group) ? 'true' : undefined
          "
          @click="activate(group)"
        >
          <span
            class="block truncate text-base"
            :class="
              group.unread
                ? 'font-semibold text-ink-gray-9'
                : 'font-medium text-ink-gray-8'
            "
            >{{ group.title }}</span
          >
          <span class="block truncate text-sm text-ink-gray-6">
            {{ metaLine(group, moment) }}
            <template v-if="group.target?.desk && !group.target?.route">
              · {{ __('Desk') }}
            </template>
          </span>
          <span
            v-if="expanded === group.key || (compact ? false : group.body)"
            class="mt-1 line-clamp-3 block text-sm text-ink-gray-7"
            >{{ group.body }}</span
          >
        </button>
        <Button
          v-if="group.unread"
          variant="ghost"
          icon="check"
          class="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8"
          :tooltip="__('Mark as read')"
          :aria-label="__('Mark as read: {0}', [group.title])"
          @click="$emit('read', group)"
        />
        <Dropdown v-if="group.mutable || group.muted" :options="menu(group)">
          <Button
            variant="ghost"
            icon="more-horizontal"
            class="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8"
            :aria-label="__('More actions: {0}', [group.title])"
          />
        </Dropdown>
      </div>
      <div
        v-if="expanded === group.key"
        role="status"
        class="mx-4 mb-3 ml-12 space-y-2 rounded-lg bg-surface-gray-1 p-3 text-sm text-ink-gray-7"
      >
        <p>{{ group.target?.reason }}</p>
        <div class="flex flex-wrap gap-2">
          <Button
            v-if="group.unread"
            :label="__('Mark as read')"
            @click="$emit('read', group)"
          />
          <Button :label="__('Close')" variant="ghost" @click="expanded = ''" />
        </div>
      </div>
    </li>
  </ul>
</template>
<script setup>
import { ref } from 'vue'
import { Dropdown, FeatherIcon } from 'frappe-ui'
import { categoryMeta, metaLine } from '@/composables/useAvisos'

defineProps({
  groups: { type: Array, default: () => [] },
  compact: { type: Boolean, default: false },
  label: { type: String, default: 'Avisos' },
})
const emit = defineEmits(['open', 'read', 'mute'])
const expanded = ref('')
const moment = {
  lang: globalThis.window?.lang,
  timezone: globalThis.window?.timezone,
}

function needsReason(group) {
  return !group.target?.route && !group.target?.desk
}

// A group with nowhere to go explains why instead of opening a dead link.
function activate(group) {
  if (needsReason(group)) {
    expanded.value = expanded.value === group.key ? '' : group.key
    return
  }
  emit('open', group)
}

function menu(group) {
  return [
    group.muted
      ? {
          label: __('Unmute this kind'),
          icon: 'bell',
          onClick: () => emit('mute', group, false),
        }
      : {
          label: __('Mute this kind'),
          icon: 'bell-off',
          onClick: () => emit('mute', group, true),
        },
  ]
}
</script>
