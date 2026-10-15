<template>
  <FieldLayoutDialog
    v-for="dialog in fieldLayoutDialogs"
    :key="dialog.key"
    v-bind="dialogProps(dialog)"
    @resolve="dialog.props.onResolve"
  />
</template>

<script setup>
import { defineAsyncComponent } from 'vue'
import { fieldLayoutDialogs } from '@/utils/renderFieldLayoutDialog'

// Loads with the first formDialog(), not with every page (bundle budget).
const FieldLayoutDialog = defineAsyncComponent(
  () => import('@/components/Modals/FieldLayoutDialog.vue'),
)

function dialogProps(dialog) {
  // Extract onResolve so it's only attached via @resolve, not doubled via v-bind
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { onResolve: _onResolve, ...rest } = dialog.props
  return rest
}
</script>
