<template>
  <!-- One store's minimum («Mínimos por tienda», Shell SPEC §6 DD9): ERPNext's
       reorder level and reorder quantity for the store, with what they do in
       words. Who keeps the catalog changes them here (only this store's row
       is sent; «Quitar mínimo» asks first); everyone else reads who sets them
       and may ask for the change. -->
  <BottomSheet v-model:open="open" :title="storeName" :dismissible="!saving">
    <div
      class="pt-1"
      :data-minimo-mode="canEdit ? 'edit' : 'read'"
      data-minimo-sheet
    >
      <template v-if="!canEdit">
        <p class="text-base tabular-nums text-ink-gray-8" data-minimo-line>
          {{ minimumLine(store) }}
        </p>
        <p
          v-if="otherLine"
          class="mt-1 text-sm text-ink-gray-6"
          data-minimo-other-rules
        >
          {{ otherLine }}
        </p>
        <p class="mt-2 text-sm text-ink-gray-6" data-minimo-readonly>
          {{
            __('The minimum is set by whoever keeps the catalog.', null, CTX)
          }}
        </p>
      </template>
      <div
        v-else-if="confirming"
        role="group"
        :aria-labelledby="confirmId"
        data-minimo-confirm
      >
        <p :id="confirmId" class="text-base-medium text-ink-gray-9">
          {{ confirmLine }}
        </p>
        <p
          v-if="store?.watch"
          class="mt-1 text-sm text-ink-gray-7"
          data-minimo-paused
        >
          {{ pausedLine }}
        </p>
      </div>
      <template v-else>
        <p class="text-base text-ink-gray-8" data-minimo-story>{{ story }}</p>
        <p
          v-if="watchLine"
          class="mt-1 text-sm text-ink-gray-6"
          data-minimo-watch
        >
          {{ watchLine }}
        </p>
        <p
          v-if="otherLine"
          class="mt-1 text-sm text-ink-gray-6"
          data-minimo-other-rules
        >
          {{ otherLine }}
        </p>
        <div class="mt-4 grid grid-cols-2 gap-3">
          <FormControl
            v-model="level"
            type="text"
            inputmode="decimal"
            placeholder="0"
            class="min-w-0 [&_input]:min-h-11 sm:[&_input]:min-h-7"
            :label="__('Minimum', null, CTX)"
            :error="problems.level || ''"
            :disabled="saving"
            data-minimo-level
          />
          <FormControl
            v-model="amount"
            type="text"
            inputmode="decimal"
            class="min-w-0 [&_input]:min-h-11 sm:[&_input]:min-h-7"
            :placeholder="orderPlaceholder"
            :label="__('Order', null, CTX)"
            :error="problems.qty || ''"
            :disabled="saving"
            data-minimo-qty
          />
        </div>
        <p class="mt-2 text-sm text-ink-gray-6" data-minimo-hint>
          {{
            __(
              'What you put in Order is the least each order is for; if more is missing to reach the minimum, what is missing gets ordered.',
              null,
              CTX,
            )
          }}
        </p>
      </template>
      <p
        v-if="error"
        role="alert"
        class="mt-3 text-sm text-ink-red-7"
        data-minimo-error
      >
        <span
          v-if="errorTitle"
          class="block font-medium"
          data-minimo-error-title
          >{{ errorTitle }}</span
        >
        {{ error }}
      </p>
    </div>
    <template v-if="canEdit || requestLabel" #actions>
      <template v-if="!canEdit">
        <Button
          class="min-h-12 w-full"
          :label="requestLabel"
          data-minimo-request
          @click="request"
        />
      </template>
      <template v-else-if="confirming">
        <Button
          variant="solid"
          theme="red"
          class="min-h-11 w-full"
          :label="__('Remove minimum', null, CTX)"
          :loading="saving"
          data-minimo-clear-confirm
          @click="clear"
        />
        <Button
          ref="cancelButton"
          class="min-h-12 w-full"
          :label="__('Cancel')"
          :disabled="saving"
          data-minimo-cancel
          @click="confirming = false"
        />
      </template>
      <template v-else>
        <Button
          v-if="hasMinimum"
          variant="subtle"
          theme="red"
          class="min-h-11 w-full"
          :label="__('Remove minimum', null, CTX)"
          :disabled="saving"
          data-minimo-clear
          @click="askClear"
        />
        <Button
          variant="solid"
          class="min-h-12 w-full"
          :label="__('Save', null, CTX)"
          :disabled="!ready"
          :loading="saving"
          data-minimo-save
          @click="save"
        />
      </template>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { Button, FormControl, toast } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import {
  CTX,
  minimumChange,
  minimumLine,
  minimumProblems,
  otherRules,
  otherRulesLine,
  outcomeUnknown,
  problemOf,
  productosApi,
  qty,
  reorderNumber,
  reorderPayload,
  reorderText,
  requestId,
} from '@/composables/useProductos'

