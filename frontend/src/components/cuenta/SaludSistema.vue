<template>
  <!-- «Salud de tu sistema» (capability «health»): whether it works now, the
       last 30 days' availability and speed, a bar per day and how many things
       the owner can fix; one tap opens the detail. Nothing shows without the
       capability or while Boat has it off; a failed read is one quiet line
       with «Volver a intentar», never a toast. Rows and rules. -->
  <section
    v-if="shown"
    aria-labelledby="cuenta-salud"
    class="border-b border-outline-gray-1 pb-4"
    data-testid="cuenta-salud"
  >
    <h2 id="cuenta-salud" class="pb-1 text-sm font-semibold text-ink-gray-7">
      {{ __('Your system’s health', null, 'Cuenta') }}
    </h2>
    <p
      v-if="!view && !failed"
      class="py-2 text-base text-ink-gray-6"
      role="status"
    >
      {{ __('Checking your system…', null, 'Cuenta') }}
    </p>
    <div
      v-else-if="failed"
      class="flex flex-wrap items-center gap-x-3 gap-y-2 py-1"
      role="status"
      data-testid="salud-sin-lectura"
    >
      <p class="min-w-0 flex-1 basis-48 text-base text-ink-gray-7">
        {{ __('We could not read your system’s health.', null, 'Cuenta') }}
      </p>
      <Button
        class="min-h-11"
        :loading="busy"
        :label="__('Try once more', null, 'Cuenta')"
        @click="load"
      />
    </div>
    <button
      v-else
      type="button"
      class="press block w-full rounded text-left"
      aria-haspopup="dialog"
      data-testid="salud-abrir"
      @click="openSheet"
    >
      <span class="flex items-center gap-2 py-1">
        <span
          v-if="view.status"
          :class="[ICON[view.status.tone], INK[view.status.tone]]"
          class="size-5 flex-none"
          aria-hidden="true"
        />
        <span
          class="min-w-0 flex-1 text-base font-semibold"
          :class="view.status ? INK[view.status.tone] : 'text-ink-gray-9'"
          data-testid="salud-estado"
        >
          {{ view.status ? view.status.text : view.availability.text }}
        </span>
        <span
          class="lucide-chevron-right size-5 flex-none text-ink-gray-5"
          aria-hidden="true"
        />
      </span>
      <span
        v-if="view.status"
        class="block text-sm text-ink-gray-7"
        data-testid="salud-disponible"
      >
        {{ view.availability.text }}
      </span>
      <span class="block text-sm text-ink-gray-7" data-testid="salud-velocidad">
        {{ view.speed.text }}
      </span>
      <SaludDias
        class="mt-3"
        :days="view.days"
        :first="view.first"
        :summary="view.summary"
      />
      <span
        v-if="view.review"
        class="mt-2 flex items-center gap-2 text-sm font-medium text-ink-amber-8"
        data-testid="salud-revisar"
      >
        <span
          class="lucide-triangle-alert size-4 flex-none"
          aria-hidden="true"
        />
        {{ view.review }}
      </span>
    </button>
    <SaludSheet
      v-if="mounted && view"
      :open="sheetOpen"
      :view="view"
      :actions="actions"
      :blocked="door.paymentActionsBlocked()"
      :blocked-reason="door.paymentActionReason.value"
      @close="sheetOpen = false"
      @act="act"
    />
  </section>
</template>
<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { seam } from './api'
import { capable, seamOff } from './autoservicio'
import { healthView } from './salud'
import SaludDias from './SaludDias.vue'

// The detail mounts on its first open.
const SaludSheet = defineAsyncComponent(() => import('./SaludSheet.vue'))

const props = defineProps({
  /** The page's payment door (pagos.js createPagos). */
  door: { type: Object, required: true },
  /** The next steps the page can open (Cuenta.vue ACTIONS). */
  actions: { type: Array, default: () => [] },
})
const emit = defineEmits(['act'])

// Colour only where there is something to see: «Funcionando bien» is grey.
const INK = {
  ok: 'text-ink-gray-8',
  warn: 'text-ink-amber-8',
  bad: 'text-ink-red-7',
}
const ICON = {
  ok: 'lucide-circle-check',
  warn: 'lucide-triangle-alert',
  bad: 'lucide-circle-alert',
}

const answer = ref(null)
const failed = ref(false)
const busy = ref(false)
const sheetOpen = ref(false)
const mounted = ref(false)
let seq = 0

const data = computed(() => props.door.boot.value)
const on = computed(() => capable(data.value, 'health'))
// Boat answering «disabled» means the block is not offered here.
const shown = computed(() => on.value && !seamOff(answer.value))
const view = computed(() => healthView(answer.value, data.value))

async function load() {
  const mine = ++seq
  if (!on.value) {
    answer.value = null
    failed.value = false
    return
  }
  // A retry keeps its line, with the button's spinner, until Boat answers.
  busy.value = true
  try {
    const out = await seam('site_health')
    if (mine !== seq) return
    answer.value = out
    // A refusal other than «disabled» reads like a failed read.
    failed.value = !seamOff(out) && out?.ok !== true
  } catch {
    if (mine !== seq) return
    answer.value = null
    failed.value = true
  } finally {
    if (mine === seq) busy.value = false
  }
}
// Read with every plan read («Revisar estado» included).
watch(data, load, { immediate: true })

function openSheet() {
  mounted.value = true
  sheetOpen.value = true
}
function act(key) {
  sheetOpen.value = false
  emit('act', key)
}
</script>
