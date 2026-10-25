<template>
  <li class="flex items-center gap-1 pr-2">
    <button
      type="button"
      class="flex min-h-16 min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left hover:bg-surface-gray-1 focus-visible:bg-surface-gray-2 focus-visible:outline-none"
      :aria-label="`${row.titulo}: ajustes`"
      @click="$emit('open')"
    >
      <span
        class="mt-0.5 size-5 flex-none"
        :class="[icon, row.habilitada ? 'text-ink-gray-7' : 'text-ink-gray-4']"
        aria-hidden="true"
      />
      <span class="min-w-0 flex-1">
        <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            class="break-words text-base-medium"
            :class="row.habilitada ? 'text-ink-gray-9' : 'text-ink-gray-6'"
            >{{ row.titulo }}</span
          >
          <span
            v-if="row.categoria"
            class="inline-flex min-h-6 items-center whitespace-nowrap rounded-full bg-surface-amber-1 px-2 text-xs font-medium text-ink-amber-9"
            >{{ row.categoria_label }}</span
          >
        </span>
        <span
          v-if="row.resumen"
          class="mt-0.5 line-clamp-2 break-words text-sm text-ink-gray-7"
          >{{ row.resumen }}</span
        >
        <span
          v-if="line"
          class="mt-0.5 block break-words text-sm text-ink-gray-6"
          >{{ EFECTO_LABEL[row.efecto] }} · {{ line }}</span
        >
        <span v-else class="mt-0.5 block text-sm text-ink-gray-6">{{
          EFECTO_LABEL[row.efecto]
        }}</span>
      </span>
    </button>
    <AjustesSwitch
      :model-value="Boolean(row.habilitada)"
      :label="`${row.habilitada ? 'Apagar' : 'Encender'}: ${row.titulo}`"
      :disabled="busy"
      :wide="false"
      @update:model-value="(value) => $emit('toggle', value)"
    />
  </li>
</template>
<script setup>
import { computed } from 'vue'
import AjustesSwitch from '@/components/ajustes/AjustesSwitch.vue'
import { EFECTO_LABEL, supporting } from './herramientas'

const props = defineProps({
  row: { type: Object, required: true },
  busy: { type: Boolean, default: false },
})
defineEmits(['open', 'toggle'])

const line = computed(() => supporting(props.row))
const icon = computed(() =>
  props.row.efecto === 'envío'
    ? 'lucide-send'
    : props.row.efecto === 'escritura'
      ? 'lucide-pencil-line'
      : 'lucide-search',
)
</script>
