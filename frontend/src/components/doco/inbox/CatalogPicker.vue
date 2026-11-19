<!--
  Catalog picker (#catalog). Opened by the /cat command or the 📦 button in a composer.
  Search items (foto · $precio · stock), filter by group, brand, price, stock and offers,
  multi-select, and send each as its own media message into the active conversation.
  Sale prices come from the shop's automatic Pricing Rules (the storefront's own math).
  What goes out follows a catalog template (Canned Reply «Catálogo»): a message before
  the items, each item's text from a {{variable}} format, a message after, and an
  optional short link to the store with the same search. «Revisar» shows and edits all of
  it, item by item, before sending (utils/catalogMessage renders it). Live data; manual
  (operator-triggered) send. `inline` embeds the same picker as a workspace tab panel (no
  overlay, stays open after a send) — the Artículos tab in DealWorkspace.
-->
<template>
  <div
    :class="
      inline
        ? 'flex min-h-0 flex-1 flex-col'
        : 'fixed inset-0 z-40 flex items-end justify-center sm:items-center'
    "
    :role="inline ? undefined : 'dialog'"
    :aria-modal="inline ? undefined : 'true'"
    :aria-label="__('Catálogo')"
    @keydown.esc="inline ? undefined : closeCatalog()"
    @click.self="inline ? undefined : closeCatalog()"
  >
    <div v-if="!inline" class="absolute inset-0 bg-black/30" />
    <div
      :class="
        inline
          ? 'relative flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-base'
          : 'relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-8 bg-surface-base shadow-xl dark:bg-surface-gray-1 sm:max-h-[84vh] sm:w-[600px] sm:rounded-8'
      "
    >
      <!-- header + search + filters -->
      <div class="flex-none border-b border-outline-gray-1 px-4 pb-2.5 pt-3.5">
        <div
          v-if="!inline || step === 'review'"
          class="mb-2.5 flex items-center justify-between"
        >
          <div class="text-[14px] font-bold text-ink-gray-9">
            {{
              step === 'review'
                ? __('Revisar envío · {0}', [channelLabel])
                : '📦 ' + __('Catálogo')
            }}
          </div>
          <button
            v-if="!inline"
            class="text-ink-gray-4 hover:text-ink-gray-9"
            :aria-label="__('Cerrar')"
            @click="closeCatalog"
          >
            ✕
          </button>
        </div>
        <template v-if="step === 'pick'">
          <div
            class="flex items-center gap-2 rounded-[9px] border border-outline-gray-2 px-2.5 py-[7px] focus-within:border-outline-gray-4 focus-within:ring-1 focus-within:ring-outline-gray-3"
          >
            <LucideSearch class="h-3.5 w-3.5 text-ink-gray-4" />
            <input
              ref="searchRef"
              :value="catalogQuery"
              :aria-label="__('Buscar artículo')"
              :placeholder="__('Buscar artículo… (p.ej. fundas iphone 11)')"
              class="w-full border-0 bg-transparent text-[13px] text-ink-gray-8 placeholder:text-ink-gray-4 focus:outline-none focus:ring-0"
              @input="onCatalogQuery($event.target.value)"
            />
          </div>
          <!-- filters: stock, offers, price, brand, then the result groups -->
          <div
            class="scb -mx-1 mt-2 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5"
            data-testid="catalog-filters"
          >
            <button
              type="button"
              :class="chipClass(catalogFilters.inStock)"
              :aria-pressed="catalogFilters.inStock"
              @click="setFilter('inStock', !catalogFilters.inStock)"
            >
              {{ __('En existencia') }}
            </button>
            <button
              type="button"
              :class="chipClass(catalogFilters.onSale)"
              :aria-pressed="catalogFilters.onSale"
              data-testid="filter-on-sale"
              @click="setFilter('onSale', !catalogFilters.onSale)"
            >
              🏷 {{ __('En oferta') }}
            </button>
            <button
              type="button"
              :class="chipClass(priceOpen || priceSet)"
              :aria-expanded="priceOpen"
              @click="priceOpen = !priceOpen"
            >
              {{ priceLabel }}
            </button>
            <select
              v-if="brands.length || catalogFilters.brand"
              :value="catalogFilters.brand"
              :aria-label="__('Marca')"
              :class="[chipClass(!!catalogFilters.brand), 'pr-7']"
              @change="setFilter('brand', $event.target.value)"
            >
              <option value="">{{ __('Todas las marcas') }}</option>
              <option v-for="b in brands" :key="b.name" :value="b.name">
                {{ b.name }} · {{ b.count }}
              </option>
            </select>
            <span
              v-if="groups.length"
              class="mx-0.5 h-4 w-px flex-none bg-outline-gray-2"
              aria-hidden="true"
            />
            <button
              v-for="g in groups"
              :key="g.name"
              type="button"
              :class="chipClass(catalogFilters.group === g.name)"
              :aria-pressed="catalogFilters.group === g.name"
              data-testid="filter-group"
              @click="
                setFilter(
                  'group',
                  catalogFilters.group === g.name ? '' : g.name,
                )
              "
            >
              {{ g.name }}
              <span class="opacity-60">{{ g.count }}</span>
            </button>
          </div>
          <div
            v-if="priceOpen"
            class="mt-2 flex items-center gap-2 text-[12px] text-ink-gray-6"
          >
            <input
              :value="catalogFilters.priceMin"
              inputmode="decimal"
              :aria-label="__('Precio mínimo')"
              :placeholder="__('$ mín.')"
              class="w-24 rounded-6 border border-outline-gray-2 px-2 py-1 text-[12px]"
              @change="setPrice('priceMin', $event.target.value)"
            />
            –
            <input
              :value="catalogFilters.priceMax"
              inputmode="decimal"
              :aria-label="__('Precio máximo')"
              :placeholder="__('$ máx.')"
              class="w-24 rounded-6 border border-outline-gray-2 px-2 py-1 text-[12px]"
              @change="setPrice('priceMax', $event.target.value)"
            />
            <button
              v-if="priceSet"
              type="button"
              class="font-semibold underline"
              @click="clearPrice"
            >
              {{ __('Quitar') }}
            </button>
          </div>
        </template>
      </div>

      <!-- results grid -->
      <div v-if="step === 'pick'" class="scb flex-1 overflow-y-auto px-3 py-3">
        <div
          v-if="catalogResults.loading && !rows.length"
          class="py-10 text-center text-[12px] text-ink-gray-4"
        >
          {{ __('Buscando…') }}
        </div>
        <div
          v-else-if="catalogResults.error"
          class="py-10 text-center text-[12px] text-ink-red-7"
        >
          {{ __('No se pudo buscar.') }}
          <button
            class="ml-1 font-semibold underline"
            @click="runCatalogSearch"
          >
            {{ __('Reintentar') }}
          </button>
        </div>
        <div
          v-else-if="!rows.length"
          class="py-10 text-center text-[12px] text-ink-gray-4"
        >
          {{
            catalogQuery || filtered
              ? __('Sin resultados — prueba con menos palabras o filtros.')
              : __('Escribe para buscar en el catálogo.')
          }}
        </div>
        <div v-else class="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <button
            v-for="r in rows"
            :key="r.item_code"
            type="button"
            :aria-pressed="selected.has(r.item_code)"
            :aria-label="r.item_name"
            class="group relative flex flex-col overflow-hidden rounded-7 border bg-surface-base text-left transition dark:bg-surface-gray-2"
            :class="
              selected.has(r.item_code)
                ? 'border-outline-green-4 ring-2 ring-outline-green-4'
                : 'border-outline-gray-2 hover:border-outline-gray-3'
            "
            @click="toggle(r)"
          >
            <div
              class="relative aspect-square w-full bg-surface-gray-2 dark:bg-surface-gray-3"
            >
              <img
                v-if="r.image_url && !failed.has(r.item_code)"
                :src="r.image_url"
                :alt="r.item_name"
                class="h-full w-full object-cover"
                loading="lazy"
                @error="failed.add(r.item_code)"
              />
              <div
                v-else
                class="flex h-full w-full items-center justify-center text-ink-gray-4"
              >
                <LucideImageOff class="h-6 w-6" />
              </div>
              <span
                v-if="r.discount_pct"
                class="absolute left-1.5 top-1.5 rounded-4 bg-surface-red-7 px-1.5 py-0.5 text-[10px] font-bold text-white"
                data-testid="sale-badge"
                >-{{ r.discount_pct }}%</span
              >
              <span
                v-if="selected.has(r.item_code)"
                class="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style="background: var(--brand)"
                >✓</span
              >
              <span
                class="absolute bottom-1.5 left-1.5 rounded-4 px-1.5 py-0.5 text-[9.5px] font-semibold"
                :class="
                  r.stock > 0
                    ? 'text-ink-green-8 bg-surface-green-2'
                    : 'text-ink-red-8 bg-surface-red-1'
                "
                >{{ r.stock }} {{ __('stock') }}</span
              >
            </div>
            <div class="flex min-h-0 flex-col gap-0.5 p-2">
              <div
                class="line-clamp-2 text-[11.5px] font-medium leading-tight text-ink-gray-8"
              >
                {{ r.item_name }}
              </div>
              <div
                v-if="r.sale_price != null"
                class="flex flex-wrap items-baseline gap-x-1.5"
              >
                <span class="text-[12.5px] font-bold text-ink-red-8">{{
                  formatMoney(r.sale_price, r.currency)
                }}</span>
                <span class="text-[10.5px] text-ink-gray-5 line-through">{{
                  formatMoney(r.price, r.currency)
                }}</span>
              </div>
              <div v-else class="text-[12.5px] font-bold text-ink-gray-9">
                {{
                  r.price != null
                    ? formatMoney(r.price, r.currency)
                    : __('Consultar')
                }}
              </div>
            </div>
          </button>
        </div>
      </div>

      <!-- review: what goes out, editable -->
      <div
        v-else
        class="scb flex-1 space-y-4 overflow-y-auto px-4 py-3"
        data-testid="catalog-review"
      >
        <div class="flex flex-wrap items-end gap-2">
          <label class="min-w-[180px] flex-1">
            <span :class="label">{{ __('Plantilla') }}</span>
            <select
              :value="templateId"
              :aria-label="__('Plantilla')"
              class="w-full rounded-6 border border-outline-gray-2 bg-surface-base px-2 py-1.5 text-[13px]"
              @change="onTemplate($event.target.value)"
            >
              <option v-for="t in templates" :key="t.id" :value="t.id">
                {{ t.title }}
              </option>
            </select>
          </label>
          <template v-if="saveOpen">
            <input
              v-model="saveTitle"
              :aria-label="__('Nombre de la plantilla')"
              :placeholder="__('Nombre de la plantilla')"
              class="min-w-[150px] flex-1 rounded-6 border border-outline-gray-2 px-2 py-1.5 text-[13px]"
              @keydown.enter.prevent="saveTemplate"
            />
            <button
              type="button"
              class="rounded-6 bg-surface-gray-2 px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50"
              :disabled="saving || !saveTitle.trim()"
              @click="saveTemplate"
            >
              {{ saving ? '…' : __('Guardar') }}
            </button>
          </template>
          <button
            v-else
            type="button"
            class="rounded-6 px-2 py-1.5 text-[12.5px] font-semibold text-ink-gray-7 underline"
            @click="saveOpen = true"
          >
            {{ __('Guardar como plantilla') }}
          </button>
        </div>

        <section>
          <div class="flex items-center justify-between">
            <span :class="label">{{
              __('Mensaje antes de los artículos')
            }}</span>
            <span class="text-[11px] text-ink-gray-4">{{
              __('opcional')
            }}</span>
          </div>
          <div
            v-if="quickReplies.length"
            class="scb mb-1.5 flex gap-1.5 overflow-x-auto"
          >
            <button
              v-for="q in quickReplies"
              :key="q.name"
              type="button"
              :class="chipClass(false)"
              :title="q.body"
              @click="texts.intro = q.body"
            >
              ⚡ {{ q.title }}
            </button>
          </div>
          <textarea
            ref="introRef"
            v-model="texts.intro"
            rows="2"
            :aria-label="__('Mensaje antes de los artículos')"
            :placeholder="
              __('Hola {{nombre}}, te paso lo que tenemos de {{busqueda}} 👇')
            "
            :class="area"
          />
          <VariableChips
            :variables="messageVariables()"
            @pick="(k) => insert('intro', introRef, k)"
          />
          <div
            v-if="introText && introText !== texts.intro.trim()"
            class="mt-1 whitespace-pre-wrap rounded-6 bg-surface-gray-1 px-2.5 py-1.5 text-[12px] text-ink-gray-7"
            data-testid="intro-preview"
          >
            {{ forChannel(introText, channel) }}
          </div>
        </section>

        <section>
          <span :class="label">{{ __('Texto de cada artículo') }}</span>
          <textarea
            ref="captionRef"
            v-model="texts.caption"
            rows="3"
            :aria-label="__('Texto de cada artículo')"
            :class="area"
            @input="resetItemTexts"
          />
          <VariableChips
            :variables="itemVariables()"
            @pick="(k) => insert('caption', captionRef, k)"
          />
        </section>

        <section class="space-y-2.5" data-testid="review-items">
          <div
            v-for="item in pickedItems"
            :key="item.item_code"
            class="flex gap-2.5"
          >
            <img
              v-if="item.image_url && !failed.has(item.item_code)"
              :src="item.image_url"
              :alt="item.item_name"
              class="size-14 flex-none rounded-6 object-cover"
            />
            <div
              v-else
              class="flex size-14 flex-none items-center justify-center rounded-6 bg-surface-gray-2 text-ink-gray-6"
            >
              <LucideImageOff class="size-5" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <div
                  class="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink-gray-8"
                >
                  {{ item.item_name }}
                </div>
                <input
                  :value="edits[item.item_code]?.price || ''"
                  inputmode="decimal"
                  :aria-label="
                    __('Precio en este mensaje: {0}', [item.item_name])
                  "
                  :placeholder="shownPrice(item)"
                  :title="__('Solo cambia el precio de este mensaje')"
                  class="w-24 rounded-6 border border-outline-gray-2 px-2 py-1 text-right text-[12px]"
                  @input="setItemPrice(item, $event.target.value)"
                />
              </div>
              <textarea
                :value="captionFor(item)"
                rows="3"
                :aria-label="__('Texto de {0}', [item.item_name])"
                :class="[area, 'mt-1']"
                @input="editOf(item.item_code).caption = $event.target.value"
              />
              <button
                v-if="edits[item.item_code]?.caption != null"
                type="button"
                class="text-[11px] text-ink-gray-5 underline"
                @click="editOf(item.item_code).caption = null"
              >
                {{ __('Volver al formato') }}
              </button>
            </div>
          </div>
          <p v-if="channel !== 'whatsapp'" class="text-[11px] text-ink-gray-5">
            {{
              __(
                'En {0} los * y ~ no dan formato: se envía el texto sin ellos.',
                [channelLabel],
              )
            }}
          </p>
        </section>

        <section v-if="storeAvailable">
          <label class="flex items-center gap-2 text-[13px] text-ink-gray-8">
            <input
              v-model="store.on"
              type="checkbox"
              data-testid="store-link-toggle"
            />
            {{ __('Enlace a la tienda con esta búsqueda') }}
          </label>
          <div
            v-if="store.on"
            class="mt-1 truncate pl-6 text-[12px] text-ink-gray-6"
            data-testid="store-link"
          >
            {{ store.loading ? __('Creando enlace…') : store.url }}
          </div>
        </section>

        <section>
          <div class="flex items-center justify-between">
            <span :class="label">{{
              __('Mensaje después de los artículos')
            }}</span>
            <span class="text-[11px] text-ink-gray-4">{{
              __('opcional')
            }}</span>
          </div>
          <textarea
            ref="closingRef"
            v-model="texts.closing"
            rows="2"
            :aria-label="__('Mensaje después de los artículos')"
            :placeholder="__('¿Te aparto alguna? 😊')"
            :class="area"
          />
          <VariableChips
            :variables="messageVariables()"
            @pick="(k) => insert('closing', closingRef, k)"
          />
          <div
            v-if="closingText"
            class="mt-1 whitespace-pre-wrap rounded-6 bg-surface-gray-1 px-2.5 py-1.5 text-[12px] text-ink-gray-7"
            data-testid="closing-preview"
          >
            {{ forChannel(closingText, channel) }}
          </div>
        </section>
      </div>

      <!-- footer — wraps on narrow phones so the actions never overflow -->
      <div
        class="flex flex-none flex-wrap items-center justify-between gap-2 border-t border-outline-gray-1 px-4 py-3"
      >
        <div
          v-if="step === 'pick'"
          class="flex min-w-0 items-center gap-2 text-[12px] text-ink-gray-6"
        >
          <span>{{ selected.size }} {{ __('seleccionados') }}</span>
          <select
            v-if="templates.length > 1"
            :value="templateId"
            :aria-label="__('Plantilla')"
            class="max-w-[140px] truncate rounded-6 border border-outline-gray-2 bg-surface-base px-1.5 py-1 text-[12px]"
            data-testid="footer-template"
            @change="onTemplate($event.target.value)"
          >
            <option v-for="t in templates" :key="t.id" :value="t.id">
              {{ t.title }}
            </option>
          </select>
        </div>
        <button
          v-else
          type="button"
          class="rounded-6 px-2 py-2 text-[13px] font-semibold text-ink-gray-7"
          @click="step = 'pick'"
        >
          ← {{ __('Volver') }}
        </button>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <template v-if="step === 'pick'">
            <!-- single pick → draft into the composer for edit-before-send (Marco 07-25) -->
            <button
              v-if="selected.size === 1"
              :class="secondary"
              :title="__('Poner en el mensaje para editar antes de enviar')"
              @click="editSend"
            >
              ✏️ {{ __('Editar y enviar') }}
            </button>
            <!-- ERP spec P2.1: picked items → draft Quotation lines on the deal -->
            <button
              v-if="canQuote"
              :class="secondary"
              :disabled="busy || !selected.size"
              :title="__('Agregar a la cotización del trato')"
              @click="quote"
            >
              🧾 {{ __('Cotizar') }}
            </button>
            <button
              :class="secondary"
              :disabled="!selected.size"
              :title="__('Ver y cambiar los textos antes de enviar')"
              data-testid="catalog-review-open"
              @click="openReview"
            >
              {{ __('Revisar') }}
            </button>
          </template>
          <button
            class="rounded-6 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
            style="background: var(--brand)"
            :disabled="busy || !selected.size"
            data-testid="catalog-send"
            @click="send"
          >
            {{ busy ? '…' : __('Enviar {0} al chat', [selected.size]) }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import {
  ref,
  computed,
  reactive,
  nextTick,
  onMounted,
  watch,
  defineComponent,
  h,
} from 'vue'
import { call, createResource, toast } from 'frappe-ui'
import { formatMoney } from '@/composables/crmFormat'
import LucideSearch from '~icons/lucide/search'
import LucideImageOff from '~icons/lucide/image-off'
import {
  setComposerDraft,
  catalogResults,
  catalogQuery,
  onCatalogQuery,
  runCatalogSearch,
  closeCatalog,
  sendCatalogItems,
  catalogCtx,
  catalogFilters,
  catalogTemplates,
  catalogChannel,
  catalogStoreLink,
  salesDocsEnabled,
} from '@/composables/inbox'
import { addItemsToQuotation } from '@/composables/salesDocs'
import { chipClass } from '@/components/ui/chipClass'
import {
  DEFAULT_CAPTION,
  closingWithStore,
  firstName,
  forChannel,
  itemValues,
  itemVariables,
  messageVariables,
  money,
  parsePrice,
  renderCaption,
  renderMessage,
} from '@/utils/catalogMessage'

// The {{variable}} chips under a text box.
const VariableChips = defineComponent({
  props: { variables: { type: Array, default: () => [] } },
  emits: ['pick'],
  setup(p, { emit: chipEmit }) {
    return () =>
      h(
        'div',
        { class: 'mt-1 flex flex-wrap gap-1' },
        p.variables.map((v) =>
          h(
            'button',
            {
              type: 'button',
              class:
                'rounded-4 bg-surface-gray-2 px-1.5 py-0.5 text-[10.5px] text-ink-gray-7 hover:bg-surface-gray-3',
              title: `{{${v.key}}}`,
              onClick: () => chipEmit('pick', v.key),
            },
            `+ ${v.label}`,
          ),
        ),
      )
  },
})

const props = defineProps({
  // Embedded as a tab panel: no overlay/close chrome, selection survives a send.
  inline: { type: Boolean, default: false },
})
const emit = defineEmits(['sent', 'quoted', 'edited'])

const result = computed(() => {
  const d = catalogResults.data
  return Array.isArray(d) ? { items: d } : d || {}
})
const rows = computed(() => result.value.items || [])
const groups = computed(() => result.value.groups || [])
const brands = computed(() => result.value.brands || [])
const storeAvailable = computed(() => !!result.value.store)
const selected = reactive(new Set())
const picked = reactive(new Map()) // item_code → the item as shown when picked
const failed = reactive(new Set()) // item_codes whose image 404'd → show the placeholder
const busy = ref(false)
const searchRef = ref(null)
const introRef = ref(null)
const captionRef = ref(null)
const closingRef = ref(null)
const step = ref('pick')
const priceOpen = ref(false)

const label = 'mb-1 block text-[11.5px] font-semibold text-ink-gray-6'
const area =
  'w-full resize-y rounded-6 border border-outline-gray-2 bg-surface-base px-2.5 py-1.5 text-[13px] text-ink-gray-8 placeholder:text-ink-gray-4 focus:outline-none focus:ring-1 focus:ring-outline-gray-3'
const secondary =
  'rounded-6 border border-outline-gray-2 bg-surface-gray-2 px-3 py-2 text-[13px] font-semibold text-ink-gray-8 disabled:opacity-50'

onMounted(() => nextTick(() => searchRef.value?.focus()))

// ── filters ────────────────────────────────────────────────────────────────
const priceSet = computed(
  () => catalogFilters.priceMin !== '' || catalogFilters.priceMax !== '',
)
const filtered = computed(
  () =>
    !!(
      catalogFilters.group ||
      catalogFilters.brand ||
      catalogFilters.onSale ||
      priceSet.value
    ),
)
const priceLabel = computed(() => {
  const { priceMin: lo, priceMax: hi } = catalogFilters
  if (lo !== '' && hi !== '') return `${money(lo)} – ${money(hi)}`
  if (lo !== '') return __('Desde {0}', [money(lo)])
  if (hi !== '') return __('Hasta {0}', [money(hi)])
  return __('Precio')
})
function setFilter(key, value) {
  catalogFilters[key] = value
  runCatalogSearch()
}
function setPrice(key, text) {
  const n = parsePrice(text)
  setFilter(key, n === null ? '' : n)
}
function clearPrice() {
  catalogFilters.priceMin = ''
  catalogFilters.priceMax = ''
  runCatalogSearch()
}

function toggle(r) {
  if (selected.has(r.item_code)) {
    selected.delete(r.item_code)
    picked.delete(r.item_code)
  } else {
    selected.add(r.item_code)
    picked.set(r.item_code, r)
  }
}
// Picks survive a new search: the item keeps what it showed when picked.
const pickedItems = computed(() =>
  [...selected]
    .map(
      (code) =>
        picked.get(code) || rows.value.find((r) => r.item_code === code),
    )
    .filter(Boolean),
)

// ── template and texts ─────────────────────────────────────────────────────
const channel = computed(() => catalogChannel())
const channelLabel = computed(
  () =>
    ({ whatsapp: 'WhatsApp', messenger: 'Messenger', email: 'Email' })[
      channel.value
    ] || channel.value,
)
const templates = computed(() => catalogTemplates.data || [])
const templateId = ref('')
const texts = reactive({ intro: '', caption: DEFAULT_CAPTION, closing: '' })
const store = reactive({ on: false, url: '', loading: false })
const edits = reactive({}) // item_code → { price, caption }: this message only

function applyTemplate(t) {
  templateId.value = t?.id || ''
  texts.intro = t?.intro || ''
  texts.caption = t?.caption || DEFAULT_CAPTION
  texts.closing = t?.closing || ''
  store.on = !!t?.store_link
  resetItemTexts()
}
function onTemplate(id) {
  applyTemplate(templates.value.find((t) => t.id === id))
}
watch(
  templates,
  (list) => {
    if (list.length && !list.some((t) => t.id === templateId.value))
      applyTemplate(list[0])
  },
  { immediate: true },
)

function editOf(code) {
  if (!edits[code]) edits[code] = { price: '', caption: null }
  return edits[code]
}
function resetItemTexts() {
  for (const code of Object.keys(edits)) edits[code].caption = null
}
function setItemPrice(item, value) {
  editOf(item.item_code).price = value
}
function shownPrice(item) {
  return itemValues(item).precio
}
function captionFor(item) {
  const e = edits[item.item_code]
  if (e?.caption != null) return e.caption
  return renderCaption(texts.caption, itemValues(item, parsePrice(e?.price)))
}

const messageValues = computed(() => ({
  nombre: firstName(catalogCtx.value?.customer_name),
  busqueda: catalogQuery.value || catalogFilters.group || '',
  cantidad: String(selected.size),
  tienda: store.url,
}))
const introText = computed(() =>
  renderMessage(texts.intro, messageValues.value),
)
const closingText = computed(() =>
  renderMessage(
    closingWithStore(texts.closing, store.on && !!store.url),
    messageValues.value,
  ),
)

function insert(field, elRef, key) {
  const token = `{{${key}}}`
  const el = elRef?.value || elRef
  const text = texts[field] || ''
  const at = el?.selectionStart ?? text.length
  const before = text.slice(0, at)
  const pad = before && !/\s$/.test(before) ? ' ' : ''
  texts[field] = before + pad + token + text.slice(at)
  if (field === 'caption') resetItemTexts()
}

// ── store short link ───────────────────────────────────────────────────────
async function ensureStoreLink() {
  if (!store.on || store.url || !storeAvailable.value) return
  store.loading = true
  try {
    const out = await catalogStoreLink()
    store.url = out?.url || ''
  } catch (e) {
    store.on = false
    toast.error(
      e?.messages?.[0] || __('No se pudo crear el enlace a la tienda'),
    )
  } finally {
    store.loading = false
  }
}
watch(
  () => store.on,
  (on) => on && step.value === 'review' && ensureStoreLink(),
)
// Another search or filter means another link.
watch(
  () => [
    catalogQuery.value,
    catalogFilters.group,
    catalogFilters.brand,
    catalogFilters.priceMin,
    catalogFilters.priceMax,
  ],
  () => {
    store.url = ''
  },
)

// Quick replies (respuestas rápidas) for the message before the items.
const CANNED_CHANNEL = {
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  email: 'Email',
}
const quickRes = createResource({
  url: 'doco_marketing.api.inbox.get_canned_replies',
  auto: false,
})
const quickReplies = computed(() => quickRes.data || [])

function openReview() {
  if (!selected.size) return
  step.value = 'review'
  if (!quickRes.data && !quickRes.loading)
    quickRes.submit({ channel: CANNED_CHANNEL[channel.value] })
  ensureStoreLink()
}

const saveOpen = ref(false)
const saveTitle = ref('')
const saving = ref(false)
async function saveTemplate() {
  if (!saveTitle.value.trim()) return
  saving.value = true
  try {
    // Saved for every channel: each one gets its own formatting when sent.
    const saved = await call('doco_marketing.api.catalog.save_template', {
      title: saveTitle.value.trim(),
      caption: texts.caption,
      intro: texts.intro,
      closing: texts.closing,
      store_link: store.on ? 1 : 0,
      channel: 'Any',
    })
    await catalogTemplates.submit({ channel: channel.value })
    templateId.value = saved?.id || templateId.value
    saveOpen.value = false
    saveTitle.value = ''
    toast.success(__('Plantilla guardada'))
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo guardar la plantilla'))
  } finally {
    saving.value = false
  }
}

// ── actions ────────────────────────────────────────────────────────────────
function editSend() {
  const item = pickedItems.value[0]
  if (!item) return
  setComposerDraft({
    text: captionFor(item),
    attach: item.image_url || '',
    content_type: 'image',
    canned: 'catalogo',
  })
  if (props.inline) emit('edited')
  else closeCatalog()
}

function reset() {
  selected.clear()
  picked.clear()
  for (const code of Object.keys(edits)) delete edits[code]
  step.value = 'pick'
}

async function send() {
  if (!selected.size) return
  busy.value = true
  try {
    await ensureStoreLink()
    const captions = Object.fromEntries(
      pickedItems.value.map((item) => [item.item_code, captionFor(item)]),
    )
    const res = await sendCatalogItems([...selected], {
      captions,
      intro: introText.value,
      closing: closingText.value,
    })
    const n = res?.sent_count || 0
    if (n) toast.success(__('{0} artículos enviados', [n]))
    if (res?.skipped?.length)
      toast.error(__('{0} no se pudieron enviar', [res.skipped.length]))
    if (res?.intro === 'send_failed' || res?.closing === 'send_failed')
      toast.error(__('Un mensaje de texto no se pudo enviar'))
    emit('sent')
    if (props.inline) reset()
    else closeCatalog()
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo enviar el catálogo'))
  } finally {
    busy.value = false
  }
}

// «Cotizar» only makes sense on a deal conversation (orphans/comments have no deal)
const canQuote = computed(
  () =>
    salesDocsEnabled.value &&
    catalogCtx.value?.reference_doctype === 'CRM Deal' &&
    catalogCtx.value?.reference_name,
)

async function quote() {
  if (!selected.size) return
  busy.value = true
  try {
    const out = await addItemsToQuotation(
      catalogCtx.value.reference_name,
      [...selected].map((c) => ({ item_code: c, qty: 1 })),
    )
    toast.success(
      __('Cotización {0} · {1} líneas', [out.quotation, out.lines.length]),
    )
    for (const w of out.warnings || []) toast.error(w)
    emit('quoted', out.quotation)
    if (props.inline) reset()
    else closeCatalog()
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo cotizar'))
  } finally {
    busy.value = false
  }
}
</script>
