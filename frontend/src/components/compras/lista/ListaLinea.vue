<template>
  <!-- One line of the list, opened from its row: the product with its photo,
       the tiers, what changed, what another supplier prints, what the shop paid,
       has and keeps as its level; the price history and the comparison per
       supplier; the owner's quantity, correction, photo and the product link. -->
  <BottomSheet
    :open="open"
    :title="title"
    :subtitle="specs"
    layer="lista-linea"
    @update:open="emit('update:open', $event)"
  >
    <div v-if="line" class="space-y-4 pb-2">
      <!-- photo -->
      <div class="flex items-start gap-3">
        <div
          class="flex size-24 flex-none items-center justify-center overflow-hidden rounded-6 bg-surface-gray-2"
        >
          <img
            v-if="photoUrl"
            :src="photoUrl"
            :alt="title"
            class="size-full object-cover"
          />
          <span
            v-else
            class="lucide-smartphone size-8 text-ink-gray-4"
            aria-hidden="true"
          />
        </div>
        <div class="min-w-0 flex-1">
          <div v-if="line.candidates.length" class="flex flex-wrap gap-1.5">
            <button
              v-for="key in line.candidates.slice(0, 6)"
              :key="key"
              type="button"
              class="press size-12 overflow-hidden rounded-6 bg-surface-gray-2 ring-outline-gray-3 focus-visible:ring-2"
              :class="shown === key ? 'ring-2 ring-ink-gray-8' : ''"
              :aria-label="__('Catalog picture', null, 'Lista')"
              @click="shown = key"
            >
              <img
                :src="candidateUrl(key)"
                alt=""
                class="size-full object-cover"
              />
            </button>
          </div>
          <div v-if="owner" class="mt-2 flex flex-wrap gap-2">
            <label :class="['press', SMALL]">
              <span class="lucide-camera size-4" aria-hidden="true" />
              {{ __('Take a photo', null, 'Lista') }}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                class="sr-only"
                @change="pickPhoto"
              />
            </label>
            <label :class="['press', SMALL]">
              <span class="lucide-upload size-4" aria-hidden="true" />
              {{ __('Upload', null, 'Lista') }}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                class="sr-only"
                @change="pickPhoto"
              />
            </label>
          </div>
          <p v-if="owner && !phone" class="mt-1 text-xs text-ink-gray-5">
            {{ __('Or paste a picture here with ⌘V.', null, 'Lista') }}
          </p>
          <p
            v-if="photoBusy"
            class="mt-1 text-xs text-ink-gray-6"
            role="status"
          >
            {{ __('Saving the photo…', null, 'Lista') }}
          </p>
        </div>
      </div>

      <!-- tiers -->
      <section :aria-label="__('Prices', null, 'Lista')">
        <ul
          class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
        >
          <li
            v-for="tier in tiers"
            :key="tier.min_qty"
            class="flex items-center gap-3 px-3 py-2 text-sm"
            :class="tier.active ? 'bg-surface-gray-1 font-semibold' : ''"
          >
            <span class="min-w-0 flex-1 truncate">
              {{
                tier.label ||
                (tier.min_qty > 1
                  ? __('From {0} pieces', [tier.min_qty], 'Lista')
                  : __('Each', null, 'Lista'))
              }}
            </span>
            <span class="num tabular-nums">{{
              money(tier.price, currency)
            }}</span>
          </li>
          <li
            v-if="line.single_price"
            class="px-3 py-2 text-xs text-ink-gray-6"
          >
            {{ __('Single price: no wholesale tier.', null, 'Lista') }}
          </li>
        </ul>
        <p v-if="next && row?.qty" class="mt-1 text-xs text-ink-gray-6">
          {{
            __(
              '{0} more reach {1} each.',
              [next.missing, money(next.price, currency)],
              'Lista',
            )
          }}
        </p>
      </section>

      <!-- facts -->
      <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div v-if="change">
          <dt class="text-xs text-ink-gray-6">
            {{ __('Previous list', null, 'Lista') }}
          </dt>
          <dd class="num tabular-nums" :class="changeTone">
            <template v-if="change.kind === 'new'">{{
              __('New this list', null, 'Lista')
            }}</template>
            <template v-else-if="change.oldPrice !== null">
              {{ money(change.oldPrice, currency) }}
              <span v-if="change.pct !== null">
                · {{ change.pct > 0 ? '+' : '' }}{{ change.pct }} %</span
              >
            </template>
          </dd>
        </div>
        <div v-if="line.other">
          <dt class="text-xs text-ink-gray-6">
            {{ __('Best other supplier', null, 'Lista') }}
          </dt>
          <dd class="num tabular-nums">
            {{ money(line.other.price, line.other.currency || currency) }}
            <span class="text-ink-gray-6">
              · {{ line.other.supplier_name }}</span
            >
          </dd>
        </div>
        <div v-if="costVisible && line.paid">
          <dt class="text-xs text-ink-gray-6">
            {{ __('Last paid', null, 'Lista') }}
          </dt>
          <dd class="num tabular-nums">
            {{ money(line.paid.rate, currency) }}
            <span class="text-ink-gray-6">
              · {{ formatDate(line.paid.date) }}</span
            >
          </dd>
        </div>
        <div v-if="line.stock">
          <dt class="text-xs text-ink-gray-6">
            {{ __('In stock', null, 'Lista') }}
          </dt>
          <dd class="num tabular-nums">
            {{ line.stock.have }}
            <span v-if="line.stock.ordered" class="text-ink-gray-6">
              {{ __('+{0} coming', [line.stock.ordered], 'Lista') }}
            </span>
          </dd>
        </div>
        <div v-if="line.level">
          <dt class="text-xs text-ink-gray-6">
            {{ __('Level', null, 'Lista') }}
          </dt>
          <dd class="num tabular-nums">
            {{
              __(
                'keep {0}, order under {1}',
                [line.level.target, line.level.min],
                'Lista',
              )
            }}
            <span v-if="missing" class="text-ink-amber-8">
              · {{ __('{0} short', [missing], 'Lista') }}</span
            >
          </dd>
        </div>
        <div v-if="line.selling">
          <dt class="text-xs text-ink-gray-6">
            {{ __('Selling price', null, 'Lista') }}
          </dt>
          <dd class="num tabular-nums">{{ money(line.selling, currency) }}</dd>
        </div>
        <div v-if="line.tags.length" class="col-span-2">
          <dt class="text-xs text-ink-gray-6">
            {{ __('Marks on the list', null, 'Lista') }}
          </dt>
          <dd>{{ line.tags.join(', ') }}</dd>
        </div>
        <div v-if="line.note" class="col-span-2">
          <dt class="text-xs text-ink-gray-6">
            {{ __('Note', null, 'Lista') }}
          </dt>
          <dd>{{ line.note }}</dd>
        </div>
        <div v-if="line.edited" class="col-span-2 text-xs text-ink-gray-6">
          {{
            __(
              'Corrected by the owner; the first read was: {0}.',
              [originalText],
              'Lista',
            )
          }}
        </div>
      </dl>

      <!-- product link -->
      <section
        :aria-label="__('Product', null, 'Lista')"
        class="rounded-6 bg-surface-gray-1 p-3 text-sm"
      >
        <template v-if="line.item">
          <p class="flex items-center gap-2">
            <span
              class="lucide-link size-4 flex-none text-ink-gray-6"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1 truncate">{{
              line.item_name || line.item
            }}</span>
            <button
              v-if="owner"
              type="button"
              class="press text-ink-gray-7 underline-offset-2 hover:underline"
              :disabled="linking"
              @click="emit('link', line, null)"
            >
              {{ __('Unlink', null, 'Lista') }}
            </button>
          </p>
          <p v-if="line.item_disabled" class="mt-1 text-xs text-ink-amber-8">
            {{
              __(
                'This product is archived; the order will bring it back.',
                null,
                'Lista',
              )
            }}
          </p>
        </template>
        <template v-else>
          <p class="text-ink-gray-7">
            {{
              __(
                'Not linked to a product yet; the close creates one.',
                null,
                'Lista',
              )
            }}
          </p>
          <div v-if="owner" class="mt-2">
            <input
              v-model="itemQuery"
              type="search"
              :placeholder="__('Search a product to link', null, 'Lista')"
              :aria-label="__('Search a product to link', null, 'Lista')"
              :class="INPUT"
              @input="searchItems"
            />
            <ul
              v-if="found.length"
              class="mt-1 divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2 bg-surface-base"
            >
              <li v-for="it in found" :key="it.item">
                <button
                  type="button"
                  class="press flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-gray-1"
                  :disabled="linking"
                  @click="emit('link', line, it.item)"
                >
                  <span class="min-w-0 flex-1 truncate">{{
                    it.item_name
                  }}</span>
                  <span class="truncate text-xs text-ink-gray-5">{{
                    it.item_group
                  }}</span>
                </button>
              </li>
            </ul>
            <p
              v-else-if="itemQuery && searched"
              class="mt-1 text-xs text-ink-gray-6"
            >
              {{
                __(
                  'No product matches; the close can create it.',
                  null,
                  'Lista',
                )
              }}
            </p>
          </div>
        </template>
      </section>

      <!-- history and comparison -->
      <Segmented
        v-model="tab"
        :label="__('More', null, 'Lista')"
        :options="[
          { value: 'historia', label: __('History', null, 'Lista') },
          { value: 'proveedores', label: __('Suppliers', null, 'Lista') },
        ]"
      />
      <section
        v-if="tab === 'historia'"
        :aria-label="__('History', null, 'Lista')"
      >
        <p
          v-if="history === null"
          class="text-sm text-ink-gray-6"
          role="status"
        >
          {{ __('Reading the history…', null, 'Lista') }}
        </p>
        <ListaHistoria v-else :points="history.points" :currency="currency" />
      </section>
      <section v-else :aria-label="__('Suppliers', null, 'Lista')">
        <p
          v-if="compare === null"
          class="text-sm text-ink-gray-6"
          role="status"
        >
          {{ __('Comparing suppliers…', null, 'Lista') }}
        </p>
        <p v-else-if="!compare.rows.length" class="text-sm text-ink-gray-6">
          {{ __('No other supplier lists this product.', null, 'Lista') }}
        </p>
        <ul v-else class="divide-y divide-outline-gray-1 text-sm">
          <li
            v-for="r in compare.rows"
            :key="r.supplier"
            class="flex items-center gap-3 py-2"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium">{{
                r.supplier_name
              }}</span>
              <span class="block text-xs text-ink-gray-6">
                {{
                  r.list_date
                    ? __('list of {0}', [formatDate(r.list_date)], 'Lista')
                    : ''
                }}
                {{
                  r.po_date
                    ? __(
                        '· ordered {0} at {1}',
                        [formatDate(r.po_date), money(r.po_rate, currency)],
                        'Lista',
                      )
                    : ''
                }}
              </span>
            </span>
            <span
              class="num tabular-nums"
              :class="r.supplier === supplier ? 'font-semibold' : ''"
            >
              {{
                r.list_price !== null
                  ? money(r.list_price, r.currency || currency)
                  : '—'
              }}
            </span>
          </li>
        </ul>
      </section>
    </div>

    <template v-if="line" #actions>
      <div class="flex items-center gap-2">
        <ListaStepper
          v-if="owner"
          :qty="row?.qty || 0"
          large
          :label="__('Quantity', null, 'Lista')"
          @step="emit('step', line, $event)"
          @set="emit('set', line, $event)"
        />
        <span v-if="row?.qty" class="num flex-1 text-right tabular-nums">
          {{ money(rowTotal(row, line), currency) }}
        </span>
        <span v-else class="flex-1 text-right text-sm text-ink-gray-6">
          {{
            owner
              ? __('Not in the order', null, 'Lista')
              : __('Only the owner orders.', null, 'Lista')
          }}
        </span>
      </div>
      <div v-if="owner" class="flex flex-wrap gap-2">
        <button
          type="button"
          :class="['press flex-1', BTN.tonal]"
          @click="emit('edit', line)"
        >
          <span class="lucide-pencil size-4" aria-hidden="true" />
          {{ __('Correct the read', null, 'Lista') }}
        </button>
      </div>
    </template>
  </BottomSheet>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { BottomSheet, Segmented, isMobile } from '@/components/ui'
