<template>
  <!-- Catálogo de cuentas (Shell SPEC §6 DD19) as drill-down lists. Phone: a
       group opens its accounts, an account opens its Mayor. ≥1024: the level
       on the left, the chosen account's (or group's) Mayor on the right. -->
  <div
    v-if="wide"
    class="flex h-full min-w-0 flex-1 overflow-hidden"
    data-testid="catalogo-split"
  >
    <div
      class="bancos-master flex flex-none flex-col overflow-hidden border-r border-outline-gray-1"
    >
      <CatalogoNivel
        :level="level"
        :loading="loading"
        :error="error"
        :selected="cuenta"
        pane
        @search="setSearch"
        @company="setCompany"
        @created="onCreated"
      />
    </div>
    <div class="relative flex min-w-0 flex-1 flex-col overflow-hidden">
      <MayorCuenta v-if="cuenta" :key="cuenta" :cuenta="cuenta" pane />
      <EmptyState
        v-else
        state="empty"
        title="Elige una cuenta"
        message="Ábrela de la lista para ver su saldo y sus movimientos."
      />
    </div>
  </div>
  <MayorCuenta
    v-else-if="cuenta && showMayor"
    :key="cuenta + ':mayor'"
    :cuenta="cuenta"
  />
  <CatalogoNivel
    v-else
    :level="level"
    :loading="loading"
    :error="error"
    @search="setSearch"
    @company="setCompany"
    @created="onCreated"
  />
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EmptyState } from '@/components/ui'
import { isWide } from '@/composables/breakpoint'
import CatalogoNivel from '@/components/bancos/CatalogoNivel.vue'
import MayorCuenta from '@/components/bancos/MayorCuenta.vue'
import { bancosApi, errorText } from '@/components/bancos/bancos'

const route = useRoute()
const router = useRouter()
const wide = isWide
const cuenta = computed(() => String(route.params.cuenta || ''))
const level = ref(null)
const leaf = ref(false)
const loading = ref(false)
const error = ref('')

// A leaf account (or a group asked for with ?mayor=1) shows its Mayor on a phone.
const showMayor = computed(() => leaf.value || !!route.query.mayor)

function setSearch(q) {
  const query = { ...route.query, q }
  if (!q) delete query.q
  router.replace({ name: 'CatalogoCuentas', query })
}
function setCompany(empresa) {
  router.replace({ name: 'CatalogoCuentas', query: { empresa } })
}
function onCreated(name) {
  load()
  if (wide.value)
    router.push({ name: 'CatalogoCuenta', params: { cuenta: name } })
}

let sequence = 0
async function load() {
  const mine = ++sequence
  loading.value = true
  error.value = ''
  try {
    const q = String(route.query.q || '')
    let result
    if (cuenta.value && !q) {
      result = await bancosApi('catalogo', { parent: cuenta.value })
      leaf.value = !result.header?.group
      if (leaf.value && wide.value) {
        // An account: the list beside it is its own group's level.
        const path = result.header?.path || []
        const parent = path[path.length - 1]?.name
        result = parent
          ? await bancosApi('catalogo', { parent })
          : await bancosApi('catalogo', { company: result.company })
      }
    } else {
      leaf.value = false
      result = await bancosApi('catalogo', {
        company: route.query.empresa || '',
        q,
      })
    }
    if (mine === sequence) level.value = result
  } catch (err) {
    if (mine === sequence) error.value = errorText(err)
  } finally {
    if (mine === sequence) loading.value = false
  }
}

watch(
  () => [cuenta.value, route.query.q, route.query.empresa].join('|'),
  () => load(),
  { immediate: true },
)
</script>
<style scoped>
/* scoped, not Tailwind arbitrary values: keeps the global sheet in budget */
.bancos-master {
  width: 24rem;
}
@media (min-width: 1280px) {
  .bancos-master {
    width: 28rem;
  }
}
</style>
