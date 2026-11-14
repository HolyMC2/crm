<template>
  <!-- Offer: a Mexican company with the aguinaldo switch off, for the owner. -->
  <RouterLink
    v-if="card?.kind === 'offer'"
    :to="comoPagoTo"
    class="press mb-4 flex min-h-16 items-center gap-3 rounded-8 border border-outline-gray-2 p-3 hover:bg-surface-gray-1"
    data-testid="aguinaldo-oferta"
  >
    <span class="min-w-0 flex-1">
      <span class="block text-base font-semibold text-ink-gray-9">{{
        __('¿Quieres que Muelle calcule el aguinaldo?')
      }}</span>
      <span class="block text-sm text-ink-gray-6">{{
        __(
          'Se acerca el aguinaldo: vence el 20 de diciembre. Actívalo en «¿Cómo pagas a tu equipo?».',
        )
      }}</span>
    </span>
    <span
      class="lucide-chevron-right size-5 flex-none text-ink-gray-5"
      aria-hidden="true"
    />
  </RouterLink>

  <button
    v-else-if="card?.kind === 'summary'"
    type="button"
    class="press mb-4 flex min-h-16 w-full items-center gap-3 rounded-8 border border-outline-gray-2 p-3 text-left hover:bg-surface-gray-1"
    data-testid="aguinaldo-tarjeta"
    @click="open = true"
  >
    <span class="min-w-0 flex-1">
      <span class="block text-base font-semibold text-ink-gray-9">{{
        __('Aguinaldo {0}', [card.year])
      }}</span>
      <span
        class="block text-sm text-ink-gray-6"
        data-testid="aguinaldo-tarjeta-resumen"
        >{{ summaryLine }}</span
      >
      <span
        v-if="card.faltanDatos"
        class="block text-sm text-ink-amber-8"
        data-testid="aguinaldo-tarjeta-faltan"
        >{{
          card.faltanDatos === 1
            ? __('A 1 persona le falta un dato')
            : __('A {0} personas les falta un dato', [card.faltanDatos])
        }}</span
      >
    </span>
    <span
      class="lucide-chevron-right size-5 flex-none text-ink-gray-5"
      aria-hidden="true"
    />
  </button>

  <AguinaldoSheet
    v-if="card?.kind === 'summary' && opened"
    v-model:open="open"
    :preview="preview"
    :can-apply="canApply"
    @applied="load"
    @stale="onStale"
  />
</template>
<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  AGUINALDO_PREVIEW,
  COMO_PAGO_ROUTE,
  aguinaldoCanApply,
  aguinaldoCard,
  aguinaldoSeason,
  dayLabel,
  equipoApi,
} from '@/composables/useEquipo'
import { money } from '@/utils/numberFormat'

// The sheet mounts on its first open.
const AguinaldoSheet = defineAsyncComponent(
  () => import('@/components/equipo/AguinaldoSheet.vue'),
)

const props = defineProps({
  /** doco.nomina ajustes_get's answer (null when the site has none). */
  ajustes: { type: Object, default: null },
})

const route = useRoute()
const preview = ref(null)
const open = ref(false)
const opened = ref(false)
watch(open, (value) => value && (opened.value = true))

const canEdit = computed(() => Boolean(props.ajustes?.can_edit))
const card = computed(() =>
  aguinaldoCard(preview.value, { canEdit: canEdit.value }),
)
const canApply = computed(() =>
  aguinaldoCanApply(preview.value, { canEdit: canEdit.value }),
)
const comoPagoTo = computed(() => ({
  ...COMO_PAGO_ROUTE,
  query: { list: route.fullPath },
}))
const summaryLine = computed(() => {
  const c = card.value
  if (!c) return ''
  const amount = c.falta === null ? grossLine(c) : owedLine(c)
  return c.fechaLimite
    ? window.__('{0}; vence el {1}', [amount, dayLabel(c.fechaLimite)])
    : amount
})
function grossLine(c) {
  return c.conMonto === 1
    ? window.__('{0} para 1 persona', [money(c.importe)])
    : window.__('{0} para {1} personas', [money(c.importe), c.conMonto])
}
/** What is still due once doco counts what was paid or left at the register. */
function owedLine(c) {
  if (c.falta > 0)
    return c.faltaPersonas === 1
      ? window.__('Te falta pagar {0} a 1 persona', [money(c.falta)])
      : window.__('Te falta pagar {0} a {1} personas', [
          money(c.falta),
          c.faltaPersonas,
        ])
  if (c.porEntregar > 0)
    return window.__('{0} por entregar en la caja', [money(c.porEntregar)])
  if (c.pagado > 0) return window.__('Ya se pagó {0}', [money(c.pagado)])
  return grossLine(c)
}
function onStale(next) {
  if (next && typeof next === 'object') {
    asked++
    preview.value = next
  } else load()
}

let asked = 0
async function load() {
  if (!aguinaldoSeason()) return
  const ticket = ++asked
  try {
    const next = await equipoApi(AGUINALDO_PREVIEW)
    if (ticket === asked) preview.value = next
  } catch {
    if (ticket === asked) preview.value = null
  }
}
load()
</script>
