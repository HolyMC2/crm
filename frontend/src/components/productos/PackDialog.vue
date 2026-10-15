<template>
  <Dialog v-model="open" :options="{ title: __('Build a pack', null, CTX) }">
    <template #body-content>
      <div class="space-y-4">
        <p class="text-sm text-ink-gray-7">{{ scopeText }}</p>
        <div
          role="radiogroup"
          :aria-label="__('What to build', null, CTX)"
          class="grid grid-cols-3 gap-2"
        >
          <button
            v-for="choice in MODES"
            :key="choice.value"
            type="button"
            role="radio"
            :aria-checked="mode === choice.value ? 'true' : 'false'"
            class="flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-sm"
            :class="
              mode === choice.value
                ? 'border-outline-gray-4 bg-surface-gray-2 font-medium text-ink-gray-9'
                : 'border-outline-gray-2 text-ink-gray-7 hover:bg-surface-gray-1'
            "
            @click="pick(choice.value)"
          >
            <FeatherIcon
              :name="choice.icon"
              class="h-4 w-4"
              aria-hidden="true"
            />
            {{ choice.label }}
          </button>
        </div>
        <div class="flex flex-wrap items-end gap-3">
          <label
            v-if="mode === 'images'"
            class="flex flex-col gap-1 text-xs text-ink-gray-6"
          >
            {{ __('Products per image', null, CTX) }}
            <select
              v-model.number="perPage"
              class="h-11 rounded-md border border-outline-gray-2 bg-surface-white px-2 text-base text-ink-gray-9 sm:h-8 sm:text-sm"
            >
              <option v-for="n in PER_PAGE" :key="n" :value="n">{{ n }}</option>
            </select>
          </label>
          <label
            v-if="mode !== 'message'"
            class="flex min-h-11 items-center gap-2 text-sm text-ink-gray-8 sm:min-h-8"
          >
            <input v-model="withPrices" type="checkbox" class="rounded" />
            {{ __('With prices', null, CTX) }}
          </label>
        </div>
        <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
          {{ problem }}
        </p>
        <div v-if="result" role="status" class="space-y-3">
          <p class="text-sm text-ink-gray-7">{{ resultText }}</p>
          <ul
            v-if="result.pages?.length"
            class="grid grid-cols-2 gap-2 sm:grid-cols-3"
          >
            <li v-for="(page, index) in result.pages" :key="page.file_url">
              <a
                :href="page.file_url"
                target="_blank"
                rel="noopener"
                class="block overflow-hidden rounded-lg ring-1 ring-outline-gray-2 hover:ring-outline-gray-4"
                :title="__('Open image {0}', [index + 1], CTX)"
              >
                <img
                  :src="page.file_url"
                  :alt="__('Image {0} of the pack', [index + 1], CTX)"
                  class="aspect-square w-full object-cover"
                  loading="lazy"
                />
              </a>
            </li>
          </ul>
          <a
            v-if="result.file_url"
            :href="result.file_url"
            target="_blank"
            rel="noopener"
            class="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-surface-gray-2 px-3 text-base text-ink-gray-8 hover:bg-surface-gray-3 sm:min-h-8"
          >
            <FeatherIcon name="file-text" class="h-4 w-4" aria-hidden="true" />
            {{ __('Open the PDF', null, CTX) }}
          </a>
          <textarea
            v-if="result.text !== undefined"
            readonly
            :value="result.text"
            rows="8"
            class="w-full rounded-md border border-outline-gray-2 p-2 text-sm"
            :aria-label="__('Price message', null, CTX)"
          />
        </div>
      </div>
    </template>
    <template #actions>
      <div class="flex flex-wrap justify-end gap-2">
        <Button :label="__('Close', null, CTX)" @click="open = false" />
        <Button
          v-if="result && canShare"
          :label="__('Share', null, CTX)"
          @click="share"
        />
        <Button
          v-if="result?.text !== undefined"
          :label="__('Copy', null, CTX)"
          @click="copy"
        />
        <Button
          variant="solid"
          :label="
            result ? __('Build again', null, CTX) : __('Build', null, CTX)
          "
          :loading="building"
          :disabled="!codes.length && !loadingCodes"
          @click="build"
        />
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button, Dialog, FeatherIcon, toast } from 'frappe-ui'
import { CTX, problemOf, productosApi } from '@/composables/useProductos'

