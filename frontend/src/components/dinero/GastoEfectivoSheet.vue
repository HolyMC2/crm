<template>
  <!-- «Gasté en efectivo» (crm docs/DINERO_EN_ORDEN.md §3d): how much, what
       it was, from which cash, when. One entry; the receipt offers undo. -->
  <BottomSheet
    :open="open"
    title="Gasté en efectivo"
    subtitle="Lo que pagaste con dinero de la caja: queda en tus libros."
    layer="por-explicar-efectivo"
    @update:open="emit('update:open', $event)"
  >
    <form class="space-y-4 pb-2" data-gasto-efectivo @submit.prevent="save()">
      <div v-if="usual.length">
        <p class="text-sm font-medium text-ink-gray-7">Lo de siempre</p>
        <div
          class="mt-2 flex flex-wrap gap-2"
          role="group"
          aria-label="Lo de siempre"
        >
          <button
            v-for="c in usual"
            :key="c.key"
            type="button"
            class="press min-h-11 rounded-full border border-outline-gray-2 px-4 text-left text-sm text-ink-gray-8"
            :data-gasto-siempre="c.key"
            @click="fillUsual(c)"
          >
            <span class="num">{{ c.label }}</span>
            <span class="text-ink-gray-6"> · {{ c.hint }}</span>
          </button>
        </div>
      </div>
      <div>
        <label
          class="block text-sm font-medium text-ink-gray-7"
          for="gasto-monto"
          >¿Cuánto?</label
        >
        <input
          id="gasto-monto"
          v-model="form.amount"
          inputmode="decimal"
          autocomplete="off"
          class="num mt-1 min-h-12 w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-2xl text-ink-gray-9"
          placeholder="$0.00"
          data-gasto-monto
        />
      </div>

      <div>
        <p class="text-sm font-medium text-ink-gray-7">¿En qué?</p>
        <div
          class="mt-2 flex flex-wrap gap-2"
          role="radiogroup"
          aria-label="¿En qué?"
        >
          <button
            v-for="a in quick"
            :key="a.account"
            type="button"
            role="radio"
            class="press min-h-11 rounded-full px-4 text-sm"
            :class="
              form.account === a.account
                ? 'bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
                : 'border border-outline-gray-2 text-ink-gray-8'
            "
            :aria-checked="form.account === a.account"
            :data-gasto-cuenta="a.account"
            @click="form.account = a.account"
          >
            {{ a.label }}
          </button>
          <button
            type="button"
            class="press min-h-11 rounded-full border border-dashed border-outline-gray-3 px-4 text-sm text-ink-gray-7"
            :aria-expanded="form.searching"
            data-gasto-otra
            @click="form.searching = !form.searching"
          >
            Otra cuenta
          </button>
        </div>
        <div v-if="form.searching" class="mt-2 space-y-2">
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
                class="press flex min-h-11 w-full items-center gap-3 py-2 text-left"
                :aria-pressed="form.account === a.account"
                @click="pick(a.account)"
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
      </div>

      <div v-if="cash.length > 1">
        <p class="text-sm font-medium text-ink-gray-7">¿De qué caja?</p>
        <div
          class="mt-2 flex flex-wrap gap-2"
          role="radiogroup"
          aria-label="¿De qué caja?"
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
            :data-gasto-caja="c.account"
            @click="form.cash = c.account"
          >
            {{ c.label }}
          </button>
        </div>
      </div>

      <div class="flex gap-2" role="radiogroup" aria-label="¿Cuándo?">
        <button
          v-for="d in DAYS"
          :key="d.key"
          type="button"
          role="radio"
          class="press min-h-11 flex-1 rounded-full text-sm"
          :class="
            form.day === d.key
              ? 'bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
              : 'border border-outline-gray-2 text-ink-gray-8'
          "
          :aria-checked="form.day === d.key"
          @click="form.day = d.key"
        >
          {{ d.label }}
        </button>
      </div>

      <div>
        <label
          class="block text-sm font-medium text-ink-gray-7"
          for="gasto-nota"
          >Nota (opcional)</label
        >
        <input
          id="gasto-nota"
          v-model="form.note"
          autocomplete="off"
          maxlength="140"
          class="mt-1 min-h-11 w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-base text-ink-gray-9"
          placeholder="Tortas para el equipo, pintura, renta…"
        />
      </div>
      <EtiquetasPicker v-model="form.tags" :options="data?.etiquetas || []" />
      <p v-if="form.problem" role="alert" class="text-sm text-ink-red-7">
        {{ form.problem }}
      </p>
    </form>
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
          label="Registrar"
          :disabled="!ready"
          :loading="form.busy"
          data-gasto-guardar
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
import EtiquetasPicker from '@/components/dinero/EtiquetasPicker.vue'
import { errorText, money } from '@/components/bancos/bancos'
import { parseAmount } from '@/components/dinero/colchon'
import {
  accountNames,
  accountsFor,
  dayOf,
  porExplicarApi,
} from '@/components/dinero/porExplicar'
import { frequentChips } from '@/components/dinero/tickets'

const props = defineProps({
  open: { type: Boolean, default: false },
  data: { type: Object, default: null },
})
const emit = defineEmits(['update:open', 'done'])

const QUICK = 6
const DAYS = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'ayer', label: 'Ayer' },
]

const form = reactive({
  amount: '',
  account: '',
  cash: '',
  day: 'hoy',
  note: '',
  tags: [],
  searching: false,
  query: '',
  busy: false,
  problem: '',
})

const cash = computed(() => props.data?.efectivo || [])
// «Lo de siempre»: the purchases its tickets booked the same way at least twice
const usual = computed(() =>
  frequentChips(
    props.data?.tickets?.lo_de_siempre,
    accountNames(props.data?.choices),
    (amount) => money(amount, props.data?.currency),
  ),
)
// the most used expenses, then the owner's own account
const quick = computed(() => [
  ...accountsFor(props.data?.choices, 'gasto').slice(0, QUICK),
  ...accountsFor(props.data?.choices, 'personal').slice(0, 1),
])
const found = computed(() =>
  [
    ...accountsFor(props.data?.choices, 'gasto', form.query),
    ...accountsFor(props.data?.choices, 'personal', form.query),
  ].slice(0, 40),
)
const ready = computed(
  () => parseAmount(form.amount) > 0 && form.account && form.cash,
)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    Object.assign(form, {
      amount: '',
      account: '',
      cash: cash.value[0]?.account || '',
      day: 'hoy',
      note: '',
      tags: [],
      searching: false,
      query: '',
      busy: false,
      problem: '',
    })
  },
  { immediate: true },
)

function fillUsual(chip) {
  const f = chip.fill
  Object.assign(form, {
    amount: f.amount,
    account: f.account,
    cash: cash.value.some((c) => c.account === f.cash) ? f.cash : form.cash,
    note: f.note,
    tags: f.tags,
    searching: false,
    problem: '',
  })
}

function pick(account) {
  form.account = account
  form.searching = false
}

async function save() {
  if (!ready.value || form.busy) return
  form.busy = true
  form.problem = ''
  try {
    const done = await porExplicarApi('gaste', {
      company: props.data.company,
      monto: parseAmount(form.amount),
      cuenta: form.account,
      caja: form.cash,
      fecha: dayOf(form.day),
      nota: form.note.trim(),
      etiquetas: form.tags.length ? form.tags : undefined,
    })
    emit('done', done)
    emit('update:open', false)
  } catch (e) {
    form.problem = errorText(e)
  } finally {
    form.busy = false
  }
}
</script>
