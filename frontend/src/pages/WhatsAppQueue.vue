<!--
  Mensajes por revisar — the supervised WhatsApp Send Review queue, in the SPA so it
  no longer lives only in Desk. Auto rows (orden_recibida) self-send and show as
  Enviado; supervised rows (e.g. "ya está listo") wait here as Pendiente for a human
  to approve. Data + actions: doco_marketing.api.review_queue.*
  Pendientes «Por aprobar» lists the waiting messages as one row that opens this
  page with `return_to`; back goes there with `done` once something was decided.
-->
<template>
  <div
    class="scb flex min-h-0 w-full flex-1 flex-col overflow-y-auto bg-surface-gray-2"
  >
    <!-- toolbar (a phone has the title in the shell bar and the count on the
         chip; it keeps only the way back when it was opened from elsewhere) -->
    <div
      v-if="!isMobile || back"
      class="flex min-h-[52px] flex-none flex-wrap items-center justify-between gap-2 border-b border-outline-gray-1 bg-surface-base px-5 py-1.5"
    >
      <div class="flex min-w-0 items-center gap-2">
        <button
          v-if="back"
          class="flex min-h-11 items-center gap-1 rounded-lg pr-2 text-sm text-ink-gray-7 hover:text-ink-gray-9 sm:min-h-8"
          @click="goBack"
        >
          <FeatherIcon name="arrow-left" class="h-4 w-4" />
          {{ __('Back to {0}', [back.label]) }}
        </button>
        <span
          v-if="!isMobile"
          class="truncate text-[15px] font-bold text-ink-gray-9"
          >{{ __('Messages to review') }}</span
        >
        <span
          v-if="pendingCount && !isMobile"
          class="rounded-full bg-surface-amber-1 px-2 py-0.5 text-[11px] font-semibold text-ink-amber-9"
          >{{ pendingCount }} {{ __('pendientes') }}</span
        >
      </div>
      <button
        v-if="!isMobile"
        class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink-gray-7"
        :disabled="queue.loading"
        @click="queue.reload()"
      >
        {{ queue.loading ? __('Cargando…') : __('Actualizar') }}
      </button>
    </div>

    <div :class="isMobile ? 'px-4 py-3' : 'p-5'">
      <FilterChips
        v-if="isMobile"
        v-model="status"
        class="mb-3"
        :chips="phoneChips"
        :deselectable="false"
        :label="__('Estado del mensaje')"
      />
      <!-- status filter pills -->
      <div v-else class="mb-4 flex flex-wrap gap-1.5">
        <button
          v-for="f in filters"
          :key="f.value"
          class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-semibold transition-colors"
          :class="
            status === f.value
              ? 'bg-surface-gray-10 text-ink-base'
              : 'bg-surface-base text-ink-gray-7 border border-outline-gray-2 hover:bg-surface-gray-2'
          "
          @click="status = f.value"
        >
          {{ __(f.label) }}
          <span
            v-if="badgeCount(f.value)"
            class="rounded-full px-1.5 text-[10.5px] leading-4"
            :class="
              status === f.value
                ? 'bg-surface-base/20'
                : f.value === 'Fallido'
                  ? 'bg-surface-red-1 text-ink-red-8'
                  : 'bg-surface-amber-1 text-ink-amber-9'
            "
            >{{ badgeCount(f.value) }}</span
          >
        </button>
      </div>

      <div
        v-if="queue.loading && !rows.length"
        class="py-16 text-center text-sm text-ink-gray-4"
      >
        {{ __('Cargando…') }}
      </div>
      <div
        v-else-if="!rows.length"
        class="py-16 text-center text-sm text-ink-gray-4"
      >
        {{ __('No hay mensajes en') }} «{{ __(currentLabel) }}».
      </div>
      <div v-else class="mx-auto flex max-w-[760px] flex-col gap-2.5">
        <WhatsAppReviewCard
          v-for="row in rows"
          :key="row.name"
          :row="row"
          :hide-status="row.status === status"
          @changed="onChanged"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import WhatsAppReviewCard from '@/components/doco/WhatsAppReviewCard.vue'
import { createResource, FeatherIcon } from 'frappe-ui'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { completeTo, goTo, ownerReturn } from '@/composables/useAprobaciones'
import { FilterChips } from '@/components/ui'
import { isMobile } from '@/composables/breakpoint'

const filters = [
  { label: 'Pendiente', value: 'Pendiente' },
  { label: 'Fallido', value: 'Fallido' },
  { label: 'Enviado', value: 'Enviado' },
  { label: 'Cancelado', value: 'Cancelado' },
  { label: 'Todos', value: 'Todos' },
]
const route = useRoute()
const router = useRouter()
const status = ref('Pendiente')
const HISTORY = 'Enviado,Cancelado'
const currentLabel = computed(() =>
  status.value === HISTORY
    ? 'Historial'
    : filters.find((f) => f.value === status.value)?.label || status.value,
)
// Opened from Pendientes «Por aprobar» (or Hoy): the way back, validated.
const back = computed(() => ownerReturn(route.query))
// Something was sent or cancelled here: the list re-reads and says so.
const acted = ref(false)

const queue = createResource({
  url: 'doco_marketing.api.review_queue.get_queue',
  makeParams: () => ({ status: status.value, limit: 100 }),
  auto: true,
})
const rows = computed(() => queue.data || [])

// pending / failed badges (toolbar + filter pills) — independent of the active filter
const pendingRes = createResource({
  url: 'doco_marketing.api.review_queue.counts',
  auto: true,
})
const pendingCount = computed(() => pendingRes.data?.pendiente || 0)
function badgeCount(filterValue) {
  const c = pendingRes.data || {}
  return { Pendiente: c.pendiente, Fallido: c.fallido }[filterValue] || 0
}
// Phone chips: three in plain words, counts where they matter. Sent and
// cancelled are both done, so they read as one «Historial» (the API takes a
// comma list of statuses).
const phoneChips = computed(() => [
  {
    value: 'Pendiente',
    label: __('Por enviar'),
    count: badgeCount('Pendiente') || undefined,
  },
  {
    value: 'Fallido',
    label: __('Fallidos'),
    count: badgeCount('Fallido') || undefined,
  },
  { value: HISTORY, label: __('Historial') },
])

watch(status, () => queue.reload())

function onChanged() {
  acted.value = true
  queue.reload()
  pendingRes.reload()
}

function goBack() {
  if (!back.value) return
  goTo(
    router,
    acted.value
      ? completeTo(back.value.to, 'WhatsApp Send Review', 'Pendiente')
      : back.value.to,
  )
}
</script>
