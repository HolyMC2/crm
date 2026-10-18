<template>
  <div
    v-if="camera.open"
    class="fixed inset-0 z-[60] flex bg-black/60 lg:items-center lg:justify-center"
    data-shell-layer="camera"
  >
    <section
      ref="dialog"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      class="relative flex h-full w-full flex-col overflow-hidden lg:h-[min(90vh,860px)] lg:max-w-3xl lg:rounded-2xl"
      :class="
        step === 'camera' || step === 'quees'
          ? 'bg-black text-white'
          : 'bg-surface-base text-ink-gray-9'
      "
      data-testid="camera-sheet"
      @keydown.esc.stop.prevent="dismiss"
    >
      <!-- top bar: close, title, torch -->
      <header class="flex min-h-14 flex-none items-center gap-1 px-1">
        <button
          type="button"
          :class="ICON"
          :aria-label="
            step === 'camera' || (step === 'pages' && !pages.length)
              ? __('Close')
              : __('Back')
          "
          data-testid="camera-close"
          @click="back"
        >
          <FeatherIcon
            :name="step === 'camera' ? 'x' : 'arrow-left'"
            class="size-6"
            aria-hidden="true"
          />
        </button>
        <h2 class="min-w-0 flex-1 text-lg font-semibold leading-snug">
          {{ stepTitle }}
        </h2>
        <button
          v-if="step === 'camera' && torchAvailable"
          type="button"
          :class="ICON"
          :aria-pressed="torch"
          :aria-label="
            torch ? __('Turn off the flash') : __('Turn on the flash')
          "
          data-testid="camera-torch"
          @click="toggleTorch"
        >
          <FeatherIcon
            :name="torch ? 'zap' : 'zap-off'"
            class="size-6"
            aria-hidden="true"
          />
        </button>
      </header>

      <!-- 1. the camera -->
      <template v-if="step === 'camera'">
        <div class="relative min-h-0 flex-1">
          <video
            v-show="streaming"
            ref="video"
            class="absolute inset-0 size-full object-contain"
            playsinline
            muted
            autoplay
            data-testid="camera-video"
          />
          <div
            v-if="streaming && !photoMode"
            class="pointer-events-none absolute inset-6 rounded-xl border-2 border-white/60"
            aria-hidden="true"
          />
          <p
            v-if="streaming && !photoMode"
            class="absolute inset-x-0 bottom-3 px-6 text-center text-sm text-white/90"
          >
            {{
              retakeIndex === null
                ? __('Fit the whole page inside the frame.')
                : __('Retaking page {0}.', [retakeIndex + 1])
            }}
          </p>
          <div
            v-if="!streaming"
            class="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center"
            role="status"
          >
            <template v-if="problemKind">
              <FeatherIcon
                name="camera"
                class="size-10 text-white/80"
                aria-hidden="true"
              />
              <p class="max-w-sm text-base font-medium">
                {{ problemText.title }}
              </p>
              <p class="max-w-sm text-sm text-white/80">
                {{ problemText.how }}
              </p>
              <div class="flex flex-col gap-2">
                <button
                  type="button"
                  :class="LIGHT_BUTTON"
                  data-testid="camera-native"
                  @click="nativeInput?.click()"
                >
                  <FeatherIcon
                    name="camera"
                    class="size-5"
                    aria-hidden="true"
                  />
                  {{ __('Take the photo with the phone camera') }}
                </button>
                <button
                  v-if="problemKind === 'denied'"
                  type="button"
                  :class="GHOST_BUTTON"
                  @click="startCamera"
                >
                  {{ __('Try again') }}
                </button>
              </div>
            </template>
            <p v-else class="text-sm text-white/80">
              {{ __('Opening the camera…') }}
            </p>
          </div>
        </div>
        <div
          v-if="pages.length"
          class="flex flex-none gap-2 overflow-x-auto px-4 pt-3"
          :aria-label="__('Pages')"
        >
          <button
            v-for="(page, index) in pages"
            :key="page.url"
            type="button"
            class="relative h-16 w-12 flex-none overflow-hidden rounded-md border border-white/40"
            :aria-label="__('Page {0}', [index + 1])"
            @click="step = 'pages'"
          >
            <img :src="page.url" alt="" class="size-full object-cover" />
            <span
              class="absolute bottom-0 right-0 rounded-tl bg-black/70 px-1 text-xs"
              >{{ index + 1 }}</span
            >
          </button>
        </div>
        <footer class="grid flex-none grid-cols-3 items-center px-4 pb-6 pt-3">
          <button
            type="button"
            :class="[LIGHT_ICON, 'justify-self-start']"
            :aria-label="__('Choose from the gallery or a file')"
            data-testid="camera-pick"
            @click="pickOpen = true"
          >
            <FeatherIcon name="image" class="size-6" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="flex size-[72px] items-center justify-center justify-self-center rounded-full border-4 border-white disabled:opacity-40"
            :aria-label="__('Take photo')"
            :disabled="
              !streaming ||
              shooting ||
              (retakeIndex === null && pages.length >= maxPages)
            "
            data-testid="camera-shutter"
            @click="shoot"
          >
            <span class="size-14 rounded-full bg-white" aria-hidden="true" />
          </button>
          <button
            v-if="pages.length"
            type="button"
            class="flex min-h-12 items-center gap-1 justify-self-end rounded-full bg-white px-4 text-base font-medium text-black"
            data-testid="camera-done"
            @click="step = 'pages'"
          >
            {{ __('Done ({0})', [pages.length]) }}
          </button>
        </footer>
        <p
          v-if="pages.length >= maxPages && retakeIndex === null"
          class="px-4 pb-4 text-center text-sm text-white/80"
        >
          {{
            __('That is the most pages one document can have ({0}).', [
              maxPages,
            ])
          }}
        </p>
      </template>

      <!-- 2. the pages: reorder, retake, remove -->
      <template v-else-if="step === 'pages'">
        <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <p
            v-if="single"
            class="flex items-center gap-3 rounded-xl bg-surface-gray-1 p-4 text-base"
          >
            <FeatherIcon
              name="file-text"
              class="size-6 flex-none"
              aria-hidden="true"
            />
            <span class="min-w-0 break-words">{{ single.name }}</span>
          </p>
          <ol
            v-else
            class="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3"
            data-testid="camera-pages"
          >
            <li
              v-for="(page, index) in pages"
              :key="page.url"
              class="space-y-1"
            >
              <div
                class="relative overflow-hidden rounded-xl border border-outline-gray-2 bg-surface-gray-1"
              >
                <img
                  :src="page.url"
                  :alt="__('Page {0}', [index + 1])"
                  class="aspect-[3/4] w-full object-contain"
                />
                <span
                  class="absolute left-2 top-2 rounded-full bg-surface-base px-2 text-sm font-medium"
                  >{{ index + 1 }}</span
                >
              </div>
              <div class="flex items-center justify-between">
                <button
                  type="button"
                  :class="ICON"
                  :disabled="index === 0"
                  :aria-label="__('Move page {0} earlier', [index + 1])"
                  @click="move(index, index - 1)"
                >
                  <FeatherIcon
                    name="arrow-left"
                    class="size-5"
                    aria-hidden="true"
                  />
                </button>
                <button
                  type="button"
                  :class="ICON"
                  :aria-label="__('Retake page {0}', [index + 1])"
                  @click="retake(index)"
                >
                  <FeatherIcon
                    name="rotate-ccw"
                    class="size-5"
                    aria-hidden="true"
                  />
                </button>
                <button
                  type="button"
                  :class="ICON"
                  :aria-label="__('Remove page {0}', [index + 1])"
                  @click="remove(index)"
                >
                  <FeatherIcon
                    name="trash-2"
                    class="size-5"
                    aria-hidden="true"
                  />
                </button>
                <button
                  type="button"
                  :class="ICON"
                  :disabled="index === pages.length - 1"
                  :aria-label="__('Move page {0} later', [index + 1])"
                  @click="move(index, index + 1)"
                >
                  <FeatherIcon
                    name="arrow-right"
                    class="size-5"
                    aria-hidden="true"
                  />
                </button>
              </div>
            </li>
          </ol>
          <p v-if="problem" role="alert" class="mt-3 text-sm text-ink-red-7">
            {{ problem }}
          </p>
        </div>
        <footer
          class="flex flex-none flex-wrap items-center justify-end gap-2 border-t border-outline-gray-1 px-4 py-3"
        >
          <Button
            v-if="!single && pages.length < maxPages"
            class="min-h-11"
            icon-left="plus"
            :label="__('Add page')"
            :disabled="busy"
            @click="addPage"
          />
          <Button
            variant="solid"
            class="min-h-11"
            :label="continueLabel"
            :loading="busy"
            :disabled="busy || (!single && !pages.length)"
            data-testid="camera-continue"
            @click="send"
          />
        </footer>
      </template>

      <!-- 3. «¿Qué es?» -->
      <template v-else-if="step === 'quees'">
        <!-- The scan stays in view; what was read sits in a sheet over it
             (M3 bottom sheet; the key-data card is Gmail's summary card). -->
        <div class="relative min-h-0 flex-1">
          <img
            v-if="preview"
            :src="preview"
            alt=""
            class="absolute inset-x-0 top-0 h-1/2 w-full object-contain opacity-80"
          />
          <div
            class="absolute inset-x-0 bottom-0 flex max-h-[80%] flex-col rounded-t-3xl bg-surface-base text-ink-gray-9 shadow-2xl"
          >
            <span
              class="mx-auto mb-1 mt-3 block h-1 w-8 flex-none rounded-full bg-surface-gray-4"
              aria-hidden="true"
            />
            <div class="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4">
              <div
                class="space-y-3 rounded-2xl border border-outline-gray-2 p-4"
                data-testid="quees-guess"
              >
                <div>
                  <p class="text-sm text-ink-gray-6">
                    {{ guessed ? __('It looks like') : __('What we read') }}
                  </p>
                  <p class="break-words text-xl font-semibold leading-snug">
                    {{
                      guessed ? scan.label : __('We could not tell what it is')
                    }}
                  </p>
                </div>
                <dl
                  v-if="facts.length"
                  class="grid grid-cols-2 gap-x-4 gap-y-2"
                >
                  <div v-for="fact in facts" :key="fact.label" class="min-w-0">
                    <dt class="text-sm text-ink-gray-6">{{ fact.label }}</dt>
                    <dd class="break-words text-base">{{ fact.value }}</dd>
                  </div>
                </dl>
                <p
                  v-if="guessed ? guessSource : scan?.note"
                  class="text-sm text-ink-gray-6"
                >
                  {{ guessed ? guessSource : scan.note }}
                </p>
              </div>
              <fieldset v-if="offered.length" class="space-y-1">
                <legend class="pb-1 text-sm font-medium text-ink-gray-7">
                  {{ __('What is it?') }}
                </legend>
                <label
                  v-for="option in offered"
                  :key="option.kind"
                  class="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3"
                  :class="kind === option.kind ? 'bg-surface-gray-2' : ''"
                >
                  <input
                    v-model="kind"
                    type="radio"
                    name="quees"
                    :value="option.kind"
                    class="size-5"
                  />
                  <span class="min-w-0 flex-1">
                    <span class="block text-base">{{ option.label }}</span>
                    <span class="block text-sm text-ink-gray-6">{{
                      outcome(option)
                    }}</span>
                  </span>
                </label>
              </fieldset>
              <p v-else class="text-base">
                {{
                  __(
                    'Your user cannot record any of these documents. Ask whoever manages Muelle for access.',
                  )
                }}
              </p>

              <FormControl
                v-if="companies.length > 1 && chosen?.target"
                v-model="company"
                type="select"
                :label="__('Company')"
                :options="companies.map((c) => ({ label: c, value: c }))"
              />

              <!-- a transfer: which open invoice it pays -->
              <fieldset
                v-if="chosen?.kind === 'transferencia' && !fixedInvoice"
                class="space-y-1"
              >
                <legend class="pb-1 text-sm font-medium text-ink-gray-7">
                  {{ __('Which invoice does it pay?') }}
                </legend>
                <label
                  v-for="inv in scan?.invoices || []"
                  :key="inv.name"
                  class="flex min-h-12 items-center gap-3 rounded-xl px-3"
                  :class="invoice === inv.name ? 'bg-surface-gray-2' : ''"
                >
                  <input
                    v-model="invoice"
                    type="radio"
                    name="invoice"
                    :value="inv.name"
                    class="size-5"
                  />
                  <span class="min-w-0 flex-1">
                    <span class="block text-base">{{ inv.supplier_name }}</span>
                    <span class="block text-sm text-ink-gray-6">
                      {{
                        __('Balance {0}', [
                          money(inv.outstanding, inv.currency),
                        ])
                      }}<template v-if="inv.bill_no">
                        · {{ __('Invoice {0}', [inv.bill_no]) }}</template
                      >
                    </span>
                  </span>
                </label>
                <label
                  class="flex min-h-12 items-center gap-3 rounded-xl px-3"
                  :class="invoice === '' ? 'bg-surface-gray-2' : ''"
                >
                  <input
                    v-model="invoice"
                    type="radio"
                    name="invoice"
                    value=""
                    class="size-5"
                  />
                  <span class="text-base">{{
                    (scan?.invoices || []).length
                      ? __('None of these: only the payment')
                      : __('No open invoice for this amount: only the payment')
                  }}</span>
                </label>
              </fieldset>

              <!-- filed on a record: whose is it -->
              <div v-if="chosen?.file" class="space-y-2">
                <label
                  :for="searchId"
                  class="block text-sm font-medium text-ink-gray-7"
                >
                  {{
                    chosen.file === 'Customer'
                      ? __('Which customer sent it?')
                      : __('Whose is it?')
                  }}
                </label>
                <input
                  :id="searchId"
                  v-model="recordQuery"
                  type="search"
                  class="min-h-11 w-full rounded-lg border border-outline-gray-2 bg-surface-base px-3 text-base"
                  :placeholder="
                    chosen.file === 'Customer'
                      ? __('Search a customer')
                      : __('Search a contact')
                  "
                  data-testid="quees-record-search"
                  @input="searchRecord"
                />
                <ul class="space-y-1">
                  <li v-for="row in recordRows" :key="row.value">
                    <label
                      class="flex min-h-12 items-center gap-3 rounded-xl px-3"
                      :class="
                        record?.value === row.value ? 'bg-surface-gray-2' : ''
                      "
                    >
                      <input
                        type="radio"
                        name="record"
                        :checked="record?.value === row.value"
                        class="size-5"
                        @change="record = row"
                      />
                      <span class="min-w-0 flex-1">
                        <span class="block break-words text-base">{{
                          row.label
                        }}</span>
                        <span
                          v-if="row.description"
                          class="block text-sm text-ink-gray-6"
                          >{{ row.description }}</span
                        >
                      </span>
                    </label>
                  </li>
                </ul>
              </div>
              <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
                {{ problem }}
              </p>
            </div>
            <footer
              class="flex flex-none items-center justify-end gap-2 border-t border-outline-gray-1 px-4 py-3"
            >
              <Button
                variant="solid"
                class="min-h-11 w-full sm:w-auto"
                :label="confirmLabel"
                :loading="busy"
                :disabled="busy || !chosen || (chosen.file && !record)"
                data-testid="quees-confirm"
                @click="confirm"
              />
            </footer>
          </div>
        </div>
      </template>

      <!-- hidden inputs: gallery, files, the phone's own camera -->
      <input
        ref="galleryInput"
        type="file"
        accept="image/*"
        :multiple="!photoMode"
        class="hidden"
        @change="fromGallery"
      />
      <input
        ref="fileInput"
        type="file"
        :accept="fileAccept"
        class="hidden"
        @change="fromFile"
      />
      <input
        ref="nativeInput"
        type="file"
        accept="image/*"
        capture="environment"
        class="hidden"
        @change="fromGallery"
      />

      <!-- «Galería o archivo» -->
      <div
        v-if="pickOpen"
        class="absolute inset-0 z-10 flex items-end bg-black/50"
        @click.self="pickOpen = false"
      >
        <div
          role="dialog"
          aria-modal="true"
          :aria-label="__('Choose from the gallery or a file')"
          class="w-full space-y-1 rounded-t-2xl bg-surface-base p-4 pb-6 text-ink-gray-9"
        >
          <span
            class="mx-auto mb-2 block h-1 w-8 rounded-full bg-surface-gray-4"
            aria-hidden="true"
          />
          <button type="button" :class="ROW" @click="choose(galleryInput)">
            <FeatherIcon name="image" class="size-5" aria-hidden="true" />{{
              __('Photos from the gallery')
            }}
          </button>
          <button
            v-if="!recordMode && !photoMode"
            type="button"
            :class="ROW"
            @click="choose(fileInput)"
          >
            <FeatherIcon name="upload" class="size-5" aria-hidden="true" />{{
              __('A PDF or an XML invoice')
            }}
          </button>
          <button type="button" :class="ROW" @click="choose(nativeInput)">
            <FeatherIcon name="camera" class="size-5" aria-hidden="true" />{{
              __('The phone camera')
            }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, FeatherIcon, FormControl, toast } from 'frappe-ui'
import { camera, settleCamera } from './cameraDoor'
import {
  MAX_PAGES,
  cameraProblem,
  initialKind,
  makePage,
  movePage,
  offeredKinds,
  pageBudget,
  pagesToPdf,
  scanName,
} from './scanPages'
import {
  captureScan,
  classifyScan,
  discardScan,
  fileToRecord,
  newSalesOrderRoute,
  searchRecords,
  shellRoute,
} from './scanApi'
import {
  capturaBoot,
  capturaMessage,
  loadCapturaBoot,
} from '@/composables/useCaptura'

const ICON =
  'flex size-12 flex-none items-center justify-center rounded-full disabled:opacity-30 hover:bg-black/10'
const LIGHT_ICON =
  'flex size-12 items-center justify-center rounded-full bg-white/15 text-white'
const LIGHT_BUTTON =
  'flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-5 text-base font-medium text-black'
const GHOST_BUTTON =
  'flex min-h-12 items-center justify-center rounded-full px-5 text-base text-white underline'
const ROW =
  'flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-left text-base'

const route = useRoute()
const router = useRouter()
const searchId = useId()
const dialog = ref(null)
const video = ref(null)
const galleryInput = ref(null)
const fileInput = ref(null)
const nativeInput = ref(null)

const step = ref('camera')
const streaming = ref(false)
const problemKind = ref('')
const torchAvailable = ref(false)
const torch = ref(false)
const shooting = ref(false)
const pages = ref([])
const single = ref(null)
const retakeIndex = ref(null)
const pickOpen = ref(false)
const busy = ref(false)
const problem = ref('')
const scan = ref(null)
const kind = ref('')
const invoice = ref('')
const company = ref('')
const record = ref(null)
const recordQuery = ref('')
const recordRows = ref([])
let stream = null
let startToken = 0

const options = computed(() => camera.options || {})
const recordMode = computed(() => Boolean(options.value.record?.doctype))
// «Tomar foto» of a thing (Producto): one photo as shot, no page crop, no PDF.
const photoMode = computed(() => Boolean(options.value.photo))
const maxPages = computed(() => (photoMode.value ? 1 : MAX_PAGES))
const title = computed(
  () =>
    options.value.title ||
    (recordMode.value ? __('Take photo') : __('Scan document')),
)
const fixedInvoice = computed(() => options.value.invoice || '')
const fileAccept = '.pdf,.xml,application/pdf,text/xml,application/xml'
const companies = computed(() => capturaBoot.value?.companies || [])
const offered = computed(() =>
  offeredKinds(scan.value?.options, {
    targets: options.value.targets,
    invoice: fixedInvoice.value,
  }),
)
const guessed = computed(
  () =>
    Boolean(scan.value?.kind) &&
    offered.value.some((o) => o.kind === scan.value.kind),
)
const preview = computed(() => pages.value[0]?.url || '')
const facts = computed(() => {
  const s = scan.value || {}
  const out = []
  if (s.party) out.push({ label: __('From', null, 'Scan'), value: s.party })
  if (s.total)
    out.push({ label: __('Total'), value: money(s.total, s.currency || 'MXN') })
  if (s.date) out.push({ label: __('Date'), value: dayWords(s.date) })
  if (s.folio) out.push({ label: __('Folio'), value: s.folio })
  if (single.value) out.push({ label: __('File'), value: single.value.name })
  else if (pages.value.length > 1)
    out.push({ label: __('Pages'), value: String(pages.value.length) })
  return out
})
const chosen = computed(
  () => offered.value.find((o) => o.kind === kind.value) || null,
)

const stepTitle = computed(() => {
  if (step.value === 'quees') return __('What is it?')
  if (step.value === 'pages')
    return single.value || photoMode.value
      ? title.value
      : __('Pages ({0})', [pages.value.length])
  return title.value
})
const continueLabel = computed(() => {
  if (recordMode.value) return __('Save to the record')
  if (photoMode.value) return __('Use this photo')
  if (options.value.onFiles) return __('Use these pages')
  return __('Continue')
})
const confirmLabel = computed(() => {
  if (!chosen.value) return __('Continue')
  if (chosen.value.kind === 'orden_compra_cliente')
    return __('Save to the customer')
  if (chosen.value.file) return __('Save to the contact')
  return __('Create draft')
})
const guessSource = computed(() => {
  const via = scan.value?.via
  if (via === 'cfdi') return __('Read exactly from the CFDI.')
  if (via === 'text') return __('Read from the words in the document.')
  if (via === 'vision') return __('Read by the assistant; check it.')
  if (via === 'name') return __('Guessed from the file name; check it.')
  return ''
})
const problemText = computed(() => {
  switch (problemKind.value) {
    case 'denied':
      return {
        title: __('Muelle does not have permission to use the camera.'),
        how: __(
          'Tap the lock next to the address and allow the camera, then try again. Or take the photo with the phone camera.',
        ),
      }
    case 'missing':
      return {
        title: __('This device has no camera Muelle can use.'),
        how: __('Choose a photo or a PDF instead.'),
      }
    case 'busy':
      return {
        title: __('Another app is using the camera.'),
        how: __('Close the other app or take the photo with the phone camera.'),
      }
    case 'insecure':
      return {
        title: __('The camera only opens on a secure address.'),
        how: __('Take the photo with the phone camera instead.'),
      }
    default:
      return {
        title: __('The camera did not open.'),
        how: __(
          'Take the photo with the phone camera, or choose a photo or a PDF.',
        ),
      }
  }
})

function outcome(option) {
  if (option.kind === 'orden_compra_cliente')
    return __('Saved to the customer, then a sales order')
  if (option.file) return __('Saved to the contact')
  const words = {
    'Purchase Invoice': __('Supplier invoice draft'),
    'Purchase Order': __('Purchase order draft'),
    'Payment Entry': __('Payment draft'),
    'Journal Entry': __('Journal entry draft'),
  }
  return words[option.target] || ''
}

function dayWords(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return String(iso)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function money(value, currency = 'MXN') {
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency,
    }).format(value || 0)
  } catch {
    return `$\u00a0${Number(value || 0).toFixed(2)}`
  }
}

