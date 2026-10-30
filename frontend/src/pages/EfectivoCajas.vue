<template>
  <!-- Cajas: a store's registers, who has each open and what each needs
       (POS Awesome's register foundation). The title chooses the store; its
       island edits it; the docked action adds a caja. Every change is the
       foundation's own command; this page only reads and asks. -->
  <div
    class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-efectivo-cajas-page
  >
    <AppBar
      title="Cajas"
      context="Efectivo"
      :back="{ name: 'Efectivo' }"
      back-label="Efectivo"
      :stack="false"
      :scopes="storeScopes"
      :scope="scope"
      scope-title="Tienda"
      searchable
      :search="search"
      :search-open="searchOpen"
      search-label="Buscar caja"
      @update:scope="pickScope"
      @update:search="(v) => (search = v)"
      @update:search-open="(v) => (searchOpen = v)"
    >
      <template v-if="island.length" #actions>
        <div class="flex rounded-full bg-surface-gray-1 p-0.5">
          <button
            v-for="item in island"
            :key="item.label"
            type="button"
            class="press grid size-10 place-items-center rounded-full text-ink-gray-7"
            :aria-label="item.label"
            :title="item.label"
            @click="item.run()"
          >
            <span :class="[item.icon, 'size-5']" aria-hidden="true" />
          </button>
        </div>
      </template>
    </AppBar>

    <div class="mx-auto w-full max-w-3xl flex-1">
      <div
        v-if="loadError"
        role="alert"
        class="mx-4 my-3 space-y-3 rounded-6 bg-surface-red-1 p-4 text-sm text-ink-red-7"
      >
        <p>{{ loadError }}</p>
        <Button label="Reintentar" @click="load()" />
      </div>
      <div
        v-else-if="!stores"
        role="status"
        aria-label="Cargando cajas…"
        class="space-y-3 px-4 py-4"
      >
        <div
          v-for="n in 4"
          :key="n"
          class="h-16 animate-pulse rounded-7 bg-surface-gray-2"
        />
      </div>
      <template v-else>
        <EmptyState
          v-if="!stores.length"
          class="py-10"
          state="empty"
          title="Sin tiendas a tu cargo"
          :message="
            canCreateStore
              ? 'Crea la tienda y después agrega sus cajas.'
              : 'Cuando el encargado te dé acceso a una tienda, aquí ves sus cajas.'
          "
        />

        <section
          v-if="store && store.status !== 'Active'"
          class="mx-4 mt-2 rounded-8 bg-surface-gray-1 p-4"
          data-efectivo-store-suspended
        >
          <p class="text-base font-medium text-ink-gray-9">
            {{ store.store_name }} está suspendida
          </p>
          <p class="mt-1 text-sm text-ink-gray-7">
            Ninguna de sus cajas puede abrir turno.
            {{
              store.can_configure
                ? ''
                : 'La reactiva quien configura la tienda.'
            }}
          </p>
          <Button
            v-if="store.can_configure"
            class="mt-3"
            label="Reactivar tienda"
            @click="open(storeStatus(store, 'Active'))"
          />
        </section>

        <div v-if="stores.length" class="px-4 pb-2 pt-2">
          <Segmented
            v-model="filter"
            label="Cajas"
            fit="content"
            :options="filterOptions"
          />
        </div>

        <ul
          v-if="cajas.length"
          class="divide-y divide-outline-gray-1"
          data-efectivo-caja-list
        >
          <li v-for="c in cajas" :key="c.name" :data-caja="c.name">
            <ListRow
              :title="scope ? c.label : `${c.label} · ${c.store_name}`"
              :subtitle="cajaLine(c, formatDateTime)"
              :subtitle-tone="c.severity === 'blocking' ? 'danger' : ''"
              icon="lucide-monitor-smartphone"
              :to="{ name: 'EfectivoCaja', params: { name: c.name } }"
            >
              <template #trailing>
                <div class="flex flex-col items-end gap-1">
                  <span
                    v-if="c.cash?.expected"
                    class="num text-base font-semibold text-ink-gray-9"
                    >{{
                      money(c.cash.expected, c.cash.currency || 'MXN')
                    }}</span
                  >
                  <StatusChip
                    v-if="c.lifecycle !== 'Ready'"
                    :label="lifecycle(c.lifecycle).label"
                    :tone="lifecycle(c.lifecycle).tone"
                  />
                </div>
              </template>
            </ListRow>
          </li>
        </ul>
        <p
          v-else-if="stores.length && listed"
          class="px-4 py-3 text-sm text-ink-gray-6"
        >
          {{ emptyLine }}
        </p>
        <button
          v-if="cursor"
          type="button"
          class="press mx-4 mt-1 inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-medium text-ink-gray-8"
          :disabled="loadingMore"
          @click="more"
        >
          {{ loadingMore ? 'Cargando…' : 'Ver más' }}
          <span class="lucide-chevron-down size-4" aria-hidden="true" />
        </button>
        <div class="h-28 flex-none lg:h-12" aria-hidden="true" />
      </template>
    </div>

    <Fab
      v-if="configurable.length"
      label="Nueva caja"
      icon="lucide-plus"
      @click="startCaja"
    />
    <BottomSheet
      v-model:open="choosing"
      title="¿En qué tienda va la caja?"
      flush
    >
      <ul class="divide-y divide-outline-gray-1">
        <li v-for="s in configurable" :key="s.name">
          <ListRow
            :title="s.store_name"
            :subtitle="s.registers === 1 ? '1 caja' : `${s.registers} cajas`"
            icon="lucide-store"
            @click="(choosing = false), (cajaStore = s), (cajaOpen = true)"
          />
        </li>
      </ul>
    </BottomSheet>
    <CajaSheet
      v-if="cajaStore"
      v-model:open="cajaOpen"
      :store="cajaStore.name"
      :store-name="cajaStore.store_name"
      @saved="created"
    />
    <TiendaSheet
      v-if="tiendaUsed"
      v-model:open="tiendaOpen"
      :store="tiendaEditing"
      :companies="canCreateIn"
      @saved="storeSaved"
    />
    <StepHost :step="step" @close="step = null" @done="load" />
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, toast } from 'frappe-ui'
import {
  AppBar,
  BottomSheet,
  EmptyState,
  Fab,
  ListRow,
  Segmented,
  StatusChip,
} from '@/components/ui'
import StepHost from '@/components/efectivo/StepHost.vue'
import {
  cajaLine,
  lifecycle,
  listCajas,
  listStores,
  storeStatus,
} from '@/components/efectivo/cajas'
import { errorText, money } from '@/components/efectivo/efectivo'
import { useLiveList } from '@/composables/liveList'
import { formatDateTime } from '@/utils/display'

