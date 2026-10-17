<template>
  <!-- /crm/_ui (dev and lab only): every shared phone primitive with
       realistic es-MX data, for screenshots at 412/305 px and as a live
       reference. `?sheet=1` opens the bottom sheet, `?filtros=1` the filters
       sheet, `?buscar=1` the bar's search. Not linked from anywhere. -->
  <div class="relative flex min-h-0 flex-1 flex-col">
    <AppBar
      v-model:scope="scope"
      v-model:search="search"
      v-model:search-open="searchOpen"
      context="Componentes"
      :title="scopeLabel"
      :count="rows.length"
      :scopes="scopes"
      scope-title="Elegir lista"
      searchable
      search-label="Buscar en la demo"
    >
      <template #actions>
        <button
          type="button"
          class="flex size-12 items-center justify-center rounded-full text-ink-gray-7"
          aria-label="Escanear"
        >
          <span class="lucide-scan-barcode size-6" aria-hidden="true" />
        </button>
      </template>
      <template #summary>
        <span
          >Por cobrar <b>{{ formatMoney(18067) }}</b></span
        >
        <span class="text-ink-red-7">Vencidas <b>3</b></span>
      </template>
    </AppBar>

    <div class="min-h-0 flex-1 overflow-y-auto pb-24" data-ui-lab>
      <section id="appbar-record" class="border-b border-outline-gray-1">
        <h2 :class="LABEL">AppBar de registro (atrás, título largo)</h2>
        <AppBar
          back="/_ui"
          context="Compras"
          title="Refacciones y pantallas CellCity del Pacífico, S.A. de C.V."
          class="!static"
        >
          <template #actions>
            <button
              type="button"
              class="flex size-12 items-center justify-center rounded-full text-ink-gray-7"
              aria-label="Editar"
            >
              <span class="lucide-pencil size-6" aria-hidden="true" />
            </button>
          </template>
        </AppBar>
      </section>

      <section id="page-header">
        <h2 :class="LABEL">PageHeader</h2>
        <PageHeader
          title="Productos por surtir en la sucursal Mazatlán Centro"
          subtitle="Lo que se vende y no tiene existencia, ordenado por lo que más falta."
          :count="24"
        >
          <template #actions>
            <Button variant="subtle" label="Ver variantes" />
            <Button variant="solid" label="Dar de alta" />
          </template>
        </PageHeader>
      </section>

      <section id="segmented" class="px-4 pb-4">
        <h2 :class="LABEL" class="!px-0">Segmented (2–4 vistas)</h2>
        <Segmented v-model="view" :options="views" label="Vista" />
        <div class="h-3" />
        <Segmented v-model="period" :options="periods" label="Periodo" />
      </section>

      <section id="filter-chips" class="pb-2">
        <h2 :class="LABEL">FilterChips + «Filtros»</h2>
        <FilterChips
          v-model="chip"
          :chips="chips"
          :filters-count="filterCount"
          label="Antigüedad"
          @clear-filters="clearFilters"
        >
          <template #filters>
            <div class="space-y-1">
              <p class="pb-1 text-sm text-ink-gray-6">Responsable</p>
              <label
                v-for="person in people"
                :key="person"
                class="flex min-h-11 items-center gap-3 text-base"
              >
                <input
                  v-model="owners"
                  type="checkbox"
                  :value="person"
                  class="size-5 rounded"
                />
                {{ person }}
              </label>
              <p class="pb-1 pt-3 text-sm text-ink-gray-6">Sucursal</p>
              <label
                v-for="branch in branches"
                :key="branch"
                class="flex min-h-11 items-center gap-3 text-base"
              >
                <input
                  v-model="branchesOn"
                  type="checkbox"
                  :value="branch"
                  class="size-5 rounded"
                />
                {{ branch }}
              </label>
            </div>
          </template>
        </FilterChips>
      </section>

      <section id="list-rows">
        <h2 :class="LABEL">ListRow</h2>
        <div class="divide-y divide-outline-gray-1">
          <ListRow
            v-for="row in visibleRows"
            :key="row.key"
            :title="row.title"
            :subtitle="row.subtitle"
            :subtitle-tone="row.overdue ? 'danger' : ''"
            :meta="row.meta"
            :avatar="row.avatar"
            :icon="row.icon"
            @click="opened = row.title"
          >
            <template v-if="row.status" #trailing>
              <StatusChip :status="row.status" :kind="row.kind" />
            </template>
          </ListRow>
        </div>
        <p
          v-if="opened"
          class="px-4 py-2 text-sm text-ink-gray-6"
          role="status"
        >
          Abriste: {{ opened }}
        </p>
      </section>

      <section id="kpis" class="px-4 pb-4">
        <h2 :class="LABEL" class="!px-0">KpiTile en KpiGrid</h2>
        <KpiGrid>
          <KpiTile
            label="Por cobrar"
            :value="formatMoney(1406780.5)"
            hint="12 clientes"
            to="/_ui"
          />
          <KpiTile label="Vencido" :value="formatMoney(18067)" tone="danger" />
          <KpiTile
            label="Tiempo promedio para cerrar un trato"
            value="14 días"
          />
          <KpiTile label="Esperando aprobación" value="3" tone="warning" />
        </KpiGrid>
      </section>

      <section id="status-chips" class="px-4 pb-4">
        <h2 :class="LABEL" class="!px-0">StatusChip</h2>
        <div class="flex flex-wrap gap-2">
          <StatusChip
            v-for="item in statuses"
            :key="item.status + (item.kind || '')"
            :status="item.status"
            :kind="item.kind"
          />
        </div>
      </section>

      <section id="display" class="px-4 pb-4">
        <h2 :class="LABEL" class="!px-0">utils/display.js</h2>
        <dl class="divide-y divide-outline-gray-1 text-sm">
          <div
            v-for="item in displayExamples"
            :key="item.from"
            class="flex flex-wrap justify-between gap-x-4 py-2"
          >
            <dt class="break-all text-ink-gray-6">{{ item.from }}</dt>
            <dd class="font-medium">{{ item.to }}</dd>
          </div>
        </dl>
      </section>

      <section id="empty-state" class="border-t border-outline-gray-1">
        <h2 :class="LABEL">EmptyState</h2>
        <EmptyState
          title="No tienes pendientes para hoy"
          message="Lo que te asignen o agendes aparece aquí."
          action="Nuevo pendiente"
          @action="sheet = true"
        />
      </section>

      <section id="sheet" class="px-4 pb-4">
        <h2 :class="LABEL" class="!px-0">BottomSheet</h2>
        <Button
          variant="subtle"
          size="lg"
          class="w-full"
          label="Abrir hoja de ejemplo"
          @click="sheet = true"
        />
      </section>
    </div>

    <Fab label="Nuevo pendiente" @click="sheet = true" />

    <BottomSheet
      v-model:open="sheet"
      title="Registrar pago de Refacciones CellCity del Pacífico"
      subtitle="Factura de proveedor · vence hoy"
    >
      <div class="space-y-3">
        <label class="block space-y-1">
          <span class="text-sm text-ink-gray-6">Monto</span>
          <input
            class="h-11 w-full rounded-lg border-0 bg-surface-gray-2 px-3 text-base"
            inputmode="decimal"
            value="1,500.00"
          />
        </label>
        <label class="block space-y-1">
          <span class="text-sm text-ink-gray-6">Forma de pago</span>
          <select
            class="h-11 w-full rounded-lg border-0 bg-surface-gray-2 px-3 text-base"
          >
            <option>Transferencia</option>
            <option>Efectivo</option>
          </select>
        </label>
        <p v-for="n in 8" :key="n" class="text-sm text-ink-gray-6">
          Línea {{ n }} de contexto para que la hoja tenga más contenido que el
          60% de la pantalla y se pueda expandir arrastrando la manija.
        </p>
      </div>
      <template #actions>
        <Button
          variant="ghost"
          size="lg"
          class="w-full"
          label="Cancelar"
          @click="sheet = false"
        />
        <Button
          variant="solid"
          size="lg"
          class="w-full"
          label="Registrar pago"
          @click="sheet = false"
        />
      </template>
    </BottomSheet>
  </div>
