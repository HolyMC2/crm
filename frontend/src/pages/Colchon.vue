<template>
  <!-- Colchón (crm docs/DINERO_EN_ORDEN.md §3b D4): months of essential
       expenses kept, in which accounts, when the cushion is full with debt
       paid first, and the month's plan in the owner's order, with
       «¿puedo retirar?» against it. Nothing here moves money. -->
  <div
    class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-colchon
  >
    <AppBar
      title="Colchón"
      context="Tu dinero"
      :back="{ name: 'Bancos', query: companyQuery }"
      back-label="Volver a Bancos"
      :loading="loading && !!data"
    />

    <p
      v-if="error"
      role="alert"
      class="mx-4 my-3 rounded-6 bg-surface-red-1 p-4 text-sm text-ink-red-7"
      data-colchon-problem
    >
      {{ error }}
    </p>
    <div
      v-else-if="!data"
      role="status"
      aria-label="Cargando…"
      class="space-y-3 px-4 py-4"
    >
      <div class="h-28 animate-pulse rounded-7 bg-surface-gray-2" />
      <div class="h-16 animate-pulse rounded-6 bg-surface-gray-2" />
      <div class="h-16 animate-pulse rounded-6 bg-surface-gray-2" />
    </div>

    <template v-else>
      <!-- The goal and how far it is. -->
      <section
        class="flex-none mx-4 mt-2 rounded-7 border border-outline-gray-2 p-4"
        aria-label="Tu colchón"
        data-colchon-meta
      >
        <template v-if="data.reach.why === 'sin_gastos'">
          <p class="text-base font-medium text-ink-gray-9">
            Aún no hay gastos fijos para medir tu colchón
          </p>
          <p class="mt-1 text-sm text-ink-gray-6">
            Se miden con los tres meses anteriores. Marca cuáles de tus gastos
            son fijos en
            <RouterLink
              :to="adondeva"
              class="font-medium text-ink-gray-8 underline"
              >¿A dónde va el dinero?</RouterLink
            >.
          </p>
        </template>
        <template v-else>
          <p class="text-sm text-ink-gray-6">
            {{
              data.goal_months === 1
                ? 'Tu meta: 1 mes de gastos fijos'
                : `Tu meta: ${data.goal_months} meses de gastos fijos`
            }}
          </p>
          <p class="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span class="text-2xl font-semibold tabular-nums text-ink-gray-9">{{
              fmt(data.have)
            }}</span>
            <span class="text-base tabular-nums text-ink-gray-6"
              >de {{ fmt(data.reach.need) }}</span
            >
          </p>
          <div
            class="relative mt-3 h-3 overflow-hidden rounded-full bg-surface-gray-2"
            role="progressbar"
            :aria-valuenow="full"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-label="`Colchón al ${full} %`"
          >
            <span
              class="block h-full rounded-full bg-surface-green-3"
              :style="{ width: `${full}%` }"
            />
            <span
              v-for="tick in ticks"
              :key="tick"
              class="absolute inset-y-0 w-px bg-surface-base"
              :style="{ left: `${tick}%` }"
              aria-hidden="true"
            />
          </div>
          <p class="mt-2 text-sm text-ink-gray-7" data-colchon-cubre>
            <template v-if="data.covered !== null">
              Cubre
              <span class="font-medium tabular-nums text-ink-gray-9">{{
                coveredText(data.covered, data.goal_months)
              }}</span>
              · tus gastos fijos son
              <span class="tabular-nums">{{ fmt(data.essential) }}</span> al
              mes.
            </template>
            <RouterLink :to="adondeva" class="font-medium underline"
              >Ver tus gastos fijos</RouterLink
            >
          </p>
        </template>
      </section>

      <p
        v-if="data.unexplained && data.unexplained.count"
        class="flex-none mx-4 mt-3 rounded-7 bg-surface-amber-2 p-3 text-sm text-ink-amber-8"
        data-colchon-faltan
      >
        {{
          data.unexplained.count === 1
            ? 'Falta 1 movimiento del banco por explicar'
            : `Faltan ${data.unexplained.count} movimientos del banco por explicar`
        }}: tus gastos fijos pueden ser más de lo que se ve.
        <RouterLink
          :to="{ name: 'Bancos', query: companyQuery }"
          class="font-medium underline"
          >Explicarlos en Bancos</RouterLink
        >
      </p>

      <!-- When it is full: debt first, then the debt's payment rolls in. -->
      <section
        v-if="data.reach.why !== 'sin_gastos' && data.reach.why !== 'sin_meta'"
        class="flex-none mx-4 mt-3 rounded-7 border border-outline-gray-2 p-4"
        aria-label="Cuándo llegas"
        data-colchon-cuando
      >
        <p
          v-if="data.reach.finished && data.reach.months === 0"
          class="text-base font-medium text-ink-green-8"
        >
          Tu colchón está completo.
        </p>
        <ol v-else class="space-y-3">
          <li v-if="hasDebt" class="flex gap-3" data-colchon-paso="deudas">
            <span
              class="flex size-7 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-sm font-semibold text-ink-gray-8"
              >1</span
            >
            <span class="min-w-0 text-sm text-ink-gray-7">
              <span class="block text-base text-ink-gray-9">
                Primero tus deudas: {{ fmt(data.debt.owed) }}
              </span>
              <template v-if="data.debt.months === null">
                Con lo que abonas hoy no se terminan.
              </template>
              <template v-else-if="data.debt.free_on">
                Libre de deudas en {{ monthLabel(data.debt.free_on) }}.
              </template>
              <RouterLink :to="deudasLink" class="ml-1 font-medium underline"
                >Ver el plan de pago</RouterLink
              >
            </span>
          </li>
          <li class="flex gap-3" data-colchon-paso="colchon">
            <span
              class="flex size-7 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-sm font-semibold text-ink-gray-8"
              >{{ hasDebt ? 2 : 1 }}</span
            >
            <span class="min-w-0 text-sm text-ink-gray-7">
              <span class="block text-base text-ink-gray-9">
                <template v-if="data.reach.finished">
                  Colchón completo en {{ monthLabel(data.reach.ready_on) }}
                </template>
                <template v-else>Falta cuánto apartar al mes</template>
              </span>
              <template v-if="hasDebt">
                Al terminar las deudas, lo que abonas pasa al colchón.
              </template>
              <template v-if="data.settings.monthly_for_cushion">
                Apartas {{ fmt(data.settings.monthly_for_cushion) }} al mes.
              </template>
              <template v-else-if="!data.reach.finished">
                Fija un monto en Ajustes.
              </template>
            </span>
          </li>
        </ol>
        <ul
          v-if="data.reach.milestones.length"
          class="mt-3 flex flex-wrap gap-2"
          aria-label="Cada mes que juntas"
        >
          <li
            v-for="m in data.reach.milestones"
            :key="m.months"
            class="rounded-full bg-surface-gray-2 px-3 py-1 text-xs tabular-nums text-ink-gray-8"
          >
            {{ m.months === 1 ? '1 mes' : `${m.months} meses` }} ·
            {{ monthLabel(m.on) }}
          </li>
        </ul>
      </section>

      <!-- Goals reached (doco books/metas_dinero): a card at zero, each month of
           cushion; told in the chat and the bell the morning after. -->
      <section
        v-if="data.logros?.length"
        class="mx-4 mt-4 flex-none rounded-7 bg-surface-green-1 p-4"
        aria-label="Tus logros"
        data-colchon-logros
      >
        <h2 class="text-sm font-semibold text-ink-green-8">Tus logros</h2>
        <ul class="mt-2 space-y-2">
          <li
            v-for="(l, i) in data.logros.slice(0, 5)"
            :key="i"
            class="text-sm text-ink-gray-8"
          >
            <span class="block">{{ l.text }}</span>
            <span class="block text-xs text-ink-gray-6">{{
              dayLabel(l.on)
            }}</span>
          </li>
        </ul>
      </section>

      <!-- Where the cushion is kept. -->
      <section
        class="mt-4 flex-none"
        aria-label="Tus cuentas de ahorro"
        data-colchon-cuentas
      >
        <div class="flex items-center justify-between px-4 pb-1">
          <h2 class="text-sm font-semibold text-ink-gray-7">
            Tus cuentas de ahorro
          </h2>
          <Button
            v-if="data.can_edit"
            class="min-h-11"
            variant="ghost"
            label="Elegir"
            data-colchon-elegir
            @click="openAccounts"
          />
        </div>
        <ul v-if="chosen.length" class="divide-y divide-outline-gray-1">
          <li
            v-for="a in chosen"
            :key="a.account"
            class="flex items-center gap-3 px-4 py-3"
            :data-colchon-cuenta="a.account"
          >
            <span class="min-w-0 flex-1">
              <span class="block break-words text-base text-ink-gray-9">{{
                a.name
              }}</span>
              <span class="block text-xs text-ink-gray-6">{{
                SOURCE_WORDS[a.source] || ''
              }}</span>
            </span>
            <span
              class="whitespace-nowrap text-base font-semibold tabular-nums text-ink-gray-9"
              >{{ fmt(a.amount) }}</span
            >
          </li>
        </ul>
        <p v-else class="px-4 text-sm text-ink-gray-6" data-colchon-sin-cuentas>
          Aún no eliges dónde guardas tu colchón, así que cuenta $0. Elige tu
          cuenta de ahorro o tu caja fuerte.
        </p>
      </section>

      <!-- The month's plan, in the owner's order. -->
      <section
        v-if="data.averages.income"
        class="mt-4 flex-none"
        aria-label="Plan del mes"
        data-colchon-plan
      >
        <h2 class="px-4 pb-1 text-sm font-semibold text-ink-gray-7">
          Plan del mes
        </h2>
        <p class="px-4 pb-2 text-xs text-ink-gray-6">
          Con el promedio de {{ spanText
          }}{{
            data.goods_from === 'presupuesto'
              ? '; la mercancía, de tu presupuesto'
              : ''
          }}.
        </p>
        <ul class="divide-y divide-outline-gray-1">
          <li
            v-for="line in data.plan.lines"
            :key="line.key"
            class="flex items-baseline justify-between gap-3 px-4 py-2"
            :data-plan-linea="line.key"
          >
            <span class="min-w-0 text-base text-ink-gray-8">{{
              planLabel(line.key, data.debt)
            }}</span>
            <span
              class="whitespace-nowrap text-base tabular-nums"
              :class="
                line.key === 'income' ? 'text-ink-gray-9' : 'text-ink-gray-7'
              "
              >{{ line.key === 'income' ? '' : '−'
              }}{{ fmt(line.amount) }}</span
            >
          </li>
          <li
            class="flex items-baseline justify-between gap-3 px-4 py-3"
            data-plan-linea="free"
          >
            <span class="min-w-0 text-base font-medium text-ink-gray-9">{{
              data.plan.free >= 0 ? 'Te queda para retirar' : 'Te falta'
            }}</span>
            <span
              class="whitespace-nowrap text-lg font-semibold tabular-nums"
              :class="
                data.plan.free >= 0 ? 'text-ink-green-8' : 'text-ink-red-7'
              "
              >{{ fmt(Math.abs(data.plan.free)) }}</span
            >
          </li>
        </ul>

        <!-- «¿Puedo retirar X?» -->
        <form
          class="mx-4 mt-2 rounded-7 bg-surface-gray-1 p-3"
          data-colchon-retiro
          @submit.prevent="checkTake"
        >
          <label
            for="colchon-retiro"
            class="block text-sm font-medium text-ink-gray-8"
            >¿Cuánto quieres retirar este mes?</label
          >
          <div class="mt-1 flex gap-2">
            <input
              id="colchon-retiro"
              v-model="take.text"
              inputmode="decimal"
              autocomplete="off"
              placeholder="0.00"
              class="h-11 min-w-0 flex-1 rounded-6 border-0 bg-surface-base px-3 text-base tabular-nums text-ink-gray-9 focus:ring-2 focus:ring-outline-gray-3"
            />
            <Button
              type="submit"
              class="min-h-11 flex-none"
              label="Revisar"
              :loading="take.busy"
            />
          </div>
          <p
            v-if="take.result"
            class="mt-2 text-sm"
            :class="take.result.fits ? 'text-ink-green-8' : 'text-ink-gray-8'"
            data-colchon-retiro-respuesta
          >
            <template v-if="take.result.fits">
              Sí cabe: después te quedan
              {{ fmt(take.result.free - take.result.amount) }}.
            </template>
            <template v-else>
              No cabe en lo que queda: faltan {{ fmt(take.result.short) }}.
              <template v-if="take.result.from.length">
                Saldrían {{ takeFromText(take.result, fmt) }}.
              </template>
              <template v-if="take.result.uncovered > 0">
                Y aún faltarían {{ fmt(take.result.uncovered) }}, de tu
                mercancía o de tu ahorro.
              </template>
            </template>
          </p>
          <p
            v-if="take.problem"
            role="alert"
            class="mt-2 text-sm text-ink-red-7"
          >
            {{ take.problem }}
          </p>
        </form>
      </section>

      <div v-if="data.can_edit" class="flex-none px-4 pt-4">
        <Button
          class="min-h-11 w-full"
          label="Ajustes del colchón"
          data-colchon-ajustes
          @click="openSettings"
        />
      </div>
      <div class="h-24 flex-none lg:h-10" aria-hidden="true" />
    </template>

    <!-- Which accounts hold the cushion. -->
    <BottomSheet
      v-model:open="pick.open"
      title="Tus cuentas de ahorro"
      subtitle="El saldo de las que elijas cuenta como tu colchón."
      layer="colchon-cuentas"
    >
      <ul class="divide-y divide-outline-gray-1 pb-2" data-colchon-sheet>
        <li v-for="a in data?.accounts || []" :key="a.account">
          <button
            type="button"
            role="checkbox"
            class="press flex min-h-11 w-full items-center gap-3 py-2 text-left"
            :aria-checked="pick.chosen.includes(a.account)"
            :data-colchon-opcion="a.account"
            @click="toggle(a.account)"
          >
            <span
              class="flex size-6 flex-none items-center justify-center rounded-4 border"
              :class="
                pick.chosen.includes(a.account)
                  ? 'border-transparent bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
                  : 'border-outline-gray-3'
              "
              aria-hidden="true"
            >
              <span
                v-if="pick.chosen.includes(a.account)"
                class="lucide-check size-4"
              />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block break-words text-base text-ink-gray-9">{{
                a.name
              }}</span>
              <span class="block text-xs text-ink-gray-6">{{
                a.type === 'Cash' ? 'Efectivo' : 'Banco'
              }}</span>
            </span>
            <span
              class="whitespace-nowrap text-sm tabular-nums text-ink-gray-8"
              >{{ fmt(a.amount) }}</span
            >
          </button>
        </li>
      </ul>
      <p v-if="pick.problem" role="alert" class="pb-2 text-sm text-ink-red-7">
        {{ pick.problem }}
      </p>
      <template #actions>
        <div class="flex gap-2">
          <Button
            class="min-h-11 flex-1"
            label="Cancelar"
            @click="pick.open = false"
          />
          <Button
            class="min-h-11 flex-1"
            variant="solid"
            label="Guardar"
            :loading="pick.busy"
            data-colchon-guardar-cuentas
            @click="save({ accounts: pick.chosen }, pick)"
          />
        </div>
      </template>
    </BottomSheet>

    <!-- The goal in months and the monthly amount while debt is paid. -->
    <BottomSheet
      v-model:open="prefs.open"
      title="Ajustes del colchón"
      subtitle="Cuántos meses de gastos fijos quieres guardar."
      layer="colchon-ajustes"
    >
      <div class="space-y-4 pb-2" data-colchon-ajustes-sheet>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="n in MONTH_CHOICES"
            :key="n"
            type="button"
            class="press min-h-11 rounded-full px-4 text-sm"
            :class="
              prefs.months === n
                ? 'bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
                : 'border border-outline-gray-2 text-ink-gray-8'
            "
            :aria-pressed="prefs.months === n"
            :data-colchon-meses="n"
            @click="prefs.months = n"
          >
            {{ n === 1 ? '1 mes' : `${n} meses` }}
          </button>
        </div>
        <div>
          <label
            for="colchon-mensual"
            class="block text-sm font-medium text-ink-gray-8"
          >
            {{
              hasDebt
                ? 'Mientras pagas tus deudas, ¿cuánto apartas al mes?'
                : '¿Cuánto apartas al mes?'
            }}
          </label>
          <input
            id="colchon-mensual"
            v-model="prefs.monthly"
            inputmode="decimal"
            autocomplete="off"
            placeholder="0.00"
            class="mt-1 h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base tabular-nums text-ink-gray-9 focus:ring-2 focus:ring-outline-gray-3"
            data-colchon-mensual
          />
          <p v-if="hasDebt" class="mt-1 text-sm text-ink-gray-6">
            Con $0, primero terminas tus deudas y después lo que abonas pasa al
            colchón. Un colchón chico de dos semanas de gastos
            <template v-if="data?.essential"
              >({{ fmt(starterCushion(data.essential)) }})</template
            >
            evita volver a la tarjeta en una emergencia.
          </p>
        </div>
        <p v-if="prefs.problem" role="alert" class="text-sm text-ink-red-7">
          {{ prefs.problem }}
        </p>
      </div>
      <template #actions>
        <div class="flex gap-2">
          <Button
            class="min-h-11 flex-1"
            label="Cancelar"
            @click="prefs.open = false"
          />
          <Button
            class="min-h-11 flex-1"
            variant="solid"
            label="Guardar"
            :loading="prefs.busy"
            data-colchon-guardar-ajustes
            @click="saveSettings"
          />
        </div>
      </template>
    </BottomSheet>
  </div>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Button } from 'frappe-ui'
