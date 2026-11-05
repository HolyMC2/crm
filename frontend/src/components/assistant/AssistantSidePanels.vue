<template>
  <!-- The workspace's right column (Marco 2026-11-05: «rightside floating
       windows with cool data and features»): cards beside the conversation,
       never over it. What the screen is about with its quick questions, the
       work left open, the agenda, the Lienzo and this conversation's facts.
       Each card folds; the folds are remembered on this device. -->
  <div class="space-y-3 p-3" data-testid="assistant-side-panels">
    <AssistantPanelCard
      v-if="screenTitle"
      v-model:open="folds.screen"
      name="screen"
      :title="__('This screen')"
      icon="lucide-monitor"
    >
      <p class="pt-2 text-sm text-ink-gray-9">{{ screenTitle }}</p>
      <label class="flex min-h-11 items-center gap-2 text-sm text-ink-gray-8">
        <input
          v-model="assistant.contextOn"
          type="checkbox"
          class="rounded border-outline-gray-3"
          data-testid="assistant-panel-context"
        />
        {{ __('Answer about this screen') }}
      </label>
      <div v-if="chips.length" class="flex flex-wrap gap-2">
        <button
          v-for="chip in chips"
          :key="chip.label"
          type="button"
          class="press min-h-9 rounded-6 border border-outline-gray-2 px-3 text-sm text-ink-gray-8 hover:bg-surface-gray-2 disabled:opacity-50"
          :disabled="assistant.thinking"
          @click="useChip(chip)"
        >
          {{ chip.label }}
        </button>
      </div>
    </AssistantPanelCard>

    <AssistantPanelCard
      v-model:open="folds.open"
      name="open"
      :title="__('Open work')"
      icon="lucide-inbox"
      :count="sessions.work.count"
    >
      <div class="max-h-[45vh] overflow-y-auto overscroll-contain">
        <AssistantOpenWork @navigate="$emit('navigate')" />
      </div>
    </AssistantPanelCard>

    <AssistantPanelCard
      v-if="agenda.available"
      v-model:open="folds.agenda"
      name="agenda"
      :title="__('Agenda')"
      icon="lucide-calendar-clock"
      :count="due"
    >
      <div class="max-h-[45vh] overflow-y-auto overscroll-contain">
        <AssistantAgenda @navigate="$emit('navigate')" />
      </div>
    </AssistantPanelCard>

    <AssistantPanelCard
      v-if="canvas.available"
      v-model:open="folds.canvas"
      name="canvas"
      :title="__('Lienzo')"
      icon="lucide-layout-dashboard"
      :count="canvas.files.length"
    >
      <p v-if="!canvas.files.length" class="pt-2 text-sm text-ink-gray-6">
        {{ __('Charts and tables Muelle makes for you show up here.') }}
      </p>
      <ul v-else class="divide-y divide-outline-gray-1">
        <li v-for="file in recentFiles" :key="file.file">
          <button
            type="button"
            class="press flex min-h-11 w-full items-center gap-2 py-1.5 text-left text-sm hover:bg-surface-gray-2"
            :data-canvas="file.file"
            @click="openFile(file)"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate text-ink-gray-9">{{
                file.file
              }}</span>
              <span class="block truncate text-xs text-ink-gray-6">{{
                relativeTime(file.modified)
              }}</span>
            </span>
            <span class="flex-none text-xs text-ink-gray-5">{{
              file.kind
            }}</span>
          </button>
        </li>
      </ul>
      <button
        v-if="canvas.files.length > recentFiles.length"
        type="button"
        class="min-h-11 text-sm font-medium text-ink-gray-7 underline"
        @click="showView('canvas')"
      >
        {{ __('See all ({0})', [canvas.files.length]) }}
      </button>
    </AssistantPanelCard>

    <AssistantPanelCard
      v-model:open="folds.conversation"
      name="conversation"
      :title="__('This conversation')"
      icon="lucide-message-square"
    >
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 pt-2 text-sm">
        <template v-if="models.available">
          <dt class="text-ink-gray-6">{{ __('Model') }}</dt>
          <dd class="min-w-0 truncate text-right text-ink-gray-9">
            {{ modelText }}
          </dd>
        </template>
        <dt class="text-ink-gray-6">{{ __('Questions') }}</dt>
        <dd
          class="num text-right text-ink-gray-9"
          data-testid="assistant-stat-questions"
        >
          {{ stats.questions }}
        </dd>
        <dt class="text-ink-gray-6">{{ __('Answers') }}</dt>
        <dd class="num text-right text-ink-gray-9">{{ stats.answers }}</dd>
        <template v-if="stats.files">
          <dt class="text-ink-gray-6">{{ __('Files on the Lienzo') }}</dt>
          <dd class="num text-right text-ink-gray-9">{{ stats.files }}</dd>
        </template>
        <template v-if="stats.started">
          <dt class="text-ink-gray-6">{{ __('Started') }}</dt>
          <dd class="text-right text-ink-gray-9">{{ stats.started }}</dd>
        </template>
      </dl>
    </AssistantPanelCard>
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, onMounted, watch } from 'vue'
import { useStorage } from '@vueuse/core'
import { formatDateTime, relativeTime } from '@/utils/display'
import AssistantOpenWork from './AssistantOpenWork.vue'
import AssistantPanelCard from './AssistantPanelCard.vue'
import { agenda, dueCount, loadAgenda } from './assistantAgenda'
import { canvas, loadCanvas, openInCanvas } from './assistantCanvas'
import { effortLabel, models, shortLabel } from './assistantModels'
import { loadOpenWork, sessions, showView } from './assistantSessions'
import { chipsFor, isProgress } from './assistantText'
import { assistant, send } from './useAssistant'