</template>
<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Button } from 'frappe-ui'
import {
  AppBar,
  BottomSheet,
  EmptyState,
  Fab,
  FilterChips,
  KpiGrid,
  KpiTile,
  ListRow,
  PageHeader,
  Segmented,
  StatusChip,
} from '@/components/ui'
import {
  displayName,
  formatDate,
  formatDateTime,
  formatDue,
  formatMoney,
  formatQty,
  personName,
  relativeTime,
  statusLabel,
} from '@/utils/display'

const LABEL = 'px-4 pb-2 pt-5 text-sm font-medium text-ink-gray-6'
const route = useRoute()

const scopes = [
  { value: 'vencido', label: 'Vencido', count: 9, icon: 'lucide-circle-alert' },
  { value: 'semana', label: 'Vence esta semana', count: 4 },
  { value: 'todo', label: 'Todo lo que se debe', count: 31 },
]
const scope = ref('vencido')
const scopeLabel = computed(
  () => scopes.find((s) => s.value === scope.value)?.label || '',
)
const search = ref('')
const searchOpen = ref(route.query.buscar === '1')

const views = [
  { value: 'lista', label: 'Lista' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
]
const view = ref('lista')
const periods = [
  { value: 'hoy', label: 'Hoy' },
  { value: '7', label: '7 días' },
  { value: '30', label: '30 días' },
  { value: 'otro', label: 'Personalizado' },
]
const period = ref('7')

const chips = [
  { value: 'todas', label: 'Todas', count: 31 },
  { value: '0-30', label: '1–30 días', count: 12 },
  { value: '31-60', label: '31–60 días', count: 2 },
  { value: '61-90', label: '61–90 días', count: 5 },
  { value: '90', label: 'Más de 90', count: 12 },
]
const chip = ref('todas')
const people = ['Karla Martínez', 'Jeydi Cruz', 'Luis Ángel Tirado']
const branches = ['Mazatlán Centro', 'Culiacán']
const owners = ref(['Karla Martínez'])
const branchesOn = ref([])
const filterCount = computed(
  () => owners.value.length + branchesOn.value.length,
)
function clearFilters() {
  owners.value = []
  branchesOn.value = []
}

const now = new Date()
const iso = (offset) => {
  const d = new Date(now)
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const rows = [
  {
    key: 1,
    title: 'AARON ENRIQUE TELEZ CHAVEZ',
    subtitle: '+52 667 323 8069',
    meta: relativeTime(new Date(now - 17 * 60000)),
    avatar: 'AARON ENRIQUE TELEZ CHAVEZ',
  },
  {
    key: 2,
    title: displayName(
      { name: 'PUR-ORD-2026-00025', supplier_name: 'CellCity del Pacífico' },
      'Purchase Order',
    ),
    subtitle: `Orden de compra · ${formatQty(3, 'Nos')} · ${formatMoney(4250)}`,
    meta: formatDate(iso(-1)),
    icon: 'lucide-shopping-cart',
    status: 'To Receive and Bill',
  },
  {
    key: 3,
    title: 'XMovil',
    subtitle: formatDue(iso(-3)).label,
    overdue: true,
    meta: formatMoney(9969),
    icon: 'lucide-receipt',
  },
  {
    key: 4,
    title: '+52 695 138 2090',
    subtitle: 'Llamada saliente · 1:09',
    meta: formatDate(iso(-50)),
    icon: 'lucide-phone-outgoing',
    status: 'No Answer',
    kind: 'call',
  },
  {
    key: 5,
    title:
      'Honor X6 — José Aarón Fausto Espinoza, cambio de pantalla y batería',
    subtitle: 'Trato · Negociación',
    meta: '2 d',
    avatar: 'José Aarón Fausto',
    status: 'Won',
  },
]
const visibleRows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return q ? rows.filter((r) => r.title.toLowerCase().includes(q)) : rows
})
const opened = ref('')

