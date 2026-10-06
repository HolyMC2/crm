<!--
  Contact host of the shared commercial panel (Contactos ficha «Documentos»,
  Contact 360 registry key ContactDocumentsTab). Lean on purpose: no sales
  stores load on the Contactos route.
-->
<template>
  <CommercialDocsPanel
    scope="contact"
    :model="model"
    :loading="resource.loading"
    :error="error"
    :scope-label="docname"
    :return-label="__('Contact {0}', [docname])"
    :source="source"
  />
</template>

<script setup>
import { computed, watch } from 'vue'
import { call, createResource } from 'frappe-ui'
import CommercialDocsPanel from '@/components/ventas/CommercialDocsPanel.vue'
import { normalizeCommercialDocs } from '@/utils/ventasDocs'

const props = defineProps({
  docname: { type: String, required: true },
  selectedCustomer: { type: String, default: '' },
})

// No persistent cache: private amounts must never render for another selected
// account or user before the server re-authorizes them.
const resource = createResource({
  url: 'doco_marketing.api.contact360.get_contact_documents',
  auto: false,
})
const model = computed(() => normalizeCommercialDocs(resource.data))
const error = computed(() =>
  resource.error
    ? resource.error.messages?.[0] || __('The documents could not be loaded.')
    : '',
)
const params = () => ({
  contact: props.docname,
  customer: props.selectedCustomer || null,
})
watch(
  () => [props.docname, props.selectedCustomer],
  () => resource.submit(params()),
  { immediate: true },
)

const source = {
  reload: () => resource.submit(params()),
  // contact scope offers only views and POS hand-offs; no server actions
  act: () => Promise.reject(new Error('No actions in contact scope')),
  render: (row) =>
    call('doco_marketing.api.contact360.render_contact_doc', {
      ...params(),
      doctype: row.doctype,
      name: row.name,
    }),
}
</script>
