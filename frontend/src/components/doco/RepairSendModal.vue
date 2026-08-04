<!--
  "Revisar y enviar al cliente" — select photos + repair-log entries from one RO,
  pick a channel (WhatsApp/Email), edit the note, review, then send as a bundle via
  doco_marketing.api.inbox.send_bundle (one email w/ attachments; WhatsApp = note +
  each photo as its own media message). Recipient: WhatsApp auto-resolves server-side
  from the conversation; email uses the contact's address.
-->
<template>
  <Dialog v-model="show" :options="{ title: __('Revisar y enviar al cliente'), size: '2xl' }">
    <template #body-content>
      <div v-if="ro" class="space-y-4">
        <!-- channel -->
        <div class="flex items-center gap-2">
          <span class="text-[11px] font-semibold uppercase tracking-wide text-ink-gray-5">{{ __('Canal') }}</span>
          <button
            v-for="c in channelChoices"
            :key="c.v"
            class="rounded-full px-2.5 py-1 text-[12px] font-semibold"
            :class="channel === c.v ? 'bg-surface-green-2 text-ink-green-7' : 'bg-surface-gray-2 text-ink-gray-6 hover:bg-surface-gray-3'"
            @click="channel = c.v"
          >
            {{ c.label }}
          </button>
          <span class="ml-auto text-[11px] text-ink-gray-5">{{ __('Para') }}: <span class="font-medium text-ink-gray-8">{{ recipientLabel }}</span></span>
        </div>

        <!-- 24h-window guard: free-form WhatsApp won't deliver outside Meta's window -->
        <div
          v-if="waBlocked"
          class="rounded-md border border-outline-amber-4 bg-surface-amber-1 p-2.5 text-[12px] leading-snug text-ink-amber-7"
        >
          ⚠ <span class="font-semibold">{{ __('Ventana de 24h de WhatsApp cerrada.') }}</span>
          {{ __('El cliente no ha escrito por WhatsApp en las últimas 24 h. Meta solo entrega plantillas aprobadas — un mensaje libre o una foto NO llegará.') }}
          <template v-if="dealEmail"> {{ __('Envía por Email, o manda una plantilla desde la conversación.') }}</template>
          <template v-else> {{ __('Manda una plantilla aprobada desde la conversación.') }}</template>
        </div>
        <div
          v-else-if="channel === 'whatsapp' && waWindow.open"
          class="text-[11px] text-ink-green-7"
        >
          ✓ {{ __('Ventana de WhatsApp abierta') }} · {{ waWindow.hoursLeft }}h
        </div>

        <!-- template-with-photo path: the only way to deliver a photo when closed -->
        <div v-if="waBlocked" class="space-y-2 rounded-md border border-outline-gray-2 p-2.5">
          <div class="text-[11px] font-semibold uppercase tracking-wide text-ink-gray-5">
            {{ __('Enviar como plantilla (con foto)') }}
          </div>
          <template v-if="hasImageTemplates">
            <select
              v-model="chosenTemplate"
              class="w-full rounded-md border border-outline-gray-2 bg-surface-gray-2 px-2 py-1.5 text-sm text-ink-gray-8 focus:border-outline-gray-4 focus:bg-surface-base focus:outline-none focus:ring-0"
            >
              <option value="">{{ __('Elige una plantilla aprobada…') }}</option>
              <option v-for="t in imageTemplates.data" :key="t.name" :value="t.name">{{ t.name }}</option>
            </select>
            <div class="text-[11px] text-ink-gray-5">
              {{ __('La plantilla lleva 1 foto en el encabezado — se usa la primera foto seleccionada abajo. El texto lo define la plantilla aprobada.') }}
            </div>
          </template>
          <div v-else class="text-[12px] text-ink-gray-5">
            {{ __('No hay plantillas con foto aprobadas. Crea una plantilla con encabezado de imagen en WhatsApp Manager.') }}
          </div>
        </div>

        <!-- photos -->
        <div v-if="ro.photos?.length">
          <div class="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-ink-gray-5">
            <span>{{ __('Fotos') }} ({{ selectedPhotos.length }}/{{ ro.photos.length }})</span>
            <button class="text-[11px] font-medium text-ink-blue-link" @click="toggleAllPhotos">
              {{ selectedPhotos.length === ro.photos.length ? __('Ninguna') : __('Todas') }}
            </button>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="ph in ro.photos"
              :key="ph.name"
              class="relative h-16 w-16 overflow-hidden rounded-lg border-2 transition"
              :class="photoSel[ph.name] ? 'border-outline-green-4 ring-1 ring-outline-green-4' : 'border-outline-gray-2 hover:border-outline-gray-4'"
              :title="ph.photo_type || __('Foto')"
              @click="togglePhoto(ph.name)"
            >
              <img :src="ph.thumbnail_url" class="h-full w-full object-cover" loading="lazy" />
              <span
                v-if="photoSel[ph.name]"
                class="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-surface-green-7 text-[9px] font-bold text-ink-green-1"
              >✓</span>
            </button>
          </div>
        </div>

        <!-- repair log entries -->
        <div v-if="ro.repair_log?.length">
          <div class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-gray-5">
            {{ __('Entradas de log') }} ({{ selectedLogs.length }})
          </div>
          <div class="space-y-1.5">
            <label
              v-for="(e, i) in ro.repair_log"
              :key="e.name || i"
              class="flex cursor-pointer items-start gap-2 rounded-md border p-2 text-[12px]"
              :class="logSel[logKey(e, i)] ? 'border-outline-green-4 bg-surface-green-1' : 'border-outline-gray-2'"
            >
              <input type="checkbox" class="mt-0.5" :checked="!!logSel[logKey(e, i)]" @change="toggleLog(e, i)" />
              <span class="min-w-0">
                <span v-if="e.step_type" class="font-semibold text-ink-gray-8">{{ e.step_type }}: </span>
                <span class="text-ink-gray-7">{{ logText(e) }}</span>
              </span>
            </label>
          </div>
        </div>

        <!-- note -->
        <div>
          <div class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-gray-5">{{ __('Mensaje') }}</div>
          <textarea
            v-model="note"
            rows="3"
            class="w-full rounded-md border border-outline-gray-2 bg-surface-gray-2 p-2 text-sm text-ink-gray-8 hover:bg-surface-gray-3 focus:bg-surface-base focus:border-outline-gray-4 focus:outline-none focus:ring-0"
            :placeholder="__('Mensaje para el cliente…')"
          />
        </div>

        <!-- review line -->
        <div class="rounded-md bg-surface-gray-1 p-2 text-[12px] text-ink-gray-6">
          {{ __('Se enviará') }}:
          <span class="font-semibold text-ink-gray-8">{{ selectedPhotos.length }}</span> {{ __('foto(s)') }}
          · {{ composedText ? __('con mensaje') : __('sin mensaje') }}
          · <span class="font-semibold text-ink-gray-8">{{ channelLabel }}</span>
        </div>
      </div>
    </template>
    <template #actions>
      <Button :label="__('Cancelar')" @click="show = false" />
      <Button
        variant="solid"
        :label="sending ? __('Enviando…') : waBlocked ? __('Enviar plantilla') : __('Enviar')"
        :loading="sending"
        :disabled="!canSend"
        @click="send"
      />
    </template>
  </Dialog>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { Dialog, Button, createResource, createListResource, call, toast } from 'frappe-ui'
