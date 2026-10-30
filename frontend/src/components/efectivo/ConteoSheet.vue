<template>
  <!-- Count cash by denomination (Shell-S14): seal a bag, verify one someone
       else sealed, count the safe, or count what a traslado takes. The total
       is a sum of whole pieces, never a typed figure; the server counts the
       same rows again. -->
  <BottomSheet
    :open="open"
    :title="title"
    :subtitle="subtitle"
    :dismissible="!busy"
    data-efectivo-conteo
    @update:open="(v) => !busy && $emit('update:open', v)"
  >
    <div class="space-y-4 pb-2">
      <p
        v-if="custody"
        class="rounded-6 bg-surface-gray-1 px-3 py-2 text-sm text-ink-gray-7"
        data-efectivo-custody
      >
        {{ custody }}
      </p>

      <div v-if="mode === 'fund'" class="space-y-1" data-efectivo-source>
        <label
          for="efectivo-fund-source"
          class="text-sm font-medium text-ink-gray-7"
          >De dónde viene el dinero</label
        >
        <select
          id="efectivo-fund-source"
          v-model="source"
          class="h-11 w-full rounded-6 border-0 bg-surface-gray-1 px-3 text-base"
          :disabled="busy || sources.state !== 'ready' || !sources.rows.length"
        >
          <option value="">
            {{
              sources.state === 'loading'
                ? 'Cargando cuentas…'
                : 'Elige la cuenta'
            }}
          </option>
          <optgroup
            v-for="group in sourceGroups"
            :key="group.label"
            :label="group.label"
          >
            <option v-for="row in group.rows" :key="row.name" :value="row.name">
              {{ sourceLabel(row) }}
            </option>
          </optgroup>
        </select>
        <p
          v-if="sources.state === 'error'"
          role="alert"
          class="text-sm text-ink-red-7"
        >
          {{ sources.error }}
          <button
            type="button"
            class="font-medium underline"
            @click="loadSources"
          >
            Reintentar
          </button>
        </p>
        <p
          v-else-if="sources.state === 'ready' && !sources.rows.length"
          class="text-sm text-ink-gray-7"
        >
          Ninguna cuenta de la empresa puede meter dinero a la caja fuerte. Pide
          a tu contador una cuenta de efectivo, banco, préstamo o capital.
        </p>
        <p v-else class="text-xs text-ink-gray-6">
          Elige la cuenta de donde sale: el banco del que lo retiraste, el
          préstamo que lo trajo o lo que pone el dueño.
        </p>
      </div>

      <Segmented
        v-if="mode === 'prepare'"
        v-model="purpose"
        label="Para qué es la bolsa"
        :options="[
          { value: 'Takings', label: 'Para el banco' },
          { value: 'Float', label: 'Fondo de caja' },
        ]"
      />

      <ul
        class="divide-y divide-outline-gray-1"
        aria-label="Conteo por denominación"
      >
        <li
          v-for="face in faces"
          :key="face"
          class="flex min-h-12 items-center gap-3"
          :data-face="face"
        >
          <span
            class="num w-16 flex-none text-base font-semibold text-ink-gray-9"
            >{{ faceLabel(face) }}</span
          >
          <span
            class="num min-w-0 flex-1 truncate text-right text-sm text-ink-gray-5"
            >{{
              rows[face] ? money(fromMinor(face * rows[face]), currency) : ''
            }}</span
          >
          <div class="flex flex-none items-center gap-1">
            <button
              type="button"
              class="press grid size-10 place-items-center rounded-full bg-surface-gray-2 text-ink-gray-8 disabled:opacity-40"
              :aria-label="`Una pieza menos de ${faceLabel(face)}`"
              :disabled="!rows[face] || busy"
              @click="step(face, -1)"
            >
              <span class="lucide-minus size-5" aria-hidden="true" />
            </button>
            <input
              :value="rows[face] || ''"
              inputmode="numeric"
              pattern="[0-9]*"
              class="num h-10 w-14 rounded-4 border-0 bg-surface-gray-1 text-center text-base text-ink-gray-9"
              :aria-label="`Piezas de ${faceLabel(face)}`"
              placeholder="0"
              :disabled="busy"
              @input="type(face, $event.target.value)"
            />
            <button
              type="button"
              class="press grid size-10 place-items-center rounded-full bg-surface-gray-2 text-ink-gray-8"
              :aria-label="`Una pieza más de ${faceLabel(face)}`"
              :disabled="busy"
              @click="step(face, 1)"
            >
              <span class="lucide-plus size-5" aria-hidden="true" />
            </button>
          </div>
        </li>
      </ul>

      <div
        class="flex items-baseline justify-between gap-3 border-t border-outline-gray-2 pt-3"
      >
        <span class="text-sm font-medium text-ink-gray-7">Total contado</span>
        <span
          class="num text-2xl font-semibold text-ink-gray-9"
          data-efectivo-total
          >{{ money(fromMinor(total), currency) }}</span
        >
      </div>

      <label
        v-if="mode === 'prepare' || mode === 'transfer'"
        class="block space-y-1"
      >
        <span class="text-sm font-medium text-ink-gray-7">Número de sello</span>
        <input
          v-model.trim="seal"
          class="h-11 w-full rounded-6 border-0 bg-surface-gray-1 px-3 text-base"
          autocomplete="off"
          :disabled="busy"
          placeholder="Vacío: el sistema le pone uno"
          data-efectivo-seal
        />
      </label>

      <label class="block space-y-1">
        <span class="text-sm font-medium text-ink-gray-7">{{ noteLabel }}</span>
        <textarea
          v-model="note"
          rows="2"
          class="w-full rounded-6 border-0 bg-surface-gray-1 px-3 py-2 text-base"
          :disabled="busy"
          :placeholder="notePlaceholder"
        />
      </label>

      <div v-if="photoAllowed" class="flex items-center gap-3">
        <label
          class="press inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-surface-gray-2 px-4 text-sm font-medium text-ink-gray-8"
        >
          <span class="lucide-camera size-5" aria-hidden="true" />
          {{ photo ? 'Cambiar foto' : 'Foto del sello' }}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            class="sr-only"
            :disabled="busy"
            @change="pick"
          />
        </label>
        <img
          v-if="photo"
          :src="photo"
          alt="Foto que se adjunta a la bolsa"
          class="size-11 rounded-4 object-cover"
        />
      </div>
    </div>
    <template #actions>
      <p
        v-if="error"
        role="alert"
        class="mb-2 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
        data-efectivo-error
      >
        {{ error }}
      </p>
      <Button
        variant="solid"
        size="lg"
        class="w-full"
        :label="
          busy
            ? 'Guardando…'
            : total > 0
              ? `${confirmLabel} · ${money(fromMinor(total), currency)}`
              : confirmLabel
        "
        :disabled="busy || !!missing"
        data-efectivo-confirm
        @click="confirm"
      />
      <p v-if="missing" class="mt-2 text-center text-sm text-ink-gray-6">
        {{ missing }}
      </p>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet, Segmented } from '@/components/ui'
