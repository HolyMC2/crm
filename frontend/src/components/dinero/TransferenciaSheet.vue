<template>
  <!-- One checked transfer (crm docs/DINERO_EN_ORDEN.md §3e): what Banxico or
       the bank says, who checked it, the sale it pays; the owner settles it. -->
  <BottomSheet
    :open="open"
    :title="item ? money(item.monto, item.currency) : 'Transferencia'"
    :subtitle="item ? subtitle : ''"
    layer="transferencia-detalle"
    @update:open="emit('update:open', $event)"
  >
    <div
      v-if="!item"
      class="space-y-3 py-2"
      role="status"
      aria-label="Cargando…"
    >
      <div class="h-16 animate-pulse rounded-7 bg-surface-gray-2" />
      <div class="h-32 animate-pulse rounded-7 bg-surface-gray-2" />
    </div>
    <div
      v-else
      class="space-y-4 pb-2"
      data-transferencia
      :data-estado="item.estado"
    >
      <div class="flex items-start gap-3">
        <StatusChip :label="estado.label" :tone="estado.tone" />
        <p
          class="min-w-0 flex-1 text-sm text-ink-gray-7"
          data-transferencia-motivo
        >
          {{ item.estado === 'Arrived' ? llegoTexto : item.motivo }}
        </p>
      </div>

      <dl
        class="divide-y divide-outline-gray-1 rounded-7 border border-outline-gray-2 text-sm"
      >
        <div
          v-for="row in filas"
          :key="row.label"
          class="flex gap-3 px-3 py-2.5"
        >
          <dt class="w-32 flex-none text-ink-gray-6">{{ row.label }}</dt>
          <dd
            class="min-w-0 flex-1 break-words text-ink-gray-9"
            :class="{ num: row.num }"
          >
            {{ row.value }}
          </dd>
        </div>
      </dl>

      <button
        v-if="item.comprobante"
        type="button"
        class="press flex min-h-11 items-center gap-2 text-sm font-medium text-ink-gray-8"
        data-transferencia-foto
        @click="viewer = true"
      >
        <span class="lucide-image size-5" aria-hidden="true" />
        Ver la foto del comprobante
      </button>

      <!-- The sale it pays, or the ones it could. -->
      <section
        v-if="
          !item.venta && !item.propia && item.estado === 'Arrived' && canLink
        "
        data-transferencia-ligar
      >
        <h3 class="text-sm font-semibold text-ink-gray-7">¿Qué venta pagó?</h3>
        <p v-if="loadingCandidates" class="mt-2 text-sm text-ink-gray-6">
          Buscando ventas del mismo monto…
        </p>
        <p v-else-if="!candidatos.length" class="mt-2 text-sm text-ink-gray-6">
          No hay ventas ni cobros de {{ money(item.monto, item.currency) }} en
          esos días. Si fue un anticipo, cóbralo en caja con esta transferencia.
        </p>
        <ul
          v-else
          class="mt-2 divide-y divide-outline-gray-1 rounded-7 border border-outline-gray-2"
        >
          <li v-for="c in candidatos" :key="c.name">
            <button
              type="button"
              class="press flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left"
              :disabled="busy"
              :data-transferencia-candidato="c.name"
              @click="ligar(c)"
            >
              <span class="min-w-0 flex-1">
                <span class="block break-words text-base text-ink-gray-9">{{
                  c.cliente || c.name
                }}</span>
                <span class="block text-sm text-ink-gray-6"
                  >{{ c.name }} · {{ diaTexto(c.fecha) }}</span
                >
              </span>
              <span class="num text-base text-ink-gray-9">{{
                money(c.monto, item.currency)
              }}</span>
            </button>
          </li>
        </ul>
      </section>

      <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
        {{ problem }}
      </p>
    </div>

    <template v-if="item" #actions>
      <div class="flex flex-wrap gap-2">
        <button
          v-if="item.puede_descartar"
          type="button"
          class="press flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-base"
          :class="
            confirmDiscard
              ? 'flex-1 bg-surface-red-1 font-medium text-ink-red-7'
              : 'text-ink-gray-7'
          "
          :aria-label="confirmDiscard ? 'Descartar' : 'Descartar esta revisión'"
          :title="confirmDiscard ? 'Descartar' : 'Descartar esta revisión'"
          :disabled="busy"
          data-transferencia-descartar
          @click="descartar()"
        >
          <span class="lucide-trash-2 size-5" aria-hidden="true" />
          <span v-if="confirmDiscard">Descartar</span>
        </button>
        <Button
          v-if="item.puede_reintentar"
          class="min-h-11 flex-1"
          label="Volver a intentar"
          :loading="busy"
          data-transferencia-reintentar
          @click="act('reintentar')"
        />
        <Button
          v-if="item.puede_confirmar"
          class="min-h-11 flex-1"
          variant="solid"
          label="Sí llegó"
          :loading="busy"
          data-transferencia-confirmar
          @click="act('confirmar')"
        />
      </div>
    </template>
  </BottomSheet>
  <MediaViewer
    v-if="viewer && item?.comprobante"
    v-model:open="viewer"
    :items="[{ url: item.comprobante, kind: 'image' }]"
  >
    <template #caption
      >Comprobante de {{ money(item.monto, item.currency) }}</template
    >
  </MediaViewer>
