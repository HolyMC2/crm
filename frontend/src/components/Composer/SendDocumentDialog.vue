<!--
  «Enviar documento»: send a deal's Cotización / Orden de venta / Orden de
  reparación / Adeudo on WhatsApp, Email or another chat channel through
  doco_marketing.api.composer.send_document. Document, channel and recipient
  come preselected; the caption is prefilled from preview_document_message and
  stays editable. Recipient, subject and caption are remembered on success.
  Ctrl/⌘+Enter sends. Emits `sent` so the parent reloads its thread.
-->
<template>
  <Dialog
    v-model="show"
    :options="{ title: __('Enviar documento'), size: '2xl' }"
  >
    <template #body-content>
      <div
        class="space-y-4"
        @keydown.ctrl.enter.prevent.stop="submit"
        @keydown.meta.enter.prevent.stop="submit"
      >
        <div
          v-if="loadingCatalog && !cat"
          class="py-6 text-center text-sm text-ink-gray-5"
        >
          {{ __('Cargando documentos…') }}
        </div>
        <div
          v-else-if="!cat"
          class="rounded-md bg-surface-amber-1 p-3 text-sm text-ink-amber-7"
        >
          {{
            __(
              'No se pudieron cargar los documentos de este trato. Intenta de nuevo en un momento.',
            )
          }}
        </div>
        <template v-else>
          <!-- document kind -->
          <div class="flex flex-wrap items-center gap-1.5">
            <span
              class="mr-1 text-[11px] font-semibold uppercase tracking-wide text-ink-gray-5"
              >{{ __('Documento') }}</span
            >
            <button
              v-for="c in docCommands"
              :key="c.key"
              type="button"
              class="rounded-full px-2.5 py-1 text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              :class="
                dt === c.doctype
                  ? 'bg-surface-gray-7 text-ink-white'
                  : 'bg-surface-gray-2 text-ink-gray-6 hover:bg-surface-gray-3'
              "
              :disabled="c.available === false"
              :title="c.available === false ? c.reason : ''"
              @click="selectDoctype(c.doctype)"
            >
              {{ c.label || c.doctype }}
            </button>
          </div>

          <!-- documents, newest first -->
          <div
            v-if="!docs.length"
            class="rounded-md bg-surface-gray-1 p-3 text-sm text-ink-gray-5"
          >
            {{
              currentReason || __('No hay documentos de este tipo en el trato.')
            }}
          </div>
          <div
            v-else
            role="radiogroup"
            :aria-label="__('Documento')"
            class="max-h-48 space-y-1 overflow-y-auto"
          >
            <label
              v-for="d in docs"
              :key="d.name"
              class="flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm"
              :class="
                docname === d.name
                  ? 'border-outline-gray-4 bg-surface-gray-1'
                  : 'border-outline-gray-2 hover:bg-surface-gray-1'
              "
            >
              <input
                v-model="docname"
                type="radio"
                class="mt-1"
                :value="d.name"
              />
              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-2">
                  <span class="truncate font-medium text-ink-gray-8">{{
                    d.title || d.name
                  }}</span>
                  <span
                    v-if="d.total_label"
                    class="ml-auto flex-none font-semibold text-ink-gray-8"
                    >{{ d.total_label }}</span
                  >
                </span>
                <span class="block text-xs text-ink-gray-5">
                  {{ d.name
                  }}<template v-if="d.status"> · {{ d.status }}</template
                  ><template v-if="d.date"> · {{ d.date }}</template>
                </span>
                <span
                  v-for="inv in d.invoices || []"
                  :key="inv.name"
                  class="block text-xs text-ink-gray-5"
                >
                  {{ inv.name }} · {{ inv.outstanding_label }}
                  <template v-if="inv.due_date">
                    · {{ __('vence {0}', [inv.due_date]) }}</template
                  >
                </span>
              </span>
            </label>
          </div>

          <!-- channel -->
          <div class="flex flex-wrap items-center gap-1.5">
            <span
              class="mr-1 text-[11px] font-semibold uppercase tracking-wide text-ink-gray-5"
              >{{ __('Canal') }}</span
            >
            <button
              v-for="c in channels"
              :key="c.value"
              type="button"
              class="rounded-full px-2.5 py-1 text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              :class="
                ch === c.value
                  ? 'bg-surface-green-2 text-ink-green-8'
                  : 'bg-surface-gray-2 text-ink-gray-6 hover:bg-surface-gray-3'
              "
              :disabled="c.available === false"
              :title="c.available === false ? c.reason : ''"
              @click="selectChannel(c.value)"
            >
              {{ c.label || c.value }}
            </button>
          </div>
          <p
            v-if="unavailableChannelReasons.length"
            class="-mt-2 text-[11px] text-ink-gray-5"
          >
            {{ unavailableChannelReasons.join(' · ') }}
          </p>

          <!-- recipient / subject -->
          <div v-if="needsRecipient" class="space-y-1">
            <label
              class="text-[11px] font-semibold uppercase tracking-wide text-ink-gray-5"
              >{{ __('Para') }}</label
            >
            <MemoryInput
              v-model="to"
              :scope="`${ch}.to`"
              :context="referenceName"
              :suggestions="channelRecipients"
              :static-label="__('Trato')"
              :type="ch === 'email' ? 'email' : 'text'"
              :placeholder="
                ch === 'email' ? __('correo@cliente.com') : __('Número')
              "
              :aria-label="__('Para')"
            />
          </div>
          <div v-if="ch === 'email'" class="space-y-1">
            <label
              class="text-[11px] font-semibold uppercase tracking-wide text-ink-gray-5"
              >{{ __('Asunto') }}</label
            >
            <MemoryInput
              v-model="subject"
              scope="email.subject"
              :context="referenceName"
              :suggestions="preview?.subject ? [preview.subject] : []"
              :aria-label="__('Asunto')"
            />
          </div>

          <!-- caption -->
          <div class="space-y-1">
            <div class="flex items-center">
              <label
                :for="captionId"
                class="text-[11px] font-semibold uppercase tracking-wide text-ink-gray-5"
                >{{
                  ch === 'email' ? __('Mensaje') : __('Texto del mensaje')
                }}</label
              >
              <button
                type="button"
                class="ml-auto text-[11px] font-medium text-ink-blue-link disabled:opacity-50"
                :disabled="previewLoading || !docname"
                @click="loadPreview({ fresh: true, overwrite: true })"
              >
                {{ previewLoading ? __('Generando…') : __('Volver a generar') }}
              </button>
            </div>
            <textarea
              :id="captionId"
              v-model="caption"
              rows="5"
              class="w-full rounded border border-outline-gray-2 bg-surface-gray-2 px-2 py-1.5 text-sm text-ink-gray-8 placeholder-ink-gray-4 focus:border-outline-gray-4 focus:bg-surface-base focus:outline-none focus:ring-0"
              :placeholder="__('Mensaje que acompaña al documento')"
              @input="captionDirty = true"
            />
            <div
              v-if="preview?.attachment && preview.attachment.kind !== 'none'"
              class="flex items-center gap-1.5 text-xs text-ink-gray-5"
            >
              <span aria-hidden="true">{{
                preview.attachment.kind === 'pdf' ? '📎' : '🔗'
              }}</span>
              {{ preview.attachment.label }}
              <a
                v-if="preview.link_url"
                :href="preview.link_url"
                target="_blank"
                rel="noopener"
                class="text-ink-blue-link underline"
                >{{ __('Ver') }}</a
              >
            </div>
          </div>

          <!-- warnings -->
          <div
            v-if="windowClosed"
            class="rounded-md border border-outline-amber-4 bg-surface-amber-1 p-2.5 text-[12px] leading-snug text-ink-amber-7"
          >
            ⚠
            <span class="font-semibold">{{
              __('Ventana de 24h de WhatsApp cerrada.')
            }}</span>
            {{
              __(
                'Meta solo entrega plantillas aprobadas fuera de la ventana. Envía por otro canal o manda una plantilla desde la conversación.',
              )
            }}
          </div>
          <p
            v-for="(w, i) in otherWarnings"
            :key="i"
            class="text-[12px] text-ink-amber-7"
          >
            ⚠ {{ w }}
          </p>
        </template>
      </div>
    </template>
    <template #actions>
      <div class="flex items-center justify-end gap-2">
        <span class="mr-auto hidden text-xs text-ink-gray-4 sm:inline">{{
          __('Ctrl/⌘+Enter para enviar')
        }}</span>
        <Button :label="__('Cancelar')" @click="show = false" />
        <Button
          variant="solid"
          :label="__('Enviar')"
          :loading="sending"
          :disabled="!canSend"
          @click="submit"
        />
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Dialog, Button, toast } from 'frappe-ui'
import MemoryInput from '@/components/Composer/MemoryInput.vue'
import { remember } from '@/composables/fieldMemory'
import {
  fetchCatalog,
  previewDocument,
  sendDocument,
  sortDocuments,
} from '@/composables/composerCommands'

