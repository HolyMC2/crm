<template>
  <!-- One queue of a home (INMO-SH): the same records and count as its Desk
       list, titled by names. Phone: the list; a row opens the record and «back»
       returns here. Desktop (≥1024): list and record side by side. -->
  <div
    class="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-base"
  >
    <AppBar
      :title="data?.etiqueta || 'Lista'"
      :count="data?.count ?? null"
      :back="true"
      back-label="Inmobiliaria"
      :loading="loading"
      data-testid="inmo-cola-appbar"
      @back="goBack"
    />
    <div class="flex min-h-0 flex-1">
      <div
        ref="scroller"
        class="min-h-0 flex-1 overflow-y-auto pb-24"
        :class="desktop && 'max-w-md border-r border-outline-gray-1'"
        data-inmo-scroller
      >
        <EmptyState
          v-if="problem && !data"
          state="error"
          title="No se pudo abrir la lista"
          :message="problem"
          action="Reintentar"
          @action="load()"
        />
        <EmptyState v-else-if="!data" state="loading" title="Abriendo…" />
        <EmptyState
          v-else-if="!data.filas.length"
          state="empty"
          title="Nada pendiente aquí"
          :message="
            data.count
              ? 'Esta lista se abre en el escritorio.'
              : 'Cuando haya algo que atender aparecerá en esta lista.'
          "
        />
        <template v-else>
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
        </template>
      </div>
      <div
        v-if="desktop"
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
import {
  inmobiliariaApi,
  linkOf,
  problemText,
  valueText,
} from '@/composables/useInmobiliaria'

const props = defineProps({ cola: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
const { width } = useWindowSize()
const desktop = computed(() => width.value >= 1024)

const data = ref(null)
const loading = ref(false)
const problem = ref('')
const scroller = ref(null)
const ficha = ref(null)
const fichaProblem = ref('')
const selected = computed(() =>
  typeof route.query.ver === 'string' ? route.query.ver : '',
)
// What a record opened from here carries back: this queue and its home.
const carry = computed(() => ({
  return_to: `/crm/inmobiliaria/cola/${props.cola}${route.query.inicio ? `?inicio=${encodeURIComponent(route.query.inicio)}` : ''}`,
  return_label: data.value?.etiqueta || 'Inmobiliaria',
}))

function rowLink(fila) {
  const link = linkOf(fila.url)
  if (!link.to) return link.href ? { href: link.href } : {}
  if (desktop.value) return { to: { query: { ...route.query, ver: fila.url } } }
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

function goBack(event) {
  event.preventDefault()
  router.push({
    path: '/inmobiliaria',
    query: route.query.inicio ? { inicio: route.query.inicio } : {},
  })
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
  } finally {
    loading.value = false
  }
}

async function loadFicha() {
  ficha.value = null
  fichaProblem.value = ''
  const to = linkOf(selected.value).to || ''
  const match = /^\/inmobiliaria\/([a-z]+)\/(.+)$/.exec(to)
  if (!desktop.value || !match) return
  try {
    ficha.value = await inmobiliariaApi('ficha', {
      tipo: match[1],
      name: decodeURIComponent(match[2]),
    })
  } catch (e) {
    fichaProblem.value = problemText(e)
  }
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
