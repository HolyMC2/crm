<template>
  <!-- Transferencias (crm docs/DINERO_EN_ORDEN.md §3e): every transfer a
       customer said they sent and what Banxico or the bank says, with the
       ones that reached the bank without a sale. Who cannot see the money
       sees the transfers they checked. -->
  <div
    class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-transferencias
  >
    <AppBar
      title="Transferencias"
      context="Bancos"
      :back="{ name: 'Bancos', query: companyQuery }"
      back-label="Volver a Bancos"
      :loading="loading && !!data"
    >
      <template v-if="setup?.ve_todas" #actions>
        <button
          type="button"
          class="press grid size-10 place-items-center rounded-full text-ink-gray-7"
          aria-label="Cómo se revisan"
          title="Cómo se revisan"
          data-transferencias-ajustes-abrir
          @click="sheets.ajustes = true"
        >
          <span class="lucide-settings-2 size-5" aria-hidden="true" />
        </button>
      </template>
    </AppBar>

    <p
      v-if="error"
      role="alert"
      class="mx-4 my-3 rounded-6 bg-surface-red-1 p-4 text-sm text-ink-red-7"
      data-transferencias-problema
    >
      {{ error }}
    </p>

    <!-- Nothing can be checked until an account has its CLABE. -->
    <section
      v-if="setup && !setup.cuentas.length"
      class="mx-4 mt-2 flex-none rounded-7 border border-outline-gray-2 p-4"
      data-transferencias-sin-cuenta
    >
      <p class="text-base font-medium text-ink-gray-9">
        Falta la CLABE donde te transfieren
      </p>
      <p class="mt-1 text-sm text-ink-gray-6">
        Con ella Muelle pregunta a Banxico si una transferencia llegó.
        {{
          setup.ve_todas
            ? 'Agrégala en un minuto.'
            : 'Pídele al dueño que la agregue.'
        }}
      </p>
      <Button
        v-if="setup.ve_todas"
        class="mt-3 min-h-11"
        variant="solid"
        label="Agregar la CLABE"
        @click="sheets.ajustes = true"
      />
    </section>

    <div
      v-if="!data && !error"
      role="status"
      aria-label="Cargando…"
      class="space-y-3 px-4 py-4"
    >
      <div class="h-24 animate-pulse rounded-7 bg-surface-gray-2" />
      <div class="h-14 animate-pulse rounded-7 bg-surface-gray-2" />
      <div class="h-14 animate-pulse rounded-7 bg-surface-gray-2" />
    </div>

    <template v-else-if="data">
      <!-- The period's totals; each tile is also its list's filter. -->
      <section
        class="mx-4 mt-2 grid flex-none grid-cols-2 gap-2 lg:grid-cols-4"
        aria-label="Resumen"
        data-transferencias-resumen
      >
        <KpiTile
          label="Llegaron"
          :value="fmt(data.resumen.llegaron_total)"
          :hint="
            countText(data.resumen.llegaron, 'transferencia', 'transferencias')
          "
          :pressed="filtro === 'Arrived'"
          @click="toggle('Arrived')"
        />
        <KpiTile
          label="Buscando"
          :value="String(data.resumen.buscando)"
          :tone="data.resumen.buscando ? 'warning' : 'neutral'"
          hint="Banxico o tu banco"
          :pressed="filtro === 'Searching'"
          @click="toggle('Searching')"
        />
        <KpiTile
          label="Sin venta"
          :value="fmt(data.resumen.sin_venta_total)"
          :tone="data.resumen.sin_venta ? 'warning' : 'neutral'"
          :hint="
            data.resumen.sin_venta
              ? countText(data.resumen.sin_venta, 'sin cobrar', 'sin cobrar')
              : 'Todo tiene venta'
          "
          :pressed="filtro === 'sin_venta'"
          @click="toggle('sin_venta')"
        />
        <KpiTile
          label="No llegan"
          :value="String(data.resumen.no_aparecen + data.resumen.no_coinciden)"
          :tone="
            data.resumen.no_aparecen + data.resumen.no_coinciden
              ? 'danger'
              : 'neutral'
          "
          :hint="
            data.resumen.no_coinciden
              ? `${data.resumen.no_coinciden} no coinciden`
              : 'Ni Banxico ni el banco'
          "
          :pressed="filtro === 'Not found'"
          @click="toggle('Not found')"
        />
      </section>

      <div class="mx-4 mt-3 flex-none">
        <Segmented
          v-model="periodo"
          label="Periodo"
          :options="PERIODOS"
          data-transferencias-periodo
        />
      </div>
      <FilterChips
        v-model="filtro"
        class="mt-3 flex-none"
        label="Ver"
        :chips="chips"
      />
      <div class="mx-4 mt-3 flex-none">
        <input
          v-model="q"
          type="search"
          autocomplete="off"
          class="min-h-11 w-full rounded-full border border-outline-gray-2 bg-surface-base px-4 text-base text-ink-gray-9"
          placeholder="Buscar nombre, banco, clave o monto"
          aria-label="Buscar transferencias"
          data-transferencias-buscar
        />
      </div>

      <EmptyState
        v-if="!data.filas.length"
        class="mt-6"
        state="empty"
        :title="emptyTitle"
        :message="emptyMessage"
      />

      <div v-else class="trf-list mt-3 pb-28" data-transferencias-lista>
        <section
          v-for="g in grupos"
          :key="g.fecha"
          :aria-label="diaTexto(g.fecha)"
        >
          <h2
            class="sticky top-0 z-10 flex items-baseline justify-between gap-3 bg-surface-base px-4 py-2 text-sm"
          >
            <span class="font-semibold text-ink-gray-8">{{
              diaTexto(g.fecha)
            }}</span>
            <span class="num text-ink-gray-6">{{ dayTotal(g) }}</span>
          </h2>
          <div
            class="trf-head px-4 pb-1 text-xs text-ink-gray-6"
            aria-hidden="true"
          >
            <span>Hora</span><span>Quién envió</span
            ><span class="trf-col-ruta">{{
              unaCuenta ? 'Banco' : 'Banco y cuenta'
            }}</span
            ><span class="text-right">Monto</span><span>Estado</span
            ><span class="trf-col-venta">Venta</span
            ><span class="trf-col-quien">Revisó</span>
          </div>
          <ul class="divide-y divide-outline-gray-1">
            <li v-for="f in g.filas" :key="f.name">
              <button
                type="button"
                class="trf-row press w-full px-4 py-2.5 text-left hover:bg-surface-gray-1"
                :data-transferencia-fila="f.name"
                :data-estado="f.estado"
                @click="openDetail(f.name)"
              >
                <span class="trf-hora num text-sm text-ink-gray-6">{{
                  f.hora || '—'
                }}</span>
                <span class="trf-quien min-w-0">
                  <span
                    class="block break-words text-base"
                    :class="f.ordenante ? 'text-ink-gray-9' : 'text-ink-gray-6'"
                    >{{ quienTexto(f) }}</span
                  >
                  <span
                    class="trf-sub block truncate text-sm text-ink-gray-6"
                    >{{ rutaTexto(f, { unaCuenta }) }}</span
                  >
                </span>
                <span class="trf-col-ruta truncate text-sm text-ink-gray-7">{{
                  rutaTexto(f, { unaCuenta })
                }}</span>
                <span class="trf-monto text-right">
                  <span
                    class="num block text-base font-medium text-ink-gray-9"
                    >{{ fmt(f.monto) }}</span
                  >
                  <span
                    class="trf-sub trf-venta block truncate text-sm"
                    :class="ventaTono(f)"
                    >{{ ventaTexto(f) }}</span
                  >
                </span>
                <span class="trf-estado">
                  <StatusChip
                    :label="estadoDe(f.estado).label"
                    :tone="estadoDe(f.estado).tone"
                  />
                </span>
                <span
                  class="trf-col-venta truncate text-sm"
                  :class="ventaTono(f)"
                  >{{
                    f.venta?.name ||
                    (f.propia
                      ? 'Entre tus cuentas'
                      : f.sin_venta
                        ? 'Sin venta'
                        : '—')
                  }}</span
                >
                <span class="trf-col-quien truncate text-sm text-ink-gray-7">{{
                  f.revisada_por || 'El banco'
                }}</span>
              </button>
            </li>
          </ul>
        </section>
      </div>
    </template>

    <Fab
      v-if="setup?.activo && setup?.cuentas?.length"
      label="Revisar transferencia"
      icon="lucide-badge-check"
      data-transferencias-revisar
      @click="sheets.revisar = true"
    />

    <RevisarTransferenciaSheet
      v-model:open="sheets.revisar"
      :setup="setup"
      :company="String(route.query.empresa || '')"
      @revisada="load()"
    />
    <TransferenciaSheet
      v-model:open="sheets.detalle"
      :name="detalle"
      :can-link="Boolean(setup?.ve_todas)"
      @cambio="load()"
    />
    <TransferenciasAjustesSheet
      v-model:open="sheets.ajustes"
      v-model:setup="setup"
    />
  </div>
