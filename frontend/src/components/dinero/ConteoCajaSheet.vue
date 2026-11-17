<template>
  <!-- «Cuenta tu caja» (crm docs/DINERO_EN_ORDEN.md §3d): what is there
       against the books; a difference is booked with the person's answer, so
       the books say what is in the cash. -->
  <BottomSheet
    :open="open"
    title="Cuenta tu caja"
    subtitle="Escribe lo que hay y tus libros quedan igual."
    layer="por-explicar-conteo"
    @update:open="emit('update:open', $event)"
  >
    <div class="space-y-4 pb-2" data-conteo-caja>
      <div
        v-if="cash.length > 1"
        class="flex flex-wrap gap-2"
        role="radiogroup"
        aria-label="¿Qué caja?"
      >
        <button
          v-for="c in cash"
          :key="c.account"
          type="button"
          role="radio"
          class="press min-h-11 rounded-full px-4 text-sm"
          :class="
            form.cash === c.account
              ? 'bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
              : 'border border-outline-gray-2 text-ink-gray-8'
          "
          :aria-checked="form.cash === c.account"
          :data-conteo-caja-opcion="c.account"
          @click="pickCash(c.account)"
        >
          {{ c.label }}
        </button>
      </div>
      <p class="text-sm text-ink-gray-6">
        {{ current?.label }}: tus libros dicen
        <span class="num font-medium text-ink-gray-9">{{ fmt(books) }}</span>
        · {{ lastCountText(current?.last_count) }}
      </p>

      <div>
        <label
          class="block text-sm font-medium text-ink-gray-7"
          for="conteo-monto"
          >¿Cuánto hay?</label
        >
        <input
          id="conteo-monto"
          v-model="form.counted"
          inputmode="decimal"
          autocomplete="off"
          class="num mt-1 min-h-12 w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-2xl text-ink-gray-9"
          placeholder="$0.00"
          data-conteo-monto
        />
      </div>

      <template v-if="counted !== null">
        <p
          class="text-base font-medium"
          :class="difference ? 'text-ink-amber-8' : 'text-ink-green-7'"
          data-conteo-diferencia
        >
          {{ differenceText(difference, fmt) }}
        </p>
        <template v-if="difference">
          <p class="text-sm text-ink-gray-7">
            {{
              difference < 0
                ? '¿En qué se fue? Si fueron varios gastos, regístralos con «Gasté en efectivo» y vuelve a contar; lo que quede, contéstalo aquí.'
                : '¿De dónde salió?'
            }}
          </p>
          <div class="space-y-2" role="radiogroup" aria-label="La diferencia">
            <button
              v-for="k in kinds"
              :key="k.kind"
              type="button"
              role="radio"
              class="press flex min-h-11 w-full items-center gap-3 rounded-6 border px-3 py-2 text-left"
              :class="
                form.kind === k.kind
                  ? 'border-[var(--muelle-accent)] bg-surface-gray-1'
                  : 'border-outline-gray-2'
              "
              :aria-checked="form.kind === k.kind"
              :data-conteo-tipo="k.kind"
              @click="pickKind(k.kind)"
            >
              <span class="min-w-0 flex-1">
                <span class="block text-base text-ink-gray-9">{{
                  k.label
                }}</span>
                <span class="block text-xs text-ink-gray-6">{{ k.hint }}</span>
              </span>
            </button>
          </div>
          <div v-if="form.kind" class="space-y-2">
            <input
              v-model="form.query"
              type="search"
              autocomplete="off"
              class="min-h-11 w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-base text-ink-gray-9"
              placeholder="Buscar cuenta"
              aria-label="Buscar cuenta"
            />
            <ul class="max-h-56 divide-y divide-outline-gray-1 overflow-y-auto">
              <li v-for="a in found" :key="a.account">
                <button
                  type="button"
                  role="radio"
                  class="press flex min-h-11 w-full items-center gap-3 py-2 text-left"
                  :aria-checked="form.account === a.account"
                  :data-conteo-cuenta="a.account"
                  @click="form.account = a.account"
                >
                  <span
                    class="min-w-0 flex-1 break-words text-base text-ink-gray-9"
                  >
                    {{ a.label }}
                  </span>
                  <span
                    v-if="form.account === a.account"
                    class="lucide-check size-5 text-ink-gray-9"
                    aria-hidden="true"
                  />
                </button>
              </li>
            </ul>
          </div>
        </template>
      </template>
      <p v-if="form.problem" role="alert" class="text-sm text-ink-red-7">
        {{ form.problem }}
      </p>
    </div>
    <template #actions>
      <div class="flex gap-2">
        <Button
          class="min-h-11 flex-1"
          label="Cancelar"
          @click="emit('update:open', false)"
        />
        <Button
          class="min-h-11 flex-1"
          variant="solid"
          :label="difference ? `Dejar en ${fmt(counted || 0)}` : 'Listo'"
          :disabled="!ready"
          :loading="form.busy"
          data-conteo-guardar
          @click="save()"
        />
      </div>
    </template>
  </BottomSheet>
</template>

<script setup>
import { computed, reactive, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { errorText, money } from '@/components/bancos/bancos'
import { parseAmount } from '@/components/dinero/colchon'
import {
  accountsFor,
  differenceSide,
  differenceText,
  kindsFor,
  lastCountText,
  porExplicarApi,
} from '@/components/dinero/porExplicar'

const props = defineProps({
  open: { type: Boolean, default: false },
  data: { type: Object, default: null },
})
const emit = defineEmits(['update:open', 'done'])

const form = reactive({
  cash: '',
  counted: '',
  kind: '',
  account: '',
  query: '',
  busy: false,
  problem: '',
})

const fmt = (amount) => money(amount, props.data?.currency)
const cash = computed(() => props.data?.efectivo || [])
const current = computed(() => cash.value.find((c) => c.account === form.cash))
const books = computed(() => Number(current.value?.balance || 0))
const counted = computed(() => {
  const value = parseAmount(form.counted)
  return value === null ? null : value
})
const difference = computed(() =>
  counted.value === null
    ? 0
    : Math.round((counted.value - books.value) * 100) / 100,
)
// a deposit's «gasto» reads «devolución»: not an answer for a count
const kinds = computed(() =>
  kindsFor(differenceSide(difference.value)).filter(
    (k) =>
      k.kind !== 'traspaso' && !(k.kind === 'gasto' && difference.value > 0),
  ),
)
const found = computed(() =>
  accountsFor(props.data?.choices, form.kind, form.query).slice(0, 40),
)
const ready = computed(
  () =>
    counted.value !== null &&
    (!difference.value || (form.kind && form.account)),
)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    Object.assign(form, {
      cash: cash.value[0]?.account || '',
      counted: '',
      kind: '',
      account: '',
      query: '',
      busy: false,
      problem: '',
    })
  },
  { immediate: true },
)

function pickCash(account) {
  form.cash = account
  form.kind = ''
  form.account = ''
}

function pickKind(kind) {
  if (form.kind === kind) return
  form.kind = kind
  form.account = accountsFor(props.data?.choices, kind)[0]?.account || ''
  form.query = ''
}

async function save() {
  if (!ready.value || form.busy) return
  form.busy = true
  form.problem = ''
  try {
    const done = await porExplicarApi('ajustar', {
      company: props.data.company,
      caja: form.cash,
      contado: counted.value,
      tipo: difference.value ? form.kind : undefined,
      cuenta: difference.value ? form.account : undefined,
    })
    emit('done', { ...done, label: current.value?.label })
    emit('update:open', false)
  } catch (e) {
    form.problem = errorText(e)
  } finally {
    form.busy = false
  }
}
</script>
