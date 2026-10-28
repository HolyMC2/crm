<template>
  <!-- One inmobiliaria record in the shell (INMO-SH): /inmobiliaria/<tipo>/:name.
       «Back» returns where the worker came from (Hoy, a queue, the board, the
       palette) — the history, else the return_to it carries, else the home. -->
  <div
    class="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-base"
  >
    <AppBar
      :title="data?.titulo || TIPOS[tipo]?.etiqueta || ''"
      :back="true"
      :back-label="backLabel"
      :bell="phone"
      :loading="loading && !!data"
      data-testid="inmo-ficha-appbar"
      @back="goBack"
    >
      <!-- WhatsApp-style: the name, and under it the state and the kind. -->
      <template v-if="data" #title>
        <div class="flex min-h-12 min-w-0 flex-col justify-center px-3">
          <span
            class="title-face line-clamp-2 break-words text-xl font-semibold leading-tight [text-wrap:balance]"
            data-appbar-title
            data-testid="inmo-ficha-titulo"
            >{{ data.titulo }}</span
          >
          <span class="flex min-w-0 items-center gap-2 pt-0.5">
            <StatusChip
              v-if="data.estatus"
              :label="data.estatus.label"
              :tone="data.estatus.tone"
            />
            <span class="truncate text-sm leading-tight text-ink-gray-6">{{
              data.tipo_label
            }}</span>
          </span>
        </div>
      </template>
      <template v-if="data" #actions>
        <RecordIsland
          :reach="data.reach || {}"
          :who="data.reach?.who || data.titulo"
          :mail="data.reach?.email ? { allowed: true, reason: '' } : null"
          :groups="boltGroups"
          :phone="phone"
          :subtitle="data.titulo"
          @mail="view?.writeMail()"
          @pick="view?.onBolt($event)"
          @tools="view?.openTools()"
        />
      </template>
    </AppBar>
    <div class="flex-1 overflow-y-auto px-4 pb-24 pt-4">
      <div class="mx-auto w-full" :class="phone ? 'max-w-2xl' : 'max-w-5xl'">
        <EmptyState
          v-if="problem && !data"
          state="error"
          title="No se pudo abrir"
          :message="problem"
          action="Reintentar"
          @action="load"
        >
          <Button
            variant="subtle"
            class="min-h-11"
            :label="returnTo ? backLabel : 'Volver al inicio'"
            data-testid="inmo-ficha-salida"
            @click="volverA(router, returnTo || '/crm/inmobiliaria')"
          />
        </EmptyState>
        <!-- Opening: the record's shape in grey, so nothing jumps when it lands. -->
        <div
          v-else-if="!data"
          class="flex animate-pulse flex-col gap-3 pt-2 motion-reduce:animate-none"
          role="status"
          aria-label="Abriendo…"
          data-testid="inmo-ficha-esqueleto"
        >
          <span class="h-4 w-2/3 rounded-full bg-surface-gray-2" />
          <span class="h-3 w-24 rounded-full bg-surface-gray-2" />
          <span class="h-9 w-48 rounded-full bg-surface-gray-2" />
          <span class="mt-1 h-12 w-full rounded-full bg-surface-gray-2" />
          <span
            v-for="n in 4"
            :key="n"
            class="mt-3 h-5 w-full rounded-full bg-surface-gray-1"
          />
        </div>
        <template v-else>
          <!-- A reload that failed keeps the record on screen, says why and
               lets the worker try again. -->
          <div
            v-if="problem"
            class="mb-4 flex flex-wrap items-center gap-2 rounded-6 bg-surface-red-1 px-3 py-2 text-base text-ink-red-7"
            role="alert"
            data-testid="inmo-ficha-problema"
          >
            <span class="flex-1">{{ problem }}</span>
            <Button variant="subtle" label="Reintentar" @click="load" />
          </div>
          <FichaView
            ref="view"
            :ficha="data"
            :carry="carry"
            :header="false"
            :wide="!phone"
            @changed="load"
          />
          <RecordActivity
            v-if="data.doctype && data.name"
            class="-mx-4 mt-6"
            :class="!phone && 'lg:max-w-[calc(100%-20.5rem+2rem)]'"
            :doctype="data.doctype"
            :name="data.name"
            :title="data.titulo || data.name"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import { useWindowSize } from '@vueuse/core'
import { AppBar, EmptyState, StatusChip } from '@/components/ui'
import FichaView from '@/components/inmobiliaria/FichaView.vue'
import RecordIsland from '@/components/documentos/RecordIsland.vue'
import { safeReturn } from '@/composables/useCompras'
import { sanitizeReturnLabel } from '@/vendor/muelle-shell/contracts'
import {
  TIPOS,
  boltGroupsOf,
  inmobiliariaApi,
  problemText,
  volverA,
} from '@/composables/useInmobiliaria'

const RecordActivity = defineAsyncComponent(
  () => import('@/components/documentos/RecordActivity.vue'),
)

const props = defineProps({
  tipo: { type: String, required: true },
  name: { type: String, required: true },
})
const route = useRoute()
const router = useRouter()
const { width } = useWindowSize()
const phone = computed(() => width.value < 1024)
const data = ref(null)
const view = ref(null)
const boltGroups = computed(() => (data.value ? boltGroupsOf(data.value) : []))
const loading = ref(false)
const problem = ref('')

const returnTo = computed(() => safeReturn(route.query.return_to))
const backLabel = computed(() =>
  returnTo.value
    ? `Volver a ${sanitizeReturnLabel(route.query.return_label) || 'Muelle'}`
    : 'Volver',
)
// The next record keeps the same way back (Hoy → apartado → venta → back to Hoy).
const carry = computed(() =>
  returnTo.value
    ? {
        return_to: returnTo.value,
        return_label: sanitizeReturnLabel(route.query.return_label) || '',
      }
    : {},
)

function goBack(event) {
  event?.preventDefault?.()
  if (window.history.state?.back) return router.back()
  // Opened from outside (a link, a reload): up to return_to, else the home, in
  // place of this entry, so that screen's «back» never comes here in a loop.
  if (returnTo.value?.startsWith('/crm/'))
    return router.replace(returnTo.value.slice('/crm'.length))
  if (returnTo.value) return window.location.assign(returnTo.value)
  router.replace('/inmobiliaria')
}

async function load() {
  loading.value = true
  problem.value = ''
  try {
    data.value = await inmobiliariaApi('ficha', {
      tipo: props.tipo,
      name: props.name,
    })
    document.title = `${data.value.titulo} · Inmobiliaria`
  } catch (e) {
    problem.value = problemText(e)
  } finally {
    loading.value = false
  }
}
watch(
  () => [props.tipo, props.name],
  () => {
    data.value = null
    load()
  },
)
onMounted(load)
</script>
