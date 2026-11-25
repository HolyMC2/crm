<template>
  <!-- Servidor GSM › Catálogo: what the GSM server's suppliers offer and what it sells.
       The title opens the views (Todas, Sin publicar, En venta, Nunca se venden, No
       disponibles); one search; a group chip; a tap opens the service with its price
       and its one action; in «Sin publicar» rows carry a box and the page's one action
       puts the picked ones on sale with the markup. -->
  <div class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
    <AppBar
      v-model:search="search"
      v-model:search-open="searchOpen"
      :context="__('GSM server', null, 'Gsm')"
      :title="title"
      :scopes="scopes"
      :scope="view"
      :scope-title="__('GSM catalog', null, 'Gsm')"
      searchable
      :search-label="__('Search service, group or ID', null, 'Gsm')"
      :loading="loading && loaded"
      @update:scope="setView"
    />

    <div class="min-h-0 flex-1 overflow-y-auto pb-28 sm:pb-10">
      <div class="mx-auto w-full max-w-3xl pt-2">
        <div
          v-if="loaded && !guard"
          class="flex flex-wrap items-center gap-1.5 px-4 pb-2"
        >
          <button
            type="button"
            :class="['press', chipClass(Boolean(group))]"
            :aria-pressed="Boolean(group)"
            data-gsm-grupo
            @click="groupSheet = true"
          >
            <span class="lucide-layers size-4" aria-hidden="true" />
            {{ group || __('All groups', null, 'Gsm') }}
          </button>
          <button
            v-if="selectableRows.length"
            type="button"
            :class="['press', chipClass(allPicked)]"
            :aria-pressed="allPicked"
            data-gsm-todas
            @click="toggleAll"
          >
            {{ __('Pick the {0} shown', [selectableRows.length], 'Gsm') }}
          </button>
        </div>

        <EmptyState
          v-if="guard"
          role="alert"
          state="error"
          :title="guard.title"
          :message="guard.detail"
          :action="guard.retry ? __('Retry', null, 'Gsm') : ''"
          @action="load()"
        />
        <EmptyState
          v-else-if="loading && !loaded"
          role="status"
          state="loading"
          :title="__('Loading the catalog…', null, 'Gsm')"
        />
        <EmptyState
          v-else-if="loaded && !rows.length"
          :title="emptyTitle"
          :message="emptyMessage"
        />
        <ul
          v-else
          class="divide-y divide-outline-gray-1"
          data-testid="gsm-catalogo"
        >
          <li
            v-for="row in rows"
            :key="row.offering"
            class="flex items-center"
            :data-offering="row.offering"
          >
            <label
              v-if="view === 'sin_publicar' && selectable(row)"
              class="flex size-12 shrink-0 cursor-pointer items-center justify-center"
            >
              <input
                type="checkbox"
                class="size-5 accent-[var(--muelle-accent)]"
                :checked="picked.has(row.offering)"
                :aria-label="__('Pick {0}', [row.title], 'Gsm')"
                @change="togglePick(row.offering)"
              />
            </label>
            <ListRow
              class="min-w-0 flex-1"
              :title="row.title"
              :subtitle="rowSubtitle(row)"
              :meta="rowPrice(row, currency)"
              :selected="picked.has(row.offering)"
              @click="openRow(row)"
            >
              <template v-if="view === 'todas'" #trailing>
                <StatusChip
                  :label="stateChip(row.state).label"
                  :tone="stateChip(row.state).tone"
                />
              </template>
            </ListRow>
          </li>
        </ul>
        <div class="px-4">
          <button
            v-if="page < pages"
            type="button"
            :class="['press mt-1', BTN.text]"
            :disabled="loading"
            @click="load({ more: true })"
          >
            {{ __('Show more services', null, 'Gsm') }}
          </button>
        </div>
      </div>
    </div>

    <Fab
      v-if="picked.size"
      :label="__('Put {0} on sale', [picked.size], 'Gsm')"
      icon="lucide-store"
      extended
      data-gsm-publicar
      @click="openPublish"
    />

    <BottomSheet
      :open="groupSheet"
      :title="__('Group', null, 'Gsm')"
      @update:open="groupSheet = $event"
    >
      <ul class="divide-y divide-outline-gray-1 pb-2">
        <li>
          <ListRow
            :title="__('All groups', null, 'Gsm')"
            :meta="String(counts.todas ?? '')"
            :selected="!group"
            @click="setGroup('')"
          />
        </li>
        <li v-for="g in groups" :key="g.title">
          <ListRow
            :title="g.title"
            :meta="String(g.count)"
            :selected="group === g.title"
            @click="setGroup(g.title)"
          />
        </li>
      </ul>
    </BottomSheet>

    <BottomSheet
      :open="publish.open"
      :title="__('Put {0} on sale', [picked.size], 'Gsm')"
      @update:open="publish.open = $event"
    >
      <div class="space-y-3 px-4 pb-2">
        <Field
          v-model="publish.markup"
          type="number"
          :label="__('Markup over cost (%)', null, 'Gsm')"
          :error="publish.problem"
        />
        <ul class="divide-y divide-outline-gray-1">
          <li
            v-for="row in publishPreview"
            :key="row.offering"
            class="flex items-baseline justify-between gap-3 px-3 py-2 text-sm"
          >
            <span class="min-w-0 truncate text-ink-gray-8">{{ row.title }}</span>
            <span class="num shrink-0 text-ink-gray-8">
              {{ money(row.cost, row.currency) }} →
              {{ money(priceWithMarkup(row.cost, publish.markup), currency) }}
            </span>
          </li>
        </ul>
        <ul v-if="publish.skipped.length" class="space-y-1 text-sm" role="status">
          <li v-for="s in publish.skipped" :key="s.offering" class="text-ink-gray-7">
            {{ titleOf(s.offering) }}: {{ s.reason }}
          </li>
        </ul>
      </div>
      <template #actions>
        <button type="button" :class="['press', BTN.text]" @click="publish.open = false">
          {{ __('Cancel', null, 'Gsm') }}
        </button>
        <button
          type="button"
          :class="['press', BTN.filled]"
          :disabled="publish.busy || !markupOk"
          data-gsm-publicar-ahora
          @click="runPublish"
        >
          {{ __('Put on sale', null, 'Gsm') }}
        </button>
      </template>
    </BottomSheet>

    <BottomSheet
      :open="Boolean(current)"
      :title="current?.title || ''"
      :subtitle="current ? rowSubtitle(current) : ''"
      @update:open="(open) => !open && (current = null)"
    >
      <div v-if="current" class="space-y-3 px-4 pb-2">
        <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt class="text-[var(--muelle-on-surface-variant)]">{{ __('Supplier cost', null, 'Gsm') }}</dt>
          <dd class="num text-right text-ink-gray-8">{{ money(current.cost, current.currency) }}</dd>
          <dt class="text-[var(--muelle-on-surface-variant)]">{{ __('With markup', null, 'Gsm') }}</dt>
          <dd class="num text-right text-ink-gray-8">{{ money(current.suggested, currency) }}</dd>
          <dt class="text-[var(--muelle-on-surface-variant)]">{{ __('Supplier', null, 'Gsm') }}</dt>
          <dd class="text-right text-ink-gray-8">{{ current.supplier }}, {{ current.service_id }}</dd>
        </dl>
        <Field
          v-if="current.state === 'en_venta'"
          v-model="edit.price"
          type="money"
          :currency="currency"
          :label="__('Public price', null, 'Gsm')"
          :error="edit.problem"
        />
        <p v-else-if="!current.sellable" role="status" class="text-sm text-ink-gray-7">
          {{ current.excluded || current.blocked }}
        </p>
        <p v-if="edit.problem && current.state !== 'en_venta'" role="alert" class="text-sm text-ink-red-7">
          {{ edit.problem }}
        </p>
      </div>
      <template v-if="current && (current.sellable || current.state === 'en_venta')" #actions>
        <button
          v-if="current.state === 'en_venta'"
          type="button"
          :class="['press', BTN.text]"
          :disabled="edit.busy"
          data-gsm-quitar
          @click="runUnpublish"
        >
          {{ __('Take off sale', null, 'Gsm') }}
        </button>
        <button
          v-if="current.state === 'en_venta'"
          type="button"
          :class="['press', BTN.filled]"
          :disabled="edit.busy || !priceOk"
          data-gsm-precio
          @click="runPrice"
        >
          {{ __('Save price', null, 'Gsm') }}
        </button>
        <button
          v-else
          type="button"
          :class="['press', BTN.filled]"
          :disabled="edit.busy"
          data-gsm-vender
          @click="runPublishOne"
        >
          {{ __('Put on sale for {0}', [money(current.suggested, currency)], 'Gsm') }}
        </button>
      </template>
    </BottomSheet>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'frappe-ui'
