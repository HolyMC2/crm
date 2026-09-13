<!--
  Deal 360 stage stepper (pipeline plan §Frontend). Replaces the plain status
  dropdown in the desktop DealHeader: the flow stages (Open / Ongoing / On Hold)
  as clickable segments in position order, then «Ganado» and a «Perdido»
  dropdown for the outcome statuses.

  Presentation only — it emits `change(statusName)` and the header runs its own
  status-change path (guardStatusChange + the lost-reason prompt). Partition and
  colours come from utils/stagePartition, which keys off `type`, never a status
  NAME: the taxonomy is tenant-seeded and bilingual.

  Button colours are left entirely to `theme` + `variant`; a hand-passed colour
  class on a frappe-ui Button competes with its own recipe and may silently lose
  (memory: frappe-ui-button-class-merge).
-->
<template>
  <div class="flex items-center gap-1.5">
    <!-- Legacy/hidden stage the visible set no longer carries: never pretend the
         deal is somewhere else — show where it actually is. -->
    <span
      v-if="model.unknown"
      class="flex-none rounded-md border border-dashed border-outline-gray-3 px-2 py-[5px] text-[11.5px] font-medium text-ink-gray-5"
      :title="__('Etapa fuera del embudo activo')"
    >
      {{ current }}
    </span>

    <div
      v-if="model.steps.length"
      class="flex items-center overflow-hidden rounded-lg border border-outline-gray-2"
    >
      <Tooltip v-for="s in model.steps" :key="s.name" :text="stageHint(s)">
        <button
          class="border-l border-outline-gray-2 px-[9px] py-[6px] text-[11.5px] leading-4 first:border-l-0 disabled:cursor-not-allowed"
          :class="s.state === 'current' ? 'font-bold' : 'font-medium hover:bg-surface-gray-2'"
          :style="segmentStyle(s)"
          :disabled="disabled"
          :aria-current="s.state === 'current' ? 'step' : undefined"
          @click="pick(s)"
        >
          {{ s.name }}
        </button>
      </Tooltip>
    </div>

    <Button
      v-if="wonStatus"
      theme="green"
      :variant="model.outcome === 'won' ? 'solid' : 'subtle'"
      :label="__('Ganado')"
      :tooltip="stageHint(wonStatus)"
      :disabled="disabled"
      @click="pick(wonStatus)"
    />

    <Dropdown v-if="model.lost.length" :options="lostOptions">
      <Button
        theme="red"
        :variant="model.outcome === 'lost' ? 'solid' : 'subtle'"
        :label="lostLabel"
        :disabled="disabled"
      />
    </Dropdown>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Button, Dropdown, Tooltip } from 'frappe-ui'
import { stageInk, stageSurface, stepperModel } from '@/utils/stagePartition'

const props = defineProps({
  // Visible deal statuses, already hidden-filtered and position-ordered.
  statuses: { type: Array, default: () => [] },
  current: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['change'])

const model = computed(() => stepperModel(props.statuses, props.current))
const wonStatus = computed(() => model.value.won[0] || null)

// The dropdown button names the lost status the deal is ON, so a closed-lost deal
// reads «Perdido · Cancelado» instead of an inert button.
const lostLabel = computed(() =>
  model.value.outcome === 'lost' ? `${__('Perdido')} · ${props.current}` : __('Perdido'),
)
const lostOptions = computed(() =>
  model.value.lost.map((s) => ({ label: s.name, onClick: () => pick(s) })),
)

function stageHint(s) {
  const p = s?.probability
  return p || p === 0 ? `${s.name} · ${p}%` : s?.name || ''
}

function segmentStyle(s) {
  if (s.state === 'current')
    return `background:${stageSurface(s.color, 3)};color:${stageInk(s.color, 8)};box-shadow:inset 0 -2px 0 ${stageInk(s.color, 6)}`
  if (s.state === 'past') return `background:${stageSurface(s.color, 1)};color:${stageInk(s.color, 7)}`
  return 'color:var(--ink-gray-5)'
}

function pick(s) {
  if (props.disabled || !s?.name || s.name === props.current) return
  emit('change', s.name)
}
</script>