</template>

<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet, StatusChip } from '@/components/ui'
import { errorText, money } from '@/components/bancos/bancos'
import {
  bancoCorto,
  diaTexto,
  estadoDe,
  titleCase,
  transferenciasApi,
} from '@/components/dinero/transferencias'

const MediaViewer = defineAsyncComponent(
  () => import('@/components/ui/MediaViewer.vue'),
)

const props = defineProps({
  open: { type: Boolean, default: false },
  name: { type: String, default: '' },
  /** Who sees the money may link a sale and settle by hand. */
  canLink: { type: Boolean, default: false },
})
const emit = defineEmits(['update:open', 'cambio'])

const item = ref(null)
const busy = ref(false)
const problem = ref('')
const viewer = ref(false)
const confirmDiscard = ref(false)
const candidatos = ref([])
const loadingCandidates = ref(false)

const estado = computed(() => estadoDe(item.value?.estado))
const subtitle = computed(() => {
  const i = item.value
  const who = i.ordenante ? titleCase(i.ordenante) : 'Sin nombre aún'
  return `${who}, ${diaTexto(i.fecha)}`
})
const VIAS = {
  Banxico: 'Banxico',
  'Bank movement': 'Movimiento del banco',
  Owner: 'El dueño',
}
const ORIGENES = {
  Register: 'en caja',
  Muelle: 'en Muelle',
  Assistant: 'con el asistente',
}
const llegoTexto = computed(() => {
  const i = item.value
  if (i?.propia) return 'Entre tus cuentas: no es una venta.'
  return i?.via === 'Bank movement'
    ? 'Está en los movimientos del banco.'
    : i?.via === 'Owner'
      ? 'La confirmó el dueño.'
      : 'Banxico la confirma.'
})
const filas = computed(() => {
  const i = item.value
  const rows = [
    { label: 'Envió', value: i.ordenante ? titleCase(i.ordenante) : '—' },
    {
      label: 'Desde',
      value:
        [bancoCorto(i.banco_emisor), i.cuenta_ordenante]
          .filter(Boolean)
          .join(' ') || '—',
    },
    {
      label: i.estado === 'Arrived' ? 'Llegó a' : 'Llegaría a',
      value: `${i.cuenta?.nombre || ''} ${i.cuenta?.ultimos || ''}`.trim(),
    },
    { label: 'Clave de rastreo', value: i.clave_rastreo || '—', num: true },
  ]
  if (i.referencia)
    rows.push({ label: 'Referencia', value: i.referencia, num: true })
  if (i.concepto) rows.push({ label: 'Concepto', value: i.concepto })
  rows.push(
    {
      label: 'Fecha y hora',
      value: `${diaTexto(i.fecha)}${i.hora ? `, ${i.hora}` : ''}`,
      num: true,
    },
    { label: 'La confirmó', value: VIAS[i.via] || 'Aún no' },
    ...(i.origen === 'Bank'
      ? []
      : [
          {
            label: 'Revisó',
            value: `${i.revisada_por}, ${ORIGENES[i.origen] || ''}`,
          },
        ]),
    {
      label: 'Pagó',
      value: i.venta
        ? i.venta.name
        : i.propia
          ? 'Nada: es entre tus cuentas'
          : 'Ninguna venta todavía',
    },
  )
  if (i.movimiento) rows.push({ label: 'En el banco', value: i.movimiento })
  return rows
})

async function load() {
  if (!props.name) return
  problem.value = ''
  try {
    item.value = await transferenciasApi('ver', { name: props.name })
    if (
      props.canLink &&
      item.value.estado === 'Arrived' &&
      !item.value.venta &&
      !item.value.propia
    )
      loadCandidates()
  } catch (e) {
    problem.value = errorText(e)
  }
}

async function loadCandidates() {
  loadingCandidates.value = true
  try {
    candidatos.value =
      (await transferenciasApi('candidatos', { name: props.name }))
        .candidatos || []
  } catch {
    candidatos.value = []
  } finally {
    loadingCandidates.value = false
  }
}

watch(
  () => [props.open, props.name],
  ([open]) => {
    confirmDiscard.value = false
    if (open) {
      item.value = null
      candidatos.value = []
      load()
    }
  },
  { immediate: true },
)

async function act(method, extra = {}) {
  busy.value = true
  problem.value = ''
  try {
    item.value = await transferenciasApi(method, { name: props.name, ...extra })
    emit('cambio', item.value)
  } catch (e) {
    problem.value = errorText(e)
  } finally {
    busy.value = false
  }
}

async function ligar(c) {
  await act('ligar', { doctype: c.doctype, docname: c.name })
  candidatos.value = []
}

async function descartar() {
  if (!confirmDiscard.value) {
    confirmDiscard.value = true
    return
  }
  await act('descartar')
  emit('update:open', false)
}
</script>
