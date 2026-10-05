<template>
  <section v-if="card" class="border-b border-outline-gray-1 p-4">
    <div class="flex items-start gap-3">
      <Avatar
        :label="card.contact_full_name || card.name_display"
        :image="card.contact_image"
        size="lg"
      />
      <div class="min-w-0 flex-1">
        <h3 class="truncate text-sm font-semibold">
          {{ card.contact_full_name || card.name_display || 'Sin nombre' }}
        </h3>
        <a
          v-if="card.mobile_no"
          :href="`tel:${card.mobile_no}`"
          class="block truncate text-sm text-ink-gray-6"
          >{{ card.mobile_no }}</a
        >
        <p v-if="card.email" class="truncate text-xs text-ink-gray-6">
          {{ card.email }}
        </p>
        <a
          v-if="waUrl"
          :href="waUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="text-xs text-ink-green-8 underline"
          :title="
            whatsappShopNumber
              ? `Abre el WhatsApp del negocio: ${whatsappShopNumber}`
              : 'Abrir WhatsApp en este dispositivo'
          "
          >WhatsApp</a
        >
      </div>
      <Button
        icon="edit-2"
        aria-label="Editar datos en Contactos"
        variant="ghost"
        @click="editIdentity"
      />
      <Button
        v-if="identity"
        icon="external-link"
        aria-label="Abrir ficha de Contactos"
        variant="ghost"
        @click="openIdentity"
      />
    </div>
    <Button
      v-if="card.customer"
      class="mt-2"
      label="Editar datos del cliente"
      variant="ghost"
      @click="editParty"
    />
    <label
      v-if="['CRM Lead', 'CRM Deal'].includes(card.record?.doctype)"
      class="mt-3 block text-xs text-ink-gray-6"
      >Empresa del prospecto u oportunidad<input
        v-model="organization"
        :disabled="!card.can_write"
        class="mt-1 w-full rounded border border-outline-gray-2 bg-surface-base p-2 text-sm"
        @change="saveQualification('organization', organization)"
    /></label>
    <label
      v-if="card.is_deal && hasTaller"
      class="mt-3 block text-xs text-ink-gray-6"
      >Dispositivo<input
        v-model="device"
        :disabled="!card.can_write"
        class="mt-1 w-full rounded border border-outline-gray-2 bg-surface-base p-2 text-sm"
        @change="saveDevice"
    /></label>
    <p v-if="error" role="alert" class="mt-2 text-xs text-ink-red-7">
      {{ error }}<Button label="Reintentar" @click="retryQualification" />
    </p>
    <IdentityEditor
      v-if="editOpen"
      v-model="editOpen"
      :source="editingSource"
      :defaults="editingSource?.name ? {} : identityDefaults"
      @saved="refresh"
    />
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Avatar, Button, call } from 'frappe-ui'
import IdentityEditor from '@/components/contactos/IdentityEditor.vue'
import { sourceRoute } from '@/utils/shellRoutes'
import { whatsappManual, whatsappShopNumber } from '@/composables/whatsapp'
import {
  contactCard,
  saveContactField,
  reloadQueue,
  hasTaller,
} from '@/composables/inbox'
const card = computed(() => contactCard.data)
const identity = computed(() => {
  const ref = card.value?.contact
    ? { doctype: 'Contact', name: card.value.contact }
    : card.value?.name_record || card.value?.record
  return [
    'Contact',
    'CRM Lead',
    'Lead',
    'Customer',
    'Supplier',
    'CRM Organization',
  ].includes(ref?.doctype)
    ? ref
    : null
})
// Seeds a new identity only; editing an existing one loads its full native
// channels inside IdentityEditor.
const identityDefaults = computed(() => ({
  source: 'contact',
  fields: {
    first_name: card.value?.first_name || card.value?.name_display || '',
    last_name: card.value?.last_name || '',
  },
  phones: card.value?.mobile_no
    ? [{ phone: card.value.mobile_no, is_primary_phone: 1 }]
    : [],
  emails: card.value?.email
    ? [{ email_id: card.value.email, is_primary: 1 }]
    : [],
}))
const editOpen = ref(false),
  editingSource = ref(null),
  error = ref(''),
  device = ref(''),
  organization = ref(''),
  pendingQualification = ref(null),
  waUrl = ref('')
const router = useRouter()
watch(
  card,
  (value) => {
    device.value = value?.device || ''
    organization.value = value?.organization || ''
  },
  { immediate: true },
)
watch(
  () => [
    whatsappManual.value,
    card.value?.record?.doctype,
    card.value?.record?.name,
  ],
  async ([manual, doctype, name]) => {
    waUrl.value = ''
    if (!manual || !['CRM Lead', 'CRM Deal'].includes(doctype) || !name) return
    const channel = await call('crm.api.whatsapp_channel.get_record_channel', {
      reference_doctype: doctype,
      reference_name: name,
    }).catch(() => null)
    if (card.value?.record?.name === name) waUrl.value = channel?.url || ''
  },
  { immediate: true },
)
function editIdentity() {
  editingSource.value = identity.value
  editOpen.value = true
}
function editParty() {
  editingSource.value = { doctype: 'Customer', name: card.value.customer }
  editOpen.value = true
}
function openIdentity() {
  if (identity.value)
    router.push(sourceRoute(identity.value.doctype, identity.value.name))
}
function refresh() {
  contactCard.reload()
  reloadQueue()
}
function saveDevice() {
  return saveQualification('repair_device', device.value)
}
function retryQualification() {
  if (pendingQualification.value)
    return saveQualification(...pendingQualification.value)
}
async function saveQualification(field, value) {
  error.value = ''
  pendingQualification.value = [field, value]
  try {
    await saveContactField(
      card.value.record.doctype,
      card.value.record.name,
      field,
      value,
    )
    pendingQualification.value = null
  } catch (err) {
    error.value =
      err.messages?.[0] ||
      'No pudimos guardar los datos de esta oportunidad. Conservamos tu cambio; reintenta.'
  }
}
</script>
