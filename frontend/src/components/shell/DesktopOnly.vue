<template>
  <!-- Shell D3: a set-up screen built for a desk (campaigns, forms, social,
       automations, score rules, webshop) opened on a phone or a narrow
       window. Say so, and give the way back. -->
  <main
    class="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 py-10 text-center"
    data-testid="desktop-only"
  >
    <span class="lucide-monitor size-10 text-ink-gray-5" aria-hidden="true" />
    <h1 class="text-lg font-semibold text-ink-gray-9">
      {{ __('Open it on a computer') }}
    </h1>
    <p class="max-w-xs text-base text-ink-gray-6">
      {{
        __(
          'This section needs a wider screen. Open Muelle on a computer to use it.',
        )
      }}
    </p>
    <Button
      size="md"
      class="mt-2 min-h-11"
      :label="__('Go back')"
      @click="goBack"
    />
  </main>
</template>
<script setup>
import { useRouter } from 'vue-router'
import { Button } from 'frappe-ui'

const router = useRouter()

function goBack() {
  if (window.history.state?.back) router.back()
  else router.replace({ name: 'Home' })
}
</script>
