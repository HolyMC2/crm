<template>
  <!-- One email (Shell D12): the record it belongs to on top (Gmail's summary
       card), who and when, the message, its files and conversation; Responder
       and Vincular a un documento at the bottom, in thumb reach. min-w-0
       flex-1: the screen width inside the shell's <main> row, not the width
       of the longest nowrap line. -->
  <div class="flex h-full min-w-0 flex-1 flex-col">
    <AppBar
      v-if="!pane && isPhone"
      :back="{ path: '/correo' }"
      back-label="Correo"
      :title="m?.asunto || 'Correo'"
      :loading="loading"
    />
    <div class="min-h-0 flex-1 overflow-y-auto">
      <EmptyState
        v-if="loading && !m"
        state="loading"
        title="Abriendo el correo…"
      />
      <EmptyState
        v-else-if="error && !m"
        state="error"
        title="No se pudo abrir el correo"
        :message="error"
        action="Reintentar"
        @action="load"
      />
      <article
        v-else-if="m"
        class="mx-auto w-full max-w-3xl space-y-4 px-4 pb-6 pt-3"
        data-testid="correo-mensaje"
      >
        <div v-if="pane || !isPhone" class="flex items-start gap-2">
          <h1
            class="min-w-0 flex-1 break-words text-xl font-semibold text-ink-gray-9"
          >
            {{ m.asunto }}
          </h1>
          <RouterLink
            v-if="pane"
            :to="{ path: `/correo/${encodeURIComponent(m.name)}` }"
            class="flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
            aria-label="Abrir solo este correo"
          >
            <span class="lucide-external-link size-5" aria-hidden="true" />
          </RouterLink>
        </div>

        <!-- The record it belongs to -->
        <component
          :is="docTo ? RouterLink : 'div'"
          v-if="m.documento"
          v-bind="docTo ? { to: docTo } : {}"
          class="block rounded-2xl border border-outline-gray-2 bg-surface-gray-1 p-4"
          :class="docTo ? 'hover:bg-surface-gray-2' : ''"
          data-testid="correo-tarjeta"
        >
          <span class="block text-sm text-ink-gray-6"
            >{{ m.documento.etiqueta }} · {{ m.documento.nombre }}</span
          >
          <span
            class="block break-words text-lg font-semibold leading-snug text-ink-gray-9"
            >{{ m.documento.titulo || m.documento.etiqueta }}</span
          >
          <span
            v-if="m.documento.estado || m.documento.total"
            class="mt-2 flex flex-wrap items-center gap-2"
          >
            <StatusChip
              v-if="m.documento.estado"
              :status="m.documento.estado"
            />
            <span
              v-if="m.documento.total"
              class="text-base-medium tabular-nums text-ink-gray-9"
              >{{
                formatMoney(m.documento.total, m.documento.moneda || 'MXN')
              }}</span
            >
          </span>
          <span
            v-if="docTo"
            class="mt-3 inline-flex min-h-11 items-center rounded-full bg-surface-gray-3 px-4 text-base-medium text-ink-gray-9"
            >Abrir {{ m.documento.etiqueta.toLowerCase() }}</span
          >
        </component>

        <!-- Who and when -->
        <ListRow
          class="-mx-4"
          :avatar="isSystem(m.de) ? undefined : senderName(m.de)"
          :icon="isSystem(m.de) ? 'lucide-bell' : ''"
          :title="senderName(m.de)"
          :subtitle="toLine"
          :meta="formatDateTime(m.fecha)"
          strong
        />

        <!-- The message: HTML in a sandboxed sheet of paper, text as text -->
        <div
          v-if="m.html"
          class="overflow-hidden rounded-xl border border-outline-gray-2"
        >
          <iframe
            ref="frame"
            :srcdoc="srcdoc"
            sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            title="Contenido del correo"
            class="block h-40 w-full"
            data-testid="correo-cuerpo-html"
            @load="fit"
          />
        </div>
        <p
          v-else
          class="whitespace-pre-line break-words text-base text-ink-gray-9"
        >
          {{ m.texto || 'Este correo no tiene texto.' }}
        </p>

        <p
          v-if="m.pdf_enviado"
          class="flex items-center gap-2 text-base text-ink-gray-8"
          data-testid="correo-pdf-enviado"
        >
          <span
            class="lucide-paperclip size-4 flex-none text-ink-gray-6"
            aria-hidden="true"
          />
          <span class="min-w-0 break-words"
            >Adjunto: {{ m.pdf_enviado.nombre }}
            <span class="text-ink-gray-6"
              >· {{ formatLabel(m.pdf_enviado.formato) }}</span
            ></span
          >
        </p>

        <section v-if="m.adjuntos?.length" aria-labelledby="correo-adjuntos">
          <h2
            id="correo-adjuntos"
            class="pb-1 text-base font-semibold text-ink-gray-9"
          >
            Adjuntos ({{ m.adjuntos.length }})
          </h2>
          <ul class="-mx-4">
            <li v-for="f in m.adjuntos" :key="f.name">
              <ListRow
                icon="lucide-paperclip"
                :href="f.url"
                :title="f.nombre"
                :subtitle="fileSize(f.tamano)"
                target="_blank"
                rel="noopener"
              />
            </li>
          </ul>
        </section>

        <section v-if="m.hilo?.length" aria-labelledby="correo-conversacion">
          <h2
            id="correo-conversacion"
            class="pb-1 text-base font-semibold text-ink-gray-9"
          >
            En esta conversación
          </h2>
          <ul class="-mx-4 divide-y divide-outline-gray-1">
            <li v-for="c in m.hilo" :key="c.name">
              <ListRow
                :to="{ path: `/correo/${encodeURIComponent(c.name)}` }"
                :avatar="isSystem(c.de) ? undefined : senderName(c.de)"
                :icon="isSystem(c.de) ? 'lucide-bell' : ''"
                :title="senderName(c.de)"
                :subtitle="c.snippet || c.asunto"
                :meta="shortWhen(c.fecha)"
              />
            </li>
          </ul>
        </section>
      </article>
    </div>

    <!-- Responder · Vincular a un documento -->
    <div
      v-if="m && (m.puede_responder || m.puede_vincular)"
      class="flex flex-none gap-2 border-t border-outline-gray-1 bg-surface-base px-4 py-3"
    >
      <button
        v-if="m.puede_responder"
        type="button"
        :class="PILL"
        data-testid="correo-responder"
        @click="replyOpen = true"
      >
        <svg
          viewBox="0 0 24 24"
          class="size-5 flex-none"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="9 17 4 12 9 7" />
          <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
        </svg>
        Responder
      </button>
      <button
        v-if="m.puede_vincular"
        type="button"
        :class="PILL"
        data-testid="correo-vincular"
        @click="openLink"
      >
        <span class="lucide-link size-5 flex-none" aria-hidden="true" />
        <span class="truncate">{{
          m.documento ? 'Vincular a otro' : 'Vincular a un documento'
        }}</span>
      </button>
    </div>

    <CorreoSheet
      v-if="m && replyOpen"
      v-model:open="replyOpen"
      :doctype="m.responder.doctype"
      :name="m.responder.name"
      :title="m.documento?.titulo || ''"
      :reply="{
        para: m.responder.para,
        asunto: m.responder.asunto,
        en_respuesta_a: m.name,
      }"
      @sent="load"
    />

    <BottomSheet
      v-model:open="linkOpen"
      :title="linkChoice ? '¿Vincular este correo?' : 'Vincular a un documento'"
      :subtitle="linkChoice ? '' : 'Busca por número o por cliente'"
      :flush="!linkChoice"
      :dismissible="!linking"
    >
      <template v-if="!linkChoice" #header>
        <label class="relative block">
          <span class="sr-only">Buscar documento</span>
          <span
            class="lucide-search pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-gray-6"
            aria-hidden="true"
          />
          <input
            ref="linkInput"
            v-model="linkTerm"
            type="search"
            enterkeyhint="search"
            class="h-12 w-full rounded-full border-0 bg-surface-gray-2 pl-10 pr-4 text-base text-ink-gray-9 [&::-webkit-search-cancel-button]:hidden"
            placeholder="Factura, pedido, cliente…"
            data-testid="correo-vincular-buscar"
            @input="searchDocs"
          />
        </label>
      </template>
      <template v-if="!linkChoice">
        <p v-if="searching" class="px-5 py-3 text-base text-ink-gray-6">
          Buscando…
        </p>
        <p
          v-else-if="linkTerm.trim().length < 2"
          class="px-5 py-3 text-base text-ink-gray-6"
        >
          Escribe al menos dos letras o números del documento.
        </p>
        <p
          v-else-if="!found.length"
          class="px-5 py-3 text-base text-ink-gray-6"
        >
          No encontramos documentos con «{{ linkTerm.trim() }}».
        </p>
        <ul v-else class="pb-2">
          <li v-for="item in found" :key="item.id">
            <ListRow
              :icon="item.icon"
              :title="item.title"
              :subtitle="item.subtitle"
              @click="linkChoice = item"
            />
          </li>
        </ul>
      </template>
      <div v-else class="space-y-2">
        <p class="text-base text-ink-gray-9">
          Este correo quedará en la actividad de
          <strong class="font-semibold">{{ linkChoice.title }}</strong>
          <span class="text-ink-gray-6"> · {{ linkChoice.subtitle }}</span
          >.
        </p>
        <p v-if="linkError" role="alert" class="text-base text-ink-red-7">
          {{ linkError }}
        </p>
      </div>
      <template v-if="linkChoice" #actions>
        <button
          type="button"
          :class="BTN.text"
          :disabled="linking"
          @click="linkChoice = null"
        >
          Cambiar
        </button>
        <button
          type="button"
          :class="BTN.filled"
          :disabled="linking"
          data-testid="correo-vincular-confirmar"
          @click="doLink"
        >
          {{ linking ? 'Vinculando…' : 'Vincular' }}
        </button>
      </template>
    </BottomSheet>
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useDebounceFn } from '@vueuse/core'
import { toast } from 'frappe-ui'
import {
  AppBar,
  BottomSheet,
  EmptyState,
  ListRow,
  StatusChip,
} from '@/components/ui'
import { isMobile as isPhone } from '@/composables/breakpoint'
import { shellBoot } from '@/composables/muelleShell'
import { BTN } from '@/documentos/tools'
import { documentItem } from '@/documentos/palette'
import { formatDateTime, formatMoney } from '@/utils/display'
import {
  buscarDocumentos,
  documentTo,
  errorText,
  isSystem,
  marcarLeido,
  mensaje,
  senderName,
  shortWhen,
  vincular,
} from '@/components/correo/correo'

