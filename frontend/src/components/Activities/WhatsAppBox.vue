<!-- eslint-disable vue/no-v-html -->
<template>
  <!-- reply-to preview (reply mode only) -->
  <div
    v-if="mode === 'reply' && reply?.message"
    class="flex items-center justify-around gap-2 px-3 pt-2 sm:px-10"
  >
    <div
      class="mb-1 ml-13 flex-1 cursor-pointer rounded border-0 border-l-4 border-green-500 bg-surface-gray-2 p-2 text-base text-ink-gray-5"
      :class="reply.type == 'Incoming' ? 'border-green-500' : 'border-blue-400'"
    >
      <div
        class="mb-1 text-sm font-bold"
        :class="
          reply.type == 'Incoming' ? 'text-ink-green-2' : 'text-ink-blue-link'
        "
      >
        {{ reply.from_name || __('You') }}
      </div>
      <div
        class="max-h-12 overflow-hidden"
        v-html="sanitizeHTML(reply.message)"
      />
    </div>

    <Button variant="ghost" icon="x" @click="reply = {}" />
  </div>

  <!-- composer mode toggle: Reply / Private Note / Internal comment.
       Hidden in replyOnly (unassigned threads have no reference doc to attach
       notes/comments to — only the WhatsApp reply applies). -->
  <!-- single scrollable line on mobile (was wrapping into two rows) -->
  <div v-if="!replyOnly" class="flex items-center gap-2 overflow-x-auto px-3 pt-2 sm:flex-wrap sm:px-10 sm:pt-2.5">
    <button
      v-for="m in modes"
      :key="m.value"
      type="button"
      class="press flex-none whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold transition-colors"
      :class="
        mode === m.value
          ? m.activeClass
          : 'text-ink-gray-6 hover:bg-surface-gray-2'
      "
      @click="mode = m.value"
    >
      {{ m.icon }} {{ __(m.label) }}{{ m.value === 'reply' ? ` · ${channelLabel}` : '' }}
    </button>
    <span class="ml-auto hidden text-xs text-ink-gray-4 sm:inline">
      {{ mode === 'comment' ? __('Ctrl/⌘+Enter to send') : __('Enter to send') }}
    </span>
  </div>

  <!-- quick replies + templates (reply mode only). Collapsed on mobile to reclaim
       vertical space — one toggle expands/hides the whole chip set. -->
  <div v-if="mode === 'reply'" class="px-3 pt-2 sm:px-10">
    <button
      v-if="isMobile && !quickBarOpen"
      type="button"
      class="rounded-full bg-surface-gray-2 px-2.5 py-1 text-xs font-medium text-ink-gray-7"
      @click="quickBarOpen = true"
    >
      ⚡ {{ __('Plantillas y respuestas') }} ▾
    </button>
    <div v-show="!isMobile || quickBarOpen" class="flex flex-wrap items-center gap-1.5">
    <button
      type="button"
      class="press rounded-md bg-surface-green-2 px-2 py-1 text-xs font-semibold text-ink-green-3 hover:bg-surface-green-3"
      :title="__('Buscar y enviar artículos del catálogo (o escribe /cat)')"
      @click="emit('catalog', '')"
    >
      📦 {{ __('Catálogo') }}
    </button>
    <!-- ✨ AI suggested replies (spec 5.1) — fetch on demand, operator edits+sends -->
    <button
      v-if="aiEnabled && !replyOnly && ['CRM Deal', 'CRM Lead'].includes(doctype)"
      type="button"
      class="press rounded-md bg-surface-violet-1 px-2 py-1 text-xs font-semibold text-ink-violet-1 hover:opacity-80 disabled:opacity-50"
      :disabled="suggestLoading"
      :title="__('Sugerir respuestas con IA (local)')"
      @click="fetchSuggestions"
    >
      ✨ {{ suggestLoading ? __('Pensando…') : __('Sugerir') }}
    </button>
    <!-- mobile hides the ActivityHeader (its Send Template button) — keep the
         full template modal reachable from the composer -->
    <button
      v-if="isMobile && !replyOnly"
      type="button"
      class="press rounded-md border border-outline-gray-2 px-2 py-1 text-xs font-semibold text-ink-gray-7 hover:bg-surface-gray-2"
      :title="__('Enviar plantilla de WhatsApp')"
      @click="emit('openTemplates')"
    >
      📋 {{ __('Plantilla') }}
    </button>
    <button
      v-for="(qr, i) in quickReplies.data || []"
      :key="`qr-${i}`"
      type="button"
      class="rounded-md bg-surface-gray-2 px-2 py-1 text-xs font-medium text-ink-gray-7 hover:bg-surface-gray-3"
      :title="qr.text"
      @click="insertQuickReply(qr)"
    >
      ⚡ {{ qr.label }}
    </button>
    <button
      v-for="t in (replyOnly ? [] : (quickTemplates.data || []))"
      :key="`tpl-${t.name}`"
      type="button"
      class="rounded-md border border-outline-gray-2 px-2 py-1 text-xs font-medium text-ink-gray-7 hover:bg-surface-gray-2"
      :title="t.template"
      @click="emit('pickTemplate', t.name)"
    >
      📄 {{ t.name }}
    </button>
    <button
      type="button"
      class="rounded-md px-1.5 py-1 text-xs text-ink-gray-5 hover:bg-surface-gray-2"
      :title="__('Edit quick replies')"
      @click="openEditor"
    >
      <FeatherIcon name="edit-2" class="size-3.5" />
    </button>
    <button
      v-if="isMobile"
      type="button"
      class="rounded-full px-2 py-1 text-xs text-ink-gray-5 hover:bg-surface-gray-2"
      :title="__('Ocultar')"
      @click="quickBarOpen = false"
    >
      ▴
    </button>
    </div>
  </div>

  <!-- pending attach (catálogo photo etc.) — sent together with the edited text -->
  <div v-if="mode === 'reply' && whatsapp.attach" class="flex items-center px-3 pt-2 sm:px-10">
    <span class="inline-flex items-center gap-1.5 rounded-full bg-surface-gray-2 px-2.5 py-1 text-xs text-ink-gray-7">
      📎 {{ __('Foto adjunta — se envía con tu mensaje') }}
      <button
        type="button"
        class="press text-[13px] leading-none"
        :aria-label="__('Quitar adjunto')"
        @click="whatsapp.attach = ''; whatsapp.content_type = 'text'"
      >✕</button>
    </span>
  </div>

  <!-- ✨ suggestions (tap to insert into the composer; verbatim send attributes canned:ai) -->
  <div v-if="suggestions.length" class="flex flex-wrap items-center gap-1.5 px-3 pt-2 sm:px-10">
    <button
      v-for="(sg, i) in suggestions"
      :key="'sg' + i"
      type="button"
      class="press max-w-full truncate rounded-lg border border-outline-gray-2 bg-surface-white px-2.5 py-1.5 text-left text-xs text-ink-gray-8 hover:bg-surface-gray-2"
      :title="sg"
      @click="useSuggestion(sg)"
    >
      ✨ {{ sg }}
    </button>
    <button
      type="button"
      class="press rounded-full px-2 py-1 text-xs text-ink-gray-5 hover:bg-surface-gray-2"
      :aria-label="__('Descartar sugerencias')"
      @click="suggestions = []"
    >
      ✕
    </button>
  </div>

  <!-- input row -->
  <div class="flex items-end gap-2 px-3 py-2.5 sm:px-10" v-bind="$attrs">
    <div v-if="mode === 'reply' && !recording" class="flex h-8 items-center gap-2">
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
        @update:modelValue="
          () => {
            content += emoji
            $refs.textareaRef.el.focus()
            capture('whatsapp_emoji_added')
          }
        "
      >
        <SmileIcon
          class="flex size-4.5 cursor-pointer rounded-sm text-xl leading-none text-ink-gray-4"
          @click="togglePopover"
        />
      </IconPicker>
      <!-- voice note (spec 1.2) — hidden when MediaRecorder can't produce a
           Meta-compatible container on this browser -->
      <button
        v-if="recMime"
        type="button"
        class="press flex size-4.5 items-center justify-center text-ink-gray-5 hover:text-ink-gray-8"
        :title="__('Grabar nota de voz')"
        :aria-label="__('Grabar nota de voz')"
        @click="startRecording"
      >
        <LucideMic class="size-4.5" />
      </button>
    </div>
    <!-- recording bar replaces the textarea while capturing -->
    <div
      v-if="mode === 'reply' && recording"
      class="flex h-10 w-full items-center gap-3 rounded-lg border border-outline-red-2 bg-surface-red-1 px-3"
    >
      <span class="h-2.5 w-2.5 flex-none animate-pulse rounded-full" style="background: #e5484d" />
      <span class="w-12 flex-none font-mono text-[13px] font-semibold text-ink-gray-8">
        {{ Math.floor(recSecs / 60) }}:{{ String(recSecs % 60).padStart(2, '0') }}
      </span>
      <span class="min-w-0 flex-1 truncate text-[12px] text-ink-gray-6">{{ __('Grabando nota de voz…') }}</span>
      <button
        type="button"
        class="press flex-none rounded-md px-2.5 py-1 text-[12px] font-medium text-ink-gray-7 hover:bg-surface-gray-2"
        @click="cancelRecording"
      >
        {{ __('Cancelar') }}
      </button>
      <button
        type="button"
        class="press flex-none rounded-md px-3 py-1 text-[12px] font-bold text-white"
        style="background: #16a34a"
        :disabled="recUploading"
        @click="sendRecording"
      >
        {{ recUploading ? __('Enviando…') : __('Enviar') }}
      </button>
    </div>
    <Textarea
      v-if="mode !== 'comment' && !(mode === 'reply' && recording)"
      ref="textareaRef"
      v-model="content"
      type="textarea"
      class="min-h-8 w-full"
      :rows="rows"
      :placeholder="placeholder"
      @focus="rows = isMobile ? 3 : 6"
      @blur="rows = 1"
      @input="onTyping"
      @keydown.enter.stop="(e) => onEnter(e)"
    />
    <!-- Internal comment: mention-capable rich editor so @mentions notify
         (notify_mentions parses <span class="mention" data-id>…). Plain Enter
         is left to the editor (newline / pick mention); Ctrl/Cmd+Enter sends.
         Capture phase so we intercept before tiptap's own Enter handling. -->
    <div
      v-else
      class="w-full rounded border border-outline-gray-2 bg-surface-white px-2 py-1 dark:bg-surface-gray-2"
      @keydown.ctrl.enter.capture.prevent.stop="dispatchSend()"
      @keydown.meta.enter.capture.prevent.stop="dispatchSend()"
    >
      <TextEditor
        :key="commentEditorKey"
        :content="commentHtml"
        :editable="true"
        :editor-class="['prose-sm max-w-none min-h-[2rem]']"
        :mentions="users"
        :placeholder="placeholder"
        @change="commentHtml = $event"
      />
    </div>
    <Button
      v-if="mode !== 'reply'"
      :variant="'solid'"
      :theme="mode === 'note' ? 'orange' : 'blue'"
      :label="sendLabel"
      :disabled="sendDisabled"
      @click="dispatchSend()"
    />
  </div>

  <!-- quick replies editor -->
  <Dialog
    v-model="showEditor"
    :options="{ title: __('Quick replies'), size: 'lg' }"
  >
    <template #body-content>
      <p class="mb-3 text-sm text-ink-gray-5">
        {{ __('Shared with your whole team. Click a chip to drop its text into the reply box.') }}
      </p>
      <div class="flex flex-col gap-2">
        <div
          v-for="(row, i) in draft"
          :key="i"
          class="flex items-start gap-2"
        >
          <Input
            v-model="row.label"
            type="text"
            class="w-40 shrink-0"
            :placeholder="__('Label')"
          />
          <Textarea
            v-model="row.text"
            class="w-full"
            :rows="2"
            :placeholder="__('Message text…')"
          />
          <Button
            variant="ghost"
            icon="trash-2"
            class="mt-1 shrink-0"
            @click="draft.splice(i, 1)"
          />
        </div>
        <Button
          variant="subtle"
          icon-left="plus"
          :label="__('Add quick reply')"
          class="self-start"
          @click="draft.push({ label: '', text: '' })"
        />
      </div>
    </template>
    <template #actions>
      <div class="flex justify-end gap-2">
        <Button :label="__('Cancel')" @click="showEditor = false" />
        <Button
          variant="solid"
          :label="__('Save')"
          :loading="quickRepliesSave.loading"
          @click="saveQuickReplies"
        />
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import IconPicker from '@/components/IconPicker.vue'
import SmileIcon from '@/components/Icons/SmileIcon.vue'
import LucideMic from '~icons/lucide/mic'
import { sanitizeHTML } from '@/utils'
import { useTelemetry } from 'frappe-ui/frappe'
import {
  createResource,
  call,
  Textarea,
  TextEditor,
  Input,
  Dialog,
  FileUploader,
  Dropdown,
  Button,
  toast,
} from 'frappe-ui'
import { usersStore } from '@/stores/users'
import { isMobile } from '@/composables/breakpoint'
import { notifyTyping, aiEnabled, composerDraft } from '@/composables/inbox'
import { ref, nextTick, watch, computed, onBeforeUnmount } from 'vue'