import { activeDeal, activeDealDoctype, loadThread, reloadQueue } from '@/composables/inbox'

const props = defineProps({
  ro: { type: Object, default: null },
  dealEmail: { type: String, default: '' },
  dealMobile: { type: String, default: '' },
})
const show = defineModel({ type: Boolean, default: false })

const channel = ref('whatsapp')
const note = ref('')
const sending = ref(false)
const photoSel = reactive({})
const logSel = reactive({})

const channelChoices = computed(() => {
  const c = [{ v: 'whatsapp', label: '💬 WhatsApp' }]
  if (props.dealEmail) c.push({ v: 'email', label: '✉ Email' })
  return c
})
// WhatsApp 24h customer-service window: free-form (text/media) only delivers within
// 24h of the customer's last inbound message; outside it Meta accepts ONLY approved
// templates, so a free-form send/photo would silently never arrive — guard it.
const lastInbound = createListResource({
  doctype: 'WhatsApp Message',
  fields: ['creation'],
  orderBy: 'creation desc',
  pageLength: 1,
  onError: () => {},
})
const waWindow = computed(() => {
  const ts = lastInbound.data?.[0]?.creation
  if (!ts) return { open: false, hoursLeft: 0 }
  const left = 24 - (Date.now() - new Date(String(ts).replace(' ', 'T')).getTime()) / 3600000
  return left > 0 ? { open: true, hoursLeft: Math.max(1, Math.floor(left)) } : { open: false, hoursLeft: 0 }
})
const waBlocked = computed(() => channel.value === 'whatsapp' && !waWindow.value.open)

// Image-header templates: send a photo even when the 24h window is closed (templates
// are window-independent). The chosen template carries ONE photo in its header.
const imageTemplates = createResource({
  url: 'doco_marketing.api.inbox.get_image_templates',
  onError: () => {},
})
const chosenTemplate = ref('')
const hasImageTemplates = computed(() => (imageTemplates.data || []).length > 0)

