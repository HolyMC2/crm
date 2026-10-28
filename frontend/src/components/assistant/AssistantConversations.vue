<template>
  <!-- Earlier conversations: the Desk bubble's sidebar in the sheet. One is
       read-only once closed; «Continue this conversation» starts a new one
       seeded with its questions (doco conversations.continue_from). -->
  <div
    class="space-y-3 py-2"
    :class="
      docked ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4' : ''
    "
    data-testid="assistant-conversations-view"
  >
    <template v-if="sessions.view === 'transcript' && sessions.transcript">
      <p class="text-sm text-ink-gray-6">
        {{ stamp(sessions.transcript.conversation) }}
      </p>
      <button
        type="button"
        class="min-h-11 w-full rounded-full bg-surface-gray-10 px-5 text-sm font-medium text-ink-base hover:bg-surface-gray-9 disabled:opacity-50"
        :disabled="sessions.busy"
        data-testid="assistant-continue"
        @click="continueConversation(sessions.transcript.conversation.id)"
      >
        {{ __('Continue this conversation') }}
      </button>
      <p
        v-if="sessions.transcript.messages.some((m) => m.stale)"
        class="text-center text-sm text-ink-gray-5"
      >
        {{
          __(
            'Earlier answers are not shown again. Ask again to see them with your access today.',
          )
        }}
      </p>
      <p v-if="!transcriptRows.length" class="text-sm text-ink-gray-6">
        {{ __('Nothing to show from this conversation.') }}
      </p>
      <div class="space-y-4" data-testid="assistant-transcript">
        <template v-for="message in transcriptRows" :key="message.id">
          <p
            v-if="message.role === 'user'"
            class="ml-auto w-fit max-w-[85%] whitespace-pre-line break-words rounded-8 bg-surface-gray-2 px-3 py-2 text-base text-ink-gray-9"
            data-role="user"
          >
            {{ message.text || message.file?.name }}
          </p>
          <AssistantProse
            v-else-if="proseOf(message, splitButtons(message).cards)"
            :text="proseOf(message, splitButtons(message).cards)"
            data-role="bot"
            @navigate="$emit('navigate')"
          />
        </template>
      </div>
    </template>

    <template v-else>
      <label class="block">
        <span class="sr-only">{{ __('Search conversations') }}</span>
        <input
          :value="sessions.query"
          type="search"
          class="min-h-11 w-full rounded-6 border border-outline-gray-2 bg-surface-white px-3 text-base text-ink-gray-9"
          :placeholder="__('Search conversations')"
          data-testid="assistant-search"
          @input="onSearch($event.target.value)"
        />
      </label>

      <template v-if="sessions.results">
        <p
          v-if="!sessions.results.results?.length"
          class="text-sm text-ink-gray-6"
        >
          {{ __('No conversation mentions «{0}».', [sessions.results.query]) }}
        </p>
        <ul class="divide-y divide-outline-gray-1">
          <li
            v-for="hit in sessions.results.results"
            :key="`${hit.conversation.id}-${hit.hit_at || 'title'}`"
          >
            <button
              type="button"
              class="block min-h-11 w-full py-2 text-left hover:bg-surface-gray-2"
              data-testid="assistant-search-hit"
              @click="openConversation(hit.conversation.id)"
            >
              <span class="block truncate text-sm font-medium text-ink-gray-9">
                {{ hit.conversation.title }}
              </span>
              <span
                v-if="hit.snippet"
                class="block truncate text-sm text-ink-gray-6"
              >
                <template
                  v-for="(part, i) in snippetParts(hit.snippet)"
                  :key="i"
                >
                  <mark v-if="part.mark" class="bg-[var(--brand-soft)]">{{
                    part.text
                  }}</mark>
                  <template v-else>{{ part.text }}</template>
                </template>
              </span>
            </button>
          </li>
        </ul>
      </template>

      <template v-else>
        <button
          v-if="sessions.current?.messages && !sessions.showArchived"
          type="button"
          class="block min-h-11 w-full rounded-6 border border-outline-gray-2 px-3 py-2 text-left hover:bg-surface-gray-2"
          data-testid="assistant-current"
          @click="openConversation(CURRENT)"
        >
          <span class="block text-xs font-medium text-ink-gray-6">
            {{ __('Current conversation') }}
          </span>
          <span class="block truncate text-sm text-ink-gray-9">
            {{ sessions.current.title || __('Current conversation') }}
          </span>
        </button>
        <p
          v-if="!sessions.available"
          class="text-sm text-ink-gray-6"
          data-testid="assistant-no-history"
        >
          {{ __('Earlier conversations are not kept on this site yet.') }}
        </p>
        <p v-else-if="!sessions.list.length" class="text-sm text-ink-gray-6">
          {{
            sessions.showArchived
              ? __('No archived conversations.')
              : __(
                  'No earlier conversations yet. «New conversation» keeps this one here.',
                )
          }}
        </p>
        <section v-for="group in groups" :key="group.key">
          <h3 class="mb-1 text-xs font-semibold text-ink-gray-6">
            {{ group.label }}
          </h3>
          <ul class="divide-y divide-outline-gray-1">
            <li
              v-for="row in group.rows"
              :key="row.id"
              class="flex items-center gap-1"
              :data-conversation="row.id"
            >
              <form
                v-if="renaming === row.id"
                class="flex min-h-11 flex-1 items-center gap-2 py-1"
                @submit.prevent="saveName(row)"
              >
                <input
                  ref="nameInput"
                  v-model="newName"
                  class="min-h-9 min-w-0 flex-1 rounded-6 border border-outline-gray-2 px-2 text-sm"
                  :aria-label="__('Conversation name')"
                  maxlength="140"
                  @keydown.esc.prevent="renaming = null"
                />
                <button
                  type="submit"
                  class="min-h-9 rounded-6 px-2 text-sm font-medium text-ink-gray-9 hover:bg-surface-gray-2"
                >
                  {{ __('Save') }}
                </button>
              </form>
              <button
                v-else
                type="button"
                class="block min-h-11 min-w-0 flex-1 py-2 text-left hover:bg-surface-gray-2"
                @click="openConversation(row.id)"
              >
                <span
                  class="block truncate text-sm font-medium text-ink-gray-9"
                  >{{ row.title }}</span
                >
                <span class="block truncate text-xs text-ink-gray-6">{{
                  stamp(row)
                }}</span>
              </button>
              <button
                type="button"
                class="flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-6 hover:bg-surface-gray-2"
                :aria-label="row.pinned ? __('Unpin') : __('Pin')"
                :title="row.pinned ? __('Unpin') : __('Pin')"
                @click="pinConversation(row.id, !row.pinned)"
              >
                <span
                  :class="row.pinned ? 'lucide-pin-off' : 'lucide-pin'"
                  class="size-4"
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                class="flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-6 hover:bg-surface-gray-2"
                :aria-label="__('Rename')"
                :title="__('Rename')"
                @click="startRename(row)"
              >
                <span class="lucide-pencil size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-6 hover:bg-surface-gray-2"
                :aria-label="row.archived ? __('Restore') : __('Archive')"
                :title="row.archived ? __('Restore') : __('Archive')"
                @click="archiveConversation(row.id, !row.archived)"
              >
                <span
                  :class="
                    row.archived ? 'lucide-archive-restore' : 'lucide-archive'
                  "
                  class="size-4"
                  aria-hidden="true"
                />
              </button>
            </li>
          </ul>
        </section>
        <button
          v-if="sessions.archivedCount || sessions.showArchived"
          type="button"
          class="min-h-11 text-sm font-medium text-ink-gray-7 underline"
          data-testid="assistant-archived"
          @click="toggleArchived"
        >
          {{
            sessions.showArchived
              ? __('Back to conversations')
              : __('Archived ({0})', [sessions.archivedCount])
          }}
        </button>
      </template>
    </template>

    <p v-if="sessions.error" role="alert" class="text-sm text-ink-red-7">
      {{ sessions.error }}
    </p>
  </div>
