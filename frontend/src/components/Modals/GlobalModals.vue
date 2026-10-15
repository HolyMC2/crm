<template>
  <CreateDocumentModal
    v-if="showCreateDocumentModal"
    v-model="showCreateDocumentModal"
    :doctype="createDocumentDoctype"
    :data="createDocumentData"
    @callback="(data) => createDocumentCallback(data)"
  />
  <QuickEntryModal
    v-if="showQuickEntryModal"
    v-model="showQuickEntryModal"
    v-bind="quickEntryProps"
  />
  <ChangePasswordModal
    v-if="showChangePasswordModal"
    v-model="showChangePasswordModal"
  />
  <AboutModal v-model="showAboutModal" />
  <FieldLayoutDialogContainer />
  <NextStepDialog />
</template>
<script setup>
import { defineAsyncComponent } from 'vue'
import FieldLayoutDialogContainer from '@/components/Modals/FieldLayoutDialogContainer.vue'
import AboutModal from '@/components/Modals/AboutModal.vue'
import NextStepDialog from '@/components/doco/deals/NextStepDialog.vue'
import {
  showCreateDocumentModal,
  createDocumentDoctype,
  createDocumentData,
  createDocumentCallback,
} from '@/composables/document'
import {
  showQuickEntryModal,
  quickEntryProps,
  showAboutModal,
  showChangePasswordModal,
} from '@/composables/modals'

// Bundle budget (SPEC §4): these open on demand and pull the field layout and
// the text editor, so they load when first shown, not with every Ventas page.
const ChangePasswordModal = defineAsyncComponent(
  () => import('@/components/Modals/ChangePasswordModal.vue'),
)
const CreateDocumentModal = defineAsyncComponent(
  () => import('@/components/Modals/CreateDocumentModal.vue'),
)
const QuickEntryModal = defineAsyncComponent(
  () => import('@/components/Modals/QuickEntryModal.vue'),
)
</script>
