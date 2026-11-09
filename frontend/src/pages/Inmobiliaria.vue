<template>
  <!-- Inmobiliaria's homes in the shell (INMO-SH): each role's queues with the
       same counts as the Desk homes and Hoy (inmobiliaria.api.shell.inicio).
       Phone: one chip per home, its queues as rows. Desktop: every home as an
       open section with its counts aligned; a home with nothing waiting folds.
       The title arranges the homes (order, hidden) by the same layers as the
       bar. Every row opens the queue in the shell. -->
  <div
    class="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-base"
  >
    <AppBar
      title="Inmobiliaria"
      :loading="loading && !!data"
      :picker="arrangeable"
      :picker-open="sectionsSheet?.module === 'inmobiliaria'"
      :scope-title="__('Arrange {0}', ['Inmobiliaria'])"
      data-testid="inmo-appbar"
      @pick="arrange"
    />
    <div class="flex-1 overflow-y-auto pb-24">
      <EmptyState
        v-if="problem && !data"
        state="error"
        title="No se pudo abrir Inmobiliaria"
        :message="problem"
        action="Reintentar"
        @action="load"
      >
        <Button
          v-if="salida"
          variant="subtle"
          class="min-h-11"
          :label="`Ir a ${salida.label}`"
          data-testid="inmo-salida"
          @click="router.push(salida.to)"
        />
      </EmptyState>
      <!-- Opening: the home's rows in grey, so nothing jumps when they land. -->
      <ul
        v-else-if="!data"
        class="animate-pulse px-4 pt-4 motion-reduce:animate-none"
        role="status"
        aria-label="Abriendo…"
        data-testid="inmo-esqueleto"
      >
        <li class="mb-4 h-14 rounded-8 bg-surface-gray-1" />
        <li
          v-for="n in 5"
          :key="n"
          class="flex min-h-12 items-center justify-between gap-3"
        >
          <span class="h-3.5 w-1/2 rounded-full bg-surface-gray-2" />
          <span class="h-3.5 w-6 rounded-full bg-surface-gray-2" />
        </li>
      </ul>
      <template v-else>
        <div v-if="accesos.length" class="flex flex-col gap-2 px-4 pt-2">
          <component
            :is="a.link.to ? RouterLink : 'a'"
            v-for="a in accesos"
            :key="a.key"
            v-bind="a.link"
            class="press flex min-h-14 items-center gap-3 rounded-8 bg-surface-gray-2 px-4 text-base-medium text-ink-gray-9 hover:bg-surface-gray-3"
            :data-acceso="a.key"
          >
            <span :class="[a.icono, 'size-5']" aria-hidden="true" />
            <span class="flex-1">{{ a.etiqueta }}</span>
            <span class="lucide-chevron-right size-5" aria-hidden="true" />
          </component>
        </div>

        <EmptyState
          v-if="!data.inicios.length"
          state="empty"
          title="Sin listas de trabajo"
          message="Tu negocio todavía no usa estas listas. Pide a un administrador que revise tu perfil."
        >
          <Button
            v-if="salida"
            variant="subtle"
            class="min-h-11"
            :label="`Ir a ${salida.label}`"
            @click="router.push(salida.to)"
          />
        </EmptyState>
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
            <h2
              class="title-face px-4 pb-1 text-lg font-semibold text-ink-gray-9"
            >
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
              :data-fresh="live.fresh.value.has(c.key) ? '' : undefined"
            >
              <template #trailing>
                <span
                  class="num min-w-8 rounded-full px-2 py-0.5 text-center text-base font-semibold"
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
          class="max-w-3xl space-y-2 px-6 pt-6"
          data-testid="inmo-inicios"
        >
          <section
            v-for="i in shownHomes"
            :key="i.key"
            :data-inicio="i.key"
            :data-folded="isFolded(i) ? '' : undefined"
          >
            <button
              type="button"
              class="flex min-h-12 w-full items-center gap-1 border-b border-outline-gray-1 px-4 text-left hover:bg-surface-gray-1"
              :aria-expanded="!isFolded(i)"
              :aria-controls="`inmo-${i.key}`"
              @click="toggleHome(i)"
            >
              <h2
                class="title-face min-w-0 truncate text-lg font-semibold"
                :class="i.pendientes ? 'text-ink-gray-9' : 'text-ink-gray-6'"
              >
                {{ i.titulo }}
              </h2>
              <span
                class="lucide-chevron-down size-4 flex-none text-ink-gray-5 transition-transform motion-reduce:transition-none"
                :class="isFolded(i) ? '-rotate-90' : ''"
                aria-hidden="true"
              />
              <span class="flex-1" />
              <span
                class="num w-12 flex-none text-right text-lg font-semibold"
                :class="i.pendientes ? 'text-ink-gray-9' : 'text-ink-gray-5'"
                >{{ i.pendientes }}</span
              >
            </button>
            <ExpandTransition>
              <div v-if="!isFolded(i)" :id="`inmo-${i.key}`" class="pb-4">
                <ListRow
                  v-for="c in i.colas"
                  :key="c.key"
                  :title="c.etiqueta"
                  :to="queueTo(c, i.key)"
                  :strong="c.count > 0"
                  :data-cola="c.key"
                  :data-fresh="live.fresh.value.has(c.key) ? '' : undefined"
                >
                  <template #trailing>
                    <!-- ListRow keeps its trailing on the first line; this
                         lines the count up with a one-line queue name. -->
                    <span
                      class="num mt-1 block w-12 text-right text-md font-semibold leading-snug"
                      :class="c.count ? 'text-ink-gray-9' : 'text-ink-gray-5'"
                      >{{ c.count }}</span
                    >
                  </template>
                </ListRow>
              </div>
            </ExpandTransition>
          </section>
          <p
            v-if="hiddenHomes.length"
            class="pt-2 text-sm text-ink-gray-6"
            data-testid="inmo-ocultos"
          >
            {{
              hiddenHomes.length === 1
                ? __(
                    "One home is hidden: show it again from Inmobiliaria's title.",
                  )
                : __(
                    "{0} homes are hidden: show them again from Inmobiliaria's title.",
                    [hiddenHomes.length],
                  )
            }}
          </p>
        </div>
      </template>
    </div>
    <!-- The page's one create action, at the thumb: hold a unit, starting
         from the ones still available. -->
    <Fab
      v-if="apartarTo"
      label="Apartar una unidad"
      icon="lucide-bookmark"
      :to="apartarTo"
      data-testid="inmo-apartar"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import { useWindowSize } from '@vueuse/core'
