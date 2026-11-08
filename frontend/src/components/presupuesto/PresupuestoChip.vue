<template>
  <!-- The budget lines a record draws from (doco.workspaces.presupuesto.documento):
       one row per concept with where it stands, each a door to the budget page
       with that line in sight. Draws nothing when the record touches no plan
       or the person may not read it. -->
  <ul
    v-if="lines.length"
    class="flex flex-col gap-1"
    :aria-label="__('Budget', null, 'Presupuesto')"
    data-testid="presupuesto-chip"
  >
    <li v-for="line in lines" :key="line.key">
      <RouterLink
        :to="lineHref(line)"
        class="press flex min-h-9 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-6 text-sm text-ink-gray-7 active:bg-surface-gray-1 [@media(hover:hover)]:hover:bg-surface-gray-1"
      >
        <span class="lucide-wallet size-4 flex-none" aria-hidden="true" />
        <StatusChip :label="line.label" :tone="stateTone(line.state)" />
        <span v-for="part in chipParts(line)" :key="part">{{ part }}</span>
      </RouterLink>
    </li>
  </ul>
</template>
<script setup>
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { StatusChip } from '@/components/ui'
import { comprasApi } from '@/composables/useCompras'
import { API, chipParts, lineHref, stateTone } from '@/utils/presupuesto'

const props = defineProps({
  doctype: { type: String, required: true },
  name: { type: String, required: true },
  /** Changes when the record changes (its `modified`), so the chip reads again. */
  version: { type: [String, Number], default: '' },
})
const lines = ref([])
let ticket = 0

async function load() {
  const mine = ++ticket
  if (!props.doctype || !props.name) {
    lines.value = []
    return
  }
  try {
    const out = await comprasApi(API + 'documento', {
      doctype: props.doctype,
      name: props.name,
    })
    if (mine === ticket) lines.value = out?.lines || []
  } catch {
    // A refusal or a missing doco keeps the record page whole: no chip.
    if (mine === ticket) lines.value = []
  }
}

watch(() => [props.doctype, props.name, props.version], load, {
  immediate: true,
})
</script>
