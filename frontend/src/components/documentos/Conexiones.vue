<template>
  <!-- Conexiones (Shell SPEC §6 DD6): Desk's connections of this document, by
       the doctype's groups, as chips with counts. A chip opens the target list
       scoped to this record; empty ones stay out (they are create actions, D1.2). -->
  <section v-if="groups.length" aria-labelledby="doc-conexiones" class="px-4">
    <h2
      id="doc-conexiones"
      class="pb-2 text-base font-semibold text-ink-gray-9"
    >
      Conexiones
    </h2>
    <div v-for="group in groups" :key="group.label" class="pb-3">
      <p v-if="group.label" class="pb-1 text-sm text-ink-gray-6">
        {{ group.label }}
      </p>
      <div class="flex flex-wrap gap-2">
        <RouterLink
          v-for="item in group.items"
          :key="item.doctype"
          :to="item.to"
          class="inline-flex min-h-11 items-center gap-2 rounded-lg border border-outline-gray-2 px-3 text-base text-ink-gray-8 hover:bg-surface-gray-1"
          data-testid="documentos-connection"
        >
          <span>{{ item.label }}</span>
          <span class="tabular-nums text-ink-gray-6">{{ item.count }}</span>
        </RouterLink>
      </div>
    </div>
  </section>
</template>
<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { floorRoute, listRoute, profileFor } from '@/documentos/registry'
import { kindLabel } from '@/utils/display'

const props = defineProps({
  connections: { type: Array, default: () => [] },
  // «Factura de Ana López», shown on the target list as its scope.
  scopeLabel: { type: String, default: '' },
})

// A connection's list: the curated list when there is one (all its chips),
// else the generic floor; scoped by the server's filter for this record.
function targetRoute(item) {
  const query = {
    de: JSON.stringify(item.filters || []),
    de_label: props.scopeLabel,
  }
  const entry = profileFor(item.doctype)
  if (entry) return listRoute(entry, { ...query, estado: '' })
  return { ...floorRoute(item.doctype), query }
}

const groups = computed(() =>
  props.connections
    .map((group) => ({
      label: group.label,
      items: group.items
        .filter((item) => item.count && item.filters)
        .map((item) => ({
          ...item,
          // «Cobros», «Entregas»: the list's own name, else the kind word.
          label:
            profileFor(item.doctype)?.label ||
            kindLabel(item.doctype) ||
            item.label,
          to: targetRoute(item),
        })),
    }))
    .filter((group) => group.items.length),
)
</script>
