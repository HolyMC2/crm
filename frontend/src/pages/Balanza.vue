<template>
  <!-- Balanza de comprobación (Shell SPEC §6 DD19): one level of the tree at a
       time, each account with its opening, cargos, abonos and closing for the
       period; a group opens its accounts. Totals say whether it balances. -->
  <div
    class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-bancos-balanza
  >
    <AppBar
      :title="data?.header?.label || 'Balanza de comprobación'"
      :context="data?.header ? 'Balanza de comprobación' : 'Contabilidad'"
      :back="backTo"
      :back-label="data?.header ? 'Subir un nivel' : 'Volver a Bancos'"
      :stack="!data?.header"
      :loading="loading && !!data"
    />
    <FilterChips
      class="py-2"
      :model-value="periodo"
      :chips="PERIODOS"
      :deselectable="false"
      label="Periodo"
      @update:model-value="(v) => v && navigate({ periodo: v })"
    />
    <p
      v-if="error"
      role="alert"
      class="mx-4 my-3 rounded-lg bg-surface-red-1 p-4 text-sm text-ink-red-7"
    >
      {{ error }}
    </p>
    <div
      v-else-if="!data"
      role="status"
      aria-label="Cargando balanza…"
      class="space-y-3 px-4 py-4"
    >
      <div
        v-for="n in 5"
        :key="n"
        class="h-14 animate-pulse rounded-lg bg-surface-gray-2"
      />
    </div>
    <template v-else>
      <section
        class="mx-4 grid flex-none grid-cols-2 gap-px overflow-hidden rounded-xl border border-outline-gray-2 bg-surface-gray-2"
        aria-label="Totales"
        data-bancos-balanza-totales
      >
        <div class="bg-surface-base p-3">
          <p class="text-xs text-ink-gray-6">Cargos</p>
          <p class="break-words font-semibold tabular-nums">
            {{ money(data.totals.debit, data.currency) }}
          </p>
        </div>
        <div class="bg-surface-base p-3">
          <p class="text-xs text-ink-gray-6">Abonos</p>
          <p class="break-words font-semibold tabular-nums">
            {{ money(data.totals.credit, data.currency) }}
          </p>
        </div>
      </section>
      <p
        v-if="!data.header"
        class="mx-4 mt-2 text-sm"
        :class="data.totals.balanced ? 'text-ink-green-8' : 'text-ink-red-7'"
      >
        {{
          data.totals.balanced
            ? 'Cuadra: los cargos y los abonos son iguales.'
            : 'No cuadra: revisa las pólizas del periodo con tu contador.'
        }}
      </p>
      <EmptyState
        v-if="!data.rows.length"
        class="py-10"
        state="empty"
        title="Sin movimientos en este periodo"
        message="Prueba «Este año» o «Todo»."
      />
      <ul v-else class="mt-2 divide-y divide-outline-gray-1">
        <li v-for="row in data.rows" :key="row.name">
          <ListRow
            :title="row.number ? `${row.number} · ${row.label}` : row.label"
            :subtitle="`Inicial ${money(row.opening, data.currency)} · Cargos ${money(row.debit, data.currency)} · Abonos ${money(row.credit, data.currency)}`"
            :subtitle-lines="3"
            :icon="row.group ? 'lucide-folder' : ''"
            :to="
              row.group
                ? {
                    name: 'Balanza',
                    query: { ...route.query, grupo: row.name },
                  }
                : {
                    name: 'CatalogoCuenta',
                    params: { cuenta: row.name },
                    query: { periodo },
                  }
            "
          >
            <template #trailing>
              <span
                class="whitespace-nowrap text-sm font-semibold tabular-nums"
                :class="row.closing < 0 ? 'text-ink-red-7' : 'text-ink-gray-9'"
                >{{ money(row.closing, data.currency) }}</span
              >
            </template>
          </ListRow>
        </li>
      </ul>
      <div class="h-24 flex-none lg:h-10" aria-hidden="true" />
    </template>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AppBar, EmptyState, FilterChips, ListRow } from '@/components/ui'
import {
  PERIODOS,
  bancosApi,
  errorText,
  money,
} from '@/components/bancos/bancos'

const route = useRoute()
const router = useRouter()
const data = ref(null)
const loading = ref(false)
const error = ref('')
const periodo = computed(() =>
  PERIODOS.some((p) => p.value === route.query.periodo)
    ? String(route.query.periodo)
    : 'mes',
)
const backTo = computed(() => {
  const path = data.value?.header?.path || []
  const query = { ...route.query }
  if (!data.value?.header) return { name: 'Bancos' }
  if (path.length) query.grupo = path[path.length - 1].name
  else delete query.grupo
  return { name: 'Balanza', query }
})

function navigate(next) {
  router.replace({ query: { ...route.query, ...next } })
}

let sequence = 0
async function load() {
  const mine = ++sequence
  loading.value = true
  error.value = ''
  try {
    const result = await bancosApi('balanza', {
      company: route.query.empresa || '',
      periodo: periodo.value,
      parent: route.query.grupo || '',
    })
    if (mine === sequence) data.value = result
  } catch (err) {
    if (mine === sequence) error.value = errorText(err)
  } finally {
    if (mine === sequence) loading.value = false
  }
}
watch(
  () => [periodo.value, route.query.grupo, route.query.empresa].join('|'),
  load,
  { immediate: true },
)
</script>
