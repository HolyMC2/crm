<!-- Period presets plus a custom range; the page owns the state (URL query). -->
<template>
  <div class="flex min-w-0 flex-col gap-2">
    <div
      class="flex flex-wrap gap-1.5"
      role="group"
      :aria-label="__('Período')"
    >
      <button
        v-for="p in presets"
        :key="p.key"
        type="button"
        class="rounded-full px-3 py-1.5 text-sm transition-colors"
        :class="
          shown === p.key
            ? 'bg-surface-gray-3 font-medium text-ink-gray-9'
            : 'bg-surface-gray-1 text-ink-gray-6 hover:bg-surface-gray-2 hover:text-ink-gray-8'
        "
        :aria-pressed="shown === p.key"
        :data-period="p.key"
        @click="pick(p.key)"
      >
        {{ p.label }}
      </button>
    </div>
    <form
      v-if="shown === 'custom'"
      class="flex flex-wrap items-end gap-2"
      @submit.prevent="apply"
    >
      <label class="flex flex-col gap-1 text-xs text-ink-gray-6">
        {{ __('Desde') }}
        <input
          v-model="draftFrom"
          type="date"
          class="h-8 rounded border border-outline-gray-2 bg-surface-base px-2 text-sm text-ink-gray-8"
          :max="draftTo || undefined"
          required
        />
      </label>
      <label class="flex flex-col gap-1 text-xs text-ink-gray-6">
        {{ __('Hasta') }}
        <input
          v-model="draftTo"
          type="date"
          class="h-8 rounded border border-outline-gray-2 bg-surface-base px-2 text-sm text-ink-gray-8"
          :min="draftFrom || undefined"
          required
        />
      </label>
      <button
        type="submit"
        class="h-8 rounded bg-surface-gray-3 px-3 text-sm font-medium text-ink-gray-8 hover:bg-surface-gray-4 disabled:opacity-50"
        :disabled="!valid"
      >
        {{ __('Aplicar') }}
      </button>
    </form>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { periodRange } from '@/utils/pipelineMath'

const props = defineProps({
  period: { type: String, required: true },
  // the range currently shown, used to prefill a custom range
  range: { type: Object, default: null },
})
const emit = defineEmits(['change'])

const presets = [
  { key: '30d', label: __('30 días') },
  { key: '90d', label: __('90 días') },
  { key: 'month', label: __('Este mes') },
  { key: 'prev_month', label: __('Mes anterior') },
  { key: 'year', label: __('Este año') },
  { key: 'custom', label: __('Personalizado') },
]

// «Personalizado» opens the form without reloading until a range is applied.
const editing = ref(false)
const shown = computed(() => (editing.value ? 'custom' : props.period))
const draftFrom = ref('')
const draftTo = ref('')
const valid = computed(
  () =>
    !!periodRange('custom', draftTo.value || '2000-01-01', {
      from: draftFrom.value,
      to: draftTo.value,
    }),
)

function syncDraft() {
  draftFrom.value = props.range?.from || ''
  draftTo.value = props.range?.to || ''
}
watch(() => props.range, syncDraft, { immediate: true })
watch(
  () => props.period,
  () => (editing.value = false),
)

function pick(key) {
  if (key === 'custom') {
    syncDraft()
    editing.value = true
    return
  }
  editing.value = false
  emit('change', { period: key, from: '', to: '' })
}
function apply() {
  if (!valid.value) return
  editing.value = false
  emit('change', { period: 'custom', from: draftFrom.value, to: draftTo.value })
}
</script>