import { AppBar, BottomSheet } from '@/components/ui'
import { errorText, money } from '@/components/bancos/bancos'
import { monthLabel } from '@/components/deudas/deudas'
import { monthName } from '@/components/dinero/aDondeVa'
import {
  MONTH_CHOICES,
  SOURCE_WORDS,
  colchonApi,
  coveredText,
  fullness,
  parseAmount,
  planLabel,
  starterCushion,
  takeFromText,
} from '@/components/dinero/colchon'

const route = useRoute()
const data = ref(null)
const loading = ref(false)
const error = ref('')
const pick = reactive({ open: false, chosen: [], busy: false, problem: '' })
const prefs = reactive({
  open: false,
  months: 3,
  monthly: '',
  busy: false,
  problem: '',
})
const take = reactive({ text: '', busy: false, result: null, problem: '' })

const companyQuery = computed(() =>
  route.query.empresa ? { empresa: route.query.empresa } : {},
)
const adondeva = computed(() => ({
  name: 'TuDinero',
  params: { dinero: 'a-donde-va' },
  query: companyQuery.value,
}))
const deudasLink = computed(() => ({
  name: 'TuDinero',
  params: { dinero: 'deudas' },
  query: companyQuery.value,
}))
const fmt = (amount) => money(amount, data.value?.currency)
const dayLabel = (day) =>
  day
    ? new Date(`${day}T12:00:00`).toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : ''