</template>
<script setup>
import { computed, nextTick, ref } from 'vue'
import { formatDateTime } from '@/utils/display'
import AssistantProse from './AssistantProse.vue'
import { proseOf, splitButtons, visibleMessages } from './assistantText'
import {
  CURRENT,
  archiveConversation,
  continueConversation,
  groupConversations,
  openConversation,
  pinConversation,
  renameConversation,
  searchConversations,
  sessions,
  toggleArchived,
} from './assistantSessions'

defineProps({ docked: { type: Boolean, default: false } })
defineEmits(['navigate'])

const groups = computed(() => groupConversations(sessions.list))
const transcriptRows = computed(() =>
  visibleMessages(sessions.transcript?.messages || []),
)

function stamp(row) {
  if (!row) return ''
  const parts = [formatDateTime(row.ended_at || row.started_at)]
  if (row.messages) parts.push(__('{0} messages', [row.messages]))
  return parts.filter(Boolean).join(' · ')
}

/** The server's snippet with its [begin, end) mark as separate parts. */
function snippetParts(snippet) {
  const text = snippet?.text || ''
  const [begin, end] = snippet?.mark || []
  if (begin == null) return [{ text }]
  return [
    { text: text.slice(0, begin) },
    { text: text.slice(begin, end), mark: true },
    { text: text.slice(end) },
  ].filter((p) => p.text)
}

let typing = null
function onSearch(value) {
  sessions.query = value
  clearTimeout(typing)
  typing = setTimeout(() => searchConversations(value), 250)
}

const renaming = ref(null)
const newName = ref('')
const nameInput = ref(null)
function startRename(row) {
  renaming.value = row.id
  newName.value = row.title
  nextTick(() => [nameInput.value].flat()[0]?.focus?.())
}
async function saveName(row) {
  const title = newName.value.trim()
  renaming.value = null
  if (title && title !== row.title) await renameConversation(row.id, title)
}
</script>
