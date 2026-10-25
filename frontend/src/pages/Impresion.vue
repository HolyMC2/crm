<template>
  <div class="flex h-full min-w-0 flex-1 flex-col overflow-y-auto">
    <!-- Más › Configuración › Formatos de impresión (Shell D12, DD20): which
         format prints first for each document, and the formats themselves. -->
    <AppBar
      v-if="isPhone"
      v-model:search="query"
      v-model:search-open="searchOpen"
      back
      back-label="Más"
      :title="narrow ? 'Impresión' : 'Formatos de impresión'"
      :loading="loading && groups.length > 0"
      :searchable="groups.length > 0"
      search-label="Buscar formato o documento"
    />
    <div class="mx-auto w-full max-w-5xl space-y-4 px-4 pb-24 pt-3">
      <header v-if="!isPhone" class="flex flex-wrap items-center gap-3">
        <h1 class="flex-1 text-xl font-semibold text-ink-gray-9">
          Formatos de impresión
        </h1>
        <input
          v-if="groups.length"
          v-model="query"
          type="search"
          placeholder="Buscar formato o documento"
          aria-label="Buscar formato o documento"
          class="min-h-11 w-72 rounded-lg border border-outline-gray-2 bg-surface-base px-3 text-base text-ink-gray-9"
        />
      </header>
      <p v-if="!denied" class="text-base text-ink-gray-7">
        Elige qué formato sale primero al imprimir cada documento. Los de
        fábrica se ven pero no se cambian: duplícalos para editarlos.
      </p>

      <EmptyState
        v-if="denied"
        state="denied"
        title="Solo el dueño cambia los formatos"
        :message="error"
      />
      <EmptyState
        v-else-if="loading && !groups.length"
        state="loading"
        title="Cargando formatos…"
      />
      <EmptyState
        v-else-if="error && !groups.length"
        state="error"
        title="No se pudieron cargar los formatos"
        :message="error"
        action="Reintentar"
        @action="load"
      />
      <EmptyState
        v-else-if="!loading && query && !shown.length"
        title="Nada con ese nombre"
        message="Prueba con el nombre del documento: factura, cotización…"
      />

      <section
        v-for="group in shown"
        :key="group.doctype"
        class="overflow-hidden rounded-2xl border border-outline-gray-1"
        :data-testid="`impresion-tipo-${group.doctype}`"
      >
        <h2
          class="flex items-baseline gap-2 px-4 pb-1 pt-3 text-base font-semibold text-ink-gray-9"
        >
          {{ groupTitle(group) }}
          <span class="text-sm font-normal text-ink-gray-6">
            {{ group.formats.length }}
          </span>
        </h2>
        <ul>
          <li
            v-for="format in group.formats"
            :key="format.name"
            class="flex items-center"
          >
            <ListRow
              class="min-w-0 flex-1"
              :icon="kindIcon(format.kind)"
              :title="format.label"
              :subtitle="formatSubtitle(format)"
              :to="
                format.kind === 'standard'
                  ? null
                  : {
                      name: 'ImpresionFormato',
                      params: { formato: format.name },
                    }
              "
            >
              <!-- Below 360px the pill joins the subtitle row: beside the
                   title it squeezed the name onto three lines. -->
              <template v-if="narrow && pillOf(format)" #subtitle>
                <StatusChip v-bind="pillOf(format)" class="mr-1.5" />{{
                  formatSubtitle(format)
                }}
              </template>
              <template v-if="!narrow && pillOf(format)" #trailing>
                <StatusChip v-bind="pillOf(format)" />
              </template>
            </ListRow>
            <button
              type="button"
              class="mr-1 flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
              :aria-label="`Opciones de ${format.label}`"
              @click="openActions(group, format)"
            >
              <span
                class="lucide-ellipsis-vertical size-5"
                aria-hidden="true"
              />
            </button>
          </li>
        </ul>
      </section>
    </div>

    <BottomSheet
      :open="Boolean(acting)"
      :title="confirming ? confirmTitle : acting?.format.label || ''"
      :subtitle="acting ? groupTitle(acting.group) : ''"
      :flush="!confirming"
      @update:open="(value) => !value && closeActions()"
    >
      <template v-if="acting && !confirming">
        <ListRow
          v-if="acting.format.kind !== 'standard'"
          icon="lucide-eye"
          title="Abrir"
          subtitle="Vista previa y campos; código en la computadora"
          :to="{
            name: 'ImpresionFormato',
            params: { formato: acting.format.name },
          }"
          @click="closeActions"
        />
        <ListRow
          v-if="!acting.format.default"
          icon="lucide-check"
          title="Usar como predeterminado"
          :subtitle="
            acting.format.disabled
              ? 'Está apagado: enciéndelo antes de usarlo.'
              : acting.format.broken
                ? 'Está dañado: arréglalo antes de usarlo.'
                : `Sale primero al imprimir ${noun(acting.group)}`
          "
          v-bind="
            acting.format.disabled || acting.format.broken
              ? {}
              : { onClick: () => (confirming = true) }
          "
        />
        <p
          v-else
          class="px-4 py-3 text-base text-ink-gray-7"
          data-testid="impresion-ya-predeterminado"
        >
          Ya es el predeterminado de {{ noun(acting.group) }}.
        </p>
      </template>
      <p v-else-if="acting" class="text-base text-ink-gray-7">
        Al imprimir {{ noun(acting.group) }}, este formato sale primero. Los
        demás siguen a la mano.
      </p>
      <template v-if="confirming" #actions>
        <button
          type="button"
          :class="BTN.filled"
          :disabled="saving"
          data-testid="impresion-confirmar-predeterminado"
          @click="makeDefault"
        >
          {{ saving ? 'Guardando…' : 'Usar este formato' }}
        </button>
        <button
          type="button"
          :class="BTN.text"
          :disabled="saving"
          @click="confirming = false"
        >
          Cancelar
        </button>
      </template>
    </BottomSheet>
  </div>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { toast } from 'frappe-ui'
