<template>
  <!-- The Datos fiscales form: RFC, razón social, régimen (those of the RFC's
       persona type), código postal and uso CFDI (those the régimen allows), and
       the password again only when it replaces an RFC already on file. Boat
       validates the save and says what to fix. -->
  <BottomSheet
    :open="open"
    :title="__('Tax details', null, 'Cuenta')"
    :dismissible="!busy && !dirty"
    @update:open="(value) => !value && $emit('close')"
  >
    <form
      id="cuenta-fiscal-form"
      class="space-y-4 pb-2"
      data-testid="fiscal-form"
      novalidate
      @submit.prevent="save"
    >
      <p class="text-sm text-ink-gray-6">
        {{
          __(
            'As they appear on your tax certificate (constancia de situación fiscal).',
            null,
            'Cuenta',
          )
        }}
      </p>
      <label class="block">
        <span class="text-sm text-ink-gray-7">{{
          __('RFC', null, 'Cuenta')
        }}</span>
        <input
          v-model="form.rfc"
          type="text"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          maxlength="15"
          class="num mt-1 h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9"
          data-testid="fiscal-rfc"
          @input="rfcTyped"
        />
      </label>
      <label class="block">
        <span class="text-sm text-ink-gray-7">{{
          __('Business name', null, 'Cuenta')
        }}</span>
        <input
          v-model="form.razon_social"
          type="text"
          autocomplete="organization"
          maxlength="140"
          class="mt-1 h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9"
          data-testid="fiscal-razon"
        />
      </label>
      <label class="block">
        <span class="text-sm text-ink-gray-7">{{
          __('Tax regime', null, 'Cuenta')
        }}</span>
        <select
          v-model="form.regimen"
          class="mt-1 h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9"
          data-testid="fiscal-regimen"
          @change="regimenChosen"
        >
          <option value="" disabled>
            {{ __('Choose your tax regime', null, 'Cuenta') }}
          </option>
          <option
            v-for="option in regimenes"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>
      <label class="block">
        <span class="text-sm text-ink-gray-7">{{
          __('Postal code', null, 'Cuenta')
        }}</span>
        <input
          v-model="form.cp"
          type="text"
          inputmode="numeric"
          autocomplete="postal-code"
          maxlength="5"
          class="num mt-1 h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9"
          data-testid="fiscal-cp"
        />
      </label>
      <label class="block">
        <span class="text-sm text-ink-gray-7">{{
          __('CFDI use', null, 'Cuenta')
        }}</span>
        <select
          v-model="form.uso_cfdi"
          class="mt-1 h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9"
          data-testid="fiscal-uso"
        >
          <option
            v-for="option in usos"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>
      <!-- Replacing an RFC on file asks for the password again (miplan). -->
      <template v-if="askPassword">
        <label class="block">
          <span class="text-sm text-ink-gray-7">{{
            __('Your password, to change the RFC', null, 'Cuenta')
          }}</span>
          <input
            ref="passwordInput"
            v-model="password"
            type="password"
            autocomplete="current-password"
            class="mt-1 h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9"
            data-testid="fiscal-password"
          />
        </label>
        <OlvidoContrasena @act="(key) => $emit('act', key)" />
      </template>
      <p
        v-if="refusal"
        role="alert"
        class="text-sm text-ink-red-7"
        data-testid="fiscal-error"
      >
        {{ refusal }}
      </p>
      <p
        v-if="gap"
        id="cuenta-fiscal-falta"
        class="text-sm text-ink-gray-7"
        role="status"
      >
        {{ gap }}
      </p>
    </form>
    <template #actions>
      <Button
        class="min-h-11 w-full"
        :label="__('Cancel', null, 'Cuenta')"
        :disabled="busy"
        @click="$emit('close')"
      />
      <Button
        variant="solid"
        class="min-h-11 w-full"
        :label="__('Save tax details', null, 'Cuenta')"
        :loading="busy"
        :disabled="busy || Boolean(gap)"
        aria-describedby="cuenta-fiscal-falta"
        data-testid="fiscal-guardar"
        @click="save"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { seam } from './api'
import { failureText } from './autoservicio'
import OlvidoContrasena from './OlvidoContrasena.vue'
import {
  fitUso,
  formFrom,
  formGap,
  regimenChoices,
  replacesRfc,
  savePayload,
  usoChoices,
} from './fiscal'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** Boat's billing_profile answer: {profile, options, fiscal_ready, can_save}. */
  answer: { type: Object, default: null },
})
// «act»: a next step the parent takes after closing this sheet (support).
const emit = defineEmits(['close', 'saved', 'act'])

const form = reactive(formFrom(null))
const start = ref('')
const password = ref('')
const passwordAsked = ref(false)
const busy = ref(false)
const refusal = ref('')
const passwordInput = ref(null)

const options = computed(() => props.answer?.options || {})
const stored = computed(() => props.answer?.profile?.rfc || '')
const regimenes = computed(() => regimenChoices(options.value, form.rfc))
const usos = computed(() => usoChoices(options.value, form.regimen))
const dirty = computed(() => JSON.stringify(form) !== start.value)
const askPassword = computed(
  () => passwordAsked.value || replacesRfc(stored.value, form.rfc),
)
const gap = computed(() => {
  const missing = formGap(form)
  if (missing) return missing
  if (askPassword.value && !password.value)
    return __('Type your password to change the RFC.', null, 'Cuenta')
  return ''
})

// The form starts from what Boat holds each time it opens, and a fresh read
// while it is open never overwrites what the owner typed.
watch(
  () => props.open,
  (open) => {
    if (!open) return
    Object.assign(form, formFrom(props.answer?.profile))
    form.uso_cfdi = fitUso(options.value, form.regimen, form.uso_cfdi)
    start.value = JSON.stringify(form)
    password.value = ''
    passwordAsked.value = false
    refusal.value = ''
  },
  { immediate: true },
)

// A régimen of the other persona type than the RFC typed is cleared; Boat refuses it.
function rfcTyped() {
  form.rfc = form.rfc.toUpperCase()
  if (form.regimen && !regimenes.value.some((o) => o.value === form.regimen)) {
    form.regimen = ''
    form.uso_cfdi = fitUso(options.value, '', form.uso_cfdi)
  }
}
function regimenChosen() {
  form.uso_cfdi = fitUso(options.value, form.regimen, form.uso_cfdi)
}

async function save() {
  if (busy.value || gap.value) return
  busy.value = true
  refusal.value = ''
  try {
    const out = await seam(
      'set_billing_profile',
      savePayload(form),
      askPassword.value ? { password: password.value } : {},
    )
    if (out?.ok === true) {
      password.value = ''
      emit('saved', out)
      return
    }
    // miplan's step-up: the password is missing, wrong, or too many were wrong.
    if (['password', 'reset_password', 'wait'].includes(out?.next)) {
      passwordAsked.value = true
      password.value = ''
      await nextTick()
      passwordInput.value?.focus?.()
    }
    refusal.value =
      (typeof out?.message === 'string' && out.message) ||
      __('We could not save your tax details. Try again.', null, 'Cuenta')
  } catch (error) {
    // Boat's own check of the RFC, the CP or the régimen, in its words.
    refusal.value = failureText(error)
  } finally {
    busy.value = false
  }
}
</script>
