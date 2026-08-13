<template>
  <section class="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-base">
    <div v-if="resource.loading && !data" class="p-6 text-sm text-ink-gray-5">
      {{ __('Cargando conexiones…') }}
    </div>
    <div v-else-if="resource.error && !data" class="p-6 text-sm text-ink-red-7">
      {{ __('No se pudieron cargar las conexiones.') }}
      <button class="ml-1 font-semibold underline" @click="resource.reload()">
        {{ __('Reintentar') }}
      </button>
    </div>
    <div
      v-else-if="data"
      class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 md:p-6"
    >
      <section class="mb-6">
        <h3 class="mb-2 text-sm font-semibold text-ink-gray-9">
          {{ __('Documentos vinculados') }}
        </h3>
        <div v-if="!data.linked_docs.length" class="text-sm text-ink-gray-5">
          {{ __('Sin documentos vinculados.') }}
        </div>
        <div v-else class="grid gap-3 lg:grid-cols-2">
          <div
            v-for="group in data.linked_docs"
            :key="group.doctype"
            class="overflow-hidden rounded-xl border border-outline-gray-2"
          >
            <div
              class="flex items-center justify-between bg-surface-gray-1 px-3 py-2"
            >
              <span class="text-sm font-semibold text-ink-gray-9">{{
                label(group.doctype)
              }}</span>
              <Badge :label="String(group.count)" theme="gray" size="sm" />
            </div>
            <a
              v-for="row in group.rows"
              :key="row.name"
              :href="href(group.doctype, row.name)"
              target="_blank"
              class="flex items-center justify-between gap-3 border-t border-outline-gray-1 px-3 py-2 text-sm hover:bg-surface-gray-1"
            >
              <span class="truncate font-medium text-ink-blue-link">{{
                title(group.doctype, row)
              }}</span>
              <span class="flex-none text-xs text-ink-gray-5">{{
                date(row.modified)
              }}</span>
            </a>
          </div>
        </div>
      </section>

      <section class="mb-6">
        <h3 class="mb-2 text-sm font-semibold text-ink-gray-9">
          {{ __('Personas y organización') }}
        </h3>
        <div class="grid gap-3 lg:grid-cols-2">
          <Panel :title="__('Organización')">
            <a
              v-if="data.people.organization"
              :href="href('CRM Organization', data.people.organization.name)"
              target="_blank"
              class="font-medium text-ink-blue-link"
              >{{
                data.people.organization.organization_name ||
                data.people.organization.name
              }}</a
            >
            <span v-else class="text-ink-gray-5">{{
              __('Sin organización')
            }}</span>
          </Panel>
          <Panel :title="__('Customers')">
            <div class="flex flex-wrap gap-1.5">
              <a
                v-for="row in data.people.customers"
                :key="row.name"
                :href="href('Customer', row.name)"
                target="_blank"
                class="rounded-full bg-surface-blue-1 px-2 py-1 text-xs font-semibold text-ink-blue-9"
                >{{ row.customer_name || row.name }}</a
              >
              <span
                v-if="!data.people.customers.length"
                class="text-ink-gray-5"
                >{{ __('Sin Customer vinculado') }}</span
              >
            </div>
          </Panel>
          <Panel :title="__('Otros contactos de la organización')">
            <div
              v-if="!data.people.sibling_contacts.length"
              class="text-ink-gray-5"
            >
              {{ __('Ninguno') }}
            </div>
            <a
              v-for="row in data.people.sibling_contacts"
              :key="row.name"
              :href="`/contacts/${encodeURIComponent(row.name)}`"
              class="block truncate py-1 font-medium text-ink-blue-link"
              >{{ row.full_name || row.name
              }}<span
                v-if="row.mobile_no"
                class="ml-2 font-normal text-ink-gray-5"
                >{{ row.mobile_no }}</span
              ></a
            >
          </Panel>
          <Panel :title="__('Leads y tratos')">
            <div
              v-if="!data.people.leads.length && !data.people.deals.length"
              class="text-ink-gray-5"
            >
              {{ __('Ninguno') }}
            </div>
            <a
              v-for="row in data.people.leads"
              :key="row.name"
              :href="`/leads/${encodeURIComponent(row.name)}`"
              class="flex items-center justify-between gap-2 py-1 text-ink-blue-link"
              ><span class="truncate">{{ row.name_ || row.name }}</span
              ><Badge
                v-if="row.status"
                :label="row.status"
                theme="gray"
                size="sm"
            /></a>
            <a
              v-for="row in data.people.deals"
              :key="row.name"
              :href="`/deals/${encodeURIComponent(row.name)}`"
              class="flex items-center justify-between gap-2 py-1 text-ink-blue-link"
              ><span class="truncate">{{ row.name }}</span
              ><Badge
                v-if="row.status"
                :label="row.status"
                theme="gray"
                size="sm"
            /></a>
          </Panel>
        </div>
      </section>

      <section>
        <h3 class="mb-2 text-sm font-semibold text-ink-gray-9">
          {{ __('Identidades de canal') }}
        </h3>
        <div class="grid gap-3 lg:grid-cols-3">
          <Panel :title="__('Teléfonos')">
            <div v-if="!data.identities.phones.length" class="text-ink-gray-5">
              {{ __('Ninguno') }}
            </div>
            <div
              v-for="row in data.identities.phones"
              :key="row.phone"
              class="py-1 font-mono text-ink-gray-8"
            >
              {{ row.phone }}
            </div>
          </Panel>
          <Panel :title="__('Correos')">
            <div v-if="!data.identities.emails.length" class="text-ink-gray-5">
              {{ __('Ninguno') }}
            </div>
            <div
              v-for="row in data.identities.emails"
              :key="row.email_id"
              class="truncate py-1 text-ink-gray-8"
            >
              {{ row.email_id }}
            </div>
          </Panel>
          <Panel :title="__('WhatsApp / Messenger / otros')">
            <div
              v-if="!data.identities.channels.length"
              class="text-ink-gray-5"
            >
              {{ __('Ninguna identidad registrada') }}
            </div>
            <div
              v-for="row in data.identities.channels"
              :key="`${row.channel}-${row.identifier}`"
              class="flex items-center justify-between gap-2 py-1"
            >
              <Badge :label="row.channel" theme="blue" size="sm" />
              <span class="min-w-0 truncate font-mono text-ink-gray-8">{{
                row.profile_name || row.identifier
              }}</span>
            </div>
          </Panel>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup>
