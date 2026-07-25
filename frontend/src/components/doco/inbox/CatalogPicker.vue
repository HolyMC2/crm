<!--
  Catalog picker (#catalog). Opened by the /cat command or the 📦 button in a composer.
  Search in-stock items (foto · $precio · stock), multi-select, and send each as its own
  media message into the active conversation. Live data; manual (operator-triggered) send.
-->
<template>
  <div class="fixed inset-0 z-40 flex items-end justify-center sm:items-center" @click.self="closeCatalog">
    <div class="absolute inset-0 bg-black/30" />
    <div
      class="relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface-white shadow-xl dark:bg-surface-gray-1 sm:max-h-[80vh] sm:w-[560px] sm:rounded-2xl"
    >
      <!-- header + search -->
      <div class="flex-none border-b border-outline-gray-1 px-4 pb-3 pt-3.5">
        <div class="mb-2.5 flex items-center justify-between">
          <div class="text-[14px] font-bold text-ink-gray-9">📦 {{ __('Catálogo') }}</div>
          <button class="text-ink-gray-4 hover:text-ink-gray-9" :aria-label="__('Cerrar')" @click="closeCatalog">✕</button>
        </div>
        <div class="flex items-center gap-2 rounded-[9px] border border-outline-gray-2 px-2.5 py-[7px]">
          <LucideSearch class="h-3.5 w-3.5 text-ink-gray-4" />
          <input
            ref="searchRef"
            :value="catalogQuery"
            @input="onCatalogQuery($event.target.value)"
            :placeholder="__('Buscar artículo… (p.ej. fundas iphone 11)')"
            class="w-full border-0 bg-transparent text-[13px] text-ink-gray-8 placeholder:text-ink-gray-4 focus:outline-none focus:ring-0"
          />
        </div>
      </div>

      <!-- results grid -->
      <div class="scb flex-1 overflow-y-auto px-3 py-3">
        <div v-if="catalogResults.loading" class="py-10 text-center text-[12px] text-ink-gray-4">{{ __('Buscando…') }}</div>
        <div v-else-if="catalogResults.error" class="py-10 text-center text-[12px] text-ink-red-3">
          {{ __('No se pudo buscar.') }}
          <button class="ml-1 font-semibold underline" @click="runCatalogSearch">{{ __('Reintentar') }}</button>
        </div>
        <div v-else-if="!rows.length" class="py-10 text-center text-[12px] text-ink-gray-4">
          {{ catalogQuery ? __('Sin resultados — prueba con menos palabras.') : __('Escribe para buscar en el catálogo.') }}
        </div>
        <div v-else class="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <button
            v-for="r in rows"
            :key="r.item_code"
            class="group relative flex flex-col overflow-hidden rounded-xl border bg-surface-white text-left transition dark:bg-surface-gray-2"
            :class="selected.has(r.item_code) ? 'border-outline-green-2 ring-2 ring-outline-green-2' : 'border-outline-gray-2 hover:border-outline-gray-3'"
            @click="toggle(r.item_code)"
          >
            <div class="relative aspect-square w-full bg-surface-gray-2 dark:bg-surface-gray-3">
              <img
                v-if="r.image_url && !failed.has(r.item_code)"
                :src="r.image_url"
                :alt="r.item_name"
                class="h-full w-full object-cover"
                loading="lazy"
                @error="failed.add(r.item_code)"
              />
              <div v-else class="flex h-full w-full items-center justify-center text-ink-gray-4"><LucideImageOff class="h-6 w-6" /></div>
              <span
                v-if="selected.has(r.item_code)"
                class="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style="background: #16a34a"
              >✓</span>
              <span
                class="absolute bottom-1.5 left-1.5 rounded px-1.5 py-0.5 text-[9.5px] font-semibold"
                :class="r.stock > 0 ? 'text-ink-green-3 bg-surface-green-2' : 'text-ink-red-4 bg-surface-red-1'"
              >{{ r.stock }} {{ __('stock') }}</span>
            </div>
            <div class="flex min-h-0 flex-col gap-0.5 p-2">
              <div class="line-clamp-2 text-[11.5px] font-medium leading-tight text-ink-gray-8">{{ r.item_name }}</div>
              <div class="text-[12.5px] font-bold text-ink-gray-9">{{ r.price != null ? formatMoney(r.price, r.currency) : __('Consultar') }}</div>
            </div>
          </button>
        </div>
      </div>

      <!-- footer -->
      <div class="flex flex-none items-center justify-between gap-2 border-t border-outline-gray-1 px-4 py-3">
        <div class="text-[12px] text-ink-gray-6">{{ selected.size }} {{ __('seleccionados') }}</div>
        <div class="flex items-center gap-2">
          <!-- ERP spec P2.1: picked items → draft Quotation lines on the deal -->
          <!-- single pick → draft into the composer for edit-before-send (Marco 07-25) -->
          <button
            v-if="selected.size === 1"
            class="rounded-lg border border-outline-gray-2 bg-surface-gray-2 px-3 py-2 text-[13px] font-semibold text-ink-gray-8"
            :title="__('Poner en el mensaje para editar antes de enviar')"
            @click="editSend"
          >
            ✏️ {{ __('Editar y enviar') }}
          </button>
          <button
            v-if="canQuote"
            class="rounded-lg border border-outline-gray-2 bg-surface-gray-2 px-3 py-2 text-[13px] font-semibold text-ink-gray-8 disabled:opacity-50"
            :disabled="busy || !selected.size"
            :title="__('Agregar a la cotización del trato')"
            @click="quote"
          >
            🧾 {{ __('Cotizar') }}
          </button>
          <button
            class="rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
            style="background: #16a34a"
            :disabled="busy || !selected.size"
            @click="send"
          >
            {{ busy ? '…' : __('Enviar {0} al chat', [selected.size]) }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive, nextTick, onMounted } from 'vue'
import { toast } from 'frappe-ui'
import { formatMoney } from '@/composables/crmFormat'
import LucideSearch from '~icons/lucide/search'
import LucideImageOff from '~icons/lucide/image-off'
import {
  setComposerDraft,
  catalogResults,
  catalogQuery,
  onCatalogQuery,
  runCatalogSearch,
  closeCatalog,
  sendCatalogItems,
  catalogCtx,
  salesDocsEnabled,
} from '@/composables/inbox'
import { addItemsToQuotation } from '@/composables/salesDocs'

const emit = defineEmits(['sent', 'quoted'])
const rows = computed(() => catalogResults.data || [])
const selected = reactive(new Set())
const failed = reactive(new Set()) // item_codes whose image 404'd → show the placeholder
const busy = ref(false)
const searchRef = ref(null)

onMounted(() => nextTick(() => searchRef.value?.focus()))

function toggle(code) {
  if (selected.has(code)) selected.delete(code)
  else selected.add(code)
}

function editSend() {
  const code = [...selected][0]
  const r = rows.value.find((x) => x.item_code === code)
  if (!r) return
  const price = r.price != null ? formatMoney(r.price, r.currency) : __('Precio a consultar')
  setComposerDraft({
    text: `*${r.item_name}*\n${price}`,
    attach: r.image_url || '',
    content_type: 'image',
    canned: 'catalogo',
  })
  closeCatalog()
}

async function send() {
  if (!selected.size) return
  busy.value = true
  try {
    const res = await sendCatalogItems([...selected])
    const n = res?.sent_count || 0
    if (n) toast.success(__('{0} artículos enviados', [n]))
    if (res?.skipped?.length) toast.error(__('{0} no se pudieron enviar', [res.skipped.length]))
    emit('sent')
    closeCatalog()
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo enviar el catálogo'))
  } finally {
    busy.value = false
  }
}

// «Cotizar» only makes sense on a deal conversation (orphans/comments have no deal)
const canQuote = computed(
  () => salesDocsEnabled.value && catalogCtx.value?.reference_doctype === 'CRM Deal' && catalogCtx.value?.reference_name,
)

async function quote() {
  if (!selected.size) return
  busy.value = true
  try {
    const out = await addItemsToQuotation(
      catalogCtx.value.reference_name,
      [...selected].map((c) => ({ item_code: c, qty: 1 })),
    )
    toast.success(__('Cotización {0} · {1} líneas', [out.quotation, out.lines.length]))
    for (const w of out.warnings || []) toast.error(w)
    emit('quoted', out.quotation)
    closeCatalog()
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo cotizar'))
  } finally {
    busy.value = false
  }
}
</script>
