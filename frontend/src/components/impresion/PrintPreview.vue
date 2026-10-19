<template>
  <!-- Vista previa (Shell D12): the record as it prints, in the chosen format,
       before the PDF. Full height on the phone; pinch or «− 100% +» to zoom;
       «Membrete» on/off; the format chips switch format. Opened from
       «Imprimir o PDF». -->
  <BottomSheet
    ref="sheet"
    :open="open"
    title="Vista previa"
    :subtitle="subtitle || title"
    flush
    v-bind="SHEET_EXTRA"
    @update:open="emit('update:open', $event)"
  >
    <template #header>
      <!-- Full bleed under the sheet header's side padding (no new CSS class).
           grid-cols-1 is minmax(0, 1fr): the column keeps the sheet's width,
           so the chips scroll inside and «− 100% +» stays in reach (an `auto`
           column grew to the whole chip row and pushed the zoom off screen). -->
      <div
        class="grid min-w-0 grid-cols-1 gap-1"
        :style="{ margin: '0 -1.25rem' }"
      >
        <FilterChips
          v-if="chips.length > 1"
          class="min-w-0"
          :model-value="current"
          :chips="chips"
          :deselectable="false"
          label="Formato"
          @update:model-value="pick"
        />
        <div class="flex items-center justify-between gap-2 px-4">
          <button
            type="button"
            class="flex min-h-11 flex-none items-center"
            :aria-pressed="String(membrete)"
            data-testid="impresion-membrete"
            @click="toggleMembrete"
          >
            <span
              class="flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium"
              :class="
                membrete
                  ? 'border-transparent bg-surface-gray-3 text-ink-gray-9'
                  : 'border-outline-gray-2 text-ink-gray-7'
              "
            >
              <span
                v-if="membrete"
                class="lucide-check size-4 flex-none"
                aria-hidden="true"
              />
              Membrete
            </span>
          </button>
          <ZoomControls v-model="zoom" />
        </div>
      </div>
    </template>

    <EmptyState
      v-if="error"
      state="error"
      :title="error"
      :message="detail"
      :action="otherFormat ? 'Elegir otro formato' : 'Reintentar'"
      @action="otherFormat ? pick(otherFormat) : load()"
    />
    <EmptyState
      v-else-if="loading && !srcdoc"
      state="loading"
      title="Preparando la vista previa…"
    />
    <PreviewFrame
      v-if="srcdoc && !error"
      v-model:zoom="zoom"
      :srcdoc="srcdoc"
      :loading="loading"
      :title="`Vista previa de ${title || name}`"
    />

    <template #actions>
      <a
        :class="BTN.filled"
        :href="pdfHref"
        target="_blank"
        rel="noopener"
        data-testid="impresion-descargar"
      >
        <span class="lucide-download size-5" aria-hidden="true" />
        Descargar PDF
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
        {{ sharing ? 'Preparando…' : 'Compartir' }}
      </button>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { BottomSheet, EmptyState, FilterChips } from '@/components/ui'
import { isMobile } from '@/composables/breakpoint'
import { docApi, errorText } from '@/documentos/api'
import { BTN, curateFormats, pdfUrl, shareDocument } from '@/documentos/tools'
import { impresionApi } from './api'
import { formatChips, previewDocument } from './impresion'
import PreviewFrame from './PreviewFrame.vue'
import ZoomControls from './ZoomControls.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  doctype: { type: String, required: true },
  name: { type: String, required: true },
  /** The format to open with ('' = the type's default). */
  formato: { type: String, default: '' },
  /** The record's title («Factura ACC-SINV-…»): the shared file's name. */
  title: { type: String, default: '' },
  /** Under the sheet title («Factura de Ana López»); falls back to `title`. */
  subtitle: { type: String, default: '' },
  /** The record's shell link, for «Compartir» when the phone cannot send files. */
  url: { type: String, default: '' },
  /** The curated formats PrintSheet already has ([{ name, label, default }]); else loaded here. */
  formats: { type: Array, default: null },
  /** The profile's curation (`printFormats`), when the formats are loaded here. */
  curate: { type: Object, default: null },
})
const emit = defineEmits(['update:open', 'shared', 'update:formato'])

// A wide dialog on desktop when the shared sheet offers it (BottomSheet `wide`).
const SHEET_EXTRA = BottomSheet.props?.wide ? { wide: true } : {}

const sheet = ref(null)
const loaded = ref([])
const current = ref('')
const membrete = ref(true)
const zoom = ref(1)
const loading = ref(false)
const sharing = ref(false)
const error = ref('')
const detail = ref('')
const data = ref(null)

const formats = computed(() => props.formats || loaded.value)
const chips = computed(() => formatChips(formats.value, current.value))
// After a damaged format: the type's default, else the next one.
const otherFormat = computed(() => {
  const others = formats.value.filter((f) => f.name !== current.value)
  return (others.find((f) => f.default) || others[0])?.name || ''
})
const srcdoc = computed(() =>
  data.value?.html ? previewDocument(data.value) : '',
)
const pdfHref = computed(
  () =>
    data.value?.pdf_url ||
    pdfUrl(props.doctype, props.name, current.value) +
      (membrete.value ? '' : '&no_letterhead=1'),
)

let request = 0
async function load() {
  const mine = ++request
  loading.value = true
  error.value = ''
  detail.value = ''
  try {
    const out = await impresionApi('vista_previa', {
      doctype: props.doctype,
      name: props.name,
      formato: current.value || undefined,
      membrete: membrete.value ? 1 : 0,
    })
    if (mine !== request) return
    data.value = out
    if (!current.value && out?.formato) current.value = out.formato // the type's default
    if (out?.error) {
      // «Este formato está dañado…»: the sentence, its short cause, another format.
      error.value = out.error.message
      detail.value = out.error.detalle || ''
    }
  } catch (e) {
    if (mine === request) error.value = errorText(e)
  } finally {
    if (mine === request) loading.value = false
  }
}

async function loadFormats() {
  if (props.formats || loaded.value.length) return
  try {
    loaded.value = curateFormats(
      (await docApi('print_formats', { doctype: props.doctype })) || [],
      props.curate,
    )
  } catch {
    loaded.value = []
  }
}

function pick(value) {
  if (!value || value === current.value) return
  current.value = value
  emit('update:formato', value)
  load()
}

function toggleMembrete() {
  membrete.value = !membrete.value
  load()
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    current.value =
      props.formato || formats.value.find((f) => f.default)?.name || ''
    zoom.value = 1
    load()
    loadFormats()
    // Full height on the phone: the page is the point of this sheet.
    await nextTick()
    if (isMobile.value && sheet.value) sheet.value.expanded = true
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
    format: current.value,
  })
  sharing.value = false
  if (result !== 'cancelled') emit('shared', result)
  if (result === 'shared' || result === 'copied') emit('update:open', false)
}
</script>
