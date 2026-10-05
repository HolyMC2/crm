<template>
  <div v-if="error" class="c-recovery" role="alert">
    <strong>{{ state.title }}</strong>
    <p>{{ state.detail }}</p>
    <div class="c-actions">
      <Button
        v-if="state.kind === 'permission'"
        label="Copiar solicitud de acceso"
        @click="copyRequest"
      />
      <a v-if="state.kind === 'session'" :href="loginUrl" class="c-link"
        >Iniciar sesión</a
      >
      <template v-if="state.kind === 'conflict'"
        ><Button
          v-if="onCompare"
          label="Comparar cambios"
          variant="solid"
          @click="onCompare()" /><Button
          label="Recargar"
          @click="onReload ? onReload() : $emit('retry')"
      /></template>
      <Button
        v-else
        :label="
          state.kind === 'permission' ? 'Reintentar permisos' : 'Reintentar'
        "
        @click="$emit('retry')"
      />
      <span v-if="copied" role="status">Solicitud copiada</span>
    </div>
  </div>
</template>
<script setup>
import { computed, ref } from 'vue'
import { recovery } from '@/utils/contactos'
const props = defineProps({
  error: [Object, String],
  action: { type: String, default: 'editar contactos' },
  // Listeners as props so a conflict only offers the actions its host handles:
  // Comparar needs @compare; Recargar falls back to @retry.
  onCompare: Function,
  onReload: Function,
})
defineEmits(['retry'])
const state = computed(() => recovery(props.error)),
  copied = ref(false)
const loginUrl = `/login?redirect-to=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/crm/contactos')}`
async function copyRequest() {
  const text = `Solicito permiso nativo para ${props.action} en Contactos. Revisa mi usuario y los registros de origen en la tienda.`
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
  } catch {
    copied.value = false
  }
}
</script>
