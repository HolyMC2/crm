<template>
  <!-- The workspace's left column (Marco 2026-11-05: «leftside sessions/
       threads», as in Claude and T3 Code): a new conversation, search, the
       agenda, «Abierto» and the Lienzo, then the live conversation and the
       earlier ones, pinned first, two lines each (the title, then when and how
       long), with room between rows (Marco 2026-11-10: «too dense»). The same
       store and gates
       as «Conversaciones» (assistantSessions); a row's pin, archive and «⋯»
       show on hover or focus, and «⋯» unfolds the rest under it (resolve,
       snooze, rename, a new title, unread, copy, continue). -->
  <nav
    class="flex min-h-0 flex-1 flex-col"
    :aria-label="__('Conversations')"
    data-testid="assistant-sidebar"
  >
    <div class="flex-none space-y-0.5 px-2 pb-2">
      <button
        type="button"
        class="press flex min-h-9 w-full items-center gap-2.5 rounded-6 px-2.5 text-sm text-ink-gray-9 hover:bg-surface-gray-3 disabled:opacity-50"
        :title="__('New conversation (settles what is finished)')"
        :disabled="sessions.busy"
        data-testid="assistant-sidebar-new"
        @click="newConversation"
      >
        <span class="lucide-square-pen size-4 flex-none" aria-hidden="true" />
        {{ __('New conversation') }}
      </button>
      <label class="relative block py-1">
        <span class="sr-only">{{ __('Search conversations') }}</span>
        <span
          class="lucide-search pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-gray-5"
          aria-hidden="true"
        />
        <input
          :value="sessions.query"
          type="search"
          class="min-h-9 w-full rounded-full border border-outline-gray-1 bg-surface-base pl-9 pr-3 text-sm text-ink-gray-9 placeholder:text-ink-gray-5 focus:border-outline-gray-3"
          :placeholder="__('Search conversations')"
          data-testid="assistant-sidebar-search"
          @input="onSearch($event.target.value)"
        />
      </label>
      <template v-if="!sessions.results && !sessions.showArchived">
        <button
          v-if="agenda.available"
          type="button"
          class="press flex min-h-9 w-full items-center gap-2.5 rounded-6 px-2.5 text-left text-sm text-ink-gray-9 hover:bg-surface-gray-3"
          :aria-label="agendaLabel"
          data-testid="assistant-sidebar-agenda"
          @click="showView('agenda')"
        >
          <span
            class="lucide-calendar-clock size-4 flex-none text-ink-gray-6"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1 truncate">{{ __('Agenda') }}</span>
          <span
            v-if="due"
            class="num min-w-5 flex-none rounded-full bg-[var(--muelle-accent)] px-1.5 text-center text-xs font-semibold leading-5 text-[var(--muelle-accent-ink)]"
            aria-hidden="true"
            >{{ due > 99 ? '99+' : due }}</span
          >
        </button>
        <button
          type="button"
          class="press flex min-h-9 w-full items-center gap-2.5 rounded-6 px-2.5 text-left text-sm text-ink-gray-9 hover:bg-surface-gray-3"
          :aria-label="openLabel"
          data-testid="assistant-sidebar-open"
          @click="showView('open')"
        >
          <span
            class="lucide-inbox size-4 flex-none text-ink-gray-6"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1 truncate">{{ __('Open work') }}</span>
          <span
            v-if="sessions.work.count"
            class="num min-w-5 flex-none rounded-full bg-[var(--muelle-accent)] px-1.5 text-center text-xs font-semibold leading-5 text-[var(--muelle-accent-ink)]"
            aria-hidden="true"
            >{{ sessions.work.count > 99 ? '99+' : sessions.work.count }}</span
          >
        </button>
        <button
          v-if="canvas.available"
          type="button"
          class="press flex min-h-9 w-full items-center gap-2.5 rounded-6 px-2.5 text-left text-sm hover:bg-surface-gray-3"
          :class="
            sessions.view === 'canvas'
              ? 'bg-surface-gray-3 text-ink-gray-9'
              : 'text-ink-gray-9'
          "
          :aria-current="sessions.view === 'canvas' ? 'true' : undefined"
          data-testid="assistant-sidebar-canvas"
          @click="showView('canvas')"
        >
          <span
            class="lucide-layout-dashboard size-4 flex-none text-ink-gray-6"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1 truncate">{{ __('Lienzo') }}</span>
          <span
            v-if="canvas.files.length"
            class="num flex-none text-xs text-ink-gray-5"
            >{{ canvas.files.length }}</span
          >
        </button>
      </template>
    </div>

    <div
      class="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-2 pb-3 pt-2"
    >
      <ul v-if="sessions.results" class="space-y-0.5">
        <li
          v-if="!sessions.results.results?.length"
          class="px-3 py-2 text-sm text-ink-gray-6"
        >
          {{ __('No conversation mentions «{0}».', [sessions.results.query]) }}
        </li>
        <li
          v-for="hit in sessions.results.results"
          :key="`${hit.conversation.id}-${hit.hit_at || 'title'}`"
        >
          <button
            type="button"
            class="block w-full rounded-6 px-3 py-2 text-left hover:bg-surface-gray-3"
            data-testid="assistant-sidebar-hit"
            @click="openConversation(hit.conversation.id)"
          >
            <span class="block truncate text-sm text-ink-gray-9">{{
              hit.conversation.title
            }}</span>
            <span
              v-if="hit.snippet?.text"
              class="block truncate text-xs text-ink-gray-6"
              >{{ hit.snippet.text }}</span
            >
          </button>
        </li>
      </ul>

      <template v-else>
        <button
          v-if="!sessions.showArchived"
          type="button"
          class="flex min-h-11 w-full items-center gap-2 rounded-6 px-3 py-2 text-left text-sm"
          :class="
            sessions.view === 'transcript'
              ? 'text-ink-gray-8 hover:bg-surface-gray-3'
              : 'bg-surface-gray-3 font-medium text-ink-gray-9'
          "
          :aria-current="sessions.view === 'transcript' ? undefined : 'true'"
          data-testid="assistant-sidebar-current"
          @click="openConversation(CURRENT)"
        >
          <span
            class="size-2 flex-none rounded-full"
            :class="
              assistant.thinking ? 'bg-[var(--brand)]' : 'bg-surface-gray-5'
            "
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1 truncate">{{ currentTitle }}</span>
        </button>
        <p
          v-if="!sessions.available"
          class="px-3 text-sm text-ink-gray-6"
          data-testid="assistant-sidebar-unavailable"
        >
          {{ __('Earlier conversations are not kept on this site yet.') }}
        </p>
        <p
          v-else-if="sessions.showArchived && !sessions.list.length"
          class="px-3 text-sm text-ink-gray-6"
        >
          {{ __('No archived conversations.') }}
        </p>
        <p
          v-if="sessions.showArchived && sessions.archiveDays"
          class="px-3 text-sm text-ink-gray-6"
          data-testid="assistant-sidebar-archive-rule"
        >
          {{ archiveRuleText(sessions.archiveDays) }}
        </p>
        <section v-for="group in groups" :key="group.key">
          <h3 class="px-3 pb-1.5 text-xs font-medium text-ink-gray-5">
            {{ group.label }}
          </h3>
          <ul class="space-y-1">
            <li
              v-for="row in group.rows"
              :key="row.id"
              :data-conversation="row.id"
            >
              <div
                class="group relative flex items-center rounded-6"
                :class="
                  openId === row.id || menuFor === row.id
                    ? 'bg-surface-gray-3'
                    : 'hover:bg-surface-gray-3'
                "
              >
                <form
                  v-if="renaming === row.id"
                  class="flex min-h-11 flex-1 items-center gap-1 px-1"
                  @submit.prevent="saveName(row)"
                >
                  <input
                    ref="nameInput"
                    v-model="newName"
                    class="min-h-9 min-w-0 flex-1 rounded-6 border border-outline-gray-2 px-2 text-sm"
                    :aria-label="__('Conversation name')"
                    maxlength="140"
                    @keydown.esc.stop.prevent="renaming = null"
                  />
                  <button
                    type="submit"
                    class="min-h-9 rounded-6 px-2 text-sm font-medium text-ink-gray-9 hover:bg-surface-gray-2"
                  >
                    {{ __('Save') }}
                  </button>
                </form>
                <template v-else>
                  <button
                    type="button"
                    class="block min-h-14 min-w-0 flex-1 px-3 py-2.5 text-left"
                    :aria-current="openId === row.id ? 'true' : undefined"
                    :title="row.title"
                    @click="openConversation(row.id)"
                  >
                    <span class="flex items-center gap-1.5">
                      <span
                        v-if="row.unread"
                        class="size-2 flex-none rounded-full bg-[var(--brand)]"
                        :title="__('Unread')"
                        data-mark="unread"
                      />
                      <span
                        v-if="row.settled"
                        class="lucide-circle-check size-3.5 flex-none text-ink-gray-5"
                        :title="__('Resolved')"
                        data-mark="settled"
                      />
                      <span
                        class="block min-w-0 truncate text-sm leading-5"
                        :class="
                          row.unread
                            ? 'font-semibold text-ink-gray-9'
                            : row.settled
                              ? 'text-ink-gray-6'
                              : 'text-ink-gray-9'
                        "
                        >{{ row.title }}</span
                      >
                    </span>
                    <span
                      class="mt-0.5 block truncate text-xs text-ink-gray-5"
                      data-testid="assistant-sidebar-stamp"
                      >{{ stamp(row) }}</span
                    >
                  </button>
                  <!-- the row's island: shown on hover or keyboard focus -->
                  <div
                    class="absolute inset-y-0 right-1 items-center rounded-6 bg-surface-gray-3 group-focus-within:flex group-hover:flex"
                    :class="menuFor === row.id ? 'flex' : 'hidden'"
                  >
                    <button
                      type="button"
                      class="flex size-8 items-center justify-center rounded-full text-ink-gray-6 hover:bg-surface-gray-4"
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
                      class="flex size-8 items-center justify-center rounded-full text-ink-gray-6 hover:bg-surface-gray-4"
                      :aria-label="row.archived ? __('Restore') : __('Archive')"
                      :title="row.archived ? __('Restore') : __('Archive')"
                      @click="archiveConversation(row.id, !row.archived)"
                    >
                      <span
                        :class="
                          row.archived
                            ? 'lucide-archive-restore'
                            : 'lucide-archive'
                        "
                        class="size-4"
                        aria-hidden="true"
                      />
                    </button>
                    <button
                      type="button"
                      class="flex size-8 items-center justify-center rounded-full text-ink-gray-6 hover:bg-surface-gray-4"
                      :aria-label="__('More actions: {0}', [row.title])"
                      :title="__('More actions')"
                      :aria-expanded="menuFor === row.id ? 'true' : 'false'"
                      data-testid="assistant-sidebar-more"
                      @click="toggleMenu(row.id)"
                    >
                      <span class="lucide-ellipsis size-4" aria-hidden="true" />
                    </button>
                  </div>
                </template>
              </div>
              <ExpandTransition>
                <AssistantConversationActions
                  v-if="menuFor === row.id"
                  :row="row"
                  class="my-1"
                  @close="closeMenu(row.id)"
                  @rename="startRename"
                />
              </ExpandTransition>
            </li>
          </ul>
        </section>
      </template>
      <section
        v-if="
          !sessions.results && !sessions.showArchived && sessions.snoozed.length
        "
        data-testid="assistant-sidebar-snoozed"
      >
        <h3 class="px-2.5 pb-1 text-xs font-medium text-ink-gray-5">
          {{ __('Snoozed') }}
        </h3>
        <ul class="space-y-1">
          <li
            v-for="row in sessions.snoozed"
            :key="row.id"
            class="flex items-center rounded-6 hover:bg-surface-gray-3"
            :data-conversation="row.id"
          >
            <button
              type="button"
              class="block min-h-14 min-w-0 flex-1 px-3 py-2.5 text-left"
              :title="row.title"
              @click="openConversation(row.id)"
            >
              <span class="block truncate text-sm text-ink-gray-7">{{
                row.title
              }}</span>
              <span class="mt-0.5 block truncate text-xs text-ink-gray-5">{{
                __('Back {0}', [formatDateTime(row.snoozed_until)])
              }}</span>
            </button>
            <button
              type="button"
              class="mr-1 flex size-8 flex-none items-center justify-center rounded-full text-ink-gray-6 hover:bg-surface-gray-4"
              :aria-label="__('Back to the list now: {0}', [row.title])"
              :title="__('Back to the list now')"
              @click="snoozeConversation(row.id)"
            >
              <span class="lucide-undo-2 size-4" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </section>
      <p v-if="sessions.error" role="alert" class="px-3 text-sm text-ink-red-7">
        {{ sessions.error }}
      </p>
      <p
        v-else-if="sessions.notice"
        role="status"
        class="px-3 text-sm text-ink-gray-6"
      >
        {{ sessions.notice }}
      </p>
    </div>

    <button
      v-if="sessions.archivedCount || sessions.showArchived"
      type="button"
      class="flex min-h-11 flex-none items-center gap-2 border-t border-outline-gray-1 px-[1.125rem] text-sm text-ink-gray-7 hover:bg-surface-gray-3"
      data-testid="assistant-sidebar-archived"
      @click="toggleArchived"
    >
      <span class="lucide-archive size-4" aria-hidden="true" />
      {{
        sessions.showArchived
          ? __('Back to conversations')
          : __('Archived ({0})', [sessions.archivedCount])
      }}
    </button>
  </nav>
