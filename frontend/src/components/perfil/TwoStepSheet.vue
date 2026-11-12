<template>
  <!-- «Verificación en dos pasos». Off: Activar, add the key to the app (a
       link on this phone, the picture for another device), the app's first
       code with the password, then the recovery codes, shown this once. On:
       how many codes are left, new codes, and turning it off (password and a
       code). -->
  <BottomSheet
    :open="open"
    :title="title"
    :dismissible="!busy && step !== 'codes' && !dirty"
    @update:open="(value) => !value && close()"
  >
    <div
      v-if="step === 'intro'"
      class="space-y-3 pb-2 text-base text-ink-gray-8"
      data-testid="dos-pasos-intro"
    >
      <p>
        {{
          t(
            'Signing in will ask for your password and a 6-digit code from an app on your phone.',
          )
        }}
      </p>
      <p class="text-sm text-ink-gray-6">
        {{
          t(
            'Use the authenticator app you prefer: Google Authenticator, Microsoft Authenticator or another one.',
          )
        }}
      </p>
    </div>

    <!-- «Siguiente» is the sheet's one filled button. On the phone the link
         and the key come first (the same phone cannot scan its own screen)
         and the picture, for another phone, goes last. -->
    <div
      v-else-if="step === 'scan' && setup"
      class="flex flex-col gap-4 pb-2"
      data-testid="dos-pasos-clave"
    >
      <p class="text-base text-ink-gray-8">
        {{
          phone
            ? t('Add your account to your authenticator app.')
            : t('Scan this picture with your authenticator app.')
        }}
      </p>
      <!-- The link opens the app with the key already in it. -->
      <a
        v-if="phone"
        :href="setup.uri"
        class="press flex min-h-11 w-full items-center justify-center gap-2 rounded-6 bg-surface-gray-2 px-4 text-base font-medium text-ink-gray-8 active:bg-surface-gray-3"
        data-testid="dos-pasos-abrir"
      >
        <span class="lucide-smartphone size-5" aria-hidden="true" />
        {{ t('Open in my authenticator app') }}
      </a>
      <figure
        class="flex flex-col items-center gap-2"
        :class="phone ? 'order-last' : ''"
      >
        <img
          :src="setup.qr"
          :alt="t('Picture to scan with your authenticator app')"
          class="size-44 rounded-6"
          data-testid="dos-pasos-qr"
        />
        <figcaption v-if="phone" class="text-sm text-ink-gray-6">
          {{ t('To scan it from another phone') }}
        </figcaption>
      </figure>
      <div>
        <p class="text-sm text-ink-gray-6">
          {{ t('Or type this key in the app') }}
        </p>
        <p
          class="num mt-1 select-all text-lg font-semibold tracking-wide text-ink-gray-9"
          data-testid="dos-pasos-llave"
        >
          {{ setup.key }}
        </p>
        <button
          type="button"
          class="press mt-2 flex min-h-11 items-center gap-2 rounded-full bg-surface-gray-2 px-4 text-base text-ink-gray-8"
          data-testid="dos-pasos-copiar-clave"
          @click="copyKey"
        >
          <span
            :class="copied === 'key' ? 'lucide-check' : 'lucide-copy'"
            class="size-5"
            aria-hidden="true"
          />
          {{ copied === 'key' ? t('Key copied') : t('Copy key') }}
        </button>
      </div>
    </div>

    <form
      v-else-if="step === 'confirm' || step === 'prove'"
      :id="FORM"
      class="space-y-3 pb-2"
      data-testid="dos-pasos-form"
      @submit.prevent="submit"
    >
      <p class="text-base text-ink-gray-8" data-testid="dos-pasos-que-pasa">
        {{
          step === 'confirm'
            ? t('Type the 6 digits your app shows for your account.')
            : purpose === 'off'
              ? t('Once it is off, signing in asks only for your password.')
              : t('The recovery codes you have now will stop working.')
        }}
      </p>
      <label class="block">
        <span class="text-sm text-ink-gray-7">{{
          step === 'confirm'
            ? t('Code from your app')
            : t('Code from your app or a recovery code')
        }}</span>
        <input
          v-model="code"
          type="text"
          :inputmode="step === 'confirm' ? 'numeric' : 'text'"
          autocomplete="one-time-code"
          autocapitalize="characters"
          spellcheck="false"
          maxlength="14"
          class="num mt-1 h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-lg tracking-wide text-ink-gray-9"
          data-testid="dos-pasos-codigo"
        />
      </label>
      <label class="block">
        <span class="text-sm text-ink-gray-7">{{ t('Your password') }}</span>
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          class="mt-1 h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9"
          data-testid="dos-pasos-password"
        />
      </label>
      <p
        v-if="problem"
        class="text-sm text-ink-red-7"
        role="alert"
        data-testid="dos-pasos-problema"
      >
        {{ problem }}
      </p>
      <p
        v-else-if="hint"
        class="text-sm text-ink-gray-6"
        role="status"
        data-testid="dos-pasos-falta"
      >
        {{ hint }}
      </p>
      <template v-if="step === 'confirm'">
        <!-- A refusal already says it. -->
        <p v-if="!problem" class="text-sm text-ink-gray-6">
          {{
            t(
              'If the code does not work, set the time on your phone to automatic.',
            )
          }}
        </p>
        <button
          type="button"
          class="press min-h-11 text-base font-medium text-ink-gray-8 underline"
          :disabled="busy"
          @click="begin"
        >
          {{ t('Get a new key') }}
        </button>
      </template>
    </form>

    <div
      v-else-if="step === 'codes'"
      class="space-y-4 pb-2"
      data-testid="dos-pasos-codigos"
    >
      <!-- Said here, not in a toast: a toast would sit over the sheet's
           actions on the phone. -->
      <p
        class="flex items-center gap-2 text-base font-medium text-ink-gray-9"
        role="status"
        data-testid="dos-pasos-hecho"
      >
        <span
          v-if="justEnrolled"
          class="lucide-shield-check size-5 flex-none"
          aria-hidden="true"
        />
        {{
          justEnrolled
            ? t('Two-step verification is on')
            : t('Your old recovery codes no longer work.')
        }}
      </p>
      <p class="text-base text-ink-gray-8">
        {{
          t(
            'Keep these codes somewhere other than your phone. Each one signs you in once when you do not have your phone.',
          )
        }}
      </p>
      <ol
        class="num grid grid-cols-2 gap-2 rounded-7 bg-surface-gray-2 p-4 text-lg font-semibold tracking-wide text-ink-gray-9"
      >
        <li v-for="item in codes" :key="item" class="select-all">
          {{ item }}
        </li>
      </ol>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="press flex min-h-11 items-center gap-2 rounded-full bg-surface-gray-2 px-4 text-base text-ink-gray-8"
          data-testid="dos-pasos-copiar"
          @click="copyCodes"
        >
          <span
            :class="copied === 'codes' ? 'lucide-check' : 'lucide-copy'"
            class="size-5"
            aria-hidden="true"
          />
          {{ copied === 'codes' ? t('Codes copied') : t('Copy') }}
        </button>
        <button
          type="button"
          class="press flex min-h-11 items-center gap-2 rounded-full bg-surface-gray-2 px-4 text-base text-ink-gray-8"
          data-testid="dos-pasos-descargar"
          @click="downloadCodes"
        >
          <span class="lucide-download size-5" aria-hidden="true" />
          {{ t('Download') }}
        </button>
        <button
          v-if="canShare"
          type="button"
          class="press flex min-h-11 items-center gap-2 rounded-full bg-surface-gray-2 px-4 text-base text-ink-gray-8"
          @click="shareCodes"
        >
          <span class="lucide-share-2 size-5" aria-hidden="true" />
          {{ t('Share') }}
        </button>
      </div>
      <div
        v-if="justEnrolled && otherDevices > 0"
        class="border-t border-outline-gray-1 pt-4"
      >
        <p class="text-sm text-ink-gray-6" data-testid="dos-pasos-otras">
          {{
            closed === null
              ? t(
                  'Your other devices stay signed in. Sign them out so they ask for the code too.',
                )
              : t('Done: your other devices are signed out.')
          }}
        </p>
        <button
          v-if="closed === null"
          type="button"
          class="press mt-2 min-h-11 text-base font-medium text-ink-gray-8 underline"
          :disabled="busy"
          data-testid="dos-pasos-cerrar-otras"
          @click="signOutOthers"
        >
          {{ t('Sign out of the other devices') }}
        </button>
      </div>
    </div>

    <div
      v-else-if="step === 'manage'"
      class="space-y-3 pb-2 text-base text-ink-gray-8"
      data-testid="dos-pasos-activa"
    >
      <p v-if="status?.enrolled && !status?.asked" role="alert">
        {{
          t(
            'Signing in is not asking for your code right now. Turn it off and on again to fix it.',
          )
        }}
      </p>
      <p v-else>
        {{
          since
            ? t('On since {0}. Signing in asks for a code from your app.', [
                since,
              ])
            : t('On. Signing in asks for a code from your app.')
        }}
      </p>
      <p class="text-sm text-ink-gray-6" data-testid="dos-pasos-quedan">
        {{
          codesLeft === 1
            ? t('1 recovery code left.')
            : t('{0} recovery codes left.', [codesLeft])
        }}
      </p>
      <p v-if="status?.required" class="text-sm text-ink-gray-6">
        {{
          t(
            'Your access requires it, so it cannot be turned off here. Ask the shop owner about it.',
          )
        }}
      </p>
      <div class="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          class="press flex min-h-11 items-center gap-2 rounded-full bg-surface-gray-2 px-4 text-base text-ink-gray-8"
          data-testid="dos-pasos-nuevos"
          @click="ask('codes')"
        >
          <span class="lucide-key-round size-5" aria-hidden="true" />
          {{ t('Make new recovery codes') }}
        </button>
        <button
          v-if="!status?.required"
          type="button"
          class="press flex min-h-11 items-center gap-2 rounded-full bg-surface-gray-2 px-4 text-base text-ink-gray-8"
          data-testid="dos-pasos-desactivar"
          @click="ask('off')"
        >
          {{ t('Turn off') }}
        </button>
      </div>
    </div>

    <template #actions>
      <template v-if="step === 'intro'">
        <Button class="min-h-11 w-full" :label="t('Cancel')" @click="close" />
        <Button
          variant="solid"
          class="min-h-11 w-full"
          :label="t('Turn on two-step verification')"
          :loading="busy"
          data-testid="dos-pasos-activar"
          @click="begin"
        />
      </template>
      <template v-else-if="step === 'scan'">
        <Button class="min-h-11 w-full" :label="t('Cancel')" @click="close" />
        <Button
          variant="solid"
          class="min-h-11 w-full"
          :label="t('Next')"
          data-testid="dos-pasos-siguiente"
          @click="step = 'confirm'"
        />
      </template>
      <template v-else-if="step === 'confirm' || step === 'prove'">
        <Button
          class="min-h-11 w-full"
          :label="step === 'confirm' ? t('Back') : t('Cancel')"
          :disabled="busy"
          @click="back"
        />
        <Button
          variant="solid"
          type="submit"
          :form="FORM"
          class="min-h-11 w-full"
          :label="submitLabel"
          :loading="busy"
          :disabled="Boolean(hint)"
          data-testid="dos-pasos-enviar"
        />
      </template>
      <template v-else-if="step === 'codes'">
        <Button
          variant="solid"
          class="min-h-11 w-full"
          :label="t('I saved them')"
          data-testid="dos-pasos-listo"
          @click="close"
        />
      </template>
      <template v-else>
        <Button class="min-h-11 w-full" :label="t('Done')" @click="close" />
      </template>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Button, toast } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { isMobile } from '@/composables/breakpoint'
