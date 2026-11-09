<template>
  <!-- The workspace's right column (Marco 2026-11-05: «rightside floating
       windows with cool data and features»): sections beside the
       conversation, never over it, split by rules. What the screen is about
       with its quick questions, the work left open, the agenda, the Lienzo
       and this conversation's facts. Each section folds; the folds are
       remembered on this device. A row of the left column (or «/abierto»)
       unfolds its section and brings it into view. -->
  <div
    ref="root"
    class="divide-y divide-outline-gray-1"
    data-testid="assistant-side-panels"
  >
    <AssistantPanelCard
      v-if="screenTitle"
      v-model:open="folds.screen"
      name="screen"
      :title="__('This screen')"
      icon="lucide-monitor"
    >
      <p class="text-sm text-ink-gray-9">{{ screenTitle }}</p>
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
          class="press min-h-9 rounded-full border border-outline-gray-2 px-3.5 text-sm text-ink-gray-8 hover:bg-surface-gray-2 disabled:opacity-50"
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
      quiet
    >
      <p v-if="!canvas.files.length" class="text-sm text-ink-gray-6">
        {{ __('Charts and tables Muelle makes for you show up here.') }}
      </p>
      <ul v-else>
        <li v-for="file in recentFiles" :key="file.file">
          <button
            type="button"
            class="press -mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-2 rounded-6 px-2 py-1.5 text-left text-sm hover:bg-surface-gray-2"
            :data-canvas="file.file"
            @click="openFile(file)"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate text-ink-gray-9">{{
                file.file
              }}</span>
              <span class="block truncate text-xs text-ink-gray-6">{{
                [kindLabel(file.kind), relativeTime(file.modified)]
                  .filter(Boolean)
                  .join(' · ')
              }}</span>
            </span>
          </button>
        </li>
      </ul>
      <button
        v-if="canvas.files.length > recentFiles.length"
        type="button"
        class="press min-h-9 rounded-6 text-sm font-medium text-ink-gray-7 hover:text-ink-gray-9"
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
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
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
import { computed, defineAsyncComponent, nextTick, ref, watch } from 'vue'
import { useStorage } from '@vueuse/core'
import { formatDateTime, relativeTime } from '@/utils/display'
import AssistantOpenWork from './AssistantOpenWork.vue'
import AssistantPanelCard from './AssistantPanelCard.vue'
import { agenda, dueCount } from './assistantAgenda'
import { canvas, kindLabel, openInCanvas } from './assistantCanvas'
import { effortLabel, models, shortLabel } from './assistantModels'
import { sessions, showView } from './assistantSessions'
import { chipsFor, isProgress } from './assistantText'
import { assistant, send } from './useAssistant'

const AssistantAgenda = defineAsyncComponent(
  () => import('./AssistantAgenda.vue'),
)

const props = defineProps({
  /** { name } of the section to unfold and show (a new object each time) */
  focus: { type: Object, default: null },
})
defineEmits(['navigate'])
const root = ref(null)

/** Which cards are unfolded, on this device. */
const folds = useStorage('muelle-assistant-panels', {
  screen: true,
  open: true,
  agenda: true,
  canvas: true,
  conversation: true,
})

// what they show loads in the workspace (AssistantWorkspace refresh)
watch(
  () => props.focus,
  async (focus) => {
    if (!focus?.name) return
    folds.value[focus.name] = true
    await nextTick()
    root.value
      ?.querySelector(`[data-panel="${focus.name}"]`)
      ?.scrollIntoView?.({ block: 'nearest' })
  },
  { immediate: true },
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
