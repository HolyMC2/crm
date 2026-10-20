<template>
  <!-- One queue of a home (INMO-SH): the same records and count as its Desk
       list, titled by names. Phone: the list; a row opens the record and «back»
       returns here. Desktop (≥1024): list and record side by side. «Back»
       returns to the screen before, else whoever opened the queue (Hoy), else
       its home; no state leaves the worker without a way on. -->
  <div
    class="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-base"
  >
    <AppBar
      :title="data?.etiqueta || 'Lista'"
      :count="data?.count ?? null"
      :back="true"
      back-label="Volver"
      :loading="loading"
      data-testid="inmo-cola-appbar"
      @back="goBack"
    />
    <div class="flex min-h-0 flex-1">
      <div
        ref="scroller"
        class="min-h-0 flex-1 overflow-y-auto pb-24"
        :class="beside && 'max-w-md border-r border-outline-gray-1'"
        data-inmo-scroller
      >
        <EmptyState
          v-if="problem && !data"
          state="error"
          title="No se pudo abrir la lista"
          :message="problem"
          action="Reintentar"
          @action="load()"
        >
          <Button
            variant="subtle"
            class="min-h-11"
            :label="salida"
            data-testid="inmo-cola-salida"
            @click="salir"
          />
        </EmptyState>
        <EmptyState v-else-if="!data" state="loading" title="Abriendo…" />
        <!-- Records the list counts but cannot show one by one yet (a report
             queue): say how many, and lead on. -->
        <EmptyState
          v-else-if="!data.filas.length && data.count > 0"
          state="empty"
          :title="pendientes(data.count)"
          :message="
            deskLink
              ? 'Todavía no se pueden revisar uno por uno aquí. Ábrelos en el escritorio o sigue con otra lista de tu inicio.'
              : 'Todavía no se pueden revisar uno por uno aquí. Avisa a un administrador para que los atienda y sigue con otra lista de tu inicio.'
          "
          data-testid="inmo-cola-sin-renglones"
        >
          <Button
            variant="solid"
            class="min-h-11"
            :label="salida"
            data-testid="inmo-cola-salida"
            @click="salir"
          />
          <a
            v-if="deskLink"
            :href="deskLink"
            :class="DESK_LINK"
            data-testid="inmo-cola-desk"
            >Abrir la lista en el escritorio</a
          >
        </EmptyState>
        <EmptyState
          v-else-if="!data.filas.length"
          state="empty"
          title="Nada pendiente aquí"
          message="Cuando haya algo que atender aparecerá en esta lista."
        >
          <Button
            variant="subtle"
            class="min-h-11"
            :label="salida"
            data-testid="inmo-cola-salida"
            @click="salir"
          />
        </EmptyState>
        <template v-else>
          <div
            v-if="problem"
            class="mx-4 mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-surface-red-1 px-3 py-2 text-base text-ink-red-7"
            role="alert"
            data-testid="inmo-cola-problema"
          >
            <span class="flex-1">{{ problem }}</span>
            <Button
              variant="subtle"
              label="Reintentar"
              @click="load({ more: problemMore })"
            />
          </div>
          <ListRow
            v-for="fila in data.filas"
            :key="fila.name"
            :title="fila.title"
            :subtitle="fila.detail || ''"
            :subtitle-lines="2"
            :subtitle-tone="fila.tone === 'danger' ? 'danger' : undefined"
            :meta="fila.meta ? valueText(fila.meta) : ''"
            :selected="desktop && selected === fila.url"
            v-bind="rowLink(fila)"
            :data-fila="fila.name"
          >
            <template v-if="fila.estatus" #trailing>
              <StatusChip
                :label="fila.estatus.label"
                :tone="fila.estatus.tone"
              />
            </template>
          </ListRow>
          <div v-if="data.mas" class="flex justify-center px-4 py-4">
            <Button
              variant="subtle"
              size="lg"
              label="Ver más"
              :loading="loading"
              @click="load({ more: true })"
            />
          </div>
          <div v-if="deskLink" class="flex justify-center px-4 py-4">
            <a :href="deskLink" :class="DESK_LINK" data-testid="inmo-cola-desk"
              >Abrir la lista en el escritorio</a
            >
          </div>
        </template>
      </div>
      <div
        v-if="beside"
        class="min-h-0 flex-1 overflow-y-auto px-8 pb-12 pt-6"
        data-testid="inmo-cola-detalle"
      >
        <FichaView
          v-if="ficha"
          :ficha="ficha"
          :carry="carry"
          @changed="refresh"
        />
        <EmptyState
          v-else-if="fichaProblem"
          state="error"
          title="No se pudo abrir"
          :message="fichaProblem"
          action="Reintentar"
          @action="loadFicha"
        >
          <Button
            variant="subtle"
            class="min-h-11"
            label="Cerrar"
            data-testid="inmo-cola-cerrar"
            @click="cerrarFicha"
          />
        </EmptyState>
        <EmptyState
          v-else-if="fichaLoading"
          state="loading"
          title="Abriendo…"
        />
        <EmptyState
          v-else
          state="empty"
          title="Elige un renglón"
          message="El registro se abre aquí, junto a la lista."
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import { useWindowSize } from '@vueuse/core'
import { AppBar, EmptyState, ListRow, StatusChip } from '@/components/ui'
import FichaView from '@/components/inmobiliaria/FichaView.vue'
import { shellBoot } from '@/composables/muelleShell'
import { safeReturn } from '@/composables/useCompras'
import {
  DESK_PREFIXES,
  can,
  safeReturn as safePath,
  sanitizeReturnLabel,
} from '@/vendor/muelle-shell/contracts'
import {
  inmobiliariaApi,
  linkOf,
  problemText,
  valueText,
  volverA,
} from '@/composables/useInmobiliaria'
import { parseFicha } from '@/utils/inmobiliariaTipos'

