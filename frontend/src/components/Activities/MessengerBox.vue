<!--
  Messenger composer. Replies through the UNIFIED inbox endpoint
  doco_marketing.api.inbox.send_message(channel='messenger') — resolves the PSID,
  posts via the Page (24h window: free RESPONSE inside, else HUMAN_AGENT tag),
  records the Outgoing row + touchpoint, publishes realtime. Same emoji + attach UI
  as WhatsAppBox (IconPicker + FileUploader/Dropdown) for a consistent composer.
-->
<template>
  <div
    class="border-t border-outline-gray-1 bg-surface-base px-3 py-2 dark:bg-surface-gray-1 sm:px-10"
  >
    <div
      class="mb-1 text-[10px] font-semibold uppercase tracking-wide"
      style="color: #0084ff"
    >
      {{ __('Responder · Messenger') }}
    </div>
    <div v-if="holes.length" class="mb-1.5">
      <TemplateHoles
        :holes="holes"
        :template="holesTemplate"
        :context="docname"
        @fill="onHoleFill"
        @dismiss="holes = []"
      />
    </div>
    <div class="relative flex items-end gap-2">
      <SlashCommandMenu
        v-if="slashEnabled && slashOpen"
        class="!left-0"
        :items="slashItems"
        :active-index="slashIndex"
        :loading="catalogLoading"
        :catalog="catalog"
        :reference-doctype="doctype"
        :reference-name="docname"
        channel="messenger"
        @hover="setSlashIndex"
        @pick="(item) => slash.pick(item)"
      />
      <div class="flex h-8 items-center gap-2">
        <FileUploader @success="(file) => uploadFile(file)">
          <template #default="{ openFileSelector }">
            <div class="flex items-center space-x-2">
              <Dropdown :options="uploadOptions(openFileSelector)">
                <FeatherIcon
                  name="plus"
                  class="size-4.5 cursor-pointer text-ink-gray-5"
                />
              </Dropdown>
            </div>
          </template>
        </FileUploader>
        <IconPicker
          v-slot="{ togglePopover }"
          v-model="emoji"
          @update:modelValue="onEmoji"
        >
          <SmileIcon
            class="flex size-4.5 cursor-pointer rounded-sm text-2xl leading-none text-ink-gray-4"
            @click="togglePopover"
          />
        </IconPicker>
        <CannedReplyPicker channel="Messenger" @pick="onCanned" />
        <button
          type="button"
          class="rounded-md bg-surface-green-2 px-1.5 py-0.5 text-[12px] font-semibold text-ink-green-8 hover:bg-surface-green-7"
          :title="__('Catálogo (o escribe /cat)')"
          @click="emit('catalog', '')"
        >
          📦
        </button>
      </div>
      <textarea
        ref="textareaRef"
        v-model="text"
        rows="1"
        :placeholder="
          slashEnabled
            ? __('Escribe un mensaje… (/ para comandos)')
            : __('Escribe un mensaje…')
        "
        class="min-h-[38px] flex-1 resize-none rounded-lg border border-outline-gray-2 px-3 py-2 text-[13px] text-ink-gray-8 dark:bg-surface-gray-2 dark:text-ink-gray-8"
        @input="(e) => syncSlash(e.target)"
        @click="(e) => syncSlash(e.target)"
        @blur="slash.close()"
        @keydown="onKeydown"
      />
      <button
        class="flex-none rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
        style="background: #0084ff"
        :disabled="busy || !text.trim()"
        @click="send"
      >
        {{ busy ? '…' : __('Enviar') }}
      </button>
    </div>
    <p
      v-if="window24h && window24h.open"
      class="mt-1 text-[10px] font-medium text-ink-green-7 dark:text-ink-green-6"
    >
      {{
        __('Ventana de 24 h abierta · respuesta gratis ({0} h restantes)', [
          window24h.hoursLeft,
        ])
      }}
    </p>
    <p
      v-else-if="window24h && !window24h.open"
      class="mt-1 text-[10px] font-medium text-ink-amber-7 dark:text-ink-amber-6"
    >
      {{
        __(
          'Fuera de la ventana de 24 h — Meta solo entrega con etiqueta de agente humano (sin promociones).',
        )
      }}
    </p>
    <p v-else class="mt-1 text-[10px] text-ink-gray-4 dark:text-ink-gray-5">
      {{
        __(
          'Fuera de la ventana de 24 h, Meta solo permite mensajes con etiqueta de agente humano.',
        )
      }}
    </p>
    <SendDocumentDialog
      v-if="commandsEnabled"
      v-model="docDialog.open"
      :reference-doctype="doctype"
      :reference-name="docname"
      :doctype="docDialog.doctype"
      channel="messenger"
      :catalog="catalog"
      @sent="() => emit('sent')"
    />
    <SaveTemplateDialog
      v-if="commandsEnabled"
      v-model="saveDialog.open"
      :body="saveDialog.body"
      @saved="() => loadCatalog({ fresh: true })"
    />
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { call, toast, FileUploader, Dropdown, FeatherIcon } from 'frappe-ui'
import IconPicker from '@/components/IconPicker.vue'
import SmileIcon from '@/components/Icons/SmileIcon.vue'
import CannedReplyPicker from '@/components/doco/inbox/CannedReplyPicker.vue'
import SlashCommandMenu from '@/components/Composer/SlashCommandMenu.vue'
import SendDocumentDialog from '@/components/Composer/SendDocumentDialog.vue'
import SaveTemplateDialog from '@/components/Composer/SaveTemplateDialog.vue'
import TemplateHoles from '@/components/Composer/TemplateHoles.vue'
import { useSlashMenu, stripSlash, fillHole } from '@/composables/slashCommands'
import {
  useComposerCommands,
  renderTemplate,
} from '@/composables/composerCommands'

