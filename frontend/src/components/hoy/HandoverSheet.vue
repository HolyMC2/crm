<template>
  <!-- «Entregar turno» (crm.handover): what is still open, built by Hoy,
       a note for the next person, and one tap to hand it over. -->
  <BottomSheet
    :open="open"
    :title="__('Hand over the shift')"
    :subtitle="__('What stays open, for whoever comes next.')"
    layer="entrega-turno"
    @update:open="(value) => !value && emit('close')"
  >
    <div class="space-y-5 pb-2" data-handover-sheet>
      <p
        v-if="problem"
        role="alert"
        class="rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
        data-handover-problem
      >
        {{ problem }}
      </p>
      <div
        v-if="!state && !problem"
        role="status"
        :aria-label="__('Loading…')"
        class="space-y-3"
      >
        <div class="h-12 animate-pulse rounded-7 bg-surface-gray-2" />
        <div class="h-24 animate-pulse rounded-7 bg-surface-gray-2" />
      </div>
      <template v-else-if="state">
        <template v-if="state.enabled">
          <p
            v-if="!state.sections.length"
            class="rounded-7 bg-surface-gray-1 px-3 py-2 text-base text-ink-gray-8"
            data-handover-clear
          >
            {{ __('Nothing open to hand over. You can still leave a note.') }}
          </p>
          <section
            v-for="section in state.sections"
            :key="section.key"
            :aria-labelledby="`entrega-${section.key}`"
            :data-handover-section="section.key"
          >
            <h3
              :id="`entrega-${section.key}`"
              class="flex items-baseline gap-2 text-sm font-semibold text-ink-gray-7"
            >
              {{ section.title }}
              <span class="font-normal text-ink-gray-6">{{
                section.count
              }}</span>
            </h3>
            <ul class="mt-1 divide-y divide-outline-gray-1">
              <li v-for="(row, index) in section.rows" :key="index">
                <component
                  :is="row.to ? 'RouterLink' : row.href ? 'a' : 'div'"
                  v-bind="linkOf(row)"
                  class="flex min-h-12 flex-col justify-center py-1.5"
                >
                  <span class="text-base text-ink-gray-9 [text-wrap:balance]">{{
                    row.title
                  }}</span>
                  <span v-if="row.detail" class="text-sm text-ink-gray-6">{{
                    row.detail
                  }}</span>
                </component>
              </li>
            </ul>
            <p
              v-if="section.count > section.rows.length"
              class="mt-1 text-sm text-ink-gray-6"
            >
              {{ __('And {0} more', [section.count - section.rows.length]) }}
            </p>
          </section>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-semibold text-ink-gray-7">{{
              __('Note for the next shift')
            }}</span>
            <textarea
              v-model="note"
              rows="3"
              maxlength="1000"
              class="w-full rounded-6 border-0 bg-surface-gray-2 px-3 py-2 text-base text-ink-gray-9 placeholder:text-ink-gray-5 focus:ring-2 focus:ring-outline-gray-4"
              :placeholder="
                __('For example: the supplier comes at 11 to collect')
              "
              data-handover-note
            />
          </label>
          <p
            v-if="state.last"
            class="text-sm text-ink-gray-6"
            data-handover-last
          >
            {{ lastText }}
          </p>
          <div class="flex justify-end">
            <Button
              variant="solid"
              class="min-h-11"
              :loading="busy"
              :label="__('Hand over the shift')"
              data-handover-give
              @click="give"
            />
          </div>
        </template>
        <p v-else class="text-base text-ink-gray-7" data-handover-off>
          {{ __('The shift handover is off in this shop.') }}
        </p>
        <div
          v-if="state.can_change"
          class="flex min-h-14 items-center gap-3 border-t border-outline-gray-1 pt-3"
        >
          <label for="entrega-switch" class="flex min-w-0 flex-1 flex-col">
            <span class="text-base text-ink-gray-9">{{
              __('Ask for the shift handover')
            }}</span>
            <span class="text-sm text-ink-gray-6">{{
              state.enabled
                ? __(
                    'Hoy offers «Hand over the shift» and shows it to the next person.',
                  )
                : __('Nobody is asked to hand over the shift.')
            }}</span>
          </label>
          <AjustesSwitch
            id="entrega-switch"
            :model-value="state.enabled"
            :label="__('Ask for the shift handover')"
            :disabled="busy"
            data-handover-switch
            @update:model-value="setEnabled"
          />
        </div>
      </template>
    </div>
  </BottomSheet>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Button, call, toast } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import AjustesSwitch from '@/components/ajustes/AjustesSwitch.vue'
import { errorText } from '@/utils/errorText'
import { HOY_HOME } from '@/composables/useHoy'

const props = defineProps({
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'done', 'changed'])

const API = 'crm.api.handover.'
const state = ref(null)
const problem = ref('')
const busy = ref(false)
const note = ref('')

const lastText = computed(() => {
  const last = state.value?.last
  if (!last) return ''
  return __('Last handover: {0}, {1}', [last.by_name, last.when])
})

function linkOf(row) {
  if (row.to)
    return {
      to: { path: row.to, query: { return_to: HOY_HOME, return_label: 'Hoy' } },
    }
  if (row.href) return { href: row.href }
  return {}
}

async function read() {
  state.value = null
  problem.value = ''
  try {
    state.value = await call(API + 'prepare')
  } catch (error) {
    problem.value = errorText(
      error,
      __('The handover could not open. Try again.'),
    )
  }
}
watch(
  () => props.open,
  (open) => open && read(),
  { immediate: true },
)

async function give() {
  if (busy.value) return
  busy.value = true
  problem.value = ''
  try {
    const answer = await call(API + 'hand_over', { note: note.value.trim() })
    toast.success(answer?.message || __('Saved.'))
    note.value = ''
    emit('done', answer)
    emit('close')
  } catch (error) {
    problem.value = errorText(error, __('The handover was not saved. Try again.'))
  } finally {
    busy.value = false
  }
}

async function setEnabled(value) {
  const before = state.value.enabled
  state.value = { ...state.value, enabled: value }
  busy.value = true
  problem.value = ''
  try {
    await call(API + 'save_settings', { changes: { handover: value } })
    emit('changed')
    await read()
  } catch (error) {
    state.value = { ...state.value, enabled: before }
    problem.value = errorText(error, __('The handover was not saved. Try again.'))
  } finally {
    busy.value = false
  }
}
</script>
