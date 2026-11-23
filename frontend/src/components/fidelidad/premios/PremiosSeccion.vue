<template>
  <!-- One of Fidelidad's «Premios» sections: the board's open section on
       desktop (HoySection), a titled block of the «Premios» view on a phone. -->
  <HoySection v-if="desk" :id="id" :title="title" :icon="icon">
    <slot />
  </HoySection>
  <section v-else :aria-labelledby="`${id}-titulo`">
    <h2
      :id="`${id}-titulo`"
      class="title-face px-4 text-lg font-semibold leading-tight text-ink-gray-9"
    >
      {{ title }}
    </h2>
    <slot />
  </section>
</template>
<script setup>
import HoySection from '@/components/hoy/HoySection.vue'

defineProps({
  id: { type: String, required: true },
  title: { type: String, required: true },
  icon: { type: String, default: 'lucide-gift' },
  desk: { type: Boolean, default: false },
})
</script>
