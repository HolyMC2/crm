<!--
  Ventas · the one commercial documents panel. Every host renders this same
  component: the deal record (DealCommercialDocs: Deal 360 Resumen, Inbox
  context, legacy vertical slot) and the Contactos ficha (ContactCommercialDocs).
  Hosts only load data and run calls; this panel owns the list, smart counters,
  next actions, blocked-state recovery and the in-app viewer. Quote → order →
  invoice go through the native controllers (doco deal_chain); collection and
  returns open POS with return_to. One primary next action per document.
-->
<template>
  <section
    ref="rootEl"
    class="flex min-w-0 flex-col gap-3"
    :class="compact ? 'border-b border-outline-gray-1 p-3.5' : 'p-3 md:p-6'"
    :aria-label="__('Sales documents')"
    data-testid="commercial-docs"
  >
    <header class="flex items-center justify-between gap-2">
      <h3 class="text-sm font-semibold text-ink-gray-9">
        {{ __('Sales documents') }}
      </h3>
      <Button
        variant="ghost"
        icon="refresh-cw"
        class="min-h-11 min-w-11 sm:min-h-7 sm:min-w-7"
        :aria-label="__('Refresh documents')"
        :loading="loading"
        @click="source.reload()"
      />
    </header>

    <p
      v-if="notice"
      role="status"
      class="rounded-lg border border-outline-gray-2 p-3 text-sm text-ink-gray-7"
    >
      {{ notice }}
    </p>
    <div
      v-else-if="loading && !model"
      class="py-2 text-sm text-ink-gray-5"
      role="status"
    >
      {{ __('Loading documents…') }}
    </div>
    <div
      v-else-if="error && !model"
      role="alert"
      class="rounded-lg border border-outline-red-2 p-3 text-sm text-ink-red-7"
    >
      <p>{{ error }}</p>
      <Button
        class="mt-2"
        :label="__('Try loading again')"
        @click="source.reload()"
      />
    </div>

    <template v-else-if="model">
      <!-- smart counters (Odoo smart buttons): jump to the group -->
      <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <button
          v-for="c in model.counters"
          :key="c.key"
          type="button"
          class="flex min-h-11 flex-col items-start rounded-lg px-2.5 py-1.5 text-left hover:bg-surface-gray-3"
          :class="
            c.key === 'outstanding' && c.amount > 0
              ? 'bg-surface-red-1'
              : 'bg-surface-gray-2'
          "
          @click="jump(c.key)"
        >
          <span class="text-xs text-ink-gray-6">{{ c.label }}</span>
          <span
            class="text-sm font-semibold tabular-nums"
            :class="
              c.key === 'outstanding' && c.amount > 0
                ? 'text-ink-red-8'
                : 'text-ink-gray-9'
            "
            >{{
              c.key === 'outstanding'
                ? c.amount == null
                  ? __('Several currencies')
                  : money(c.amount, c.currency)
                : c.count
            }}</span
          >
        </button>
      </div>
      <div
        v-if="model.rollup && Number(model.rollup.invoiced) > 0"
        class="h-1 overflow-hidden rounded-full bg-surface-gray-3"
        :title="__('Paid of invoiced')"
      >
        <div
          class="h-full rounded-full bg-surface-green-7"
          :style="{ width: paidPct + '%' }"
        />
      </div>

      <div v-if="model.empty" class="py-1 text-sm text-ink-gray-6">
        <p>{{ __('No sales documents yet.') }}</p>
        <Button
          v-if="scope === 'deal' && canQuote"
          class="mt-2 min-h-11 sm:min-h-7"
          variant="solid"
          :label="__('Add items to quote')"
          @click="$emit('start-quote')"
        />
      </div>

      <div
        v-for="g in model.groups"
        :id="anchor(g.key)"
        :key="g.key"
        class="flex flex-col gap-1.5"
      >
        <div class="flex items-baseline justify-between gap-2">
          <h4 class="text-xs font-semibold uppercase text-ink-gray-6">
            {{ g.label }} ·
            {{ g.truncated ? g.truncated.total : g.rows.length }}
          </h4>
          <span
            v-if="g.truncated?.is_truncated"
            class="text-xs text-ink-gray-6"
          >
            {{
              __('Showing the latest {0} of {1}', [
                g.truncated.shown,
                g.truncated.total,
              ])
            }}
          </span>
        </div>
        <ul
          class="divide-y divide-outline-gray-1 overflow-hidden rounded-lg border border-outline-gray-2"
        >
          <li
            v-for="row in g.rows"
            :key="rowKey(row)"
            class="flex flex-col gap-1.5 px-2.5 py-2"
            :class="focusKey === rowKey(row) ? 'bg-surface-gray-2' : ''"
            :data-doc="rowKey(row)"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="truncate text-sm font-medium text-ink-gray-9">{{
                    row.name
                  }}</span>
                  <span
                    v-if="row.doctype === 'POS Invoice'"
                    class="rounded bg-surface-gray-3 px-1 text-xs text-ink-gray-6"
                    >{{ __('POS') }}</span
                  >
                </div>
                <div class="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <Badge
                    :label="statusLabel(row)"
                    :theme="statusTheme(row)"
                    size="sm"
                  />
                  <span class="text-xs text-ink-gray-6">{{
                    formatDay(row.date)
                  }}</span>
                  <span v-if="row.modeOfPayment" class="text-xs text-ink-gray-6"
                    >· {{ row.modeOfPayment }}</span
                  >
                </div>
              </div>
              <div class="flex flex-none flex-col items-end">
                <span
                  class="text-sm font-semibold tabular-nums text-ink-gray-8"
                  >{{ money(row.amount, row.currency) }}</span
                >
                <span
                  v-if="row.docstatus === 1 && row.outstanding > 0"
                  class="text-xs font-semibold tabular-nums text-ink-red-7"
                  >{{
                    __('Due {0}', [money(row.outstanding, row.currency)])
                  }}</span
                >
              </div>
            </div>

            <div
              v-if="actionsFor(row).primary || actionsFor(row).secondary.length"
              class="flex flex-wrap items-center gap-1.5"
            >
              <Button
                v-if="actionsFor(row).primary"
                variant="solid"
                class="min-h-11 sm:min-h-7"
                :label="actionsFor(row).primary.label"
                :disabled="actionsFor(row).primary.disabled"
                :loading="busyKey === rowKey(row)"
                @click="run(row, actionsFor(row).primary)"
              />
              <Button
                v-for="a in actionsFor(row).secondary"
                :key="a.key"
                variant="subtle"
                class="min-h-11 sm:min-h-7"
                :label="a.label"
                :disabled="busyKey === rowKey(row)"
                @click="run(row, a)"
              />
            </div>
            <!-- a blocked action explains itself and offers the way forward -->
            <p
              v-if="actionsFor(row).primary?.disabled"
              class="text-xs text-ink-gray-6"
            >
              {{ actionsFor(row).primary.reason }}
              <button
                type="button"
                class="ml-1 min-h-11 font-medium text-ink-gray-8 underline sm:min-h-0"
                @click="resolve(row, actionsFor(row).primary)"
              >
                {{ actionsFor(row).primary.resolve.label }}
              </button>
            </p>
            <p
              v-else-if="actionsFor(row).primary?.blocked"
              class="text-xs text-ink-gray-6"
            >
              {{ actionsFor(row).primary.blocked }}
            </p>
            <!-- register hand-off: say what to pick there before leaving -->
            <div
              v-if="assisting === rowKey(row)"
              role="status"
              class="rounded-md border border-outline-gray-2 p-2 text-xs text-ink-gray-7"
            >
              <p>{{ actionsFor(row).primary?.assist }}</p>
              <div class="mt-1.5 flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="solid"
                  class="min-h-11 sm:min-h-7"
                  :label="__('Copy invoice number and open the register')"
                  @click="handOff(row, actionsFor(row).primary)"
                />
                <Button
                  size="sm"
                  class="min-h-11 sm:min-h-7"
                  :label="__('Cancel')"
                  @click="assisting = ''"
                />
              </div>
            </div>
            <!-- an action that records why (resume an order) asks first -->
            <form
              v-if="asking.key === rowKey(row)"
              class="flex flex-col gap-1.5 rounded-md border border-outline-gray-2 p-2"
              @submit.prevent="confirmAsked(row)"
            >
              <label
                class="text-xs text-ink-gray-7"
                :for="`reason-${rowKey(row)}`"
              >
                {{
                  __("Why does it continue? It stays on the order's timeline.")
                }}
              </label>
              <input
                :id="`reason-${rowKey(row)}`"
                v-model="asking.text"
                data-testid="action-reason"
                maxlength="500"
                class="min-h-11 rounded border border-outline-gray-2 bg-surface-white px-2 text-sm sm:min-h-7"
              />
              <div class="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="solid"
                  class="min-h-11 sm:min-h-7"
                  :label="__('Resume')"
                  :loading="busyKey === rowKey(row)"
                  @click="confirmAsked(row)"
                />
                <Button
                  size="sm"
                  class="min-h-11 sm:min-h-7"
                  :label="__('Cancel')"
                  @click="asking.key = ''"
                />
              </div>
            </form>
            <div
              v-if="rowErrors[rowKey(row)]"
              role="alert"
              class="rounded-md border border-outline-red-2 p-2 text-xs text-ink-red-7"
            >
              <p class="font-medium">{{ rowErrors[rowKey(row)].title }}</p>
              <p v-if="rowErrors[rowKey(row)].detail" class="mt-0.5">
                {{ rowErrors[rowKey(row)].detail }}
              </p>
              <div class="mt-1.5 flex flex-wrap gap-1.5">
                <Button
                  v-for="fix in rowErrors[rowKey(row)].fixes"
                  :key="fix.key"
                  size="sm"
                  class="min-h-11 sm:min-h-7"
                  :label="fix.label"
                  @click="applyFix(row, fix)"
                />
              </div>
            </div>
            <span v-if="copied === rowKey(row)" role="status" class="text-xs">
              {{ __('Copied') }}
            </span>
            <slot
              v-if="editing === rowKey(row)"
              name="editor"
              :row="row"
              :close="closeEditor"
            />
          </li>
        </ul>
      </div>
    </template>

    <!-- in-app document viewer (sandboxed print fragment; no scripts) -->
    <Dialog v-model="viewer.open" :options="{ size: '4xl' }">
      <template #body>
        <div
          class="flex items-center justify-between gap-2 border-b border-outline-gray-1 px-4 py-3"
        >
          <h3 class="truncate text-base font-semibold text-ink-gray-9">
            {{ viewer.name }}
          </h3>
          <div class="flex items-center gap-2">
            <Button
              v-if="viewer.html"
              :label="__('Print')"
              class="min-h-11 sm:min-h-7"
              @click="printDoc"
            />
            <Button
              variant="ghost"
              icon="x"
              class="min-h-11 min-w-11 sm:min-h-7 sm:min-w-7"
              :aria-label="__('Close')"
              @click="viewer.open = false"
            />
          </div>
        </div>
        <div class="h-[70vh] bg-surface-gray-1">
          <p
            v-if="viewer.loading"
            class="py-10 text-center text-sm text-ink-gray-6"
          >
            {{ __('Loading document…') }}
          </p>
          <div
            v-else-if="viewer.error"
            role="alert"
            class="flex flex-col items-center gap-2 py-10 text-sm text-ink-red-7"
          >
            <p>{{ viewer.error }}</p>
            <Button
              :label="__('Try loading again')"
              @click="openViewer(viewer.row)"
            />
          </div>
          <iframe
            v-else-if="viewer.html"
            ref="frame"
            :title="viewer.name"
            :srcdoc="viewer.html"
            sandbox="allow-same-origin allow-modals allow-popups"
            class="h-full w-full border-0 bg-white"
          />
        </div>
      </template>
    </Dialog>
  </section>