import {
  AppBar,
  EmptyState,
  ExpandTransition,
  Fab,
  FilterChips,
  ListRow,
} from '@/components/ui'
import {
  firstModuleRoute,
  moduleLayout,
  openSectionsSheet,
  sectionsSheet,
  shellBoot,
} from '@/composables/muelleShell'
import { arrangeSections } from '@/utils/shellLayout'
import { can } from '@/vendor/muelle-shell/contracts'
import { useLiveList } from '@/composables/liveList'
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

// When Inmobiliaria cannot open, the worker goes on in another module.
const salida = computed(() => firstModuleRoute(shellBoot.value, 'inmobiliaria'))
// Shortcuts (Disponibilidad) that lead somewhere: a shell screen or a page of
// its own; one without an address is left out rather than linking here.
const accesos = computed(() =>
  (data.value?.accesos || [])
    .map((a) => ({ ...a, link: linkOf(a.url) }))
    .filter((a) => a.link.to || a.link.href),
)

const isHome = (key) =>
  typeof key === 'string' &&
  (data.value?.inicios || []).some((i) => i.key === key)
// The chosen home lives in the URL (?inicio=), so «back» from a queue lands on
// it; a home the worker no longer has falls back to the default one.
const current = computed({
  get: () =>
    isHome(route.query.inicio) ? route.query.inicio : defaultHome.value,
  set: (key) =>
    router.replace({ query: { ...route.query, inicio: key || undefined } }),
})
// The homes as arranged (the owner's per puesto, or the worker's own): the
// server's order otherwise. A hidden home leaves the chips and the sections
// but still opens from a link (?inicio=).
const layout = computed(() => moduleLayout('inmobiliaria'))
const arranged = computed(() =>
  arrangeSections({ items: data.value?.inicios || [], layout: layout.value }),
)
const shownHomes = computed(() =>
  arranged.value.rest.filter((i) => !arranged.value.hidden.has(i.key)),
)
const hiddenHomes = computed(() =>
  arranged.value.rest.filter((i) => arranged.value.hidden.has(i.key)),
)
// The server orders the homes (everyone's first, administration last) and may
// name the one to start on; the shell never picks one by its name. An
// arrangement starts on its first home.
const defaultHome = computed(() => {
  if (layout.value && shownHomes.value.length) return shownHomes.value[0].key
  return isHome(data.value?.predeterminado)
    ? data.value.predeterminado
    : data.value?.inicios?.[0]?.key || ''
})
const chips = computed(() =>
  shownHomes.value.map((i) => ({
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

// Desktop: a home with nothing waiting starts folded; a tap opens or folds any.
const toggled = ref(new Set())
const isFolded = (i) => !i.pendientes !== toggled.value.has(i.key)
function toggleHome(i) {
  const next = new Set(toggled.value)
  if (next.has(i.key)) next.delete(i.key)
  else next.add(i.key)
  toggled.value = next
}

// «Ordenar Inmobiliaria»: the homes' order and which hide, from the title.
const arrangeable = computed(() => (data.value?.inicios?.length || 0) > 1)
function arrange() {
  openSectionsSheet({
    module: 'inmobiliaria',
    title: 'Inmobiliaria',
    items: data.value.inicios.map((i) => ({
      key: i.key,
      label: i.nombre,
      icon: 'lucide-list-checks',
    })),
    parts: null,
    hint: __(
      'Hiding does not take access away: a hidden home shows again from here.',
    ),
  })
}

function queueTo(cola, inicio = current.value) {
  const to = linkOf(cola.url).to || `/inmobiliaria/cola/${cola.key}`
  return { path: to, query: { inicio } }
}

// «Apartar» needs the board and the right to hold; it opens the available units.
const apartarTo = computed(() =>
  data.value &&
  can(shellBoot.value, 'inmobiliaria', 'apartar') &&
  (data.value.accesos || []).some((a) => a.key === 'disponibilidad')
    ? { path: '/inmobiliaria/disponibilidad', query: { estatus: 'Disponible' } }
    : null,
)

// The counts stay current: a save to any record a queue lists refreshes the
// home, and a queue whose count changed glows for a moment.
const counts = () =>
  Object.fromEntries(
    (data.value?.inicios || []).flatMap((i) =>
      i.colas.map((c) => [c.key, c.count]),
    ),
  )
const live = useLiveList(
  () => [
    ...new Set(
      (data.value?.inicios || []).flatMap((i) =>
        i.colas.map((c) => c.doctype).filter(Boolean),
      ),
    ),
  ],
  async () => {
    const was = counts()
    await load()
    const now = counts()
    const keys = Object.keys(now)
    live.mark(
      keys.filter((k) => was[k] === now[k]),
      keys,
    )
  },
)

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
