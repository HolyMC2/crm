<template>
  <!-- «Elegir dirección»: the name, with the zone after it, checked with Boat
       as it is typed (Disponible, Ocupada, No válida, in Boat's words), and
       «Conectar» once Boat says it is free. Boat checks it again when it
       connects; a name taken meanwhile is refused there in its words. -->
  <BottomSheet
    :open="open"
    :title="__('Choose your store’s address', null, 'Cuenta')"
    :dismissible="!busy"
    @update:open="(value) => !value && $emit('close')"
  >
    <form
      id="cuenta-direccion-form"
      class="space-y-3 pb-2"
      data-testid="direccion-form"
      novalidate
      @submit.prevent="connect"
    >
      <label class="block">
        <span class="text-sm text-ink-gray-7">{{
          __('Name', null, 'Cuenta')
        }}</span>
        <span
          class="mt-1 flex h-11 items-center overflow-hidden rounded-6 bg-surface-gray-2 px-3"
        >
          <!-- The name is as wide as what is typed (a hidden copy sizes it),
               so the zone reads right after it as one address. A long name
               keeps its room and the zone gives way; the line under the
               field spells the whole address once Boat says it is free. -->
          <span
            class="inline-grid min-w-[1ch] shrink-0"
            :class="zone ? 'max-w-[calc(100%-2.25rem)]' : 'w-full'"
          >
            <span
              aria-hidden="true"
              class="invisible col-start-1 row-start-1 whitespace-pre pr-0.5 text-base"
              >{{ name || ' ' }}</span
            >
            <input
              ref="input"
              :value="name"
              type="text"
              size="1"
              autocapitalize="off"
              autocomplete="off"
              spellcheck="false"
              maxlength="63"
              class="col-start-1 row-start-1 h-11 w-full min-w-0 border-0 bg-transparent p-0 text-base text-ink-gray-9 focus:ring-0"
              data-testid="direccion-nombre"
              @input="typed"
            />
          </span>
          <span
            v-if="zone"
            class="min-w-0 truncate text-base text-ink-gray-6"
            :title="`.${zone}`"
            data-testid="direccion-zona"
            >.{{ zone }}</span
          >
        </span>
      </label>
      <!-- What Boat says of the name (why «Conectar» waits, when it does). -->
      <p
        id="cuenta-direccion-veredicto"
        class="flex min-h-6 flex-wrap items-center gap-2"
        role="status"
        aria-live="polite"
        data-testid="direccion-veredicto"
      >
        <span v-if="checking" class="text-sm text-ink-gray-6">{{
          __('Checking…', null, 'Cuenta')
        }}</span>
        <template v-else-if="verdict">
          <StatusChip
            v-if="verdict.label"
            :label="verdict.label"
            :tone="verdict.tone"
          />
          <span class="min-w-0 text-sm text-ink-gray-7">{{
            verdict.text
          }}</span>
        </template>
        <span v-else class="text-sm text-ink-gray-6">{{
          __('Type a name to check it.', null, 'Cuenta')
        }}</span>
      </p>
      <p
        v-if="error"
        role="alert"
        class="text-sm text-ink-red-7"
        data-testid="direccion-error"
      >
        {{ error }}
      </p>
      <p class="text-sm text-ink-gray-6">
        {{
          __(
            'You choose it once; to change it later, write to us from Help.',
            null,
            'Cuenta',
          )
        }}
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
        :label="__('Connect', null, 'Cuenta')"
        :loading="busy"
        :disabled="busy || checking || !verdict?.available"
        aria-describedby="cuenta-direccion-veredicto"
        data-testid="direccion-conectar"
        @click="connect"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet, StatusChip } from '@/components/ui'
import { seam } from './api'
import { failureText, refusalView } from './autoservicio'
import { CHECK_DEBOUNCE_MS, typedName, verdictView } from './tiendaEnLinea'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** The zone the name goes under (Boat's state answer). */
  zone: { type: String, default: '' },
  /** The shop's own name, when Boat says it is free. */
  suggested: { type: String, default: '' },
})
const emit = defineEmits(['close', 'connected'])

const input = ref(null)
const name = ref('')
const verdict = ref(null)
const checking = ref(false)
const busy = ref(false)
const error = ref('')
let timer = 0
let turn = 0

watch(
  () => props.open,
  (open) => {
    clearTimeout(timer)
    turn += 1
    if (!open) return
    name.value = typedName(props.suggested, props.zone)
    verdict.value = null
    error.value = ''
    checking.value = false
    if (name.value) check()
    nextTick(() => input.value?.focus?.({ preventScroll: true }))
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  clearTimeout(timer)
  turn += 1
})

function typed(event) {
  const value = typedName(event.target.value, props.zone)
  if (event.target.value !== value) event.target.value = value
  name.value = value
  error.value = ''
  verdict.value = null
  clearTimeout(timer)
  turn += 1
  checking.value = Boolean(value)
  if (value) timer = setTimeout(check, CHECK_DEBOUNCE_MS)
}

async function check() {
  const mine = ++turn
  checking.value = true
  try {
    const out = await seam('storefront_address_check', { name: name.value })
    if (mine === turn) verdict.value = verdictView(out)
  } catch (failure) {
    if (mine === turn)
      verdict.value = {
        label: '',
        tone: 'neutral',
        text: failureText(failure),
        available: false,
      }
  } finally {
    if (mine === turn) checking.value = false
  }
}

const NAME_REFUSALS = [
  'taken',
  'reserved',
  'invalid',
  'own_system',
  'unverified',
]
async function connect() {
  if (busy.value || checking.value || !verdict.value?.available) return
  busy.value = true
  error.value = ''
  try {
    const out = await seam('storefront_address_connect', { name: name.value })
    if (out?.ok === true) {
      emit('connected', out)
      return
    }
    if (NAME_REFUSALS.includes(out?.reason))
      verdict.value = verdictView({
        ok: true,
        verdict: out.reason,
        available: false,
        message: out.message,
      })
    else error.value = refusalView(out).text
  } catch (failure) {
    error.value = failureText(failure)
  } finally {
    busy.value = false
  }
}
</script>
