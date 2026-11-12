<template>
  <!-- One more user where the plan's cap refused an alta: Mi cuenta's quote
       sheet, preset to one more, over the page's seat step (seatStep.js).
       Its button says the change («Agregar 1 usuario») and its toast repeats
       it; the alta that asked goes again on its own. -->
  <UsuariosSheet
    v-if="step.door.value"
    :door="step.door.value"
    :open="step.open.value"
    :change="step.change.value"
    @close="step.close"
    @act="step.act"
    @done="done"
  />
</template>
<script setup>
import { toast } from 'frappe-ui'
import UsuariosSheet from './UsuariosSheet.vue'

const props = defineProps({
  /** createSeatStep's answer. */
  step: { type: Object, required: true },
})

function done(answer, said = '') {
  toast.success(said || __('Change saved', null, 'Cuenta'))
  props.step.done(answer)
}
</script>
