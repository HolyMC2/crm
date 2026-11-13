<template>
  <!-- «Cambiar correo»: the new address and the password, then the code doco
       mailed to the new address, then the change, which signs this browser
       out with every other one. A request still waiting opens on its code. -->
  <BottomSheet
    :open="open"
    :title="t('Change email')"
    :dismissible="!busy && (phase !== 'changing' || slow)"
    @update:open="(value) => !value && close()"
  >
    <div class="space-y-4 pb-2" data-testid="correo-sheet">
      <!-- Muelle's own mail did not follow a change already made. -->
      <div
        v-if="keptNote && (phase === 'form' || phase === 'code')"
        class="space-y-2 border-b border-outline-gray-1 pb-4"
        data-testid="correo-facturas"
      >
        <p class="text-base text-ink-gray-8">{{ keptNote }}</p>
        <Button
          class="min-h-11"
          :label="t('Report a problem')"
          data-testid="correo-reportar"
          @click="report(keptReport)"
        />
      </div>

      <form
        v-if="phase === 'form'"
        id="perfil-correo"
        class="space-y-4"
        novalidate
        @submit.prevent="send"
      >
        <p class="break-words text-base text-ink-gray-8">
          {{ t('You sign in with {0}.', [current]) }}
        </p>
        <label class="block">
          <span class="text-sm text-ink-gray-7">{{ t('New email') }}</span>
          <input
            ref="emailInput"
            v-model="email"
            type="email"
            inputmode="email"
            autocomplete="email"
            autocapitalize="off"
            spellcheck="false"
            maxlength="140"
            class="mt-1 h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9"
            data-testid="correo-nuevo"
            @input="refusal = ''"
          />
        </label>
        <label class="block">
          <span class="text-sm text-ink-gray-7">{{ t('Your password') }}</span>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            class="mt-1 h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9"
            data-testid="correo-contrasena"
            @input="refusal = ''"
          />
        </label>
      </form>

      <template v-else-if="phase === 'code'">
        <p
          class="break-words text-base text-ink-gray-8"
          role="status"
          data-testid="correo-enviado"
        >
          {{ sentLine }}
        </p>
        <label class="block">
          <span class="text-sm text-ink-gray-7">{{ t('Code') }}</span>
          <input
            ref="codeInput"
            :value="code"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="9"
            class="num mt-1 h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-xl text-ink-gray-9"
            data-testid="correo-codigo"
            @input="codeTyped"
            @keydown.enter.prevent="confirm"
          />
        </label>
      </template>

      <div
        v-else-if="phase === 'changing'"
        class="space-y-2 py-2"
        role="status"
        data-testid="correo-cambiando"
      >
        <p class="flex items-center gap-2 text-base text-ink-gray-8">
          <span
            class="lucide-loader-circle size-5 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          {{ t('Changing your email…') }}
        </p>
        <p v-if="target" class="break-words text-base text-ink-gray-8">
          {{
            t('When it ends, you sign in with {0} and the same password.', [
              target,
            ])
          }}
        </p>
        <p v-if="slow" class="text-sm text-ink-gray-7">
          {{
            t(
              'This is taking longer than usual. You can close this screen: you will sign in with the new email once it ends, or with your current one if it does not.',
            )
          }}
        </p>
      </div>

      <div
        v-else-if="phase === 'done'"
        class="space-y-2 py-2"
        role="status"
        data-testid="correo-listo"
      >
        <p class="break-words text-base font-medium text-ink-gray-9">
          {{
            target
              ? t('Done. You now sign in with {0}.', [target])
              : t('Your session ended. Sign in with your new email.')
          }}
        </p>
        <p v-if="doneBilling" class="text-base text-ink-gray-8">
          {{ doneBilling }}
        </p>
      </div>

      <div
        v-else-if="phase === 'failed'"
        class="space-y-2 py-2"
        role="alert"
        data-testid="correo-fallo"
      >
        <p class="break-words text-base text-ink-gray-8">
          {{
            t('We could not change your email. You still sign in with {0}.', [
              current,
            ])
          }}
        </p>
        <!-- The change signs every device out before the rename: with the
             session gone, a report cannot be sent from here. -->
        <p
          v-if="sessionGone"
          class="text-base text-ink-gray-8"
          data-testid="correo-fallo-sesion"
        >
          {{ t('Your session ended. Sign in again with that email.') }}
        </p>
        <Button
          v-else
          class="min-h-11"
          :label="t('Report a problem')"
          data-testid="correo-fallo-reportar"
          @click="report(t('I could not change the email I sign in with.'))"
        />
      </div>

      <!-- Right under the fields: doco's refusal, else what the field still
           lacks (why the filled button waits). Typing clears the refusal. -->
      <p
        v-if="refusal"
        role="alert"
        class="text-sm text-ink-red-7"
        data-testid="correo-error"
      >
        {{ refusal }}
      </p>
      <p
        v-else-if="gap"
        id="perfil-correo-falta"
        class="text-sm text-ink-gray-7"
        role="status"
      >
        {{ gap }}
      </p>
      <!-- What the code step offers, then what confirming does, next to the
           button that confirms. -->
      <template v-if="phase === 'code'">
        <div class="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            class="min-h-11"
            :label="t('Send another code')"
            :loading="busy === 'resend'"
            :disabled="Boolean(busy)"
            data-testid="correo-reenviar"
            @click="resend"
          />
          <Button
            variant="ghost"
            class="min-h-11"
            :label="t('Use another email')"
            :disabled="Boolean(busy)"
            data-testid="correo-otro"
            @click="toForm"
          />
        </div>
        <p class="text-sm text-ink-gray-6">
          {{
            t(
              'When you confirm, every device signs out, this one too. You sign in again with the new email and the same password.',
            )
          }}
        </p>
      </template>
      <p v-if="phase === 'form'" class="text-sm text-ink-gray-6">
        {{
          t(
            'We send a code to the new email. You keep signing in with this one until you type the code here.',
          )
        }}
      </p>
      <div v-if="phase === 'form' && forgot !== 'hidden'" class="space-y-1">
        <button
          v-if="forgot !== 'sent'"
          type="button"
          class="press -ml-2 inline-flex min-h-11 items-center rounded-full px-2 text-sm font-medium text-ink-gray-7 active:bg-surface-gray-2 disabled:opacity-50 [@media(hover:hover)]:hover:bg-surface-gray-2"
          :disabled="forgot === 'sending'"
          data-testid="correo-olvido"
          @click="sendLink"
        >
          {{
            forgot === 'sending'
              ? t('Sending the link…')
              : t('Forgot your password?')
          }}
        </button>
        <p
          v-if="forgotText"
          class="text-sm"
          :class="forgot === 'sent' ? 'text-ink-gray-8' : 'text-ink-red-7'"
          :role="forgot === 'sent' ? 'status' : 'alert'"
        >
          {{ forgotText }}
        </p>
      </div>
    </div>
    <!-- Nothing to do while the change runs: no empty bar under it, until
         it is slow and the sheet may be closed. -->
    <template v-if="phase !== 'changing' || slow" #actions>
      <template v-if="phase === 'form' || phase === 'code'">
        <Button
          class="min-h-11 w-full"
          :label="t('Cancel')"
          :disabled="Boolean(busy)"
          @click="close"
        />
        <!-- The form's own submit, so Enter or the keyboard's «Ir» sends it. -->
        <Button
          v-if="phase === 'form'"
          variant="solid"
          type="submit"
          form="perfil-correo"
          class="min-h-11 w-full"
          :label="t('Send code')"
          :loading="busy === 'send'"
          :disabled="Boolean(busy) || Boolean(gap)"
          aria-describedby="perfil-correo-falta"
          data-testid="correo-guardar"
        />
        <Button
          v-else
          variant="solid"
          class="min-h-11 w-full"
          :label="t('Change email')"
          :loading="busy === 'confirm'"
          :disabled="Boolean(busy) || Boolean(gap)"
          aria-describedby="perfil-correo-falta"
          data-testid="correo-guardar"
          @click="confirm"
        />
      </template>
      <Button
        v-else-if="phase === 'done'"
        variant="solid"
        class="min-h-11 w-full"
        :label="t('Sign in')"
        data-testid="correo-entrar"
        @click="signIn"
      />
      <Button
        v-else-if="phase === 'failed' && sessionGone"
        variant="solid"
        class="min-h-11 w-full"
        :label="t('Sign in')"
        data-testid="correo-entrar"
        @click="signIn"
      />
      <Button
        v-else
        class="min-h-11 w-full"
        :label="t('Close')"
        data-testid="correo-cerrar"
        @click="close"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { errorText } from '@/utils/errorText'
