<template>
  <!-- A customer's sales (Shell D2, for Contacto «Relaciones»): one chip per
       list with its count; a chip opens the list filtered to the customer
       («Filtros» › Cliente), every state («Todos»), so the way back is Contacto. -->
  <div
    v-if="chips.length"
    class="flex flex-col gap-1 pt-2"
    data-testid="ventas-del-cliente"
  >
    <p class="text-sm text-ink-gray-6">
      {{ title ? `Ventas de ${title}` : 'Ventas' }}
    </p>
    <div class="flex flex-wrap gap-2">
      <RouterLink
        v-for="chip in chips"
        :key="chip.doctype"
        :to="chip.to"
        class="inline-flex min-h-11 items-center gap-2 rounded-lg border border-outline-gray-2 px-3 text-base text-ink-gray-8 hover:bg-surface-gray-1"
        :data-doctype="chip.doctype"
      >
        <span>{{ chip.label }}</span>
        <span class="tabular-nums text-ink-gray-6">{{ chip.count }}</span>
        <span
          v-if="chip.open"
          class="text-sm text-ink-amber-7"
          :aria-label="`${chip.open} ${chip.attention}`"
          >· {{ chip.open }} {{ chip.attention }}</span
        >
      </RouterLink>
    </div>
  </div>
</template>
<script setup>
import { call } from 'frappe-ui'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { shellBoot } from '@/composables/muelleShell'
import { profileFor, readableDoctypes } from '@/documentos/registry'
import { customerListRoute } from './origen'

const props = defineProps({
  customer: { type: String, required: true },
  title: { type: String, default: '' },
})

const found = ref([])

const chips = computed(() => {
  const readable = readableDoctypes(shellBoot.value)
  return found.value
    .filter((row) => !readable || readable.has(row.doctype))
    .map((row) => {
      const entry = profileFor(
        row.doctype,
        row.doctype === 'Payment Entry' ? { payment_type: 'Receive' } : null,
      )
      return {
        ...row,
        label: entry?.label || row.doctype,
        attention: entry?.attention || '',
        to: customerListRoute(row.doctype, row.field, props.customer),
      }
    })
    .filter((chip) => chip.to)
})

watch(
  () => props.customer,
  async (customer) => {
    found.value = []
    if (!customer) return
    try {
      found.value =
        (await call('crm.api.documentos_ventas.ventas_del_cliente', {
          customer,
        })) || []
    } catch {
      found.value = []
    }
  },
  { immediate: true },
)
</script>
