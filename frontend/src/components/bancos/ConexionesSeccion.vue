<template>
  <!-- «Conexiones con tu banco» on the Bancos cards: each login with its
       state (or how fresh it is), what waits for the person, and for a
       manager «Conectar un banco». A login that needs the person comes
       first; the ones that no longer sync fold at the end. -->
  <section
    v-if="visible"
    class="mt-6"
    aria-label="Conexiones con tu banco"
    data-bancos-conexiones
  >
    <h2 class="px-4 pb-1 text-sm font-semibold text-ink-gray-7">
      Conexiones con tu banco
    </h2>
    <p
      v-if="loadError"
      role="alert"
      class="mx-4 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
    >
      {{ loadError }}
    </p>
    <div
      v-else-if="!data"
      role="status"
      aria-label="Cargando conexiones…"
      class="mx-4 h-16 animate-pulse rounded-7 bg-surface-gray-2"
    />
    <template v-else>
      <p
        v-if="!active.length && can.conectar"
        class="px-4 pb-2 text-sm text-ink-gray-6"
        data-bancos-conexiones-invita
      >
        Conecta tu banco y sus movimientos llegan solos cada día, listos para
        conciliar.
      </p>
      <ul class="divide-y divide-outline-gray-1">
        <li v-for="c in active" :key="c.name" :data-conexion="c.name">
          <ListRow
            :title="c.title"
            :subtitle="rowLine(c)"
            :subtitle-lines="2"
            :icon="kindIcon(c.kind)"
            :to="{
              name: 'BancoConexion',
              params: { conexion: c.name },
              query: companyQuery,
            }"
            :class="c.name === selected ? 'bg-surface-gray-1' : ''"
          >
            <template v-if="c.tone === 'needs' || waiting(c)" #trailing>
              <span
                class="block max-w-full truncate rounded-full bg-surface-amber-2 px-2 py-0.5 text-xs font-medium text-ink-amber-8"
                data-conexion-aviso
                >{{ c.tone === 'needs' ? c.word : waiting(c) }}</span
              >
            </template>
          </ListRow>
        </li>
        <li v-if="can.conectar">
          <ListRow
            :title="active.length ? 'Conectar otro banco' : 'Conectar un banco'"
            subtitle="Tu banca en línea, tarjetas, monederos o el SAT"
            :subtitle-lines="2"
            icon="lucide-plus"
            data-bancos-conectar-fila
            @click="openConnect = true"
          />
        </li>
      </ul>
      <template v-if="off.length">
        <button
          type="button"
          class="press flex min-h-11 w-full items-center gap-2 px-4 text-sm text-ink-gray-6"
          :aria-expanded="showOff"
          data-bancos-conexiones-apagadas
          @click="showOff = !showOff"
        >
          <span
            class="lucide-chevron-down size-4 transition-transform"
            :class="showOff ? 'rotate-180' : ''"
            aria-hidden="true"
          />
          Desconectadas
          <span class="num">{{ off.length }}</span>
        </button>
        <ExpandTransition>
          <ul v-if="showOff" class="divide-y divide-outline-gray-1">
            <li v-for="c in off" :key="c.name">
              <ListRow
                :title="c.title"
                :subtitle="c.word"
                :icon="kindIcon(c.kind)"
                :to="{
                  name: 'BancoConexion',
                  params: { conexion: c.name },
                  query: companyQuery,
                }"
              />
            </li>
          </ul>
        </ExpandTransition>
      </template>
    </template>

    <ConectarSheet
      v-if="connectMounted"
      v-model:open="openConnect"
      :company="company"
      @connected="onConnected"
    />
  </section>
</template>
<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ExpandTransition, ListRow } from '@/components/ui'
import { useLiveList } from '@/composables/liveList'
import { bancosApi, errorText } from './bancos'
import {
  LIVE_CONEXIONES,
  conexionLine,
  waitingOf,
  countText,
} from './conectados'

const ConectarSheet = defineAsyncComponent(() => import('./ConectarSheet.vue'))

const props = defineProps({
  company: { type: String, required: true },
  can: { type: Object, default: () => ({}) },
  selected: { type: String, default: '' },
})
const route = useRoute()
const router = useRouter()
const data = ref(null)
const loadError = ref('')
const showOff = ref(false)
const openConnect = ref(false)
const connectMounted = ref(false)
watch(openConnect, (open) => open && (connectMounted.value = true))

const visible = computed(() => !!props.can.conectados)
const companyQuery = computed(() =>
  route.query.empresa ? { empresa: route.query.empresa } : {},
)
const all = computed(() => data.value?.conexiones || [])
const active = computed(() => all.value.filter((c) => c.tone !== 'off'))
const off = computed(() => all.value.filter((c) => c.tone === 'off'))

const KIND_ICONS = {
  Bank: 'lucide-wallet',
  Tax: 'lucide-file-text',
  Wallet: 'lucide-wallet',
  Other: 'lucide-wallet',
}
function kindIcon(kind) {
  return KIND_ICONS[kind] || 'lucide-wallet'
}
// One number on the list, the most pressing; the login's page has the rest.
function waiting(c) {
  const { revisar, sin_enlazar } = waitingOf(c)
  if (revisar) return `${countText(revisar)} por revisar`
  return sin_enlazar ? `${countText(sin_enlazar)} sin enlazar` : ''
}
function rowLine(c) {
  return conexionLine(c)
}

let sequence = 0
async function load({ quiet = false } = {}) {
  if (!visible.value || !props.company) return
  const mine = ++sequence
  if (!quiet) loadError.value = ''
  try {
    const result = await bancosApi('conexiones', { company: props.company })
    if (mine === sequence) data.value = result
  } catch (error) {
    if (mine === sequence && !quiet) loadError.value = errorText(error)
  }
}
watch(
  () => [props.company, visible.value],
  () => load(),
  { immediate: true },
)
useLiveList(LIVE_CONEXIONES, () => load({ quiet: true }), {
  minIntervalMs: 10000,
})

// Avisos, the assistant and the connector's messages open «Conectar» with ?conectar=1.
watch(
  () => [route.query.conectar, props.can.conectar],
  ([flag, may]) => {
    if (!flag || !may) return
    openConnect.value = true
    const query = { ...route.query }
    delete query.conectar
    router.replace({ query })
  },
  { immediate: true },
)

function onConnected(name) {
  load({ quiet: true })
  router.push({
    name: 'BancoConexion',
    params: { conexion: name },
    query: companyQuery.value,
  })
}
defineExpose({ reload: load })
</script>
