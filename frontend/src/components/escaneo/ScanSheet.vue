<template>
  <!-- The shell's «Escanear» (scanDoor.js): read one code with the camera,
       typing or a scanner gun into the focused field, and answer it here.
       A product opens (or goes to the page or document that asked); a code
       several products share asks which; a code nobody has opens the create
       form in this same sheet. Nothing leaves the shell. -->
  <BottomSheet
    :open="sheetOpen"
    :title="title"
    layer="scan"
    :dismissible="!altaBusy"
    @update:open="onSheetOpen"
    @closed="onClosed"
  >
    <div class="flex flex-col gap-3 pt-1" :data-scan-phase="phase">
      <form
        v-if="phase === 'read'"
        class="flex flex-col gap-3"
        data-scan-read
        @submit.prevent="submitTyped"
      >
        <p class="text-base text-ink-gray-7">{{ readHint }}</p>
        <div class="flex items-center gap-2">
          <label class="sr-only" for="shell-scan-code">{{
            __('Code, barcode or IMEI', null, CTX)
          }}</label>
          <input
            id="shell-scan-code"
            ref="field"
            v-model="typed"
            type="text"
            inputmode="text"
            enterkeyhint="go"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            class="h-12 min-w-0 flex-1 rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-base text-ink-gray-9"
            :placeholder="__('Code, barcode or IMEI', null, CTX)"
            data-scan-field
          />
          <Button
            type="submit"
            class="min-h-12"
            :label="__('Use', null, CTX)"
            :disabled="!typed.trim()"
            data-scan-use
          />
        </div>
        <Button
          v-if="canCamera"
          class="min-h-12 w-full"
          variant="solid"
          :label="__('Open the camera', null, CTX)"
          data-scan-camera
          @click="camera = true"
        >
          <template #prefix>
            <span class="lucide-scan-barcode size-5" aria-hidden="true" />
          </template>
        </Button>
        <a
          v-else-if="escanerHref"
          :href="escanerHref"
          class="text-base font-medium text-ink-gray-8 underline"
          data-scan-escaner
          >{{ __("Use Escáner's camera", null, CTX) }}</a
        >
        <p
          v-if="problem"
          role="alert"
          class="rounded-6 bg-surface-amber-1 px-3 py-2 text-base text-ink-amber-8"
          data-scan-problem
        >
          {{ problem }}
          <button
            v-if="searchText"
            type="button"
            class="press ml-1 font-medium underline"
            data-scan-search
            @click="searchProducts"
          >
            {{ __('Search Productos', null, CTX) }}
          </button>
        </p>
      </form>

      <p
        v-else-if="phase === 'busy'"
        role="status"
        class="flex items-center gap-2 py-4 text-base text-ink-gray-7"
        data-scan-busy
      >
        <span
          class="lucide-loader-circle size-5 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        {{ __('Looking up «{0}»…', [code], CTX) }}
      </p>

      <div v-else-if="phase === 'choose'" data-scan-choose>
        <p class="pb-2 text-base text-ink-gray-7">
          {{
            __('Several products carry «{0}». Which one is it?', [code], CTX)
          }}
        </p>
        <ul class="flex flex-col">
          <li v-for="row in choices" :key="row.item_code">
            <ListRow
              icon="lucide-package"
              :title="row.item_name"
              :subtitle="
                row.disabled
                  ? __('Disabled', null, CTX)
                  : row.item_name === row.item_code
                    ? ''
                    : row.item_code
              "
              :data-scan-choice="row.item_code"
              @click="finish({ kind: 'item', via: 'barcode', ...row })"
            />
          </li>
        </ul>
      </div>

      <AltaForm
        v-else-if="phase === 'alta'"
        ref="alta"
        :prefill="prefill"
        :doctype="scan.options.doctype || ''"
        form-id="shell-scan-alta"
        :hint="altaHint"
        @created="onCreated"
        @requested="onRequested"
      />
    </div>

    <template v-if="phase === 'alta' || phase === 'choose'" #actions>
      <div class="flex flex-wrap justify-end gap-2">
        <Button
          class="min-h-12 sm:min-h-8"
          :label="__('Scan another', null, CTX)"
          :disabled="altaBusy"
          data-scan-again
          @click="again"
        />
        <Button
          v-if="phase === 'alta'"
          type="submit"
          form="shell-scan-alta"
          variant="solid"
          class="min-h-12 sm:min-h-8"
          :label="
            prefill.can_create
              ? __('Add product', null, CTX)
              : __('Ask for it', null, CTX)
          "
          :loading="altaBusy"
          :disabled="!altaReady"
          data-scan-alta-save
        />
      </div>
    </template>
  </BottomSheet>
  <BarcodeCamera
    v-if="camera && scan.open"
    @code="onCamera"
    @close="closeCamera"
  />
</template>
<script setup>
import { computed, defineAsyncComponent, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, toast } from 'frappe-ui'
import { BottomSheet, ListRow } from '@/components/ui'
import { scanPickHref } from '@/composables/shellRail'
import { errorText } from '@/documentos/api'
import AltaForm from './AltaForm.vue'
import { createdItem, looksLikeCode, resolveScan } from './escaneo'
import { scan, scanClaim, settleScan } from './scanDoor'

const BarcodeCamera = defineAsyncComponent(
  () => import('@/components/documentos/BarcodeCamera.vue'),
)

const CTX = 'Escaneo'
const route = useRoute()
const router = useRouter()

