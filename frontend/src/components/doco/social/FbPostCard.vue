<!--
  FbPostCard — a reusable, Facebook-app-faithful post card. Used to (a) show the
  parent post above a comment thread and (b) preview a planned post in the social
  calendar composer. Pure presentational: pass a normalized post object.

  props:
    pageName   — the publishing Page's name
    pageAvatar — Page avatar URL (falls back to an initialed circle)
    message    — post caption
    images     — array of image URLs (FB-style 1/2/3/4+ grid)
    timeLabel  — e.g. "6 mar" or "Programado · 5 jul 14:00"
    reactions/comments/shares — counts (null hides the engagement row)
    permalink  — opens the post on FB (null = not a link)
    cta        — { label, button } link-card footer (e.g. WhatsApp)
    showActions — render the Me gusta / Comentar / Compartir bar
-->
<template>
  <component
    :is="permalink ? 'a' : 'div'"
    :href="permalink || undefined"
    :target="permalink ? '_blank' : undefined"
    rel="noopener"
    class="block overflow-hidden rounded-xl border border-outline-gray-2 bg-surface-base shadow-sm"
  >
    <!-- header -->
    <div class="flex items-center gap-2.5 px-3 pt-3">
      <img v-if="pageAvatar" :src="pageAvatar" class="h-10 w-10 flex-none rounded-full object-cover" :alt="pageName" />
      <span
        v-else
        class="flex h-10 w-10 flex-none items-center justify-center rounded-full text-[15px] font-bold text-white"
        style="background: #1877f2"
      >{{ (pageName || 'F').slice(0, 1).toUpperCase() }}</span>
      <div class="min-w-0 flex-1">
        <div class="truncate text-[14px] font-semibold leading-tight text-ink-gray-9">{{ pageName || __('Página de Facebook') }}</div>
        <div class="flex items-center gap-1 text-[11.5px] text-ink-gray-5">
          <span class="truncate">{{ timeLabel || '' }}</span>
          <span v-if="timeLabel">·</span>
          <svg viewBox="0 0 16 16" class="h-3 w-3 flex-none fill-current"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zM2.5 8a5.5 5.5 0 011-3.2c.2.5.6.9 1.1 1 .5.2.5.7.2 1.1-.3.4-.1.9.3 1.1.5.2.5.8 0 1.1-.4.2-.5.8-.2 1.2.3.4.1.9-.3 1.1-.2.1-.4.3-.4.6A5.5 5.5 0 012.5 8zm6 5.4V12c0-.6-.4-1-1-1-.8 0-1.5-.7-1.5-1.5S6.7 8 7.5 8H9c.6 0 1-.4 1-1 0-.4.3-.8.7-.9A5.5 5.5 0 018.5 13.4z"/></svg>
        </div>
      </div>
    </div>

    <!-- caption -->
    <div v-if="message" class="whitespace-pre-wrap [overflow-wrap:anywhere] px-3 py-2 text-[13.5px] leading-snug text-ink-gray-9">{{ message }}</div>

    <!-- media (FB-style grid) -->
    <div v-if="shown.length" class="mt-1 grid gap-0.5" :class="gridClass">
      <div
        v-for="(im, i) in shown"
        :key="i"
        class="relative overflow-hidden bg-surface-gray-2"
        :class="[i === 0 && images.length === 3 ? 'row-span-2' : '', tall ? 'aspect-[4/5]' : 'aspect-square']"
      >
        <img :src="im" class="h-full w-full object-cover" :alt="__('imagen')" />
        <div
          v-if="i === shown.length - 1 && extra > 0"
          class="absolute inset-0 flex items-center justify-center bg-black/45 text-[22px] font-bold text-white"
        >+{{ extra }}</div>
      </div>
    </div>

    <!-- CTA link card (WhatsApp / Webshop) -->
    <div v-if="cta" class="flex items-center justify-between gap-2 border-t border-outline-gray-1 bg-surface-gray-1 px-3 py-2">
      <span class="truncate text-[12.5px] text-ink-gray-6">{{ cta.label }}</span>
      <span class="flex-none rounded-md bg-surface-gray-3 px-3 py-1 text-[12px] font-semibold text-ink-gray-8">{{ cta.button || __('Más info') }}</span>
    </div>

    <!-- engagement counts -->
    <div v-if="hasCounts" class="flex items-center gap-3 border-t border-outline-gray-1 px-3 py-1.5 text-[12px] text-ink-gray-5">
      <span class="inline-flex items-center gap-1">
        <span class="flex h-4 w-4 items-center justify-center rounded-full text-[9px] text-white" style="background: #1877f2">👍</span>
        {{ reactions ?? 0 }}
      </span>
      <span class="ml-auto">{{ comments ?? 0 }} {{ __('comentarios') }}</span>
      <span>{{ shares ?? 0 }} {{ __('compartidos') }}</span>
    </div>

    <!-- action bar -->
    <div v-if="showActions" class="grid grid-cols-3 border-t border-outline-gray-1 text-[13px] font-semibold text-ink-gray-6">
      <span class="flex items-center justify-center gap-1.5 py-2">👍 {{ __('Me gusta') }}</span>
      <span class="flex items-center justify-center gap-1.5 border-x border-outline-gray-1 py-2">💬 {{ __('Comentar') }}</span>
      <span class="flex items-center justify-center gap-1.5 py-2">↗ {{ __('Compartir') }}</span>
    </div>
  </component>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  pageName: { type: String, default: '' },
  pageAvatar: { type: String, default: '' },
  message: { type: String, default: '' },
  images: { type: Array, default: () => [] },
  timeLabel: { type: String, default: '' },
  reactions: { type: Number, default: null },
  comments: { type: Number, default: null },
  shares: { type: Number, default: null },
  permalink: { type: String, default: '' },
  cta: { type: Object, default: null },
  showActions: { type: Boolean, default: false },
})

// at most 4 tiles; the 4th carries a "+N" overlay for the rest
const shown = computed(() => props.images.slice(0, 4))
const extra = computed(() => Math.max(0, props.images.length - 4))
const tall = computed(() => props.images.length === 1)
// 1 image = full width; 2/3/4+ = a 2-col grid (the 3-image case spans the first tile
// across both rows via row-span in the template).
const gridClass = computed(() => (props.images.length <= 1 ? 'grid-cols-1' : 'grid-cols-2'))
const hasCounts = computed(() => props.reactions != null || props.comments != null || props.shares != null)
</script>
