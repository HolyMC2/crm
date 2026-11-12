<template>
  <!-- «Conectar un banco»: one sheet of taps (what you connect), a sentence
       that says where the login goes and where its movements land, and one
       button that opens Syncfy's own window. The window is Syncfy's: the
       password never passes through Muelle. -->
  <BottomSheet
    :open="open"
    title="Conectar un banco"
    :subtitle="company"
    :dismissible="!busy"
    layer="bancos-conectar"
    @update:open="(v) => emit('update:open', v)"
  >
    <div class="space-y-4" data-bancos-conectar>
      <div
        v-if="!ctx && !problem"
        role="status"
        aria-label="Preparando…"
        class="h-24 animate-pulse rounded-7 bg-surface-gray-2"
      />
      <template v-else-if="ctx">
        <ChipGroup
          v-model="kind"
          label="Qué conectas"
          :options="kinds"
          testid="bancos-conectar-que"
        />
        <p class="text-base text-ink-gray-8" data-bancos-conectar-frase>
          {{ sentence }}
        </p>
        <p class="text-sm text-ink-gray-6">
          Entras en la ventana de Syncfy, el servicio que conecta Muelle con tu
          banco. Muelle nunca ve tu usuario ni tu contraseña.
        </p>
        <p
          v-if="ctx.environment === 'Sandbox'"
          class="rounded-6 bg-surface-gray-2 p-3 text-sm text-ink-gray-7"
        >
          Este sitio está en pruebas: Syncfy muestra bancos de prueba, no los
          reales.
        </p>
      </template>
      <p
        v-if="problem"
        role="alert"
        class="rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
      >
        {{ problem }}
      </p>
    </div>
    <template #actions>
      <Button
        class="min-h-11 w-full"
        variant="solid"
        :label="ctx?.mock ? 'Conectar desde el escritorio' : 'Abrir Syncfy'"
        :loading="busy"
        :disabled="!ctx || !ctx.enabled || !!ctx.problem"
        data-bancos-conectar-abrir
        @click="connect"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button, toast } from 'frappe-ui'
import { BottomSheet, ChipGroup } from '@/components/ui'
import { errorText } from './bancos'
import { QUE_CONECTAS, syncfy } from './conectados'

const props = defineProps({
  open: { type: Boolean, default: false },
  company: { type: String, required: true },
})
const emit = defineEmits(['update:open', 'connected'])
const ctx = ref(null)
const problem = ref('')
const busy = ref(false)
const kind = ref('banco')

const kinds = computed(() =>
  QUE_CONECTAS.map(({ value, label }) => ({ value, label })),
)
const sentence = computed(() => {
  const lane =
    ctx.value?.bank_lane === 'Contador'
      ? 'Sus movimientos llegan solos cada día a la revisión bancaria de Contador.'
      : 'Sus movimientos llegan solos cada día a Bancos, listos para conciliar.'
  if (kind.value === 'sat')
    return ctx.value?.fiscal_available
      ? 'Entras con tu RFC y tu CIEC o e.firma. Tus facturas, tu opinión de cumplimiento, tu constancia y tus declaraciones llegan a Contador.'
      : 'Entras con tu RFC y tu CIEC o e.firma. Tus facturas, tu opinión de cumplimiento, tu constancia y tus declaraciones llegan a Muelle.'
  if (kind.value === 'monedero')
    return `Entras a tu monedero (Mercado Pago, PayPal…). ${lane}`
  if (kind.value === 'todo')
    return `Eliges la institución en la lista de Syncfy. ${lane}`
  return `Entras a tu banca en línea. ${lane}`
})

async function prepare() {
  ctx.value = null
  problem.value = ''
  try {
    const answer = await syncfy.context(props.company)
    if (!answer.enabled)
      problem.value =
        'Bancos conectados está apagado en este sitio. Pide a soporte de Muelle que lo active.'
    else if (answer.problem)
      problem.value =
        'Syncfy no responde para este sitio ahora. Inténtalo en unos minutos; si sigue igual, avisa a soporte de Muelle.'

    ctx.value = answer
  } catch (error) {
    problem.value = errorText(error)
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    kind.value = 'banco'
    prepare()
  },
  { immediate: true },
)

async function connect() {
  if (busy.value || !ctx.value?.enabled || ctx.value.problem) return
  // The offline emulator has no Syncfy window; its drill lives in the Desk.
  if (ctx.value.mock) {
    window.location.assign('/app/syncfy-connect')
    return
  }
  busy.value = true
  problem.value = ''
  const types = QUE_CONECTAS.find((k) => k.value === kind.value)?.types || []
  try {
    const { openSyncfy } = await import('./syncfyWidget')
    // Syncfy's window is its own modal: this sheet steps aside first.
    emit('update:open', false)
    const result = await openSyncfy({
      company: props.company,
      types,
      context: ctx.value,
    })
    if (result?.documents) {
      toast.success(
        'Syncfy está leyendo tu documento en el SAT. Llega en unos minutos.',
      )
      return
    }
    if (!result?.connection) return
    if (result.error) toast.warning(result.error)
    else
      toast.success(
        'Conectada. Los primeros movimientos llegan en unos minutos.',
      )
    emit('connected', result.connection.name)
  } catch (error) {
    toast.error(
      error?.message === 'widget'
        ? 'No se pudo abrir la ventana de Syncfy. Revisa tu conexión e inténtalo de nuevo.'
        : errorText(error),
    )
  } finally {
    busy.value = false
  }
}
</script>