// ------------------------------------------------------------- camera
async function startCamera() {
  problemKind.value = ''
  stopCamera()
  const token = ++startToken
  const secure =
    typeof window === 'undefined' || window.isSecureContext !== false
  if (!secure || !navigator.mediaDevices?.getUserMedia) {
    problemKind.value = secure ? 'missing' : 'insecure'
    return
  }
  let opened
  try {
    opened = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    })
  } catch (error) {
    if (token === startToken)
      problemKind.value = cameraProblem(error, { secure })
    return
  }
  // a later start (or a close) won: this stream is nobody's
  if (token !== startToken || !camera.open || step.value !== 'camera') {
    opened.getTracks().forEach((t) => t.stop())
    return
  }
  stream = opened
  await nextTick()
  if (!video.value) return stopCamera()
  video.value.srcObject = stream
  try {
    await video.value.play()
  } catch {
    // autoplay of a muted inline video is allowed; a refusal still shows frames
  }
  streaming.value = true
  const track = stream.getVideoTracks()[0]
  const caps = track?.getCapabilities?.() || {}
  torchAvailable.value = Boolean(caps.torch)
  torch.value = false
}

function stopCamera() {
  startToken++
  streaming.value = false
  torchAvailable.value = false
  torch.value = false
  if (stream) stream.getTracks().forEach((t) => t.stop())
  stream = null
  if (video.value) video.value.srcObject = null
}

