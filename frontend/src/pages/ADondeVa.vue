<template>
  <!-- «¿A dónde va el dinero?» (crm docs/DINERO_EN_ORDEN.md §3b D3): the
       month's money in and out, the money out by destination against the
       owner's own average, the essential monthly expenses the cushion needs,
       and what the bank still has unexplained (so it is not counted here).
       An account's destination is the owner's to change, in two taps. -->
  <div
    class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-adondeva
  >
    <AppBar
      title="¿A dónde va el dinero?"
      context="Tu dinero"
      :back="{ name: 'Bancos', query: companyQuery }"
      back-label="Volver a Bancos"
      :loading="loading && !!data"
    />

    <div class="flex-none flex items-center gap-2 px-4 pt-2" data-adondeva-mes>
      <button
        type="button"
        class="press flex size-11 items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
        aria-label="Mes anterior"
        title="Mes anterior"
        @click="go(-1)"
      >
        <span class="lucide-chevron-left size-5" aria-hidden="true" />
      </button>
      <p
        class="min-w-0 flex-1 text-center text-base font-medium text-ink-gray-9"
      >
        {{ monthName(month) }}
      </p>
      <button
        type="button"
        class="press flex size-11 items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2 disabled:opacity-40"
        aria-label="Mes siguiente"
        title="Mes siguiente"
        :disabled="month >= currentMonth()"
        @click="go(1)"
      >
        <span class="lucide-chevron-right size-5" aria-hidden="true" />
      </button>
    </div>

    <p
      v-if="error"
      role="alert"
      class="mx-4 my-3 rounded-6 bg-surface-red-1 p-4 text-sm text-ink-red-7"
      data-adondeva-problem
    >
      {{ error }}
    </p>
    <div
      v-else-if="!data"
      role="status"
      aria-label="Cargando…"
      class="space-y-3 px-4 py-4"
    >
      <div class="h-20 animate-pulse rounded-7 bg-surface-gray-2" />
      <div class="h-12 animate-pulse rounded-6 bg-surface-gray-2" />
      <div class="h-12 animate-pulse rounded-6 bg-surface-gray-2" />
    </div>

    <template v-else>
      <!-- In, out, left. -->
      <section
        class="flex-none mx-4 mt-2 grid grid-cols-3 gap-px overflow-hidden rounded-7 border border-outline-gray-2 bg-surface-gray-2"
        aria-label="Resumen del mes"
        data-adondeva-resumen
      >
        <div class="bg-surface-base p-3">
          <p class="text-xs text-ink-gray-6">Entró</p>
          <p class="break-words font-semibold tabular-nums text-ink-gray-9">
            {{ money(data.income, data.currency) }}
          </p>
        </div>
        <div class="bg-surface-base p-3">
          <p class="text-xs text-ink-gray-6">Salió</p>
          <p class="break-words font-semibold tabular-nums text-ink-gray-9">
            {{ money(data.out, data.currency) }}
          </p>
        </div>
        <div class="bg-surface-base p-3">
          <p class="text-xs text-ink-gray-6">Te quedó</p>
          <p
            class="break-words font-semibold tabular-nums"
            :class="data.left < 0 ? 'text-ink-red-7' : 'text-ink-green-8'"
          >
            {{ money(data.left, data.currency) }}
          </p>
        </div>
      </section>

      <p
        v-if="data.unexplained && data.unexplained.count"
        class="flex-none mx-4 mt-3 rounded-7 bg-surface-amber-2 p-3 text-sm text-ink-amber-8"
        data-adondeva-faltan
      >
        {{
          data.unexplained.count === 1
            ? 'Falta 1 movimiento del banco por explicar'
            : `Faltan ${data.unexplained.count} movimientos del banco por explicar`
        }}
        ({{ money(data.unexplained.amount, data.currency) }}): todavía no están
        en tus libros, así que no cuentan aquí.
        <RouterLink
          :to="{ name: 'Bancos', query: companyQuery }"
          class="font-medium underline"
          >Explicarlos en Bancos</RouterLink
        >
      </p>

      <!-- The essential expenses: what the cushion is measured in. -->
      <section
        class="flex-none mx-4 mt-3 rounded-7 border border-outline-gray-2 p-4"
        aria-label="Gastos fijos"
        data-adondeva-fijos
      >
        <p class="text-sm text-ink-gray-6">Tus gastos fijos al mes</p>
        <p class="text-2xl font-semibold tabular-nums text-ink-gray-9">
          {{ money(data.fixed_average || data.fixed, data.currency) }}
        </p>
        <p class="text-sm text-ink-gray-6">
          {{
            data.fixed_average
              ? `Promedio de los tres meses anteriores; este mes van ${money(data.fixed, data.currency)}.`
              : 'Lo de este mes; con más meses en tus libros sale un promedio.'
          }}
          Un colchón de 3 meses serían
          <span class="font-medium tabular-nums text-ink-gray-8">{{
            money(cushion(data, 3), data.currency)
          }}</span
          >.
        </p>
      </section>

      <!-- Money out by destination. -->
      <section
        v-if="data.lines.length"
        class="mt-3 flex-none"
        aria-label="En qué se fue"
        data-adondeva-lineas
      >
        <h2 class="px-4 pb-1 text-sm font-semibold text-ink-gray-7">
          En qué se fue
        </h2>
        <ul class="divide-y divide-outline-gray-1">
          <li
            v-for="line in data.lines"
            :key="line.key"
            :data-destino="line.key"
            :class="line.not_money ? 'opacity-70' : ''"
          >
            <button
              type="button"
              class="press w-full px-4 py-3 text-left hover:bg-surface-gray-1"
              :aria-expanded="open === line.key"
              @click="open = open === line.key ? '' : line.key"
            >
              <span class="flex items-baseline justify-between gap-3">
                <span class="min-w-0 text-base text-ink-gray-9">
                  {{ line.label }}
                  <span
                    v-if="line.fixed && !line.not_money"
                    class="ml-1 rounded-full bg-surface-gray-2 px-2 text-xs text-ink-gray-7"
                    >fijo</span
                  >
                </span>
                <span
                  class="whitespace-nowrap text-base font-semibold tabular-nums text-ink-gray-9"
                  >{{ money(line.amount, data.currency) }}</span
                >
              </span>
              <span
                v-if="!line.not_money"
                class="mt-1 block h-2 overflow-hidden rounded-full bg-surface-gray-2"
                aria-hidden="true"
              >
                <span
                  class="block h-full rounded-full bg-[var(--muelle-accent)]"
                  :style="{ width: `${widths[line.key]}%` }"
                />
              </span>
              <span class="mt-1 block text-sm text-ink-gray-6">
                <template v-if="line.not_money">
                  Se registra como gasto, pero no sale dinero (depreciación,
                  redondeos, descuentos).
                </template>
                <template v-else>
                  {{
                    [
                      line.of_income !== null
                        ? `${line.of_income} % de lo que entró`
                        : '',
                      deltaText(line.amount, line.average),
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  }}
                </template>
              </span>
            </button>
            <ExpandTransition>
              <ul
                v-if="open === line.key"
                class="mx-4 mb-3 divide-y divide-outline-gray-1 rounded-7 border border-outline-gray-2"
                data-adondeva-cuentas
              >
                <li
                  v-for="a in line.accounts"
                  :key="a.account"
                  class="flex items-center gap-3 px-3 py-2"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block break-words text-sm text-ink-gray-9">{{
                      a.name
                    }}</span>
                    <span v-if="a.chosen" class="block text-xs text-ink-gray-6"
                      >elegido por ti</span
                    >
                  </span>
                  <span
                    class="whitespace-nowrap text-sm tabular-nums text-ink-gray-9"
                    >{{ money(a.amount, data.currency) }}</span
                  >
                  <Button
                    v-if="data.can_edit"
                    class="min-h-11 flex-none"
                    variant="ghost"
                    label="Cambiar"
                    :data-adondeva-cambiar="a.account"
                    @click="choose(a, line)"
                  />
                </li>
              </ul>
            </ExpandTransition>
          </li>
        </ul>
      </section>
      <EmptyState
        v-else
        class="py-10"
        title="Sin gastos en este mes"
        message="Cuando registres gastos, compras o retiros, aquí ves en qué se fue el dinero."
      />

      <!-- Six months: what came in and what went out. -->
      <section
        class="mt-4 flex-none px-4"
        aria-label="Los últimos meses"
        data-adondeva-tendencia
      >
        <h2 class="pb-1 text-sm font-semibold text-ink-gray-7">
          Los últimos meses
        </h2>
        <ul class="space-y-2">
          <li
            v-for="m in data.trend"
            :key="m.month"
            class="grid grid-cols-[5rem_1fr] items-center gap-2"
          >
            <span class="text-sm text-ink-gray-7">{{
              monthName(m.month, { short: true })
            }}</span>
            <span class="space-y-1">
              <span
                class="block h-2 overflow-hidden rounded-full bg-surface-gray-2"
                aria-hidden="true"
              >
                <span
                  class="block h-full rounded-full bg-surface-green-3"
                  :style="{ width: `${trendWidth(m.income)}%` }"
                />
              </span>
              <span
                class="block h-2 overflow-hidden rounded-full bg-surface-gray-2"
                aria-hidden="true"
              >
                <span
                  class="block h-full rounded-full bg-[var(--muelle-accent)]"
                  :style="{ width: `${trendWidth(m.out)}%` }"
                />
              </span>
              <span class="block text-xs tabular-nums text-ink-gray-6"
                >Entró {{ money(m.income, data.currency) }} · salió
                {{ money(m.out, data.currency) }}</span
              >
            </span>
          </li>
        </ul>
      </section>
      <div class="h-24 flex-none lg:h-10" aria-hidden="true" />
    </template>

    <BottomSheet
      v-model:open="sheet.open"
      :title="sheet.account?.name || 'Cuenta'"
      subtitle="¿A dónde va lo que se registra en esta cuenta?"
      layer="adondeva-destino"
    >
      <div class="space-y-4 pb-2" data-adondeva-sheet>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="d in choosable"
            :key="d.key"
            type="button"
            class="press min-h-11 rounded-full px-4 text-sm"
            :class="
              sheet.destino === d.key
                ? 'bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
                : 'border border-outline-gray-2 text-ink-gray-8'
            "
            :aria-pressed="sheet.destino === d.key"
            :data-destino-opcion="d.key"
            @click="sheet.destino = d.key"
          >
            {{ d.label }}
          </button>
        </div>
        <div class="space-y-1">
          <p class="text-sm text-ink-gray-7">¿Es un gasto fijo cada mes?</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="c in FIXED_CHOICES"
              :key="c.value"
              type="button"
              class="press min-h-11 rounded-full px-4 text-sm"
              :class="
                sheet.fijo === c.value
                  ? 'bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
                  : 'border border-outline-gray-2 text-ink-gray-8'
              "
              :aria-pressed="sheet.fijo === c.value"
              @click="sheet.fijo = c.value"
            >
              {{ c.label }}
            </button>
          </div>
          <p class="text-sm text-ink-gray-6">
            Los gastos fijos son los que tu colchón tiene que cubrir.
          </p>
        </div>
        <p
          v-if="sheet.problem"
          role="alert"
          class="rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          {{ sheet.problem }}
        </p>
      </div>
      <template #actions>
        <div class="flex gap-2">
          <Button
            class="min-h-11 flex-1"
            label="Cancelar"
            @click="sheet.open = false"
          />
          <Button
            class="min-h-11 flex-1"
            variant="solid"
            label="Guardar"
            :loading="sheet.busy"
            data-adondeva-guardar
            @click="saveChoice"
          />
        </div>
      </template>
    </BottomSheet>
  </div>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import {
  AppBar,
  BottomSheet,
  EmptyState,
  ExpandTransition,
} from '@/components/ui'
import { errorText, money } from '@/components/bancos/bancos'
import {
  FIXED_CHOICES,
  barWidths,
  currentMonth,
  cushion,
  deltaText,
  dineroApi,
  monthName,
  shiftMonth,
} from '@/components/dinero/aDondeVa'

