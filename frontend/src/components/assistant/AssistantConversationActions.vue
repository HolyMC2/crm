<template>
  <!-- A conversation row's «⋯» (Marco 2026-11-05, T3 Code's thread menu):
       pin, resolve and snooze; rename, a new title and read state; copy,
       continue and archive. It unfolds in place under the row, so the
       scrolling list never clips it; «Snooze» swaps in its presets. -->
  <div
    ref="root"
    class="space-y-1 rounded-8 border border-outline-gray-1 bg-surface-base p-1"
    data-conversation-actions
    :aria-label="__('Actions for «{0}»', [row.title])"
    role="group"
    data-testid="assistant-conversation-actions"
    @keydown.esc.stop.prevent="$emit('close')"
  >
    <template v-if="snoozing">
      <p class="px-2 pt-1 text-xs font-medium text-ink-gray-5">
        {{ __('Back in the list, unread:') }}
      </p>
      <button
        v-for="option in SNOOZE_PRESETS"
        :key="option.preset"
        type="button"
        :class="ITEM"
        :data-snooze="option.preset"
        @click="run(() => snoozeConversation(row.id, option.preset))"
      >
        <span class="lucide-alarm-clock size-4 flex-none" aria-hidden="true" />
        {{ option.label() }}
      </button>
      <button type="button" :class="ITEM" @click="snoozing = false">
        <span class="lucide-undo-2 size-4 flex-none" aria-hidden="true" />
        {{ __('Back') }}
      </button>
    </template>
    <template v-else>
      <div
        v-for="(group, g) in groups"
        :key="g"
        :class="g && 'border-t border-outline-gray-1 pt-1'"
      >
        <button
          v-for="item in group"
          :key="item.key"
          type="button"
          :class="ITEM"
          :data-action="item.key"
          @click="item.run"
        >
          <span
            :class="item.icon"
            class="size-4 flex-none"
            aria-hidden="true"
          />
          {{ item.label }}
        </button>
      </div>
    </template>
  </div>
</template>
<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import {
  SNOOZE_PRESETS,
  archiveConversation,
  continueConversation,
  copyConversation,
  markUnread,
  pinConversation,
  retitleConversation,
  settleConversation,
  snoozeConversation,
} from './assistantSessions'

const props = defineProps({ row: { type: Object, required: true } })
const emit = defineEmits(['close', 'rename'])

const ITEM =
  'press flex min-h-10 w-full items-center gap-2 rounded-6 px-2 text-left text-sm text-ink-gray-8 hover:bg-surface-gray-2'

const snoozing = ref(false)
const root = ref(null)
// the keyboard lands in the menu, so Esc closes it and not the workspace
const focusFirst = () =>
  nextTick(() => root.value?.querySelector('button')?.focus())
onMounted(focusFirst)
watch(snoozing, focusFirst)

async function run(work) {
  emit('close')
  await work()
}

// icon classes stay literal: a class built at runtime is never generated
const groups = computed(() => {
  const row = props.row
  const live = []
  if (!row.archived) {
    live.push(
      {
        key: 'pin',
        icon: row.pinned ? 'lucide-pin-off' : 'lucide-pin',
        label: row.pinned ? __('Unpin') : __('Pin'),
        run: () => run(() => pinConversation(row.id, !row.pinned)),
      },
      {
        key: 'settle',
        icon: row.settled ? 'lucide-undo-2' : 'lucide-circle-check',
        label: row.settled ? __('Reopen') : __('Mark as resolved'),
        run: () => run(() => settleConversation(row.id, !row.settled)),
      },
      row.snoozed_until
        ? {
            key: 'unsnooze',
            icon: 'lucide-alarm-clock',
            label: __('Back to the list now'),
            run: () => run(() => snoozeConversation(row.id)),
          }
        : {
            key: 'snooze',
            icon: 'lucide-alarm-clock',
            label: __('Snooze…'),
            run: () => (snoozing.value = true),
          },
    )
  }
  const name = [
    {
      key: 'rename',
      icon: 'lucide-pencil',
      label: __('Rename'),
      run: () => {
        emit('close')
        emit('rename', row)
      },
    },
    {
      key: 'retitle',
      icon: 'lucide-sparkles',
      label: __('Regenerate title'),
      run: () => run(() => retitleConversation(row.id)),
    },
  ]
  if (!row.archived)
    name.push({
      key: 'unread',
      icon: 'lucide-circle-dot',
      label: row.unread
        ? __('Mark as read', null, 'Conversations')
        : __('Mark as unread'),
      run: () => run(() => markUnread(row.id, !row.unread)),
    })
  const keep = [
    {
      key: 'copy',
      icon: 'lucide-copy',
      label: __('Copy conversation'),
      run: () => run(() => copyConversation(row.id)),
    },
    {
      key: 'continue',
      icon: 'lucide-messages-square',
      label: __('Continue this conversation'),
      run: () => run(() => continueConversation(row.id)),
    },
    {
      key: 'archive',
      icon: row.archived ? 'lucide-archive-restore' : 'lucide-archive',
      label: row.archived ? __('Restore') : __('Archive'),
      run: () => run(() => archiveConversation(row.id, !row.archived)),
    },
  ]
  return [live, name, keep].filter((g) => g.length)
})
</script>