async function toggleTorch() {
  const track = stream?.getVideoTracks()[0]
  if (!track) return
  try {
    await track.applyConstraints({ advanced: [{ torch: !torch.value }] })
    torch.value = !torch.value
  } catch {
    torchAvailable.value = false
  }
}

async function shoot() {
  if (!video.value || shooting.value) return
  shooting.value = true
  try {
    const count =
      retakeIndex.value === null ? pages.value.length + 1 : pages.value.length
    const page = await makePage(video.value, {
      crop: !photoMode.value,
      maxBytes: pageBudget(count),
    })
    placePage(page)
    if (photoMode.value) step.value = 'pages'
  } catch {
    problem.value = __('The photo did not come out. Try again.')
  } finally {
    shooting.value = false
  }
}

function placePage(page) {
  if (retakeIndex.value !== null) {
    const next = [...pages.value]
    URL.revokeObjectURL(next[retakeIndex.value]?.url)
    next[retakeIndex.value] = page
    pages.value = next
    retakeIndex.value = null
    step.value = 'pages'
  } else if (pages.value.length < maxPages.value) {
    pages.value = [...pages.value, page]
  }
}

// ------------------------------------------------------------- pages
function move(from, to) {
  pages.value = movePage(pages.value, from, to)
}
function remove(index) {
  const next = [...pages.value]
  const [gone] = next.splice(index, 1)
  if (gone) URL.revokeObjectURL(gone.url)
  pages.value = next
  if (!next.length) step.value = 'camera'
}
function retake(index) {
  retakeIndex.value = index
  step.value = 'camera'
}
function addPage() {
  retakeIndex.value = null
  step.value = 'camera'
}