</template>

<script setup>
import { computed, nextTick, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Badge, Button, Dialog, toast } from 'frappe-ui'
import { formatMoney } from '@/composables/crmFormat'
import { useReloadOnReturn } from '@/composables/reloadOnReturn'
import { formatDay } from '@/utils/contactos'
import {
  accessRequestText,
  nextActions,
  paidPercent,
  statusLabel,
  statusTheme,
} from '@/utils/ventasDocs'

const props = defineProps({
  scope: { type: String, required: true }, // 'deal' | 'contact'
  // normalizeCommercialDocs() output, or null while loading
  model: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  notice: { type: String, default: '' },
  // the deal or contact this panel shows, for access requests and returns
  scopeLabel: { type: String, default: '' },
  returnLabel: { type: String, default: '' },
  compact: { type: Boolean, default: false },
  // Inbox / Deal 360: a payment link can be drafted into the conversation
  paymentLink: { type: Boolean, default: false },
  // { reload(), act(method, row, requestId, extra) → result, render(row) → {html} }
  source: { type: Object, required: true },
})
defineEmits(['start-quote'])

const route = useRoute()
const caps = computed(() => props.model?.capabilities || {})
const canQuote = computed(() => Boolean(caps.value.can_write))
const paidPct = computed(() => paidPercent(props.model?.rollup))

