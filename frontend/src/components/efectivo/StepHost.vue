<template>
  <!-- Mounts the sheet of the step a page asked for (steps.js); each sheet
       loads on its first open. -->
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
</template>
<script setup>
import { defineAsyncComponent, reactive, shallowRef, watch } from 'vue'
import { toast } from 'frappe-ui'

const ConteoSheet = defineAsyncComponent(() => import('./ConteoSheet.vue'))
const PasoSheet = defineAsyncComponent(() => import('./PasoSheet.vue'))

const props = defineProps({ step: { type: Object, default: null } })
const emit = defineEmits(['close', 'done'])
const used = reactive({ conteo: false, paso: false })
// The last step of each kind stays bound while its sheet slides out.
const conteo = shallowRef(null)
const paso = shallowRef(null)
const noop = async () => null

watch(
  () => props.step,
  (step) => {
    if (!step) return
    used[step.sheet] = true
    if (step.sheet === 'conteo') conteo.value = step
    else paso.value = step
  },
  { immediate: true },
)

function done(result) {
  if (result?.toast) toast.success(result.toast)
  emit('done', result)
}
</script>
