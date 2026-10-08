<template>
  <Dialog v-model="open" :options="{ title: __('New case') }">
    <template #body-content>
      <form class="space-y-4" @submit.prevent="submit()">
        <FormControl
          v-model="form.claim_kind"
          type="select"
          :label="__('What happened', null, 'Garantías')"
          :options="
            KINDS.map((k) => ({ label: kindLabel(k.value), value: k.value }))
          "
        />
        <div
          v-if="fixedSource"
          class="flex flex-wrap items-center gap-2 rounded-lg bg-surface-gray-2 p-3 text-sm text-ink-gray-8"
        >
          <span class="min-w-0 flex-1">{{
            __('About {0} {1}. The customer comes from it.', [
              __(form.against_doctype),
              form.against_name,
            ])
          }}</span>
          <Button :label="__('Choose another purchase')" @click="clearSource" />
        </div>
        <ComprasPicker
          v-else-if="!form.against_name"
          v-model="form.customer"
          :display="customerLabel"
          :label="__('Customer', null, 'Garantías')"
          :placeholder="__('Search by name or phone')"
          :empty-text="__('No customers match')"
          :invalid="missing.includes('customer')"
          :load="searchCustomers"
          @pick="onCustomer"
        />
        <fieldset
          v-if="form.customer || fixedSource"
          class="space-y-2"
          :aria-busy="loadingSources || undefined"
        >
          <legend class="mb-1 text-sm font-medium text-ink-gray-8">
            {{ __('Which purchase or repair is it about?') }}
          </legend>
          <p
            v-if="loadingSources"
            role="status"
            class="text-sm text-ink-gray-6"
          >
            {{ __('Looking up purchases…') }}
          </p>
          <template v-else>
            <label
              v-for="option in options"
              :key="option.key"
              class="flex min-h-11 cursor-pointer items-start gap-2 rounded-md px-2 py-1 hover:bg-surface-gray-1"
            >
              <input
                type="radio"
                name="claim-source"
                class="mt-1"
                :checked="chosen === option.key"
                @change="choose(option)"
              />
              <span class="min-w-0">
                <span class="block text-sm text-ink-gray-9">
                  {{ option.label }}
                  <span class="text-ink-gray-5"
                    >·
                    {{
                      option.kind === 'order'
                        ? __('Taller order')
                        : __('Sale', null, 'Garantías')
                    }}</span
                  >
                </span>
                <span class="block text-xs text-ink-gray-6">{{
                  option.hint
                }}</span>
              </span>
            </label>
            <label
              v-if="!fixedSource"
              class="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-surface-gray-1"
            >
              <input
                type="radio"
                name="claim-source"
                :checked="chosen === ''"
                @change="choose(null)"
              />
              <span class="text-sm text-ink-gray-8">{{
                __('No receipt at hand (link it later)')
              }}</span>
            </label>
            <p
              v-if="!options.length && !fixedSource"
              class="text-sm text-ink-gray-6"
            >
              {{
                __(
                  'No recent sales or delivered orders for this customer. Open the case anyway and link the purchase later.',
                )
              }}
            </p>
            <p v-if="sourceProblem" role="alert" class="text-sm text-ink-red-7">
              {{ sourceProblem.detail }}
              <Button
                class="ml-1"
                :label="__('Retry', null, 'Garantías')"
                @click="loadSources"
              />
            </p>
          </template>
        </fieldset>
        <FormControl
          v-if="serialChoices.length > 1"
          v-model="form.serial_no"
          type="select"
          :label="__('Serial number', null, 'Garantías')"
          :options="[
            { label: __('Not sure'), value: '' },
            ...serialChoices.map((s) => ({ label: s, value: s })),
          ]"
        />
        <FormControl
          v-else
          v-model="form.serial_no"
          :label="__('Serial number (optional)')"
          :placeholder="__('IMEI or serial on the product')"
        />
        <FormControl
          v-model="form.complaint"
          type="textarea"
          :label="__('What the customer reports')"
          :placeholder="__('E.g. the screen turns off after a few minutes')"
          :aria-invalid="missing.includes('complaint') || undefined"
        />
        <div
          v-if="openClaim"
          role="status"
          class="space-y-2 rounded-lg bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
        >
          <p>
            {{
              __('{0} already has an open case: {1}.', [
                form.against_name,
                openClaim,
              ])
            }}
          </p>
          <div class="flex flex-wrap gap-2">
            <Button
              :label="__('Open that case')"
              @click="emit('created', openClaim)"
            />
            <Button
              :label="__('Open another case anyway')"
              :loading="saving"
              @click="submit(true)"
            />
          </div>
        </div>
        <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
          <strong>{{ problem.title }}.</strong> {{ problem.detail }}
        </p>
      </form>
    </template>
    <template #actions>
      <div class="flex flex-wrap justify-end gap-2">
        <Button :label="__('Close', null, 'Garantías')" @click="open = false" />
        <Button
          variant="solid"
          :label="__('Open case')"
          :loading="saving"
          @click="submit()"
        />
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Button, Dialog, FormControl, call } from 'frappe-ui'
import ComprasPicker from '@/components/compras/ComprasPicker.vue'
import {
  KINDS,
  garantiasApi,
  kindLabel,
  outcomeUnknown,
  problemOf,
  requestId,
  sourceOptions,
} from '@/composables/useGarantias'