const props = defineProps({
  doctype: { type: String, default: '' },
  // When the Deal has multiple Contacts, the parent tab strip overrides the
  // `to` number per active tab. Falls back to doc.mobile_no for single-Contact
  // Deals + all Leads (their .mobile_no IS the chat target).
  toOverride: { type: String, default: '' },
  channelLabel: { type: String, default: 'WhatsApp' },
  // Unassigned/orphan threads: only the WhatsApp reply applies (no reference doc
  // for notes/comments/templates). Sends a reference-less WhatsApp Message to the
  // number; it stays in the "Sin asignar" thread until the number is converted.
  replyOnly: { type: Boolean, default: false },
})

const emit = defineEmits(['pickTemplate', 'activity', 'sending', 'sent', 'failed', 'catalog', 'openTemplates'])

// /cat <query> (or /catálogo) in the composer opens the catalog picker instead of sending.
const CAT_RE = /^\/cat(alogo|álogo)?\b\s*/i
function maybeCatalog() {
  const txt = (content.value || '').trim()
  if (mode.value === 'reply' && CAT_RE.test(txt)) {
    emit('catalog', txt.replace(CAT_RE, ''))
    content.value = ''
    return true
  }
  return false
}

const doc = defineModel({ type: Object, default: () => ({}) })
const whatsapp = defineModel('whatsapp', { type: Object, default: () => ({}) })
const reply = defineModel('reply', { type: Object, default: () => ({}) })