// POS / Taller hand-offs come back to this page: refresh what they changed.
useReloadOnReturn(() => props.source.reload())

// ── actions ──────────────────────────────────────────────────────────────────
const rootEl = ref(null)
const editing = ref('')
const busyKey = ref('')
const focusKey = ref('')
const copied = ref('')
const rowErrors = reactive({})
const requestIds = {}
const assisting = ref('')
const asking = reactive({ key: '', action: null, text: '' })

const returnTo = computed(() => `/crm${route.fullPath}`)
function actionsFor(row) {
  return nextActions(row, {
    scope: props.scope,
    caps: props.scope === 'deal' ? caps.value : {},
    paymentLink: props.paymentLink,
    returnTo: returnTo.value,
    returnLabel: props.returnLabel || props.scopeLabel,
  })
}
const rowKey = (row) => `${row.doctype}:${row.name}`
const anchor = (key) => `ventas-docs-${key}`
const money = (value, currency) =>
  formatMoney(value, currency || props.model?.rollup?.currency)

function jump(key) {
  const group = key === 'outstanding' ? 'invoices' : key
  rootEl.value
    ?.querySelector(`#${anchor(group)}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
function closeEditor() {
  editing.value = ''
}

// One id per (document, action) until it succeeds, so «Try again» replays
// instead of acting twice.
function requestId(row, action) {
  const key = `${rowKey(row)}:${action.key}`
  requestIds[key] ||=
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  return requestIds[key]
}

function successMessage(action, out) {
  if (action.method === 'accept_quotation')
    return out.already_existed
      ? __('Order {0} already existed.', [out.sales_order])
      : __('Order {0} created as a draft. Confirm it next.', [out.sales_order])
  if (action.method === 'confirm_sales_order')
    return __('Order {0} confirmed. Next: create the invoice.', [
      out.sales_order,
    ])
  if (action.method === 'make_invoice')
    return __('Draft invoice {0} ready. Review and issue it.', [out.name])
  if (action.method === 'issue_invoice')
    return __('Invoice {0} issued.', [out.sales_invoice])
  if (action.method === 'payment_link')
    return __('Payment link ready in the message box. Edit it and send it.')
  if (action.method === 'reopen_sales_order')
    return __('Order {0} resumed. Next: create the invoice.', [out.sales_order])
  return ''
}
function createdKey(action, out) {
  if (action.method === 'accept_quotation')
    return `Sales Order:${out.sales_order}`
  if (action.method === 'make_invoice') return `Sales Invoice:${out.name}`
  return ''
}

function explain(error, action) {
  const exc = String(error?.exc_type || '')
  const detail = (error?.messages || []).join(' ') || error?.message || ''
  if (exc === 'TimestampMismatchError' || error?.status === 409)
    return {
      title: __('This document changed. Review the current version.'),
      detail,
      fixes: [{ key: 'reload', label: __('See current version') }],
    }
  if (exc === 'PermissionError' || error?.status === 403)
    return {
      title: __('Your role cannot do this.'),
      detail,
      fixes: [
        { key: 'copy_request', label: __('Copy access request'), action },
        { key: 'retry', label: __('Check again'), action },
      ],
    }
  if (globalThis.navigator?.onLine === false || /network|fetch/i.test(detail))
    return {
      title: __('No connection. Nothing was changed.'),
      detail: '',
      fixes: [{ key: 'retry', label: __('Try again'), action }],
    }
  // A native validation (delivery date, credit limit, CFDI data…): the guard
  // stays; the worker opens the document to fix it, or asks whoever can, and
  // then retries on the current version.
  return {
    title: __('ERPNext stopped this step.'),
    detail,
    fixes: [
      { key: 'view', label: __('View document') },
      {
        key: 'correct',
        label: CORRECT_LABELS[action.method] || __('Correct the document'),
      },
      { key: 'copy_correction', label: __('Ask for the correction'), detail },
      { key: 'retry_current', label: __('Corrected: try again'), action },
    ],
  }
}
const CORRECT_LABELS = {
  confirm_sales_order: __('Correct the order'),
  make_invoice: __('Correct the order'),
  reopen_sales_order: __('Correct the order'),
  issue_invoice: __('Correct the invoice'),
  accept_quotation: __('Correct the quotation'),
}
const deskHref = (row) =>
  `/app/${row.doctype.toLowerCase().replace(/ /g, '-')}/${encodeURIComponent(row.name)}`
function currentRow(row) {
  for (const group of props.model?.groups || [])
    for (const candidate of group.rows)
      if (rowKey(candidate) === rowKey(row)) return candidate
  return null
}

async function run(row, action) {
  if (action.disabled) return resolve(row, action)
  if (action.kind === 'view') return openViewer(row)
  if (action.kind === 'editor') {
    editing.value = editing.value === rowKey(row) ? '' : rowKey(row)
    return
  }
  if (action.kind === 'route') {
    if (action.href) window.location.assign(action.href)
    return
  }
  if (action.kind === 'handoff') {
    assisting.value = assisting.value === rowKey(row) ? '' : rowKey(row)
    return
  }
  if (action.reason) {
    Object.assign(asking, { key: rowKey(row), action, text: '' })
    return
  }
  return call(row, action)
}

async function call(row, action, extra) {
  if (busyKey.value) return
  const key = rowKey(row)
  busyKey.value = key
  delete rowErrors[key]
  try {
    const out =
      (await props.source.act(
        action.method,
        row,
        requestId(row, action),
        extra,
      )) || {}
    delete requestIds[`${key}:${action.key}`]
    const message = successMessage(action, out)
    if (message) toast.success(message)
    focusKey.value = createdKey(action, out) || key
    if (action.method !== 'payment_link') props.source.reload()
  } catch (error) {
    rowErrors[key] = explain(error, action)
  } finally {
    busyKey.value = ''
  }
}

async function copy(text, row) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = rowKey(row)
    setTimeout(() => (copied.value = ''), 2000)
  } catch {
    // no clipboard (http, denied): show the text so it can be copied by hand
    toast.info(text)
  }
}
async function handOff(row, action) {
  await copy(row.name, row)
  assisting.value = ''
  window.location.assign(action.href)
}
function confirmAsked(row) {
  const { action, text } = asking
  asking.key = ''
  return call(row, action, { reason: text.trim() })
}
async function retryCurrent(row, action) {
  delete rowErrors[rowKey(row)]
  await props.source.reload()
  await nextTick()
  const fresh = currentRow(row) || row
  // the document may have moved on meanwhile (someone else confirmed it)
  if (actionsFor(fresh).primary?.key === action.key) return run(fresh, action)
}
function resolve(row, action) {
  if (action.resolve?.key === 'copy_folio') return copy(row.name, row)
  return copy(accessRequestText(action, row, props.scopeLabel), row)
}
function applyFix(row, fix) {
  if (fix.key === 'reload') {
    delete rowErrors[rowKey(row)]
    return props.source.reload()
  }
  if (fix.key === 'view') return openViewer(row)
  if (fix.key === 'copy_request')
    return copy(accessRequestText(fix.action, row, props.scopeLabel), row)
  if (fix.key === 'retry') return run(row, fix.action)
  if (fix.key === 'retry_current') return retryCurrent(row, fix.action)
  if (fix.key === 'correct')
    return window.open(deskHref(row), '_blank', 'noopener')
  if (fix.key === 'copy_correction')
    return copy(
      __(
        'Please correct {0} {1} so I can continue in Ventas. ERPNext says: {2} Record: {3}.',
        [__(row.doctype), row.name, fix.detail || '—', props.scopeLabel || '—'],
      ),
      row,
    )
}

// ── in-app viewer ────────────────────────────────────────────────────────────
const frame = ref(null)
const viewer = reactive({
  open: false,
  row: null,
  name: '',
  html: '',
  loading: false,
  error: '',
})
async function openViewer(row) {
  Object.assign(viewer, {
    open: true,
    row,
    name: row.name,
    html: '',
    loading: true,
    error: '',
  })
  try {
    const out = await props.source.render(row)
    viewer.html = out?.html || ''
    if (!viewer.html) viewer.error = __('This document could not be shown.')
  } catch (error) {
    viewer.error =
      error?.messages?.[0] || __('This document could not be shown.')
  } finally {
    viewer.loading = false
  }
}
function printDoc() {
  try {
    frame.value?.contentWindow?.print()
  } catch {
    toast.error(__('Printing is blocked here. Open the print dialog again.'))
  }
}

defineExpose({ rootEl })
</script>
