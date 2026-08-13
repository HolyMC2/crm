<!--
  One record as a phone card (Tratos / Leads mobile lists).

  The desktop table can't shrink into a phone: at 390px it kept two columns and
  dropped the customer, the phone and the repair — the columns the shop actually
  reads. A card gives every row four legible lines instead, at a 64px+ touch
  target, with the row menu on its own 40px hit area so tapping "open" never
  fires the menu by accident.

  Layout is fixed on purpose (title / subtitle / chips / time); callers fill the
  chips slot with whatever their record has — stage, RO, score, money.
-->
<template>
  <div
    role="button"
    tabindex="0"
    class="press flex w-full items-start gap-2.5 border-b border-outline-gray-1 px-3.5 py-2.5 active:bg-surface-gray-2"
    @click="$emit('open')"
    @keydown.enter="$emit('open')"
  >
    <span
      class="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-full text-[12.5px] font-semibold"
      :style="`background:${avatarColor(title || '?')[0]};color:${avatarColor(title || '?')[1]}`"
      aria-hidden="true"
    >
      {{ initials(title || '?') }}
    </span>

    <div class="min-w-0 flex-1">
      <div class="flex items-baseline gap-2">
        <span class="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink-gray-9">{{ title || '—' }}</span>
        <span v-if="time" class="flex-none text-[11px] text-ink-gray-4">{{ time }}</span>
      </div>
      <div v-if="subtitle" class="truncate text-[11.5px] text-ink-gray-5">{{ subtitle }}</div>
      <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
        <slot name="chips" />
      </div>
    </div>

    <Dropdown :options="menu" @click.stop>
      <button
        class="-mr-1 flex h-10 w-8 flex-none items-center justify-center text-[15px] leading-none text-ink-gray-4"
        :aria-label="__('Más acciones')"
        @click.stop
      >
        ···
      </button>
    </Dropdown>
  </div>
</template>

<script setup>
import { Dropdown } from 'frappe-ui'
import { avatarColor, initials } from '@/composables/crmFormat'

defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  time: { type: String, default: '' },
  menu: { type: Array, default: () => [] },
})
defineEmits(['open'])
</script>
