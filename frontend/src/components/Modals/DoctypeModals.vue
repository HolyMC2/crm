<template>
  <DoctypeModal
    v-if="doctypeModal.show.value"
    v-model="doctypeModal.show.value"
    :doctypeTitle="doctypeModal.title.value"
    :doctype="doctypeModal.doctype.value"
    :docname="doctypeModal.name.value"
    :defaults="doctypeModal.defaults.value"
    @afterInsert="(d) => doctypeModal.triggerCallback('afterInsert', d)"
    @afterUpdate="(d) => doctypeModal.triggerCallback('afterUpdate', d)"
  />
</template>
<script setup>
import { defineAsyncComponent } from 'vue'
import { useDoctypeModal } from '@/composables/doctypeModal'

// Loads when a modal first opens, not with every page (bundle budget).
const DoctypeModal = defineAsyncComponent(
  () => import('@/components/Modals/DoctypeModal.vue'),
)
const doctypeModal = useDoctypeModal()
</script>