import {
  SIGN_IN_URL,
  askCode,
  billingLine,
  codeDigits,
  codeGap,
  confirmCode,
  forgetChange,
  formGap,
  pollDelay,
  readChange,
  readProgress,
  recallChange,
  refusalText,
  rememberChange,
  reportProblem,
  resendCode,
  sendPasswordLink,
  sentLine as codeLine,
} from './correo'

const t = (text, replace) => __(text, replace, 'Perfil')

const props = defineProps({
  open: { type: Boolean, default: false },
  /** doco's email_change summary (cambio_correo.service.summary). */
  change: { type: Object, default: null },
  /** The page's own ways out, injectable for tests. */
  io: {
    type: Object,
    default: () => ({
      navigate: (url) => window.location.assign(url),
      fetcher: (...args) => globalThis.fetch(...args),
      report: reportProblem,
    }),
  },
})
const emit = defineEmits(['close', 'changed'])

const phase = ref('form')
const email = ref('')
const password = ref('')
const code = ref('')
const refusal = ref('')
const busy = ref('')
const sent = ref(null)
const slow = ref(false)
const progress = ref(null)
const forgot = ref('idle')
const forgotText = ref('')
// A failed change: whether this browser's session ended with it.
const sessionGone = ref(false)
const emailInput = ref(null)
const codeInput = ref(null)
let timer = null
let following = 0