const route = useRoute()
const router = useRouter()
const data = ref(null)
const loading = ref(false)
const error = ref('')
const open = ref('')
const sheet = reactive({
  open: false,
  account: null,
  destino: '',
  fijo: '',
  busy: false,
  problem: '',
})

const month = computed(() => String(route.query.mes || '') || currentMonth())
const companyQuery = computed(() =>
  route.query.empresa ? { empresa: route.query.empresa } : {},
)
const widths = computed(() => barWidths(data.value?.lines || []))
const choosable = computed(() => data.value?.destinos || [])
const trendMax = computed(() =>
  Math.max(1, ...(data.value?.trend || []).flatMap((m) => [m.income, m.out])),
)

function trendWidth(value) {
  return Math.max(0, Math.round(((value || 0) / trendMax.value) * 100))
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await dineroApi('mes', {
      company: route.query.empresa || undefined,
      month: month.value,
    })
  } catch (e) {
    error.value = errorText(e)
  } finally {
    loading.value = false
  }
}

function go(delta) {
  const next = shiftMonth(month.value, delta)
  if (next > currentMonth()) return
  router.replace({
    query: { ...route.query, mes: next === currentMonth() ? undefined : next },
  })
}

function choose(account, line) {
  Object.assign(sheet, {
    open: true,
    account,
    destino: line.key,
    fijo: account.chosen ? (account.fixed ? '1' : '0') : '',
    problem: '',
  })
}

async function saveChoice() {
  sheet.busy = true
  sheet.problem = ''
  try {
    data.value = await dineroApi('cambiar', {
      company: data.value.company,
      account: sheet.account.account,
      destino: sheet.destino,
      fijo: sheet.fijo,
      month: month.value,
    })
    sheet.open = false
  } catch (e) {
    sheet.problem = errorText(e)
  } finally {
    sheet.busy = false
  }
}

watch(() => [route.query.empresa, route.query.mes], load, { immediate: true })
</script>
