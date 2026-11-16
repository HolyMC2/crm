<template>
  <BottomSheet
    :open="true"
    :title="goal?.name ? __('Edit the goal') : __('New goal')"
    :dismissible="!busy"
    @update:open="(value) => !value && emit('close')"
  >
    <form class="space-y-4" data-testid="meta-form" @submit.prevent="save">
      <label class="block">
        <span class="mb-1 block text-sm font-medium text-ink-gray-8">{{
          __('What it measures')
        }}</span>
        <select
          v-model="form.indicator"
          class="min-h-11 w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-base text-ink-gray-9"
          data-testid="meta-indicator"
          @change="pick"
        >
          <optgroup
            v-for="group in groups"
            :key="group.group"
            :label="group.group"
          >
            <option v-for="row in group.items" :key="row.key" :value="row.key">
              {{ row.label }}
            </option>
          </optgroup>
        </select>
        <span v-if="indicator?.help" class="mt-1 block text-xs text-ink-gray-6">
          {{ indicator.help }}
        </span>
      </label>

      <label class="block">
        <span class="mb-1 block text-sm font-medium text-ink-gray-8"
          >{{ directionText(indicator) }} ({{ unitHint(indicator) }})</span
        >
        <input
          v-model.number="form.target"
          type="number"
          inputmode="decimal"
          min="0"
          step="any"
          class="min-h-11 w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-base text-ink-gray-9"
          data-testid="meta-target"
        />
      </label>

      <label
        v-for="option in indicator?.options || []"
        :key="option.key"
        class="block"
      >
        <span class="mb-1 block text-sm font-medium text-ink-gray-8">{{
          option.label
        }}</span>
        <input
          v-model.number="form.options[option.key]"
          type="number"
          min="1"
          class="min-h-11 w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-base text-ink-gray-9"
          :data-option="option.key"
        />
      </label>

      <Segmented
        :label="__('Period')"
        :options="PERIODS.map((p) => ({ value: p, label: periodLabel(p) }))"
        :model-value="form.period"
        @update:model-value="(value) => (form.period = value)"
      />
      <Segmented
        :label="__('Whose work counts')"
        :options="[
          { value: OWN, label: __('Each person') },
          { value: TEAM, label: __('The whole team') },
        ]"
        :model-value="form.scope"
        @update:model-value="(value) => (form.scope = value)"
      />

      <fieldset v-if="form.scope === OWN">
        <legend class="mb-1 text-sm font-medium text-ink-gray-8">
          {{ __('For whom') }}
        </legend>
        <p class="mb-2 text-xs text-ink-gray-6">
          {{
            __(
              'No puesto or person chosen: everybody with data for it is judged.',
            )
          }}
        </p>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="puesto in catalog?.puestos || PUESTOS"
            :key="puesto"
            class="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-outline-gray-2 px-3 text-sm"
          >
            <input
              v-model="form.puestos"
              type="checkbox"
              :value="puesto"
              class="size-4"
              :data-puesto="puesto"
            />
            {{ puesto }}
          </label>
        </div>
        <details v-if="catalog?.people?.length" class="mt-2">
          <summary class="min-h-11 cursor-pointer py-2 text-sm text-ink-gray-7">
            {{
              form.people.length
                ? __('{0} people chosen', [form.people.length])
                : __('Only some people')
            }}
          </summary>
          <ul class="max-h-56 space-y-1 overflow-y-auto">
            <li v-for="person in catalog.people" :key="person.employee">
              <label class="flex min-h-11 items-center gap-2 text-sm">
                <input
                  v-model="form.people"
                  type="checkbox"
                  :value="person.employee"
                  class="size-4"
                />
                <span class="min-w-0">
                  {{ person.name }}
                  <span
                    v-if="person.designation"
                    class="text-xs text-ink-gray-6"
                    >· {{ person.designation }}</span
                  >
                </span>
              </label>
            </li>
          </ul>
        </details>
      </fieldset>

      <label class="block">
        <span class="mb-1 block text-sm font-medium text-ink-gray-8">{{
          __('Weight in the score')
        }}</span>
        <select
          v-model.number="form.weight"
          class="min-h-11 w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-base text-ink-gray-9"
        >
          <option v-for="n in [1, 2, 3, 4, 5]" :key="n" :value="n">
            {{ n }}
          </option>
        </select>
      </label>

      <label v-if="goal?.name" class="flex min-h-11 items-center gap-2 text-sm">
        <input
          v-model="form.enabled"
          type="checkbox"
          :true-value="1"
          :false-value="0"
          class="size-4"
        />
        {{ __('Active') }}
      </label>

      <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
        {{ problem }}
      </p>
    </form>
    <template #actions>
      <div class="flex flex-wrap gap-2">
        <Button
          variant="solid"
          :label="__('Save goal')"
          :loading="busy === 'save'"
          :disabled="!form.indicator"
          class="min-h-11 flex-1 sm:flex-none sm:min-h-8"
          data-testid="meta-save"
          @click="save"
        />
        <Button
          v-if="goal?.name"
          theme="red"
          :label="
            confirming ? __('Yes, delete it') : __('Delete', null, 'Equipo')
          "
          :loading="busy === 'delete'"
          class="min-h-11 sm:min-h-8"
          data-testid="meta-delete"
          @click="remove"
        />
        <Button
          :label="__('Cancel', null, 'Equipo')"
          class="min-h-11 sm:min-h-8"
          @click="emit('close')"
        />
      </div>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, reactive, ref } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet, Segmented } from '@/components/ui'