import {
  AppBar,
  BottomSheet,
  EmptyState,
  Fab,
  Field,
  ListRow,
  StatusChip,
} from '@/components/ui'
import { chipClass } from '@/components/ui/chipClass'
import { BTN } from '@/documentos/tools'
import { money, problemOf } from '@/composables/useCompras'
import {
  VIEWS,
  gsmApi,
  normalizeView,
  priceWithMarkup,
  publishReceipt,
  rowPrice,
  rowSubtitle,
  selectable,
  stateChip,
  viewTitle,
} from '@/composables/useGsmCatalogo'

const PAGE = 100
const route = useRoute()
const router = useRouter()
const text = (value) =>
  typeof value === 'string' && value.length <= 140 ? value.trim() : ''

const view = ref(normalizeView(route.query.vista))
const group = ref(text(route.query.grupo))
const search = ref(text(route.query.q))
const searchOpen = ref(Boolean(search.value))
const rows = ref([])
const counts = ref({})
const groups = ref([])
const currency = ref('MXN')
const markupDefault = ref(0)
const page = ref(1)
const pages = ref(1)
const loading = ref(false)
const loaded = ref(false)
const guard = ref(null)
const groupSheet = ref(false)
const picked = ref(new Set())
const current = ref(null)
const publish = reactive({ open: false, markup: 0, busy: false, problem: '', skipped: [] })
const edit = reactive({ price: '', busy: false, problem: '' })
let ticket = 0
let timer = 0

