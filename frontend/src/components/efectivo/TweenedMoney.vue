<template>
  <!-- An amount that counts to its new value when the cash moves. -->
  <span class="num">{{ money(shown, currency) }}</span>
</template>
<script setup>
import { useTween } from '@/composables/tween'
import { money } from './efectivo'

const props = defineProps({
  value: { type: Number, default: 0 },
  currency: { type: String, default: 'MXN' },
})
const shown = useTween(() => props.value)
</script>
