<template>
  <!-- «¿Olvidaste tu contraseña?» under a password the account asks for again
       (cancel, a new RFC): doco mails this user Frappe's own link to set a new
       one (miplan.password_reset), for someone who signs in by a link or
       forgot it. A refusal says why and offers support. -->
  <div class="space-y-2" data-testid="olvido-contrasena">
    <button
      v-if="phase !== 'sent'"
      type="button"
      class="press -ml-2 inline-flex min-h-11 items-center rounded-full px-2 text-sm font-medium text-ink-gray-7 active:bg-surface-gray-2 disabled:opacity-50 [@media(hover:hover)]:hover:bg-surface-gray-2"
      :disabled="phase === 'sending'"
      data-testid="olvido-enviar"
      @click="send"
    >
      {{
        phase === 'sending'
          ? __('Sending the link…', null, 'Cuenta')
          : __('Forgot your password?', null, 'Cuenta')
      }}
    </button>
    <p
      v-if="text"
      :role="phase === 'sent' ? 'status' : 'alert'"
      class="text-sm"
      :class="phase === 'sent' ? 'text-ink-gray-8' : 'text-ink-red-7'"
      data-testid="olvido-respuesta"
    >
      {{ text }}
    </p>
    <Button
      v-if="next"
      class="min-h-11"
      :label="next.label"
      @click="$emit('act', next.act)"
    />
  </div>
</template>
<script setup>
import { ref } from 'vue'
import { Button } from 'frappe-ui'
import { mutate } from './api'
import { failureText, refusalView } from './autoservicio'

// «act»: a next step the sheet's parent takes once the sheet is closed (support).
defineEmits(['act'])

const phase = ref('idle')
const text = ref('')
const next = ref(null)

async function send() {
  if (phase.value === 'sending') return
  phase.value = 'sending'
  text.value = ''
  next.value = null
  try {
    const out = await mutate('password_reset')
    if (out?.ok === true) {
      phase.value = 'sent'
      text.value =
        (typeof out.message === 'string' && out.message) ||
        __(
          'We sent you an email with a link to set a new password.',
          null,
          'Cuenta',
        )
      return
    }
    const refused = refusalView(
      out,
      __(
        'We could not send you the link. Ask support for help.',
        null,
        'Cuenta',
      ),
    )
    phase.value = 'refused'
    text.value = refused.text
    next.value = refused.next
  } catch (error) {
    phase.value = 'refused'
    text.value = failureText(error)
  }
}
</script>
