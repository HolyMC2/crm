<!--
  Aprobaciones WhatsApp — the supervised WhatsApp Send Review queue, in the SPA so it
  no longer lives only in Desk. Auto rows (orden_recibida) self-send and show as
  Enviado; supervised rows (e.g. "ya está listo") wait here as Pendiente for a human
  to approve. Data + actions: doco_marketing.api.review_queue.*
-->
<template>
  <div class="scb flex min-h-0 w-full flex-1 flex-col overflow-y-auto bg-surface-gray-2">
    <!-- toolbar -->
    <div class="flex h-[52px] flex-none items-center justify-between border-b border-outline-gray-1 bg-surface-base px-5">
      <div class="flex items-center gap-2">
        <span class="text-[15px] font-bold text-ink-gray-9">{{ __('Aprobaciones WhatsApp') }}</span>
        <span
          v-if="pendingCount"
          class="rounded-full bg-surface-amber-1 px-2 py-0.5 text-[11px] font-semibold text-ink-amber-7"
        >{{ pendingCount }} {{ __('pendientes') }}</span>
      </div>
      <button
        class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink-gray-7"
        :disabled="queue.loading"
        @click="queue.reload()"
      >{{ queue.loading ? __('Cargando…') : __('Actualizar') }}</button>
    </div>

    <div class="p-5">
      <!-- status filter pills -->
      <div class="mb-4 flex flex-wrap gap-1.5">
        <button
          v-for="f in filters"
          :key="f.value"
          class="rounded-full px-3 py-1 text-[12.5px] font-semibold transition-colors"
          :class="status === f.value
            ? 'bg-surface-gray-10 text-ink-base'
            : 'bg-surface-base text-ink-gray-7 border border-outline-gray-2 hover:bg-surface-gray-2'"
          @click="status = f.value"
        >{{ __(f.label) }}</button>
      </div>

      <div v-if="queue.loading && !rows.length" class="py-16 text-center text-sm text-ink-gray-4">
        {{ __('Cargando…') }}
      </div>
      <div v-else-if="!rows.length" class="py-16 text-center text-sm text-ink-gray-4">
        {{ __('No hay mensajes en') }} «{{ __(currentLabel) }}».
      </div>
      <div v-else class="mx-auto flex max-w-[680px] flex-col gap-2.5">
        <WhatsAppReviewCard
          v-for="row in rows"
          :key="row.name"
          :row="row"
          @changed="onChanged"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import WhatsAppReviewCard from '@/components/doco/WhatsAppReviewCard.vue'
import { createResource } from 'frappe-ui'
import { computed, ref, watch } from 'vue'

const filters = [
  { label: 'Pendiente', value: 'Pendiente' },
  { label: 'Fallido', value: 'Fallido' },
  { label: 'Enviado', value: 'Enviado' },
  { label: 'Cancelado', value: 'Cancelado' },
  { label: 'Todos', value: 'Todos' },
]
const status = ref('Pendiente')
const currentLabel = computed(() => filters.find((f) => f.value === status.value)?.label || status.value)

const queue = createResource({
  url: 'doco_marketing.api.review_queue.get_queue',
  makeParams: () => ({ status: status.value, limit: 100 }),
  auto: true,
})
const rows = computed(() => queue.data || [])

// pending badge in the toolbar — independent of the active filter
const pendingRes = createResource({
  url: 'doco_marketing.api.review_queue.counts',
  auto: true,
})
const pendingCount = computed(() => pendingRes.data?.pendiente || 0)

watch(status, () => queue.reload())

function onChanged() {
  queue.reload()
  pendingRes.reload()
}
</script>