const { capture } = useTelemetry()

const rows = ref(1)
const textareaRef = ref(null)
const emoji = ref('')
// composer quick-reply/template chips — collapsed on mobile (isMobile), always shown on desktop
const quickBarOpen = ref(false)

const content = ref('')
const fileType = ref('')

// Internal-comment rich editor (mentions). Remount via key to clear after send.
const commentHtml = ref('')
const commentEditorKey = ref(0)

const { users: usersList } = usersStore()
const users = computed(
  () =>
    usersList.data?.crmUsers
      ?.filter((u) => u.enabled)
      .map((u) => ({ label: u.full_name.trimEnd(), value: u.name })) || [],
)

const commentEmpty = computed(
  () => !commentHtml.value || commentHtml.value === '<p></p>',
)
const sendDisabled = computed(() =>
  mode.value === 'comment' ? commentEmpty.value : !content.value.trim(),
)

// ── composer modes ────────────────────────────────────────────────
const mode = ref('reply')
const modes = [
  {
    value: 'reply',
    icon: '↩',
    label: 'Reply',
    activeClass: 'bg-surface-green-2 text-ink-green-3',
  },
  {
    value: 'note',
    icon: '✐',
    label: 'Private note',
    activeClass: 'bg-surface-amber-2 text-ink-amber-3',
  },
  {
    value: 'comment',
    icon: '💬',
    label: 'Internal',
    activeClass: 'bg-surface-blue-2 text-ink-blue-3',
  },
]

