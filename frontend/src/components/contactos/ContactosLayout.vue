<template>
  <ModuleLayout
    class="c-workspace"
    title="Contactos"
    :entries="entries"
    :active-key="segment"
    :saved-entries="savedEntries"
    saved-label="Segmentos guardados"
    @select="$emit('select', $event)"
  >
    <template #sidebar><slot name="sidebar" /></template>
    <slot />
  </ModuleLayout>
</template>
<script setup>
import './contactos.css'
import { computed } from 'vue'
import ModuleLayout from '@/components/shell/ModuleLayout.vue'
const props = defineProps({
  segment: { type: String, default: 'all' },
  segments: { type: Array, default: () => [] },
})
defineEmits(['select'])
const savedEntries = computed(() =>
  props.segments.map((saved) => ({
    value: saved.name,
    label: saved.label || saved.title || saved.name,
    icon: ['team', 'Team'].includes(saved.visibility) ? 'users' : 'bookmark',
  })),
)
const entries = [
  { value: 'all', label: 'Todos', icon: 'users' },
  { value: 'people', label: 'Personas', icon: 'user' },
  { value: 'companies', label: 'Empresas', icon: 'briefcase' },
  { value: 'customers', label: 'Clientes', icon: 'shopping-bag' },
  { value: 'suppliers', label: 'Proveedores', icon: 'truck' },
  { value: 'followups', label: 'Mis seguimientos', icon: 'check-circle' },
  { value: 'addresses', label: 'Direcciones', icon: 'map-pin' },
]
</script>
