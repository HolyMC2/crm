<template>
  <!-- Mounts the sheet of the step a page asked for (steps.js); each sheet
       loads on its first open. The bank's steps are the trip card in a sheet. -->
  <ConteoSheet
    v-if="used.conteo"
    v-bind="conteo?.props || {}"
    :open="!!step && step.sheet === 'conteo'"
    :submit="conteo?.submit || noop"
    @update:open="(v) => !v && $emit('close')"
    @done="done"
  />
  <PasoSheet
    v-if="used.paso"
    v-bind="paso?.props || {}"
    :open="!!step && step.sheet === 'paso'"
    :submit="paso?.submit || noop"
    @update:open="(v) => !v && $emit('close')"
    @done="done"
  />
  <BottomSheet
    v-if="used.viaje && viaje"
    :open="!!step && step.sheet === 'viaje'"
    :title="viaje.props.stage === 'salir' ? 'Al banco' : 'Ficha del banco'"
    :subtitle="viaje.props.safe?.title || ''"
    data-viaje-hoja
    @update:open="(v) => !v && $emit('close')"
  >
    <ViajeCard
      :key="viajeKey"
      v-bind="viaje.props"
      class="!bg-transparent !p-0"
      @done="viajeDone"
    />
  </BottomSheet>
</template>
<script setup>
import { defineAsyncComponent, reactive, ref, shallowRef, watch } from 'vue'
import { toast } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'

const ConteoSheet = defineAsyncComponent(() => import('./ConteoSheet.vue'))
const PasoSheet = defineAsyncComponent(() => import('./PasoSheet.vue'))
const ViajeCard = defineAsyncComponent(() => import('./ViajeCard.vue'))

const props = defineProps({ step: { type: Object, default: null } })
const emit = defineEmits(['close', 'done'])
const used = reactive({ conteo: false, paso: false, viaje: false })
// The last step of each kind stays bound while its sheet slides out.
const conteo = shallowRef(null)
const paso = shallowRef(null)
const viaje = shallowRef(null)
const viajeKey = ref(0)
const noop = async () => null

watch(
  () => props.step,
  (step) => {
    if (!step) return
    used[step.sheet] = true
    if (step.sheet === 'conteo') conteo.value = step
    else if (step.sheet === 'viaje') {
      viaje.value = step
      viajeKey.value += 1
    } else paso.value = step
  },
  { immediate: true },
)

function done(result) {
  if (result?.toast) toast.success(result.toast)
  emit('done', result)
}
function viajeDone(result) {
  done(result)
  emit('close')
}
</script>