function choose(input) {
  pickOpen.value = false
  input?.click()
}

async function loadImage(file) {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

async function fromGallery(event) {
  const files = [...(event.target.files || [])]
  event.target.value = ''
  if (!files.length) return
  busy.value = true
  problem.value = ''
  try {
    for (const file of files) {
      if (retakeIndex.value === null && pages.value.length >= maxPages.value)
        break
      const img = await loadImage(file)
      const count = Math.min(maxPages.value, pages.value.length + files.length)
      placePage(
        await makePage(img, { crop: false, maxBytes: pageBudget(count) }),
      )
    }
    single.value = null
    step.value = 'pages'
  } catch {
    problem.value = __('That photo could not be opened. Choose another one.')
    step.value = pages.value.length ? 'pages' : 'camera'
  } finally {
    busy.value = false
  }
}

function fromFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  const max = (capturaBoot.value?.max_mb || 10) * 1024 * 1024
  if (file.size > max) {
    problem.value = __(
      'This file is larger than {0} MB. Send a lighter photo or PDF.',
      [capturaBoot.value?.max_mb || 10],
    )
    step.value = 'pages'
    return
  }
  single.value = file
  step.value = 'pages'
}

/** The one file the engine gets: the picked file, one JPEG, or one PDF. */
async function scanFile() {
  if (single.value) return single.value
  const now = new Date()
  if (pages.value.length === 1)
    return new File([pages.value[0].blob], scanName(now, 'jpg'), {
      type: 'image/jpeg',
    })
  const bound = await Promise.all(
    pages.value.map(async (p) => ({
      bytes: new Uint8Array(await p.blob.arrayBuffer()),
      width: p.width,
      height: p.height,
    })),
  )
  return new File([pagesToPdf(bound)], scanName(now, 'pdf'), {
    type: 'application/pdf',
  })
}

