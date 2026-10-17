<template>
  <ul class="divide-y divide-outline-gray-1" :aria-label="label">
    <li v-for="group in groups" :key="group.key" data-key-row class="relative">
      <div
        class="flex min-h-16 items-center gap-3 px-4 py-2"
        :class="group.unread ? '' : 'opacity-80'"
      >
        <span
          class="size-2 shrink-0 rounded-full"
          :class="group.unread ? 'bg-surface-blue-3' : 'bg-transparent'"
          :aria-label="group.unread ? __('Unread') : undefined"
        />
        <FeatherIcon
          :name="categoryMeta(group.category).icon"
          class="size-4 shrink-0 text-ink-gray-6"
          aria-hidden="true"
        />
        <!-- The whole text is the row: one tap opens the record. Titles wrap; the
             meta line is record · time; the body shows only when it adds something. -->
        <button
          data-row-link
          data-row-focus
          class="min-w-0 flex-1 rounded py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
          :aria-expanded="
            expanded === group.key || needsReason(group) ? 'true' : undefined
          "
          @click="activate(group)"
          @pointerenter="hover(group)"
          @pointerleave="unhover"
          @pointerdown="warm(group)"
          @focus="warm(group)"
        >
          <span
            class="line-clamp-2 block text-base [text-wrap:pretty]"
            :class="
              group.unread
                ? 'font-semibold text-ink-gray-9'
                : 'font-medium text-ink-gray-8'
            "
            >{{ group.title }}</span
          >
          <span class="line-clamp-1 block text-sm text-ink-gray-6">
            {{ metaLine(group, moment) }}
          </span>
          <span
            v-if="showBody(group)"
            class="mt-0.5 line-clamp-2 block text-sm text-ink-gray-7"
            >{{ group.body }}</span
          >
        </button>
        <!-- One trailing action: the row's others (read, mute) live in this menu. -->
        <Dropdown v-if="menu(group).length" :options="menu(group)">
          <Button
            variant="ghost"
            icon="more-vertical"
            class="min-h-11 min-w-11 flex-none"
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
            class="min-h-11"
            @click="$emit('read', group)"
          />
          <Button
            :label="__('Close')"
            variant="ghost"
            class="min-h-11"
            @click="expanded = ''"
          />
        </div>
      </div>
    </li>
  </ul>
</template>
<script setup>
import { onBeforeUnmount, ref } from 'vue'
import { Dropdown, FeatherIcon } from 'frappe-ui'
import { actionLabel, categoryMeta, metaLine } from '@/composables/useAvisos'

const props = defineProps({
  groups: { type: Array, default: () => [] },
  compact: { type: Boolean, default: false },
  label: { type: String, default: 'Avisos' },
})
const emit = defineEmits(['open', 'read', 'mute', 'warm'])
const expanded = ref('')

// «warm»: the worker is about to open this row, so the parent may fetch the
// page it leads to. A short hover delay skips rows the pointer only crosses.
let hoverTimer = null
function warm(group) {
  clearTimeout(hoverTimer)
  if (!needsReason(group)) emit('warm', group)
}
function hover(group) {
  clearTimeout(hoverTimer)
  hoverTimer = setTimeout(() => warm(group), 120)
}
function unhover() {
  clearTimeout(hoverTimer)
}
onBeforeUnmount(unhover)
const moment = {
  lang: globalThis.window?.lang,
  timezone: globalThis.window?.timezone,
}

function needsReason(group) {
  return !actionLabel(group)
}

// The body is shown only when it says something the title does not.
function showBody(group) {
  if (props.compact || !group.body) return false
  return expanded.value === group.key || !group.title?.startsWith(group.body)
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
  const items = []
  if (group.unread)
    items.push({
      label: __('Mark as read'),
      icon: 'check',
      onClick: () => emit('read', group),
    })
  if (group.muted || group.mutable)
    items.push(
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
    )
  return items
}
</script>
