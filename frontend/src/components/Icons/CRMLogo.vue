<template>
  <svg
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    :aria-label="label"
  >
    <rect width="32" height="32" rx="9" :fill="PRODUCT_IDENTITY.color" />
    <path
      d="M19 8H14a8 8 0 0 0 0 16h4a7 7 0 0 0 7-7v-1"
      stroke="white"
      stroke-width="3"
      stroke-linecap="round"
    />
    <circle cx="24" cy="8" r="3" fill="white" />
  </svg>
</template>

<script setup>
import { PRODUCT_IDENTITY } from '@/utils/productIdentity'

defineProps({ label: { type: String, default: PRODUCT_IDENTITY.name } })
</script>
