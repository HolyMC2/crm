<!--
  Editable contact/customer card for the inbox right pane. Surfaces the key
  fields for the active deal/lead (name/phone/email/org/device) plus the linked
  Customer's fiscal fields (RFC, razón social, cumpleaños, dirección) — each
  inline-editable, saving straight to the doc the resolver named via
  frappe.client.set_value (composable saveContactField). Quick UX, no shadow path.
-->
<template>
  <div v-if="card" class="flex-none border-b border-outline-gray-1 p-3.5">
    <div class="mb-2 text-[11px] font-bold uppercase tracking-[.08em] text-ink-gray-4">
      {{ __('Datos del cliente') }}
    </div>
    <div class="flex flex-col gap-1.5">
      <label v-for="f in baseFields" :key="f.field" class="block">
        <span class="text-[10px] font-medium text-ink-gray-5">{{ f.label }}</span>
        <input
          v-model="form[f.field]"
          :type="f.type || 'text'"
          :disabled="!card.can_write"
          class="w-full rounded-md border border-outline-gray-2 bg-surface-white px-2 py-1 text-[12.5px] text-ink-gray-8 focus:border-green-500 focus:outline-none focus:ring-0 disabled:opacity-60"
          @change="save(record.doctype, record.name, f.target, form[f.field])"
        />
      </label>

      <template v-if="card.customer">
        <div class="mt-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-gray-4">
          {{ __('Datos fiscales') }}
        </div>
        <label v-for="f in customerFields" :key="f.field" class="block">
          <span class="text-[10px] font-medium text-ink-gray-5">{{ f.label }}</span>
          <input
            v-model="form[f.field]"
            :type="f.type || 'text'"
            :disabled="!card.can_write"
            class="w-full rounded-md border border-outline-gray-2 bg-surface-white px-2 py-1 text-[12.5px] text-ink-gray-8 focus:border-green-500 focus:outline-none focus:ring-0 disabled:opacity-60"
            @change="save(f.doctype, f.name, f.target, form[f.field])"
          />
        </label>
      </template>
      <div v-else class="mt-1 text-[10.5px] leading-snug text-ink-gray-5">
        {{ __('Crea un Cliente (desde Sin asignar) para capturar RFC, dirección y cumpleaños.') }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, computed, watch } from 'vue'
import { contactCard, saveContactField } from '@/composables/inbox'

const card = computed(() => contactCard.data)
const record = computed(() => card.value?.record || {})

const form = reactive({})
watch(
  card,
  (c) => {
    Object.assign(form, {
      first_name: c?.first_name ?? '',
      last_name: c?.last_name ?? '',
      mobile_no: c?.mobile_no ?? '',
      email: c?.email ?? '',
      organization: c?.organization ?? '',
      device: c?.device ?? '',
      rfc: c?.rfc ?? '',
      legal_name: c?.legal_name ?? '',
      birth_date: c?.birth_date ?? '',
      address: c?.address ?? '',
      city: c?.city ?? '',
    })
  },
  { immediate: true },
)

const baseFields = computed(() => {
  const f = [
    { field: 'first_name', label: __('Nombre'), target: 'first_name' },
    { field: 'last_name', label: __('Apellido'), target: 'last_name' },
    { field: 'mobile_no', label: __('Teléfono'), target: 'mobile_no' },
    { field: 'email', label: __('Email'), target: 'email' },
    { field: 'organization', label: __('Empresa'), target: 'organization' },
  ]
  if (card.value?.is_deal) f.push({ field: 'device', label: __('Dispositivo'), target: 'repair_device' })
  return f
})

const customerFields = computed(() => {
  const cust = card.value?.customer
  const addr = card.value?.address_name
  const f = [
    { field: 'rfc', label: __('RFC'), doctype: 'Customer', name: cust, target: 'tax_id' },
    { field: 'legal_name', label: __('Razón social'), doctype: 'Customer', name: cust, target: 'customer_name' },
    { field: 'birth_date', label: __('Cumpleaños'), type: 'date', doctype: 'Customer', name: cust, target: 'posa_birthday' },
  ]
  if (addr) {
    f.push({ field: 'address', label: __('Dirección'), doctype: 'Address', name: addr, target: 'address_line1' })
    f.push({ field: 'city', label: __('Ciudad'), doctype: 'Address', name: addr, target: 'city' })
  }
  return f
})

function save(doctype, name, fieldname, value) {
  if (!doctype || !name) return
  saveContactField(doctype, name, fieldname, value)
}
</script>
