<template>
  <!-- «Creado desde» (Shell SPEC §6 DD6/DD7): the purchase chain of this record,
       Requisición → Cotización → Orden → Recepción → Factura → Pago, one line
       per document with who did its step (pidió, aprobó, recibió, pagó). The
       next step that has not happened yet waits in grey. -->
  <section
    v-if="steps.length > 1 || pending"
    aria-labelledby="doc-cadena"
    class="px-4"
    data-testid="compras-cadena"
  >
    <h2 id="doc-cadena" class="pb-2 text-base font-semibold text-ink-gray-9">
      Creado desde
    </h2>
    <ol class="cadena">
      <li
        v-for="step in steps"
        :key="`${step.doctype}-${step.name}`"
        class="cadena-step"
        :class="{ here: step.here }"
        data-testid="compras-cadena-step"
      >
        <span class="dot" aria-hidden="true">
          <span :class="[ICONS[step.stage], 'size-4']" />
        </span>
        <component
          :is="step.to ? RouterLink : 'div'"
          :to="step.to || undefined"
          class="flex min-h-12 min-w-0 flex-1 items-start justify-between gap-3 rounded-lg py-1.5"
          :class="step.to ? 'hover:bg-surface-gray-1' : ''"
          :aria-current="step.here ? 'page' : undefined"
        >
          <span class="flex min-w-0 flex-col gap-0.5">
            <span class="text-base leading-snug text-ink-gray-9">
              {{ step.label
              }}<span v-if="step.here" class="text-ink-gray-6">
                · este documento</span
              >
            </span>
            <span class="break-words text-sm text-ink-gray-7">{{
              step.line
            }}</span>
            <span
              v-for="(who, i) in step.people"
              :key="i"
              class="break-words text-sm text-ink-gray-6"
              >{{ who }}</span
            >
          </span>
          <span
            v-if="step.amount"
            class="flex-none whitespace-nowrap text-sm tabular-nums text-ink-gray-8"
            >{{ step.amount }}</span
          >
        </component>
      </li>
      <li
        v-if="pending"
        class="cadena-step waiting"
        data-testid="compras-cadena-pending"
      >
        <span class="dot" aria-hidden="true">
          <span :class="[ICONS[pending.key], 'size-4']" />
        </span>
        <span class="flex min-h-12 flex-col justify-center py-1.5">
          <span class="text-base text-ink-gray-6">{{ pending.label }}</span>
          <span class="text-sm text-ink-gray-5">{{ pending.line }}</span>
        </span>
      </li>
    </ol>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { call } from 'frappe-ui'
import { documentRoute } from '@/documentos/registry'
import { shellBoot } from '@/composables/muelleShell'
import { formatDate, formatMoney, statusLabel } from '@/utils/display'
import { chainSteps, pendingStep } from './cadena'
import { requestShort } from './words'

const props = defineProps({
  doctype: { type: String, required: true },
  name: { type: String, required: true },
  // The engine passes the record bundle; the richer pages do not need to.
  record: { type: Object, default: null },
})

const ICONS = {
  requisicion: 'lucide-list-checks',
  cotizacion: 'lucide-file-text',
  orden: 'lucide-shopping-cart',
  recepcion: 'lucide-package-open',
  factura: 'lucide-receipt',
  pago: 'lucide-wallet',
}

const data = ref(null)

const steps = computed(() =>
  chainSteps(data.value).map((step) => ({
    ...step,
    to:
      step.here || step.hidden
        ? null
        : documentRoute(step.doctype, step.name, {
            boot: shellBoot.value,
            hint:
              step.doctype === 'Payment Entry' ? { payment_type: 'Pay' } : null,
          }),
    line: [
      step.doctype === 'Material Request'
        ? requestShort(step.title)
        : step.title,
      statusLabel(step.status),
      step.date ? formatDate(step.date) : '',
    ]
      .filter(Boolean)
      .join(' · '),
    people: (step.people || []).map(
      (p) => `${p.verb} ${p.name}${p.when ? ` · ${formatDate(p.when)}` : ''}`,
    ),
    amount:
      step.amount != null && Number(step.amount)
        ? formatMoney(step.amount, step.currency || 'MXN')
        : '',
  })),
)
const pending = computed(() => pendingStep(data.value))

let seq = 0
async function load() {
  const mine = ++seq
  try {
    const answer = await call('crm.api.documentos_compras.cadena', {
      doctype: props.doctype,
      name: props.name,
    })
    if (mine === seq) data.value = answer
  } catch {
    if (mine === seq) data.value = null
  }
}

watch(
  () => [props.doctype, props.name, props.record?.modified],
  () => load(),
  { immediate: true },
)

defineExpose({ reload: load })
</script>
<style scoped>
.cadena-step {
  position: relative;
  display: flex;
  gap: 0.75rem;
}
.dot {
  position: relative;
  z-index: 1;
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  margin-top: 0.5rem;
  border-radius: 9999px;
  background: var(--surface-gray-2, #f3f3f3);
  color: var(--text-ink-gray-7, #525252);
}
.here .dot {
  background: var(--text-ink-gray-9, #171717);
  color: var(--surface-white, #fff);
}
.waiting .dot {
  background: transparent;
  border: 1.5px dashed var(--outline-gray-3, #c7c7c7);
  color: var(--text-ink-gray-5, #999);
}
/* The line that ties one step to the next. */
.cadena-step:not(:last-child)::before {
  content: '';
  position: absolute;
  left: calc(1rem - 1px);
  top: 2.5rem;
  bottom: -0.5rem;
  width: 2px;
  background: var(--outline-gray-2, #e2e2e2);
}
</style>
