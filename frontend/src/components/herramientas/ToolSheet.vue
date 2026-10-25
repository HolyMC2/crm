<template>
  <BottomSheet
    :open="open"
    :title="row.titulo"
    :subtitle="EFECTO_LABEL[row.efecto]"
    @update:open="(value) => $emit('update:open', value)"
  >
    <div class="space-y-4">
      <p v-if="row.resumen" class="break-words text-base text-ink-gray-8">
        {{ row.resumen }}
      </p>
      <p
        v-if="row.categoria"
        class="rounded-lg bg-surface-amber-1 px-3 py-2 text-sm text-ink-gray-8"
      >
        {{ row.categoria_label }}: viene apagada. Encendida, el asistente
        prepara la acción y siempre la muestra antes de hacerla.
      </p>

      <ul class="divide-y divide-outline-gray-1">
        <li class="flex items-center gap-3 py-1">
          <span class="flex-1 text-base text-ink-gray-9">Encendida</span>
          <AjustesSwitch
            :model-value="Boolean(row.habilitada)"
            label="Encendida"
            :disabled="saving"
            @update:model-value="(v) => emitSave({ habilitada: v ? 1 : 0 })"
          />
        </li>
        <li
          v-if="row.efecto !== 'lectura'"
          class="flex items-center gap-3 py-1"
        >
          <span class="min-w-0 flex-1">
            <span class="block text-base text-ink-gray-9"
              >Pedir confirmación</span
            >
            <span class="block text-sm text-ink-gray-6"
              >Muestra la tarjeta antes de guardar.</span
            >
          </span>
          <AjustesSwitch
            :model-value="Boolean(row.requiere_confirmacion)"
            label="Pedir confirmación"
            :disabled="saving || row.efecto === 'envío'"
            @update:model-value="
              (v) => emitSave({ requiere_confirmacion: v ? 1 : 0 })
            "
          />
        </li>
        <li class="flex items-center gap-3 py-1">
          <span class="min-w-0 flex-1">
            <span class="block text-base text-ink-gray-9"
              >Permitir por MCP</span
            >
            <span class="block text-sm text-ink-gray-6">{{
              mcpOn
                ? 'Otras apps conectadas (como Claude) pueden usarla.'
                : 'El servidor MCP está apagado en el sitio.'
            }}</span>
          </span>
          <AjustesSwitch
            :model-value="Boolean(row.permitir_mcp)"
            label="Permitir por MCP"
            :disabled="saving"
            @update:model-value="(v) => emitSave({ permitir_mcp: v ? 1 : 0 })"
          />
        </li>
        <li class="flex items-center gap-3 py-2">
          <label :for="limitId" class="min-w-0 flex-1">
            <span class="block text-base text-ink-gray-9">Límite al día</span>
            <span class="block text-sm text-ink-gray-6"
              >Usos por persona; 0 es sin límite.</span
            >
          </label>
          <input
            :id="limitId"
            v-model.number="limit"
            type="number"
            inputmode="numeric"
            min="0"
            class="min-h-11 w-24 rounded-lg border border-outline-gray-2 bg-surface-base px-3 text-right text-base text-ink-gray-9"
            :disabled="saving"
            @change="saveLimit"
          />
        </li>
      </ul>

      <div class="space-y-2">
        <h3 class="text-sm font-medium text-ink-gray-7">Quién puede usarla</h3>
        <p v-if="!row.roles?.length" class="text-sm text-ink-gray-6">
          Todos los que ya alcanzan esta herramienta por su puesto.
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <span
            v-for="role in row.roles"
            :key="role"
            class="inline-flex min-h-8 items-center gap-1 rounded-lg border border-outline-gray-2 pl-3 text-sm text-ink-gray-8"
          >
            {{ role }}
            <button
              type="button"
              class="flex size-8 items-center justify-center rounded-lg hover:bg-surface-gray-2"
              :aria-label="`Quitar ${role}`"
              :disabled="saving"
              @click="removeRole(role)"
            >
              <span class="lucide-x size-4" aria-hidden="true" />
            </button>
          </span>
          <label class="relative">
            <span class="sr-only">Agregar puesto o rol</span>
            <select
              class="min-h-11 rounded-lg border border-outline-gray-2 bg-surface-base pl-3 pr-9 text-base text-ink-gray-8"
              :disabled="saving || !available.length"
              @change="addRole($event)"
            >
              <option value="">Agregar rol…</option>
              <option v-for="role in available" :key="role" :value="role">
                {{ role }}
              </option>
            </select>
          </label>
        </div>
      </div>
    </div>
    <template #actions>
      <Button
        v-if="row.cambiada"
        variant="subtle"
        class="min-h-11 w-full"
        label="Volver a como viene"
        :disabled="saving"
        @click="$emit('reset')"
      />
      <Button
        variant="solid"
        class="min-h-11 w-full"
        label="Listo"
        @click="$emit('update:open', false)"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import AjustesSwitch from '@/components/ajustes/AjustesSwitch.vue'
import { EFECTO_LABEL, roles as fetchRoles } from './herramientas'

const props = defineProps({
  open: { type: Boolean, default: false },
  row: { type: Object, required: true },
  saving: { type: Boolean, default: false },
  mcpOn: { type: Boolean, default: false },
})
const emit = defineEmits(['update:open', 'save', 'reset'])

const limitId = `limite-${Math.random().toString(36).slice(2, 8)}`
const limit = ref(props.row.limite_diario || 0)
const allRoles = ref([])
watch(
  () => props.row.limite_diario,
  (value) => (limit.value = value || 0),
)
const available = computed(() =>
  allRoles.value.filter((role) => !(props.row.roles || []).includes(role)),
)

function emitSave(changes) {
  emit('save', changes)
}
function saveLimit() {
  const value = Math.max(0, Math.floor(Number(limit.value) || 0))
  limit.value = value
  if (value !== (props.row.limite_diario || 0))
    emitSave({ limite_diario: value })
}
function addRole(event) {
  const role = event.target.value
  event.target.value = ''
  if (role) emitSave({ roles: [...(props.row.roles || []), role] })
}
function removeRole(role) {
  emitSave({ roles: (props.row.roles || []).filter((r) => r !== role) })
}

onMounted(async () => {
  try {
    allRoles.value = (await fetchRoles()) || []
  } catch {
    allRoles.value = []
  }
})
</script>
