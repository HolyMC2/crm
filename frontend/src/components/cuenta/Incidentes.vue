<template>
  <!-- A Muelle outage on this site (capability «incidents»): Boat's title, since
       when in the site's clock and what the owner notices; «Ya quedó» with how
       long it lasted once fixed. Rows under a rule; amber while open, grey
       once fixed. Nothing shows without the capability or an incident. -->
  <section
    v-if="rows.length"
    class="border-b border-outline-gray-1 pb-4"
    :aria-label="__('Service notices', null, 'Cuenta')"
    data-testid="cuenta-fallas"
  >
    <ul class="divide-y divide-outline-gray-1">
      <li
        v-for="row in rows"
        :key="row.id"
        class="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
        :data-open="row.open ? '1' : '0'"
      >
        <span
          :class="
            row.open
              ? 'lucide-triangle-alert text-ink-amber-8'
              : 'lucide-circle-check text-ink-gray-6'
          "
          class="mt-0.5 size-5 flex-none"
          aria-hidden="true"
        />
        <div class="min-w-0 flex-1 space-y-0.5">
          <p class="text-base font-semibold text-ink-gray-9">
            {{ row.title }}
          </p>
          <p
            v-if="row.when"
            class="text-sm"
            :class="row.open ? 'text-ink-amber-8' : 'text-ink-gray-7'"
          >
            {{ row.when }}
          </p>
          <p v-if="row.detail" class="text-sm text-ink-gray-7">
            {{ row.detail }}
          </p>
        </div>
      </li>
    </ul>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { seam } from './api'
import { capable } from './autoservicio'
import { incidentRows } from './incidentes'

const props = defineProps({
  /** The page's payment door (pagos.js createPagos). */
  door: { type: Object, required: true },
})

const answer = ref(null)
let seq = 0
// Read with every plan read («Revisar estado» included), only where Boat
// offers it; a failure or a refusal shows nothing.
watch(
  () => props.door.boot.value,
  async (data) => {
    const mine = ++seq
    if (!capable(data, 'incidents')) {
      answer.value = null
      return
    }
    try {
      const out = await seam('my_incidents')
      if (mine === seq) answer.value = out
    } catch {
      if (mine === seq) answer.value = null
    }
  },
  { immediate: true },
)
const rows = computed(() => incidentRows(answer.value))
// «open»: whether an outage is on now, so Resumen does not read «Todo en orden» over it.
const emit = defineEmits(['open'])
watch(
  () => rows.value.some((row) => row.open),
  (open) => emit('open', open),
  { immediate: true },
)
</script>
