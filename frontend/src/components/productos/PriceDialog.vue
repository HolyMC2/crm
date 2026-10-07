<template>
  <Dialog v-model="open" :options="{ title: __('Change price') }">
    <template #body-content>
      <div class="space-y-4">
        <p class="text-sm text-ink-gray-7">
          {{
            __(
              'Write the new price for each list. Review old and new before confirming; the change is recorded with your name.',
            )
          }}
        </p>
        <div
          v-for="row in rows"
          :key="row.price_list"
          class="space-y-2 rounded-lg border border-outline-gray-2 p-3"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <span class="font-medium text-ink-gray-9">{{
              row.price_list
            }}</span>
            <span class="text-sm tabular-nums text-ink-gray-7">
              {{
                row.rate === null || row.rate === undefined
                  ? __('No price yet')
                  : __('Now {0} per {1}', [
                      money(row.rate, row.currency),
                      row.uom || row.stock_uom,
                    ])
              }}
            </span>
          </div>
          <p v-if="!row.can_write" class="text-sm text-ink-gray-6">
            {{
              plain(row.blocked_reason) || __('You cannot change this list.')
            }}
          </p>
          <template v-else>
            <FormControl
              v-model="drafts[row.price_list]"
              type="number"
              inputmode="decimal"
              min="0"
              step="0.01"
              :label="__('New price ({0})', [row.currency || 'MXN'])"
            />
            <p
              v-if="checks[row.price_list]?.changed"
              class="text-sm tabular-nums text-ink-gray-8"
            >
              {{
                checks[row.price_list].first
                  ? __('First price: {0}', [
                      money(drafts[row.price_list], row.currency),
                    ])
                  : __('{0} → {1} ({2}%)', [
                      money(row.rate, row.currency),
                      money(drafts[row.price_list], row.currency),
                      checks[row.price_list].percent,
                    ])
              }}
            </p>
            <label
              v-if="checks[row.price_list]?.needsAck"
              class="flex min-h-11 items-start gap-2 text-sm text-ink-amber-7"
            >
              <input
                v-model="acknowledged[row.price_list]"
                type="checkbox"
                class="mt-1"
              />
              <span>
                {{
                  row.requires_ack
                    ? __(
                        'This price also applies to the other units of the product ({0}). I reviewed them.',
                        [unitList(row)],
                      )
                    : __(
                        'This change is {0}% or more of the current price. I reviewed it.',
                        [row.warning_percent],
                      )
                }}
              </span>
            </label>
          </template>
        </div>
        <div
          v-if="problem"
          role="alert"
          class="rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          <strong>{{ problem.title }}.</strong> {{ problem.detail }}
          <div class="mt-2 flex flex-wrap gap-2">
            <Button
              v-if="problem.kind === 'conflict'"
              :label="__('Refresh and compare')"
              @click="$emit('refresh')"
            />
            <Button
              v-if="problem.kind === 'permission'"
              :label="__('Ask for a price change')"
              @click="$emit('request', proposal())"
            />
            <Button
              v-if="problem.kind === 'offline'"
              :label="__('Check result')"
              @click="save"
            />
          </div>
        </div>
      </div>
    </template>
    <template #actions>
      <div class="flex flex-wrap justify-end gap-2">
        <Button
          :label="__('Cancel', null, 'Productos')"
          @click="open = false"
        />
        <Button
          variant="solid"
          :label="__('Confirm price')"
          :loading="saving"
          :disabled="!ready"
          @click="save"
        />
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Button, Dialog, FormControl } from 'frappe-ui'
import {
  missingAcks,
  money,
  outcomeUnknown,
  plain,
  priceCheck,
  pricePayload,
  problemOf,
  productosApi,
  requestId,
} from '@/composables/useProductos'

// «Cambiar precio»: Mercado's owner path through Productos. The worker sees
// old → new per list and acknowledges large or multi-unit changes; a retry
// after a lost answer reuses the same request id.
const props = defineProps({
  item: { type: String, required: true },
  rows: { type: Array, default: () => [] },
  focus: { type: String, default: '' },
})
const emit = defineEmits(['saved', 'refresh', 'request'])
const open = defineModel({ type: Boolean, default: false })
const drafts = reactive({})
const acknowledged = reactive({})
const saving = ref(false)
const problem = ref(null)
let rid = null
let sentPayload = ''

const checks = computed(() =>
  Object.fromEntries(
    props.rows.map((row) => [
      row.price_list,
      priceCheck(row, drafts[row.price_list]),
    ]),
  ),
)
const payload = computed(() => pricePayload(props.rows, drafts, acknowledged))
const ready = computed(
  () =>
    Object.keys(payload.value.prices).length > 0 &&
    !missingAcks(props.rows, drafts, acknowledged).length,
)

function unitList(row) {
  return (row.impact || []).map((unit) => unit.uom).join(', ')
}
function proposal() {
  const list =
    props.focus || Object.keys(drafts).find((key) => drafts[key]) || ''
  return { price_list: list, proposed_rate: drafts[list] || '' }
}

watch(open, (value) => {
  if (!value) return
  problem.value = null
  rid = null
  for (const key of Object.keys(acknowledged)) delete acknowledged[key]
  for (const row of props.rows)
    if (!(row.price_list in drafts)) drafts[row.price_list] = ''
})
// The list refreshed (after «Actualizar y comparar»): keep what was written,
// ask for the acknowledgements again against the new current price.
watch(
  () => props.rows,
  () => {
    for (const key of Object.keys(acknowledged)) delete acknowledged[key]
    rid = null
  },
)

async function save() {
  const body = JSON.stringify(payload.value)
  // Same action, same id: a retry after a lost answer is not a second change.
  if (!rid || body !== sentPayload) rid = requestId()
  sentPayload = body
  saving.value = true
  problem.value = null
  try {
    const result = await productosApi('change_price', {
      request_id: rid,
      item: props.item,
      ...payload.value,
    })
    rid = null
    for (const key of Object.keys(drafts)) drafts[key] = ''
    open.value = false
    emit('saved', result)
  } catch (error) {
    problem.value = problemOf(error)
    if (!outcomeUnknown(error)) rid = null
  } finally {
    saving.value = false
  }
}
</script>
