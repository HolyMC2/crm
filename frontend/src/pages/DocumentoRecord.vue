<template>
  <!-- One document (Shell SPEC §6 DD4): the bar names the party with the kind
       and number as small meta; the status and amount are the hero; items as
       cards, totals, Datos, Conexiones, Actividad and Archivos. On a desktop
       Conexiones and Actividad sit in a right column. -->
  <div class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
    <AppBar
      :back="backTo"
      :back-label="backLabel"
      :context="view ? `${view.kind} · ${view.number}` : ''"
      :title="view?.title || entry?.label || 'Documento'"
      :bell="phone"
      :loading="loading && !!record"
    />
    <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto pb-10">
      <EmptyState
        v-if="error"
        :state="denied ? 'denied' : 'error'"
        :title="
          denied
            ? 'No puedes ver este documento'
            : 'No se pudo abrir el documento'
        "
        :message="error"
        :action="denied ? '' : 'Reintentar'"
        @action="load"
      />
      <EmptyState v-else-if="!record" state="loading" title="Abriendo…" />
      <div
        v-else
        class="mx-auto grid w-full max-w-6xl gap-x-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
      >
        <div class="flex min-w-0 flex-col gap-5 pt-4">
          <section
            class="flex flex-col gap-2 px-4"
            data-testid="documentos-hero"
          >
            <div class="flex flex-wrap items-center gap-2">
              <StatusChip
                v-if="view.status"
                :status="view.status"
                :tone="view.tone"
              />
              <span
                v-if="record.header.is_return"
                class="text-sm text-ink-gray-7"
                >Devolución</span
              >
            </div>
            <p
              v-if="view.amount"
              class="text-3xl font-semibold tabular-nums leading-tight text-ink-gray-9"
            >
              {{ view.amount }}
            </p>
            <p class="flex flex-wrap gap-x-3 text-base text-ink-gray-7">
              <span v-if="view.date">{{ view.date }}</span>
              <span v-if="view.due" :class="overdue ? 'text-ink-red-7' : ''">{{
                view.due
              }}</span>
            </p>
          </section>
          <template v-for="key in mainSections" :key="key">
            <ItemsCards
              v-if="key === 'items'"
              :items="record.items"
              :currency="currency"
            />
            <DocTotals
              v-else-if="key === 'totals'"
              :totals="record.totals"
              :taxes="record.taxes"
              :currency="currency"
              :docstatus="record.header.docstatus"
              :owed-label="profile.owedLabel"
            />
            <DatosList
              v-else-if="key === 'datos'"
              :fields="record.fields"
              :currency="currency"
              :boot="shellBoot"
            />
          </template>
        </div>
        <aside class="flex min-w-0 flex-col gap-5 pt-5 lg:pt-4">
          <Conexiones
            v-if="sections.includes('conexiones')"
            :connections="record.connections"
            :scope-label="scopeLabel"
          />
          <Actividad
            v-if="sections.includes('actividad')"
            :activity="record.activity"
            :noun="noun"
          />
        </aside>
      </div>
    </div>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AppBar, EmptyState, StatusChip } from '@/components/ui'
import Actividad from '@/components/documentos/Actividad.vue'
import Conexiones from '@/components/documentos/Conexiones.vue'
import DatosList from '@/components/documentos/DatosList.vue'
import DocTotals from '@/components/documentos/DocTotals.vue'
import ItemsCards from '@/components/documentos/ItemsCards.vue'
import { isMobile } from '@/composables/breakpoint'
import { shellBoot } from '@/composables/muelleShell'
import { docApi, errorText } from '@/documentos/api'
import { loadProfile } from '@/documentos/profiles'
import {
  documentRoute,
  floorRoute,
  listRoute,
  profileBySlug,
  profileFor,
} from '@/documentos/registry'
import { formatDue, kindLabel } from '@/utils/display'

const route = useRoute()
const router = useRouter()
const phone = isMobile

const base = computed(() =>
  route.path.startsWith('/inventario') ? '/inventario' : '/documentos',
)
const entry = computed(() =>
  route.params.slug ? profileBySlug(route.params.slug, base.value) : null,
)
const doctype = computed(
  () => entry.value?.doctype || String(route.params.doctype || ''),
)
const name = computed(() => String(route.params.name || ''))

const profile = ref(null)
const record = ref(null)
const loading = ref(false)
const error = ref('')
const denied = ref(false)

const view = computed(() =>
  record.value && profile.value ? profile.value.header(record.value) : null,
)
const currency = computed(() => record.value?.header?.currency || 'MXN')
const sections = computed(() => profile.value?.sections || [])
const mainSections = computed(() =>
  sections.value.filter((key) => ['items', 'totals', 'datos'].includes(key)),
)
const overdue = computed(() => {
  const h = record.value?.header
  return !!(h?.due && Number(h?.outstanding) > 0 && formatDue(h.due).overdue)
})
// «la factura de Ana López»: the scope line on a connection's list.
const noun = computed(() => {
  const kind = (kindLabel(doctype.value) || 'documento').toLowerCase()
  // Gender from the first word: factura, cotización, solicitud → la.
  return /(a|ón|d)$/.test(kind.split(' ')[0]) ? `la ${kind}` : `el ${kind}`
})
const scopeLabel = computed(() =>
  view.value ? `${noun.value} de ${view.value.title}` : '',
)

// Back: to where the worker came from (the list keeps its filters and scroll),
// else up to the list.
const listTo = computed(() =>
  entry.value ? listRoute(entry.value) : floorRoute(doctype.value),
)
const backTo = computed(() =>
  typeof window !== 'undefined' && window.history.state?.back
    ? true
    : listTo.value,
)
const backLabel = computed(() =>
  entry.value ? `Volver a ${entry.value.label.toLowerCase()}` : 'Volver',
)

let seq = 0
async function load() {
  if (!doctype.value || !name.value) return
  const mine = ++seq
  loading.value = true
  error.value = ''
  denied.value = false
  try {
    const [loaded, own] = await Promise.all([
      docApi('record', { doctype: doctype.value, name: name.value }),
      loadProfile({ doctype: doctype.value, entry: entry.value }),
    ])
    if (mine !== seq) return
    // One doctype, several lists (Payment Entry: cobros · pagos): land on the right one.
    const right = profileFor(doctype.value, loaded.doc)
    if (entry.value && right && right.slug !== entry.value.slug) {
      const to = documentRoute(doctype.value, name.value, { hint: loaded.doc })
      if (to) return router.replace(to)
    }
    profile.value = own
    record.value = loaded
  } catch (e) {
    if (mine !== seq) return
    denied.value =
      e?.exc_type === 'PermissionError' ||
      /permission|permiso/i.test(e?.message || '')
    error.value = denied.value
      ? 'Pide al dueño o al encargado que revise tu usuario.'
      : e?.exc_type === 'DoesNotExistError'
        ? 'Este documento ya no existe o cambió de número.'
        : errorText(e)
  } finally {
    if (mine === seq) loading.value = false
  }
}

watch(
  () => [doctype.value, name.value],
  () => {
    record.value = null
    load()
  },
  { immediate: true },
)
</script>
