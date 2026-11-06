<template>
  <!-- Which brain answers this conversation, next to «Enviar» as in Claude
       and T3 Code: «Haiku 5.5 · Medio». The menu grows up from the chip
       (the composer sits at the bottom). The pick lasts until «Nueva
       conversación»; who may not choose sees the model and the reason.
       On a 305 px phone the chip gives way (its name truncates) so «Enviar»
       stays inside the composer. -->
  <div v-if="models.available" ref="root" class="relative min-w-0">
    <button
      type="button"
      class="press flex min-h-11 w-full max-w-[11rem] items-center gap-1 rounded-full px-2 text-sm text-ink-gray-7 hover:bg-surface-gray-2"
      :aria-label="__('Model: {0}', [chipText])"
      :title="__('Model of this conversation')"
      :aria-expanded="open"
      aria-haspopup="dialog"
      data-testid="assistant-model"
      @click="toggle"
    >
      <span class="min-w-0 truncate">{{ chipText }}</span>
      <span
        class="lucide-chevron-down size-4 flex-none text-ink-gray-5"
        aria-hidden="true"
      />
    </button>
    <div
      v-if="open"
      role="dialog"
      :aria-label="__('Model of this conversation')"
      class="absolute bottom-full right-0 z-10 mb-2 w-72 space-y-3 rounded-8 border border-outline-gray-2 bg-surface-base p-3 shadow-xl"
      data-testid="assistant-model-menu"
    >
      <p class="text-sm font-semibold text-ink-gray-9">
        {{ __('Model of this conversation') }}
      </p>
      <p
        v-if="!models.canChoose"
        class="text-sm text-ink-gray-7"
        data-testid="assistant-model-refusal"
      >
        {{ models.message || __('The owner chooses the model on this site.') }}
      </p>
      <template v-else>
        <ul class="space-y-1">
          <li v-for="entry in models.list" :key="entry.model">
            <button
              type="button"
              class="press flex min-h-11 w-full items-center gap-2 rounded-6 px-2 text-left text-sm hover:bg-surface-gray-2 disabled:opacity-50"
              :class="
                entry.model === models.current.model
                  ? 'bg-surface-gray-2 font-medium text-ink-gray-9'
                  : 'text-ink-gray-8'
              "
              :aria-pressed="entry.model === models.current.model"
              :disabled="models.busy"
              :data-model="entry.model"
              @click="selectModel(entry.model)"
            >
              <span class="min-w-0 flex-1 truncate">{{ entry.label }}</span>
              <span
                v-if="entry.model === models.defaults.model"
                class="flex-none text-xs text-ink-gray-5"
                >{{ __('Default') }}</span
              >
              <span
                v-if="entry.model === models.current.model"
                class="lucide-check size-4 flex-none"
                aria-hidden="true"
              />
            </button>
          </li>
        </ul>
        <div v-if="efforts.length > 1" class="space-y-1">
          <p class="text-xs font-medium text-ink-gray-6">
            {{ __('Reasoning') }}
          </p>
          <Segmented
            :model-value="models.current.effort"
            :options="efforts"
            :label="__('Reasoning')"
            fit="content"
            @update:model-value="
              (effort) => selectModel(models.current.model, effort)
            "
          />
        </div>
        <button
          v-if="models.chosen"
          type="button"
          class="press min-h-11 w-full rounded-6 px-2 text-left text-sm text-ink-gray-8 hover:bg-surface-gray-2 disabled:opacity-50"
          :disabled="models.busy"
          data-testid="assistant-model-reset"
          @click="resetModel"
        >
          {{ __('Back to the default ({0})', [defaultText]) }}
        </button>
        <p class="text-xs text-ink-gray-6">
          {{ __('A new conversation starts on the default again.') }}
        </p>
      </template>
      <p v-if="models.error" role="alert" class="text-sm text-ink-red-7">
        {{ models.error }}
      </p>
    </div>
  </div>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { onClickOutside, useEventListener } from '@vueuse/core'
import Segmented from '@/components/ui/Segmented.vue'
import {
  effortLabel,
  loadModels,
  models,
  resetModel,
  selectModel,
  shortLabel,
} from './assistantModels'

const root = ref(null)
const open = ref(false)
onClickOutside(root, () => (open.value = false))
// Esc folds the menu first (capture: before the dock or the workspace close)
useEventListener(
  window,
  'keydown',
  (event) => {
    if (event.key !== 'Escape' || !open.value) return
    event.preventDefault()
    event.stopPropagation()
    open.value = false
  },
  true,
)
onMounted(() => models.available || loadModels())

function toggle() {
  open.value = !open.value
  if (open.value) loadModels()
}

function text(label, effort) {
  return [shortLabel(label), effortLabel(effort)].filter(Boolean).join(' · ')
}
const chipText = computed(() =>
  text(models.current.label, models.current.effort),
)
const defaultText = computed(() => {
  const entry = models.list.find((m) => m.model === models.defaults.model)
  return text(entry?.label || models.defaults.model, models.defaults.effort)
})
const efforts = computed(() => {
  const entry = models.list.find((m) => m.model === models.current.model)
  return (entry?.efforts || []).map((value) => ({
    value,
    label: effortLabel(value) || value,
  }))
})
</script>