const props = defineProps({ cola: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
const { width } = useWindowSize()
const desktop = computed(() => width.value >= 1024)

const DESK_LINK =
  'inline-flex min-h-11 items-center px-2 text-base text-ink-gray-7 underline underline-offset-4'

const data = ref(null)
const loading = ref(false)
const problem = ref('')
const problemMore = ref(false)
const scroller = ref(null)
const ficha = ref(null)
const fichaProblem = ref('')
const fichaLoading = ref(false)
const selected = computed(() =>
  typeof route.query.ver === 'string' ? route.query.ver : '',
)
// Desktop: the record opens beside the list. A list without rows has nothing
// to open there, so its own state («3 pendientes…») takes the whole width.
const beside = computed(
  () => desktop.value && !!(selected.value || data.value?.filas?.length),
)
// What a record opened from here carries back: this queue and its home.
const carry = computed(() => ({
  return_to: `/crm/inmobiliaria/cola/${props.cola}${route.query.inicio ? `?inicio=${encodeURIComponent(route.query.inicio)}` : ''}`,
  return_label: data.value?.etiqueta || 'Inmobiliaria',
}))
// Who opened the queue (Hoy carries return_to); without one, the home it
// belongs to. `salida` names that place on the way-out buttons.
const opener = computed(() => safeReturn(route.query.return_to))
const destino = computed(
  () =>
    opener.value ||
    `/crm/inmobiliaria${route.query.inicio ? `?inicio=${encodeURIComponent(route.query.inicio)}` : ''}`,
)
const salida = computed(() => {
  if (!opener.value) return 'Volver al inicio'
  const label = sanitizeReturnLabel(route.query.return_label)
  return label ? `Volver a ${label}` : 'Volver'
})
// The Desk list is an administrator's escape, never routine work.
const deskLink = computed(() =>
  can(shellBoot.value, 'inmobiliaria', 'admin')
    ? safePath(data.value?.desk, DESK_PREFIXES)
    : null,
)

const pendientes = (count) =>
  `${count} ${count === 1 ? 'pendiente' : 'pendientes'} en esta lista`

function rowLink(fila) {
  const link = linkOf(fila.url)
  if (!link.to) return link.href ? { href: link.href } : {}
  // Desktop: a record screen opens beside the list, in place, so «back» still
  // leaves the queue. Any other screen (a sale in Ventas) opens with the way back.
  if (desktop.value && parseFicha(link.to))
    return { to: { query: { ...route.query, ver: fila.url } }, replace: true }
  const [path, search = ''] = link.to.split('?')
  return {
    to: {
      path,
      query: {
        ...Object.fromEntries(new URLSearchParams(search)),
        ...carry.value,
      },
    },
  }
}

// The bar's arrow: the screen before, else (opened from a link or a reload)
// up to the opener or the home, in place of this entry so that screen's own
// «back» never returns here in a loop.
function goBack(event) {
  event?.preventDefault?.()
  if (window.history.state?.back) return router.back()
  if (!destino.value.startsWith('/crm/'))
    return window.location.assign(destino.value)
  router.replace(destino.value.slice('/crm'.length))
}
// «Volver al inicio» / «Volver a Hoy»: the place the button names.
function salir() {
  volverA(router, destino.value)
}

async function load({ more = false } = {}) {
  loading.value = true
  problem.value = ''
  try {
    const page = await inmobiliariaApi('cola', {
      key: props.cola,
      start: more ? data.value?.filas.length || 0 : 0,
    })
    data.value =
      more && data.value
        ? { ...page, filas: [...data.value.filas, ...page.filas] }
        : page
  } catch (e) {
    problem.value = problemText(e)
    problemMore.value = more
  } finally {
    loading.value = false
  }
}

async function loadFicha() {
  ficha.value = null
  fichaProblem.value = ''
  const target = parseFicha(linkOf(selected.value).to)
  if (!desktop.value || !target) return
  fichaLoading.value = true
  try {
    const answer = await inmobiliariaApi('ficha', target)
    // Another row may have been chosen meanwhile.
    const now = parseFicha(linkOf(selected.value).to)
    if (now?.tipo === target.tipo && now?.name === target.name)
      ficha.value = answer
  } catch (e) {
    fichaProblem.value = problemText(e)
  } finally {
    fichaLoading.value = false
  }
}
function cerrarFicha() {
  router.replace({ query: { ...route.query, ver: undefined } })
}
function refresh() {
  load()
  loadFicha()
}

watch(
  () => props.cola,
  () => load(),
)
watch([selected, desktop], loadFicha)
onMounted(() => {
  load()
  loadFicha()
})
</script>