const current = computed(() => props.change?.email || '')
const minutes = computed(() => Number(props.change?.code_minutes || 15))
// The address being confirmed, or the one the change moved to.
const target = computed(() => sent.value?.email || email.value || '')
const keptNote = computed(() =>
  props.change?.billing?.state === 'kept'
    ? t('Muelle’s invoices and notices still go to {0}.', [
        props.change.billing.old || '',
      ])
    : '',
)
const keptReport = computed(() =>
  t(
    'My sign-in email changed, and Muelle’s invoices and notices still go to my old email.',
  ),
)
const gap = computed(() => {
  if (phase.value === 'form')
    return formGap(email.value, password.value, current.value)
  if (phase.value === 'code') return codeGap(code.value)
  return ''
})
// What is left of the code sent (doco's expires_in), the code's whole life
// when doco did not say.
const sentLine = computed(() =>
  codeLine(target.value, sent.value?.expires_in ?? minutes.value * 60),
)
const doneBilling = computed(() =>
  billingLine(progress.value?.billing, current.value),
)

watch(
  () => props.open,
  async (open) => {
    if (!open) return stop()
    refusal.value = ''
    code.value = ''
    password.value = ''
    forgot.value = 'idle'
    forgotText.value = ''
    slow.value = false
    sessionGone.value = false
    progress.value = null
    const pending = props.change?.pending
    if (props.change?.changing) {
      phase.value = 'changing'
      following = Date.now()
      follow()
      return
    }
    if (pending?.email) {
      email.value = pending.email
      sent.value = { email: pending.email, expires_in: pending.expires_in }
      phase.value = 'code'
    } else {
      email.value = ''
      sent.value = null
      phase.value = 'form'
    }
    await nextTick()
    ;(phase.value === 'form' ? emailInput : codeInput).value?.focus?.()
  },
  { immediate: true },
)
onBeforeUnmount(stop)

