<template>
  <!-- Deudas y plan de pago (crm docs/DINERO_EN_ORDEN.md §3b-§3c): what each
       card and loan owes and where the figure comes from, the monthly amount
       and the order, the date the owner is free and what it saves against
       paying only the minimums. A personal book shows its holder's debts only. -->
  <div
    class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-deudas
  >
    <AppBar
      title="Deudas"
      context="Plan de pago"
      :back="{ name: 'Bancos' }"
      back-label="Volver a Bancos"
      :loading="loading && !!board"
    />

    <div v-if="books.length > 1" class="px-4 pt-2">
      <Segmented
        :model-value="company"
        :options="books"
        label="Libro"
        @update:model-value="pickBook"
      />
    </div>

    <p
      v-if="error"
      role="alert"
      class="mx-4 my-3 rounded-6 bg-surface-red-1 p-4 text-sm text-ink-red-7"
      data-deudas-problem
    >
      {{ error }}
    </p>
    <div
      v-else-if="!board"
      role="status"
      aria-label="Cargando deudas…"
      class="space-y-3 px-4 py-4"
    >
      <div class="h-24 animate-pulse rounded-7 bg-surface-gray-2" />
      <div class="h-14 animate-pulse rounded-6 bg-surface-gray-2" />
      <div class="h-14 animate-pulse rounded-6 bg-surface-gray-2" />
    </div>

    <template v-else>
      <!-- Hero: what is owed, and when the owner is free. -->
      <section
        class="px-4 pb-2 pt-3"
        aria-label="Lo que debes"
        data-deudas-hero
      >
        <p class="text-sm text-ink-gray-6">
          {{ board.personal ? 'Debes (libro personal)' : 'Debes' }}
        </p>
        <p class="text-3xl font-semibold tabular-nums text-ink-gray-9">
          {{ money(board.owed, currency) }}
        </p>
        <p
          v-if="free"
          class="mt-1 text-base"
          :class="
            board.problem || (board.plan && !board.plan.finished)
              ? 'text-ink-amber-8'
              : board.plan
                ? 'font-medium text-ink-green-8'
                : 'text-ink-gray-7'
          "
          data-deudas-libre
        >
          {{ free }}
        </p>
        <p
          v-if="board.plan && board.plan.finished"
          class="mt-1 text-sm text-ink-gray-6"
          data-deudas-intereses
        >
          Intereses por pagar {{ money(board.plan.interest, currency) }}
          <template v-if="board.plan.interest_saved !== null">
            · ahorras {{ money(board.plan.interest_saved, currency) }} y
            {{ durationText(board.plan.months_sooner) }} contra pagar solo los
            mínimos
          </template>
          <template v-else> · con solo los mínimos no terminarías </template>
        </p>
      </section>

      <!-- The plan: how much a month, which first. -->
      <section
        v-if="board.debts.length"
        class="mx-4 mt-2 space-y-3 rounded-7 border border-outline-gray-2 p-4"
        aria-label="Tu plan"
        data-deudas-plan
      >
        <div>
          <label
            for="deudas-monto"
            class="block text-sm font-medium text-ink-gray-8"
          >
            ¿Cuánto abonas al mes a tus deudas?
          </label>
          <input
            id="deudas-monto"
            v-model="monthly"
            inputmode="decimal"
            autocomplete="off"
            placeholder="0.00"
            class="mt-1 h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base tabular-nums text-ink-gray-9 focus:ring-2 focus:ring-outline-gray-3"
            data-deudas-monto
          />
          <div v-if="targets.length" class="mt-2 flex flex-wrap gap-2">
            <button
              v-for="t in targets"
              :key="t.months"
              type="button"
              class="press inline-flex min-h-11 items-center rounded-full border border-outline-gray-2 px-3 text-sm text-ink-gray-8 hover:bg-surface-gray-1"
              :data-deudas-meta="t.months"
              @click="monthly = String(t.amount)"
            >
              Salir en {{ t.months }} meses:
              <span class="ml-1 tabular-nums">{{
                money(t.amount, currency)
              }}</span>
            </button>
          </div>
        </div>
        <Segmented
          :model-value="method"
          :options="METHODS"
          label="Qué pagas primero"
          @update:model-value="(v) => (method = v)"
        />
        <p
          v-if="board.plan && board.plan.other.months !== null"
          class="text-sm text-ink-gray-6"
          data-deudas-otro
        >
          {{ otherText }}
        </p>
        <div class="flex items-center gap-3">
          <Button
            v-if="board.can_edit"
            class="min-h-11"
            variant="solid"
            label="Guardar plan"
            :disabled="!changed || !Number(monthly)"
            :loading="saving"
            data-deudas-guardar
            @click="savePlan"
          />
          <span
            v-if="!changed && board.settings.saved"
            class="text-sm text-ink-gray-6"
          >
            Este es tu plan guardado.
          </span>
        </div>
      </section>

      <p
        v-if="missing.length"
        class="mx-4 mt-3 rounded-7 bg-surface-amber-2 p-3 text-sm text-ink-amber-8"
        data-deudas-faltan
      >
        Falta la tasa de {{ missing.join(', ') }}. Sin ella el plan la cuenta en
        0 % y termina antes de lo real: viene en tu estado de cuenta (CAT o tasa
        anual).
      </p>

      <!-- The debts, in the order the plan pays them. -->
      <section
        v-if="rows.length"
        class="mt-3"
        aria-label="Tus deudas"
        data-deudas-lista
      >
        <h2 class="px-4 pb-1 text-sm font-semibold text-ink-gray-7">
          {{ board.plan ? 'En el orden en que se pagan' : 'Tus deudas' }}
        </h2>
        <ul class="divide-y divide-outline-gray-1">
          <li v-for="d in rows" :key="d.name" :data-deuda="d.name">
            <button
              type="button"
              class="press flex min-h-16 w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-gray-1"
              @click="edit(d)"
            >
              <span
                class="flex size-8 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-sm font-semibold tabular-nums text-ink-gray-8"
                aria-hidden="true"
                >{{ d.order || '·' }}</span
              >
              <span class="min-w-0 flex-1">
                <span class="block break-words text-base text-ink-gray-9">{{
                  d.title
                }}</span>
                <span class="block text-sm text-ink-gray-6">
                  {{ SOURCE_WORDS[d.owed_source] || '' }}
                  <template v-if="d.annual_rate">
                    · tasa {{ d.annual_rate }} %</template
                  >
                  <template v-else>
                    ·
                    <span class="text-ink-amber-8"
                      >falta la tasa</span
                    ></template
                  >
                  <template v-if="d.next_due">
                    · paga el {{ dayText(d.next_due) }}</template
                  >
                </span>
                <span v-if="d.paidOff" class="block text-sm text-ink-green-8"
                  >Se termina en {{ monthLabel(d.paidOff) }}</span
                >
              </span>
              <span
                class="whitespace-nowrap text-base font-semibold tabular-nums text-ink-gray-9"
                >{{ money(d.owed, currency) }}</span
              >
            </button>
          </li>
        </ul>
      </section>

      <!-- Cards Muelle already sees that are not in the plan. -->
      <section
        v-if="board.suggestions.length && board.can_edit"
        class="mt-3"
        aria-label="Tarjetas que Muelle ve"
        data-deudas-sugeridas
      >
        <h2 class="px-4 pb-1 text-sm font-semibold text-ink-gray-7">
          Tarjetas que Muelle ve y no están en el plan
        </h2>
        <ul class="divide-y divide-outline-gray-1">
          <li
            v-for="s in board.suggestions"
            :key="s.bank_account"
            class="flex items-center gap-3 px-4 py-3"
          >
            <span class="min-w-0 flex-1">
              <span class="block break-words text-base text-ink-gray-9">{{
                s.title
              }}</span>
              <span v-if="s.owed !== null" class="block text-sm text-ink-gray-6"
                >Debe {{ money(s.owed, currency) }}
                {{ SOURCE_WORDS[s.owed_source] || '' }}</span
              >
            </span>
            <Button
              class="min-h-11 flex-none"
              label="Agregar"
              :loading="adding === s.bank_account"
              :data-deudas-agregar="s.bank_account"
              @click="addSuggested(s)"
            />
          </li>
        </ul>
      </section>

      <EmptyState
        v-if="!rows.length && !board.suggestions.length"
        class="py-10"
        title="Sin deudas en el plan"
        message="Agrega cada tarjeta o préstamo con lo que debes: Muelle te dice cuándo terminas y cuánto ahorras."
        :action="board.can_edit ? 'Agregar una deuda' : undefined"
        @action="edit(null)"
      />
      <div v-else-if="board.can_edit" class="px-4 py-4">
        <Button
          class="min-h-11"
          label="Agregar otra deuda"
          data-deudas-nueva
          @click="edit(null)"
        >
          <template #prefix>
            <span class="lucide-plus size-4" aria-hidden="true" />
          </template>
        </Button>
      </div>
      <div class="h-24 flex-none lg:h-10" aria-hidden="true" />
    </template>

    <DeudaSheet
      v-if="board"
      v-model:open="sheet.open"
      :debt="sheet.debt"
      :company="company"
      :currency="currency"
      :tax-default="board.tax_default"
      @saved="onSaved"
    />
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, toast } from 'frappe-ui'
import { useDebounceFn } from '@vueuse/core'
import { AppBar, EmptyState, Segmented } from '@/components/ui'
import { errorText, money } from '@/components/bancos/bancos'
import { formatDate } from '@/utils/display'
import {
  METHODS,
  SOURCE_WORDS,
  bookLabel,
  deudasApi,
  durationText,
  freeText,
  missingRates,
  monthLabel,
  orderedDebts,
} from '@/components/deudas/deudas'