const AssistantAgenda = defineAsyncComponent(
  () => import('./AssistantAgenda.vue'),
)

defineEmits(['navigate'])

/** Which cards are unfolded, on this device. */
const folds = useStorage('muelle-assistant-panels', {
  screen: true,
  open: true,
  agenda: true,
  canvas: true,
  conversation: true,
})

function refresh() {
  loadOpenWork()
  loadAgenda()
  loadCanvas()
}
onMounted(refresh)
// an answer may have parked a capture or a proposal, left an encargo on the
// agenda or written to the Lienzo (the dock's header does the same)
watch(
  () => assistant.thinking,
  (thinking, was) => was && !thinking && refresh(),
)

const screenTitle = computed(() => assistant.context?.title || '')
const chips = computed(() =>
  assistant.contextOn ? chipsFor(assistant.context) : [],
)
// A chip that needs a detail fills the composer; the others ask at once.
function useChip(chip) {
  if (chip.fill) {
    assistant.draft = chip.prompt
    assistant.focus += 1
  } else send(chip.prompt)
}

const due = computed(() => dueCount(agenda.items))

const RECENT = 5
const recentFiles = computed(() =>
  [...canvas.files]
    .sort((a, b) =>
      String(b.modified || '').localeCompare(String(a.modified || '')),
    )
    .slice(0, RECENT),
)
function openFile(file) {
  openInCanvas(file)
  showView('canvas')
}

const modelText = computed(() =>
  [shortLabel(models.current.label), effortLabel(models.current.effort)]
    .filter(Boolean)
    .join(' · '),
)
const stats = computed(() => {
  const rows = assistant.messages
  const first = rows.find((m) => m.at)?.at
  return {
    questions: rows.filter((m) => m.role === 'user').length,
    answers: rows.filter((m) => m.role === 'bot' && !isProgress(m)).length,
    files: new Set(rows.flatMap((m) => (m.canvas || []).map((f) => f.file)))
      .size,
    started: first ? formatDateTime(first) : '',
  }
})
</script>