const statuses = [
  { status: 'Completed' },
  { status: 'Overdue' },
  { status: 'Draft' },
  { status: 'Paid' },
  { status: 'Partly Paid' },
  { status: 'No Answer', kind: 'call' },
  { status: 'Completed', kind: 'call' },
  { status: 'Pending' },
]

const displayExamples = [
  {
    from: 'Purchase Order «PUR-ORD-2026-00025»',
    to: displayName(
      { name: 'PUR-ORD-2026-00025', supplier_name: 'CellCity del Pacífico' },
      'Purchase Order',
    ),
  },
  {
    from: 'CRM Deal sin nombre «CRM-DEAL-2025-00086»',
    to: displayName({ name: 'CRM-DEAL-2025-00086' }, 'CRM Deal'),
  },
  { from: 'jeydici01@gmail.com', to: personName('jeydici01@gmail.com') },
  {
    from: '2026-10-17 12:11:24.941958',
    to: formatDateTime('2026-10-17 12:11:24.941958', { now }),
  },
  { from: iso(-1), to: formatDate(iso(-1), { now }) },
  { from: '2025-10-17', to: formatDate('2025-10-17', { now }) },
  { from: '3 Nos', to: formatQty(3, 'Nos') },
  { from: '1400 MXN', to: formatMoney(1400) },
  { from: '12 USD', to: formatMoney(12, 'USD') },
  { from: 'Completed', to: statusLabel('Completed') },
  { from: 'Busy (llamada)', to: statusLabel('Busy', 'call') },
]

const sheet = ref(route.query.sheet === '1')
if (route.query.filtros === '1') {
  // The filters sheet opens from its chip; the demo clicks it once mounted.
  setTimeout(
    () => document.querySelector('[data-ui-filters-chip]')?.click(),
    300,
  )
}
</script>