const full = computed(() =>
  fullness(data.value?.have || 0, data.value?.reach?.need || 0),
)
const ticks = computed(() => {
  const goal = data.value?.goal_months || 0
  return goal > 1
    ? Array.from({ length: goal - 1 }, (_, i) => ((i + 1) / goal) * 100)
    : []
})
const chosen = computed(() =>
  (data.value?.accounts || []).filter((a) => a.chosen),
)
const hasDebt = computed(() => (data.value?.debt?.owed || 0) >= 0.005)
const spanText = computed(() => {
  const used = data.value?.months_used || []
  if (!used.length) return 'los meses anteriores'
  return `${monthName(used[used.length - 1], { short: true })} a ${monthName(used[0], { short: true })}`
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await colchonApi('estado', {
      company: route.query.empresa || undefined,
    })
  } catch (e) {
    error.value = errorText(e)
  } finally {
    loading.value = false
  }
}

function openAccounts() {
  Object.assign(pick, {
    open: true,
    chosen: chosen.value.map((a) => a.account),
    problem: '',
  })
}

function toggle(account) {
  pick.chosen = pick.chosen.includes(account)
    ? pick.chosen.filter((a) => a !== account)
    : [...pick.chosen, account]
}

function openSettings() {
  Object.assign(prefs, {
    open: true,
    months: data.value.goal_months,
    monthly: data.value.settings.monthly_for_cushion
      ? String(data.value.settings.monthly_for_cushion)
      : '',
    problem: '',
  })
}

async function save(values, state) {
  state.busy = true
  state.problem = ''
  try {
    data.value = await colchonApi('guardar', {
      company: data.value.company,
      ...values,
    })
    state.open = false
    take.result = null
  } catch (e) {
    state.problem = errorText(e)
  } finally {
    state.busy = false
  }
}

function saveSettings() {
  const monthly = prefs.monthly === '' ? 0 : parseAmount(prefs.monthly)
  if (monthly === null || monthly < 0) {
    prefs.problem = 'Escribe el monto en números, por ejemplo 2500.'
    return
  }
  save({ months: prefs.months, monthly: monthly || '0' }, prefs)
}

async function checkTake() {
  const amount = parseAmount(take.text)
  take.problem = ''
  if (!amount || amount <= 0) {
    take.result = null
    take.problem = 'Escribe cuánto quieres retirar, por ejemplo 10000.'
    return
  }
  take.busy = true
  try {
    const out = await colchonApi('estado', {
      company: data.value.company,
      retiro: amount,
    })
    data.value = out
    take.result = out.retiro
  } catch (e) {
    take.problem = errorText(e)
  } finally {
    take.busy = false
  }
}

watch(() => route.query.empresa, load, { immediate: true })
</script>
