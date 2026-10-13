<template>
  <div v-if="error" class="c-recovery" role="alert">
    <template v-if="guardActions.length"
      ><strong>{{ guard.message }}</strong>
      <div class="c-actions">
        <Button
          v-for="(item, index) in guardActions"
          :key="`${item.kind}:${item.target || index}`"
          :label="item.label"
          :variant="index === 0 ? 'solid' : 'subtle'"
          :data-guard-action="item.kind"
          @click="onAction(item)"
        /></div
    ></template>
    <template v-else>
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
    </template>
  </div>
</template>
<script setup>
import { computed, ref } from 'vue'
import { errorGuard, recovery } from '@/utils/contactos'
const props = defineProps({
  error: [Object, String],
  action: { type: String, default: 'editar contactos' },
  // Listeners as props so a conflict only offers the actions its host handles:
  // Comparar needs @compare; Recargar falls back to @retry.
  onCompare: Function,
  onReload: Function,
  // A host that handles the guard's own actions (Quitar filtro, Reactivar…)
  // shows them instead of the generic recovery, for the guard codes it lists.
  onAction: { type: Function, default: null },
  guardCodes: { type: Array, default: null },
})
defineEmits(['retry'])
const state = computed(() => recovery(props.error)),
  copied = ref(false)
const guard = computed(() => errorGuard(props.error))
const guardActions = computed(() =>
  props.onAction &&
  guard.value?.actions?.length &&
  (!props.guardCodes || props.guardCodes.includes(guard.value.code))
    ? guard.value.actions
    : [],
)
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
