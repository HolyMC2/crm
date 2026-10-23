<template>
  <!-- «Cómo se hizo» (Ajustes de inventario): who created this adjustment, from
       which count, its Motivo, any note and the store its rows moved. The data
       comes from Actividad — a Stock Reconciliation has no reason or origin
       field — so an adjustment with no notes reads «Sin registro» instead of
       guessing: these used to be quick quantity edits with no trace. -->
  <section
    v-if="rows.length"
    aria-labelledby="doc-ajuste-origen"
    class="px-4"
    data-testid="documentos-ajuste-origen"
  >
    <h2
      id="doc-ajuste-origen"
      class="pb-1 text-base font-semibold text-ink-gray-9"
    >
      Cómo se hizo
    </h2>
    <ul>
      <li
        v-for="row in rows"
        :key="row.key"
        class="flex min-h-12 items-start gap-3 py-2"
        :data-ajuste-origen="row.key"
      >
        <span
          :class="[row.icon, 'mt-0.5 size-5 flex-none text-ink-gray-6']"
          aria-hidden="true"
        />
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="text-sm text-ink-gray-6">{{ row.label }}</span>
          <a
            v-if="row.to"
            :href="row.to"
            target="_blank"
            rel="noopener"
            class="flex items-center gap-1 break-words text-base text-ink-gray-9 underline decoration-outline-gray-3 underline-offset-4"
            data-testid="documentos-ajuste-tarea"
          >
            {{ row.value }}
            <span
              class="lucide-external-link size-4 flex-none text-ink-gray-5"
              aria-hidden="true"
            />
          </a>
          <span
            v-else
            class="break-words text-base"
            :class="row.muted ? 'text-ink-gray-5' : 'text-ink-gray-9'"
            >{{ row.value }}</span
          >
          <span v-if="row.detail" class="break-words text-sm text-ink-gray-6">{{
            row.detail
          }}</span>
        </span>
      </li>
    </ul>
  </section>
</template>
<script setup>
import { computed } from 'vue'
import { ajusteOrigin } from './ajusteOrigen'

const props = defineProps({
  record: { type: Object, default: null },
  doctype: { type: String, default: '' },
  name: { type: String, default: '' },
})
const rows = computed(() => ajusteOrigin(props.record || {}))
</script>