const props = defineProps({
  doctype: { type: String, required: true },
  docname: { type: String, required: true },
  // { open: bool, hoursLeft?: int } | null — live Messenger 24h policy window.
  // null when we can't tell (no inbound yet); drives the composer note.
  window24h: { type: Object, default: null },
})
const emit = defineEmits(['sent', 'sending', 'failed', 'catalog'])
const CAT_RE = /^\/cat(alogo|álogo)?\b\s*/i

const text = ref('')
const busy = ref(false)
const emoji = ref('')
const fileType = ref('')
const textareaRef = ref(null)

// ── / command palette (same as WhatsAppBox, channel messenger) ────────────────
// Messenger's canned replies double as the palette's local quick replies, so
// they still show when the command catalog cannot be loaded.
const cannedReplies = ref([])
let cannedLoaded = false
function loadCannedReplies() {
  if (cannedLoaded) return
  cannedLoaded = true
  call('doco_marketing.api.inbox.get_canned_replies', { channel: 'Messenger' })
    .then((rows) => {
      cannedReplies.value = (rows || []).map((r) => ({
        label: r.title,
        text: r.body,
      }))
    })
    .catch(() => {
      cannedLoaded = false
    })
}
const commands = useComposerCommands({
  channel: 'messenger',
  reference: () => ({ doctype: props.doctype, name: props.docname }),
  quickReplies: () => cannedReplies.value,
})
const {
  catalog,
  catalogLoading,
  loadCatalog,
  docDialog,
  saveDialog,
  enabled: commandsEnabled,
} = commands
const slashEnabled = commandsEnabled
const slash = useSlashMenu({
  source: () => commands.items.value,
  onPick: onSlashPick,
})
const { open: slashOpen, ranked: slashItems, activeIndex: slashIndex } = slash
const setSlashIndex = (i) => (slashIndex.value = i)
const holes = ref([])
const holesTemplate = ref('')
watch(text, (v) => {
  if (!v) holes.value = []
})

