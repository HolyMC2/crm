<template>
  <!-- What narrows Precios: the price list it works on, whether the other
       lists show too, and who the products are bought from or their group.
       The same block sits in the phone's search panel and the desktop sheet. -->
  <div class="space-y-3" data-precios-filtros>
    <div v-if="lists.length > 1">
      <p class="mb-1 text-sm font-medium text-ink-gray-8">Lista de precios</p>
      <div
        class="flex flex-wrap gap-2"
        role="group"
        aria-label="Lista de precios"
      >
        <button
          v-for="name in lists"
          :key="name"
          type="button"
          :class="chipClass(name === list)"
          :aria-pressed="name === list"
          @click="emit('update:list', name)"
        >
          {{ name }}
        </button>
      </div>
      <label
        class="mt-2 flex min-h-11 items-center gap-3 text-base text-ink-gray-8"
      >
        <input
          type="checkbox"
          class="size-5 rounded"
          :checked="allLists"
          @change="emit('update:allLists', $event.target.checked)"
        />
        Ver también las otras listas
      </label>
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

defineProps({
  lists: { type: Array, default: () => [] },
  list: { type: String, default: '' },
  allLists: { type: Boolean, default: false },
  supplier: { type: String, default: '' },
  /** A document already says who sold it: no supplier filter there. */
  supplierShown: { type: Boolean, default: true },
  group: { type: String, default: '' },
})
const emit = defineEmits([
  'update:list',
  'update:allLists',
  'update:supplier',
  'update:group',
])
</script>
