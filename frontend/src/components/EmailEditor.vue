<template>
  <Editor
    ref="textEditor"
    v-model="content"
    :extensions="extensions"
    :placeholder="placeholder"
    :editable="editable"
    :upload-function="(file) => uploadFile(file, doctype, modelValue.name)"
  >
    <div class="relative w-full">
      <SlashCommandMenu
        v-if="slashEnabled && slashOpen"
        ref="slashMenu"
        searchable
        :query="slashQuery"
        :items="slashItems"
        :active-index="slashIndex"
        :loading="catalogLoading"
        :catalog="catalog"
        :reference-doctype="doctype"
        :reference-name="modelValue?.name || ''"
        channel="email"
        @update:query="setSlashQuery"
        @keydown="onSlashSearchKeydown"
        @blur="onSlashBlur"
        @hover="setSlashIndex"
        @pick="(item) => slash.pick(item)"
      />
      <div class="flex flex-col gap-3">
        <div
          v-if="from.length"
          class="mx-4 flex items-center gap-2 border-t pt-2.5 h-10"
        >
          <span class="text-xs text-ink-gray-4">{{ __('FROM') }}:</span>
          <FormControl
            v-model="fromEmail"
            type="select"
            variant="ghost"
            class="w-full"
            :placeholder="__('')"
            :options="from"
          />
        </div>
        <div
          class="mx-4 flex items-center gap-2"
          :class="from.length ? '' : 'border-t pt-2.5'"
        >
          <span class="text-xs text-ink-gray-4 mr-2">{{ __('TO') }}:</span>
          <EmailMultiSelect
            v-model="toEmails"
            class="flex-1"
            variant="ghost"
            :validate="validateEmail"
            :fetchContacts="true"
            :error-message="
              (value) => __('{0} is an invalid email address', [value])
            "
          />
          <div class="flex gap-1.5">
            <Button
              :label="__('CC')"
              variant="ghost"
              :class="[
                cc
                  ? '!bg-surface-gray-4 hover:bg-surface-gray-3'
                  : '!text-ink-gray-4',
              ]"
              @click="toggleCC()"
            />
            <Button
              :label="__('BCC')"
              variant="ghost"
              :class="[
                bcc
                  ? '!bg-surface-gray-4 hover:bg-surface-gray-3'
                  : '!text-ink-gray-4',
              ]"
              @click="toggleBCC()"
            />
          </div>
        </div>
        <div v-if="cc" class="mx-4 flex items-center gap-2">
          <span class="text-xs text-ink-gray-4">{{ __('CC') }}:</span>
          <EmailMultiSelect
            ref="ccInput"
            v-model="ccEmails"
            class="flex-1"
            variant="ghost"
            :fetchContacts="true"
            :validate="validateEmail"
            :error-message="
              (value) => __('{0} is an invalid email address', [value])
            "
          />
        </div>
        <div v-if="bcc" class="mx-4 flex items-center gap-2">
          <span class="text-xs text-ink-gray-4">{{ __('BCC') }}:</span>
          <EmailMultiSelect
            ref="bccInput"
            v-model="bccEmails"
            class="flex-1"
            variant="ghost"
            :fetchContacts="true"
            :validate="validateEmail"
            :error-message="
              (value) => __('{0} is an invalid email address', [value])
            "
          />
        </div>
        <div class="mx-4 flex items-center gap-2 pb-2.5">
          <span class="text-xs text-ink-gray-4">{{ __('SUBJECT') }}:</span>
          <MemoryInput
            v-if="commandsEnabled"
            v-model="subject"
            class="flex-1"
            scope="email.subject"
            :context="modelValue?.name || ''"
            :aria-label="__('SUBJECT')"
            input-class="w-full border-none text-ink-gray-9 text-base bg-surface-base hover:bg-surface-base focus:border-none focus:!shadow-none focus-visible:!ring-0"
          />
          <input
            v-else
            v-model="subject"
            class="flex-1 border-none text-ink-gray-9 text-base bg-surface-base hover:bg-surface-base focus:border-none focus:!shadow-none focus-visible:!ring-0"
          />
        </div>
      </div>
      <div @keydown.capture="onBodyKeydown">
        <EditorContent
          :class="[
            'prose-sm max-w-none [&_p.reply-to-content]:hidden',
            editable && 'mx-4 max-h-[35vh] overflow-y-auto border-t py-3',
          ]"
        />
      </div>
      <EditorTableMenu />
      <div v-if="editable" class="flex flex-col gap-2">
        <div class="flex flex-wrap gap-2 px-4">
          <AttachmentItem
            v-for="a in attachments"
            :key="a.file_url"
            :label="a.file_name"
          >
            <template #suffix>
              <span
                class="lucide-x h-3.5"
                aria-hidden="true"
                @click.stop="removeAttachment(a)"
              />
            </template>
          </AttachmentItem>
        </div>
        <div
          class="flex justify-between gap-2 overflow-hidden border-t px-4 py-2.5"
        >
          <div class="flex gap-1 items-center overflow-x-auto">
            <Button
              :tooltip="__('Insert Email Template')"
              variant="ghost"
              :icon="EmailTemplateIcon"
              @click="showEmailTemplateSelectorModal = true"
            />
            <Button
              v-if="slashEnabled"
              :tooltip="__('Comandos y plantillas (/)')"
              :aria-label="__('Comandos y plantillas')"
              variant="ghost"
              class="font-mono"
              label="/"
              @click="openSlash(false)"
            />
            <FileUploader
              :upload-args="{
                doctype: doctype,
                docname: modelValue.name,
                private: true,
              }"
              @success="(f) => attachments.push(f)"
            >
              <template #default="{ openFileSelector }">
                <Button
                  :tooltip="__('Attach a File')"
                  :icon="AttachmentIcon"
                  variant="ghost"
                  @click="openFileSelector()"
                />
              </template>
            </FileUploader>
            <EditorFixedMenu :items="fullToolbar" />
            <IconPicker
              v-slot="{ togglePopover }"
              v-model="emoji"
              @update:modelValue="() => appendEmoji()"
            >
              <Button
                :tooltip="__('Insert Emoji')"
                :icon="SmileIcon"
                variant="ghost"
                @click="togglePopover()"
              />
            </IconPicker>
          </div>
          <div class="mt-2 flex items-center justify-end space-x-2 sm:mt-0">
            <Button v-bind="discardButtonProps || {}" :label="__('Discard')" />
            <Button
              variant="solid"
              v-bind="submitButtonProps || {}"
              :label="`${__('Send')} (${submitShortcutLabel})`"
            />
          </div>
        </div>
      </div>
    </div>
  </Editor>
  <EmailTemplateSelectorModal
    v-model="showEmailTemplateSelectorModal"
    :doctype="doctype"
    @apply="applyEmailTemplate"
  />
  <SendDocumentDialog
    v-if="commandsEnabled"
    v-model="docDialog.open"
    :reference-doctype="doctype"
    :reference-name="modelValue?.name || ''"
    :doctype="docDialog.doctype"
    channel="email"
    :catalog="catalog"
    @sent="(res) => emit('documentSent', res)"
  />
  <SaveTemplateDialog
    v-if="commandsEnabled"
    v-model="saveDialog.open"
    :body="saveDialog.body"
    @saved="() => loadCatalog({ fresh: true })"
  />
