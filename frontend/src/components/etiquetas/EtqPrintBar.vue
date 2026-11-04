<template>
  <!-- The print, at the thumb: how the last one went (with the way on), why
       it cannot run yet, and the two ways out: the browser's print dialog or
       a PDF (one label a page) to share or keep. -->
  <div class="space-y-2">
    <section
      v-if="result"
      role="status"
      class="space-y-2 rounded-8 p-3 text-sm"
      :class="
        result.ok
          ? 'bg-surface-green-1 text-ink-green-8'
          : 'bg-surface-red-1 text-ink-red-7'
      "
      data-etq-result
    >
      <div class="flex items-start gap-2">
        <p class="min-w-0 flex-1 font-semibold">{{ heading }}</p>
        <button
          type="button"
          class="press -mr-1.5 -mt-1.5 flex size-9 flex-none items-center justify-center rounded-full hover:bg-surface-base"
          aria-label="Cerrar el aviso"
          title="Cerrar"
          @click="emit('dismiss')"
        >
          <span class="lucide-x size-4" aria-hidden="true" />
        </button>
      </div>
      <p>{{ body }}</p>
      <div class="flex flex-wrap gap-2">
        <Button
          v-if="!result.ok"
          variant="solid"
          class="press min-h-11"
          label="Volver a intentar"
          :loading="!!busy"
          @click="emit('retry')"
        />
        <Button
          v-if="!result.ok && result.html"
          class="press min-h-11"
          label="Descargar etiquetas"
          @click="emit('download')"
        />
        <Button
          v-if="result.pdf"
          class="press min-h-11"
          :label="
            result.pdf === 'shared' ? 'Compartir otra vez' : 'Guardar otra vez'
          "
          @click="emit('again')"
        />
        <Button
          v-if="result.job"
          class="press min-h-11"
          label="Ver trabajo"
          @click="emit('job')"
        />
        <Button
          v-if="result.ok"
          class="press min-h-11"
          label="Vaciar lista"
          @click="emit('clear')"
        />
      </div>
    </section>
    <div class="space-y-1" data-etq-print>
      <p
        v-if="blocked && !busy"
        class="text-sm text-ink-gray-6"
        data-etq-print-why
      >
        {{ blocked }}
      </p>
      <!-- Side by side, the print taking the room; on the narrowest phones
           the PDF goes under and takes the whole row. -->
      <div class="flex flex-wrap gap-2">
        <Button
          variant="solid"
          class="press min-h-12 min-w-0 grow-[999] basis-48 text-base"
          :label="label"
          :loading="busy === 'print'"
          :disabled="!!blocked || !!busy"
          @click="emit('print')"
        >
          <template #prefix>
            <Icon icon="printer" class="size-5" />
          </template>
        </Button>
        <Button
          v-if="pdf"
          class="press min-h-12 flex-auto"
          :label="share ? 'Compartir PDF' : 'PDF'"
          :aria-label="share ? 'Compartir en PDF' : 'Guardar en PDF'"
          title="Un PDF con una etiqueta por página, para imprimir desde otra app o guardarlo"
          :loading="busy === 'pdf'"
          :disabled="!!blocked || !!busy"
          data-etq-pdf
          @click="emit('pdf')"
        >
          <template #prefix>
            <Icon icon="file-down" class="size-5" />
          </template>
        </Button>
      </div>
    </div>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { Button } from 'frappe-ui'
import Icon from '@/components/Icon.vue'
import { labelsText } from '@/composables/useEtiquetas'

const props = defineProps({
  label: { type: String, default: 'Imprimir' },
  // Why it cannot print yet ('' = it can), said beside the button.
  blocked: { type: String, default: '' },
  // '' | 'print' | 'pdf'
  busy: { type: String, default: '' },
  // How the last print went: { ok, reason?, job?, html?, pdf?: 'saved' | 'shared', size? }
  result: { type: Object, default: null },
  // A phone shares the PDF; a computer saves it.
  share: { type: Boolean, default: false },
  // A PDF needs the label's size; a store format that does not say it
  // prints from the browser only.
  pdf: { type: Boolean, default: true },
})
const emit = defineEmits([
  'print',
  'pdf',
  'retry',
  'download',
  'again',
  'job',
  'clear',
  'dismiss',
])

const heading = computed(() => {
  const result = props.result
  if (!result) return ''
  if (!result.ok) return 'No se imprimió'
  if (result.pdf === 'shared') return 'PDF compartido'
  if (result.pdf) return 'PDF guardado'
  return 'Enviada a la impresora'
})
const body = computed(() => {
  const result = props.result
  if (!result) return ''
  if (!result.ok) return result.reason
  const count = labelsText(result.job?.label_count)
  if (result.pdf)
    return `${count}, una por página. Imprímelo a tamaño real (100 %) y sin márgenes, en la impresora de etiquetas.`
  return `${count} en ${result.job?.layout_label}. Si no salió, revisa que elegiste la impresora de etiquetas en el diálogo y vuelve a imprimir.`
})
</script>
