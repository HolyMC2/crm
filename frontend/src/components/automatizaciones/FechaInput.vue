<template>
  <!-- A date in es-MX (dd/mm/aaaa, Hoy · Mañana · En una semana, the month):
       the shell's DateField, never the browser's US mm/dd/yyyy. `min` is
       checked by the sheet (fechasInvalidas), which says why in words. -->
  <fieldset class="min-w-0 space-y-1" :disabled="disabled">
    <legend class="pb-1 text-sm font-medium text-ink-gray-7">
      {{ label }}
    </legend>
    <DateField v-model="value" :label="label" required />
    <p v-if="hint" class="text-sm text-ink-gray-6">{{ hint }}</p>
  </fieldset>
</template>
<script setup>
import { DateField } from '@/components/ui'

const value = defineModel({ type: String, default: '' })
defineProps({
  label: { type: String, default: '' },
  /** The earliest day the sheet accepts (validated there, in words). */
  min: { type: String, default: '' },
  hint: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
})
</script>