import { equipoApi, problemOf } from '@/composables/useEquipo'
import {
  METAS,
  OWN,
  PERIODS,
  PUESTOS,
  TEAM,
  blankGoal,
  directionText,
  groupedIndicators,
  optionDefaults,
  periodLabel,
  unitHint,
} from '@/composables/useMetas'

const props = defineProps({
  goal: { type: Object, default: null },
  catalog: { type: Object, default: null },
})
const emit = defineEmits(['close', 'saved'])

const indicators = computed(() => props.catalog?.indicators || [])
const groups = computed(() => groupedIndicators(indicators.value))
const start = props.goal
  ? {
      ...props.goal,
      enabled: props.goal.enabled ? 1 : 0,
      puestos: [...(props.goal.puestos || [])],
      people: [...(props.goal.people || [])],
      options: { ...(props.goal.options || {}) },
    }
  : blankGoal(props.catalog?.indicators || [])
const form = reactive(start)
const indicator = computed(() =>
  indicators.value.find((row) => row.key === form.indicator),
)
const busy = ref('')
const problem = ref('')
// Deleting asks once more on the same button.
const confirming = ref(false)

function pick() {
  form.options = optionDefaults(indicator.value)
  if (indicator.value?.unit === 'percent' && !form.target) form.target = 90
}

async function save() {
  busy.value = 'save'
  problem.value = ''
  try {
    await equipoApi(`${METAS}.save_goal`, {
      goal: JSON.stringify({
        name: props.goal?.name,
        indicator: form.indicator,
        enabled: form.enabled,
        period: form.period,
        weight: form.weight,
        target: Number(form.target) || 0,
        scope: form.scope,
        puestos: form.scope === OWN ? form.puestos : [],
        people: form.scope === OWN ? form.people : [],
        options: form.options,
      }),
    })
    emit('saved')
  } catch (error) {
    const found = problemOf(error)
    problem.value = found.detail || found.message || found.title
  } finally {
    busy.value = ''
  }
}

async function remove() {
  if (!confirming.value) {
    confirming.value = true
    return
  }
  busy.value = 'delete'
  problem.value = ''
  try {
    await equipoApi(`${METAS}.delete_goal`, { name: props.goal.name })
    emit('saved')
  } catch (error) {
    const found = problemOf(error)
    problem.value = found.detail || found.message || found.title
  } finally {
    busy.value = ''
  }
}
</script>
