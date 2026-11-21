<template>
  <!-- «Resumen de ayer» (crm.morning): yesterday's figures with a button
       each, read as the person who opens it. The owner chooses here whether
       it arrives each morning and at what hour. -->
  <BottomSheet
    :open="open"
    :title="__('Yesterday’s summary')"
    :subtitle="state?.day_label || ''"
    layer="resumen-ayer"
    @update:open="(value) => !value && emit('close')"
  >
    <div class="space-y-4 pb-2" data-morning-sheet>
      <p
        v-if="problem"
        role="alert"
        class="rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
      >
        {{ problem }}
      </p>
      <div v-if="!state && !problem" role="status" class="space-y-3">
        <div class="h-14 animate-pulse rounded-7 bg-surface-gray-2" />
        <div class="h-14 animate-pulse rounded-7 bg-surface-gray-2" />
      </div>
      <template v-else-if="state">
        <p
          v-if="!state.rows.length"
          class="rounded-7 bg-surface-gray-1 px-3 py-2 text-base text-ink-gray-8"
          data-morning-clear
        >
          {{ __('Nothing from yesterday needs you.') }}
        </p>
        <ul class="divide-y divide-outline-gray-1">
          <li v-for="row in state.rows" :key="row.key" :data-morning="row.key">
            <component
              :is="row.to ? 'RouterLink' : row.href ? 'a' : 'div'"
              v-bind="linkOf(row)"
              class="flex min-h-14 items-center gap-3 py-2"
              @click="row.to && emit('close')"
            >
              <span
                class="size-2.5 shrink-0 rounded-full"
                :class="
                  row.attention ? 'bg-surface-amber-6' : 'bg-surface-gray-4'
                "
                aria-hidden="true"
              />
              <span class="min-w-0 flex-1">
                <span class="block text-base text-ink-gray-9">{{
                  row.title
                }}</span>
                <span v-if="row.detail" class="block text-sm text-ink-gray-6">{{
                  row.detail
                }}</span>
              </span>
              <span
                class="shrink-0 text-base font-semibold tabular-nums text-ink-gray-9"
                >{{ row.value }}</span
              >
              <span
                v-if="row.to || row.href"
                class="lucide-chevron-right size-4 shrink-0 text-ink-gray-5"
                aria-hidden="true"
              />
            </component>
          </li>
        </ul>
        <section
          v-if="state.settings?.can_change"
          class="space-y-2 border-t border-outline-gray-1 pt-3"
          aria-labelledby="resumen-ajuste"
        >
          <div class="flex min-h-14 items-center gap-3">
            <label
              id="resumen-ajuste"
              for="resumen-switch"
              class="flex min-w-0 flex-1 flex-col"
            >
              <span class="text-base text-ink-gray-9">{{
                __('Send me the summary every morning')
              }}</span>
              <span class="text-sm text-ink-gray-6">{{
                state.settings.morning
                  ? __(
                      'Owners and managers get it as a notice at the hour below.',
                    )
                  : __('Nobody gets it; it stays here in Hoy.')
              }}</span>
            </label>
            <AjustesSwitch
              id="resumen-switch"
              :model-value="state.settings.morning"
              :label="__('Send me the summary every morning')"
              :disabled="busy"
              data-morning-switch
              @update:model-value="(value) => save({ morning: value })"
            />
          </div>
          <Segmented
            v-if="state.settings.morning"
            :label="__('At')"
            :model-value="state.settings.morning_hour"
            :options="hourOptions"
            data-morning-hour
            @update:model-value="(value) => save({ morning_hour: value })"
          />
        </section>
      </template>
    </div>
  </BottomSheet>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import { BottomSheet, Segmented } from '@/components/ui'
import AjustesSwitch from '@/components/ajustes/AjustesSwitch.vue'
import { errorText } from '@/utils/errorText'
import { withReturn } from '@/composables/useHoy'

const props = defineProps({ open: { type: Boolean, default: false } })
const emit = defineEmits(['close'])

const API = 'crm.api.morning.'
const state = ref(null)
const problem = ref('')
const busy = ref(false)

const hourOptions = computed(() =>
  (state.value?.settings?.hours || []).map((hour) => ({
    value: hour,
    label: `${hour}:00`,
  })),
)

function linkOf(row) {
  if (row.to) return { to: withReturn(row.to) }
  if (row.href) return { href: row.href }
  return {}
}

async function read() {
  state.value = null
  problem.value = ''
  try {
    state.value = await call(API + 'summary')
  } catch (error) {
    problem.value = errorText(
      error,
      __('The summary could not open. Try again.'),
    )
  }
}
watch(
  () => props.open,
  (open) => open && read(),
  { immediate: true },
)

async function save(changes) {
  const before = { ...state.value.settings }
  state.value = { ...state.value, settings: { ...before, ...changes } }
  busy.value = true
  problem.value = ''
  try {
    const answer = await call(API + 'save_settings', { changes })
    state.value = { ...state.value, settings: answer.settings }
  } catch (error) {
    state.value = { ...state.value, settings: before }
    problem.value = errorText(
      error,
      __('The summary setting was not saved. Try again.'),
    )
  } finally {
    busy.value = false
  }
}
</script>
