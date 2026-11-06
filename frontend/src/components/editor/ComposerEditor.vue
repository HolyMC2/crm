<template>
  <Editor
    ref="inner"
    v-model="content"
    :extensions="extensions"
    :placeholder="placeholder"
    :editable="editable"
    :upload-function="(file) => uploadFile(file, doctype, docname)"
  >
    <slot />
  </Editor>
</template>

<script setup>
// The composer's editor core: frappe-ui's Editor with the CRM extension list, built
// here so the TipTap code loads with this component and not with its callers.
import { Editor } from 'frappe-ui/editor'
import { computed, ref } from 'vue'
import { buildEditorExtensions, uploadFile } from '@/components/editor/config'
import { EmailParagraph } from '@/components/editor/emailParagraph'

const props = defineProps({
  placeholder: { type: String, default: null },
  editable: { type: Boolean, default: true },
  doctype: { type: String, default: null },
  docname: { type: String, default: null },
  // The mentionable users, as a getter so the list follows the store.
  mentions: { type: Function, default: null },
  // Emails keep paragraph classes (reply quoting) through the mail pipeline.
  email: { type: Boolean, default: false },
})
const content = defineModel({ type: String, default: '' })

const inner = ref(null)
const extensions = buildEditorExtensions({
  ...(props.mentions ? { mentions: props.mentions } : {}),
  ...(props.email
    ? { starterKit: { paragraph: false }, extra: [EmailParagraph] }
    : {}),
})
const editor = computed(() => inner.value?.editor)

defineExpose({ editor })
</script>
