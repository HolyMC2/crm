<template>
  <article
    class="space-y-3 rounded-lg border border-outline-gray-2 bg-surface-white p-4"
    :aria-labelledby="`receta-${recipe.key}`"
  >
    <div class="flex items-start gap-3">
      <div class="min-w-0 flex-1">
        <h2
          :id="`receta-${recipe.key}`"
          class="break-words text-base font-semibold text-ink-gray-9"
        >
          {{ recipe.title }}
        </h2>
        <p class="break-words text-base text-ink-gray-8">{{ recipe.action }}</p>
      </div>
      <button
        type="button"
        role="switch"
        :aria-checked="recipe.enabled"
        :aria-label="`${recipe.enabled ? 'Apagar' : 'Encender'}: ${recipe.title}`"
        :disabled="!canEdit || busy"
        class="flex min-h-11 min-w-11 flex-none items-center justify-center disabled:opacity-50"
        @click="$emit('toggle', !recipe.enabled)"
      >
        <span
          class="relative h-6 w-11 rounded-full transition-colors"
          :class="recipe.enabled ? 'bg-surface-gray-7' : 'bg-surface-gray-4'"
          aria-hidden="true"
        >
          <span
            class="absolute top-0.5 size-5 rounded-full bg-surface-base transition-all"
            :class="recipe.enabled ? 'left-[22px]' : 'left-0.5'"
          />
        </span>
      </button>
    </div>
    <p class="break-words text-sm text-ink-gray-7">{{ recipe.description }}</p>

    <div class="space-y-1">
      <h3 class="text-sm font-medium text-ink-gray-7">Quién recibe</h3>
      <div class="flex flex-wrap items-center gap-1.5">
        <span
          v-for="chip in chips"
          :key="chip.key"
          class="inline-flex min-h-8 items-center rounded-full bg-surface-gray-2 px-3 text-sm text-ink-gray-8"
          >{{ chip.label }}</span
        >
        <span v-if="!chips.length" class="text-sm text-ink-red-4"
          >Nadie todavía</span
        >
        <Button
          v-if="canEdit"
          variant="ghost"
          class="min-h-11"
          label="Cambiar"
          :aria-label="`Cambiar quién recibe: ${recipe.title}`"
          @click="$emit('recipients')"
        />
      </div>
    </div>

    <div v-if="recipe.days_label" class="space-y-1">
      <label
        :for="`dias-${recipe.key}`"
        class="block text-sm text-ink-gray-7"
        >{{ recipe.days_label }}</label
      >
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="flex size-11 flex-none items-center justify-center rounded-lg bg-surface-gray-2 disabled:opacity-50"
          aria-label="Un día menos"
          :disabled="!canEdit || busy || days <= 0"
          @click="setDays(days - 1)"
        >
          <span class="lucide-minus size-4" aria-hidden="true" />
        </button>
        <input
          :id="`dias-${recipe.key}`"
          type="number"
          inputmode="numeric"
          min="0"
          max="90"
          :value="days"
          :disabled="!canEdit || busy"
          class="min-h-11 w-20 rounded-lg border border-outline-gray-2 bg-surface-white px-2 text-center text-base"
          @change="setDays(Number($event.target.value))"
        />
        <button
          type="button"
          class="flex size-11 flex-none items-center justify-center rounded-lg bg-surface-gray-2 disabled:opacity-50"
          aria-label="Un día más"
          :disabled="!canEdit || busy || days >= 90"
          @click="setDays(days + 1)"
        >
          <span class="lucide-plus size-4" aria-hidden="true" />
        </button>
        <span class="text-base text-ink-gray-7">{{
          days === 1 ? 'día' : 'días'
        }}</span>
      </div>
    </div>

    <p class="text-sm text-ink-gray-6">{{ lastLine }}</p>
    <ul
      v-if="recipe.recent?.length"
      class="space-y-1 border-t border-outline-gray-1 pt-2"
    >
      <li
        v-for="(row, index) in recipe.recent"
        :key="index"
        class="flex items-start gap-2 text-sm"
      >
        <span
          class="lucide-bell size-4 flex-none pt-0.5 text-ink-gray-5"
          aria-hidden="true"
        />
        <span class="min-w-0 flex-1">
          <span class="block break-words text-ink-gray-8">{{
            row.subject
          }}</span>
          <span class="block text-ink-gray-6">{{ when(row.when) }}</span>
        </span>
      </li>
    </ul>
  </article>
</template>
<script setup>
import { computed } from 'vue'
import { Button } from 'frappe-ui'
import { relativeTime } from '@/utils/display'
import { recipientChips } from '@/components/documentos/avisame'

const props = defineProps({
  recipe: { type: Object, required: true },
  canEdit: Boolean,
  busy: Boolean,
})
const emit = defineEmits(['toggle', 'days', 'recipients'])

const chips = computed(() => recipientChips(props.recipe))
const days = computed(() => Number(props.recipe.days ?? 0))
const lastLine = computed(() => {
  if (!props.recipe.last_fired) return 'Todavía no se ha disparado.'
  const count = Number(props.recipe.fired_count || 0)
  return `Último aviso ${when(props.recipe.last_fired)} · ${count} ${
    count === 1 ? 'vez' : 'veces'
  } en total`
})

function when(value) {
  return value ? relativeTime(value) : ''
}

function setDays(value) {
  const clean = Math.min(Math.max(Math.round(Number(value) || 0), 0), 90)
  if (clean !== days.value) emit('days', clean)
}
</script>
