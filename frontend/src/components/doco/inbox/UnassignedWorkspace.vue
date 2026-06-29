<!--
  "Sin asignar" workspace — shown when an orphan (unknown-number) WhatsApp
  conversation is selected. Read-only thread + a quick capture form that converts
  the number to a Lead, Deal, or Customer(+Contact). Fields map to real doctype
  fields server-side (assign_unassigned); a Deal/Lead then opens in the normal
  workspace, a Customer files under its Contact.
-->
<template>
  <div class="flex min-w-0 flex-1 flex-col">
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
      <img v-if="profilePic" :src="profilePic" class="h-9 w-9 flex-none rounded-full object-cover" alt="" />
      <span v-else class="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-surface-amber-1 text-ink-amber-3">
        <LucideMessageCircleQuestion class="h-5 w-5" />
      </span>
      <div>
        <div class="text-[15px] font-semibold text-ink-gray-9">
          {{ prefillName || (isMessenger ? __('Messenger') + ' · ' + (activeUnassigned || '').slice(-8) : formatPhone(activeUnassigned)) }}
        </div>
        <div class="text-[11px] font-medium text-ink-amber-3">{{ __('Sin asignar — captura y convierte') }}</div>
      </div>
    </div>

    <div class="flex min-h-0 flex-1" :class="isMobile ? 'flex-col' : ''">
      <!-- thread + reply bar -->
      <div
        class="flex min-h-0 flex-1 flex-col border-outline-gray-1"
        :class="isMobile ? 'border-b' : 'border-r'"
      >
        <div class="scb flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4">
          <div v-if="unassignedThread.loading && !messages.length" class="py-8 text-center text-xs text-ink-gray-4">
            {{ __('Cargando…') }}
          </div>
          <div v-else-if="!messages.length" class="py-8 text-center text-xs text-ink-gray-4">{{ __('Sin mensajes') }}</div>
          <div v-for="m in messages" :key="m.id" class="flex" :class="m.direction === 'out' ? 'justify-end' : 'justify-start'">
            <div
              class="max-w-[80%] rounded-lg px-3 py-1.5 text-sm shadow-sm"
              :class="m.direction === 'out' ? 'bg-surface-green-2 text-ink-gray-9' : 'bg-surface-gray-2 text-ink-gray-9'"
            >
              <img v-if="m.content_type === 'image' && m.attach" :src="m.attach" class="mb-1 max-h-48 rounded-md" />
              <div v-if="m.content" class="whitespace-pre-wrap break-words">{{ m.content }}</div>
              <div class="mt-0.5 text-right text-[10px] text-ink-gray-4">{{ hhmm(m.timestamp) }}</div>
            </div>
          </div>
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
          />
          <!-- Messenger orphan: reply directly by PSID — no assignment needed (the
               PSID is the recipient). The row stays in this orphan thread and is
               re-pointed onto the record when you convert/link below. -->
          <div v-else class="flex items-end gap-2 px-3 py-2.5">
            <textarea
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

      <!-- capture form -->
      <div
        class="scb flex flex-none flex-col overflow-y-auto bg-surface-white px-3.5 py-3.5"
        :class="isMobile ? 'w-full' : 'w-[300px]'"
      >
        <div class="mb-2 text-[11px] font-bold uppercase tracking-[.08em] text-ink-gray-4">{{ __('Datos') }}</div>
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
          <button class="rounded-lg px-3 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50" style="background: #16a34a" :disabled="busy" @click="convert('CRM Deal')">
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

        <!-- or LINK to an existing Lead/Deal (universal — same for every channel) -->
        <div class="mt-4 border-t border-outline-gray-1 pt-3">
          <div class="mb-1 text-[11px] font-bold uppercase tracking-[.08em] text-ink-gray-4">{{ __('O vincular a existente') }}</div>
          <input v-model="linkQuery" :placeholder="__('Buscar Lead o Trato…')" :class="inputCls" @input="onSearch" />
          <div v-if="linkResults.length" class="mt-1.5 flex flex-col gap-1">
            <button
              v-for="t in linkResults"
              :key="t.doctype + ':' + t.name"
              class="flex items-center justify-between gap-2 rounded-md border border-outline-gray-2 px-2.5 py-1.5 text-left text-[12px] hover:bg-surface-gray-2 disabled:opacity-50"
              :disabled="busy"
              @click="linkTo(t)"
            >
              <span class="truncate text-ink-gray-8">{{ t.label }}</span>
              <span class="flex-none rounded bg-surface-gray-2 px-1.5 py-0.5 text-[10px] font-semibold text-ink-gray-5">
                {{ t.doctype === 'CRM Deal' ? __('Trato') : 'Lead' }}
              </span>
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
import { toast, call } from 'frappe-ui'
import LucideMessageCircleQuestion from '~icons/lucide/message-circle-question'
import LucideChevronLeft from '~icons/lucide/chevron-left'
import WhatsAppBox from '@/components/Activities/WhatsAppBox.vue'
import { isMobile } from '@/composables/breakpoint'
import { activeUnassigned, activeUnassignedChannel, unassignedThread, assignUnassigned, linkUnassignedToExisting, sendUnassignedMessenger, hhmm, mobileBack } from '@/composables/inbox'

const isMessenger = computed(() => activeUnassignedChannel.value === 'messenger')

// Free Messenger reply to an orphan PSID (no assignment required).
const msgrReply = ref('')
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
    toast.success(`${__('Vinculado a')} ${res.name}`)
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

const inputCls =
  'w-full rounded-md border border-outline-gray-2 bg-surface-gray-2 px-2 py-1 text-[12.5px] text-ink-gray-8 hover:bg-surface-gray-3 focus:bg-surface-white focus:border-outline-gray-4 focus:outline-none focus:ring-0 disabled:opacity-60'

const busy = ref(false)
const showFiscal = ref(false)
const messages = computed(() => unassignedThread.data?.messages || [])
const form = reactive({
  first_name: '', last_name: '', email: '', device: '',
  rfc: '', legal_name: '', address: '', city: '', birth_date: '',
})

// FB/WhatsApp avatar (Messenger gives profile_pic; WhatsApp none) + the resolved name.
const profilePic = computed(() => unassignedThread.data?.prefill?.profile_pic || null)
const prefillName = computed(() => {
  const p = unassignedThread.data?.prefill
  if (!p) return null
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || null
})

// Reset the capture form + picker when switching orphans.
watch(activeUnassigned, () => {
  Object.assign(form, { first_name: '', last_name: '', email: '', device: '', rfc: '', legal_name: '', address: '', city: '', birth_date: '' })
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