async function send() {
  if (busy.value) return
  busy.value = true
  problem.value = ''
  try {
    const file = await scanFile()
    if (options.value.onFiles) {
      const result = await options.value.onFiles([file])
      return finish(result ?? true)
    }
    if (recordMode.value) {
      const { doctype, name } = options.value.record
      const filed = await fileToRecord({ doctype, name, blob: file })
      toast.success(__('Saved to the record'))
      return finish(filed)
    }
    await loadCapturaBoot()
    scan.value = await classifyScan(file, { company: options.value.company })
    company.value =
      scan.value.company || capturaBoot.value?.default_company || ''
    kind.value = initialKind(scan.value.kind, offered.value, {
      preset: Boolean(options.value.targets?.length || fixedInvoice.value),
    })
    invoice.value = fixedInvoice.value || scan.value.invoices?.[0]?.name || ''
    record.value = null
    recordQuery.value = ''
    recordRows.value = []
    step.value = 'quees'
  } catch (error) {
    problem.value = capturaMessage(error)
  } finally {
    busy.value = false
  }
}

// ------------------------------------------------------------- ¿Qué es?
let searchTimer
function searchRecord() {
  clearTimeout(searchTimer)
  const doctype = chosen.value?.file
  if (!doctype) return
  searchTimer = setTimeout(async () => {
    recordRows.value = await searchRecords(doctype, recordQuery.value).catch(
      () => [],
    )
  }, 250)
}
watch(
  () => chosen.value?.file,
  (doctype) => {
    record.value = null
    recordRows.value = []
    if (doctype) searchRecord()
  },
)

