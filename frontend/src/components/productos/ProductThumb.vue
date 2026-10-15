<template>
  <span
    class="relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg"
    :class="[
      image && !broken ? 'bg-surface-white ring-1 ring-outline-gray-1' : tone,
    ]"
    aria-hidden="true"
  >
    <img
      v-if="image && !broken"
      :src="image"
      alt=""
      class="h-full w-full object-cover"
      :loading="eager ? 'eager' : 'lazy'"
      decoding="async"
      @error="broken = true"
    />
    <span v-else class="font-semibold tracking-wide" :class="textClass">{{
      letters
    }}</span>
  </span>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { initials, tileTone } from '@/composables/useProductos'

// A product's photo, or a tidy initials tile in its group's colour.
const props = defineProps({
  image: { type: String, default: '' },
  title: { type: String, default: '' },
  toneKey: { type: String, default: '' },
  textClass: { type: String, default: 'text-sm' },
  eager: { type: Boolean, default: false },
})
const broken = ref(false)
watch(
  () => props.image,
  () => (broken.value = false),
)
const letters = computed(() => initials(props.title))
const tone = computed(() => tileTone(props.toneKey || props.title))
</script>