</template>

<script setup>
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import {
  AppBar,
  EmptyState,
  Fab,
  FilterChips,
  KpiTile,
  Segmented,
  StatusChip,
} from '@/components/ui'
import { errorText, money } from '@/components/bancos/bancos'
import {
  PERIODOS,
  diaTexto,
  estadoDe,
  filtroChips,
  porDia,
  quienTexto,
  rango,
  rutaTexto,
  transferenciasApi,
  ventaTexto,
  ventaTono,
} from '@/components/dinero/transferencias'

const RevisarTransferenciaSheet = defineAsyncComponent(
  () => import('@/components/dinero/RevisarTransferenciaSheet.vue'),
)
const TransferenciaSheet = defineAsyncComponent(
  () => import('@/components/dinero/TransferenciaSheet.vue'),
)
const TransferenciasAjustesSheet = defineAsyncComponent(
  () => import('@/components/dinero/TransferenciasAjustesSheet.vue'),
)

const REFRESH_MS = 15000
const route = useRoute()
const router = useRouter()
const setup = ref(null)
const data = ref(null)
const loading = ref(false)
const error = ref('')
const periodo = ref(String(route.query.periodo || 'hoy'))
const filtro = ref(String(route.query.ver || ''))
const q = ref('')
const detalle = ref('')
const sheets = reactive({
  revisar: route.query.revisar === '1',
  detalle: false,
  ajustes: false,
})
let timer = null
let searchTimer = null

