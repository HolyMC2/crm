<template>
  <!-- One email for one kind of notice: the address, then the code Boat
       mailed to it, which its owner reads out. A row still waiting opens on
       the code; one whose code no longer works asks Boat for a new one as it
       opens. Boat refuses in its own words; «Ya enviamos un código…» also
       moves to the code, since one is on its way. -->
  <BottomSheet
    :open="open"
    :title="
      row
        ? __('Confirm an email for {0}', [kind?.title || ''], 'Cuenta')
        : __('Add an email to {0}', [kind?.title || ''], 'Cuenta')
    "
    :dismissible="!busy"
    @update:open="(value) => !value && $emit('close')"
  >
    <form
      id="cuenta-contacto-form"
      class="space-y-4 pb-2"
      data-testid="contacto-form"
      novalidate
      @submit.prevent="submit"
    >
      <p class="text-sm text-ink-gray-6">{{ kind?.what }}</p>
      <label v-if="phase === 'email'" class="block">
        <span class="text-sm text-ink-gray-7">{{
          __('Email', null, 'Cuenta')
        }}</span>
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
          data-testid="contacto-correo"
          @input="refusal = ''"
        />
      </label>
      <p v-if="phase === 'email'" class="text-sm text-ink-gray-6">
        {{
          __(
            'We will send a code to that email. Ask whoever uses it for the code and type it here.',
            null,
            'Cuenta',
          )
        }}
      </p>
      <template v-else>
        <p
          class="break-words text-base text-ink-gray-8"
          role="status"
          data-testid="contacto-enviado"
        >
          {{ sentLine }}
        </p>
        <label class="block">
          <span class="text-sm text-ink-gray-7">{{
            __('Code', null, 'Cuenta')
          }}</span>
          <input
            ref="codeInput"
            :value="code"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="9"
            class="num mt-1 h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-xl text-ink-gray-9"
            data-testid="contacto-codigo"
            @input="codeTyped"
          />
        </label>
      </template>
      <!-- Under the field: Boat's refusal, else what the field still lacks
           (why the filled button waits). Typing clears the refusal. -->
      <p
        v-if="refusal"
        role="alert"
        class="text-sm text-ink-red-7"
        data-testid="contacto-error"
      >
        {{ refusal }}
      </p>
      <p
        v-else-if="gap"
        id="cuenta-contacto-falta"
        class="text-sm text-ink-gray-7"
        role="status"
      >
        {{ gap }}
      </p>
      <Button
        v-if="phase === 'code'"
        variant="ghost"
        class="min-h-11"
        :label="__('Send another code', null, 'Cuenta')"
        :loading="busy === 'add'"
        :disabled="Boolean(busy)"
        data-testid="contacto-reenviar"
        @click="send"
      />
    </form>
    <template #actions>
      <Button
        class="min-h-11 w-full"
        :label="__('Cancel', null, 'Cuenta')"
        :disabled="Boolean(busy)"
        @click="$emit('close')"
      />
      <Button
        variant="solid"
        class="min-h-11 w-full"
        :label="
          phase === 'email'
            ? __('Send code', null, 'Cuenta')
            : __('Confirm', null, 'Cuenta')
        "
        :loading="busy === (phase === 'email' ? 'add' : 'verify')"
        :disabled="Boolean(busy) || Boolean(gap)"
        aria-describedby="cuenta-contacto-falta"
        data-testid="contacto-guardar"
        @click="submit"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { Button, toast } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { codeDigits, codeGap, emailGap } from './contactos'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** The kind of notice: {key, title, what} (contactsView). */
  kind: { type: Object, default: null },
  /** A row already waiting: the sheet opens on its code. */
  row: { type: Object, default: null },
  owner: { type: String, default: '' },
  codeMinutes: { type: Number, default: 15 },
  /** The tab's store (contactos.js createContacts). */
  contacts: { type: Object, required: true },
})
const emit = defineEmits(['close'])

const phase = ref('email')
const email = ref('')
const code = ref('')
const refusal = ref('')
// A sentence from Boat that is not an error («Ya enviamos un código…»).
const note = ref('')
const emailInput = ref(null)
const codeInput = ref(null)

const busy = computed(() => props.contacts.busy.value)
const gap = computed(() =>
  phase.value === 'email'
    ? emailGap(email.value, props.owner)
    : codeGap(code.value),
)
const sentLine = computed(
  () =>
    note.value ||
    __(
      'We sent a code to {0}. It expires in {1} minutes.',
      [email.value, props.codeMinutes],
      'Cuenta',
    ),
)

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    refusal.value = ''
    note.value = ''
    code.value = ''
    email.value = props.row?.email || ''
    phase.value = props.row ? 'code' : 'email'
    await nextTick()
    if (props.row?.expired) await send()
    ;(phase.value === 'email' ? emailInput : codeInput).value?.focus?.()
  },
  { immediate: true },
)

function codeTyped(event) {
  refusal.value = ''
  code.value = codeDigits(event.target.value)
  event.target.value = code.value
}

async function toCode() {
  phase.value = 'code'
  code.value = ''
  await nextTick()
  codeInput.value?.focus?.()
}

// The first code, or another one for the same address.
async function send() {
  if (busy.value) return
  refusal.value = ''
  note.value = ''
  const result = await props.contacts.add(props.kind.key, email.value)
  if (result.ok) return toCode()
  if (result.out?.reason === 'wait') {
    note.value = result.text
    if (phase.value === 'email') await toCode()
    return
  }
  refusal.value = result.text
}

// What the owner reads once the code is right: a kind the owner paused sends
// the new address nothing until it is switched back on.
function verifiedLine(out) {
  const kind = Array.isArray(out?.categories)
    ? out.categories.find((row) => row?.key === props.kind.key)
    : null
  return kind?.enabled === false
    ? __(
        '{0} is confirmed. These notices are paused: it receives nothing until you turn them back on.',
        [email.value],
        'Cuenta',
      )
    : __('{0} now receives these notices', [email.value], 'Cuenta')
}

async function submit() {
  if (busy.value || gap.value) return
  if (phase.value === 'email') return send()
  refusal.value = ''
  const result = await props.contacts.verify(
    props.kind.key,
    email.value,
    code.value,
  )
  if (result.ok) {
    toast.success(verifiedLine(result.out))
    emit('close')
    return
  }
  refusal.value = result.text
  code.value = ''
  codeInput.value?.focus?.()
}
</script>