import { errorText } from '@/utils/errorText'
import { formatDate } from '@/utils/display'
import {
  cleanCode,
  closeOtherSessions,
  codesText,
  confirmTwoStep,
  copyText,
  newRecoveryCodes,
  startTwoStep,
  turnOffTwoStep,
} from './perfil'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** doco's two-step status (seguridad().two_step). */
  status: { type: Object, default: null },
  /** Devices signed in besides this one, for the offer after turning it on. */
  otherDevices: { type: Number, default: 0 },
})
const emit = defineEmits(['close', 'changed'])

const t = (text, replace) => __(text, replace, 'Perfil')
const FORM = 'perfil-dos-pasos'
const phone = isMobile
const canShare =
  typeof navigator !== 'undefined' && typeof navigator.share === 'function'

const step = ref('intro')
// While the person proves it is them: 'off' or 'codes'.
const purpose = ref('')
const setup = ref(null)
const codes = ref([])
const code = ref('')
const password = ref('')
const problem = ref('')
const busy = ref(false)
const justEnrolled = ref(false)
const closed = ref(null)
// 'key' or 'codes' for a moment after a copy: the button says it in place.
const copied = ref('')
const COPIED_MS = 2000
let copiedTimer = null
onBeforeUnmount(() => clearTimeout(copiedTimer))

