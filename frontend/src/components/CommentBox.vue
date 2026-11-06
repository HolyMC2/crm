<template>
  <ComposerEditor
    v-if="opened"
    ref="commentEditor"
    v-model="content"
    :mentions="() => users"
    :placeholder="placeholder"
    :editable="editable"
    :doctype="doctype"
    :docname="modelValue.name"
  >
    <div class="relative w-full">
      <EditorContent
        :class="[
          'prose-sm max-w-none',
          editable &&
            'mx-4 max-h-[50vh] min-h-[7rem] overflow-y-auto border-t py-3',
        ]"
      />
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
                  variant="ghost"
                  :icon="AttachmentIcon"
                  @click="openFileSelector()"
                />
              </template>
            </FileUploader>
            <ComposerToolbar />
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
              :label="`${__('Comment')} (${submitShortcutLabel})`"
            />
          </div>
        </div>
      </div>
    </div>
  </ComposerEditor>
</template>
<script setup>
import IconPicker from '@/components/IconPicker.vue'
import SmileIcon from '@/components/Icons/SmileIcon.vue'
import AttachmentIcon from '@/components/Icons/AttachmentIcon.vue'
import AttachmentItem from '@/components/AttachmentItem.vue'
import { submitShortcutLabel } from '@/utils'
import { usersStore } from '@/stores/users'
import { useTelemetry } from '@framework/ui'
import { FileUploader } from 'frappe-ui'
import {
  ComposerEditor,
  ComposerToolbar,
  EditorContent,
  EditorTableMenu,
} from '@/components/editor/lazy'
import { ref, computed, watch } from 'vue'

const props = defineProps({
  placeholder: { type: String, default: null },
  editable: { type: Boolean, default: true },
  doctype: { type: String, default: 'CRM Lead' },
  editorProps: { type: Object, default: () => ({}) },
  submitButtonProps: { type: Object, default: () => ({}) },
  discardButtonProps: { type: Object, default: () => ({}) },
})

const modelValue = defineModel({ type: Object })
const attachments = defineModel('attachments', {
  type: Array,
  default: () => [],
})
const content = defineModel('content', { type: String, default: '' })

const { users: usersList } = usersStore()
const { capture } = useTelemetry()

const commentEditor = ref(null)
// The editor core mounts the first time the box opens and stays (EmailEditor
// does the same): a record page that never comments loads no editor.
const opened = ref(props.editable)
watch(
  () => props.editable,
  (editable) => {
    if (editable) opened.value = true
  },
)
const emoji = ref('')

const editor = computed(() => commentEditor.value?.editor)

// Resolves with the TipTap instance once the lazy editor has mounted.
function editorReady() {
  return new Promise((resolve) => {
    if (editor.value) return resolve(editor.value)
    const stop = watch(editor, (instance) => {
      if (!instance) return
      stop()
      resolve(instance)
    })
  })
}

const users = computed(
  () =>
    usersList.data?.crmUsers
      ?.filter((user) => user.enabled)
      .map((user) => ({
        id: user.name,
        label: user.full_name?.trim() || user.name,
      })) || [],
)

function appendEmoji() {
  editor.value.commands.insertContent(emoji.value)
  editor.value.commands.focus()
  emoji.value = ''
  capture('emoji_inserted_in_comment', { emoji: emoji.value })
}

function removeAttachment(attachment) {
  attachments.value = attachments.value.filter((a) => a !== attachment)
}

defineExpose({ editor, editorReady })
</script>