import { BTN } from '@/documentos/tools'
import { comprasApi, money } from '@/composables/useCompras'
import { formatDate } from '@/utils/display'
import {
  changeOf,
  nextTier,
  rowTotal,
  specParts,
  tierCells,
  toTarget,
} from '@/utils/listaPrecios'
import ListaHistoria from './ListaHistoria.vue'
import ListaStepper from './ListaStepper.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  line: { type: Object, default: null },
  row: { type: Object, default: null },
  owner: { type: Boolean, default: false },
  costVisible: { type: Boolean, default: false },
  currency: { type: String, default: 'MXN' },
  supplier: { type: String, default: '' },
  photoBusy: { type: Boolean, default: false },
  linking: { type: Boolean, default: false },
})
const emit = defineEmits([
  'update:open',
  'step',
  'set',
  'edit',
  'link',
  'photo',
])

const API = 'doco.workspaces.lista_precios.'
const SMALL =
  'inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full bg-surface-gray-2 px-3 text-sm text-ink-gray-8 hover:bg-surface-gray-3'
const INPUT =
  'w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 py-2 text-sm text-ink-gray-9 placeholder:text-ink-gray-4 focus:border-outline-gray-4 focus:ring-0'

const phone = isMobile
const tab = ref('historia')
const shown = ref('')
const history = ref(null)
const compare = ref(null)
const itemQuery = ref('')
const found = ref([])
const searched = ref(false)
let searchTimer = 0