import { computed, defineComponent, h } from 'vue'
import { Badge, createResource } from 'frappe-ui'

const props = defineProps({ docname: { type: String, required: true } })
const resource = createResource({
  url: 'doco_marketing.api.contact360.get_contact_connections',
  params: { contact: props.docname },
  cache: ['contact360-connections', props.docname],
  auto: true,
})
const data = computed(() => resource.data || null)
const Panel = defineComponent({
  props: { title: String },
  setup(p, { slots }) {
    return () =>
      h(
        'div',
        {
          class:
            'rounded-xl border border-outline-gray-2 bg-surface-gray-1 p-3 text-sm',
        },
        [
          h(
            'div',
            {
              class:
                'mb-2 text-[10px] font-bold uppercase tracking-wide text-ink-gray-5',
            },
            p.title,
          ),
          slots.default?.(),
        ],
      )
  },
})

function slug(doctype) {
  return doctype.toLowerCase().replaceAll(' ', '-')
}
function href(doctype, name) {
  if (doctype === 'CRM Deal') return `/deals/${encodeURIComponent(name)}`
  if (doctype === 'CRM Lead') return `/leads/${encodeURIComponent(name)}`
  if (doctype === 'CRM Organization')
    return `/organizations/${encodeURIComponent(name)}`
  return `/desk/${slug(doctype)}/${encodeURIComponent(name)}`
}
function label(doctype) {
  return (
    {
      'CRM Deal': __('Tratos'),
      'CRM Lead': __('Leads'),
      Customer: __('Customers'),
    }[doctype] || doctype
  )
}
function title(doctype, row) {
  return (
    row.organization_name ||
    row.customer_name ||
    row.lead_name ||
    row.full_name ||
    row.name
  )
}
function date(value) {
  return value
    ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(
        new Date(value),
      )
    : '—'
}
</script>