const CajaSheet = defineAsyncComponent(
  () => import('@/components/efectivo/CajaSheet.vue'),
)
const TiendaSheet = defineAsyncComponent(
  () => import('@/components/efectivo/TiendaSheet.vue'),
)

const route = useRoute()
const router = useRouter()
const stores = ref(null)
const canCreateIn = ref([])
const page = ref(null)
const cajas = ref([])
const cursor = ref(null)
const listed = ref(false)
const loadError = ref('')
const loadingMore = ref(false)
const search = ref('')
const searchOpen = ref(false)
const filter = ref('all')
const step = ref(null)
const choosing = ref(false)
const cajaStore = ref(null)
const cajaOpen = ref(false)
const tiendaUsed = ref(false)
const tiendaOpen = ref(false)
const tiendaEditing = ref(null)

const scope = computed(() => String(route.query.tienda || ''))
const store = computed(
  () => (stores.value || []).find((s) => s.name === scope.value) || null,
)
const storeScopes = computed(() =>
  (stores.value || []).length > 1
    ? [
        { value: '', label: 'Todas las tiendas' },
        ...stores.value.map((s) => ({ value: s.name, label: s.store_name })),
      ]
    : [],
)
function pickScope(value) {
  router.replace({ query: { ...route.query, tienda: value || undefined } })
}