const open = defineModel('open', { type: Boolean, default: false })
const props = defineProps({
  /** The item code the minimum belongs to. */
  item: { type: String, required: true },
  /** The store from the record's `reorder.stores`: { warehouse, label,
   *  actual_qty, reorder_level, reorder_qty, suggested_qty, state, watch,
   *  other_rows }. */
  store: { type: Object, required: true },
  /** The item's `modified` the record was read at; a stale one is refused. */
  modified: { type: String, default: '' },
  /** The worker keeps the catalog (Item write): the editor, else read-only. */
  canEdit: { type: Boolean, default: false },
  /** Read-only: the label of «Pedir cambio» when the worker may ask for it. */
  requestLabel: { type: String, default: '' },
})
// saved (the `save_reorder` answer: { item, modified, reorder }): the page
// shows it and reloads. refresh: a refusal; the page reloads the record so
// a retry carries the item's new `modified`. request (store): «Pedir cambio».
const emit = defineEmits(['saved', 'refresh', 'request'])

const confirmId = `minimo-confirm-${Math.random().toString(36).slice(2, 8)}`
const level = ref('')
const amount = ref('')
const saving = ref(false)
// A failure: Doco's words, under a title when the outcome is not known.
const error = ref('')
const errorTitle = ref('')
const confirming = ref(false)
const cancelButton = ref(null)
// The texts the inputs started from: Doco's values when the sheet opened, or
// the ones a reload brought. A reload replaces a field only while it still
// shows them, so what the worker typed stays.
let started = { level: '', qty: '' }
let rid = null
let sentKey = ''

const storeName = computed(
  () => props.store?.label || props.store?.warehouse || '',
)
function start() {
  level.value = reorderText(props.store?.reorder_level)
  amount.value = reorderText(props.store?.reorder_qty)
  started = { level: level.value, qty: amount.value }
  error.value = ''
  errorTitle.value = ''
  confirming.value = false
  rid = null
  sentKey = ''
}
// Immediate: the page mounts the sheet on first tap, already open.
watch(
  open,
  (value) => {
    if (value) start()
  },
  { immediate: true },
)
watch(
  () => [props.store?.reorder_level, props.store?.reorder_qty],
  ([nowLevel, nowQty]) => {
    if (!open.value) return
    const next = { level: reorderText(nowLevel), qty: reorderText(nowQty) }
    if (level.value === started.level) level.value = next.level
    if (amount.value === started.qty) amount.value = next.qty
    started = next
  },
)

const typedLevel = computed(() => reorderNumber(level.value))
const typedQty = computed(() => reorderNumber(amount.value))
const problems = computed(() =>
  minimumProblems({ level: level.value, qty: amount.value }, props.store),
)
const change = computed(() =>
  minimumChange(props.store, { level: level.value, qty: amount.value }),
)
const hasMinimum = computed(() => Number(props.store?.reorder_level) > 0)
const ready = computed(
  () => props.canEdit && !saving.value && Boolean(change.value),
)

