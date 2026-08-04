<!--
  Compact contact/customer card for the inbox right pane. Shows the identity at a
  glance (avatar + name + phone + email + device) and moves the full editable field
  set — name/phone/email/org/device + the linked Customer's fiscal fields (RFC,
  razón social, cumpleaños, dirección) — into an "Editar datos" popup so the panel
  stays dense. Each field still live-saves to the exact doc the resolver named via
  frappe.client.set_value (composable saveContactField); Nombre/Apellido persist to
  the linked Contact (card.name_record), the canonical identity the Contactos list
  also shows. Resolver: doco_marketing.api.inbox.get_contact_card.
-->
<template>
  <div v-if="card" class="flex-none border-b border-outline-gray-1 p-3.5">
    <div class="mb-2 text-[11px] font-bold uppercase tracking-[.08em] text-ink-gray-4">
      {{ __('Contacto') }}
    </div>

    <!-- compact identity -->
    <div class="flex items-start gap-2.5">
      <Avatar :label="card.contact_full_name || displayName" :image="card.contact_image" size="lg" />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1.5">
          <span class="truncate text-[13.5px] font-semibold text-ink-gray-9">
            {{ card.contact_full_name || displayName || __('Sin nombre') }}
          </span>
          <span v-if="card.customer" class="flex-none rounded bg-surface-green-2 px-1.5 py-px text-[9px] font-semibold text-ink-green-7">
            {{ __('Cliente') }}
          </span>
        </div>
        <a v-if="card.mobile_no" :href="`tel:${card.mobile_no}`" class="mt-0.5 block truncate font-mono text-[11.5px] text-ink-gray-6 hover:text-ink-gray-9">
          ☎ {{ card.mobile_no }}
        </a>
        <div v-if="form.email" class="truncate text-[11.5px] text-ink-gray-6">✉ {{ form.email }}</div>
        <div v-if="card.is_deal && form.device" class="truncate text-[11px] text-ink-gray-5">🔧 {{ form.device }}</div>
      </div>
      <div class="flex flex-none flex-col gap-0.5">
        <Button variant="ghost" icon="edit-2" class="!h-6 !w-6" :tooltip="__('Editar datos')" @click="editOpen = true" />
        <Button v-if="card.contact" variant="ghost" icon="external-link" class="!h-6 !w-6" :tooltip="__('Ver contacto')" @click="openContact" />
      </div>
    </div>

    <!-- edit popup: all contact + fiscal fields, each live-saved on change -->
    <Dialog v-model="editOpen" :options="{ title: __('Editar datos del cliente') }">
      <template #body-content>
        <div class="flex flex-col gap-2.5">
          <label v-for="f in baseFields" :key="f.field" class="block">
            <span class="text-[10.5px] font-medium text-ink-gray-5">{{ f.label }}</span>
            <input
              v-model="form[f.field]"
              :type="f.type || 'text'"
              :disabled="!canWrite(f)"
              :class="inputCls"
              @change="save(f.doctype, f.name, f.target, form[f.field])"
            />
          </label>

          <template v-if="card.customer">
            <div class="mt-1 text-[10px] font-bold uppercase tracking-wide text-ink-gray-4">
              {{ __('Datos fiscales') }}
            </div>
            <label v-for="f in customerFields" :key="f.field" class="block">
              <span class="text-[10.5px] font-medium text-ink-gray-5">{{ f.label }}</span>
              <input
                v-model="form[f.field]"
                :type="f.type || 'text'"
                :disabled="!card.can_write"
                :class="inputCls"
                @change="save(f.doctype, f.name, f.target, form[f.field])"
              />
            </label>
          </template>
          <div v-else class="mt-1 text-[10.5px] leading-snug text-ink-gray-5">
            {{ __('Crea un Cliente (desde Sin asignar) para capturar RFC, dirección y cumpleaños.') }}
          </div>
        </div>
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { reactive, computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Avatar, Button, Dialog, toast } from 'frappe-ui'
import { contactCard, saveContactField, reloadQueue, hasTaller } from '@/composables/inbox'

const router = useRouter()
const editOpen = ref(false)

const inputCls =
  'w-full rounded-md border border-outline-gray-2 bg-surface-gray-2 px-2 py-1.5 text-[12.5px] text-ink-gray-8 hover:bg-surface-gray-3 focus:bg-surface-base focus:border-outline-gray-4 focus:outline-none focus:ring-0 disabled:opacity-60'

const card = computed(() => contactCard.data)
const record = computed(() => card.value?.record || {})
// Name fields persist to the canonical Contact when there is one, else the record.
const nameRecord = computed(() => card.value?.name_record || record.value)
const displayName = computed(() => card.value?.name_display || '')

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
  const rec = record.value
  const nameRec = nameRecord.value
  const f = [
    { field: 'first_name', label: __('Nombre'), doctype: nameRec.doctype, name: nameRec.name, target: 'first_name' },
    { field: 'last_name', label: __('Apellido'), doctype: nameRec.doctype, name: nameRec.name, target: 'last_name' },
    { field: 'mobile_no', label: __('Teléfono'), doctype: rec.doctype, name: rec.name, target: 'mobile_no' },
    { field: 'email', label: __('Email'), doctype: rec.doctype, name: rec.name, target: 'email' },
    { field: 'organization', label: __('Empresa'), doctype: rec.doctype, name: rec.name, target: 'organization' },
  ]
  if (card.value?.is_deal && hasTaller.value) f.push({ field: 'device', label: __('Dispositivo'), doctype: rec.doctype, name: rec.name, target: 'repair_device' })
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

// Name fields follow the Contact's write perm (name_record.can_write); the rest
// follow the deal/lead's (card.can_write).
function canWrite(f) {
  if (f.doctype === nameRecord.value.doctype && f.name === nameRecord.value.name) {
    return card.value?.name_record?.can_write ?? card.value?.can_write
  }
  return card.value?.can_write
}

function openContact() {
  if (card.value?.contact) router.push({ name: 'Contact', params: { contactId: card.value.contact } })
}

async function save(doctype, name, fieldname, value) {
  if (!doctype || !name) return
  // A server ValidationError (bad email, owner-equal, etc.) was previously swallowed —
  // the field silently reverted with no explanation. Surface it + reload so the revert
  // is explained, not mysterious.
  try {
    await saveContactField(doctype, name, fieldname, value)
  } catch (e) {
    toast.error(e?.messages?.[0] || e?.message || __('No se pudo guardar el cambio.'))
    contactCard.reload()
    reloadQueue() // saveContactField threw before its own refresh — revert the queue row too
  }
}
</script>