</template>

<script setup>
import IconPicker from '@/components/IconPicker.vue'
import SmileIcon from '@/components/Icons/SmileIcon.vue'
import EmailTemplateIcon from '@/components/Icons/EmailTemplateIcon.vue'
import AttachmentIcon from '@/components/Icons/AttachmentIcon.vue'
import AttachmentItem from '@/components/AttachmentItem.vue'
import EmailMultiSelect from '@/components/Controls/EmailMultiSelect.vue'
import EmailTemplateSelectorModal from '@/components/Modals/EmailTemplateSelectorModal.vue'
import SlashCommandMenu from '@/components/Composer/SlashCommandMenu.vue'
import SendDocumentDialog from '@/components/Composer/SendDocumentDialog.vue'
import SaveTemplateDialog from '@/components/Composer/SaveTemplateDialog.vue'
import MemoryInput from '@/components/Composer/MemoryInput.vue'
import { useSlashMenu, textToHtml } from '@/composables/slashCommands'
import {
  useComposerCommands,
  renderTemplate,
} from '@/composables/composerCommands'
import {
  buildEditorExtensions,
  fullToolbar,
  uploadFile,
} from '@/components/editor/config'
import { FileUploader, call, FormControl } from 'frappe-ui'
import {
  Editor,
  EditorContent,
  EditorFixedMenu,
  EditorTableMenu,
} from 'frappe-ui/editor'
import { useTelemetry } from 'frappe-ui/frappe'
import { useDocument } from '@/data/document'
import { validateEmail, submitShortcutLabel } from '@/utils'
import Paragraph from '@tiptap/extension-paragraph'
import { ref, computed, nextTick, inject, watch } from 'vue'

