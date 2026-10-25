<template>
  <!-- A plain code editor (no heavy dependency): monospace text, a line
       number gutter that follows the scroll, Tab / Shift+Tab indent, the
       failing line marked in red. -->
  <div
    class="flex overflow-hidden rounded-6 border border-outline-gray-2 bg-surface-base font-mono text-sm"
    :style="{ height }"
  >
    <div
      ref="gutter"
      class="flex-none select-none overflow-hidden border-r border-outline-gray-1 bg-surface-gray-1 px-2 text-right text-ink-gray-5"
      :style="{ paddingTop: PAD, paddingBottom: PAD, lineHeight: LINE }"
      aria-hidden="true"
    >
      <div
        v-for="n in lines"
        :key="n"
        :class="n === errorLine ? 'font-semibold text-ink-red-7' : ''"
      >
        {{ n }}
      </div>
    </div>
    <textarea
      ref="area"
      :value="modelValue"
      :readonly="readonly"
      :aria-label="label"
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      wrap="off"
      class="min-w-0 flex-1 resize-none border-0 bg-transparent px-3 text-ink-gray-9 focus:outline-none focus:ring-0"
      :style="{ paddingTop: PAD, paddingBottom: PAD, lineHeight: LINE }"
      data-testid="impresion-editor"
      @input="emit('update:modelValue', $event.target.value)"
      @scroll="sync"
      @keydown="onKey"
    />
  </div>
</template>
<script setup>
import { computed, nextTick, ref } from 'vue'
import { applyTab, insertAt, lineCount } from './impresion'

const props = defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: 'Código' },
  readonly: { type: Boolean, default: false },
  /** The line a render error points at (1-based), marked in the gutter. */
  errorLine: { type: Number, default: 0 },
  height: { type: String, default: '60vh' },
})
const emit = defineEmits(['update:modelValue', 'save'])
const PAD = '8px'
const LINE = '20px'
const area = ref(null)
const gutter = ref(null)
const lines = computed(() => lineCount(props.modelValue))
let escaped = false

function sync() {
  if (gutter.value && area.value) gutter.value.scrollTop = area.value.scrollTop
}

async function apply(result) {
  emit('update:modelValue', result.text)
  await nextTick()
  const el = area.value
  if (!el) return
  el.value = result.text
  el.setSelectionRange(result.start, result.end)
}

function onKey(event) {
  const el = event.target
  if (event.key === 's' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    emit('save')
    return
  }
  // Esc, then Tab, leaves the editor (keyboard users are never trapped).
  if (event.key === 'Escape') {
    escaped = true
    return
  }
  const leave = escaped
  escaped = false
  if (event.key !== 'Tab' || props.readonly || event.altKey || leave) return
  event.preventDefault()
  apply(applyTab(el.value, el.selectionStart, el.selectionEnd, event.shiftKey))
}

/** Insert a field snippet at the caret (the «Campos» list on desktop). */
function insert(snippet) {
  const el = area.value
  if (!el || props.readonly) return
  apply(insertAt(el.value, el.selectionStart, el.selectionEnd, snippet))
  el.focus()
}

/** Put the caret on a line (an error's line). */
function goToLine(line) {
  const el = area.value
  if (!el || !line) return
  const rows = el.value.split('\n')
  const at = rows.slice(0, line - 1).reduce((n, r) => n + r.length + 1, 0)
  el.focus()
  el.setSelectionRange(at, at + (rows[line - 1] || '').length)
  el.scrollTop = Math.max(0, (line - 4) * 20)
  sync()
}

defineExpose({ insert, goToLine })
</script>
