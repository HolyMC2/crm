<template>
  <!-- «Campos»: what a template can print, by its Spanish label. A tap inserts
       the field at the caret (desktop editor) or copies it (phone). Tables
       (the items) insert a loop; their columns open below them. -->
  <div class="space-y-2" data-testid="impresion-campos">
    <input
      v-model="query"
      type="search"
      placeholder="Buscar campo"
      aria-label="Buscar campo"
      class="min-h-11 w-full rounded-lg border border-outline-gray-2 bg-surface-white px-3 text-base text-ink-gray-9"
    />
    <p v-if="!shown.length" class="px-1 py-3 text-base text-ink-gray-6">
      Ningún campo con ese nombre.
    </p>
    <ul class="overflow-hidden rounded-lg border border-outline-gray-1">
      <li v-for="field in shown" :key="field.fieldname">
        <ListRow
          :icon="field.table ? 'lucide-file-text' : ''"
          :title="field.table ? `${field.label} (tabla)` : field.label"
          :subtitle="preview(field)"
          :aria-label="`${actionLabel} ${field.label}`"
          @click="emit('pick', field)"
        >
          <template #trailing>
            <span
              class="lucide-copy size-4 text-ink-gray-5"
              aria-hidden="true"
            />
          </template>
        </ListRow>
        <details v-if="field.table && field.children?.length" class="px-4 pb-2">
          <summary class="min-h-11 cursor-pointer py-2 text-sm text-ink-gray-7">
            Columnas de {{ field.label.toLowerCase() }}
          </summary>
          <ul>
            <li v-for="child in field.children" :key="child.fieldname">
              <ListRow
                :title="child.label"
                :subtitle="valueSnippet(child, 'row')"
                :aria-label="`${actionLabel} ${child.label}`"
                @click="emit('pick', { ...child, row: true })"
              />
            </li>
          </ul>
        </details>
      </li>
    </ul>
  </div>
</template>
<script setup>
import { computed, ref } from 'vue'
import { ListRow } from '@/components/ui'
import { filterFields, valueSnippet } from './impresion'

const props = defineProps({
  fields: { type: Array, default: () => [] },
  /** «Insertar» (desktop editor) or «Copiar» (phone, read-only). */
  actionLabel: { type: String, default: 'Copiar' },
})
const emit = defineEmits(['pick'])
const query = ref('')
const shown = computed(() => filterFields(props.fields, query.value))

function preview(field) {
  return field.table
    ? `{% for row in doc.${field.fieldname} %}…`
    : valueSnippet(field)
}
</script>