const phase = ref('read')
const typed = ref('')
const code = ref('')
const problem = ref('')
const searchText = ref('')
const choices = ref([])
const prefill = ref({})
const camera = ref(false)
const field = ref(null)
const alta = ref(null)
let ticket = 0

const canCamera =
  typeof globalThis.window !== 'undefined' && 'BarcodeDetector' in window
const coarse = () =>
  typeof window !== 'undefined' &&
  Boolean(window.matchMedia?.('(pointer: coarse)')?.matches)
// No BarcodeDetector (an iPhone): Escáner's own camera reads it instead.
const escanerHref = computed(() =>
  canCamera ? null : scanPickHref(route.fullPath),
)

const title = computed(() => {
  if (phase.value === 'alta')
    return prefill.value.can_create
      ? __('New product', null, CTX)
      : __('Not in your catalog', null, CTX)
  if (phase.value === 'choose') return __('Which product is it?', null, CTX)
  return __('Scan a code')
})
const readHint = computed(() => {
  if (scan.options.onItem)
    return __('The product goes on the document.', null, CTX)
  if (scanClaim()) return __('The code goes to this page.', null, CTX)
  return __(
    'Its product opens. Use the camera, type it, or scan it with a scanner gun.',
    null,
    CTX,
  )
})
const altaHint = computed(() =>
  scan.options.onItem
    ? __('Once added, it goes on the document.', null, CTX)
    : __('Once added, its page opens.', null, CTX),
)
// The camera is a full-screen layer of its own: the sheet steps aside while
// it reads (a modal sheet would cover it and hold the focus).
const sheetOpen = computed(() => scan.open && !camera.value)
const altaBusy = computed(() => Boolean(alta.value?.busy))
const altaReady = computed(() => Boolean(alta.value?.ready))

function reset() {
  ticket += 1
  phase.value = 'read'
  typed.value = ''
  code.value = ''
  problem.value = ''
  searchText.value = ''
  choices.value = []
  prefill.value = {}
}

async function focusField() {
  await nextTick()
  if (phase.value === 'read' && !camera.value)
    field.value?.focus({ preventScroll: true })
}

function start() {
  reset()
  const { resolved, code: given } = scan.options
  if (resolved) {
    code.value = resolved.code || given || ''
    return apply(resolved, { scanned: true })
  }
  if (given) return lookup(String(given), { scanned: true })
  if (canCamera && coarse()) camera.value = true
  else focusField()
}

// Each openScan is a new request (its own resolve), even over an open sheet.
watch(
  () => scan.resolve,
  (resolve) => {
    if (resolve && scan.open) start()
  },
  { immediate: true },
)

async function lookup(text, { scanned = false } = {}) {
  const value = String(text || '').trim()
  if (!value) return
  // A page that counts codes itself (Recepción) takes the code as read.
  const claim = !scan.options.onItem && scanClaim()
  if (claim) {
    settleScan(null)
    claim(value)
    return
  }
  code.value = value
  problem.value = ''
  searchText.value = ''
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    problem.value = __(
      'No connection: «{0}» could not be looked up.',
      [value],
      CTX,
    )
    phase.value = 'read'
    return
  }
  phase.value = 'busy'
  const mine = ++ticket
  try {
    const result = await resolveScan(value, scan.options.doctype || '')
    if (mine !== ticket) return
    apply(result, { scanned })
  } catch (error) {
    if (mine !== ticket) return
    problem.value = errorText(error)
    phase.value = 'read'
    focusField()
  }
}

function apply(result, { scanned = false } = {}) {
  if (result?.kind === 'item') return finish(result)
  if (result?.kind === 'choose') {
    choices.value = result.items || []
    phase.value = 'choose'
    return
  }
  // Unknown. A code read by a camera or a gun, or typed like one, may become
  // a product; a typed name is a search instead.
  if (result?.prefill && (scanned || looksLikeCode(code.value))) {
    prefill.value = result.prefill
    phase.value = 'alta'
    return
  }
  problem.value = __('No product has the code «{0}».', [code.value], CTX)
  searchText.value = code.value
  phase.value = 'read'
  focusField()
}

function finish(item) {
  const onItem = scan.options.onItem
  settleScan(item)
  if (onItem) return onItem(item)
  router.push({ path: `/productos/${encodeURIComponent(item.item_code)}` })
}

function onCreated(result) {
  const item = createdItem(result)
  toast.success(
    item.created
      ? __('{0} added to your catalog', [item.item_name], CTX)
      : __('{0} was already in your catalog', [item.item_name], CTX),
  )
  finish(item)
}

function onRequested() {
  toast.success(__('Request sent', null, CTX))
  settleScan(null)
}

function submitTyped() {
  lookup(typed.value)
  typed.value = ''
}

function onCamera(value) {
  camera.value = false
  if (value) lookup(String(value), { scanned: true })
  else focusField()
}

// Closing the camera before it read anything leaves the sheet's field.
function closeCamera() {
  camera.value = false
  focusField()
}

function again() {
  reset()
  if (canCamera && coarse()) camera.value = true
  else focusField()
}

function searchProducts() {
  const q = searchText.value
  settleScan(null)
  router.push({ path: '/productos', query: { q } })
}

// Back, Esc, the scrim or a swipe: the worker is done with the scanner.
function onSheetOpen(open) {
  if (!open && !camera.value) settleScan(null)
}

function onClosed() {
  if (scan.open) return
  camera.value = false
  reset()
}
</script>
