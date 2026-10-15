<template>
  <Dialog
    :model-value="nextStepDialog.open"
    :options="{ title: heading }"
    @update:model-value="(open) => !open && close()"
  >
    <template #body-content>
      <p
        v-if="nextStepDialog.loading"
        role="status"
        class="py-6 text-center text-sm text-ink-gray-6"
      >
        {{ __('Loading the next step…') }}
      </p>
      <div
        v-else-if="!state"
        role="alert"
        class="space-y-3 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
      >
        <p>{{ nextStepDialog.error || __('This deal could not load.') }}</p>
        <Button :label="__('Retry')" @click="reload" />
      </div>
      <form
        v-else
        class="space-y-4"
        @submit.prevent="save"
        @keydown.enter.ctrl.prevent="save"
        @keydown.enter.meta.prevent="save"
      >
        <p v-if="reasonLine" class="text-sm text-ink-gray-7">
          {{ reasonLine }}
        </p>
        <template v-if="draft.mode === 'complete'">
          <p class="text-base text-ink-gray-9">
            <span class="lucide-check size-4 align-[-2px] text-ink-green-7" />
            {{ state.title }}
          </p>
          <FormControl
            ref="noteInput"
            v-model="draft.note"
            type="textarea"
            :rows="2"
            :label="__('Outcome (optional)')"
            :placeholder="__('What happened? It is saved on the deal.')"
          />
          <FormControl
            v-model="draft.scheduleNext"
            type="checkbox"
            :label="__('Schedule the next step')"
          />
        </template>
        <fieldset
          v-if="draft.mode !== 'complete' || draft.scheduleNext"
          class="space-y-3"
        >
          <legend class="sr-only">{{ __('Next step') }}</legend>
          <FormControl
            ref="titleInput"
            v-model="draft.title"
            :label="__('What comes next?')"
            :placeholder="__('Call to confirm, send the quote…')"
          />
          <div class="flex flex-wrap items-end gap-2">
            <FormControl
              ref="dateInput"
              v-model="draft.date"
              type="date"
              class="w-40"
              :label="__('Date')"
            />
            <FormControl
              v-model="draft.time"
              type="time"
              class="w-28"
              :label="__('Time')"
            />
            <div
              class="flex flex-wrap gap-1"
              role="group"
              :aria-label="__('Quick dates')"
            >
              <Button
                v-for="preset in presets"
                :key="preset.key"
                type="button"
                size="sm"
                :variant="draft.date === preset.date ? 'subtle' : 'ghost'"
                :label="__(preset.label)"
                @click="draft.date = preset.date"
              />
            </div>
          </div>
          <div
            class="flex flex-wrap gap-1"
            role="radiogroup"
            :aria-label="__('Kind')"
          >
            <button
              v-for="kind in state.types || []"
              :key="kind"
              type="button"
              role="radio"
              :aria-checked="draft.type === kind"
              class="min-h-8 rounded-full border px-3 text-sm"
              :class="
                draft.type === kind
                  ? 'border-outline-gray-5 bg-surface-gray-3 text-ink-gray-9'
                  : 'border-outline-gray-2 text-ink-gray-7 hover:bg-surface-gray-1'
              "
              @click="draft.type = kind"
            >
              {{ __(kind) }}
            </button>
          </div>
          <p v-if="ownerName" class="text-sm text-ink-gray-6">
            {{ __('Owner: {0}', [ownerName]) }}
          </p>
        </fieldset>
        <div
          v-if="problem"
          role="alert"
          class="space-y-2 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          <p>{{ problem }}</p>
          <Button
            v-if="stale"
            type="button"
            :label="__('Load current version')"
            @click="reload"
          />
        </div>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <span class="mr-auto hidden text-xs text-ink-gray-5 sm:inline">
            {{ __('Enter saves · Esc closes') }}
          </span>
          <Button type="button" :label="__('Not now')" @click="close" />
          <Button
            type="submit"
            variant="solid"
            :loading="saving"
            :disabled="Boolean(blocker)"
            :label="saveLabel"
          />
        </div>
        <p v-if="blocker" class="text-right text-sm text-ink-gray-6">
          {{ __(blocker) }}
        </p>
      </form>
    </template>
  </Dialog>
