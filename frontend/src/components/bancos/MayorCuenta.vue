<template>
  <!-- One account's Mayor: the balance, the period's opening, cargos, abonos
       and closing (no Dr./Cr.), and its movements by day with the balance
       after each one. A movement opens its document in the shell. -->
  <div
    class="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-bancos-mayor
  >
    <AppBar
      :title="account?.label || 'Cuenta'"
      :context="context"
      :back="pane ? false : backTo"
      back-label="Subir un nivel"
      :bell="!pane"
      :stack="false"
      :loading="loading && !!data"
    />

    <p
      v-if="error"
      role="alert"
      class="mx-4 my-3 rounded-6 bg-surface-red-1 p-4 text-sm text-ink-red-7"
    >
      {{ error }}
    </p>

    <section
      v-if="account"
      class="px-4 pb-2 pt-3"
      aria-label="Saldo"
      data-bancos-mayor-hero
    >
      <p class="text-sm text-ink-gray-6">
        {{
          [account.root_word, accountTypeWord(account.account_type)]
            .filter(Boolean)
            .join(' · ')
        }}
        · saldo hoy
      </p>
      <p
        class="break-words text-3xl font-semibold tabular-nums"
        :class="
          Number(account.balance) < 0 ? 'text-ink-red-7' : 'text-ink-gray-9'
        "
      >
        {{ money(account.balance, data?.currency) }}
      </p>
      <p
        v-if="account.agrupador"
        class="mt-1 text-sm text-ink-gray-6"
        data-bancos-sat
      >
        {{ accountLine({ agrupador: account.agrupador }) }}
      </p>
      <p v-else-if="account.number" class="mt-1 text-sm text-ink-gray-6">
        Cuenta {{ account.number }}
      </p>
    </section>

    <FilterChips
      class="py-2"
      :model-value="periodo"
      :chips="PERIODOS"
      :deselectable="false"
      label="Periodo"
      @update:model-value="setPeriodo"
    />

    <!-- The Mayor's four numbers for the period. -->
    <dl
      v-if="data?.mayor"
      class="mx-4 grid flex-none grid-cols-2 gap-px overflow-hidden rounded-7 border border-outline-gray-2 bg-surface-gray-2"
      data-bancos-mayor-resumen
    >
      <div v-for="cell in cells" :key="cell.label" class="bg-surface-base p-3">
        <dt class="text-xs text-ink-gray-6">{{ cell.label }}</dt>
        <dd
          class="break-words text-base font-semibold tabular-nums text-ink-gray-9"
        >
          {{ money(cell.value, data.currency) }}
        </dd>
      </div>
    </dl>

    <div
      v-if="loading && !rows.length"
      role="status"
      aria-label="Cargando movimientos…"
      class="space-y-3 px-4 py-4"
    >
      <div
        v-for="n in 5"
        :key="n"
        class="h-14 animate-pulse rounded-6 bg-surface-gray-2"
      />
    </div>
    <EmptyState
      v-else-if="data && !rows.length"
      class="py-10"
      :state="data.movements.readable ? 'empty' : 'denied'"
      :title="
        data.movements.readable
          ? 'Sin movimientos en este periodo'
          : 'No puedes ver los movimientos contables'
      "
      :message="
        data.movements.readable
          ? 'Prueba «Este año» o «Todo».'
          : 'Pide a tu encargado acceso al libro mayor.'
      "
    />
    <div v-else data-bancos-mayor-movimientos>
      <section
        v-for="group in groups"
        :key="group.day"
        :aria-label="group.label"
      >
        <h2
          class="sticky top-0 z-[1] bg-surface-base px-4 pb-1 pt-3 text-sm font-semibold text-ink-gray-7"
        >
          {{ group.label }}
        </h2>
        <ul class="divide-y divide-outline-gray-1">
          <li v-for="row in group.rows" :key="row.name">
            <MovimientoRow
              :row="row"
              vista="libros"
              :currency="data?.currency"
              @open="openRow"
            />
          </li>
        </ul>
      </section>
      <div v-if="data?.movements?.next" class="p-4 text-center">
        <Button
          label="Ver movimientos anteriores"
          :loading="loading"
          class="min-h-11"
          @click="load(true)"
        />
      </div>
      <div class="h-24 flex-none lg:h-10" aria-hidden="true" />
    </div>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import { AppBar, EmptyState, FilterChips } from '@/components/ui'
import { shellBoot } from '@/composables/muelleShell'
import MovimientoRow from './MovimientoRow.vue'
import {
  PERIODOS,
  accountLine,
  accountTypeWord,
  bancosApi,
  errorText,
  groupByDay,
  money,
  voucherRoute,
} from './bancos'

const props = defineProps({
  cuenta: { type: String, required: true },
  pane: { type: Boolean, default: false },
})
const route = useRoute()
const router = useRouter()
const data = ref(null)
const rows = ref([])
const loading = ref(false)
const error = ref('')

const periodo = computed(() =>
  PERIODOS.some((p) => p.value === route.query.periodo)
    ? String(route.query.periodo)
    : 'anio',
)
const account = computed(() => data.value?.account || null)
const context = computed(() => {
  const path = account.value?.path || []
  return path.length ? path[path.length - 1].label : 'Catálogo de cuentas'
})
const backTo = computed(() => {
  const path = account.value?.path || []
  const query = route.query.empresa ? { empresa: route.query.empresa } : {}
  if (route.query.mayor && account.value?.group)
    return { name: 'CatalogoCuenta', params: { cuenta: props.cuenta }, query }
  return path.length
    ? {
        name: 'CatalogoCuenta',
        params: { cuenta: path[path.length - 1].name },
        query,
      }
    : { name: 'CatalogoCuentas', query }
})
const cells = computed(() => {
  const m = data.value?.mayor
  if (!m) return []
  return [
    { label: 'Saldo inicial', value: m.opening },
    { label: 'Saldo final', value: m.closing },
    { label: 'Cargos', value: m.debit },
    { label: 'Abonos', value: m.credit },
  ]
})
const groups = computed(() => groupByDay(rows.value))

function setPeriodo(value) {
  if (!value) return
  router.replace({ query: { ...route.query, periodo: value } })
}

let sequence = 0
async function load(more = false) {
  const mine = ++sequence
  loading.value = true
  error.value = ''
  try {
    const result = await bancosApi('cuenta_contable', {
      account: props.cuenta,
      periodo: periodo.value,
      start: more ? data.value?.movements?.next : 0,
      carry: more ? data.value?.movements?.carry : '',
    })
    if (mine !== sequence) return
    rows.value = more
      ? [...rows.value, ...result.movements.rows]
      : result.movements.rows
    data.value = result
  } catch (err) {
    if (mine === sequence) error.value = errorText(err)
  } finally {
    if (mine === sequence) loading.value = false
  }
}

async function openRow(row) {
  const to = await voucherRoute(row.voucher, shellBoot.value)
  if (to) router.push(to)
}

watch(
  () => [props.cuenta, periodo.value].join('|'),
  () => load(),
  {
    immediate: true,
  },
)
</script>