const placeholder = computed(() => {
  if (mode.value === 'note') return __('Private note — only your team sees it…')
  if (mode.value === 'comment') return __('Internal comment for your team…')
  return __('Type your message here...')
})

const sendLabel = computed(() =>
  mode.value === 'note' ? __('Save note') : __('Comment'),
)

// ── quick replies (team-shared) + templates ───────────────────────
const quickReplies = createResource({
  url: 'crm.api.whatsapp.get_quick_replies',
  auto: true,
})

const quickTemplates = createResource({
  url: 'crm.api.whatsapp.get_quick_templates',
  params: { reference_doctype: props.doctype },
  auto: true,
})

// Track a quick reply dropped into an empty composer, so a verbatim send can be
// attributed as canned (doco_automation_source="canned:<label>"). Cleared the
// moment the agent edits or types anything else.
const lastCanned = ref(null)
function insertQuickReply(qr) {
  const text = typeof qr === 'string' ? qr : qr.text
  const wasEmpty = !content.value
  content.value = content.value
    ? `${content.value.replace(/\s*$/, '')} ${text}`
    : text
  lastCanned.value = wasEmpty && typeof qr !== 'string' ? { label: qr.label, text } : null
  nextTick(() => textareaRef.value?.el?.focus())
  capture('whatsapp_quick_reply_used')
}
// Drop the canned tag the moment the agent edits the inserted text — so a sent
// message is only attributed canned when it goes out verbatim.
watch(content, (v) => {
  if (lastCanned.value && (v || '').trim() !== lastCanned.value.text.trim()) lastCanned.value = null
})

