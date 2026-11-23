<template>
  <!-- The door to «Solicitudes de clientes» on /negocio/app-clientes: what
       waits and its count on the accent (the rail's pair), for whoever reads
       at least one of the queues; nobody else sees the block. -->
  <section
    v-if="counts"
    aria-labelledby="solicitudes-puerta-titulo"
    data-testid="solicitudes-puerta-bloque"
  >
    <h2
      id="solicitudes-puerta-titulo"
      class="mb-1 text-sm font-semibold text-ink-gray-7"
    >
      {{ __('What your customers ask', null, CTX) }}
    </h2>
    <RouterLink
      to="/negocio/solicitudes-clientes"
      class="press flex min-h-14 w-full items-center gap-3 py-2 text-left"
      data-testid="solicitudes-puerta"
    >
      <span class="min-w-0 flex-1">
        <span class="block text-base text-ink-gray-9">{{
          __('Customer requests', null, CTX)
        }}</span>
        <span
          class="block text-sm text-ink-gray-6"
          data-solicitudes-puerta-linea
          >{{ line }}</span
        >
      </span>
      <span
        v-if="counts.count"
        class="num inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--muelle-accent)] px-1.5 text-xs font-semibold text-[var(--muelle-accent-ink)]"
        data-solicitudes-puerta-cuenta
        >{{ counts.count > 99 ? '99+' : counts.count }}</span
      >
      <span
        class="lucide-chevron-right size-4 shrink-0 text-ink-gray-5"
        aria-hidden="true"
      />
    </RouterLink>
  </section>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { readCounts } from './api'
import { CTX, doorLine } from './view'

const counts = ref(null)
const line = computed(() => doorLine(counts.value))

onMounted(async () => {
  try {
    const answer = await readCounts()
    counts.value = answer && typeof answer === 'object' ? answer : null
  } catch {
    // No queue to read (or an older cell): no door.
    counts.value = null
  }
})
</script>
