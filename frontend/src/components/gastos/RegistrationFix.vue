<template>
  <!-- A refused background registration: what blocked it, the one fix that
       clears it (applied and registered in one step), or who can do it. -->
  <section
    role="alert"
    class="mt-3 overflow-hidden rounded-7 border border-outline-red-2 bg-surface-base"
  >
    <div class="flex gap-3 bg-surface-red-1 px-4 py-3">
      <span
        class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-red-2 text-ink-red-7"
      >
        <LucideCircleAlert class="h-4 w-4" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-base font-semibold text-ink-gray-9">{{ copy.title }}</p>
        <p class="mt-0.5 text-sm text-ink-gray-7">{{ copy.body }}</p>
      </div>
    </div>

    <div class="space-y-3 px-4 py-3">
      <!-- Closed period: pick an open day; today is offered when it is open. -->
      <div v-if="kind === 'closed_period' && canFix" class="max-w-sm">
        <label class="mb-1 block text-sm font-medium text-ink-gray-8">{{
          __('New bill date')
        }}</label>
        <DateField
          v-model="postingDate"
          mode="date"
          :label="__('New bill date')"
        />
      </div>

      <p v-if="kind === 'other' || !canFix" class="text-sm text-ink-gray-6">
        <span class="font-medium text-ink-gray-7">{{
          __('What ERPNext said:')
        }}</span>
        {{ registration.message }}
      </p>
      <p v-if="!canFix && fixable" class="text-sm text-ink-gray-7">
        {{ copy.whoCan }}
      </p>
      <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
        {{ problem }}
      </p>

      <div class="flex flex-wrap items-center gap-2">
        <Button
          v-if="fixable && canFix"
          variant="solid"
          class="min-h-11 sm:min-h-8"
          :loading="busy"
          :disabled="kind === 'closed_period' && !postingDate"
          :label="copy.fix"
          @click="applyFix"
        />
        <!-- A new tab: this one keeps the bill and «Try again» for afterwards. -->
        <Button
          v-if="kind === 'other' && desk"
          variant="solid"
          class="min-h-11 sm:min-h-8"
          :label="__('Fix it in the full form')"
          @click="openForm"
        />
        <Button
          v-if="kind === 'other'"
          class="min-h-11 sm:min-h-8"
          :label="__('Try again')"
          @click="emit('retry')"
        />
        <Button
          v-if="!canFix || kind === 'closed_period' || kind === 'other'"
          :variant="!canFix && !(kind === 'other' && desk) ? 'solid' : 'subtle'"
          class="min-h-11 sm:min-h-8"
          :label="copy.ask"
          @click="emit('ask', copy.askNote)"
        />
      </div>
    </div>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import DateField from '@/components/ui/DateField.vue'
import { problemOf } from '@/composables/useGastos'
import { fixAndRegister } from '@/composables/useBillRegistrations'
import { formatDay } from '@/utils/contactos'
import LucideCircleAlert from '~icons/lucide/circle-alert'

const props = defineProps({
  name: { type: String, required: true },
  // The bill as GastoFactura shows it: party, total, currency, modified.
  doc: { type: Object, required: true },
  // {state: 'failed', message, fix: {kind, can_fix, …}}
  registration: { type: Object, required: true },
  desk: { type: Boolean, default: false },
})
const emit = defineEmits(['retry', 'ask', 'queued'])

const busy = ref(false)
const problem = ref('')
const fix = computed(() => props.registration.fix || { kind: 'other' })
const kind = computed(() => fix.value.kind || 'other')
const fixable = computed(() =>
  ['supplier_disabled', 'closed_period'].includes(kind.value),
)
const canFix = computed(() => fixable.value && !!fix.value.can_fix)
const postingDate = ref('')
watch(
  () => fix.value.suggested_date,
  (date) => (postingDate.value = date || ''),
  { immediate: true },
)

const copy = computed(() => {
  const supplier = fix.value.supplier_name || props.doc.party || ''
  const message = props.registration.message || ''
  if (kind.value === 'supplier_disabled')
    return {
      title: __('The supplier {0} is deactivated', [supplier]),
      body: __(
        'ERPNext does not register bills from a deactivated supplier. Activate it and this bill registers right away.',
      ),
      fix: __('Activate supplier and register'),
      whoCan: __('Activating a supplier is for whoever manages suppliers.'),
      ask: __('Ask someone to activate it'),
      askNote: __(
        'Please activate the supplier {0} so this bill can be registered.',
        [supplier],
      ),
    }
  if (kind.value === 'supplier_frozen')
    return {
      title: __('The supplier {0} is frozen', [supplier]),
      body: __(
        'A frozen supplier takes no new bills until accounting lifts the freeze.',
      ),
      ask: __('Ask accounting to lift it'),
      askNote: __(
        'Please lift the freeze on {0} so this bill can be registered.',
        [supplier],
      ),
    }
  if (kind.value === 'closed_period')
    return {
      title: __('{0} falls in a closed accounting period', [
        formatDay(fix.value.posting_date) || fix.value.posting_date,
      ]),
      body: __(
        'Give the bill a date in an open period and it registers right away. If the date must stay, accounting can reopen the period.',
      ),
      fix: __('Change the date and register'),
      whoCan: __('Changing the bill date is for whoever can edit bills.'),
      ask: __('Ask accounting to reopen it'),
      askNote: __('Bill dated {0} is in a closed accounting period: {1}', [
        fix.value.posting_date,
        message,
      ]),
    }
  return {
    title: __('ERPNext did not register it'),
    body: __(
      'Something on the bill needs a correction first. Fix it, then try again.',
    ),
    ask: __('Ask for a review'),
    askNote: message,
  }
})

function openForm() {
  window.open(
    `/app/purchase-invoice/${encodeURIComponent(props.name)}`,
    '_blank',
    'noopener',
  )
}

async function applyFix() {
  busy.value = true
  problem.value = ''
  try {
    await fixAndRegister({ ...props.doc, name: props.name }, kind.value, {
      postingDate: kind.value === 'closed_period' ? postingDate.value : '',
    })
    emit('queued')
  } catch (error) {
    problem.value = problemOf(error).detail
  } finally {
    busy.value = false
  }
}
</script>
