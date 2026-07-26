<!--
  "Sin asignar" workspace — shown when an orphan (unknown-number) WhatsApp
  conversation is selected. Read-only thread + a quick capture form that converts
  the number to a Lead, Deal, or Customer(+Contact). Fields map to real doctype
  fields server-side (assign_unassigned); a Deal/Lead then opens in the normal
  workspace, a Customer files under its Contact.
-->
<template>
  <div class="flex min-w-0 flex-1 flex-col">
    <CatalogPicker v-if="catalogOpen" @sent="onCatalogSent" />
    <!-- header (mobile: pinned so back stays reachable while scrolling the thread) -->
    <div
      class="flex h-[60px] flex-none items-center gap-2.5 border-b border-outline-gray-1 bg-surface-white px-4"
      :class="isMobile ? 'sticky top-0 z-20' : ''"
    >
      <button
        v-if="isMobile"
        class="-ml-1.5 flex h-9 w-7 flex-none items-center justify-center text-ink-gray-6 hover:text-ink-gray-9"
        :aria-label="__('Volver a la bandeja')"
        @click="mobileBack"
      >
        <LucideChevronLeft class="h-6 w-6" />
      </button>
      <img v-if="headerImage" :src="headerImage" class="h-9 w-9 flex-none rounded-full object-cover" alt="" />
      <span v-else-if="boundContact" class="flex h-9 w-9 flex-none items-center justify-center rounded-full text-sm font-semibold" style="color:#5b21b6;background:#ede9fe">
        {{ contactInitials }}
      </span>
      <span v-else class="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-surface-amber-1 text-ink-amber-3">
        <LucideMessageCircleQuestion class="h-5 w-5" />
      </span>
      <div class="min-w-0">
        <!-- When the number is bound to a Contact (linked, no open deal → stays here),
             show the person's name + data on top, like a Deal header. Else fall back to
             the WhatsApp profile name / raw number. -->
        <div class="flex items-center gap-1.5">
          <span class="truncate text-[15px] font-semibold text-ink-gray-9">
            {{ boundContact?.name || prefillName || (isMessenger ? __('Messenger') + ' · ' + (activeUnassigned || '').slice(-8) : formatPhone(activeUnassigned)) }}
          </span>
          <span v-if="boundContact" class="flex-none rounded px-1.5 py-0.5 text-[9.5px] font-semibold" style="color:#5b21b6;background:#ede9fe">{{ __('Contacto') }}</span>
        </div>
        <div v-if="boundContact" class="truncate text-[11px] font-medium text-ink-gray-5">
          {{ formatPhone(activeUnassigned) }}<template v-if="boundContact.email"> · {{ boundContact.email }}</template>
        </div>
        <div v-else class="text-[11px] font-medium" :class="isArchived ? 'text-ink-gray-5' : 'text-ink-amber-3'">
          {{ isArchived ? __('Archivado — sigue disponible') : __('Sin asignar — captura y convierte') }}
        </div>
      </div>

      <!-- Archive = "cerrar sin trato pero conservar". Leaves "Sin asignar"; the thread
           stays here in Archivados and a nuevo mensaje la reaparece sola. -->
      <button
        v-if="!isArchived"
        class="ml-auto flex flex-none items-center gap-1 rounded-md border border-outline-gray-2 px-2 py-1.5 text-[11.5px] font-semibold text-ink-gray-6 hover:bg-surface-gray-2 disabled:opacity-50"
        :disabled="busy"
        :title="__('Archivar sin crear lead/trato — seguirá disponible')"
        @click="onArchive"
      >
        <LucideArchive class="h-3.5 w-3.5" /> <span class="hidden sm:inline">{{ __('Archivar') }}</span>
      </button>
      <button
        v-else
        class="ml-auto flex flex-none items-center gap-1 rounded-md border border-outline-blue-2 bg-surface-blue-1 px-2 py-1.5 text-[11.5px] font-semibold text-ink-blue-3 hover:bg-surface-blue-2 disabled:opacity-50"
        :disabled="busy"
        @click="onUnarchive"
      >
        <LucideArchiveRestore class="h-3.5 w-3.5" /> <span class="hidden sm:inline">{{ __('Desarchivar') }}</span>
      </button>
    </div>

    <div class="flex min-h-0 flex-1" :class="isMobile ? 'flex-col' : ''">
      <!-- thread + reply bar -->
      <!-- mobile: the thread owns the screen (was crushed to 38vh above an
           always-visible form); the capture form moved to a bottom sheet -->
      <div
        class="flex min-h-0 flex-col border-outline-gray-1"
        :class="isMobile ? 'flex-1' : 'flex-1 border-r'"
      >
        <!-- Messenger orphans render through MessengerArea (reactions + referral chip +
             inline image attachments, identical to the assigned conversation). -->
        <MessengerArea v-if="isMessenger" :messages="messages" class="flex-1" />
        <div v-else class="scb flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4">
          <div v-if="unassignedThread.loading && !messages.length" class="py-8 text-center text-xs text-ink-gray-4">
            {{ __('Cargando…') }}
          </div>
          <div v-else-if="unassignedThread.error && !messages.length" class="py-8 text-center text-xs text-ink-red-3">
            {{ __('No se pudo cargar la conversación.') }}
            <button class="ml-1 font-semibold underline hover:text-ink-red-4" @click="unassignedThread.reload()">{{ __('Reintentar') }}</button>
          </div>
          <div v-else-if="!messages.length" class="py-8 text-center text-xs text-ink-gray-4">{{ __('Sin mensajes') }}</div>
          <!-- Reuse the real conversation renderer (templates, media, receipts, replies,
               provenance) — the same component the assigned deal thread uses, so an
               outbound Template (e.g. "orden recibida") shows its body instead of a blank
               bubble. WhatsAppArea's own contact header is suppressed (:contact empty);
               the workspace header above carries the identity. -->
          <WhatsAppArea
            v-else
            v-model="waList"
            v-model:reply="waReply"
            :messages="messages"
            :contact="{}"
          />
        </div>
        <!-- reply bar: chat the unknown number BEFORE deciding lead/deal/wrong number.
             Sends a reference-less WhatsApp message; it stays in this thread until
             you convert, then assign_unassigned re-points every message to the new
             record. replyOnly hides notes/comments/templates (no reference doc yet). -->
        <div class="flex-none border-t border-outline-gray-1">
          <WhatsAppBox
            v-if="!isMessenger"
            v-model="unassignedDoc"
            v-model:whatsapp="waModel"
            v-model:reply="waReply"
            :doctype="''"
            :to-override="activeUnassigned || ''"
            reply-only
            @catalog="onWaCatalog"
          />
          <!-- Messenger orphan: reply directly by PSID — no assignment needed (the
               PSID is the recipient). The row stays in this orphan thread and is
               re-pointed onto the record when you convert/link below. -->
          <div v-else class="flex items-end gap-2 px-3 py-2.5">
            <div class="flex h-8 items-center gap-2">
              <FileUploader @success="(file) => onMsgrFile(file)">
                <template #default="{ openFileSelector }">
                  <div class="flex items-center space-x-2">
                    <Dropdown :options="msgrUploadOptions(openFileSelector)">
                      <FeatherIcon name="plus" class="size-4.5 cursor-pointer text-ink-gray-5" />
                    </Dropdown>
                  </div>
                </template>
              </FileUploader>
              <IconPicker v-slot="{ togglePopover }" v-model="msgrEmoji" @update:modelValue="onMsgrEmoji">
                <SmileIcon
                  class="flex size-4.5 cursor-pointer rounded-sm text-xl leading-none text-ink-gray-4"
                  @click="togglePopover"
                />
              </IconPicker>
              <CannedReplyPicker channel="Messenger" @pick="onMsgrCanned" />
            </div>
            <textarea
              ref="msgrTextareaRef"
              v-model="msgrReply"
              rows="1"
              :placeholder="__('Responder por Messenger…')"
              class="scb max-h-28 flex-1 resize-none rounded-lg border border-outline-gray-2 px-2.5 py-2 text-[13px] text-ink-gray-8 placeholder:text-ink-gray-4 focus:outline-none focus:ring-1 focus:ring-outline-blue-2"
              @keydown.enter.exact.prevent="sendMsgr"
            />
            <button
              class="rounded-lg px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
              style="background: #0084ff"
              :disabled="busy || !msgrReply.trim()"
              @click="sendMsgr"
            >
              {{ __('Enviar') }}
            </button>
          </div>
        </div>
      </div>

      <!-- mobile CTA: opens the capture sheet (replaces the scroll-to-form UX) -->
      <div
        v-if="isMobile"
        class="flex flex-none gap-2 border-t border-outline-gray-1 bg-surface-white px-3 py-2 pb-[calc(env(safe-area-inset-bottom)+8px)]"
      >
        <button
          class="press flex-1 rounded-[10px] py-2.5 text-[13.5px] font-bold text-white"
          style="background: var(--brand)"
          @click="captureOpen = true"
        >
          {{ boundContact ? '✚ ' + __('Crear Trato') : '✚ ' + __('Capturar y convertir') }}
        </button>
      </div>

      <!-- backdrop for the mobile capture sheet -->
      <div
        v-if="isMobile && captureOpen"
        class="fixed inset-0 z-40 bg-black/40"
        @click="captureOpen = false"
      />
      <!-- capture form: docked 300px panel on desktop; bottom sheet on mobile -->
      <div
        v-show="!isMobile || captureOpen"
        class="scb flex flex-col overflow-y-auto bg-surface-white px-3.5 py-3.5"
        :class="
          isMobile
            ? 'sheet-in fixed inset-x-0 bottom-0 z-50 max-h-[82vh] rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+14px)] shadow-[0_-8px_32px_rgba(0,0,0,.18)]'
            : 'w-[300px] flex-none'
        "
      >
        <div v-if="isMobile" class="mx-auto mb-2 h-1 w-10 flex-none rounded-full bg-surface-gray-4" aria-hidden="true" />
        <div class="mb-2 flex items-center justify-between">
          <div class="text-[11px] font-bold uppercase tracking-[.08em] text-ink-gray-4">{{ __('Datos') }}</div>
          <button
            v-if="isMobile"
            class="press flex h-7 w-7 items-center justify-center rounded-lg text-ink-gray-5"
            :aria-label="__('Cerrar')"
            @click="captureOpen = false"
          >
            ✕
          </button>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <label class="block"><span class="text-[10px] font-medium text-ink-gray-5">{{ __('Nombre') }}</span>
            <input v-model="form.first_name" :class="inputCls" /></label>
          <label class="block"><span class="text-[10px] font-medium text-ink-gray-5">{{ __('Apellido') }}</span>
            <input v-model="form.last_name" :class="inputCls" /></label>
        </div>
        <label v-if="!isMessenger" class="mt-2 block"><span class="text-[10px] font-medium text-ink-gray-5">{{ __('Teléfono') }}</span>
          <input :value="formatPhone(activeUnassigned)" disabled :class="inputCls" /></label>
        <label class="mt-2 block"><span class="text-[10px] font-medium text-ink-gray-5">{{ __('Email') }}</span>
          <input v-model="form.email" type="email" :class="inputCls" /></label>
        <label class="mt-2 block"><span class="text-[10px] font-medium text-ink-gray-5">{{ __('Dispositivo / Empresa') }} <span class="text-ink-gray-4">({{ __('opcional') }})</span></span>
          <input v-model="form.device" :class="inputCls" /></label>

        <!-- Forecasting (only when CRM forecasting is on): a Deal then requires an
             expected value + closure date, else "Crear Trato" fails server-side. -->
        <div v-if="forecastingEnabled" class="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-outline-blue-2 bg-surface-blue-1 p-2">
          <label class="block"><span class="text-[10px] font-medium text-ink-gray-6">{{ __('Valor estimado') }} *</span>
            <input v-model="form.expected_deal_value" type="number" min="0" :class="inputCls" /></label>
          <label class="block"><span class="text-[10px] font-medium text-ink-gray-6">{{ __('Cierre estimado') }}</span>
            <input v-model="form.expected_closure_date" type="date" :class="inputCls" /></label>
        </div>

        <button v-if="!isMessenger" class="mt-3 flex items-center gap-1 text-[11px] font-semibold text-ink-gray-6" @click="showFiscal = !showFiscal">
          {{ showFiscal ? '▾' : '▸' }} {{ __('Datos fiscales') }} <span class="text-ink-gray-4">({{ __('opcional') }})</span>
        </button>
        <div v-if="showFiscal" class="mt-1.5 flex flex-col gap-2">
          <label class="block"><span class="text-[10px] font-medium text-ink-gray-5">{{ __('RFC') }}</span>
            <input v-model="form.rfc" :class="inputCls" /></label>
          <label class="block"><span class="text-[10px] font-medium text-ink-gray-5">{{ __('Razón social') }}</span>
            <input v-model="form.legal_name" :class="inputCls" /></label>
          <div class="grid grid-cols-2 gap-2">
            <label class="block"><span class="text-[10px] font-medium text-ink-gray-5">{{ __('Dirección') }}</span>
              <input v-model="form.address" :class="inputCls" /></label>
            <label class="block"><span class="text-[10px] font-medium text-ink-gray-5">{{ __('Ciudad') }}</span>
              <input v-model="form.city" :class="inputCls" /></label>
          </div>
          <label class="block"><span class="text-[10px] font-medium text-ink-gray-5">{{ __('Cumpleaños') }}</span>
            <input v-model="form.birth_date" type="date" :class="inputCls" /></label>
        </div>

        <div class="mt-4 flex flex-col gap-2">
          <button class="rounded-lg px-3 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50" style="background: var(--brand)" :disabled="busy" @click="convert('CRM Deal')">
            + {{ __('Crear Trato') }}
          </button>
          <div class="grid grid-cols-2 gap-2">
            <button class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2 disabled:opacity-50" :disabled="busy" @click="convert('CRM Lead')">
              + {{ __('Lead') }}
            </button>
            <button v-if="!isMessenger" class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2 disabled:opacity-50" :disabled="busy" @click="convert('Customer')">
              + {{ __('Cliente') }}
            </button>
          </div>
        </div>

        <!-- or LINK to an existing Contact / Lead / Deal (universal across channels) -->
        <div class="mt-4 border-t border-outline-gray-1 pt-3">
          <div class="mb-1 text-[11px] font-bold uppercase tracking-[.08em] text-ink-gray-4">{{ __('O vincular a existente') }}</div>

          <!-- auto-suggestions by name / number — surfaced, NEVER auto-linked -->
          <div v-if="suggestionRows.length" class="mb-2">
            <div class="mb-1 text-[10px] font-semibold text-ink-gray-5">✨ {{ __('Sugerencias') }}</div>
            <div class="flex flex-col gap-1">
              <button
                v-for="t in suggestionRows"
                :key="'s:' + t.doctype + ':' + t.name"
                class="flex items-center justify-between gap-2 rounded-md border border-outline-blue-2 bg-surface-blue-1 px-2.5 py-1.5 text-left text-[12px] hover:bg-surface-blue-2 disabled:opacity-50"
                :disabled="busy"
                @click="linkTo(t)"
              >
                <span class="min-w-0">
                  <span class="block truncate font-medium text-ink-gray-8">{{ t.label }}</span>
                  <span class="block truncate text-[10.5px] text-ink-gray-5">{{ t.reason }}<template v-if="t.sublabel"> · {{ t.sublabel }}</template></span>
                </span>
                <span class="flex-none rounded px-1.5 py-0.5 text-[10px] font-semibold" :style="docBadge(t.doctype)">{{ docLabel(t.doctype) }}</span>
              </button>
            </div>
          </div>

          <input v-model="linkQuery" :placeholder="__('Buscar contacto, Lead o Trato…')" :class="inputCls" @input="onSearch" />
          <div v-if="searching" class="mt-1.5 flex items-center gap-1.5 text-[11px] text-ink-gray-4">
            <FeatherIcon name="loader" class="h-3 w-3 animate-spin" /> {{ __('Buscando…') }}
          </div>
          <div v-else-if="linkResults.length" class="mt-1.5 flex flex-col gap-1">
            <div class="text-[10px] font-semibold text-ink-gray-5">🔎 {{ __('Resultados de búsqueda') }}</div>
            <button
              v-for="t in linkResults"
              :key="t.doctype + ':' + t.name"
              class="flex items-center justify-between gap-2 rounded-md border border-outline-gray-2 px-2.5 py-1.5 text-left text-[12px] hover:bg-surface-gray-2 disabled:opacity-50"
              :disabled="busy"
              @click="linkTo(t)"
            >
              <span class="min-w-0">
                <span class="block truncate text-ink-gray-8">{{ t.label }}</span>
                <span v-if="t.sublabel" class="block truncate text-[10.5px] text-ink-gray-5">{{ t.sublabel }}</span>
              </span>
              <span class="flex-none rounded px-1.5 py-0.5 text-[10px] font-semibold" :style="docBadge(t.doctype)">{{ docLabel(t.doctype) }}</span>
            </button>
          </div>
          <div v-else-if="linkQuery.trim().length >= 2 && !searching" class="mt-1 text-[11px] text-ink-gray-4">{{ __('Sin coincidencias') }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { toast, call, FileUploader, Dropdown, FeatherIcon } from 'frappe-ui'
import LucideMessageCircleQuestion from '~icons/lucide/message-circle-question'
import LucideChevronLeft from '~icons/lucide/chevron-left'
import LucideArchive from '~icons/lucide/archive'
import LucideArchiveRestore from '~icons/lucide/archive-restore'
import WhatsAppBox from '@/components/Activities/WhatsAppBox.vue'
import WhatsAppArea from '@/components/Activities/WhatsAppArea.vue'
import MessengerArea from '@/components/Activities/MessengerArea.vue'
import IconPicker from '@/components/IconPicker.vue'
import SmileIcon from '@/components/Icons/SmileIcon.vue'
import CannedReplyPicker from '@/components/doco/inbox/CannedReplyPicker.vue'
import { isMobile } from '@/composables/breakpoint'
import CatalogPicker from '@/components/doco/inbox/CatalogPicker.vue'
import { activeUnassigned, activeUnassignedChannel, activeUnassignedArchived, unassignedThread, suggestions, assignUnassigned, linkUnassignedToExisting, sendUnassignedMessenger, archiveOrphan, unarchiveOrphan, mobileBack, forecastingEnabled, catalogOpen, openCatalog } from '@/composables/inbox'

const isMessenger = computed(() => activeUnassignedChannel.value === 'messenger')

// 📦/"/cat" from the orphan composer: the box only EMITS — without this handler
// (and a mounted CatalogPicker) the Catálogo button was dead in "Sin asignar".
// Reference-less ctx: send_items threads the cards into this orphan conversation.
function onWaCatalog(q) {
  openCatalog(
    { reference_doctype: '', reference_name: '', channel: 'whatsapp', to: activeUnassigned.value || '' },
    q,
  )
}
function onCatalogSent() {
  unassignedThread.reload()
}
const isArchived = computed(() => activeUnassignedArchived.value)

async function onArchive() {
  if (busy.value) return
  busy.value = true
  try {
    await archiveOrphan(activeUnassignedChannel.value, activeUnassigned.value)
    toast.success(__('Conversación archivada'))
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo archivar'))
  } finally {
    busy.value = false
  }
}
async function onUnarchive() {
  if (busy.value) return
  busy.value = true
  try {
    await unarchiveOrphan(activeUnassignedChannel.value, activeUnassigned.value)
    toast.success(__('Conversación desarchivada'))
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo desarchivar'))
  } finally {
    busy.value = false
  }
}

// auto-suggested existing Contact/Lead/Deal matches (by name + number) for this orphan
const suggestionRows = computed(() => suggestions.data || [])
function docLabel(dt) {
  return dt === 'Contact' ? __('Contacto') : dt === 'CRM Deal' ? __('Trato') : 'Lead'
}
function docBadge(dt) {
  if (dt === 'Contact') return 'color:#5b21b6;background:#ede9fe'
  if (dt === 'CRM Deal') return 'color:#166534;background:#dcfce7'
  return 'color:#3730a3;background:#e0e7ff'
}

// Free Messenger reply to an orphan PSID (no assignment required).
const msgrReply = ref('')
const msgrEmoji = ref('')
const msgrTextareaRef = ref(null)
function onMsgrEmoji() {
  msgrReply.value += msgrEmoji.value
  msgrTextareaRef.value?.focus?.()
}
function onMsgrCanned(body) {
  msgrReply.value = msgrReply.value.trim() ? msgrReply.value + '\n' + body : body
  msgrTextareaRef.value?.focus?.()
}
function msgrUploadOptions(openFileSelector) {
  return [
    { label: __('Imagen'), icon: 'image', onClick: () => openFileSelector('image/*') },
    { label: __('Video'), icon: 'video', onClick: () => openFileSelector('video/*') },
    { label: __('Documento'), icon: 'file', onClick: () => openFileSelector() },
  ]
}
async function onMsgrFile(file) {
  if (busy.value || !file?.file_url) return
  busy.value = true
  try {
    await sendUnassignedMessenger(msgrReply.value.trim(), file.file_url)
    msgrReply.value = ''
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo enviar el adjunto'))
  } finally {
    busy.value = false
  }
}
async function sendMsgr() {
  if (busy.value || !msgrReply.value.trim()) return
  busy.value = true
  try {
    await sendUnassignedMessenger(msgrReply.value.trim())
    msgrReply.value = ''
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo enviar'))
  } finally {
    busy.value = false
  }
}
watch(activeUnassigned, () => (msgrReply.value = ''))

// Link-to-existing picker (universal across channels).
const linkQuery = ref('')
const linkResults = ref([])
const searching = ref(false)
let searchTimer = null
function onSearch() {
  clearTimeout(searchTimer)
  const q = linkQuery.value.trim()
  if (q.length < 2) { linkResults.value = []; return }
  searching.value = true
  searchTimer = setTimeout(async () => {
    try {
      linkResults.value = await call('doco_marketing.api.inbox.search_link_targets', { query: q })
    } catch {
      linkResults.value = []
    } finally {
      searching.value = false
    }
  }, 250)
}
async function linkTo(t) {
  if (busy.value) return
  busy.value = true
  try {
    const res = await linkUnassignedToExisting(activeUnassigned.value, t.doctype, t.name, activeUnassignedChannel.value)
    if (res?.kept_unassigned) {
      toast.success(__('Identidad vinculada al contacto · la conversación sigue sin asignar (sin trato abierto)'))
    } else {
      toast.success(`${__('Vinculado a')} ${res.name}`)
    }
    linkQuery.value = ''
    linkResults.value = []
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo vincular'))
  } finally {
    busy.value = false
  }
}

// Reply-bar models for WhatsAppBox. No reference doc (name=''), so the send goes
// out reference-less to the active number; the whatsapp model just proxies the
// post-send reload back to the orphan thread.
const unassignedDoc = ref({ name: '' })
const waReply = ref({})
const waModel = reactive({
  attach: '',
  content_type: 'text',
  reload: () => unassignedThread.reload(),
})
// WhatsAppArea's list model — it calls list.reload() after a reaction; route that
// back to the orphan thread fetch (same reload target as the composer).
const waList = ref({ reload: () => unassignedThread.reload() })

const inputCls =
  'w-full rounded-md border border-outline-gray-2 bg-surface-gray-2 px-2 py-1 text-[12.5px] text-ink-gray-8 hover:bg-surface-gray-3 focus:bg-surface-white focus:border-outline-gray-4 focus:outline-none focus:ring-0 disabled:opacity-60'

const busy = ref(false)
// mobile capture bottom sheet — closed by default, reset when switching orphans
const captureOpen = ref(false)
watch(activeUnassigned, () => {
  captureOpen.value = false
})
const showFiscal = ref(false)
const messages = computed(() => unassignedThread.data?.messages || [])
const form = reactive({
  first_name: '', last_name: '', email: '', device: '',
  rfc: '', legal_name: '', address: '', city: '', birth_date: '',
  expected_deal_value: '', expected_closure_date: '',
})

// Contact bound to this orphan number (kept-unassigned link) — drives the header's
// name/data + avatar. WhatsApp only; a Messenger orphan carries no phone-bound Contact.
const boundContact = computed(() => (isMessenger.value ? null : unassignedThread.data?.contact) || null)
const contactInitials = computed(() => {
  const parts = (boundContact.value?.name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2)
  return parts.map((p) => p[0]).join('').toUpperCase() || '?'
})
// FB/WhatsApp avatar (Messenger gives profile_pic; WhatsApp none) + the resolved name.
const profilePic = computed(() => unassignedThread.data?.prefill?.profile_pic || null)
const headerImage = computed(() => boundContact.value?.image || profilePic.value || null)
const prefillName = computed(() => {
  const p = unassignedThread.data?.prefill
  if (!p) return null
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || null
})

// Reset the capture form + picker when switching orphans.
watch(activeUnassigned, () => {
  Object.assign(form, { first_name: '', last_name: '', email: '', device: '', rfc: '', legal_name: '', address: '', city: '', birth_date: '', expected_deal_value: '', expected_closure_date: '' })
  linkQuery.value = ''
  linkResults.value = []
})
// Prefill with whatever the channel actually gave us — never clobber operator edits.
watch(
  () => unassignedThread.data,
  (d) => {
    const p = d?.prefill
    if (!p) return
    if (!form.first_name && p.first_name) form.first_name = p.first_name
    if (!form.last_name && p.last_name) form.last_name = p.last_name
    if (!form.email && p.email) form.email = p.email
    if (!form.birth_date && p.birth_date) form.birth_date = p.birth_date
  },
)

function formatPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '')
  let n = d
  if (n.startsWith('521')) n = n.slice(3)
  else if (n.startsWith('52')) n = n.slice(2)
  if (n.length === 10) return `+52 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`
  return raw ? `+${d}` : '—'
}

async function convert(target) {
  if (busy.value) return
  // Forecasting: a Deal needs an expected value, else the server MandatoryErrors. Block
  // the blank submit with a clear hint instead of bouncing the raw validation error.
  if (target === 'CRM Deal' && forecastingEnabled.value && !form.expected_deal_value) {
    toast.error(__('Captura el valor estimado para crear el trato.'))
    return
  }
  busy.value = true
  try {
    const fields = {}
    for (const [k, v] of Object.entries(form)) if (v && k !== 'device') fields[k] = v
    // one "Dispositivo / Empresa" input: the repair device on a Deal, the
    // organization on a Lead/Customer.
    if (form.device) {
      if (target === 'CRM Deal') fields.device = form.device
      else fields.organization = form.device
    }
    const res = await assignUnassigned(activeUnassigned.value, target, fields, activeUnassignedChannel.value)
    const label = target === 'CRM Deal' ? __('Trato') : target === 'Customer' ? __('Cliente') : __('Lead')
    toast.success(`${label} ${__('creado')}: ${res.name}`)
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo convertir'))
  } finally {
    busy.value = false
  }
}
</script>