const CorreoSheet = defineAsyncComponent(
  () => import('@/components/correo/CorreoSheet.vue'),
)

const props = defineProps({
  /** The Communication; from the route when the page stands alone. */
  name: { type: String, default: '' },
  /** Shown beside the list (desktop Correo): no app bar of its own. */
  pane: { type: Boolean, default: false },
})
const emit = defineEmits(['changed', 'close'])

const PILL =
  'inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full border border-outline-gray-2 px-4 text-base-medium text-ink-gray-8 hover:bg-surface-gray-1'

const route = useRoute()
const id = computed(() => props.name || String(route.params.name || ''))
const m = ref(null)
const loading = ref(false)
const error = ref('')
const frame = ref(null)
const replyOpen = ref(false)

const docTo = computed(() => documentTo(m.value?.documento, shellBoot.value))
const toLine = computed(() => {
  const people = (m.value?.para || []).map((p) => p.nombre || p.correo)
  if (!people.length) return ''
  const cc = (m.value?.cc || []).length
  return `Para ${people.join(', ')}${cc ? ` · ${cc} en copia` : ''}`
})
// A sans stack that never starts with `system-ui`: on Linux (and headless
// Chrome) fontconfig answers `system-ui` with whatever it has first, a narrow
// or serif face; phones still get Roboto / San Francisco.
const MAIL_FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'Noto Sans','Liberation Sans',sans-serif"
const formatLabel = (f) => (!f || f === 'Standard' ? 'Estándar' : f)
const srcdoc = computed(
  () => `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; font-src data: https:">
<base target="_blank">
<style>html,body{margin:0;background:#fff;color:#1f1f1f}body{padding:14px;font:16px/1.5 ${MAIL_FONT};overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}a{color:#0b57d0}</style>
</head><body>${m.value?.html || ''}</body></html>`,
)

function fileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

let observer = null
function fit() {
  const el = frame.value
  const doc = el?.contentDocument
  if (!el || !doc) return
  const set = () => {
    el.style.height = `${doc.documentElement.scrollHeight + 2}px`
  }
  set()
  observer?.disconnect()
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(set)
    observer.observe(doc.body)
  }
}

async function load() {
  if (!id.value) return
  loading.value = true
  error.value = ''
  try {
    m.value = await mensaje(id.value)
    if (m.value && !m.value.leido && m.value.puede_marcar) {
      marcarLeido(m.value.name)
        .then(() => {
          m.value.leido = true
          emit('changed', { name: m.value.name, leido: true })
        })
        .catch(() => {})
    }
  } catch (e) {
    error.value = errorText(e)
  } finally {
    loading.value = false
  }
}

watch(id, load, { immediate: true })

// ── Vincular a un documento ──
const linkOpen = ref(false)
const linkTerm = ref('')
const linkInput = ref(null)
const found = ref([])
const searching = ref(false)
const linkChoice = ref(null)
const linking = ref(false)
const linkError = ref('')

function openLink() {
  linkChoice.value = null
  linkError.value = ''
  linkOpen.value = true
  nextTick(() => linkInput.value?.focus())
}

let searchTicket = 0
const searchDocs = useDebounceFn(async () => {
  const q = linkTerm.value.trim()
  const mine = ++searchTicket
  if (q.length < 2) {
    found.value = []
    return
  }
  searching.value = true
  try {
    const rows = (await buscarDocumentos(q)) || []
    if (mine === searchTicket)
      found.value = rows.map((row) => ({
        ...documentItem(row, shellBoot.value),
        doctype: row.doctype,
        name: row.name,
      }))
  } catch (e) {
    if (mine === searchTicket) found.value = []
    toast.error(errorText(e))
  } finally {
    if (mine === searchTicket) searching.value = false
  }
}, 300)

async function doLink() {
  if (!linkChoice.value || linking.value) return
  linking.value = true
  linkError.value = ''
  try {
    const out = await vincular(
      m.value.name,
      linkChoice.value.doctype,
      linkChoice.value.name,
    )
    m.value = { ...m.value, documento: out.documento }
    emit('changed', { name: m.value.name, documento: out.documento })
    toast.success(`Vinculado a ${linkChoice.value.title}`)
    linkOpen.value = false
  } catch (e) {
    linkError.value = errorText(e)
  } finally {
    linking.value = false
  }
}
</script>