const showEditor = ref(false)
const draft = ref([])

function openEditor() {
  draft.value = (quickReplies.data || []).map((r) => ({ ...r }))
  if (!draft.value.length) draft.value.push({ label: '', text: '' })
  showEditor.value = true
}

const quickRepliesSave = createResource({
  url: 'crm.api.whatsapp.save_quick_replies',
  onSuccess() {
    quickReplies.reload()
    showEditor.value = false
    toast.success(__('Quick replies saved'))
    capture('whatsapp_quick_replies_saved')
  },
  onError(error) {
    toast.error(error.messages?.[0] || __('Failed to save quick replies'))
  },
})

function saveQuickReplies() {
  const cleaned = draft.value
    .map((r) => ({ label: (r.label || '').trim(), text: (r.text || '').trim() }))
    .filter((r) => r.text)
  quickRepliesSave.submit({ quick_replies: JSON.stringify(cleaned) })
}

// ── send ──────────────────────────────────────────────────────────
function show() {
  nextTick(() => textareaRef.value.el.focus())
}

function uploadFile(file) {
  whatsapp.value.attach = file.file_url
  whatsapp.value.content_type = fileType.value
  sendWhatsAppMessage()
  capture('whatsapp_upload_file')
}

// ── voice notes (spec 1.2) ────────────────────────────────────────────────────
// MediaRecorder → upload_file → the normal attach send path (content_type audio).
// Container preference matters: Meta's media API accepts ogg/opus + mp4/aac but
// NOT webm — prefer the compatible ones and hide the mic when only webm exists.
const recMime = ['audio/ogg;codecs=opus', 'audio/mp4'].find(
  (m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m),
)
const recording = ref(false)
const recUploading = ref(false)
const recSecs = ref(0)
const REC_MAX_SECS = 300
let _rec = null
let _recChunks = []
let _recTimer = null
let _recStream = null

