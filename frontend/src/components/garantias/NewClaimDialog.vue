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
        <p
          v-if="form.against_name"
          class="rounded-lg bg-surface-gray-2 p-3 text-sm text-ink-gray-8"
        >
          {{
            __('About {0} {1}. The customer comes from it.', [
              __(form.against_doctype),
              form.against_name,
            ])
          }}
        </p>
        <ComprasPicker
          v-else
          v-model="form.customer"
          :display="customerLabel"
          :label="__('Customer', null, 'Garantías')"
          :placeholder="__('Search by name or phone')"
          :empty-text="__('No customers match')"
          :invalid="missing.includes('customer')"
          :load="searchCustomers"
          @pick="(option) => (customerLabel = option.label)"
        />
        <FormControl
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
import { reactive, ref, watch } from 'vue'
import { Button, Dialog, FormControl, call } from 'frappe-ui'
import ComprasPicker from '@/components/compras/ComprasPicker.vue'
import {
  KINDS,
  garantiasApi,
  kindLabel,
  outcomeUnknown,
  problemOf,
  requestId,
} from '@/composables/useGarantias'

const props = defineProps({ prefill: { type: Object, default: () => ({}) } })
const emit = defineEmits(['created'])
const open = defineModel({ type: Boolean, default: false })
const blank = () => ({
  claim_kind: 'Garantía',
  customer: '',
  against_doctype: '',
  against_name: '',
  serial_no: '',
  complaint: '',
})
const form = reactive(blank())
const customerLabel = ref('')
const missing = ref([])
const problem = ref(null)
const saving = ref(false)
const openClaim = ref('')
// One id per case being opened: a retry after a lost answer reuses it.
let key = requestId()

watch(open, (value) => {
  if (!value) return
  Object.assign(form, blank(), props.prefill || {})
  if (form.against_doctype === 'Repair Order' && !props.prefill?.claim_kind)
    form.claim_kind = 'Reingreso'
  customerLabel.value = ''
  missing.value = []
  problem.value = null
  openClaim.value = ''
  key = requestId()
})
// A changed request is a different case: it gets its own id.
watch(
  () => [form.customer, form.claim_kind, form.complaint],
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
      serial_no: form.serial_no.trim() || null,
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