const DeudaSheet = defineAsyncComponent(
  () => import('@/components/deudas/DeudaSheet.vue'),
)

const route = useRoute()
const router = useRouter()
const board = ref(null)
const loading = ref(false)
const saving = ref(false)
const adding = ref('')
const error = ref('')
const monthly = ref('')
const method = ref('avalancha')
const sheet = reactive({ open: false, debt: null })

const company = computed(
  () => String(route.query.empresa || '') || board.value?.company || '',
)
const currency = computed(() => board.value?.currency || 'MXN')
const books = computed(() =>
  (board.value?.books || []).map((b) => ({
    value: b.company,
    label: bookLabel(b),
  })),
)
const rows = computed(() => orderedDebts(board.value))
const missing = computed(() => missingRates(board.value))
const free = computed(() => freeText(board.value))
const targets = computed(() =>
  Object.entries(board.value?.targets || {}).map(([months, amount]) => ({
    months: Number(months),
    amount,
  })),
)
const changed = computed(() => {
  const s = board.value?.settings
  if (!s) return false
  return (
    Number(monthly.value || 0) !== Number(s.monthly_for_debt || 0) ||
    method.value !== s.method
  )
})
const otherText = computed(() => {
  const other = board.value?.plan?.other
  if (!other || other.months === null) return ''
  const label = METHODS.find((m) => m.value === other.method)?.label || ''
  return `${label}: ${durationText(other.months)} e intereses de ${money(other.interest, currency.value)}.`
})

