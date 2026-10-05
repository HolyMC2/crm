<template>
  <div
    v-if="availability?.available === false"
    role="status"
    class="space-y-2 border-b border-outline-gray-2 p-4 text-sm text-ink-gray-7"
  >
    <p>{{ availability.message || 'Esta sección no está disponible.' }}</p>
    <div class="flex flex-wrap gap-2">
      <Button label="Reintentar sección" @click="$emit('retry')" /><Button
        :label="
          availability.resolver === 'request_configuration'
            ? 'Pedir configuración'
            : 'Pedir acceso'
        "
        @click="request"
      />
    </div>
    <p v-if="message">{{ message }}</p>
  </div>
</template>
<script setup>
import { ref } from 'vue'
const props = defineProps({ availability: Object })
defineEmits(['retry'])
const message = ref('')
async function request() {
  const text = `Necesito continuar en Contactos: ${props.availability.message || 'revisar acceso a esta sección'}. Revisa la configuración y mis permisos de lectura en la aplicación que guarda esos registros.`
  try {
    await navigator.clipboard.writeText(text)
    message.value =
      'Solicitud copiada. Compártela con el encargado y después reintenta.'
  } catch {
    message.value = text
  }
}
</script>
