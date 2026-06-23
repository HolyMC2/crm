<!--
  Deal contacts widget for the doco inbox/360 right panel. The upstream
  SidePanelLayout renders `contacts_section` only via a parent-supplied slot;
  DealContextPanel passes no slot, so contacts went blank even when linked.
  This standalone widget reads the same get_deal_contacts API and is rendered
  in the panel directly (contacts_section is filtered out of SidePanelLayout).
-->
<template>
  <div class="flex-none border-b border-outline-gray-1 p-3.5">
    <div class="mb-2.5 flex items-center justify-between">
      <div class="text-[11px] font-bold uppercase tracking-[.08em] text-ink-gray-4">
        {{ hidePrimary ? __('Otros contactos') : __('Contactos') }}
      </div>
      <Link value="" doctype="Contact" @change="(c) => addContact(c)">
        <template #target="{ togglePopover }">
          <Button variant="ghost" icon="plus" class="!h-6 !w-6" :tooltip="__('Agregar contacto')" @click="togglePopover()" />
        </template>
      </Link>
    </div>

    <div v-if="contacts.loading && !contacts.data?.length" class="py-3 text-center text-xs text-ink-gray-4">
      {{ __('Cargando…') }}
    </div>
    <div v-else-if="!visibleContacts.length" class="py-3 text-center text-xs text-ink-gray-4">
      {{ hidePrimary ? __('Sin contactos adicionales') : __('Sin contactos') }}
    </div>

    <div
      v-for="c in visibleContacts"
      :key="c.name"
      class="mb-2 rounded-lg border border-outline-gray-1 bg-surface-gray-2 p-2.5 last:mb-0"
    >
      <div class="flex items-center gap-2">
        <Avatar :label="c.full_name" :image="c.image" size="md" />
        <div class="flex min-w-0 flex-1 items-center gap-1.5">
          <span class="truncate text-[13px] font-semibold text-ink-gray-9">{{ c.full_name }}</span>
          <Badge v-if="c.is_primary" variant="outline" theme="green" :label="__('Primary')" />
        </div>
        <Button
          variant="ghost"
          icon="external-link"
          class="!h-6 !w-6"
          :tooltip="__('Ver contacto')"
          @click="router.push({ name: 'Contact', params: { contactId: c.name } })"
        />
        <Dropdown :options="contactOptions(c)">
          <Button variant="ghost" icon="more-horizontal" class="!h-6 !w-6" />
        </Dropdown>
      </div>
      <div class="mt-1.5 flex flex-col gap-1 pl-1 text-[12px] text-ink-gray-7">
        <div v-if="c.email" class="flex items-center gap-2">
          <Email2Icon class="h-3.5 w-3.5 text-ink-gray-4" />{{ c.email }}
        </div>
        <div v-if="c.mobile_no" class="flex items-center gap-2">
          <PhoneIcon class="h-3.5 w-3.5 text-ink-gray-4" />{{ c.mobile_no }}
        </div>
        <div v-if="!c.email && !c.mobile_no" class="text-[11px] text-ink-gray-4">
          {{ __('Sin datos de contacto') }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { h, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Avatar, Badge, Dropdown, Button, createResource, call, toast } from 'frappe-ui'
import Link from '@/components/Controls/Link.vue'
import Email2Icon from '@/components/Icons/Email2Icon.vue'
import PhoneIcon from '@/components/Icons/PhoneIcon.vue'
import SuccessIcon from '@/components/Icons/SuccessIcon.vue'

const props = defineProps({
  deal: { type: String, required: true },
  // The identity card above already shows the primary contact; hide it here so the
  // person isn't rendered twice. This section then only carries extra contacts.
  hidePrimary: { type: Boolean, default: false },
})
const router = useRouter()

const contacts = createResource({
  url: 'crm.fcrm.doctype.crm_deal.api.get_deal_contacts',
  params: { name: props.deal },
  auto: true,
})

const visibleContacts = computed(() => {
  const list = contacts.data || []
  return props.hidePrimary ? list.filter((c) => !c.is_primary) : list
})
watch(
  () => props.deal,
  (d) => d && contacts.fetch({ name: d }),
)

function contactOptions(c) {
  const opts = [
    {
      label: __('Ver contacto'),
      onClick: () => router.push({ name: 'Contact', params: { contactId: c.name } }),
    },
    { label: __('Quitar'), icon: 'trash-2', onClick: () => removeContact(c.name) },
  ]
  if (!c.is_primary) {
    opts.push({
      label: __('Marcar como principal'),
      icon: h(SuccessIcon, { class: 'h-4 w-4' }),
      onClick: () => setPrimary(c.name),
    })
  }
  return opts
}
async function addContact(contact) {
  if (!contact) return
  if ((contacts.data || []).find((c) => c.name === contact)) {
    toast.error(__('Contacto ya agregado'))
    return
  }
  await call('crm.fcrm.doctype.crm_deal.crm_deal.add_contact', { deal: props.deal, contact })
  contacts.reload()
  toast.success(__('Contacto agregado'))
}
async function removeContact(contact) {
  await call('crm.fcrm.doctype.crm_deal.crm_deal.remove_contact', { deal: props.deal, contact })
  contacts.reload()
  toast.success(__('Contacto quitado'))
}
async function setPrimary(contact) {
  await call('crm.fcrm.doctype.crm_deal.crm_deal.set_primary_contact', { deal: props.deal, contact })
  contacts.reload()
  toast.success(__('Contacto principal actualizado'))
}
</script>