const scopes = computed(() =>
  VIEWS.map((v) => ({
    value: v.value,
    label: __(v.label, null, 'Gsm'),
    count: counts.value[v.key] ?? undefined,
  })),
)
const title = computed(() => viewTitle(view.value))
const selectableRows = computed(() =>
  view.value === 'sin_publicar' ? rows.value.filter(selectable) : [],
)
const allPicked = computed(
  () =>
    selectableRows.value.length > 0 &&
    selectableRows.value.every((r) => picked.value.has(r.offering)),
)
const pickedRows = computed(() =>
  rows.value.filter((r) => picked.value.has(r.offering)),
)
const publishPreview = computed(() => pickedRows.value.slice(0, 5))
const markupOk = computed(() => {
  const n = Number(publish.markup)
  return Number.isFinite(n) && n >= 0 && n <= 1000
})
const priceOk = computed(() => Number(edit.price) > 0)
const emptyTitle = computed(() =>
  search.value
    ? __('No service matches «{0}»', [search.value], 'Gsm')
    : __('No services here', null, 'Gsm'),
)
const emptyMessage = computed(() =>
  counts.value.todas
    ? __('Try another view or group.', null, 'Gsm')
    : __(
        'The catalog fills itself when a supplier is connected and synced.',
        null,
        'Gsm',
      ),
)

function titleOf(offering) {
  return rows.value.find((r) => r.offering === offering)?.title || offering
}