async function startRecording() {
  if (recording.value || !recMime) return
  try {
    _recStream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (e) {
    toast.error(__('Permiso de micrófono denegado'))
    return
  }
  _recChunks = []
  _rec = new MediaRecorder(_recStream, { mimeType: recMime })
  _rec.ondataavailable = (e) => e.data.size && _recChunks.push(e.data)
  _rec.start(1000)
  recording.value = true
  recSecs.value = 0
  _recTimer = setInterval(() => {
    recSecs.value++
    if (recSecs.value >= REC_MAX_SECS) sendRecording() // hard cap — never record forever
  }, 1000)
  capture('whatsapp_voice_record_start')
}

function _teardownRec() {
  clearInterval(_recTimer)
  _recStream?.getTracks().forEach((t) => t.stop())
  _recStream = null
  recording.value = false
}

function cancelRecording() {
  try {
    if (_rec && _rec.state !== 'inactive') _rec.stop()
  } catch (e) {}
  _teardownRec()
  _recChunks = []
}

async function sendRecording() {
  if (!_rec || recUploading.value) return
  recUploading.value = true
  try {
    const stopped = new Promise((res) => (_rec.onstop = res))
    try {
      if (_rec.state !== 'inactive') _rec.stop()
    } catch (e) {}
    await stopped
    _teardownRec()
    const blob = new Blob(_recChunks, { type: recMime.split(';')[0] })
    _recChunks = []
    if (blob.size < 1000) return // accidental tap — nothing worth sending
    const ext = recMime.startsWith('audio/ogg') ? 'ogg' : 'm4a'
    const fd = new FormData()
    fd.append('file', new File([blob], `nota-voz-${Date.now()}.${ext}`, { type: blob.type }))
    fd.append('is_private', '0')
    fd.append('doctype', props.doctype)
    fd.append('docname', doc.value.name || '')
    const r = await fetch('/api/method/upload_file', {
      method: 'POST',
      headers: { 'X-Frappe-CSRF-Token': window.csrf_token || '' },
      body: fd,
      credentials: 'include',
    })
    const j = await r.json()
    const url = j.message?.file_url
    if (!r.ok || !url) throw new Error('upload failed')
    whatsapp.value.attach = url
    whatsapp.value.content_type = 'audio'
    sendWhatsAppMessage()
    capture('whatsapp_voice_sent')
  } catch (e) {
    toast.error(__('No se pudo subir la nota de voz'))
  } finally {
    recUploading.value = false
  }
}

// composer draft handoff (catálogo / cobrar): apply once, then clear. The
// pending attach rides whatsapp.attach and goes out WITH the edited text.
watch(composerDraft, (d) => {
  if (!d) return
  mode.value = 'reply'
  content.value = d.text || ''
  if (d.attach) {
    whatsapp.value.attach = d.attach
    whatsapp.value.content_type = d.content_type || 'image'
  }
  if (d.canned && d.text) lastCanned.value = { label: d.canned, text: d.text }
  composerDraft.value = null
  nextTick(() => textareaRef.value?.el?.focus())
})

// ✨ suggested replies (spec 5.1) — on-demand local-AI drafts; inserting one
// marks lastCanned('ai: …') so a verbatim send is auditable as AI-assisted.
const suggestions = ref([])
const suggestLoading = ref(false)
async function fetchSuggestions() {
  if (suggestLoading.value) return
  suggestLoading.value = true
  suggestions.value = []
  try {
    const out = await call('doco_marketing.api.inbox.suggest_replies', {
      doctype: props.doctype,
      name: doc.value.name,
    })
    suggestions.value = Array.isArray(out) ? out : []
    if (!suggestions.value.length) toast.error(__('Sin sugerencias — intenta de nuevo'))
    capture('whatsapp_ai_suggest_fetched')
  } catch (e) {
    toast.error(__('No se pudieron generar sugerencias'))
  } finally {
    suggestLoading.value = false
  }
}
function useSuggestion(text) {
  content.value = text
  lastCanned.value = { label: 'ai', text }
  suggestions.value = []
  nextTick(() => textareaRef.value?.el?.focus())
  capture('whatsapp_ai_suggest_used')
}

// collision detection (spec 2.4): throttled 'está escribiendo' ping — only for
// conversations (Deal/Lead) and only in reply mode (notes/comments are private)
function onTyping() {
  if (mode.value === 'reply' && ['CRM Deal', 'CRM Lead'].includes(props.doctype)) notifyTyping()
}

function onEnter(event) {
  if (event.shiftKey) return
  event.preventDefault()
  dispatchSend()
}

function dispatchSend() {
  if (maybeCatalog()) return
  if (mode.value === 'reply') return sendTextMessage()
  if (mode.value === 'note') {
    if (!content.value.trim()) return
    return saveNote()
  }
  if (commentEmpty.value) return
  return saveComment()
}

function sendTextMessage() {
  sendWhatsAppMessage()
  content.value = ''
  // Keep the cursor in the box: operators fire several messages in a row, and
  // the old blur() forced a click back into the field after every Enter.
  nextTick(() => textareaRef.value?.el?.focus())
  capture('whatsapp_send_message')
}

async function sendWhatsAppMessage() {
  const canned =
    lastCanned.value && content.value.trim() === lastCanned.value.text.trim()
      ? lastCanned.value.label || ''
      : ''
  // Capture BEFORE clearing — the optimistic bubble + a failure-restore both need it.
  const sentContent = content.value
  const sentAttach = whatsapp.value.attach || ''
  const sentContentType = whatsapp.value.content_type
  let args = {
    reference_doctype: props.doctype,
    reference_name: doc.value.name,
    message: sentContent,
    to: props.toOverride || doc.value.mobile_no,
    attach: sentAttach,
    reply_to: reply.value?.name || '',
    content_type: sentContentType,
    canned,
  }
  content.value = ''
  lastCanned.value = null
  fileType.value = ''
  whatsapp.value.attach = ''
  whatsapp.value.content_type = 'text'
  reply.value = {}
  // Optimistic-reply lifecycle (#21): the PARENT (Activities) owns the pending bubble;
  // we only emit the lifecycle keyed by a client token. No in-thread state lives here.
  // Optimistic bubble only for TEXT sends. An attach-only send has empty content (the
  // backend coalesces it to the media), so a content-keyed bubble couldn't reconcile and
  // would flash a duplicate — attach-only keeps the plain reload path.
  const optimistic = !!sentContent.trim()
  const clientToken = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  if (optimistic)
    emit('sending', { clientToken, content: sentContent, attach: sentAttach, content_type: sentContentType, to: args.to })
  createResource({
    url: 'crm.api.whatsapp.create_whatsapp_message',
    params: args,
    auto: true,
    // data === the created WhatsApp Message name (serverId) → deterministic reconcile.
    onSuccess: (data) => {
      if (optimistic) emit('sent', { clientToken, serverId: data })
      whatsapp.value.reload()
    },
    onError: (error) => {
      if (optimistic) emit('failed', { clientToken })
      // Never lose the typed text: restore it, prepended ahead of any new draft started
      // in the brief send window, so a failed send is always recoverable.
      if (sentContent) content.value = content.value ? `${sentContent}\n${content.value}` : sentContent
      toast.error(error.messages?.[0] || __('Failed to send WhatsApp message'))
    },
  })
}

function toHTML(text) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<div>${escaped.replace(/\n/g, '<br>')}</div>`
}

async function saveNote() {
  const text = content.value.trim()
  const title = text.split('\n')[0].slice(0, 60) || __('Note')
  try {
    await call('frappe.client.insert', {
      doc: {
        doctype: 'FCRM Note',
        title,
        content: toHTML(text),
        reference_doctype: props.doctype,
        reference_docname: doc.value.name,
      },
    })
    content.value = ''
    emit('activity')
    toast.success(__('Note added'))
    capture('whatsapp_note_added')
  } catch (e) {
    toast.error(e.messages?.[0] || __('Failed to add note'))
  }
}

async function saveComment() {
  // commentHtml is editor HTML with proper <span class="mention" data-id>…
  // spans, so notify_mentions picks up @mentions and notifies them.
  const html = commentHtml.value
  try {
    await call('crm.api.comment.add_comment', {
      reference_doctype: props.doctype,
      reference_name: doc.value.name,
      content: html,
    })
    commentHtml.value = ''
    commentEditorKey.value++
    emit('activity')
    toast.success(__('Comment added'))
    capture('whatsapp_comment_added')
  } catch (e) {
    toast.error(e.messages?.[0] || __('Failed to add comment'))
  }
}

function uploadOptions(openFileSelector) {
  return [
    {
      label: __('Upload Document'),
      icon: 'file',
      onClick: () => {
        fileType.value = 'document'
        openFileSelector()
      },
    },
    {
      label: __('Upload Image'),
      icon: 'image',
      onClick: () => {
        fileType.value = 'image'
        openFileSelector('image/*')
      },
    },
    {
      label: __('Upload Video'),
      icon: 'video',
      onClick: () => {
        fileType.value = 'video'
        openFileSelector('video/*')
      },
    },
  ]
}

watch(reply, (value) => {
  if (value?.message) {
    mode.value = 'reply'
    show()
  }
})

// never leave the mic held open when the thread unmounts mid-recording
onBeforeUnmount(cancelRecording)

defineExpose({ show })
</script>