const props = defineProps({
  referenceDoctype: { type: String, required: true },
  referenceName: { type: String, required: true },
  doctype: { type: String, default: '' },
  channel: { type: String, default: 'whatsapp' },
  catalog: { type: Object, default: null },
})
const emit = defineEmits(['sent'])
const show = defineModel({ type: Boolean, default: false })

const captionId = `sd-caption-${Math.random().toString(36).slice(2, 8)}`
const loadedCatalog = ref(null)
const loadingCatalog = ref(false)
const cat = computed(() => props.catalog || loadedCatalog.value)

const dt = ref('')
const docname = ref('')
const ch = ref('')
const to = ref('')
const subject = ref('')
const caption = ref('')
const captionDirty = ref(false)
const preview = ref(null)
const previewLoading = ref(false)
const sending = ref(false)

const docCommands = computed(() =>
  (cat.value?.commands || []).filter((c) => c.kind === 'document'),
)
const currentReason = computed(
  () => docCommands.value.find((c) => c.doctype === dt.value)?.reason || '',
)
const docs = computed(() => sortDocuments(cat.value?.documents?.[dt.value]))

const channels = computed(() => {
  const list = cat.value?.channels
  if (Array.isArray(list) && list.length) return list
  return [{ value: props.channel, label: props.channel, available: true }]
})
const channelObj = computed(
  () => channels.value.find((c) => c.value === ch.value) || null,
)
const unavailableChannelReasons = computed(() =>
  channels.value
    .filter((c) => c.available === false && c.reason)
    .map((c) => `${c.label || c.value}: ${c.reason}`),
)
const channelRecipients = computed(() => [
  ...new Set([
    ...(channelObj.value?.recipients || []),
    ...(preview.value?.recipients || []),
  ]),
])
const needsRecipient = computed(
  () =>
    ['whatsapp', 'email'].includes(ch.value) ||
    channelRecipients.value.length > 0,
)
const windowClosed = computed(
  () =>
    ch.value === 'whatsapp' &&
    (preview.value?.window_open === false ||
      channelObj.value?.window_open === false),
)
// The closed-window warning has its own banner; list the rest.
const otherWarnings = computed(() =>
  (preview.value?.warnings || []).filter(
    (w) => !(windowClosed.value && /24\s*h/i.test(w)),
  ),
)
const canSend = computed(
  () =>
    !!cat.value &&
    !!docname.value &&
    !!ch.value &&
    channelObj.value?.available !== false &&
    !windowClosed.value &&
    (!needsRecipient.value || !!to.value.trim()) &&
    !sending.value,
)