function returnArgs() {
  return {
    return_to: '/crm' + route.fullPath,
    return_label:
      options.value.returnLabel ||
      (route.meta?.title ? __(route.meta.title) : ''),
  }
}

async function confirm() {
  const option = chosen.value
  if (!option || busy.value) return
  busy.value = true
  problem.value = ''
  try {
    if (option.target) {
      const review = await captureScan({
        kind: option.kind,
        file: scan.value.file,
        company: company.value,
        invoice: option.kind === 'transferencia' ? invoice.value : '',
        supplier: options.value.supplier || '',
        ...returnArgs(),
      })
      scan.value = null
      const url = String(review.open_url || '')
      finish(review)
      if (url.startsWith('/crm/')) await router.push(url.slice(4))
      return
    }
    const filed = await fileToRecord({
      doctype: option.file,
      name: record.value.value,
      file: scan.value.file,
      kind: option.kind,
      company: company.value,
    })
    scan.value = null
    if (
      filed.archivos &&
      filed.archivos.linked === false &&
      filed.archivos.reason
    )
      toast.info(filed.archivos.reason)
    else toast.success(__('Saved to {0}', [record.value.label]))
    const to =
      (option.kind === 'orden_compra_cliente' &&
        (await newSalesOrderRoute(record.value.value))) ||
      (await shellRoute(option.file, record.value.value))
    finish(filed)
    if (to) await router.push(to)
  } catch (error) {
    problem.value = capturaMessage(error)
  } finally {
    busy.value = false
  }
}