const props = defineProps({ prefill: { type: Object, default: () => ({}) } })
const emit = defineEmits(['created'])
const open = defineModel({ type: Boolean, default: false })
const blank = () => ({
  claim_kind: 'Garantía',
  customer: '',
  against_doctype: '',
  against_name: '',
  against_row: '',
  serial_no: '',
  batch_no: '',
  complaint: '',
})
const form = reactive(blank())
const customerLabel = ref('')
const missing = ref([])
const problem = ref(null)
const saving = ref(false)
const openClaim = ref('')
const found = ref(null)
const loadingSources = ref(false)
const sourceProblem = ref(null)
const chosen = ref('')
// A hand-off from a Taller order or a POS sale: the document is known, only its line is chosen.
const fixedSource = ref(false)
// One id per case being opened: a retry after a lost answer reuses it.
let key = requestId()
let sourceTicket = 0

const options = computed(() => {
  const all = sourceOptions(found.value)
  return fixedSource.value
    ? all.filter((o) => o.against_name === form.against_name)
    : all
})
const serialChoices = computed(
  () => options.value.find((o) => o.key === chosen.value)?.serials || [],
)

watch(open, (value) => {
  if (!value) return
  Object.assign(form, blank(), props.prefill || {})
  if (form.against_doctype === 'Repair Order' && !props.prefill?.claim_kind)
    form.claim_kind = 'Reingreso'
  fixedSource.value = Boolean(form.against_name)
  customerLabel.value = ''
  missing.value = []
  problem.value = null
  openClaim.value = ''
  found.value = null
  chosen.value = ''
  key = requestId()
  if (fixedSource.value) loadSources()
})

async function loadSources() {
  const ticket = ++sourceTicket
  loadingSources.value = true
  sourceProblem.value = null
  try {
    const result = await garantiasApi(
      'sources',
      fixedSource.value
        ? { q: form.against_name }
        : { customer: form.customer },
    )
    if (ticket !== sourceTicket) return
    found.value = result
    // The handed-off order or a one-line sale needs no extra tap.
    if (fixedSource.value && options.value.length === 1)
      choose(options.value[0])
  } catch (error) {
    if (ticket === sourceTicket) sourceProblem.value = problemOf(error)
  } finally {
    if (ticket === sourceTicket) loadingSources.value = false
  }
}
function onCustomer(option) {
  customerLabel.value = option.label
  chosen.value = ''
  loadSources()
}
function choose(option) {
  chosen.value = option ? option.key : ''
  form.against_doctype = option ? option.against_doctype : ''
  form.against_name = option ? option.against_name : ''
  form.against_row = option ? option.against_row : ''
  form.serial_no = option ? option.serial_no : form.serial_no
  form.batch_no = option ? option.batch_no : ''
  if (option?.kind === 'order' && !props.prefill?.claim_kind)
    form.claim_kind = 'Reingreso'
}
function clearSource() {
  fixedSource.value = false
  choose(null)
  found.value = null
}
// A changed request is a different case: it gets its own id.
watch(
  () => [
    form.customer,
    form.claim_kind,
    form.complaint,
    form.against_name,
    form.against_row,
  ],
  () => {
    if (!saving.value) key = requestId()
  },
)

async function searchCustomers(text) {
  const rows = await call('frappe.desk.search.search_link', {
    doctype: 'Customer',
    txt: text || '',
    page_length: 10,
  })
  return (rows || []).map((row) => ({
    value: row.value,
    label: row.label || row.description || row.value,
    hint: row.label ? row.description : '',
  }))
}

async function submit(allowDuplicate = false) {
  missing.value = [
    ...(!form.against_name && !form.customer ? ['customer'] : []),
    ...(form.complaint.trim().length < 3 ? ['complaint'] : []),
  ]
  if (missing.value.length) {
    problem.value = {
      title: __('Missing information'),
      detail: __('Choose the customer and describe what they report.'),
    }
    return
  }
  saving.value = true
  problem.value = null
  try {
    const out = await garantiasApi('create_claim', {
      request_key: key,
      complaint: form.complaint.trim(),
      customer: form.against_name ? null : form.customer,
      claim_kind: form.claim_kind,
      against_doctype: form.against_doctype || null,
      against_name: form.against_name || null,
      against_row: form.against_row || null,
      serial_no: form.serial_no.trim() || null,
      batch_no: form.batch_no || null,
      allow_duplicate: allowDuplicate ? 1 : 0,
    })
    if (out.open_claim) {
      openClaim.value = out.name
      return
    }
    open.value = false
    emit('created', out.name)
  } catch (error) {
    problem.value = problemOf(error)
    if (!outcomeUnknown(error)) key = requestId()
  } finally {
    saving.value = false
  }
}
</script>
