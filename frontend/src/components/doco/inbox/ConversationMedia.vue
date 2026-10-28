<!-- «Archivos, enlaces y docs», as in WhatsApp's contact info: a row with the
     count and the newest photos, opening a sheet with Multimedia / Enlaces /
     Docs. `sheet-only` mounts just the sheet (the chat's ⋮ menu opens it).
     Glyphs are inline SVG: importing more lucide icons here re-chunks the
     shared icons and pushes /crm/deals past its 60-file budget. -->
<template>
  <section
    v-if="!sheetOnly"
    class="border-b border-outline-gray-1 px-3.5 py-3"
    data-testid="conversation-media"
  >
    <button
      type="button"
      class="press flex min-h-11 w-full items-center gap-2 text-left"
      @click="sheetOpen = true"
    >
      <span class="flex-1 text-[14px] font-medium text-ink-gray-8">
        {{ __('Archivos, enlaces y docs') }}
      </span>
      <span class="num text-[13px] text-ink-gray-5">{{ total }}</span>
      <svg
        class="size-4 text-ink-gray-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
    <div v-if="split.media.length" class="mt-1 grid grid-cols-4 gap-1.5">
      <a
        v-for="item in split.media.slice(0, 4)"
        :key="item.key"
        :href="item.url"
        target="_blank"
        rel="noopener"
        class="relative block aspect-square overflow-hidden rounded-8 bg-surface-gray-2"
        :aria-label="item.kind === 'video' ? __('Video') : __('Foto')"
      >
        <img
          v-if="item.kind === 'image'"
          :src="item.url"
          alt=""
          loading="lazy"
          class="size-full object-cover"
        />
        <span
          v-else
          class="flex size-full items-center justify-center text-ink-gray-6"
        >
          <svg
            class="size-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <polygon points="6 3 20 12 6 21 6 3" />
          </svg>
        </span>
      </a>
    </div>
  </section>

  <BottomSheet
    v-model:open="sheetOpen"
    :title="__('Archivos, enlaces y docs')"
    flush
  >
    <div class="px-4 pb-2">
      <Segmented
        v-model="tab"
        :label="__('Archivos, enlaces y docs')"
        :options="tabs"
      />
    </div>
    <p
      v-if="loading && !shown.length"
      class="px-4 py-8 text-center text-sm text-ink-gray-5"
      aria-busy="true"
    >
      {{ __('Cargando…') }}
    </p>
    <p
      v-else-if="!shown.length"
      class="px-4 py-8 text-center text-sm text-ink-gray-5"
      data-testid="conversation-media-empty"
    >
      {{ emptyText }}
    </p>
    <template v-else>
      <div v-for="month in months" :key="month.label" class="pb-2">
        <h3 class="px-4 pb-1.5 pt-2 text-xs font-medium text-ink-gray-5">
          {{ month.label }}
        </h3>
        <div v-if="tab === 'media'" class="grid grid-cols-3 gap-0.5">
          <a
            v-for="item in month.items"
            :key="item.key"
            :href="item.url"
            target="_blank"
            rel="noopener"
            class="relative block aspect-square bg-surface-gray-2"
            :aria-label="item.kind === 'video' ? __('Video') : __('Foto')"
          >
            <img
              v-if="item.kind === 'image'"
              :src="item.url"
              alt=""
              loading="lazy"
              class="size-full object-cover"
            />
            <span
              v-else
              class="flex size-full items-center justify-center text-ink-gray-6"
            >
              <svg
                class="size-7"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <polygon points="6 3 20 12 6 21 6 3" />
              </svg>
            </span>
          </a>
        </div>
        <template v-else>
          <a
            v-for="item in month.items"
            :key="item.key"
            :href="item.url"
            target="_blank"
            rel="noopener"
            class="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-surface-gray-2"
          >
            <span
              class="flex size-10 flex-none items-center justify-center rounded-8 bg-surface-gray-2 text-[10px] font-semibold text-ink-gray-7"
              aria-hidden="true"
            >
              <svg
                v-if="tab === 'links'"
                class="size-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path
                  d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
                />
                <path
                  d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
                />
              </svg>
              <template v-else>{{ item.ext || __('Doc') }}</template>
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[14px] text-ink-gray-9">
                {{ tab === 'links' ? item.host : item.name }}
              </span>
              <span class="block truncate text-[12px] text-ink-gray-5">
                {{ tab === 'links' ? item.url : detail(item) }}
              </span>
            </span>
          </a>
        </template>
      </div>
    </template>
  </BottomSheet>
</template>

<script setup>
import { computed, ref, toRef } from 'vue'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import Segmented from '@/components/ui/Segmented.vue'
import { useConversationMedia } from '@/composables/conversationMedia'
import { convertSize } from '@/utils'
import { shellBoot } from '@/composables/muelleShell'

const props = defineProps({
  doctype: { type: String, required: true },
  name: { type: String, required: true },
  sheetOnly: { type: Boolean, default: false },
})
const sheetOpen = defineModel('open', { type: Boolean, default: false })

const { split, loading } = useConversationMedia(
  toRef(props, 'doctype'),
  toRef(props, 'name'),
)
const tab = ref('media')
const total = computed(
  () =>
    split.value.media.length +
    split.value.docs.length +
    split.value.links.length,
)
const tabs = computed(() => [
  { value: 'media', label: __('Multimedia'), count: split.value.media.length },
  { value: 'links', label: __('Enlaces'), count: split.value.links.length },
  { value: 'docs', label: __('Docs'), count: split.value.docs.length },
])
const shown = computed(() => split.value[tab.value] || [])
const emptyText = computed(
  () =>
    ({
      media: __('Sin fotos ni videos en esta conversación.'),
      links: __('Nadie ha compartido enlaces en esta conversación.'),
      docs: __('Sin documentos en esta conversación.'),
    })[tab.value],
)
// dates in the worker's language: the shell's locale, else the page's
const locale = computed(
  () =>
    String(shellBoot.value?.locale || '').replace('_', '-') ||
    document.documentElement.lang ||
    undefined,
)
function dateText(at, options) {
  const date = new Date(String(at).replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale.value, options).format(date)
}
// WhatsApp groups the tabs by month, newest first
const months = computed(() => {
  const groups = []
  for (const item of shown.value) {
    const label = item.at
      ? dateText(item.at, { month: 'long', year: 'numeric' })
      : ''
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(item)
    else groups.push({ label, items: [item] })
  }
  return groups
})
function detail(item) {
  return [
    item.size ? convertSize(item.size) : '',
    item.at
      ? dateText(item.at, { day: 'numeric', month: 'short', year: 'numeric' })
      : '',
  ]
    .filter(Boolean)
    .join(' · ')
}
</script>