function stop() {
  clearTimeout(timer)
  timer = null
}

function close() {
  if (busy.value || (phase.value === 'changing' && !slow.value)) return
  stop()
  emit('close')
}

function codeTyped(event) {
  refusal.value = ''
  code.value = codeDigits(event.target.value)
  event.target.value = code.value
}

async function toCode(answer) {
  sent.value = answer
  phase.value = 'code'
  code.value = ''
  password.value = ''
  await nextTick()
  codeInput.value?.focus?.()
}

function toForm() {
  refusal.value = ''
  phase.value = 'form'
  sent.value = null
  nextTick(() => emailInput.value?.focus?.())
}

async function run(key, request, fallback) {
  if (busy.value) return null
  busy.value = key
  refusal.value = ''
  try {
    const out = await request()
    if (out?.ok === false) refusal.value = refusalText(out, fallback)
    return out
  } catch (error) {
    refusal.value = errorText(error, fallback)
    return null
  } finally {
    busy.value = ''
  }
}

async function send() {
  if (gap.value) return
  const out = await run(
    'send',
    () => askCode(email.value.trim(), password.value),
    t('We could not send the code. Try again.'),
  )
  if (out?.ok) {
    emit('changed')
    return toCode(out)
  }
}

async function resend() {
  const out = await run(
    'resend',
    resendCode,
    t('We could not send the code. Try again.'),
  )
  if (out?.ok) {
    sent.value = out
    code.value = ''
    codeInput.value?.focus?.()
  }
}

async function confirm() {
  if (gap.value || busy.value) return
  const out = await run(
    'confirm',
    () => confirmCode(code.value),
    t('We could not confirm the code. Try again.'),
  )
  if (!out?.ok) {
    code.value = ''
    codeInput.value?.focus?.()
    return
  }
  sent.value = { ...(sent.value || {}), email: out.email || target.value }
  rememberChange(out.cambio)
  phase.value = 'changing'
  following = Date.now()
  follow(out.cambio)
}

// Follows the change until it ends: through the token while this browser has
// one (the session ends with the rename), else through the profile's own read
// while the session lasts. Often at first, then less (pollDelay).
function follow(token = recallChange()) {
  stop()
  timer = setTimeout(() => poll(token), pollDelay(Date.now() - following))
}

async function poll(token) {
  timer = null
  if (!props.open) return
  try {
    if (token) {
      const out = await readProgress(token, props.io.fetcher)
      if (out?.state === 'done') return finish(out)
      if (out?.state === 'failed' || out?.state === 'unknown') return fail()
      slow.value = Boolean(out?.slow)
    } else {
      const out = await readChange()
      if (!out?.changing) return fail()
    }
  } catch {
    // Without a token, a read refused means the session ended with the rename.
    if (!token) return finish(null)
  }
  follow(token)
}

function finish(out) {
  forgetChange()
  progress.value = out
  phase.value = 'done'
}

function fail() {
  forgetChange()
  phase.value = 'failed'
  // The job signs the person out before it renames: a refused read means
  // the session ended, and the way on is signing in again.
  readChange()
    .then(() => (sessionGone.value = false))
    .catch(() => (sessionGone.value = true))
  emit('changed')
}

function signIn() {
  props.io.navigate(SIGN_IN_URL)
}

function report(description) {
  if (props.io.report(description)) emit('close')
  else
    refusal.value = t(
      'Open Help and choose Report a problem. Tell us what happened with your email.',
    )
}

async function sendLink() {
  if (forgot.value === 'sending') return
  forgot.value = 'sending'
  forgotText.value = ''
  try {
    const answer = await sendPasswordLink(current.value)
    if (typeof answer === 'string' && answer) throw new Error(answer)
    forgot.value = 'sent'
    forgotText.value = t(
      'We sent you an email with a link to set a new password. Set it there, then come back here.',
    )
  } catch {
    forgot.value = 'failed'
    forgotText.value = t(
      'We could not send you the link. Ask whoever runs the system for help.',
    )
  }
}
</script>