// What the minimum does, as typed; the suggestion is Doco's (or what was
// typed in «Pedir»), never worked out here. Only the worker's own «Avísame»
// on the store warns them: without one, the sentence says how to get it.
const story = computed(() => {
  const minimum = typedLevel.value
  if (!(minimum > 0))
    return __(
      'Set a minimum so I can let you know and suggest ordering here.',
      null,
      CTX,
    )
  const values = [qty(minimum), storeName.value, orderWords()]
  if (props.store?.watch)
    return __(
      'When there are fewer than {0} in {1}, I let you know once and suggest ordering {2}.',
      values,
      CTX,
    )
  return __(
    'When there are fewer than {0} in {1}, I suggest ordering {2}. To get an alert, turn on «Alert me» in this store.',
    values,
    CTX,
  )
})
function orderWords() {
  // Doco's suggestion holds for the values it has, not for typed ones (an
  // older minimum saved without its amount to order).
  const suggested = Number(props.store?.suggested_qty)
  const asSaved =
    typedLevel.value ===
      reorderNumber(reorderText(props.store?.reorder_level)) &&
    typedQty.value === reorderNumber(reorderText(props.store?.reorder_qty))
  if (asSaved && suggested > 0) return qty(suggested)
  // A typed «Pedir» is the least that gets ordered: Doco's suggestion is that
  // or more, when more is missing to reach the minimum.
  if (typedQty.value > 0) return __('at least {0}', [qty(typedQty.value)], CTX)
  // «Pedir» still empty: it is what gets ordered, and its error says so.
  return __('what you put in Order', null, CTX)
}
const watchLine = computed(() =>
  props.store?.watch && typedLevel.value > 0
    ? __(
        'Your alert for this store follows this minimum on its own.',
        null,
        CTX,
      )
    : '',
)
const pausedLine = computed(() =>
  __('Your alert for this store is paused until you set a minimum.', null, CTX),
)
// The store's other ERPNext rules (another request type): read here, and
// «Quitar mínimo» removes them with the minimum, so its question names them.
const otherLine = computed(() => otherRulesLine(props.store))
const confirmLine = computed(() => {
  const rules = otherRules(props.store)
  return rules
    ? __(
        'Remove the minimum of {0}? These go too: {1}. I stop suggesting orders there.',
        [storeName.value, rules],
        CTX,
      )
    : __(
        'Remove the minimum of {0}? I stop suggesting orders there.',
        [storeName.value],
        CTX,
      )
})
const orderPlaceholder = computed(() =>
  Number(props.store?.suggested_qty) > 0 ? qty(props.store.suggested_qty) : '',
)

function save() {
  const row = change.value
  if (!ready.value || !row) return
  // An emptied «Mínimo» removes it: the same question as «Quitar mínimo».
  if (row.level === 0 && hasMinimum.value) return askClear()
  return send(row)
}
async function askClear() {
  error.value = ''
  errorTitle.value = ''
  confirming.value = true
  // The safe answer has the focus.
  await nextTick()
  const button = cancelButton.value?.$el || cancelButton.value
  button?.focus?.()
}
function clear() {
  return send({ warehouse: props.store.warehouse, level: 0, qty: 0 })
}

// The request id stays while the same row is sent again after an unknown
// outcome, so Doco answers with what it already did.
async function send(row) {
  const modified = props.modified || null
  const key = JSON.stringify([props.item, modified, row])
  if (!rid || key !== sentKey) rid = requestId()
  sentKey = key
  const name = storeName.value
  const watched = Boolean(props.store?.watch)
  saving.value = true
  error.value = ''
  errorTitle.value = ''
  try {
    const result = await productosApi(
      'save_reorder',
      reorderPayload({
        item: props.item,
        modified,
        rows: [row],
        requestId: rid,
      }),
    )
    rid = null
    toast.success(
      row.level > 0
        ? __('Done: the minimum of {0} is {1}.', [name, qty(row.level)], CTX)
        : [
            __('Removed the minimum of {0}.', [name], CTX),
            watched ? pausedLine.value : '',
          ]
            .filter(Boolean)
            .join(' '),
    )
    confirming.value = false
    open.value = false
    emit('saved', result)
  } catch (failure) {
    // Doco's words (a stale item, a refusal), under «No sabemos si se
    // guardó» when the answer never came; the inputs stay as typed.
    const problem = problemOf(failure)
    const unknown = outcomeUnknown(failure)
    error.value = problem.detail
    errorTitle.value = unknown ? problem.title : ''
    if (!unknown) rid = null
    emit('refresh')
  } finally {
    saving.value = false
  }
}

function request() {
  open.value = false
  emit('request', props.store)
}
</script>