const canCreateStore = computed(() => canCreateIn.value.length > 0)
const configurable = computed(() =>
  (store.value ? [store.value] : stores.value || []).filter(
    (s) => s.can_configure && s.status === 'Active',
  ),
)

/** The island beside the title: the chosen store's setup, and a new store. */
const island = computed(() => {
  const out = []
  const s = store.value || (stores.value?.length === 1 ? stores.value[0] : null)
  if (s?.can_configure) {
    out.push({
      label: `Configurar ${s.store_name}`,
      icon: 'lucide-pencil',
      run: () => editStore(s),
    })
    if (s.status === 'Active')
      out.push({
        label: `Suspender ${s.store_name}`,
        icon: 'lucide-pause',
        run: () => open(storeStatus(s, 'Suspended')),
      })
  }
  if (canCreateStore.value)
    out.push({
      label: 'Nueva tienda',
      icon: 'lucide-store',
      run: () => editStore(null),
    })
  return out
})

const filterOptions = computed(() => {
  const sum = page.value?.summary || {}
  return [
    { value: 'all', label: 'Todas', count: sum.total },
    { value: 'attention', label: 'Por atender', count: sum.attention },
    { value: 'open', label: 'Abiertas', count: sum.open },
    { value: 'setup', label: 'Por configurar', count: sum.setup },
  ]
})
const emptyLine = computed(() =>
  search.value.trim()
    ? 'Ninguna caja con ese nombre o código.'
    : {
        all: 'Esta tienda aún no tiene cajas.',
        attention: 'Ninguna caja necesita atención.',
        open: 'Ninguna caja tiene turno abierto.',
        setup: 'Todas las cajas están listas.',
      }[filter.value],
)

function open(next) {
  step.value = next
}
function editStore(s) {
  tiendaEditing.value = s
  tiendaUsed.value = true
  tiendaOpen.value = true
}
function startCaja() {
  if (configurable.value.length === 1) {
    cajaStore.value = configurable.value[0]
    cajaOpen.value = true
  } else choosing.value = true
}
function created(caja) {
  toast.success('Caja creada: falta conectarla y activarla')
  if (caja?.name)
    router.push({ name: 'EfectivoCaja', params: { name: caja.name } })
  else load()
}
function storeSaved(row) {
  toast.success(tiendaEditing.value ? 'Tienda guardada' : 'Tienda creada')
  load().then(() => row?.name && pickScope(row.name))
}

let sequence = 0
async function loadCajas(after = null) {
  const mine = ++sequence
  const answer = await listCajas(
    scope.value,
    filter.value,
    search.value.trim(),
    after,
  )
  if (mine !== sequence) return
  page.value = answer
  cajas.value = after
    ? [...cajas.value, ...(answer.registers || [])]
    : answer.registers || []
  cursor.value = answer.next_cursor || null
  listed.value = true
}
async function load() {
  loadError.value = ''
  try {
    const answer = await listStores()
    stores.value = answer.stores || []
    canCreateIn.value = answer.can_create_in || []
    if (stores.value.length) await loadCajas()
  } catch (error) {
    loadError.value = errorText(error)
    if (!stores.value) stores.value = null
  }
}
async function more() {
  loadingMore.value = true
  try {
    await loadCajas(cursor.value)
  } catch (error) {
    toast.error(errorText(error))
  } finally {
    loadingMore.value = false
  }
}

let typing = 0
watch(search, () => {
  clearTimeout(typing)
  typing = setTimeout(
    () => stores.value?.length && loadCajas().catch(() => {}),
    250,
  )
})
watch([scope, filter], () => {
  if (stores.value?.length)
    loadCajas().catch((error) => (loadError.value = errorText(error)))
})
load()
// Another supervisor's change, a caja opening or closing, land without a reload.
useLiveList(['POS Register', 'POS Store'], load)
defineExpose({ reload: load })
</script>
