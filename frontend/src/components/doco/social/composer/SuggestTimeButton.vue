<!--
  SuggestTimeButton — "Sugerir hora" for the composer (W6 B3). Wraps the B2 composable
  (useSuggestTime → best_time.suggest_time), lists up to 3 branch-scoped slots in a small
  popover, and emits `pick` with the chosen datetime already shaped for the datetime-local
  input (via the pure toDtLocal helper). suggest_time is FB-only today (IG has no published
  media to learn from) — we surface that with a "solo datos de FB" hint.
-->
<template>
  <div class="relative">
    <button
      type="button" data-testid="suggest-time-open"
      class="rounded-md border border-outline-gray-2 px-2 py-0.5 text-[11px] font-semibold text-ink-gray-6 hover:text-ink-gray-8"
      @click="toggle"
    >{{ __('🕒 Sugerir hora') }}</button>

    <div v-if="open" class="absolute right-0 z-20 mt-1 w-[280px] rounded-lg border border-outline-gray-2 bg-surface-white p-2 shadow-xl">
      <div v-if="loading" class="px-1 py-2 text-[12px] text-ink-gray-5">{{ __('Buscando el mejor horario…') }}</div>
      <div v-else-if="!suggestions.length" class="px-1 py-2 text-[12px] text-ink-gray-4">{{ __('Sin datos suficientes todavía.') }}</div>
      <template v-else>
        <button
          v-for="(s, i) in suggestions" :key="i" :data-testid="`suggest-option-${i}`"
          type="button"
          class="mb-1 block w-full rounded-md px-2 py-1.5 text-left hover:bg-surface-gray-2"
          @click="choose(s)"
        >
          <span class="text-[12px] font-semibold text-ink-gray-8">{{ label(s) }}</span>
          <span v-if="s.reason" class="block text-[10.5px] text-ink-gray-5">{{ s.reason }}</span>
        </button>
      </template>
      <p v-if="fbOnly" class="mt-0.5 border-t border-outline-gray-1 px-1 pt-1.5 text-[10px] text-ink-gray-4">
        {{ __('Solo datos de Facebook (Instagram aún no tiene publicaciones para medir).') }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useSuggestTime } from '@/composables/useSuggestTime'
import { toDtLocal } from '@/composables/socialCalendar'

const props = defineProps({
  shop: { type: String, default: '' },
})
const emit = defineEmits(['pick'])

const { suggestions, fbOnly, loading, fetchSuggestions } = useSuggestTime()
const open = ref(false)

async function toggle() {
  if (open.value) {
    open.value = false
    return
  }
  open.value = true
  await fetchSuggestions(props.shop || undefined)
}

// "mié 19:00" — weekday + HH:MM read straight off the naive site-tz datetime string.
function label(s) {
  const when = s?.when || ''
  const hm = when.slice(11, 16)
  const d = new Date(when.replace(' ', 'T'))
  const wd = isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-MX', { weekday: 'short' })
  return `${wd} ${hm}`.trim()
}

function choose(s) {
  emit('pick', toDtLocal(s.when))
  open.value = false
}
</script>
