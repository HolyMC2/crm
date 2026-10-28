<template>
  <template v-if="allowed.length">
    <template v-if="trigger">
      <button
        v-if="variant === 'appbar'"
        type="button"
        class="flex size-12 items-center justify-center rounded-full text-ink-gray-7"
        :aria-label="buttonLabel"
        :title="buttonLabel"
        v-bind="$attrs"
        data-capturar-documento
        @click="show"
      >
        <LucideFilePlus class="h-6 w-6" />
      </button>
      <!-- a shortcut chip in a search panel (ui/chipClass) -->
      <button
        v-else-if="variant === 'chip'"
        type="button"
        :class="chipClass(false)"
        v-bind="$attrs"
        data-capturar-documento
        @click="show"
      >
        <LucideFilePlus class="size-3.5" aria-hidden="true" />
        {{ buttonLabel }}
      </button>
      <Button
        v-else
        :variant="variant"
        :icon-left="LucideFilePlus"
        :label="buttonLabel"
        class="min-h-11 sm:min-h-8"
        v-bind="$attrs"
        data-capturar-documento
        @click="show"
      />
    </template>
  </template>
</template>
<script setup>
import { computed, onMounted, watch } from 'vue'
import { Button } from 'frappe-ui'
import {
  allowedTargets,
  capturaBoot,
  loadCapturaBoot,
} from '@/composables/useCaptura'
import { loadCameraSheet, openCamera } from './cameraDoor'
import LucideFilePlus from '~icons/lucide/file-plus'
import { chipClass } from '@/components/ui/chipClass'

// «Capturar documento»: a door of the shell's document camera (Shell D7,
// SPEC DD14) with this page's intent preset: the targets it offers, the
// supplier, the invoice a receipt pays. The camera (or a photo, PDF or XML)
// goes through «¿Qué es?» to the books capture review
// (/compras|gastos/captura/:name). Hidden when this user may create none of
// the caller's targets (boot.targets, D9).
defineOptions({ inheritAttrs: false })
const props = defineProps({
  /** Doctypes this entry point offers, in preference order. */
  targets: { type: Array, required: true },
  supplier: { type: String, default: '' },
  invoice: { type: String, default: '' },
  label: { type: String, default: '' },
  variant: { type: String, default: 'subtle' },
  returnLabel: { type: String, default: '' },
  /** False: no button of its own; the caller opens it with v-model:open. */
  trigger: { type: Boolean, default: true },
})
const open = defineModel('open', { type: Boolean, default: false })
const boot = capturaBoot

const allowed = computed(() => allowedTargets(boot.value, props.targets))
const buttonLabel = computed(() => props.label || __('Capture document'))

async function launch() {
  await openCamera({
    title: buttonLabel.value,
    targets: allowed.value,
    supplier: props.supplier || '',
    invoice: props.invoice || '',
    returnLabel: props.returnLabel || '',
  })
  open.value = false
}
watch(open, (value) => {
  if (value) launch()
})

function show() {
  open.value = true
}

onMounted(() => loadCapturaBoot())
defineExpose({ show, allowed, preload: loadCameraSheet })
</script>
