<!-- Inbox Activity tab — unified timeline via crm.api.activities.get_activities. §5.1 -->
<template>
  <div class="scb flex-1 overflow-y-auto px-5 pb-6 pt-4">
    <div class="mb-3.5 flex items-center justify-between">
      <div class="text-[15px] font-bold text-ink-gray-9">{{ __('Línea de tiempo') }}</div>
      <div class="flex gap-1.5">
        <button
          v-for="f in filters"
          :key="f.key"
          class="rounded-full px-2.5 py-1 text-[11px] font-semibold"
          :style="
            activeFilter === f.key
              ? 'color:#fff;background:#1c2230'
              : 'color:#5b6472;background:#f1f2f4'
          "
          @click="activeFilter = f.key"
        >
          {{ f.label }} {{ counts[f.key] }}
        </button>
      </div>
    </div>

    <div v-if="resource.loading && !items.length" class="py-6 text-center text-xs text-ink-gray-4">
      {{ __('Cargando…') }}
    </div>
    <div v-else-if="!shown.length" class="py-6 text-center text-xs text-ink-gray-4">
      {{ __('Sin actividad') }}
    </div>

    <div v-else class="relative pl-[34px]">
      <div class="absolute bottom-1.5 left-3 top-1.5 w-0.5" style="background: #edeef1" />
      <div v-for="(a, i) in shown" :key="i" class="relative mb-4">
        <div
          class="absolute flex h-[26px] w-[26px] items-center justify-center rounded-full border text-[12px]"
          style="left: -34px"
          :style="iconStyle(a)"
        >
          {{ iconGlyph(a) }}
        </div>
        <div class="flex items-start gap-2">
          <span
            class="flex-none rounded px-1.5 py-px text-[11px] font-semibold"
            :style="iconStyle(a)"
          >
            {{ catLabel(a) }}
          </span>
          <span class="text-[12.5px] leading-snug text-ink-gray-7">{{ textOf(a) }}</span>
          <span class="ml-auto flex-none text-[12px] text-ink-gray-5">{{ timeAgo(a.creation) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { createResource } from 'frappe-ui'
import { activeDeal, timeAgo } from '@/composables/inbox'

const activeFilter = ref('all')
const filters = [
  { key: 'all', label: __('Todo') },
  { key: 'notes', label: __('Notas') },
  { key: 'msgs', label: __('Msgs') },
  { key: 'calls', label: __('Calls') },
]

const resource = createResource({ url: 'crm.api.activities.get_activities' })
watch(activeDeal, (d) => d && resource.submit({ name: d }), { immediate: true })

const items = computed(() => (Array.isArray(resource.data) ? resource.data : []))

function category(a) {
  const t = String(a.activity_type || '').toLowerCase()
  if (t === 'comment') return 'notes'
  if (t === 'communication' || t.includes('whatsapp')) return 'msgs'
  if (t.includes('call')) return 'calls'
  return 'other'
}
const counts = computed(() => {
  const c = { all: items.value.length, notes: 0, msgs: 0, calls: 0 }
  for (const a of items.value) {
    const cat = category(a)
    if (c[cat] !== undefined) c[cat]++
  }
  return c
})
const shown = computed(() =>
  activeFilter.value === 'all' ? items.value : items.value.filter((a) => category(a) === activeFilter.value),
)

function strip(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}
function textOf(a) {
  const d = a.data
  if (typeof d === 'string') return strip(d)
  return strip(d?.content || d?.subject || d?.message || a.activity_type)
}
const CAT = {
  notes: ['NOTA', '✐', '#2f6fed', '#eaf1fe'],
  msgs: ['MSG', '✆', '#1a8a3c', '#e9f7ef'],
  calls: ['LLAMADA', '☎', '#6b7280', '#f4f5f7'],
  other: ['EVENTO', '⟳', '#6b7280', '#f4f5f7'],
}
function catLabel(a) {
  return CAT[category(a)][0]
}
function iconGlyph(a) {
  return CAT[category(a)][1]
}
function iconStyle(a) {
  const [, , fg, bg] = CAT[category(a)]
  return `color:${fg};background:${bg};border-color:${fg}33`
}
</script>
