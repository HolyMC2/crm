<template>
  <!-- What narrows Precios: the price list the views and the cost line
       follow, and who the products are bought from or their group. Which
       other lists show is the chip row on the page. The same block sits in
       the phone's search panel and the desktop sheet. -->
  <div class="space-y-3" data-precios-filtros>
    <div v-if="lists.length > 1">
      <p class="text-sm font-medium text-ink-gray-8">Lista principal</p>
      <p class="mb-1 text-sm text-ink-gray-6">
        Con ella se arman las vistas y se compara el costo.
      </p>
      <div
        class="flex flex-wrap gap-2"
        role="group"
        aria-label="Lista principal"
      >
        <button
          v-for="name in lists"
          :key="name"
          type="button"
          :class="chipClass(name === list)"
          :aria-pressed="name === list"
          @click="emit('update:list', name)"
        >
          {{ priceListLabel(name) }}
        </button>
      </div>
    </div>
    <FilterLink
      v-if="supplierShown"
      :model-value="supplier"
      doctype="Supplier"
      label="Proveedor"
      @update:model-value="(value) => emit('update:supplier', value || '')"
    />
    <FilterLink
      :model-value="group"
      doctype="Item Group"
      label="Grupo"
      @update:model-value="(value) => emit('update:group', value || '')"
    />
  </div>
</template>
<script setup>
import { chipClass } from '@/components/ui'
import FilterLink from '@/components/documentos/FilterLink.vue'
import { priceListLabel } from '@/utils/priceList'

defineProps({
  lists: { type: Array, default: () => [] },
  list: { type: String, default: '' },
  supplier: { type: String, default: '' },
  /** A document already says who sold it: no supplier filter there. */
  supplierShown: { type: Boolean, default: true },
  group: { type: String, default: '' },
})
const emit = defineEmits(['update:list', 'update:supplier', 'update:group'])
</script>