const dirty = computed(() => Boolean(code.value || password.value))
const codesLeft = computed(() => Number(props.status?.codes_left || 0))
const since = computed(() =>
  props.status?.since
    ? formatDate(props.status.since, { relative: false })
    : '',
)
const title = computed(() =>
  step.value === 'codes'
    ? t('Your recovery codes')
    : t('Two-step verification'),
)
const submitLabel = computed(() => {
  if (step.value === 'confirm') return t('Turn on')
  return purpose.value === 'off' ? t('Turn off') : t('Make new codes')
})
// What is missing before the form can go, in the order it is filled.
const hint = computed(() => {
  const typed = cleanCode(code.value).replace(/[\s-]/g, '')
  if (step.value === 'confirm' && !/^\d{6}$/.test(typed))
    return t('Type the 6 digits from your app.')
  if (step.value === 'prove' && typed.length < 6)
    return t('Type the code from your app or a recovery code.')
  if (!password.value) return t('Type your password.')
  return ''
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    step.value = props.status?.enrolled ? 'manage' : 'intro'
    setup.value = null
    codes.value = []
    closed.value = null
    justEnrolled.value = false
    copied.value = ''
    clearForm()
  },
  { immediate: true },
)
watch([code, password], () => (problem.value = ''))

function clearForm() {
  code.value = ''
  password.value = ''
  problem.value = ''
}

