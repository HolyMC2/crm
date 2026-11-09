<template>
  <!-- Recepción: what arrived from the supplier, counted against the order
       inside the shell. The tally is the hero; one field takes a scanner gun,
       a typed code or a name (it filters the lines as the worker types); each
       line has a stepper. Taps answer at once and reach the server in order.
       Confirming adds the stock and goes back to the order. Serials, lotes and
       odd units go to Escáner, which resolves them. -->
  <div
    class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden"
    data-recepcion
  >
    <AppBar
      :back="true"
      :back-label="__('Purchase', null, 'Recepción')"
      :title="title"
      :bell="phone"
      :loading="syncing"
      @back="leave"
    >
      <template v-if="doc" #title>
        <div class="flex min-h-12 min-w-0 flex-col justify-center px-3">
          <span
            class="title-face line-clamp-2 break-words text-xl font-semibold leading-tight [text-wrap:balance]"
            data-appbar-title
            >{{ title }}</span
          >
          <span class="flex min-w-0 items-center gap-2 pt-0.5">
            <StatusChip
              :label="
                draft
                  ? __('To confirm', null, 'Recepción')
                  : __('Confirmed', null, 'Recepción')
              "
              :tone="draft ? 'neutral' : 'success'"
              data-recepcion-estado
            />
            <span class="truncate text-sm leading-tight text-ink-gray-6">{{
              __('Receipt', null, 'Recepción')
            }}</span>
          </span>
        </div>
      </template>
      <template v-if="doc" #actions>
        <div class="flex items-center rounded-full bg-surface-gray-2">
          <a
            :href="escanerHref"
            class="press flex size-11 items-center justify-center rounded-full text-ink-gray-8 hover:bg-surface-gray-3"
            :aria-label="__('Open in Escáner', null, 'Recepción')"
            :title="__('Open in Escáner', null, 'Recepción')"
            data-recepcion-escaner
          >
            <span class="lucide-scan-barcode size-5" aria-hidden="true" />
          </a>
          <a
            v-if="doc.pdf_url"
            :href="doc.pdf_url"
            target="_blank"
            rel="noopener"
            class="press flex size-11 items-center justify-center rounded-full text-ink-gray-8 hover:bg-surface-gray-3"
            :aria-label="__('Print', null, 'Recepción')"
            :title="__('Print', null, 'Recepción')"
          >
            <span class="lucide-printer size-5" aria-hidden="true" />
          </a>
        </div>
      </template>
    </AppBar>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <EmptyState
        v-if="guard"
        role="alert"
        state="error"
        :title="guard.title"
        :message="guard.detail"
        :action="__('Retry', null, 'Recepción')"
        @action="load"
      />
      <EmptyState
        v-else-if="!doc"
        role="status"
        state="loading"
        :title="__('Opening the receipt…', null, 'Recepción')"
      />

      <div
        v-else
        class="mx-auto grid w-full max-w-5xl gap-x-8 px-4 pb-6 pt-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:px-6"
      >
        <!-- The tally: first on a phone, the right column on a desk. -->
        <aside class="lg:col-start-2 lg:row-start-1">
          <div class="lg:sticky lg:top-4" data-recepcion-tally>
            <p class="flex items-baseline gap-2">
              <span
                class="num title-face text-5xl font-semibold leading-none text-ink-gray-9"
                >{{ qty(count.toward) }}</span
              >{{ ' '
              }}<span
                v-if="count.expected"
                class="num title-face text-2xl leading-none text-ink-gray-5"
                >{{ __('of {0}', [qty(count.expected)], 'Recepción') }}</span
              >
            </p>
            <p class="pt-1 text-base text-ink-gray-7">{{ tallyLine }}</p>
            <div
              class="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-gray-2"
              role="progressbar"
              :aria-valuenow="Math.round(count.ratio * 100)"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-label="__('Received', null, 'Recepción')"
            >
              <div
                class="h-full origin-left rounded-full transition-transform duration-200 motion-reduce:transition-none"
                :class="
                  count.complete ? 'bg-surface-green-7' : 'bg-surface-gray-9'
                "
                :style="{ transform: `scaleX(${count.ratio})` }"
              />
            </div>
            <dl class="mt-4 grid gap-1 text-base text-ink-gray-7">
              <div class="flex justify-between gap-2">
                <dt>{{ __('Lines', null, 'Recepción') }}</dt>
                <dd class="num">{{ lines.length }}</dd>
              </div>
              <div class="flex justify-between gap-2">
                <dt>{{ __('Total', null, 'Recepción') }}</dt>
                <dd class="num">{{ money(doc.grand_total) }}</dd>
              </div>
            </dl>
            <!-- The record's one next step, in the hero. -->
            <div v-if="draft" class="mt-4 grid">
              <button
                type="button"
                :class="['press w-full', BTN.filled]"
                :disabled="!lines.length"
                data-recepcion-confirmar
                @click="confirmOpen = true"
              >
                {{ __('Confirm receipt', null, 'Recepción') }}
              </button>
              <p v-if="!lines.length" class="pt-2 text-sm text-ink-gray-6">
                {{ emptyReason }}
              </p>
            </div>
          </div>
        </aside>

        <section class="flex min-w-0 flex-col gap-3 pt-5 lg:pt-0">
          <form v-if="draft" class="relative" @submit.prevent="submitField">
            <span
              class="lucide-search pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-gray-5"
              aria-hidden="true"
            />
            <input
              ref="field"
              v-model="query"
              type="text"
              inputmode="search"
              enterkeyhint="go"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              class="h-12 w-full rounded-full border-0 bg-surface-gray-2 pl-12 text-base text-ink-gray-9 placeholder-ink-gray-5 focus:bg-surface-gray-3 focus:ring-2 focus:ring-outline-gray-3"
              :class="canCamera ? 'pr-14' : 'pr-4'"
              :placeholder="
                __('Scan or type a code or name', null, 'Recepción')
              "
              :aria-label="__('Scan or type a code or name', null, 'Recepción')"
              data-recepcion-campo
            />
            <button
              v-if="canCamera"
              type="button"
              class="press absolute right-1 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-ink-gray-8 hover:bg-surface-gray-3"
              :aria-label="__('Scan with the camera', null, 'Recepción')"
              :title="__('Scan with the camera', null, 'Recepción')"
              @click="camera = true"
            >
              <span class="lucide-camera size-5" aria-hidden="true" />
            </button>
          </form>

          <div
            role="status"
            aria-live="polite"
            class="empty:hidden"
            data-recepcion-aviso
          >
            <p
              v-if="notice"
              class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-6 px-3 py-2 text-base"
              :class="NOTICE[notice.tone] || NOTICE.neutral"
            >
              <span class="min-w-0 flex-1">{{ notice.text }}</span>
              <a
                v-if="notice.escaner"
                :href="escanerHref"
                class="font-medium underline"
                >{{ __('Open in Escáner', null, 'Recepción') }}</a
              >
            </p>
          </div>

          <ul class="flex flex-col gap-2" data-recepcion-lineas>
            <li
              v-for="{ line, state } in shown"
              :key="line.row"
              :data-row="line.row"
              class="rounded-7 border px-3 py-2.5 transition-colors duration-300 motion-reduce:transition-none"
              :class="
                flash === line.row
                  ? 'border-transparent bg-surface-green-2'
                  : 'border-outline-gray-1 bg-surface-base'
              "
              data-recepcion-linea
            >
              <p
                class="line-clamp-2 break-words text-base leading-snug text-ink-gray-9"
              >
                {{ line.item_name || line.item_code }}
              </p>
              <div class="flex items-center gap-2 pt-1.5">
                <p
                  class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1"
                >
                  <StatusChip :label="state.text" :tone="state.tone" />
                  <span
                    v-if="owed(line) !== null"
                    class="num text-sm text-ink-gray-6"
                    >{{
                      __(
                        '{0} of {1}',
                        [qty(line.qty), formatQty(owed(line), line.uom)],
                        'Recepción',
                      )
                    }}</span
                  >
                </p>
                <div
                  v-if="draft"
                  class="flex flex-none items-center rounded-full bg-surface-gray-2"
                  role="group"
                  :aria-label="
                    __(
                      'Quantity of {0}',
                      [line.item_name || line.item_code],
                      'Recepción',
                    )
                  "
                >
                  <button
                    type="button"
                    class="press flex size-11 items-center justify-center rounded-full text-ink-gray-8 hover:bg-surface-gray-3"
                    :aria-label="__('One less', null, 'Recepción')"
                    @click="bump(line, -1)"
                  >
                    <span class="lucide-minus size-4" aria-hidden="true" />
                  </button>
                  <input
                    :value="qty(line.qty)"
                    type="text"
                    inputmode="decimal"
                    class="num h-11 w-12 border-0 bg-transparent p-0 text-center text-base font-medium text-ink-gray-9 focus:ring-0"
                    :aria-label="
                      __(
                        'Received of {0}',
                        [line.item_name || line.item_code],
                        'Recepción',
                      )
                    "
                    @focus="$event.target.select()"
                    @change="typeQty(line, $event)"
                    @keydown.enter.prevent="$event.target.blur()"
                  />
                  <button
                    type="button"
                    class="press flex size-11 items-center justify-center rounded-full text-ink-gray-8 hover:bg-surface-gray-3"
                    :aria-label="__('One more', null, 'Recepción')"
                    @click="bump(line, 1)"
                  >
                    <span class="lucide-plus size-4" aria-hidden="true" />
                  </button>
                </div>
                <span v-else class="num flex-none text-base text-ink-gray-9">{{
                  formatQty(line.qty, line.uom)
                }}</span>
              </div>
            </li>
          </ul>
          <p
            v-if="query && !shown.length"
            class="px-1 py-2 text-base text-ink-gray-6"
          >
            {{
              __(
                'No line matches «{0}». Press Enter to look it up as a code.',
                [query],
                'Recepción',
              )
            }}
          </p>
          <EmptyState
            v-if="!lines.length && !query"
            :title="__('Nothing counted yet', null, 'Recepción')"
            :message="emptyReason"
          />
        </section>
      </div>
    </div>

    <BottomSheet
      v-if="confirmMounted"
      v-model:open="confirmOpen"
      :title="__('Confirm receipt', null, 'Recepción')"
    >
      <div class="flex flex-col gap-2 text-base text-ink-gray-8">
        <p>
          {{
            __(
              '{0} pieces go into stock. The stock changes as soon as you confirm.',
              [qty(count.counted)],
              'Recepción',
            )
          }}
        </p>
        <p v-if="count.missing" class="text-ink-gray-7">
          {{
            __(
              '{0} pieces are still missing; they stay pending on the order for another delivery.',
              [qty(count.missing)],
              'Recepción',
            )
          }}
        </p>
        <p v-if="count.over" class="text-ink-amber-8">
          {{
            __(
              '{0} pieces more than ordered came in.',
              [qty(count.over)],
              'Recepción',
            )
          }}
        </p>
        <p v-if="confirmProblem" role="alert" class="text-ink-red-7">
          {{ confirmProblem }}
        </p>
      </div>
      <template #actions>
        <button
          type="button"
          :class="['press', BTN.tonal]"
          @click="confirmOpen = false"
        >
          {{ __('Keep counting', null, 'Recepción') }}
        </button>
        <button
          type="button"
          :class="['press', BTN.filled]"
          :disabled="confirming"
          data-recepcion-confirmar-final
          @click="confirm"
        >
          {{
            confirming
              ? __('Confirming…', null, 'Recepción')
              : __('Confirm receipt', null, 'Recepción')
          }}
        </button>
      </template>
    </BottomSheet>

    <!-- An item on two order rows: the worker says which one it arrived for. -->
    <BottomSheet
      v-if="ambiguous"
      :open="Boolean(ambiguous)"
      :title="__('Which line is it for?', null, 'Recepción')"
      flush
      @update:open="(open) => !open && (ambiguous = null)"
    >
      <ul class="flex flex-col px-2 pb-2">
        <li v-for="line in ambiguousLines" :key="line.row">
          <button
            type="button"
            class="press flex min-h-12 w-full items-center gap-3 rounded-8 px-3 py-2 text-left hover:bg-surface-gray-2"
            @click="pickRow(line.row)"
          >
            <span class="min-w-0 flex-1 text-base text-ink-gray-9">{{
              line.item_name || line.item_code
            }}</span>
            <span class="num text-sm text-ink-gray-6">{{
              __(
                '{0} of {1}',
                [qty(line.qty), qty(owed(line) ?? 0)],
                'Recepción',
              )
            }}</span>
          </button>
        </li>
      </ul>
    </BottomSheet>

    <BarcodeCamera v-if="camera" @code="onCamera" @close="camera = false" />
  </div>