function dayText(iso) {
  return formatDate(iso)
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const out = await deudasApi('board', {
      company: route.query.empresa || undefined,
    })
    board.value = out
    monthly.value = out.settings.monthly_for_debt
      ? String(out.settings.monthly_for_debt)
      : ''
    method.value = out.settings.method || 'avalancha'
  } catch (e) {
    error.value = errorText(e)
  } finally {
    loading.value = false
  }
}

// The plan follows the amount and the order as they change, without saving.
let sequence = 0
const recompute = useDebounceFn(async () => {
  if (!board.value?.debts?.length) return
  const mine = ++sequence
  try {
    const out = await deudasApi('simular', {
      company: company.value,
      monthly: Number(monthly.value) || undefined,
      method: method.value,
    })
    if (mine !== sequence) return
    Object.assign(board.value, {
      plan: out.plan,
      problem: out.problem,
      monthly: out.monthly,
      method: out.method,
      targets: out.targets,
    })
  } catch (e) {
    if (mine === sequence) error.value = errorText(e)
  }
}, 350)
watch([monthly, method], () => {
  if (board.value) recompute()
})

async function savePlan() {
  saving.value = true
  try {
    board.value = await deudasApi('guardar_plan', {
      company: company.value,
      method: method.value,
      monthly_for_debt: Number(monthly.value) || 0,
    })
    toast.success('Plan guardado.')
  } catch (e) {
    toast.error(errorText(e))
  } finally {
    saving.value = false
  }
}

async function addSuggested(s) {
  adding.value = s.bank_account
  try {
    board.value = await deudasApi('guardar_deuda', {
      company: company.value,
      values: {
        title: s.title,
        kind: 'Credit card',
        bank_account: s.bank_account,
        account: s.account,
      },
    })
    const added = board.value.debts.find(
      (d) => d.bank_account === s.bank_account,
    )
    if (added) edit(added) // its rate and minimum come next
  } catch (e) {
    toast.error(errorText(e))
  } finally {
    adding.value = ''
  }
}

function edit(debt) {
  sheet.debt = debt
  sheet.open = true
}
function onSaved(out) {
  board.value = out
}
function pickBook(value) {
  router.replace({ query: { ...route.query, empresa: value } })
}

watch(() => route.query.empresa, load, { immediate: true })
</script>
