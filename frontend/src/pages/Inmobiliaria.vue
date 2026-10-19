<template>
  <!-- Inmobiliaria's homes in the shell (INMO-SH): each role's queues with the
       same counts as the Desk homes and Hoy (inmobiliaria.api.shell.inicio).
       Phone: one chip per home, its queues as rows. Desktop: every home as a
       card. Every row opens the queue in the shell. -->
  <div
    class="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-base"
  >
    <AppBar title="Inmobiliaria" :loading="loading" data-testid="inmo-appbar" />
    <div class="flex-1 overflow-y-auto pb-24">
      <EmptyState
        v-if="problem && !data"
        state="error"
        title="No se pudo abrir Inmobiliaria"
        :message="problem"
        action="Reintentar"
        @action="load"
      />
      <EmptyState v-else-if="!data" state="loading" title="Abriendo…" />
      <template v-else>
        <div class="flex flex-col gap-2 px-4 pt-2">
          <RouterLink
            v-for="a in data.accesos"
            :key="a.key"
            :to="linkOf(a.url).to || '/inmobiliaria'"
            class="flex min-h-14 items-center gap-3 rounded-2xl bg-surface-gray-2 px-4 text-base font-medium text-ink-gray-9"
            :data-acceso="a.key"
          >
            <span :class="[a.icono, 'size-5']" aria-hidden="true" />
            <span class="flex-1">{{ a.etiqueta }}</span>
            <span class="lucide-chevron-right size-5" aria-hidden="true" />
          </RouterLink>
        </div>

        <EmptyState
          v-if="!data.inicios.length"
          state="empty"
          title="Sin listas de trabajo"
          message="Tu negocio todavía no usa estas listas. Pide a un administrador que revise tu perfil."
        />
        <template v-else-if="!desktop">
          <div class="px-4 pt-4">
            <FilterChips
              v-model="current"
              :chips="chips"
              :deselectable="false"
              label="Inicios"
            />
          </div>
          <section v-if="home" class="pt-2">
            <h2 class="px-4 pb-1 text-lg font-semibold text-ink-gray-9">
              {{ home.titulo }}
            </h2>
            <ListRow
              v-for="c in home.colas"
              :key="c.key"
              :title="c.etiqueta"
              :to="queueTo(c)"
              icon="lucide-list-checks"
              :strong="c.count > 0"
              :data-cola="c.key"
            >
              <template #trailing>
                <span
                  class="min-w-8 rounded-full px-2 py-0.5 text-center text-base font-semibold tabular-nums"
                  :class="
                    c.count
                      ? 'bg-surface-gray-3 text-ink-gray-9'
                      : 'text-ink-gray-5'
                  "
                  >{{ c.count }}</span
                >
              </template>
            </ListRow>
          </section>
        </template>
        <div
          v-else
          class="grid grid-cols-2 gap-4 px-6 pt-6 xl:grid-cols-3"
          data-testid="inmo-inicios-grid"
        >
          <section
            v-for="i in data.inicios"
            :key="i.key"
            class="rounded-2xl border border-outline-gray-1 py-3"
          >
            <h2 class="px-4 pb-1 text-lg font-semibold text-ink-gray-9">
              {{ i.titulo }}
            </h2>
            <ListRow
              v-for="c in i.colas"
              :key="c.key"
              :title="c.etiqueta"
              :to="queueTo(c, i.key)"
              :strong="c.count > 0"
            >
              <template #trailing>
                <span
                  class="text-base font-semibold tabular-nums"
                  :class="c.count ? 'text-ink-gray-9' : 'text-ink-gray-5'"
                  >{{ c.count }}</span
                >
              </template>
            </ListRow>
          </section>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useWindowSize } from '@vueuse/core'
import { AppBar, EmptyState, FilterChips, ListRow } from '@/components/ui'
import {
  inmobiliariaApi,
  linkOf,
  problemText,
} from '@/composables/useInmobiliaria'

const route = useRoute()
const router = useRouter()
const { width } = useWindowSize()
const desktop = computed(() => width.value >= 1024)
const data = ref(null)
const loading = ref(false)
const problem = ref('')

// The chosen home lives in the URL (?inicio=), so «back» from a queue lands on it.
const current = computed({
  get: () =>
    (typeof route.query.inicio === 'string' && route.query.inicio) ||
    defaultHome.value,
  set: (key) =>
    router.replace({ query: { ...route.query, inicio: key || undefined } }),
})
const defaultHome = computed(() => {
  const inicios = data.value?.inicios || []
  // Administrators start on their own home; everyone else on the first.
  return (
    (data.value?.admin &&
      inicios.find((i) => i.key === 'administración')?.key) ||
    inicios[0]?.key ||
    ''
  )
})
const chips = computed(() =>
  (data.value?.inicios || []).map((i) => ({
    value: i.key,
    label: i.nombre,
    count: i.pendientes || undefined,
  })),
)
const home = computed(
  () =>
    (data.value?.inicios || []).find((i) => i.key === current.value) ||
    data.value?.inicios?.[0] ||
    null,
)

function queueTo(cola, inicio = current.value) {
  const to = linkOf(cola.url).to || `/inmobiliaria/cola/${cola.key}`
  return { path: to, query: { inicio } }
}

async function load() {
  loading.value = true
  problem.value = ''
  try {
    data.value = await inmobiliariaApi('inicio')
  } catch (e) {
    problem.value = problemText(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)
</script>
