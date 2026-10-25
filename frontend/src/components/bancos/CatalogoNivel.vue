<template>
  <!-- One level of the chart of accounts as a list (drill-down, not an
       indented tree): roots, or a group's accounts, each with its balance in
       its natural sign and its SAT code in words. -->
  <div
    class="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-bancos-catalogo
  >
    <AppBar
      v-model:search="search"
      v-model:search-open="searchOpen"
      :title="header?.label || 'Catálogo de cuentas'"
      :context="header ? context : 'Contabilidad'"
      :back="backTo"
      :back-label="header ? 'Subir un nivel' : 'Volver a Bancos'"
      :scopes="!header && scopes.length > 1 ? scopes : []"
      :scope="level?.company || ''"
      scope-title="Empresa"
      :bell="!pane"
      :stack="!header"
      searchable
      search-label="Buscar una cuenta"
      :loading="loading"
      @update:scope="(v) => emit('company', v)"
    />

    <!-- The group's own balance (phone: then «Ver movimientos»). -->
    <section
      v-if="header && !q"
      class="px-4 pb-2 pt-3"
      aria-label="Saldo del grupo"
      data-bancos-grupo
    >
      <p class="text-sm text-ink-gray-6">{{ header.root_word }} · saldo hoy</p>
      <p
        class="break-words text-3xl font-semibold tabular-nums"
        :class="
          Number(header.balance) < 0 ? 'text-ink-red-7' : 'text-ink-gray-9'
        "
      >
        {{ money(header.balance, level?.currency) }}
      </p>
      <p v-if="header.agrupador" class="mt-1 text-sm text-ink-gray-6">
        {{ accountLine({ agrupador: header.agrupador }) }}
      </p>
      <div class="mt-3 flex flex-wrap gap-2">
        <RouterLink
          v-if="!pane"
          :to="{
            name: 'CatalogoCuenta',
            params: { cuenta: header.name },
            query: { mayor: '1' },
          }"
          class="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-outline-gray-2 px-4 text-sm text-ink-gray-8 hover:bg-surface-gray-1"
          data-bancos-ver-mayor
        >
          <span class="lucide-list size-4" aria-hidden="true" />
          Ver movimientos
        </RouterLink>
        <button
          v-if="level?.can?.crear_cuenta"
          type="button"
          class="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface-gray-2 px-4 text-sm font-medium text-ink-gray-9 hover:bg-surface-gray-3"
          data-bancos-nueva-cuenta
          @click="creating = true"
        >
          <span class="lucide-plus size-4" aria-hidden="true" />
          Nueva cuenta
        </button>
      </div>
    </section>

    <p
      v-if="error"
      role="alert"
      class="mx-4 my-3 rounded-6 bg-surface-red-1 p-4 text-sm text-ink-red-7"
    >
      {{ error }}
    </p>
    <div
      v-else-if="!level"
      role="status"
      aria-label="Cargando cuentas…"
      class="space-y-3 px-4 py-4"
    >
      <div
        v-for="n in 6"
        :key="n"
        class="h-14 animate-pulse rounded-6 bg-surface-gray-2"
      />
    </div>
    <EmptyState
      v-else-if="!level.rows.length"
      class="py-10"
      state="empty"
      :title="q ? 'Ninguna cuenta coincide' : 'Este grupo no tiene cuentas'"
      :message="
        q
          ? 'Busca por nombre o por número de cuenta.'
          : 'Agrega una cuenta con «Nueva cuenta».'
      "
    />
    <ul v-else class="divide-y divide-outline-gray-1" data-bancos-cuentas>
      <li v-for="node in level.rows" :key="node.name">
        <ListRow
          :title="accountTitle(node)"
          :subtitle="accountLine(node)"
          :icon="node.group ? 'lucide-folder' : ''"
          :to="{
            name: 'CatalogoCuenta',
            params: { cuenta: node.name },
            query: keep,
          }"
          :selected="node.name === selected"
          :data-cuenta="node.name"
        >
          <template v-if="!node.group" #leading>
            <span class="size-10 flex-none" aria-hidden="true" />
          </template>
          <template #trailing>
            <span class="flex items-center gap-1">
              <span
                class="whitespace-nowrap text-sm tabular-nums"
                :class="
                  Number(node.balance) < 0
                    ? 'text-ink-red-7'
                    : 'text-ink-gray-8'
                "
                >{{
                  money(node.balance, node.currency || level.currency)
                }}</span
              >
              <span
                v-if="node.group"
                class="lucide-chevron-right size-5 text-ink-gray-5"
                aria-hidden="true"
              />
            </span>
          </template>
        </ListRow>
      </li>
    </ul>

    <ul
      v-if="level && !header && !q && level.can?.saldos"
      class="mt-4 divide-y divide-outline-gray-1 border-t border-outline-gray-1"
    >
      <li>
        <ListRow
          title="Balanza de comprobación"
          subtitle="Saldos, cargos y abonos del mes"
          icon="lucide-chart-column"
          :to="{ name: 'Balanza', query: keep }"
        />
      </li>
    </ul>
    <div class="h-24 flex-none lg:h-10" aria-hidden="true" />

    <NuevaCuentaSheet
      v-if="header"
      v-model:open="creating"
      :parent="header"
      @created="(name) => emit('created', name)"
    />
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useDebounceFn } from '@vueuse/core'
import { AppBar, EmptyState, ListRow } from '@/components/ui'
import { accountLine, accountTitle, money } from './bancos'

const NuevaCuentaSheet = defineAsyncComponent(
  () => import('./NuevaCuentaSheet.vue'),
)

const props = defineProps({
  /** The `catalogo` answer for this level (rows, header, company, can). */
  level: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  selected: { type: String, default: '' },
  pane: { type: Boolean, default: false },
})
const emit = defineEmits(['search', 'company', 'created'])
const route = useRoute()

const q = computed(() => String(route.query.q || ''))
const search = ref(q.value)
const searchOpen = ref(!!q.value)
const creating = ref(false)
const header = computed(() => (q.value ? null : props.level?.header || null))
const keep = computed(() =>
  route.query.empresa ? { empresa: route.query.empresa } : {},
)
const scopes = computed(() =>
  (props.level?.empresas || []).map((name) => ({ value: name, label: name })),
)
const context = computed(() => {
  const path = header.value?.path || []
  return path.length ? path[path.length - 1].label : 'Catálogo de cuentas'
})
const backTo = computed(() => {
  if (!header.value) return { name: 'Bancos', query: keep.value }
  const path = header.value.path || []
  return path.length
    ? {
        name: 'CatalogoCuenta',
        params: { cuenta: path[path.length - 1].name },
        query: keep.value,
      }
    : { name: 'CatalogoCuentas', query: keep.value }
})

const pushSearch = useDebounceFn((value) => emit('search', value), 300)
watch(search, (value) => pushSearch((value || '').trim()))
</script>
