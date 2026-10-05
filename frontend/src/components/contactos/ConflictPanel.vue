<template>
  <section class="c-inset c-conflict" aria-live="polite">
    <h3>{{ title }}</h3>
    <p class="c-muted">
      {{
        overlap
          ? 'Tú y otra persona cambiaron los mismos datos. Revisa cada uno antes de continuar.'
          : 'Otra persona guardó cambios mientras editabas. Tus cambios siguen en el borrador.'
      }}
    </p>
    <table v-if="rows.length" class="c-conflict-table">
      <thead>
        <tr>
          <th scope="col">Dato</th>
          <th scope="col">Tu versión</th>
          <th scope="col">Versión actual</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.field"
          :class="{ overlap: row.overlap }"
        >
          <th scope="row">{{ labelFor(row.field) }}</th>
          <td>{{ show(row.mine) }}</td>
          <td>{{ show(row.theirs) }}</td>
        </tr>
      </tbody>
    </table>
    <div class="c-actions">
      <Button
        label="Reaplicar mis cambios"
        variant="solid"
        :disabled="!canReapply"
        @click="$emit('reapply')"
      /><Button label="Usar la versión actual" @click="$emit('discard')" />
    </div>
  </section>
</template>
<script setup>
import { optionLabel } from '@/utils/contactos'
const props = defineProps({
  rows: { type: Array, default: () => [] },
  overlap: Boolean,
  canReapply: { type: Boolean, default: true },
  labels: { type: Object, default: () => ({}) },
  title: { type: String, default: 'Comparar con la versión actual' },
})
defineEmits(['reapply', 'discard'])
const labelFor = (field) => props.labels[field] || field
function show(value) {
  if (value === '' || value == null) return 'Sin dato'
  if (Array.isArray(value))
    return (
      value
        .map((row) =>
          typeof row === 'object' ? row.phone || row.email_id || '' : row,
        )
        .filter(Boolean)
        .join(', ') || 'Sin dato'
    )
  if (typeof value === 'object') return 'Revisar'
  return optionLabel(value)
}
</script>
