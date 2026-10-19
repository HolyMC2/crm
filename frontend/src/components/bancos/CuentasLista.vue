<template>
  <!-- Bancos (Shell SPEC §6 DD19): what is in the accounts, as a bank app
       shows it (BBVA «Tus productos», Xero «Bank accounts»): the total, then
       one card per account with its balance and what is left to reconcile. -->
  <div
    class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-bancos-lista
  >
    <AppBar
      title="Bancos"
      context="Dinero"
      :scopes="scopes"
      :scope="company"
      scope-title="Empresa"
      :bell="!pane"
      :stack="!pane"
      @update:scope="pickCompany"
    />

    <div
      v-if="loadError"
      role="alert"
      class="mx-4 my-3 space-y-3 rounded-lg bg-surface-red-1 p-4 text-sm text-ink-red-7"
    >
      <p>{{ loadError }}</p>
      <Button label="Reintentar" @click="load()" />
    </div>
    <div
      v-else-if="!data"
      role="status"
      aria-label="Cargando cuentas…"
      class="space-y-3 px-4 py-4"
    >
      <div class="h-28 animate-pulse rounded-xl bg-surface-gray-2" />
      <div
        v-for="n in 4"
        :key="n"
        class="h-20 animate-pulse rounded-xl bg-surface-gray-2"
      />
    </div>
    <template v-else>
      <!-- Hero: the money across accounts, as of today (Xero «Overall cash balance»). -->
      <section
        class="mx-4 mt-2 rounded-2xl bg-surface-gray-1 p-4"
        aria-label="Dinero en tus cuentas"
        data-bancos-total
      >
        <p class="text-sm text-ink-gray-6">Dinero en tus cuentas</p>
        <p
          class="mt-1 break-words text-3xl font-semibold tabular-nums text-ink-gray-9"
        >
          {{ data.total === null ? '—' : money(data.total, data.currency) }}
        </p>
        <p class="mt-1 text-sm text-ink-gray-6">
          {{
            data.total === null
              ? 'Pide acceso a los saldos para ver el total.'
              : 'Saldo en libros, hoy. Las tarjetas no suman.'
          }}
        </p>
        <p
          v-if="data.pending"
          class="mt-3 inline-flex min-h-8 items-center gap-1.5 rounded-full bg-surface-amber-2 px-3 text-sm font-medium text-ink-amber-8"
          data-bancos-pending
        >
          {{ pendingText(data.pending) }}
        </p>
      </section>

      <EmptyState
        v-if="!data.cards.length"
        class="py-10"
        state="empty"
        title="Sin cuentas de banco ni de efectivo"
        message="Cuando tu contador dé de alta una cuenta bancaria o una caja, aparece aquí con su saldo."
      />
      <section
        v-for="group in groups"
        :key="group.kind"
        :aria-label="group.label"
        class="mt-4"
      >
        <h2
          class="flex items-baseline justify-between gap-3 px-4 pb-2 text-sm font-semibold text-ink-gray-7"
        >
          <span>{{ group.label }}</span>
          <span
            v-if="group.total !== null"
            class="tabular-nums font-medium text-ink-gray-6"
            >{{ money(group.total, data.currency) }}</span
          >
        </h2>
        <ul class="space-y-2 px-4">
          <li v-for="card in group.cards" :key="card.cuenta">
            <CuentaCard :card="card" :selected="card.cuenta === selected" />
          </li>
        </ul>
      </section>

      <section v-if="data.can?.catalogo" class="mt-6" aria-label="Contabilidad">
        <h2 class="px-4 pb-1 text-sm font-semibold text-ink-gray-7">
          Contabilidad
        </h2>
        <ul class="divide-y divide-outline-gray-1">
          <li>
            <ListRow
              title="Catálogo de cuentas"
              subtitle="Todas tus cuentas con su saldo y su código SAT"
              icon="lucide-folder"
              :to="{ name: 'CatalogoCuentas', query: companyQuery }"
            >
              <template #trailing>
                <span
                  class="lucide-chevron-right size-5 text-ink-gray-5"
                  aria-hidden="true"
                />
              </template>
            </ListRow>
          </li>
          <li v-if="data.can?.saldos">
            <ListRow
              title="Balanza de comprobación"
              subtitle="Saldos, cargos y abonos del mes"
              icon="lucide-chart-column"
              :to="{ name: 'Balanza', query: companyQuery }"
            >
              <template #trailing>
                <span
                  class="lucide-chevron-right size-5 text-ink-gray-5"
                  aria-hidden="true"
                />
              </template>
            </ListRow>
          </li>
        </ul>
      </section>
      <div class="h-24 flex-none lg:h-10" aria-hidden="true" />
    </template>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import { AppBar, EmptyState, ListRow } from '@/components/ui'
import CuentaCard from './CuentaCard.vue'
import { bancosApi, errorText, money } from './bancos'

const props = defineProps({
  /** Left column of the desktop split: a compact bar, no bell. */
  pane: { type: Boolean, default: false },
  selected: { type: String, default: '' },
})

const route = useRoute()
const router = useRouter()
const data = ref(null)
const loadError = ref('')
const company = computed(() =>
  String(route.query.empresa || data.value?.company || ''),
)
const companyQuery = computed(() =>
  route.query.empresa ? { empresa: route.query.empresa } : {},
)
const scopes = computed(() =>
  (data.value?.empresas || []).length > 1
    ? data.value.empresas.map((name) => ({ value: name, label: name }))
    : [],
)

const LABELS = {
  banco: 'Bancos',
  tarjeta: 'Tarjetas de crédito',
  efectivo: 'Efectivo',
}
const groups = computed(() => {
  const out = []
  for (const card of data.value?.cards || []) {
    let group = out.find((g) => g.kind === card.kind)
    if (!group) {
      group = { kind: card.kind, label: LABELS[card.kind], cards: [], total: 0 }
      out.push(group)
    }
    group.cards.push(card)
    if (card.balance === null || card.currency !== data.value.currency)
      group.total = null
    else if (group.total !== null) group.total += Number(card.balance) || 0
  }
  return out
})

function pendingText(n) {
  return n === 1
    ? '1 movimiento sin conciliar'
    : `${n} movimientos sin conciliar`
}

function pickCompany(value) {
  router.replace({ query: { ...route.query, empresa: value } })
}

let sequence = 0
async function load() {
  const mine = ++sequence
  loadError.value = ''
  try {
    const result = await bancosApi('cuentas', {
      company: route.query.empresa || '',
    })
    if (mine === sequence) data.value = result
  } catch (error) {
    if (mine === sequence) loadError.value = errorText(error)
  }
}
watch(() => route.query.empresa, load, { immediate: true })
defineExpose({ reload: load, props })
</script>