import {
  custodyCount,
  faceLabel,
  facesFor,
  fromMinor,
  money,
  totalMinor,
} from './efectivo'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** prepare (seal a bag) · verify (a bag) · count_safe · transfer · fund (money into the safe) */
  mode: { type: String, default: 'prepare' },
  /** fund: () => Promise<{accounts, has_more}>, the source accounts. */
  fetchSources: { type: Function, default: null },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  /** Who holds the cash now and who will after this step. */
  custody: { type: String, default: '' },
  currency: { type: String, default: 'MXN' },
  confirmLabel: { type: String, default: 'Guardar' },
  /** (result) => Promise: the parent sends the command with its request ID. */
  submit: { type: Function, required: true },
})
const emit = defineEmits(['update:open', 'done'])

const faces = computed(() => facesFor(props.currency))
const rows = ref({})
const purpose = ref('Takings')
const seal = ref('')
const note = ref('')
const photo = ref('')
const busy = ref(false)
const error = ref('')
const total = computed(() => totalMinor(rows.value))
const photoAllowed = computed(() => ['prepare', 'verify'].includes(props.mode))
const source = ref('')
const sources = ref({ state: 'idle', rows: [], error: '' })
const noteLabel = computed(
  () =>
    ({
      prepare: 'Nota (opcional)',
      fund: 'Por qué entra',
    })[props.mode] || 'Si no cuadra, explica por qué',
)
const notePlaceholder = computed(
  () =>
    ({
      prepare: 'Corte de la mañana, caja 2…',
      fund: 'Ocho letras o más: retiro del banco para cambio…',
    })[props.mode] || 'Ocho letras o más: faltó un billete de $200…',
)
/** Why the button cannot be pressed yet, in the worker's words. */
const missing = computed(() => {
  if (total.value <= 0) return 'Cuenta las piezas para poder continuar.'
  if (props.mode !== 'fund') return ''
  if (!source.value) return 'Elige de dónde viene el dinero.'
  if (note.value.trim().length < 8)
    return 'Escribe por qué entra, con ocho letras o más.'
  return ''
})

const SOURCE_GROUPS = [
  { label: 'Efectivo o banco', test: (r) => r.root_type === 'Asset' },
  { label: 'Aportación del dueño', test: (r) => r.root_type === 'Equity' },
  { label: 'Préstamo', test: (r) => r.root_type === 'Liability' },
]
const sourceGroups = computed(() =>
  SOURCE_GROUPS.map((g) => ({
    label: g.label,
    rows: sources.value.rows.filter(g.test),
  })).filter((g) => g.rows.length),
)
const sourceLabel = (row) =>
  [row.account_number, row.account_name || row.name].filter(Boolean).join(' ')

async function loadSources() {
  if (!props.fetchSources) return
  sources.value = { state: 'loading', rows: [], error: '' }
  try {
    const answer = await props.fetchSources()
    sources.value = { state: 'ready', rows: answer?.accounts || [], error: '' }
  } catch (e) {
    sources.value = { state: 'error', rows: [], error: e?.message || String(e) }
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    rows.value = {}
    seal.value = ''
    note.value = ''
    photo.value = ''
    error.value = ''
    purpose.value = 'Takings'
    source.value = ''
    if (props.mode === 'fund') loadSources()
  },
  { immediate: true },
)

function step(face, delta) {
  const next = Math.max(0, (Number(rows.value[face]) || 0) + delta)
  rows.value = { ...rows.value, [face]: next }
}
function type(face, text) {
  const n = Number(String(text).replace(/\D/g, '').slice(0, 6)) || 0
  rows.value = { ...rows.value, [face]: n }
}

function pick(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => (photo.value = String(reader.result || ''))
  reader.readAsDataURL(file)
}

async function confirm() {
  busy.value = true
  error.value = ''
  try {
    const result = await props.submit({
      rows: { ...rows.value },
      count: custodyCount(rows.value),
      total: total.value,
      purpose: purpose.value,
      seal: seal.value,
      note: note.value.trim(),
      photo: photo.value,
      source: source.value,
    })
    emit('done', result)
    emit('update:open', false)
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    busy.value = false
  }
}
</script>