</template>
<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { formatDateTime } from '@/utils/display'
import ExpandTransition from '@/components/ui/ExpandTransition.vue'
import AssistantConversationActions from './AssistantConversationActions.vue'
import { agenda, dueCount } from './assistantAgenda'
import { canvas } from './assistantCanvas'
import { assistant } from './useAssistant'
import {
  CURRENT,
  archiveConversation,
  groupConversations,
  loadConversations,
  newConversation,
  openConversation,
  pinConversation,
  renameConversation,
  searchConversations,
  sessions,
  showView,
  snoozeConversation,
  toggleArchived,
} from './assistantSessions'
import { archiveRuleText } from './assistantArchive'

const due = computed(() => dueCount(agenda.items))
const agendaLabel = computed(() =>
  due.value ? __('Agenda ({0} today)', [due.value]) : __('Agenda'),
)
const openLabel = computed(() =>
  sessions.work.count
    ? __('Open work ({0})', [sessions.work.count])
    : __('Open work'),
)

const groups = computed(() => groupConversations(sessions.list))
const openId = computed(() =>
  sessions.view === 'transcript' ? sessions.transcript?.conversation?.id : null,
)
const currentTitle = computed(
  () =>
    (assistant.messages.length && sessions.current?.title) ||
    (assistant.messages.length
      ? __('Current conversation')
      : __('New conversation')),
)

onMounted(loadConversations)
// a reset (new, continue, settle) put the old conversation in the list
watch(
  () => sessions.busy,
  (busy, was) => was && !busy && loadConversations(),
)
// the live one gets its title from its first question
watch(
  () => assistant.thinking,
  (thinking, was) => was && !thinking && loadConversations(),
)

function stamp(row) {
  const parts = [formatDateTime(row.ended_at || row.started_at)]
  if (row.messages) parts.push(__('{0} messages', [row.messages]))
  return parts.filter(Boolean).join(' · ')
}

let typing = null
function onSearch(value) {
  sessions.query = value
  clearTimeout(typing)
  typing = setTimeout(() => searchConversations(value), 250)
}

const menuFor = ref(null)
function toggleMenu(id) {
  menuFor.value = menuFor.value === id ? null : id
}
function closeMenu(id) {
  if (menuFor.value !== id) return
  menuFor.value = null
  // back to the row's «⋯», where the keyboard was
  nextTick(() =>
    document
      .querySelector(
        `[data-conversation="${CSS.escape(id)}"] [data-testid="assistant-sidebar-more"]`,
      )
      ?.focus(),
  )
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
