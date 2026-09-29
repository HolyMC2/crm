<!--
  Text input that remembers: suggests values typed before for the same `scope`
  (fieldMemory: server + local copy, ranked by context, prefix, use and
  recency). Static `suggestions` (for example the deal's own recipients) are
  listed first. Keyboard: ↑/↓ move, Enter picks the highlighted suggestion
  (otherwise emits `enter`), Esc closes. Remembering is the caller's job, on a
  successful send (fieldMemory.remember).
-->
<template>
  <div class="relative" :class="$attrs.class">
    <input
      ref="inputEl"
      :value="modelValue"
      :type="type"
      :placeholder="placeholder"
      :aria-label="ariaLabel || placeholder"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="showList"
      :aria-controls="listId"
      :aria-activedescendant="
        showList && active >= 0 ? optId(active) : undefined
      "
      autocomplete="off"
      :class="inputClass"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onKeydown"
    />
    <ul
      v-if="showList"
      :id="listId"
      role="listbox"
      class="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-outline-gray-2 bg-surface-base p-1 shadow-lg"
      @mousedown.prevent
    >
      <li
        v-for="(s, i) in options"
        :id="optId(i)"
        :key="s.value"
        role="option"
        :aria-selected="i === active"
        class="flex cursor-pointer items-center gap-2 truncate rounded-md px-2 py-1 text-sm text-ink-gray-8"
        :class="i === active ? 'bg-surface-gray-2' : 'hover:bg-surface-gray-1'"
        @mouseenter="active = i"
        @click="choose(s.value)"
      >
        <span class="min-w-0 flex-1 truncate">{{ s.value }}</span>
        <span
          v-if="s.static"
          class="flex-none text-[10px] uppercase tracking-wide text-ink-gray-4"
          >{{ staticLabel }}</span
        >
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { suggest, MEMORY_LIMIT } from '@/composables/fieldMemory'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  modelValue: { type: String, default: '' },
  scope: { type: String, required: true },
  context: { type: String, default: '' },
  suggestions: { type: Array, default: () => [] },
  staticLabel: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  ariaLabel: { type: String, default: '' },
  type: { type: String, default: 'text' },
  inputClass: {
    type: [String, Array, Object],
    default:
      'w-full rounded border border-outline-gray-2 bg-surface-gray-2 px-2 py-1.5 text-sm text-ink-gray-8 placeholder-ink-gray-4 focus:border-outline-gray-4 focus:bg-surface-base focus:outline-none focus:ring-0',
  },
})
const emit = defineEmits(['update:modelValue', 'pick', 'enter'])

const uid = `mem-${Math.random().toString(36).slice(2, 8)}`
const listId = `${uid}-list`
const optId = (i) => `${uid}-opt-${i}`

const inputEl = ref(null)
const focused = ref(false)
const dismissed = ref(false)
const memory = ref([])
const active = ref(-1)
let timer = null
let seq = 0

function norm(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

const options = computed(() => {
  const typed = norm(props.modelValue)
  const out = []
  const seen = new Set()
  const add = (value, isStatic) => {
    const k = norm(value)
    if (!k || seen.has(k)) return
    if (typed && !k.includes(typed)) return
    seen.add(k)
    out.push({ value: String(value), static: isStatic })
  }
  for (const s of props.suggestions || []) add(s, true)
  for (const s of memory.value) add(s, false)
  const list = out.slice(0, MEMORY_LIMIT)
  // Hide the lone suggestion that equals what is already typed.
  return list.length === 1 && norm(list[0].value) === typed ? [] : list
})

const showList = computed(
  () => focused.value && !dismissed.value && options.value.length > 0,
)

function load() {
  clearTimeout(timer)
  const mine = ++seq
  timer = setTimeout(async () => {
    const rows = await suggest(
      props.scope,
      props.modelValue || '',
      props.context || null,
    )
    if (mine === seq) memory.value = rows
  }, 180)
}

function onInput(e) {
  emit('update:modelValue', e.target.value)
  dismissed.value = false
  active.value = -1
  load()
}
function onFocus() {
  focused.value = true
  dismissed.value = false
  load()
}
function onBlur() {
  focused.value = false
  active.value = -1
}

function choose(value) {
  emit('update:modelValue', value)
  emit('pick', value)
  dismissed.value = true
  active.value = -1
}

function onKeydown(e) {
  if (e.isComposing) return
  const n = options.value.length
  if (showList.value && e.key === 'ArrowDown') {
    e.preventDefault()
    active.value = (active.value + 1) % n
  } else if (showList.value && e.key === 'ArrowUp') {
    e.preventDefault()
    active.value = active.value <= 0 ? n - 1 : active.value - 1
  } else if (e.key === 'Escape' && showList.value) {
    e.preventDefault()
    e.stopPropagation()
    dismissed.value = true
  } else if (
    e.key === 'Enter' &&
    !e.ctrlKey &&
    !e.metaKey &&
    showList.value &&
    active.value >= 0
  ) {
    e.preventDefault()
    e.stopPropagation()
    choose(options.value[active.value].value)
  } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
    emit('enter', e)
  }
}

onBeforeUnmount(() => clearTimeout(timer))

defineExpose({ focus: () => inputEl.value?.focus() })
</script>