function syncSlash(el) {
  if (!slashEnabled.value || !el) return slash.close()
  slash.update(el.value, el.selectionStart)
  if (!slashOpen.value) return
  loadCannedReplies()
  if (!catalog.value && !catalogLoading.value) loadCatalog()
}

function onKeydown(e) {
  if (slashOpen.value && slash.onKeydown(e)) return
  if (slashOpen.value && catalogLoading.value && e.key === 'Enter') {
    e.preventDefault()
    return
  }
  if (
    e.key === 'Enter' &&
    !e.shiftKey &&
    !e.ctrlKey &&
    !e.altKey &&
    !e.metaKey
  ) {
    e.preventDefault()
    send()
  }
}

function focusAt(caret) {
  nextTick(() => {
    textareaRef.value?.focus?.()
    if (caret != null) textareaRef.value?.setSelectionRange?.(caret, caret)
  })
}

async function onSlashPick(item, parsed) {
  if (!item.available) {
    toast.error(item.reason || __('No disponible en esta conversación'))
    return
  }
  const rest = stripSlash(text.value, parsed)
  const kind = item.payload?.kind
  if (kind === 'templates') {
    text.value = rest ? `/ ${rest}` : '/'
    slash.update(text.value, 1)
    slash.scope.value = 'templates'
    focusAt(1)
    return
  }
  slash.close()
  text.value = rest
  if (kind === 'catalog') {
    text.value = ''
    emit('catalog', rest)
    return
  }
  if (kind === 'document') return commands.openDocument(item.payload.doctype)
  if (kind === 'save_template') return commands.openSaveTemplate(rest)
  let body = item.payload.text || item.payload.body || ''
  if (item.type === 'template') {
    const r = await renderTemplate(item.payload, props.doctype, props.docname)
    body = r.text
    holes.value = r.holes
    holesTemplate.value = item.payload.id
  }
  onCanned(body)
}

function onHoleFill({ key, value }) {
  text.value = fillHole(text.value, key, value)
  holes.value = holes.value.filter((h) => h.key !== key)
  focusAt()
}

function onEmoji() {
  text.value += emoji.value
  textareaRef.value?.focus?.()
}
function onCanned(body) {
  text.value = text.value.trim() ? text.value + '\n' + body : body
  textareaRef.value?.focus?.()
}

function uploadOptions(openFileSelector) {
  return [
    {
      label: __('Imagen'),
      icon: 'image',
      onClick: () => {
        fileType.value = 'image'
        openFileSelector('image/*')
      },
    },
    {
      label: __('Video'),
      icon: 'video',
      onClick: () => {
        fileType.value = 'video'
        openFileSelector('video/*')
      },
    },
    {
      label: __('Documento'),
      icon: 'file',
      onClick: () => {
        fileType.value = 'document'
        openFileSelector()
      },
    },
  ]
}

async function uploadFile(file) {
  if (busy.value || !file?.file_url) return
  busy.value = true
  try {
    await call('doco_marketing.api.inbox.send_message', {
      reference_doctype: props.doctype,
      reference_name: props.docname,
      channel: 'messenger',
      attach: file.file_url,
    })
    emit('sent')
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo enviar el adjunto'))
  } finally {
    busy.value = false
  }
}

async function send() {
  const content = text.value.trim()
  if (CAT_RE.test(content)) {
    emit('catalog', content.replace(CAT_RE, ''))
    text.value = ''
    return
  }
  if (!content || busy.value) return
  busy.value = true
  // Optimistic-reply (#21): parent owns the pending bubble, keyed by this token.
  const clientToken = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  emit('sending', { clientToken, content })
  try {
    const serverId = await call('doco_marketing.api.inbox.send_message', {
      reference_doctype: props.doctype,
      reference_name: props.docname,
      channel: 'messenger',
      content,
    })
    text.value = ''
    emit('sent', { clientToken, serverId })
  } catch (e) {
    emit('failed', { clientToken })
    toast.error(e?.messages?.[0] || __('No se pudo enviar el mensaje'))
  } finally {
    busy.value = false
  }
}
</script>
