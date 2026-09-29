<!-- The funnel as a vertical ladder: each rung, then how many moved on from it.
     Every rung, drop-off and outcome drills into the matching deals. -->
<template>
  <div class="flex flex-col gap-4">
    <ol class="flex flex-col" :aria-label="__('Etapas del embudo')">
      <template v-for="(step, i) in model.steps" :key="step.status">
        <li>
          <button
            type="button"
            class="w-full rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface-gray-1 focus-visible:bg-surface-gray-1"
            data-drill="stage"
            :data-status="step.status"
            :title="__('Ver los tratos en {0}', [step.stage])"
            @click="$emit('drill', step.status)"
          >
            <div
              class="flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_minmax(0,9rem)] sm:items-center sm:gap-4"
            >
              <div class="min-w-0">
                <div class="truncate text-sm font-medium text-ink-gray-8">
                  {{ step.stage }}
                </div>
                <div
                  class="flex flex-wrap items-center gap-x-2 text-xs text-ink-gray-5"
                >
                  <span>{{ __('{0} aquí ahora', [step.count]) }}</span>
                  <DeltaText
                    :value="delta?.steps[step.status]?.count ?? null"
                    good="none"
                  />
                </div>
              </div>
              <div
                class="h-2.5 overflow-hidden rounded-full bg-surface-gray-2"
                aria-hidden="true"
              >
                <div
                  class="h-full rounded-full bg-surface-gray-5"
                  :style="{ width: barWidth(step.reached) }"
                />
              </div>
              <div
                class="flex items-baseline justify-between gap-2 sm:flex-col sm:items-end sm:gap-0"
              >
                <span class="text-sm text-ink-gray-6">
                  <span
                    class="text-base font-semibold tabular-nums text-ink-gray-9"
                  >
                    {{ step.reached }}
                  </span>
                  {{ __('llegaron') }}
                </span>
                <span
                  v-if="showValues"
                  class="text-xs tabular-nums text-ink-gray-6"
                >
                  {{ money(step.value, currency) }}
                </span>
              </div>
            </div>
          </button>
        </li>
        <li class="pl-3 sm:pl-6">
          <button
            type="button"
            class="my-0.5 flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md px-3 py-1.5 text-left text-xs transition-colors"
            :class="
              step.biggestDrop
                ? 'bg-surface-amber-1 text-ink-amber-8 hover:bg-surface-amber-2'
                : 'text-ink-gray-6 hover:bg-surface-gray-1'
            "
            data-drill="drop"
            :data-status="step.status"
            :data-biggest="step.biggestDrop ? '' : undefined"
            @click="$emit('drill', step.status)"
          >
            <span aria-hidden="true">↓</span>
            <span v-if="step.conversion == null">{{ __('Sin tratos') }}</span>
            <span v-else>
              {{
                __('{0} % pasan a {1}', [
                  formatPct(step.conversion),
                  nextName(i),
                ])
              }}
            </span>
            <span v-if="step.stalled">
              ·
              {{ __('{0} siguen en {1}', [step.stalled, step.stage]) }}
            </span>
            <span v-if="step.biggestDrop" class="font-medium">
              · {{ __('Aquí se detienen más') }}
            </span>
            <DeltaText
              kind="pp"
              :value="delta?.steps[step.status]?.conversion ?? null"
            />
          </button>
        </li>
      </template>
    </ol>

    <div class="grid gap-2 sm:grid-cols-2">
      <div
        v-for="row in outcomes"
        :key="row.key"
        class="rounded-lg border border-outline-gray-1 px-3 py-2.5"
        :data-outcome="row.key"
      >
        <div class="flex items-baseline justify-between gap-2">
          <span class="text-sm font-medium text-ink-gray-8">
            {{ row.label }}
          </span>
          <span class="text-sm text-ink-gray-6">
            <span class="text-base font-semibold tabular-nums text-ink-gray-9">
              {{ row.outcome.count }}
            </span>
            <DeltaText
              class="ml-1"
              :value="row.delta"
              :good="row.key === 'won' ? 'up' : 'none'"
            />
          </span>
        </div>
        <div
          v-if="showValues && row.outcome.count"
          class="text-xs tabular-nums text-ink-gray-6"
        >
          {{ money(row.outcome.value, currency) }}
        </div>
        <p v-if="row.note" class="mt-1 text-xs text-ink-gray-5">
          {{ row.note }}
        </p>
        <div
          v-if="row.outcome.statuses.length"
          class="mt-2 flex flex-wrap gap-1.5"
        >
          <button
            v-for="s in row.outcome.statuses"
            :key="s.status"
            type="button"
            class="rounded-full bg-surface-gray-1 px-2.5 py-1 text-xs text-ink-gray-7 hover:bg-surface-gray-2"
            :data-drill="row.key"
            :data-status="s.status"
            @click="$emit('drill', s.status)"
          >
            {{ __('{0}: {1}', [s.stage, s.count]) }} →
          </button>
        </div>
      </div>
    </div>

    <details
      v-if="model.others.length"
      class="rounded-lg border border-outline-gray-1 px-3 py-2"
    >
      <summary class="cursor-pointer text-sm text-ink-gray-7">
        {{ __('Otras etapas: {0} tratos fuera de la secuencia', [otherCount]) }}
      </summary>
      <p class="mt-1 text-xs text-ink-gray-5">
        {{
          __(
            'Etapas archivadas, sin clasificar o de reingreso después de cerrar. No cuentan en la conversión.',
          )
        }}
      </p>
      <ul class="mt-2 flex flex-wrap gap-1.5">
        <li v-for="s in model.others" :key="s.status">
          <button
            type="button"
            class="rounded-full bg-surface-gray-1 px-2.5 py-1 text-xs text-ink-gray-7 hover:bg-surface-gray-2"
            data-drill="other"
            :data-status="s.status"
            @click="$emit('drill', s.status)"
          >
            {{ __('{0}: {1}', [s.stage, s.count]) }} →
          </button>
        </li>
      </ul>
    </details>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { money } from '@/utils/numberFormat'
import DeltaText from './DeltaText.vue'

const props = defineProps({
  model: { type: Object, required: true },
  delta: { type: Object, default: null },
  // null when stage values are unavailable (e.g. no permission on amounts)
  currency: { type: String, default: null },
})
defineEmits(['drill'])

const showValues = computed(() => !!props.currency)
const widest = computed(() =>
  Math.max(1, ...props.model.steps.map((s) => s.reached)),
)
function barWidth(n) {
  return `${n ? Math.max(2, (100 * n) / widest.value) : 0}%`
}
function formatPct(n) {
  return Math.round(n)
}
function nextName(i) {
  const next = props.model.steps[i + 1]
  return next ? next.stage : __('Ganado')
}
const otherCount = computed(() =>
  props.model.others.reduce((sum, s) => sum + s.count, 0),
)
const outcomes = computed(() => [
  {
    key: 'won',
    label: __('Ganados'),
    outcome: props.model.won,
    delta: props.delta?.won ?? null,
  },
  {
    key: 'lost',
    label: __('Perdidos'),
    outcome: props.model.lost,
    delta: props.delta?.lost ?? null,
    note: __('Salieron del embudo; el sistema no registra en qué etapa.'),
  },
])
</script>