const props = defineProps({
  placeholder: { type: String, default: null },
  editable: { type: Boolean, default: true },
  doctype: { type: String, default: 'CRM Lead' },
  subject: { type: String, default: __('Email From Lead') },
  editorProps: { type: Object, default: () => ({}) },
  submitButtonProps: { type: Object, default: () => ({}) },
  discardButtonProps: { type: Object, default: () => ({}) },
})

const CustomParagraph = Paragraph.extend({
  addAttributes() {
    return {
      class: {
        default: null,
        renderHTML: (attributes) => {
          if (!attributes.class) {
            return {}
          }
          return {
            class: `${attributes.class}`,
          }
        },
      },
    }
  },
})

const emit = defineEmits(['documentSent'])
const modelValue = defineModel({ type: Object })
const attachments = defineModel('attachments', {
  type: Array,
  default: () => [],
})
const content = defineModel('content', { type: String, default: '' })

const { capture } = useTelemetry()
const { user: sessionUser } = inject('session')
const { document: user } = useDocument('User', sessionUser)

const textEditor = ref(null)
const cc = ref(false)
const bcc = ref(false)
const emoji = ref('')

const subject = ref(props.subject)
const fromEmail = ref('')
const toEmails = ref(modelValue.value.email ? [modelValue.value.email] : [])
const ccEmails = ref([])
const bccEmails = ref([])
const ccInput = ref(null)
const bccInput = ref(null)

const extensions = buildEditorExtensions({
  starterKit: { paragraph: false },
  extra: [CustomParagraph],
})

const from = computed(() => {
  if (!user.doc || !user.doc.user_emails?.length) return []
  let emails = user.doc.user_emails.map((e) => {
    return {
      label: e.email_account + ' <' + e.email_id + '>',
      value: e.email_id,
    }
  })

  if (emails.length == 1 && emails[0].email_id === sessionUser) return []

  return emails
})

watch(
  from,
  (fromOptions) => {
    if (!fromOptions.find((f) => f.value === fromEmail.value)) {
      fromEmail.value = fromOptions.length ? fromOptions[0].value : ''
    }
  },
  { immediate: true },
)

const editor = computed(() => textEditor.value?.editor)

function removeAttachment(attachment) {
  attachments.value = attachments.value.filter((a) => a !== attachment)
}

const showEmailTemplateSelectorModal = ref(false)

async function applyEmailTemplate(template) {
  let data = await call(
    'frappe.email.doctype.email_template.email_template.get_email_template',
    {
      template_name: template.name,
      doc: modelValue.value,
    },
  )

  if (template.subject) {
    subject.value = data.subject
  }

  if (template.response) {
    content.value = data.message
  }
  showEmailTemplateSelectorModal.value = false
  capture('email_template_applied', { doctype: props.doctype })
}

function appendEmoji() {
  editor.value.commands.insertContent(emoji.value)
  editor.value.commands.focus()
  emoji.value = ''
  capture('emoji_inserted_in_email', { emoji: emoji.value })
}

