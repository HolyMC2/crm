<!--
  `/` command palette. The parent composer owns the state (useSlashMenu) and
  passes the RANKED items; this component only renders the list, the preview
  of the highlighted item and, in `searchable` mode (email), its own filter
  input. Anchor it inside a `relative` box: it opens above that box, full width
  on phones with the preview stacked under the list.
-->
<template>
  <div
    class="absolute inset-x-2 bottom-full z-40 mb-1 flex max-h-[60vh] flex-col overflow-hidden rounded-xl border border-outline-gray-2 bg-surface-base shadow-xl sm:left-10 sm:right-auto sm:w-[44rem] sm:max-w-[calc(100%-5rem)] sm:flex-row"
    @mousedown.prevent
  >
    <div class="flex min-h-0 min-w-0 flex-col sm:w-1/2">
      <div
        v-if="searchable"
        class="flex items-center gap-1.5 border-b border-outline-gray-1 px-2.5 py-2"
      >
        <span class="text-sm font-semibold text-ink-gray-5">/</span>
        <input
          ref="searchInput"
          :value="query"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          :aria-expanded="true"
          :aria-controls="listId"
          :aria-activedescendant="activeId"
          class="w-full border-none bg-transparent p-0 text-sm text-ink-gray-8 placeholder-ink-gray-4 focus:ring-0"
          :placeholder="__('Buscar comando o plantilla…')"
          @input="emit('update:query', $event.target.value)"
          @keydown="emit('keydown', $event)"
          @blur="emit('blur')"
          @mousedown.stop
        />
      </div>
      <ul
        :id="listId"
        role="listbox"
        :aria-label="__('Comandos')"
        :aria-activedescendant="searchable ? undefined : activeId"
        class="min-h-0 flex-1 overflow-y-auto p-1"
      >
        <li
          v-if="loading && !items.length"
          class="px-2.5 py-3 text-center text-xs text-ink-gray-4"
        >
          {{ __('Cargando…') }}
        </li>
        <li
          v-else-if="!items.length"
          class="px-2.5 py-3 text-center text-xs text-ink-gray-4"
        >
          {{ __('Sin coincidencias') }}
        </li>
        <li
          v-for="(item, i) in items"
          :id="optionId(i)"
          :key="item.id"
          role="option"
          :aria-selected="i === activeIndex"
          :aria-disabled="!item.available || undefined"
          class="flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-1.5"
          :class="[
            i === activeIndex ? 'bg-surface-gray-2' : 'hover:bg-surface-gray-1',
            item.available ? '' : 'opacity-50',
          ]"
          @mouseenter="emit('hover', i)"
          @click="emit('pick', item)"
        >
          <component
            :is="iconFor(item)"
            class="mt-0.5 size-4 flex-none text-ink-gray-5"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-1.5">
              <span class="truncate text-sm font-medium text-ink-gray-8">{{
                item.label
              }}</span>
              <span
                v-if="item.shortcut"
                class="flex-none rounded bg-surface-gray-2 px-1 font-mono text-[11px] text-ink-gray-6"
                >/{{ item.shortcut }}</span
              >
            </span>
            <span
              v-if="item.reason || item.hint"
              class="block truncate text-xs text-ink-gray-5"
              >{{ item.reason || item.hint }}</span
            >
          </span>
        </li>
      </ul>
      <div
        class="hidden border-t border-outline-gray-1 px-2.5 py-1 text-[11px] text-ink-gray-4 sm:block"
      >
        {{ __('↑↓ para moverte · Enter o Tab para elegir · Esc para cerrar') }}
      </div>
    </div>

    <!-- preview -->
    <div
      v-if="active"
      class="max-h-48 min-w-0 overflow-y-auto border-t border-outline-gray-1 bg-surface-gray-1 p-3 sm:max-h-none sm:w-1/2 sm:border-l sm:border-t-0"
      aria-live="polite"
    >
      <div
        class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-gray-5"
      >
        {{ previewTitle }}
      </div>
      <p
        v-if="!active.available"
        class="rounded-md bg-surface-amber-1 p-2 text-xs text-ink-amber-7"
      >
        {{ active.reason || __('No disponible en esta conversación.') }}
      </p>
      <template v-else-if="active.payload.kind === 'document'">
        <div v-if="newestDoc" class="space-y-1 text-sm">
          <div class="font-medium text-ink-gray-8">
            {{ newestDoc.title || newestDoc.name }}
          </div>
          <div class="text-xs text-ink-gray-5">
            {{ newestDoc.name }}
            <template v-if="newestDoc.status">
              · {{ newestDoc.status }}</template
            >
            <template v-if="newestDoc.date"> · {{ newestDoc.date }}</template>
          </div>
          <div
            v-if="newestDoc.total_label"
            class="text-sm font-semibold text-ink-gray-8"
          >
            {{ newestDoc.total_label }}
          </div>
          <div v-if="docCount > 1" class="text-xs text-ink-gray-5">
            {{ __('{0} documentos en este trato', [docCount]) }}
          </div>
        </div>
        <div v-else class="text-xs text-ink-gray-5">
          {{ __('Elige el documento en el siguiente paso.') }}
        </div>
        <div v-if="previewLoading" class="mt-2 text-xs text-ink-gray-4">
          {{ __('Preparando mensaje…') }}
        </div>
        <div
          v-else-if="docPreview?.caption"
          class="mt-2 whitespace-pre-wrap rounded-lg bg-surface-base p-2 text-xs text-ink-gray-7"
        >
          {{ docPreview.caption }}
        </div>
        <p
          v-for="(w, i) in docPreview?.warnings || []"
          :key="i"
          class="mt-1 text-xs text-ink-amber-7"
        >
          ⚠ {{ w }}
        </p>
      </template>
      <template v-else-if="['template', 'meta'].includes(active.type)">
        <div v-if="previewLoading" class="text-xs text-ink-gray-4">
          {{ __('Preparando mensaje…') }}
        </div>
        <div v-else class="whitespace-pre-wrap text-xs text-ink-gray-7">
          {{ renderedText }}
        </div>
      </template>
      <div
        v-else-if="active.type === 'quick'"
        class="whitespace-pre-wrap text-xs text-ink-gray-7"
      >
        {{ active.payload.text }}
      </div>
      <p v-else class="text-xs text-ink-gray-6">{{ commandHelp }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import LucideFileText from '~icons/lucide/file-text'
import LucidePackage from '~icons/lucide/package'
import LucideList from '~icons/lucide/list'
import LucideSave from '~icons/lucide/save'
import LucideMessageSquareText from '~icons/lucide/message-square-text'
import LucideZap from '~icons/lucide/zap'
import LucideBadgeCheck from '~icons/lucide/badge-check'
import {
  previewDocument,
  renderTemplate,
  sortDocuments,
} from '@/composables/composerCommands'

const props = defineProps({
  items: { type: Array, default: () => [] },
  activeIndex: { type: Number, default: 0 },
  loading: { type: Boolean, default: false },
  searchable: { type: Boolean, default: false },
  query: { type: String, default: '' },
  catalog: { type: Object, default: null },
  referenceDoctype: { type: String, default: '' },
  referenceName: { type: String, default: '' },
  channel: { type: String, default: 'whatsapp' },
})
const emit = defineEmits(['pick', 'hover', 'update:query', 'keydown', 'blur'])

const uid = `slash-${Math.random().toString(36).slice(2, 8)}`
const listId = `${uid}-list`
const optionId = (i) => `${uid}-opt-${i}`
const activeId = computed(() =>
  props.items.length ? optionId(props.activeIndex) : undefined,
)
const active = computed(() => props.items[props.activeIndex] || null)

const searchInput = ref(null)
watch(
  () => props.activeIndex,
  (i) =>
    nextTick(() =>
      document
        .getElementById(optionId(i))
        ?.scrollIntoView?.({ block: 'nearest' }),
    ),
)
function focus() {
  nextTick(() => searchInput.value?.focus())
}

function iconFor(item) {
  if (item.type === 'quick') return LucideZap
  if (item.type === 'meta') return LucideBadgeCheck
  if (item.type === 'template') return LucideMessageSquareText
  const kind = item.payload?.kind
  if (kind === 'catalog') return LucidePackage
  if (kind === 'templates') return LucideList
  if (kind === 'save_template') return LucideSave
  return LucideFileText
}

const previewTitle = computed(() => {
  const a = active.value
  if (!a) return ''
  if (a.type === 'quick') return __('Respuesta rápida')
  if (a.type === 'meta') return __('Plantilla de WhatsApp')
  if (a.type === 'template') return __('Plantilla')
  if (a.payload?.kind === 'document') return __('Documento')
  return __('Comando')
})

const commandHelp = computed(() => {
  const kind = active.value?.payload?.kind
  if (kind === 'catalog')
    return __('Abre el catálogo para enviar productos con foto y precio.')
  if (kind === 'templates')
    return __('Muestra solo las plantillas y respuestas guardadas.')
  if (kind === 'save_template')
    return __('Guarda el texto que escribiste como plantilla con atajo.')
  return active.value?.hint || ''
})

// ── document preview ─────────────────────────────────────────────────────────
const docs = computed(() => {
  const dt = active.value?.payload?.doctype
  return dt ? sortDocuments(props.catalog?.documents?.[dt]) : []
})
const newestDoc = computed(() => docs.value[0] || null)
const docCount = computed(
  () => active.value?.payload?.count ?? docs.value.length,
)

const docPreview = ref(null)
const renderedText = ref('')
const previewLoading = ref(false)
let timer = null
let seq = 0

function schedulePreview() {
  clearTimeout(timer)
  docPreview.value = null
  previewLoading.value = false
  const a = active.value
  if (!a || !a.available) return
  const isDoc = a.payload?.kind === 'document' && newestDoc.value
  const isTpl = a.type === 'template' || a.type === 'meta'
  if (isTpl) renderedText.value = a.payload.body || ''
  if (!isDoc && !isTpl) return
  if (!props.referenceDoctype || !props.referenceName) return
  const mine = ++seq
  previewLoading.value = true
  timer = setTimeout(async () => {
    try {
      if (isDoc) {
        const r = await previewDocument({
          referenceDoctype: props.referenceDoctype,
          referenceName: props.referenceName,
          doctype: a.payload.doctype,
          docname: newestDoc.value.name,
          channel: props.channel,
        })
        if (mine === seq) docPreview.value = r
      } else {
        const r = await renderTemplate(
          a.payload,
          props.referenceDoctype,
          props.referenceName,
        )
        if (mine === seq) renderedText.value = r.text
      }
    } finally {
      if (mine === seq) previewLoading.value = false
    }
  }, 220)
}
watch(() => active.value?.id, schedulePreview, { immediate: true })
onBeforeUnmount(() => clearTimeout(timer))

defineExpose({ focus })
</script>
