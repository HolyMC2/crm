<template>
  <!-- Documentos (and Inventario) hub, Shell SPEC §6 DD2: the lists this worker
       reads, grouped (Ventas, Compras, Pagos, Inventario), each with what asks
       for action; «Todos los tipos» opens any other readable doctype. -->
  <div class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
    <AppBar :title="moduleLabel" :bell="phone" />
    <div class="min-h-0 flex-1 overflow-y-auto pb-10">
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 pt-2">
        <EmptyState
          v-if="!groups.length"
          state="denied"
          :title="`No hay listas de ${moduleLabel.toLowerCase()} para tu usuario`"
          message="Pide al dueño o al encargado que revise tu usuario."
        />
        <section
          v-for="group in groups"
          :key="group.key"
          :aria-labelledby="`hub-${group.key}`"
        >
          <h2
            :id="`hub-${group.key}`"
            class="px-4 pb-1 pt-2 text-sm font-medium text-ink-gray-6"
          >
            {{ group.label }}
          </h2>
          <ListRow
            v-for="item in group.items"
            :key="item.key"
            :icon="item.icon"
            :title="item.label"
            :subtitle="item.subtitle"
            :subtitle-tone="item.tone"
            :meta="item.meta"
            :to="item.to"
            data-testid="documentos-hub-row"
          />
        </section>
        <section
          v-if="isDocumentos && enabled"
          aria-labelledby="hub-todos"
          class="pt-2"
        >
          <h2
            id="hub-todos"
            class="px-4 pb-2 text-sm font-medium text-ink-gray-6"
          >
            Todos los tipos
          </h2>
          <div class="px-4 pb-1">
            <TextInput
              v-model="typeSearch"
              type="search"
              placeholder="Buscar un tipo de documento"
              aria-label="Buscar un tipo de documento"
              data-testid="documentos-types-search"
            />
          </div>
          <p
            v-if="
              typeSearch.trim().length >= 2 && !types.length && !typesLoading
            "
            class="px-4 py-3 text-sm text-ink-gray-6"
          >
            Ningún tipo de documento que puedas abrir se llama así.
          </p>
          <ListRow
            v-for="type in types"
            :key="type.doctype"
            icon="lucide-file"
            :title="type.label"
            :subtitle="type.module"
            :to="floorRoute(type.doctype)"
            data-testid="documentos-type"
          />
        </section>
      </div>
    </div>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { TextInput } from 'frappe-ui'
import { AppBar, EmptyState, ListRow } from '@/components/ui'
import { isMobile } from '@/composables/breakpoint'
import { shellBoot } from '@/composables/muelleShell'
import { docApi } from '@/documentos/api'
import {
  GROUPS,
  PROFILES,
  floorRoute,
  listRoute,
  readableDoctypes,
} from '@/documentos/registry'
import { moduleEnabled } from '@/vendor/muelle-shell/contracts'

const route = useRoute()
const phone = isMobile
const isDocumentos = computed(() => !route.path.startsWith('/inventario'))
const moduleKey = computed(() =>
  isDocumentos.value ? 'documentos' : 'inventario',
)
const moduleLabel = computed(() =>
  isDocumentos.value ? 'Documentos' : 'Inventario',
)
const enabled = computed(() => moduleEnabled(shellBoot.value, moduleKey.value))

const stats = ref({})
const typeSearch = ref('')
const types = ref([])
const typesLoading = ref(false)

// The Documentos hub lists every module's documents (Inventario's too); the
// Inventario hub only its own, plus its stores.
const groups = computed(() => {
  const readable = readableDoctypes(shellBoot.value) || new Set()
  return GROUPS.filter((g) => isDocumentos.value || g.key === 'inventario')
    .map((group) => {
      const items = PROFILES.filter(
        (p) => p.group === group.key && readable.has(p.doctype),
      ).map((p) => {
        const s = stats.value[p.doctype] || {}
        const attention =
          p.attention && s.attention ? `${s.attention} ${p.attention}` : ''
        return {
          key: p.slug,
          icon: p.icon,
          label: p.label,
          subtitle: attention || p.hint,
          tone: attention && /vencid/.test(p.attention) ? 'danger' : '',
          meta: s.drafts
            ? `${s.drafts} ${s.drafts === 1 ? 'borrador' : 'borradores'}`
            : '',
          to: listRoute(p),
        }
      })
      if (group.key === 'inventario' && readable.has('Warehouse'))
        items.push({
          key: 'almacenes',
          icon: 'lucide-warehouse',
          label: 'Almacenes',
          subtitle: 'Tiendas y bodegas',
          to: floorRoute('Warehouse'),
        })
      return { ...group, items }
    })
    .filter((group) => group.items.length)
})

async function loadStats() {
  const out = {}
  const modules = isDocumentos.value
    ? ['documentos', 'inventario']
    : ['inventario']
  for (const key of modules) {
    if (!moduleEnabled(shellBoot.value, key)) continue
    try {
      Object.assign(out, await docApi('hub', { module: key }))
    } catch {
      /* the hub still lists the documents without their counts */
    }
  }
  stats.value = out
}

let timer = null
let seq = 0
watch(typeSearch, (value) => {
  clearTimeout(timer)
  const term = value.trim()
  if (term.length < 2) {
    types.value = []
    return
  }
  timer = setTimeout(async () => {
    const mine = ++seq
    typesLoading.value = true
    try {
      const found = await docApi('doctypes', { search: term })
      if (mine === seq) types.value = found || []
    } catch {
      if (mine === seq) types.value = []
    } finally {
      if (mine === seq) typesLoading.value = false
    }
  }, 250)
})
watch(
  () => [shellBoot.value, route.path],
  () => {
    if (shellBoot.value) loadStats()
  },
  { immediate: true },
)
onBeforeUnmount(() => clearTimeout(timer))
</script>