const channelLabel = computed(() => (channel.value === 'email' ? 'Email' : 'WhatsApp'))
const recipientLabel = computed(() =>
  channel.value === 'email' ? props.dealEmail || '—' : props.dealMobile || __('WhatsApp del cliente'),
)

function logKey(e, i) {
  return e.name || `idx${i}`
}
function logText(e) {
  return e.description || e.resolution || '—'
}

const selectedPhotos = computed(() => (props.ro?.photos || []).filter((p) => photoSel[p.name]))
const selectedLogs = computed(() => (props.ro?.repair_log || []).filter((e, i) => logSel[logKey(e, i)]))

const composedText = computed(() => {
  const parts = []
  if (note.value.trim()) parts.push(note.value.trim())
  for (const e of selectedLogs.value) {
    const t = logText(e)
    if (t && t !== '—') parts.push(`• ${e.step_type ? e.step_type + ': ' : ''}${t}`)
  }
  return parts.join('\n')
})

const canSend = computed(() => {
  if (sending.value) return false
  if (waBlocked.value) {
    // template mode: an approved image template + at least one photo for the header
    return !!chosenTemplate.value && selectedPhotos.value.length > 0
  }
  return selectedPhotos.value.length > 0 || !!composedText.value
})

function togglePhoto(name) {
  photoSel[name] = !photoSel[name]
}
function toggleAllPhotos() {
  const all = (props.ro?.photos || []).every((p) => photoSel[p.name])
  for (const p of props.ro?.photos || []) photoSel[p.name] = !all
}
function toggleLog(e, i) {
  const k = logKey(e, i)
  logSel[k] = !logSel[k]
}

// reset + prefill a default note each time the modal opens for an RO
watch(show, (open) => {
  if (!open) return
  if (activeDeal.value) {
    lastInbound.filters = {
      reference_doctype: activeDealDoctype.value,
      reference_name: activeDeal.value,
      type: 'Incoming',
    }
    lastInbound.reload()
    imageTemplates.fetch({ reference_doctype: activeDealDoctype.value })
  }
  chosenTemplate.value = ''
  for (const k of Object.keys(photoSel)) delete photoSel[k]
  for (const k of Object.keys(logSel)) delete logSel[k]
  channel.value = 'whatsapp'
  const r = props.ro
  note.value = r
    ? [`📱 ${r.device_model || ''}`.trim(), r.status ? `${__('Estado')}: ${r.status}` : '']
        .filter(Boolean)
        .join('\n')
    : ''
})

// Photos must go out as publicly-fetchable URLs (Meta fetches WhatsApp media; email
// downloads the bytes). Resolve a signed URL for S3-backed originals, absolute for local.
function resolveSendUrl(ph) {
  return new Promise((resolve) => {
    if (ph.storage_backend === 'S3' && ph.file_name) {
      createResource({
        url: 'taller.file_storage.get_signed_url',
        params: { file_name: ph.file_name },
        auto: true,
        onSuccess(data) {
          resolve((typeof data === 'string' ? data : data?.url) || ph.image)
        },
        onError() {
          resolve(ph.image)
        },
      })
    } else {
      const u = ph.image || ph.thumbnail_url || ''
      resolve(u.startsWith('http') ? u : window.location.origin + u)
    }
  })
}

async function send() {
  if (!canSend.value || !activeDeal.value) return
  if (channel.value === 'email' && !props.dealEmail) {
    toast.error(__('El cliente no tiene correo registrado.'))
    return
  }
  sending.value = true
  try {
    if (waBlocked.value) {
      // window closed → send an approved image-header template carrying the first
      // selected photo (the only window-independent way to deliver a photo).
      const url = await resolveSendUrl(selectedPhotos.value[0])
      await call('doco_marketing.api.inbox.send_message', {
        reference_doctype: activeDealDoctype.value,
        reference_name: activeDeal.value,
        channel: 'whatsapp',
        template: chosenTemplate.value,
        attach: url,
      })
      toast.success(__('Plantilla enviada por WhatsApp.'))
    } else {
      const urls = await Promise.all(selectedPhotos.value.map(resolveSendUrl))
      await call('doco_marketing.api.inbox.send_bundle', {
        reference_doctype: activeDealDoctype.value,
        reference_name: activeDeal.value,
        channel: channel.value,
        content: composedText.value || undefined,
        attachments: JSON.stringify(urls.filter(Boolean)),
        to: channel.value === 'email' ? props.dealEmail : undefined,
      })
      toast.success(channel.value === 'email' ? __('Enviado por correo.') : __('Enviado por WhatsApp.'))
    }
    show.value = false
    loadThread()
    reloadQueue()
  } catch (e) {
    toast.error(e?.messages?.join('\n') || e?.message || __('No se pudo enviar.'))
  } finally {
    sending.value = false
  }
}
</script>