const title = computed(() =>
  props.line
    ? [props.line.brand, props.line.model].filter(Boolean).join(' ') ||
      props.line.name1
    : '',
)
const specs = computed(() =>
  props.line ? specParts(props.line).join(' · ') : '',
)
const tiers = computed(() =>
  props.line ? tierCells(props.line, props.row?.qty || 0) : [],
)
const next = computed(() =>
  props.line ? nextTier(props.line, props.row?.qty || 0) : null,
)
const change = computed(() => changeOf(props.line))
const changeTone = computed(() =>
  change.value?.kind === 'up'
    ? 'text-ink-red-7'
    : change.value?.kind === 'down'
      ? 'text-ink-green-8'
      : '',
)
const missing = computed(() => toTarget(props.line))
const originalText = computed(() =>
  Object.entries(props.line?.original || {})
    .filter(([key]) => key !== 'tiers_json')
    .map(([key, value]) => `${key} ${value}`)
    .join(', '),
)
const photoUrl = computed(() => {
  if (!props.line) return ''
  if (shown.value) return candidateUrl(shown.value)
  return props.line.photo || ''
})

function candidateUrl(key) {
  return `/api/method/${API}photo?linea=${encodeURIComponent(props.line.name)}&key=${encodeURIComponent(key)}`
}

async function loadMore() {
  if (!props.line) return
  const linea = props.line.name
  history.value = null
  compare.value = null
  try {
    const [h, c] = await Promise.all([
      comprasApi(API + 'history', { linea }),
      comprasApi(API + 'compare', { linea }),
    ])
    if (props.line?.name !== linea) return
    history.value = h
    compare.value = c
  } catch {
    history.value = { points: [] }
    compare.value = { rows: [] }
  }
}

watch(
  () => [props.open, props.line?.name],
  ([open]) => {
    shown.value = ''
    itemQuery.value = ''
    found.value = []
    searched.value = false
    if (open) loadMore()
  },
  { immediate: true },
)

function searchItems() {
  clearTimeout(searchTimer)
  const text = itemQuery.value.trim()
  if (!text) {
    found.value = []
    searched.value = false
    return
  }
  searchTimer = setTimeout(async () => {
    try {
      found.value = await comprasApi(API + 'search_items', { text })
    } catch {
      found.value = []
    }
    searched.value = true
  }, 250)
}

function pickPhoto(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (file) emit('photo', props.line, file)
}
</script>
