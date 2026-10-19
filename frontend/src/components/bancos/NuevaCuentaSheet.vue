<template>
  <!-- «Nueva cuenta» inside a group: name, optional number, account or group.
       Frappe decides who may create accounts (Accounts Manager). -->
  <BottomSheet
    :open="open"
    title="Nueva cuenta"
    :subtitle="`Dentro de ${parent.label}`"
    :dismissible="!busy"
    layer="bancos-nueva-cuenta"
    @update:open="(v) => emit('update:open', v)"
  >
    <form
      id="bancos-nueva-cuenta"
      class="space-y-4"
      data-bancos-nueva-cuenta-form
      @submit.prevent="save"
    >
      <FormControl
        v-model="form.account_name"
        type="text"
        label="Nombre"
        placeholder="Por ejemplo: Banorte nómina"
        required
        class="[&_input]:min-h-11"
      />
      <FormControl
        v-model="form.account_number"
        type="text"
        label="Número (opcional)"
        placeholder="Por ejemplo: 1020-03"
        class="[&_input]:min-h-11"
      />
      <Segmented
        v-model="form.kind"
        :options="[
          { value: 'cuenta', label: 'Cuenta' },
          { value: 'grupo', label: 'Grupo de cuentas' },
        ]"
        label="Qué es"
      />
      <p class="text-sm text-ink-gray-6">
        {{
          form.kind === 'grupo'
            ? 'Un grupo junta cuentas; no recibe movimientos.'
            : 'Una cuenta recibe cobros, pagos y pólizas.'
        }}
        Su tipo es {{ parent.root_word.toLowerCase() }}, como su grupo.
      </p>
      <p
        v-if="problem"
        role="alert"
        class="rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
      >
        {{ problem }}
      </p>
    </form>
    <template #actions>
      <Button
        class="min-h-11 w-full"
        variant="solid"
        type="submit"
        form="bancos-nueva-cuenta"
        label="Crear cuenta"
        :loading="busy"
        :disabled="!form.account_name.trim()"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { reactive, ref, watch } from 'vue'
import { Button, FormControl, toast } from 'frappe-ui'
import { BottomSheet, Segmented } from '@/components/ui'
import { bancosApi, errorText } from './bancos'

const props = defineProps({
  open: { type: Boolean, default: false },
  parent: { type: Object, required: true },
})
const emit = defineEmits(['update:open', 'created'])
const busy = ref(false)
const problem = ref('')
const form = reactive({ account_name: '', account_number: '', kind: 'cuenta' })

watch(
  () => props.open,
  (open) => {
    if (!open) return
    Object.assign(form, {
      account_name: '',
      account_number: '',
      kind: 'cuenta',
    })
    problem.value = ''
  },
)

async function save() {
  if (busy.value || !form.account_name.trim()) return
  busy.value = true
  problem.value = ''
  try {
    const result = await bancosApi('crear_cuenta', {
      parent: props.parent.name,
      account_name: form.account_name.trim(),
      account_number: form.account_number.trim(),
      is_group: form.kind === 'grupo' ? 1 : 0,
    })
    toast.success(`Cuenta «${result.label}» creada`)
    emit('update:open', false)
    emit('created', result.name)
  } catch (error) {
    problem.value = errorText(error)
  } finally {
    busy.value = false
  }
}
</script>