import {
  AppBar,
  BottomSheet,
  EmptyState,
  ListRow,
  StatusChip,
} from '@/components/ui'
import { isMobile as isPhone } from '@/composables/breakpoint'
import { errorText } from '@/documentos/api'
import { BTN } from '@/documentos/tools'
import { impresionApi, isDenied, lastGroups } from '@/components/impresion/api'
import {
  filterGroups,
  formatSubtitle,
  groupTitle,
  kindIcon,
} from '@/components/impresion/impresion'

// Below 360px: the shorter title fits the bar on one line (the shared AppBar
// wraps titles to two lines by design), and the pill joins the subtitle row.
const narrow = useMediaQuery('(max-width: 359px)')
// «Dañado» wins over «Predeterminado»: a default that fails is the news.
const pillOf = (format) =>
  format.broken
    ? { label: 'Dañado', tone: 'danger' }
    : format.default
      ? { label: 'Predeterminado', tone: 'success' }
      : null

const loading = ref(false)
const error = ref('')
const denied = ref(false)
// Back from a format the list is already there: it paints at once, then refreshes.
const groups = ref(lastGroups.value || [])
const query = ref('')
const searchOpen = ref(false)
const acting = ref(null)
const confirming = ref(false)
const saving = ref(false)

const shown = computed(() => filterGroups(groups.value, query.value))
const confirmTitle = computed(() =>
  acting.value
    ? `¿Usar «${acting.value.format.label}» como predeterminado?`
    : '',
)

/** «una factura», «una cotización»… in the sheet's sentences. */
function noun(group) {
  const title = groupTitle(group).toLowerCase()
  // The first word carries the gender: «nota de venta», «solicitud de material».
  const head = title.split(' ')[0]
  return /(a|ón|d)$/.test(head) ? `una ${title}` : `un ${title}`
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const out = (await impresionApi('formatos'))?.groups || []
    groups.value = out
    lastGroups.value = out
    denied.value = false
  } catch (e) {
    denied.value = isDenied(e)
    error.value = denied.value
      ? errorText(e) || 'Pídele al dueño que elija los formatos de impresión.'
      : errorText(e)
  } finally {
    loading.value = false
  }
}

function openActions(group, format) {
  acting.value = { group, format }
  confirming.value = false
}
function closeActions() {
  acting.value = null
  confirming.value = false
}

async function makeDefault() {
  const { group, format } = acting.value || {}
  if (!format) return
  saving.value = true
  try {
    await impresionApi('predeterminar', {
      doctype: group.doctype,
      formato: format.name,
    })
    toast.success(`«${format.label}» sale primero en ${groupTitle(group)}.`)
    closeActions()
    await load()
  } catch (e) {
    toast.error(errorText(e))
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>
