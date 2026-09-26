<template>
  <div class="flex size-8 shrink-0 items-center justify-center">
    <img
      v-if="brand?.logo && failedUrl !== brand.logo"
      :key="brand.logo"
      :src="brand.logo"
      :alt="brand.name || PRODUCT_IDENTITY.name"
      class="h-full w-full object-contain"
      @error="failedUrl = brand.logo"
    />
    <CRMLogo
      v-else
      class="h-full w-full"
      :label="brand?.name || PRODUCT_IDENTITY.name"
    />
  </div>
</template>

<script setup>
import CRMLogo from '@/components/Icons/CRMLogo.vue'
import { PRODUCT_IDENTITY } from '@/utils/productIdentity'
import { ref, watch } from 'vue'

const brand = defineModel({ type: Object, default: () => ({}) })
const failedUrl = ref('')
watch(
  () => brand.value?.logo,
  () => {
    failedUrl.value = ''
  },
)
</script>
