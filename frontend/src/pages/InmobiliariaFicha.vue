<template>
  <!-- One inmobiliaria record in the shell (INMO-SH): /inmobiliaria/<tipo>/:name.
       «Back» returns where the worker came from (Hoy, a queue, the board, the
       palette) — the return_to it carries, else the history, else the home. -->
  <div
    class="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-base"
  >
    <AppBar
      :title="desktop ? data?.titulo || '' : ''"
      :back="true"
      :back-label="backLabel"
      :loading="loading"
      data-testid="inmo-ficha-appbar"
      @back="goBack"
    />
    <div class="flex-1 overflow-y-auto px-4 pb-24 pt-2">
      <div class="mx-auto w-full max-w-2xl">
        <EmptyState
          v-if="problem && !data"
          state="error"
          title="No se pudo abrir"
          :message="problem"
          action="Reintentar"
          @action="load"
        />
        <EmptyState v-else-if="!data" state="loading" title="Abriendo…" />
        <FichaView v-else :ficha="data" :carry="carry" @changed="load" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWindowSize } from '@vueuse/core'
import { AppBar, EmptyState } from '@/components/ui'
import FichaView from '@/components/inmobiliaria/FichaView.vue'
import { safeReturn } from '@/composables/useCompras'
import { sanitizeReturnLabel } from '@/vendor/muelle-shell/contracts'
import { inmobiliariaApi, problemText } from '@/composables/useInmobiliaria'

const props = defineProps({
  tipo: { type: String, required: true },
  name: { type: String, required: true },
})
const route = useRoute()
const router = useRouter()
const { width } = useWindowSize()
const desktop = computed(() => width.value >= 1024)
const data = ref(null)
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
  event.preventDefault()
  if (window.history.state?.back) return router.back()
  if (returnTo.value?.startsWith('/crm/'))
    return router.push(returnTo.value.slice('/crm'.length))
  router.push('/inmobiliaria')
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
