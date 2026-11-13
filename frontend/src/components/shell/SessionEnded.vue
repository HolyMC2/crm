<template>
  <!-- The server said this browser is Guest after a refusal: the way on is to
       sign in again, never to ask for access (utils/sessionGuard.js). -->
  <section
    role="alert"
    data-testid="session-ended"
    class="mx-auto w-full max-w-lg space-y-4 p-6"
  >
    <h1 class="text-xl font-semibold text-ink-gray-9">
      {{ __('Your session ended') }}
    </h1>
    <p class="text-sm text-ink-gray-7">
      {{ __('Sign in again and you come back to this same screen.') }}
    </p>
    <div class="flex flex-wrap gap-2">
      <Button variant="solid" :label="__('Sign in')" @click="signIn" />
    </div>
  </section>
</template>
<script setup>
import { Button } from 'frappe-ui'
import { signInHref } from '@/utils/sessionGuard'

const props = defineProps({
  // The /crm route to come back to, as a router fullPath («/hoy», «/compras/…»).
  back: { type: String, default: '/' },
})
function signIn() {
  window.location.assign(signInHref(props.back))
}
</script>
