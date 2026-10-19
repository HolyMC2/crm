<template>
  <!-- Imprimir o PDF: pick the print format, then open the PDF (print it from
       there) or send it. -->
  <BottomSheet
    :open="open"
    title="Imprimir o PDF"
    :subtitle="subtitle"
    flush
    @update:open="emit('update:open', $event)"
  >
    <p v-if="error" role="alert" class="px-4 pb-2 text-base text-ink-red-7">
      {{ error }}
    </p>
    <p v-if="loading" class="px-4 py-3 text-base text-ink-gray-6">
      Cargando formatos…
    </p>
    <ul v-else class="pb-2" data-testid="documentos-print-formats">
      <li v-for="f in formats" :key="f.name">
        <ListRow
          icon="lucide-file-text"
          :title="f.label === 'Standard' ? 'Estándar' : f.label"
          :subtitle="f.hint || (f.default ? 'El de siempre' : '')"
          :selected="f.name === format"
          @click="format = f.name"
        />
      </li>
    </ul>
    <!-- Shell D12: the PDF as pages, in a sheet of its own (loads on demand). -->
    <PrintPreview
      v-if="previewing"
      v-model:open="previewing"
      v-model:formato="format"
      :doctype="doctype"
      :name="name"
      :title="title"
      :subtitle="subtitle"
      :url="url"
      :formats="formats"
      @shared="emit('shared', $event)"
    />
    <template #actions>
      <button
        type="button"
        :class="BTN.tonal"
        data-testid="documentos-print-preview"
        @click="previewing = true"
      >
        <span class="lucide-eye size-5" aria-hidden="true" />
        Vista previa
      </button>
      <a
        :class="BTN.filled"
        :href="href"
        target="_blank"
        rel="noopener"
        data-testid="documentos-print-open"
        @click="emit('update:open', false)"
      >
        <span class="lucide-download size-5" aria-hidden="true" />
        Ver PDF para imprimir
      </a>
      <button
        type="button"
        :class="BTN.tonal"
        :disabled="sharing"
        @click="share"
      >
        <span
          class="lucide-square-arrow-out-up-right size-5"
          aria-hidden="true"
        />
        {{ sharing ? 'Preparando…' : 'Enviar PDF' }}
      </button>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { BottomSheet, ListRow } from '@/components/ui'
import { docApi, errorText } from '@/documentos/api'
import { BTN, curateFormats, pdfUrl, shareDocument } from '@/documentos/tools'

const props = defineProps({
  open: { type: Boolean, default: false },
  doctype: { type: String, required: true },
  name: { type: String, required: true },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  // The record's shell link, for when the phone cannot send files.
  url: { type: String, default: '' },
  // The profile's say on the picker: `{ only?, hide?, labels?, hints?, first? }`
  // (Spanish names, internal formats out, its default first; tools.js).
  curate: { type: Object, default: null },
})
const emit = defineEmits(['update:open', 'shared'])
const PrintPreview = defineAsyncComponent(
  () => import('@/components/impresion/PrintPreview.vue'),
)
const previewing = ref(false)
const formats = ref([])
const format = ref('')
const loading = ref(false)
const sharing = ref(false)
const error = ref('')
const href = computed(() => pdfUrl(props.doctype, props.name, format.value))

watch(
  () => [props.open, props.doctype],
  async ([open]) => {
    error.value = ''
    if (!open || formats.value.length) return
    loading.value = true
    try {
      formats.value = curateFormats(
        (await docApi('print_formats', {
          doctype: props.doctype,
        })) || [{ name: 'Standard', label: 'Standard', default: true }],
        props.curate,
      )
      format.value = (
        formats.value.find((f) => f.default) || formats.value[0]
      )?.name
    } catch (e) {
      error.value = errorText(e)
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

async function share() {
  sharing.value = true
  const result = await shareDocument({
    doctype: props.doctype,
    name: props.name,
    title: props.title,
    url: props.url,
    format: format.value,
  })
  sharing.value = false
  if (result !== 'cancelled') emit('shared', result)
  if (result === 'shared' || result === 'copied') emit('update:open', false)
}
</script>
