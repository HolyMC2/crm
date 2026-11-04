<template>
  <!-- «Diseño» on a phone: the label stays in sight at the top of the sheet
       while the measure and the parts change under it. Changes apply as they
       are made; «Listo» only closes. -->
  <BottomSheet
    :open="open"
    title="Diseño de la etiqueta"
    :subtitle="subtitle"
    @update:open="emit('update:open', $event)"
  >
    <template #header>
      <EtqStage
        v-model:index="index"
        compact
        class="h-40"
        :html="html"
        :size="size"
        :designed="designed"
        :count="count"
        :offset="offset"
        :total="total"
        :loading="loading"
        title="Así queda la etiqueta"
        empty="Elige una medida para ver la etiqueta."
      />
    </template>
    <EtqDesign
      v-model:layout="layout"
      v-model:design="design"
      :layouts="layouts"
      :meta="meta"
      :dropped="dropped"
      :rows="rows"
      :price-list="priceList"
    />
    <template #actions>
      <Button
        variant="solid"
        class="press min-h-11 w-full"
        label="Listo"
        @click="emit('update:open', false)"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { Button } from 'frappe-ui'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import EtqDesign from '@/components/etiquetas/EtqDesign.vue'
import EtqStage from '@/components/etiquetas/EtqStage.vue'

defineProps({
  open: { type: Boolean, default: false },
  subtitle: { type: String, default: '' },
  layouts: { type: Array, default: () => [] },
  meta: { type: Object, default: () => ({}) },
  dropped: { type: Array, default: () => [] },
  rows: { type: Array, default: () => [] },
  priceList: { type: String, default: '' },
  // The page's own drawing, so both show the same label.
  html: { type: String, default: '' },
  size: { type: Object, default: () => ({ w_mm: 0, h_mm: 0 }) },
  designed: { type: Boolean, default: false },
  count: { type: Number, default: 1 },
  offset: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  loading: { type: Boolean, default: false },
})
const emit = defineEmits(['update:open'])
const layout = defineModel('layout', { type: String, default: '' })
const design = defineModel('design', { type: Object, required: true })
const index = defineModel('index', { type: Number, default: 0 })
</script>
