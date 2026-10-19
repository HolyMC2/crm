<template>
  <!-- «Creado desde» (Shell SPEC §6 DD6, D2): Cotización → Pedido → Entrega →
       Factura → Cobro, from the first step this sale has. Each step says where
       it is in words and opens its document (or the list of them); the current
       one is this record. A vertical stepper, so it reads at 305px. -->
  <section
    v-if="steps.length > 1"
    aria-labelledby="doc-cadena"
    class="px-4"
    data-testid="ventas-cadena"
  >
    <h2 id="doc-cadena" class="pb-1 text-base font-semibold text-ink-gray-9">
      Creado desde
    </h2>
    <ol class="cadena">
      <li
        v-for="(step, i) in steps"
        :key="step.key"
        class="cadena-step relative"
        :class="[`is-${step.state}`, { 'is-current': step.current }]"
        :aria-current="step.current ? 'step' : undefined"
        data-testid="ventas-cadena-step"
      >
        <span
          v-if="i < steps.length - 1"
          class="cadena-bar"
          aria-hidden="true"
        />
        <component
          :is="step.to && !step.current ? RouterLink : 'div'"
          :to="step.to && !step.current ? step.to : undefined"
          class="flex min-h-12 items-center gap-3 rounded-lg py-1.5 pr-1"
          :class="step.to && !step.current ? 'hover:bg-surface-gray-1' : ''"
        >
          <span
            class="cadena-dot flex size-6 flex-none items-center justify-center rounded-full"
            aria-hidden="true"
          >
            <span v-if="step.state === 'done'" class="lucide-check size-4" />
          </span>
          <span class="flex min-w-0 flex-1 flex-col">
            <span
              class="text-base text-ink-gray-9"
              :class="step.current ? 'font-semibold' : ''"
            >
              {{ step.label
              }}<span v-if="step.current" class="font-normal text-ink-gray-6">
                · este documento</span
              >
            </span>
            <span
              class="break-words text-sm"
              :class="
                step.state === 'none' ? 'text-ink-gray-5' : 'text-ink-gray-7'
              "
              >{{ step.line }}</span
            >
          </span>
          <span
            v-if="step.to && !step.current"
            class="lucide-chevron-right size-5 flex-none text-ink-gray-5"
            aria-hidden="true"
          />
        </component>
      </li>
    </ol>
  </section>
  <p
    v-else-if="error"
    class="px-4 text-sm text-ink-gray-6"
    data-testid="ventas-cadena-error"
  >
    No se pudo leer de dónde viene este documento.
  </p>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { shellBoot } from '@/composables/muelleShell'
import { kindLabel } from '@/utils/display'
import { loadOrigen, stepView } from './origen'

const props = defineProps({
  record: { type: Object, required: true },
  doctype: { type: String, default: '' },
  name: { type: String, default: '' },
})

const data = ref(null)
const error = ref(false)

const scopeLabel = computed(() => {
  const kind = (kindLabel(props.record.doctype) || 'documento').toLowerCase()
  const title = props.record.header?.title || ''
  return title ? `la cadena de ${kind} de ${title}` : ''
})
const steps = computed(() =>
  (data.value?.steps || []).map((s) =>
    stepView(s, { boot: shellBoot.value, scopeLabel: scopeLabel.value }),
  ),
)

watch(
  () => [props.record.name, props.record.modified],
  async () => {
    error.value = false
    try {
      data.value = await loadOrigen(props.record)
    } catch {
      data.value = null
      error.value = true
    }
  },
  { immediate: true },
)
</script>
<style scoped>
.cadena-step {
  --dot: var(--ink-gray-4, #bbb);
}
.cadena-step.is-done,
.cadena-step.is-partial {
  --dot: var(--ink-green-6, #30a66d);
}
.cadena-step.is-draft {
  --dot: var(--ink-amber-6, #d97706);
}
.cadena-dot {
  border: 2px solid var(--dot);
  background: var(--surface-base, transparent);
  position: relative;
  z-index: 1;
  color: #fff;
}
.is-done .cadena-dot {
  background: var(--dot);
}
.is-partial .cadena-dot {
  background: linear-gradient(90deg, var(--dot) 50%, transparent 50%);
}
.is-current .cadena-dot {
  box-shadow: 0 0 0 3px var(--surface-gray-3, #ddd);
}
.cadena-bar {
  position: absolute;
  left: 0.6875rem;
  top: 2.25rem;
  bottom: -0.75rem;
  width: 2px;
  background: var(--outline-gray-2, #ddd);
}
.is-done .cadena-bar {
  background: var(--ink-green-6, #30a66d);
}
</style>
