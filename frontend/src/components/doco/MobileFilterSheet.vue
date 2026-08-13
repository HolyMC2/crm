<!--
  Bottom-sheet filters for the mobile list views (Tratos / Leads).
  The desktop toolbar's FilterPopover is a 180px dropdown anchored to a button —
  on a phone it lands half off-screen and its 13px rows are below the touch
  target floor. This is the phone shape instead: one sheet, thumb-reachable,
  every group in one scroll, 44px rows, and a footer that says how many records
  the current selection leaves.
-->
<template>
  <Teleport to="body">
    <div v-if="modelValue" class="fixed inset-0 z-[400]" role="dialog" aria-modal="true" :aria-label="__('Filtros')">
      <div class="absolute inset-0 bg-black/40" @click="close" />
      <div
        class="absolute inset-x-0 bottom-0 flex max-h-[80vh] flex-col rounded-t-[18px] bg-surface-base pb-[env(safe-area-inset-bottom)]"
        style="box-shadow: 0 -6px 28px rgba(0, 0, 0, 0.18)"
      >
        <!-- grab handle + title -->
        <div class="flex-none px-4 pb-1 pt-2.5">
          <div class="mx-auto mb-2.5 h-1 w-9 rounded-full bg-surface-gray-4" aria-hidden="true" />
          <div class="flex items-center justify-between">
            <span class="text-[15px] font-bold text-ink-gray-9">{{ __('Filtros') }}</span>
            <button
              class="press -mr-2 flex h-9 w-9 items-center justify-center rounded-full text-ink-gray-5"
              :aria-label="__('Cerrar')"
              @click="close"
            >
              ✕
            </button>
          </div>
        </div>

        <div class="scb min-h-0 flex-1 overflow-y-auto px-4">
          <div v-for="g in groups" :key="g.key" class="border-b border-outline-gray-1 py-2 last:border-b-0">
            <div class="pb-1 text-[10.5px] font-bold uppercase tracking-[.07em] text-ink-gray-4">{{ g.label }}</div>
            <label
              v-for="o in g.options"
              :key="o.value"
              class="flex min-h-[44px] cursor-pointer items-center gap-3 text-[14px] text-ink-gray-8"
            >
              <input
                type="checkbox"
                class="h-[18px] w-[18px]"
                style="accent-color: var(--brand)"
                :checked="(g.selected || []).includes(o.value)"
                @change="toggle(g, o.value)"
              />
              <span v-if="o.color" class="h-2.5 w-2.5 flex-none rounded-full" :style="`background:${o.color}`" />
              <span class="truncate">{{ o.label }}</span>
            </label>
            <div v-if="!g.options.length" class="py-2 text-[12px] text-ink-gray-4">{{ __('Sin opciones') }}</div>
          </div>
        </div>

        <div class="flex flex-none items-center gap-2 border-t border-outline-gray-1 px-4 py-2.5">
          <button
            class="press h-11 flex-none rounded-[10px] border border-outline-gray-2 px-4 text-[13px] font-medium text-ink-gray-7"
            @click="$emit('clear')"
          >
            {{ __('Limpiar') }}
          </button>
          <button
            class="press h-11 flex-1 rounded-[10px] text-[14px] font-semibold text-white"
            style="background: var(--brand)"
            @click="close"
          >
            {{ resultLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // [{ key, label, options: [{value, label, color?}], selected: [] }]
  groups: { type: Array, default: () => [] },
  // rows currently matching — shown on the confirm button so the operator sees
  // the effect before dismissing the sheet
  count: { type: [Number, String], default: null },
})
const emit = defineEmits(['update:modelValue', 'change', 'clear'])

const resultLabel = computed(() =>
  props.count == null ? __('Listo') : __('Ver {0} resultados', [String(props.count)]),
)

function close() {
  emit('update:modelValue', false)
}
function toggle(group, value) {
  const cur = group.selected || []
  emit('change', {
    key: group.key,
    values: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value],
  })
}
</script>