</template>

<script setup>
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { claimScans } from '@/components/escaneo/scanDoor'
import { AppBar, EmptyState, StatusChip, isMobile } from '@/components/ui'
import { BTN } from '@/documentos/tools'
import { formatMoney, formatQty } from '@/utils/display'
import {
  problemOf,
  requestId,
  scannerReceiptUrl,
} from '@/composables/useCompras'
import {
  confirmReceipt,
  filterLines,
  loadReceipt,
  orderedLines,
  owed,
  scanCode,
  scanOutcome,
  setLineQty,
  tally,
} from '@/composables/useRecepcion'

const BottomSheet = defineAsyncComponent(
  () => import('@/components/ui/BottomSheet.vue'),
)
const BarcodeCamera = defineAsyncComponent(
  () => import('@/components/documentos/BarcodeCamera.vue'),
)

const props = defineProps({ name: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
const phone = isMobile

const NOTICE = {
  neutral: 'bg-surface-gray-2 text-ink-gray-8',
  success: 'bg-surface-green-1 text-ink-green-8',
  warning: 'bg-surface-amber-1 text-ink-amber-9',
  error: 'bg-surface-red-1 text-ink-red-7',
}

const doc = ref(null)
const guard = ref(null)
const query = ref('')
const field = ref(null)
const notice = ref(null)
const flash = ref('')
const camera = ref(false)
const confirmOpen = ref(false)
const confirmMounted = ref(false)
const confirming = ref(false)
const confirmProblem = ref('')
const ambiguous = ref(null)
const pending = ref(0)
const syncing = computed(() => pending.value > 0)
const canCamera = typeof window !== 'undefined' && 'BarcodeDetector' in window
let flashTimer = 0

const draft = computed(() => Number(doc.value?.docstatus) === 0)
const lines = computed(() => doc.value?.lines || [])
const count = computed(() => tally(lines.value))
const shown = computed(() =>
  filterLines(orderedLines(lines.value), query.value),
)
const title = computed(
  () =>
    doc.value?.party_label ||
    doc.value?.party ||
    __('Receipt', null, 'Recepción'),
)
const order = computed(
  () =>
    lines.value.find((line) => line.purchase_order)?.purchase_order ||
    (typeof route.query.orden === 'string' ? route.query.orden : ''),
)
const list = computed(() =>
  typeof route.query.list === 'string' ? route.query.list : '',
)
const escanerHref = computed(() =>
  scannerReceiptUrl(props.name, order.value, list.value),
)
const tallyLine = computed(() => {
  const { missing, over, expected, complete } = count.value
  if (!expected) return __('pieces received', null, 'Recepción')
  // Over-received pieces are not counted toward the order; the line says so.
  if (complete && !over)
    return __('Everything on the order arrived', null, 'Recepción')
  if (complete) return __('{0} more than ordered', [qty(over)], 'Recepción')
  return __('{0} still to count', [qty(missing)], 'Recepción')
})
const emptyReason = computed(() =>
  __(
    'Scan the first piece or type its code; the order lines show up here.',
    null,
    'Recepción',
  ),
)
const ambiguousLines = computed(() =>
  lines.value.filter((line) => ambiguous.value?.rows.includes(line.row)),
)

function qty(value, uom) {
  const n = Number(value) || 0
  const text = Number.isInteger(n) ? String(n) : String(+n.toFixed(3))
  return uom ? `${text} ${uom}` : text
}
const money = (value) => formatMoney(value, doc.value?.currency || 'MXN')

function leave() {
  if (order.value)
    return router.push({
      name: 'CompraOrden',
      params: { name: order.value },
      query: list.value ? { list: list.value } : {},
    })
  router.push({ name: 'Compras' })
}

async function load() {
  guard.value = null
  try {
    doc.value = await loadReceipt(props.name)
    if (draft.value) nextTick(() => field.value?.focus({ preventScroll: true }))
  } catch (error) {
    guard.value = problemOf(error)
  }
}

// Every change reaches the server in the order it was made; the screen shows
// the worker's numbers at once and takes the server's whole receipt once
// nothing else is on its way.
let chain = Promise.resolve()
function enqueue(task) {
  pending.value += 1
  const run = chain.then(task).then((result) => {
    if (result?.lines && pending.value === 1) doc.value = result
    return result
  })
  chain = run
    .catch(() => {})
    .finally(() => {
      pending.value -= 1
    })
  return run
}

function syncProblem(error) {
  const found = problemOf(error)
  notice.value = { tone: 'error', text: `${found.title}. ${found.detail}` }
  // What is on screen may be ahead of the server: show the server's again.
  loadReceipt(props.name)
    .then((fresh) => (doc.value = fresh))
    .catch(() => {})
}

function show(row) {
  if (!row) return
  flash.value = row
  window.clearTimeout(flashTimer)
  flashTimer = window.setTimeout(() => (flash.value = ''), 900)
  nextTick(() =>
    document
      .querySelector(`[data-row="${CSS.escape(row)}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
  )
}

function lineNotice(row) {
  const line = lines.value.find((l) => l.row === row)
  if (!line) return null
  const want = owed(line)
  return {
    tone: 'success',
    text:
      want === null
        ? `${line.item_name || line.item_code}: ${qty(line.qty)}`
        : __(
            '{0}: {1} of {2}',
            [line.item_name || line.item_code, qty(line.qty), qty(want)],
            'Recepción',
          ),
  }
}

function setQty(line, value) {
  const next = Math.max(0, Math.round(value * 1000) / 1000)
  if (next === Number(line.qty)) return
  line.qty = next
  show(line.row)
  notice.value =
    next === 0
      ? {
          tone: 'neutral',
          text: __(
            '{0} is off this receipt; it stays pending on the order.',
            [line.item_name || line.item_code],
            'Recepción',
          ),
        }
      : lineNotice(line.row)
  enqueue(() => setLineQty(props.name, line.row, next)).catch(syncProblem)
}

function bump(line, delta) {
  setQty(line, (Number(line.qty) || 0) + delta)
}

function typeQty(line, event) {
  const value = Number(String(event.target.value).replace(',', '.'))
  if (!Number.isFinite(value) || value < 0) {
    event.target.value = qty(line.qty)
    return
  }
  setQty(line, value)
}

async function send(code, { row = null, uuid = requestId() } = {}) {
  notice.value = {
    tone: 'neutral',
    text: __('Looking up «{0}»…', [code], 'Recepción'),
  }
  let result
  try {
    result = await enqueue(() => scanCode(props.name, code, { row, uuid }))
  } catch (error) {
    return syncProblem(error)
  }
  const outcome = scanOutcome(result, code)
  if (outcome.kind === 'applied') {
    notice.value = lineNotice(outcome.row) || {
      tone: 'success',
      text: __('Counted.', null, 'Recepción'),
    }
    return show(outcome.row)
  }
  if (outcome.kind === 'ambiguous') {
    ambiguous.value = { code, uuid, rows: outcome.rows }
    notice.value = null
    return
  }
  if (outcome.kind === 'unknown') {
    // Not a code: a name the worker typed that names exactly one line.
    const named = filterLines(orderedLines(lines.value), code)
    if (named.length === 1) {
      bump(named[0].line, 1)
      return
    }
  }
  notice.value = {
    tone: 'warning',
    text: outcome.text || __('Nothing was counted.', null, 'Recepción'),
    escaner: outcome.escaner,
  }
}

function submitField() {
  const code = query.value.trim()
  if (!code) return
  query.value = ''
  send(code)
  field.value?.focus({ preventScroll: true })
}

function pickRow(row) {
  const { code, uuid } = ambiguous.value
  ambiguous.value = null
  send(code, { row, uuid })
}

function onCamera(code) {
  camera.value = false
  if (code) send(String(code))
}

// The shell's «Escanear» counts here too: a code read from the bar goes
// against this receipt like one typed in the field.
claimScans((code) => send(String(code)))

watch(confirmOpen, (open) => {
  if (open) {
    confirmMounted.value = true
    confirmProblem.value = ''
  }
})

async function confirm() {
  if (confirming.value) return
  confirming.value = true
  confirmProblem.value = ''
  try {
    // What is still on its way goes first, so the confirmed numbers are these.
    await chain
    await confirmReceipt(props.name)
    confirmOpen.value = false
    if (!order.value) return router.push({ name: 'Compras' })
    router.push({
      name: 'CompraOrden',
      params: { name: order.value },
      query: {
        done: `Purchase Receipt:${props.name}`,
        ...(list.value ? { list: list.value } : {}),
      },
    })
  } catch (error) {
    const found = problemOf(error)
    confirmProblem.value = `${found.title}. ${found.detail}`
  } finally {
    confirming.value = false
  }
}

watch(
  () => props.name,
  () => {
    doc.value = null
    load()
  },
  { immediate: true },
)
onBeforeUnmount(() => window.clearTimeout(flashTimer))
</script>
