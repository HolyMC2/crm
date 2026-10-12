<template>
  <div class="ag-search" :class="{ 'is-open': open }">
    <button
      v-if="!open"
      type="button"
      class="ag-search__btn"
      :aria-label="__('Search events')"
      :title="__('Search events')"
      @click="start"
    >
      <span class="lucide-search h-5 w-5" aria-hidden="true" />
    </button>
    <template v-else>
      <span
        class="lucide-search h-4 w-4 shrink-0 text-ink-gray-6"
        aria-hidden="true"
      />
      <input
        ref="input"
        v-model="text"
        class="ag-search__input"
        :placeholder="__('Search events')"
        :aria-label="__('Search events')"
        autocomplete="off"
        @keydown.esc.prevent="stop"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="choose(results[active])"
      />
      <button
        type="button"
        class="ag-search__btn"
        :aria-label="__('Close')"
        @click="stop"
      >
        <span class="lucide-x h-4 w-4" aria-hidden="true" />
      </button>
      <ul
        v-if="text.trim().length >= 2"
        class="ag-search__results"
        role="listbox"
      >
        <li v-if="loading && !results.length" class="ag-search__hint">
          {{ __('Searching…') }}
        </li>
        <li v-else-if="!results.length" class="ag-search__hint">
          {{ __('No events found') }}
        </li>
        <li
          v-for="(row, index) in results"
          :key="row.name"
          role="option"
          :aria-selected="index === active"
        >
          <button
            type="button"
            class="ag-search__row"
            :class="{ 'is-active': index === active }"
            @mouseenter="active = index"
            @click="choose(row)"
          >
            <span
              class="ag-search__dot"
              :style="{ background: row.color || fallbackColor }"
            />
            <span class="min-w-0 flex-1 truncate">{{ row.subject }}</span>
            <span class="shrink-0 text-xs text-ink-gray-6">{{
              when(row)
            }}</span>
          </button>
        </li>
      </ul>
    </template>
  </div>
</template>
<script setup>
import { nextTick, ref, watch } from 'vue'
import { call, debounce } from 'frappe-ui'

// Finds events by title across all dates (native list permissions apply) and jumps to one.
const props = defineProps({
  locale: { type: String, default: undefined },
  fallbackColor: { type: String, default: '#039be5' },
})
const emit = defineEmits(['pick'])
const open = ref(false)
const text = ref('')
const results = ref([])
const loading = ref(false)
const active = ref(0)
const input = ref(null)

async function start() {
  open.value = true
  await nextTick()
  input.value?.focus()
}
function stop() {
  open.value = false
  text.value = ''
  results.value = []
}
let request = 0
const run = debounce(async (query) => {
  const mine = ++request
  loading.value = true
  try {
    const rows = await call('frappe.client.get_list', {
      doctype: 'Event',
      fields: [
        'name',
        'subject',
        'starts_on',
        'all_day',
        'color',
        'repeat_this_event',
      ],
      filters: [['subject', 'like', `%${query}%`]],
      order_by: 'starts_on desc',
      limit_page_length: 12,
    })
    if (mine === request) {
      results.value = rows || []
      active.value = 0
    }
  } catch {
    if (mine === request) results.value = []
  } finally {
    if (mine === request) loading.value = false
  }
}, 250)
watch(text, (value) => {
  const query = value.trim()
  if (query.length < 2) {
    request++
    results.value = []
    return
  }
  run(query.slice(0, 80))
})
function move(step) {
  if (!results.value.length) return
  active.value =
    (active.value + step + results.value.length) % results.value.length
}
function choose(row) {
  if (!row) return
  emit('pick', row)
  stop()
}
function when(row) {
  const value = new Date(String(row.starts_on).replace(' ', 'T'))
  if (Number.isNaN(value.getTime())) return ''
  return new Intl.DateTimeFormat(props.locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(value)
}
defineExpose({ start })
</script>
<style scoped>
.ag-search {
  position: relative;
  display: flex;
  align-items: center;
}
.ag-search.is-open {
  gap: 6px;
  width: min(360px, 40vw);
  height: 40px;
  padding: 0 4px 0 12px;
  border-radius: 999px;
  background: var(--surface-gray-2);
}
.ag-search__btn {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  color: var(--ink-gray-7);
}
.ag-search.is-open .ag-search__btn {
  width: 32px;
  height: 32px;
}
.ag-search__btn:hover {
  background: var(--surface-gray-3);
}
.ag-search__input {
  flex: 1 1 auto;
  min-width: 0;
  height: 36px;
  padding: 0;
  border: 0;
  background: transparent;
  font-size: 14px;
  color: var(--ink-gray-9);
  box-shadow: none;
  outline: none;
}
.ag-search__results {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 70;
  max-height: 360px;
  overflow-y: auto;
  padding: 6px 0;
  border-radius: 12px;
  background: var(--surface-elevation-2, var(--surface-base));
  box-shadow:
    0 10px 30px -6px rgba(0, 0, 0, 0.35),
    0 0 0 1px var(--outline-gray-1);
}
.ag-search__hint {
  padding: 10px 16px;
  font-size: 13px;
  color: var(--ink-gray-6);
}
.ag-search__row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 40px;
  padding: 0 14px;
  font-size: 14px;
  text-align: left;
  color: var(--ink-gray-8);
}
.ag-search__row.is-active {
  background: var(--surface-gray-2);
}
.ag-search__dot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 999px;
}
</style>
