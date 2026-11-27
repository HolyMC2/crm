<template>
  <!-- The customer agent's product cards as the customer gets them in the chat: the
       photo, then «Nombre — $precio — Disponible» and the product page. A product
       without a photo is the text alone. «Probar» shows them full size; a review
       queue (`compact`) keeps each one a row with its photo beside the words. -->
  <ul v-if="cards.length" class="space-y-1.5" data-testid="product-cards">
    <li
      v-for="(card, index) in cards"
      :key="index"
      class="overflow-hidden rounded-6 bg-surface-gray-2 text-sm text-ink-gray-9"
      :class="
        compact ? 'flex items-center gap-3 p-1.5' : 'w-full max-w-[16rem]'
      "
      data-testid="product-card"
    >
      <img
        v-if="card.image"
        :src="card.image"
        alt=""
        loading="lazy"
        class="flex-none bg-surface-gray-3 object-cover"
        :class="compact ? 'size-16 rounded-5' : 'aspect-square w-full'"
        data-testid="product-card-photo"
      />
      <p
        class="min-w-0"
        :class="
          compact ? (card.image ? 'py-1 pr-2' : 'px-2 py-1') : 'px-3 py-2'
        "
      >
        <span class="font-semibold">{{ card.title }}</span>
        <span v-if="card.detail" class="num"> — {{ card.detail }}</span>
        <a
          v-if="card.link"
          :href="card.link"
          target="_blank"
          rel="noopener noreferrer"
          class="mt-0.5 block truncate text-ink-blue-9 underline underline-offset-2"
          >{{ linkLabel(card.link) }}</a
        >
      </p>
    </li>
  </ul>
</template>

<script setup>
import { linkLabel } from '@/components/asistente/clientes'

defineProps({
  cards: { type: Array, default: () => [] },
  compact: { type: Boolean, default: false },
})
</script>