async function load({ more = false } = {}) {
  const mine = ++ticket
  loading.value = true
  guard.value = null
  try {
    const result = await gsmApi('catalog', {
      q: search.value,
      view: view.value,
      group: group.value,
      page: more ? page.value + 1 : 1,
      page_length: PAGE,
    })
    if (mine !== ticket) return
    rows.value = more ? rows.value.concat(result.rows) : result.rows
    page.value = result.page
    pages.value = result.pages
    counts.value = result.counts || {}
    groups.value = result.groups || []
    currency.value = result.currency || 'MXN'
    markupDefault.value = Number(result.markup_pct) || 0
    if (!more) picked.value = new Set()
    loaded.value = true
  } catch (error) {
    if (mine !== ticket) return
    const p = problemOf(error)
    guard.value = {
      title:
        p.kind === 'permission'
          ? __('You cannot manage the GSM catalog', null, 'Gsm')
          : __('Could not load the catalog', null, 'Gsm'),
      detail: p.detail,
      retry: p.kind !== 'permission',
    }
  } finally {
    if (mine === ticket) loading.value = false
  }
}

function syncQuery() {
  const query = {}
  if (view.value !== 'sin_publicar') query.vista = view.value
  if (group.value) query.grupo = group.value
  if (search.value) query.q = search.value
  router.replace({ query })
}
function setView(value) {
  view.value = normalizeView(value)
  syncQuery()
  load()
}
function setGroup(value) {
  group.value = value
  groupSheet.value = false
  syncQuery()
  load()
}
watch(search, () => {
  window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    syncQuery()
    load()
  }, 250)
})

function togglePick(offering) {
  const next = new Set(picked.value)
  next.has(offering) ? next.delete(offering) : next.add(offering)
  picked.value = next
}
function toggleAll() {
  picked.value = allPicked.value
    ? new Set()
    : new Set(selectableRows.value.map((r) => r.offering))
}

function openPublish() {
  publish.markup = markupDefault.value
  publish.problem = ''
  publish.skipped = []
  publish.open = true
}
async function runPublish() {
  publish.busy = true
  publish.problem = ''
  try {
    const result = await gsmApi('publish', {
      offerings: [...picked.value],
      markup_pct: Number(publish.markup),
    })
    const receipt = publishReceipt(result)
    toast.success(receipt.line)
    publish.skipped = receipt.skipped
    if (!receipt.skipped.length) publish.open = false
    load()
  } catch (error) {
    publish.problem = problemOf(error).detail
  } finally {
    publish.busy = false
  }
}

function openRow(row) {
  current.value = row
  edit.price = row.price ?? ''
  edit.problem = ''
}
async function runPublishOne() {
  edit.busy = true
  edit.problem = ''
  try {
    const result = await gsmApi('publish', { offerings: [current.value.offering] })
    const receipt = publishReceipt(result)
    if (receipt.skipped.length) {
      edit.problem = receipt.skipped[0].reason
      return
    }
    toast.success(receipt.line)
    current.value = null
    load()
  } catch (error) {
    edit.problem = problemOf(error).detail
  } finally {
    edit.busy = false
  }
}
async function runPrice() {
  edit.busy = true
  edit.problem = ''
  try {
    await gsmApi('set_price', { service: current.value.service, price: edit.price })
    toast.success(__('Price saved', null, 'Gsm'))
    current.value = null
    load()
  } catch (error) {
    edit.problem = problemOf(error).detail
  } finally {
    edit.busy = false
  }
}
async function runUnpublish() {
  edit.busy = true
  edit.problem = ''
  try {
    await gsmApi('unpublish', { services: [current.value.service] })
    toast.success(__('Taken off sale', null, 'Gsm'))
    current.value = null
    load()
  } catch (error) {
    edit.problem = problemOf(error).detail
  } finally {
    edit.busy = false
  }
}

onMounted(load)
onBeforeUnmount(() => window.clearTimeout(timer))
</script>