function close() {
  if (busy.value) return
  clearForm()
  emit('close')
}

function back() {
  clearForm()
  step.value = step.value === 'confirm' ? 'scan' : 'manage'
}

async function begin() {
  if (busy.value) return
  busy.value = true
  problem.value = ''
  try {
    setup.value = await startTwoStep()
    clearForm()
    step.value = 'scan'
  } catch (error) {
    toast.error(
      errorText(error, t('Two-step verification did not start. Try again.')),
    )
  } finally {
    busy.value = false
  }
}

function ask(next) {
  purpose.value = next
  clearForm()
  step.value = 'prove'
}

async function submit() {
  if (hint.value || busy.value) return
  busy.value = true
  const typed = cleanCode(code.value)
  try {
    if (step.value === 'confirm') {
      const out = await confirmTwoStep(typed, password.value)
      codes.value = out?.codes || []
      justEnrolled.value = true
      clearForm()
      step.value = 'codes'
      emit('changed', out?.status || null)
    } else if (purpose.value === 'off') {
      const out = await turnOffTwoStep(password.value, typed)
      clearForm()
      emit('changed', out?.status || null)
      toast.success(t('Two-step verification is off'))
      emit('close')
    } else {
      const out = await newRecoveryCodes(password.value, typed)
      codes.value = out?.codes || []
      justEnrolled.value = false
      clearForm()
      step.value = 'codes'
      emit('changed', out?.status || null)
    }
  } catch (error) {
    problem.value = errorText(
      error,
      t('That did not work. Check the code and your password.'),
    )
  } finally {
    busy.value = false
  }
}

function showCopied(what) {
  copied.value = what
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => (copied.value = ''), COPIED_MS)
}

async function copyKey() {
  const key = String(setup.value?.key || '').replace(/\s/g, '')
  if (await copyText(key)) showCopied('key')
  else toast.error(t('Copy it by hand: tap and hold the key.'))
}

const fileText = () => codesText(codes.value, setup.value?.issuer || '')

async function copyCodes() {
  if (await copyText(fileText())) showCopied('codes')
  else toast.error(t('Copy them by hand: tap and hold each code.'))
}

function downloadCodes() {
  const url = URL.createObjectURL(
    new Blob([fileText()], { type: 'text/plain;charset=utf-8' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `${t('recovery-codes')}.txt`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function shareCodes() {
  try {
    await navigator.share({ title: t('Your recovery codes'), text: fileText() })
  } catch {
    // The person closed the share sheet.
  }
}

async function signOutOthers() {
  if (busy.value) return
  busy.value = true
  try {
    const out = await closeOtherSessions()
    closed.value = Number(out?.closed || 0)
  } catch (error) {
    toast.error(
      errorText(error, t('The other devices were not signed out. Try again.')),
    )
  } finally {
    busy.value = false
  }
}
</script>