const companyQuery = computed(() =>
  route.query.empresa ? { empresa: route.query.empresa } : {},
)
const chips = computed(() => filtroChips(data.value?.resumen))
const grupos = computed(() => porDia(data.value?.filas || []))
const fmt = (amount) => money(amount, data.value?.currency || 'MXN')
const unaCuenta = computed(() => (setup.value?.cuentas?.length || 0) <= 1)

const emptyTitle = computed(() =>
  filtro.value
    ? 'Nada en esta vista'
    : periodo.value === 'hoy'
      ? 'Hoy no hay transferencias'
      : 'Sin transferencias en estos días',
)
const emptyMessage = computed(() =>
  setup.value?.cuentas?.length
    ? 'Cuando un cliente te transfiera, revísala aquí o en caja: Muelle la busca en Banxico.'
    : 'Agrega la CLABE de tu cuenta para revisar transferencias.',
)

function countText(n, one, many) {
  return n === 1 ? `1 ${one}` : `${n} ${many}`
}

function dayTotal(group) {
  const arrived = group.filas.filter((f) => f.estado === 'Arrived')
  const total = arrived.reduce((sum, f) => sum + f.monto, 0)
  return `${countText(arrived.length, 'llegó', 'llegaron')}, ${fmt(total)}`
}

function toggle(value) {
  filtro.value = filtro.value === value ? '' : value
}

async function loadSetup() {
  try {
    setup.value = await transferenciasApi('inicio', {
      company: route.query.empresa || undefined,
    })
  } catch (e) {
    error.value = errorText(e)
  }
}

async function load() {
  loading.value = true
  try {
    data.value = await transferenciasApi('lista', {
      company: route.query.empresa || undefined,
      ...rango(periodo.value),
      filtro: filtro.value || undefined,
      q: q.value.trim() || undefined,
    })
    error.value = ''
  } catch (e) {
    error.value = errorText(e)
  } finally {
    loading.value = false
  }
}

function openDetail(name) {
  detalle.value = name
  sheets.detalle = true
}

watch([periodo, filtro], () => {
  router.replace({
    query: {
      ...route.query,
      periodo: periodo.value === 'hoy' ? undefined : periodo.value,
      ver: filtro.value || undefined,
    },
  })
  load()
})
watch(q, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(load, 250)
})
watch(
  () => route.query.t,
  (name) => {
    if (name) openDetail(String(name))
  },
  { immediate: true },
)

onMounted(() => {
  loadSetup()
  load()
  // Checks settle on the server while the page is open: follow them quietly.
  timer = setInterval(() => {
    if (!document.hidden && !loading.value) load()
  }, REFRESH_MS)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  clearTimeout(searchTimer)
})
</script>

<style scoped>
/* One list, two shapes: rows on a phone, a table where the list has room. */
.trf-list {
  container-type: inline-size;
}
.trf-head {
  display: none;
}
.trf-row {
  display: grid;
  grid-template-columns: 3rem minmax(0, 1fr) auto;
  grid-template-areas: 'hora quien monto';
  align-items: start;
  column-gap: 0.75rem;
}
.trf-hora {
  grid-area: hora;
  padding-top: 0.15rem;
}
.trf-quien {
  grid-area: quien;
}
.trf-monto {
  grid-area: monto;
  max-width: 9rem;
}
.trf-estado,
.trf-col-ruta,
.trf-col-venta,
.trf-col-quien {
  display: none;
}
@container (min-width: 720px) {
  .trf-head,
  .trf-row {
    display: grid;
    grid-template-columns:
      3.5rem minmax(10rem, 1.4fr) minmax(9rem, 1fr) 7.5rem 7.5rem minmax(
        7rem,
        0.8fr
      )
      minmax(6rem, 0.7fr);
    grid-template-areas: none;
    column-gap: 1rem;
    align-items: center;
  }
  .trf-hora,
  .trf-quien,
  .trf-monto {
    grid-area: auto;
    padding-top: 0;
    max-width: none;
  }
  .trf-sub {
    display: none;
  }
  .trf-estado,
  .trf-col-ruta,
  .trf-col-venta,
  .trf-col-quien {
    display: block;
  }
}
@container (min-width: 720px) and (max-width: 959px) {
  .trf-head,
  .trf-row {
    grid-template-columns: 3.5rem minmax(10rem, 1.4fr) minmax(8rem, 1fr) 7rem 7rem;
  }
  .trf-col-venta,
  .trf-col-quien {
    display: none;
  }
}
</style>
