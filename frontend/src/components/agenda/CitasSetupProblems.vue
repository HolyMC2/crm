<template>
  <!-- What stops online appointments (doco.citas.service.PROBLEMS), one list
       wherever Citas says why a booking cannot happen: the new-cita form, a
       reschedule and the settings sheet. Each row carries its fix: a button
       that opens the settings at its section when this person may fix it,
       otherwise who can, with «Pedir configuración». -->
  <div data-citas-problems>
    <ul class="space-y-2">
      <li
        v-for="row in problems"
        :key="row.code"
        class="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-gray-7"
        :data-code="row.code"
      >
        <span class="flex-1 basis-48">{{ row.message }}</span>
        <Button
          v-if="fixable(row)"
          class="min-h-11"
          :variant="solid ? 'solid' : 'subtle'"
          :label="__(SETUP_SECTIONS[row.code].label)"
          :data-fix="row.code"
          @click="emit('fix', SETUP_SECTIONS[row.code].section)"
        />
      </li>
    </ul>
    <ClaimGuard v-if="needsHelp" class="mt-2" :guard="setupGuard(fixers)" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Button } from 'frappe-ui'
import ClaimGuard from '@/components/gastos/ClaimGuard.vue'
import { SETUP_SECTIONS, setupGuard } from '@/composables/useCitas'

const props = defineProps({
  problems: { type: Array, default: () => [] },
  /** Who can fix what this person cannot, by name (doco citas.api._fixers). */
  fixers: { type: Array, default: () => [] },
  /** Inside the settings sheet every section is at hand: each row gets its button. */
  inSettings: { type: Boolean, default: false },
  /** The filled button of a gate (the form); the sheet's rows stay tonal. */
  solid: { type: Boolean, default: false },
})
const emit = defineEmits(['fix'])

const fixable = (row) =>
  Boolean(SETUP_SECTIONS[row.code]) && (props.inSettings || row.can_fix)
// A problem this person cannot fix: name who can and offer «Pedir configuración».
const needsHelp = computed(
  () =>
    !props.inSettings &&
    props.problems.some((row) => SETUP_SECTIONS[row.code] && !row.can_fix),
)
</script>