// ------------------------------------------------------------- open / close
function reset() {
  stopCamera()
  pages.value.forEach((p) => URL.revokeObjectURL(p.url))
  pages.value = []
  single.value = null
  retakeIndex.value = null
  pickOpen.value = false
  busy.value = false
  problem.value = ''
  scan.value = null
  kind.value = ''
  step.value = 'camera'
}

function finish(result) {
  const staged = scan.value?.staged && scan.value?.file
  if (staged) discardScan(staged)
  reset()
  settleCamera(result)
}

function dismiss() {
  if (busy.value) return
  finish(null)
}

function back() {
  if (busy.value) return
  if (pickOpen.value) return (pickOpen.value = false)
  if (step.value === 'quees') {
    const staged = scan.value?.staged && scan.value?.file
    if (staged) discardScan(staged)
    scan.value = null
    step.value = 'pages'
    return
  }
  if (step.value === 'pages' && (pages.value.length || single.value)) {
    if (single.value) {
      single.value = null
      step.value = 'camera'
      return
    }
    return dismiss()
  }
  if (step.value === 'camera' && retakeIndex.value !== null) {
    retakeIndex.value = null
    step.value = 'pages'
    return
  }
  dismiss()
}

watch(
  () => camera.open,
  async (open) => {
    if (!open) return reset()
    reset()
    loadCapturaBoot()
    await nextTick()
    dialog.value?.focus?.()
    startCamera()
  },
  { immediate: true },
)
watch(step, (next) => {
  if (next === 'camera' && camera.open) startCamera()
  else stopCamera()
})
onBeforeUnmount(() => {
  stopCamera()
  clearTimeout(searchTimer)
})
</script>
