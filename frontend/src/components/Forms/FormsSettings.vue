<template>
  <!-- Settings → Forms: forms have their own page now; this entry points there -->
  <div class="flex h-full flex-col gap-4 px-8 py-8 text-ink-gray-8">
    <h2 class="text-2xl-semibold leading-none">{{ __('Forms') }}</h2>
    <p class="max-w-lg text-p-base text-ink-gray-6">
      {{
        __(
          'Forms have their own page now: build a form from a template, choose who follows up, share its link or QR code, and see every submission.',
        )
      }}
    </p>
    <div>
      <Button variant="solid" :label="__('Open Forms')" @click="open" />
    </div>
  </div>
</template>

<script setup>
import { Button } from 'frappe-ui'
import { showSettings } from '@/composables/settings'
import { useRouter } from 'vue-router'

const router = useRouter()
function open() {
  showSettings.value = false
  router.push({ name: 'Forms' })
}
</script>