</template>

<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { Button, Dialog, FormControl, toast } from 'frappe-ui'
import { usersStore } from '@/stores/users'
import {
  announceNextStep,
  formatStep,
  nextStepApi,
  nextStepDialog,
  nextStepError,
  openNextStep,
} from '@/composables/useNextStep'
import {
  datePresets,
  draftCall,
  draftFor,
  draftProblem,
} from '@/utils/nextStep'

const { getUser } = usersStore()
const draft = reactive(draftFor(null))
const saving = ref(false)
const problem = ref('')
const stale = ref(false)
const titleInput = ref(null)
const dateInput = ref(null)
const noteInput = ref(null)

const state = computed(() => nextStepDialog.state)
const presets = computed(() => datePresets(state.value?.default_at))
const blocker = computed(() => draftProblem(draft))
const ownerName = computed(() => {
  const owner = draft.owner
  return owner ? getUser(owner)?.full_name || owner : ''
})
const heading = computed(() => {
  if (draft.mode === 'complete') return __('Done, then next step')
  if (draft.mode === 'reschedule') return __('Reschedule')
  return draft.task ? __('Edit next step') : __('Next step')
})
const saveLabel = computed(() => {
  if (draft.mode === 'complete')
    return draft.scheduleNext ? __('Done and schedule') : __('Mark done')
  return draft.task ? __('Save') : __('Schedule')
})
const reasonLine = computed(() => {
  const reason = nextStepDialog.reason
  if (reason === 'call') return __('Call logged. When is the next step?')
  if (reason === 'quote') return __('Quote sent. When do you follow up?')
  if (reason === 'stage') return __('Stage changed. What is the next step?')
  return state.value?.task && draft.mode !== 'complete'
    ? __('Now: {0}', [formatStep(state.value.at)])
    : ''
})

function focusFirst() {
  nextTick(() => {
    const target =
      draft.mode === 'complete'
        ? noteInput.value
        : draft.mode === 'reschedule'
          ? dateInput.value
          : titleInput.value
    const el = target?.$el?.querySelector?.('input, textarea')
    el?.focus()
    if (el && draft.mode === 'schedule') el.select?.()
  })
}

watch(
  () => [nextStepDialog.open, nextStepDialog.state],
  ([open, current]) => {
    problem.value = ''
    stale.value = false
    if (!open || !current) return
    Object.assign(
      draft,
      draftFor(current, {
        mode: nextStepDialog.mode,
        reason: nextStepDialog.reason,
      }),
    )
    if (draft.translateTitle) draft.title = __(draft.title)
    focusFirst()
  },
)

function close() {
  nextStepDialog.open = false
}

function reload() {
  openNextStep({
    deal: nextStepDialog.deal,
    mode: nextStepDialog.mode,
    reason: nextStepDialog.reason,
  })
}

async function save() {
  if (saving.value || blocker.value || !state.value) return
  saving.value = true
  problem.value = ''
  stale.value = false
  const deal = nextStepDialog.deal
  try {
    const [method, args] = draftCall(deal, state.value, draft)
    const answer = await nextStepApi(method, args)
    announceNextStep(deal, answer)
    close()
    toast.success(
      answer?.task
        ? __('Next step: {0}', [formatStep(answer.at)])
        : __('Step done. This deal has no next step.'),
    )
  } catch (error) {
    stale.value = /TimestampMismatch|DoesNotExist/.test(
      error?.exc_type || error?.exception || '',
    )
    problem.value = nextStepError(error)
  } finally {
    saving.value = false
  }
}
</script>