function firstAvailableDoctype() {
  const wanted = docCommands.value.find(
    (c) => c.doctype === props.doctype && c.available !== false,
  )
  if (wanted) return wanted.doctype
  if (props.doctype) return props.doctype
  return docCommands.value.find((c) => c.available !== false)?.doctype || ''
}
function firstAvailableChannel() {
  const wanted = channels.value.find(
    (c) => c.value === props.channel && c.available !== false,
  )
  return (
    (wanted || channels.value.find((c) => c.available !== false))?.value ||
    props.channel
  )
}

function selectDoctype(value) {
  dt.value = value
  docname.value = docs.value[0]?.name || ''
}
function selectChannel(value) {
  ch.value = value
  to.value = channelObj.value?.recipients?.[0] || ''
}

let timer = null
let seq = 0
function loadPreview({ fresh = false, overwrite = false } = {}) {
  clearTimeout(timer)
  if (!docname.value || !ch.value) {
    preview.value = null
    return
  }
  const mine = ++seq
  previewLoading.value = true
  timer = setTimeout(
    async () => {
      const r = await previewDocument(
        {
          referenceDoctype: props.referenceDoctype,
          referenceName: props.referenceName,
          doctype: dt.value,
          docname: docname.value,
          channel: ch.value,
        },
        { fresh },
      )
      if (mine !== seq) return
      previewLoading.value = false
      preview.value = r
      if (!r) return
      if (overwrite || !captionDirty.value) {
        caption.value = r.caption || ''
        captionDirty.value = false
      }
      if (ch.value === 'email' && (overwrite || !subject.value))
        subject.value = r.subject || ''
      if (!to.value && r.recipients?.length) to.value = r.recipients[0]
    },
    fresh ? 0 : 200,
  )
}

async function init() {
  preview.value = null
  caption.value = ''
  captionDirty.value = false
  subject.value = ''
  if (!cat.value) {
    loadingCatalog.value = true
    loadedCatalog.value = await fetchCatalog(
      props.referenceDoctype,
      props.referenceName,
      props.channel,
    )
    loadingCatalog.value = false
  }
  dt.value = firstAvailableDoctype()
  docname.value = docs.value[0]?.name || ''
  ch.value = firstAvailableChannel()
  to.value = channelObj.value?.recipients?.[0] || ''
  loadPreview()
}

watch(show, (open) => open && init(), { immediate: true })
watch([docname, ch], () => {
  if (show.value) loadPreview()
})

async function submit() {
  if (!canSend.value) return
  sending.value = true
  const payload = {
    referenceDoctype: props.referenceDoctype,
    referenceName: props.referenceName,
    doctype: dt.value,
    docname: docname.value,
    channel: ch.value,
    to: needsRecipient.value ? to.value.trim() : '',
    caption: caption.value,
    subject: ch.value === 'email' ? subject.value.trim() : '',
  }
  try {
    const res = await sendDocument(payload)
    toast.success(__('Documento enviado'))
    remember([
      {
        scope: `${payload.channel}.to`,
        value: payload.to,
        context: props.referenceName,
      },
      ...(payload.channel === 'email'
        ? [
            {
              scope: 'email.subject',
              value: payload.subject,
              context: props.referenceName,
            },
          ]
        : []),
      // Only a caption the operator wrote is worth remembering.
      ...(captionDirty.value
        ? [
            {
              scope: `caption.${payload.doctype}`,
              value: payload.caption,
              context: props.referenceName,
            },
          ]
        : []),
    ])
    emit('sent', { ...(res || {}), channel: payload.channel })
    show.value = false
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo enviar el documento'))
  } finally {
    sending.value = false
  }
}
</script>