// ── / command palette (doco_marketing addon only) ─────────────────────────────
// `/` typed into an EMPTY body (or the toolbar "/" button) opens the palette
// with its own search box; the `/` itself is not inserted. Esc puts it back.
const commands = useComposerCommands({
  channel: 'email',
  reference: () => ({ doctype: props.doctype, name: modelValue.value?.name }),
})
const {
  catalog,
  catalogLoading,
  loadCatalog,
  docDialog,
  saveDialog,
  enabled: commandsEnabled,
} = commands
const slashEnabled = computed(() => commandsEnabled.value && props.editable)
const slash = useSlashMenu({
  source: () => commands.items.value,
  onPick: onSlashPick,
})
const {
  open: slashOpen,
  query: slashQuery,
  ranked: slashItems,
  activeIndex: slashIndex,
} = slash
const setSlashIndex = (i) => (slashIndex.value = i)
const setSlashQuery = (q) => {
  slashQuery.value = q
  slashIndex.value = 0
}
function onSlashBlur() {
  slash.close()
  slashFromKey = false
}
const slashMenu = ref(null)
let slashFromKey = false

function bodyIsEmptyAtCaret() {
  const ed = editor.value
  if (!ed) return false
  if (ed.isEmpty) return true
  const { $from, empty } = ed.state.selection
  return empty && $from.parent.textContent === '' && $from.index(0) === 0
}

function openSlash(fromKey) {
  if (!slashEnabled.value) return
  slashFromKey = fromKey
  slash.show()
  if (!catalog.value && !catalogLoading.value) loadCatalog()
  nextTick(() => slashMenu.value?.focus())
}

function onBodyKeydown(e) {
  if (
    e.key !== '/' ||
    e.ctrlKey ||
    e.metaKey ||
    e.altKey ||
    e.isComposing ||
    !slashEnabled.value ||
    !bodyIsEmptyAtCaret()
  )
    return
  e.preventDefault()
  e.stopPropagation()
  openSlash(true)
}

// Mobile keyboards often report key "Unidentified": catch a body that is just "/".
watch(content, () => {
  const ed = editor.value
  if (!slashEnabled.value || slashOpen.value || !ed) return
  if (ed.getText().trim() === '/') {
    ed.commands.clearContent(true)
    openSlash(true)
  }
})

function closeSlash({ restore = false } = {}) {
  const typed = slashQuery.value
  slash.close()
  const ed = editor.value
  if (!ed) return
  if (restore && slashFromKey) ed.commands.insertContent(`/${typed}`)
  slashFromKey = false
  ed.commands.focus()
}

function onSlashSearchKeydown(e) {
  if (e.key === 'Escape' && slashOpen.value) {
    e.preventDefault()
    e.stopPropagation()
    return closeSlash({ restore: true })
  }
  slash.onKeydown(e)
}

async function onSlashPick(item) {
  if (!item.available) return
  const kind = item.payload?.kind
  if (kind === 'templates') {
    slashQuery.value = ''
    slash.scope.value = 'templates'
    slashIndex.value = 0
    nextTick(() => slashMenu.value?.focus())
    return
  }
  closeSlash()
  if (kind === 'document') return commands.openDocument(item.payload.doctype)
  if (kind === 'save_template')
    return commands.openSaveTemplate(editor.value?.getText() || '')
  let text = item.payload?.text || item.payload?.body || ''
  if (item.type === 'template') {
    const r = await renderTemplate(
      item.payload,
      props.doctype,
      modelValue.value?.name,
    )
    text = r.text
  }
  if (!text) return
  editor.value?.chain().focus().insertContent(textToHtml(text)).run()
  capture('email_composer_template_inserted', { type: item.type })
}

function toggleCC() {
  cc.value = !cc.value
  if (cc.value) nextTick(() => ccInput.value.setFocus())
}

function toggleBCC() {
  bcc.value = !bcc.value
  if (bcc.value) nextTick(() => bccInput.value.setFocus())
}

defineExpose({
  editor,
  subject,
  cc,
  bcc,
  fromEmail,
  toEmails,
  ccEmails,
  bccEmails,
})
</script>
