<template>
  <div class="flex h-full flex-col overflow-hidden">
    <header
      class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3"
    >
      <div>
        <h1 class="text-lg font-semibold text-ink-gray-9">Prospectos</h1>
        <p class="text-sm text-ink-gray-6">
          Leads y consultas que esperan respuesta, del más reciente al más
          antiguo.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Button
          label="Registrar consulta"
          icon-left="message-square"
          @click="router.push({ path: '/inquiries', query: { capture: '1' } })"
        />
        <Button
          variant="solid"
          label="Nuevo lead"
          icon-left="plus"
          @click="showLeadModal = true"
        />
      </div>
    </header>

    <div class="flex flex-wrap items-center gap-2 border-b px-5 py-2">
      <TextInput
        v-model="q"
        class="w-full sm:w-64"
        type="search"
        placeholder="Nombre, teléfono o correo"
        aria-label="Buscar prospectos"
        data-list-search
        @update:model-value="searchSoon"
      />
      <div class="flex gap-1" role="group" aria-label="Tipo">
        <Button
          v-for="chip in KIND_CHIPS"
          :key="chip.value || 'all'"
          size="sm"
          :variant="kind === chip.value ? 'solid' : 'subtle'"
          :label="chipLabel(chip)"
          :aria-pressed="kind === chip.value"
          @click="setKind(chip.value)"
        />
      </div>
      <div
        v-if="sources.length > 1 || source"
        class="flex flex-wrap gap-1"
        role="group"
        aria-label="Origen"
      >
        <button
          v-for="chip in sources"
          :key="chip.key"
          type="button"
          class="rounded-full"
          :aria-pressed="source === chip.key"
          @click="setSource(source === chip.key ? '' : chip.key)"
        >
          <Badge
            :label="`${chip.label} · ${chip.count}`"
            :theme="sourceTheme(chip.key)"
            :variant="source === chip.key ? 'solid' : 'subtle'"
          />
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-auto px-5 py-3" data-testid="prospects-list">
      <div v-if="error" class="rounded border p-3 text-sm" role="alert">
        <strong>No se pudo cargar la lista.</strong>
        <p class="text-ink-gray-6">{{ errorText }}</p>
        <Button class="mt-2" label="Reintentar" @click="load(start)" />
      </div>
      <div
        v-else-if="loading && !rows.length"
        class="text-sm text-ink-gray-6"
        role="status"
      >
        Cargando prospectos…
      </div>
      <div
        v-else-if="!rows.length"
        class="py-10 text-center text-sm text-ink-gray-6"
      >
        <p class="font-medium text-ink-gray-8">
          {{
            q || kind || source
              ? 'Ningún prospecto coincide con estos filtros.'
              : 'No hay prospectos esperando.'
          }}
        </p>
        <Button
          v-if="q || kind || source"
          class="mt-2"
          label="Quitar filtros"
          @click="clearFilters"
        />
      </div>
      <ul v-else class="divide-y">
        <li v-for="row in rows" :key="`${row.kind}:${row.name}`">
          <RouterLink
            :to="prospectRoute(row)"
            class="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 hover:bg-surface-gray-1"
            data-testid="prospect-row"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium text-ink-gray-9">{{
                row.title
              }}</span>
              <span class="block truncate text-sm text-ink-gray-6">{{
                [KIND_LABELS[row.kind], row.detail, row.phone || row.email]
                  .filter(Boolean)
                  .join(' · ')
              }}</span>
            </span>
            <Badge
              :label="row.source_label"
              :theme="sourceTheme(row.source)"
              variant="subtle"
            />
            <span class="w-28 text-sm text-ink-gray-7">{{
              row.status_label || row.status
            }}</span>
            <span
              class="w-40 text-sm"
              :class="isOverdue(row) ? 'text-ink-red-4' : 'text-ink-gray-6'"
            >
              {{
                row.next_action_at
                  ? (isOverdue(row) ? 'Vencido: ' : 'Próximo: ') +
                    row.next_action_at.slice(0, 16)
                  : 'Sin seguimiento'
              }}
            </span>
            <span class="w-24 text-right text-sm text-ink-gray-5">{{
              waitingLabel(row.modified)
            }}</span>
          </RouterLink>
        </li>
      </ul>
      <div v-if="start > 0 || hasMore" class="mt-3 flex gap-2">
        <Button
          v-if="start > 0"
          label="Anteriores"
          @click="load(Math.max(start - PAGE, 0))"
        />
        <Button v-if="hasMore" label="Siguientes" @click="load(start + PAGE)" />
      </div>
    </div>
    <LeadModal v-if="showLeadModal" v-model="showLeadModal" />
  </div>
</template>
<script setup>
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Badge, Button, TextInput, call } from 'frappe-ui'
import LeadModal from '@/components/Modals/LeadModal.vue'
import {
  KIND_CHIPS,
  KIND_LABELS,
  isOverdue,
  prospectArgs,
  prospectRoute,
  sourceTheme,
  waitingLabel,
} from '@/utils/prospects'

const PAGE = 30
const route = useRoute()
const router = useRouter()
const q = ref(typeof route.query.q === 'string' ? route.query.q : '')
const kind = ref(
  ['lead', 'inquiry'].includes(route.query.tipo) ? route.query.tipo : '',
)
const source = ref(
  typeof route.query.origen === 'string' ? route.query.origen : '',
)
const rows = ref([])
const sources = ref([])
const counts = ref({ lead: 0, inquiry: 0 })
const start = ref(0)
const hasMore = ref(false)
const loading = ref(false)
const error = ref(null)
const showLeadModal = ref(false)

const errorText = computed(
  () =>
    error.value?.messages?.[0] ||
    error.value?.message ||
    'Revisa tu conexión e inténtalo de nuevo.',
)

function chipLabel(chip) {
  if (!chip.value)
    return `${chip.label} · ${counts.value.lead + counts.value.inquiry}`
  return `${chip.label} · ${counts.value[chip.value] || 0}`
}

let seq = 0
async function load(at = 0) {
  const mine = ++seq
  loading.value = true
  error.value = null
  try {
    const page = await call(
      'crm.api.prospects.list_prospects',
      prospectArgs({
        kind: kind.value,
        source: source.value,
        q: q.value,
        start: at,
        pageLength: PAGE,
      }),
    )
    if (mine !== seq) return
    rows.value = page.rows || []
    sources.value = page.sources || []
    counts.value = page.counts || { lead: 0, inquiry: 0 }
    hasMore.value = !!page.has_more
    start.value = at
  } catch (e) {
    if (mine === seq) error.value = e
  } finally {
    if (mine === seq) loading.value = false
  }
}

// Filters live in the URL, so the way back from a lead keeps them.
function syncQuery() {
  const query = {}
  if (q.value.trim()) query.q = q.value.trim()
  if (kind.value) query.tipo = kind.value
  if (source.value) query.origen = source.value
  router.replace({ query })
}
let timer = null
function searchSoon() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    syncQuery()
    load(0)
  }, 250)
}
function setKind(value) {
  kind.value = value
  syncQuery()
  load(0)
}
function setSource(value) {
  source.value = value
  syncQuery()
  load(0)
}
function clearFilters() {
  q.value = ''
  kind.value = ''
  source.value = ''
  syncQuery()
  load(0)
}

load(0)
</script>