// «Armar pack»: the filtered list (or the selected products) as Mercado's
// collage images, a PDF catalogue or a price message, ready to send. Mercado
// renders; the codes come in the list's order, up to its cap.
const props = defineProps({
  // `catalog_codes` arguments of the list (search and filters), or `codes`.
  filters: { type: Object, default: () => ({}) },
  codes: { type: Array, default: null },
  label: { type: String, default: '' },
})
const open = defineModel({ type: Boolean, default: false })
const EXPORTS = 'mercado.api.exports'
const PER_PAGE = [4, 6, 9, 12, 16, 24]
const MODES = [
  { value: 'images', label: __('Images', null, CTX), icon: 'image' },
  { value: 'pdf', label: __('PDF', null, CTX), icon: 'file-text' },
  { value: 'message', label: __('Message', null, CTX), icon: 'message-circle' },
]
const mode = ref('images')
const perPage = ref(9)
const withPrices = ref(true)
const list = ref([])
const total = ref(0)
const cap = ref(240)
const loadingCodes = ref(false)
const building = ref(false)
const problem = ref('')
const result = ref(null)
const canShare = typeof navigator !== 'undefined' && Boolean(navigator.share)

const codes = computed(() => props.codes || list.value)
const scopeText = computed(() => {
  if (loadingCodes.value) return __('Gathering the products…', null, CTX)
  if (props.codes)
    return __('{0} selected products.', [props.codes.length], CTX)
  if (total.value > codes.value.length)
    return __(
      'The first {0} of {1} products of this list, in its order.',
      [codes.value.length, total.value],
      CTX,
    )
  return __('{0} products of this list.', [codes.value.length], CTX)
})
const resultText = computed(() => {
  const value = result.value
  if (!value) return ''
  const missing = value.missing_image_count
    ? __('{0} without a photo.', [value.missing_image_count], CTX)
    : ''
  if (value.pages)
    return `${__('{0} image(s) ready.', [value.pages.length], CTX)} ${missing}`.trim()
  if (value.file_url) return `${__('PDF ready.', null, CTX)} ${missing}`.trim()
  return __('Message ready to copy or share.', null, CTX)
})

function pick(value) {
  mode.value = value
  result.value = null
}

async function loadCodes() {
  if (props.codes) return
  loadingCodes.value = true
  problem.value = ''
  try {
    const answer = await productosApi('catalog_codes', props.filters)
    list.value = answer.codes || []
    total.value = answer.total || 0
    cap.value = answer.cap || cap.value
  } catch (error) {
    problem.value = problemOf(error).detail
  } finally {
    loadingCodes.value = false
  }
}

async function build() {
  if (!codes.value.length) return
  building.value = true
  problem.value = ''
  result.value = null
  const common = {
    item_codes: JSON.stringify(codes.value),
    filter_label: props.label || '',
  }
  try {
    if (mode.value === 'images')
      result.value = await productosApi(`${EXPORTS}.build_collage_pack`, {
        ...common,
        per_page: perPage.value,
        format: 'jpeg',
        with_prices: withPrices.value ? 1 : 0,
      })
    else if (mode.value === 'pdf')
      result.value = await productosApi(`${EXPORTS}.build_pdf`, {
        ...common,
        with_prices: withPrices.value ? 1 : 0,
      })
    else result.value = await productosApi(`${EXPORTS}.share_message`, common)
  } catch (error) {
    const found = problemOf(error)
    problem.value = [found.title, found.detail].filter(Boolean).join('. ')
  } finally {
    building.value = false
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(result.value?.text || '')
    toast.success(__('Message copied', null, CTX))
  } catch {
    problem.value = __('Select the message and copy it by hand.', null, CTX)
  }
}

async function share() {
  const value = result.value
  if (!value) return
  const urls =
    value.pages?.map((page) => page.file_url) ||
    (value.file_url ? [value.file_url] : [])
  try {
    if (value.text !== undefined) await navigator.share({ text: value.text })
    else {
      const files = await Promise.all(
        urls.map(async (url, index) => {
          const blob = await (await fetch(url)).blob()
          const name = url.split('/').pop() || `pack-${index + 1}`
          return new File([blob], name, { type: blob.type })
        }),
      )
      if (navigator.canShare?.({ files })) await navigator.share({ files })
      else
        await navigator.share({
          url: new URL(urls[0], window.location.origin).href,
        })
    }
  } catch (error) {
    if (error?.name !== 'AbortError')
      problem.value = __(
        'Sharing did not work here; open and send the file instead.',
        null,
        CTX,
      )
  }
}

watch(open, (value) => {
  if (!value) return
  result.value = null
  problem.value = ''
  loadCodes()
})
</script>
