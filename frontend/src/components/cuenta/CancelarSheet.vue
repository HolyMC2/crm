<template>
  <!-- «Cancelar suscripción»: Boat's dates read back (the service until, the
       copy of the data until, the archive), Boat's reasons as chips, an
       optional note, a line that may keep the owner and never blocks, and
       the password again to confirm. -->
  <BottomSheet
    :open="open"
    :title="__('Cancel subscription', null, 'Cuenta')"
    :dismissible="!busy && !dirty"
    @update:open="(value) => !value && $emit('close')"
  >
    <div class="space-y-4 pb-2" data-testid="cancelar">
      <p
        v-if="phase === 'loading'"
        class="text-base text-ink-gray-6"
        role="status"
      >
        {{ __('Checking your dates…', null, 'Cuenta') }}
      </p>
      <div v-else-if="phase === 'error'" role="alert" class="space-y-2">
        <p class="text-base text-ink-gray-8">{{ failure }}</p>
        <Button
          class="min-h-11"
          :label="__('Try again', null, 'Cuenta')"
          @click="load"
        />
      </div>
      <div
        v-else-if="phase === 'refused'"
        role="status"
        class="space-y-2"
        data-testid="cancelar-negado"
      >
        <p class="text-base text-ink-gray-8">{{ refusal.text }}</p>
        <Button
          v-if="refusal.next"
          class="min-h-11"
          :label="refusal.next.label"
          @click="$emit('act', refusal.next.act)"
        />
      </div>
      <p
        v-else-if="phase === 'recorded'"
        class="text-base text-ink-gray-8"
        role="status"
      >
        {{ view.message }}
      </p>
      <template v-else-if="phase === 'ready'">
        <dl
          class="divide-y divide-outline-gray-1 border-y border-outline-gray-1"
          data-testid="cancelar-fechas"
        >
          <div
            v-for="row in view.rows"
            :key="row.key"
            class="flex items-baseline gap-3 py-2"
          >
            <dt class="min-w-0 flex-1 text-sm text-ink-gray-7">
              {{ row.label }}
            </dt>
            <dd class="num shrink-0 text-base text-ink-gray-9">
              {{ row.value }}
            </dd>
          </div>
        </dl>
        <p
          v-for="line in view.lines"
          :key="line"
          class="text-sm text-ink-gray-8"
        >
          {{ line }}
        </p>
        <fieldset v-if="view.reasons.length" class="space-y-2">
          <legend class="pb-1 text-sm font-semibold text-ink-gray-7">
            {{ __('Why are you leaving?', null, 'Cuenta') }}
          </legend>
          <div class="flex flex-wrap gap-2" data-testid="cancelar-motivos">
            <button
              v-for="option in view.reasons"
              :key="option.value"
              type="button"
              class="press min-h-11 rounded-full px-4 text-base"
              :class="
                reason === option.value
                  ? 'bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
                  : 'bg-surface-gray-2 text-ink-gray-8'
              "
              :aria-pressed="reason === option.value"
              @click="reason = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </fieldset>
        <div
          v-if="retention"
          class="flex flex-wrap items-center gap-x-3 gap-y-2"
          data-testid="cancelar-retener"
        >
          <p class="min-w-0 flex-1 basis-48 text-sm text-ink-gray-7">
            {{ retention.text }}
          </p>
          <Button
            v-if="retention.act"
            variant="ghost"
            class="min-h-11"
            :label="retention.label"
            @click="$emit('act', retention.act)"
          />
        </div>
        <label class="block">
          <span class="text-sm text-ink-gray-7">{{
            __('Anything else you want to tell us (optional)', null, 'Cuenta')
          }}</span>
          <textarea
            v-model="note"
            rows="2"
            :maxlength="NOTE_MAX"
            class="mt-1 w-full rounded-6 border-0 bg-surface-gray-2 px-3 py-2 text-base text-ink-gray-9"
            data-testid="cancelar-nota"
          />
        </label>
        <!-- No export in the panel yet: a copy of the data comes from support. -->
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p class="min-w-0 flex-1 basis-48 text-sm text-ink-gray-7">
            {{
              __(
                'Before you go, ask for a copy of your data: write to support.',
                null,
                'Cuenta',
              )
            }}
          </p>
          <!-- Support's dialog opens once this sheet is closed (the parent's
               «data» step): never under the modal sheet. -->
          <Button
            variant="ghost"
            class="min-h-11"
            :label="__('Write to support', null, 'Cuenta')"
            @click="$emit('act', 'data')"
          />
        </div>
        <label class="block">
          <span class="text-sm text-ink-gray-7">{{
            __('Your password, to confirm', null, 'Cuenta')
          }}</span>
          <input
            ref="passwordInput"
            v-model="password"
            type="password"
            autocomplete="current-password"
            class="mt-1 h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9"
            data-testid="cancelar-password"
          />
        </label>
        <OlvidoContrasena @act="(key) => $emit('act', key)" />
        <p
          v-if="error"
          role="alert"
          class="text-sm text-ink-red-7"
          data-testid="cancelar-error"
        >
          {{ error }}
        </p>
        <p
          v-if="gap"
          id="cancelar-falta"
          class="text-sm text-ink-gray-7"
          role="status"
        >
          {{ gap }}
        </p>
      </template>
    </div>
    <template #actions>
      <Button
        class="min-h-11 w-full"
        :label="__('Keep my subscription', null, 'Cuenta')"
        :disabled="busy"
        @click="$emit('close')"
      />
      <Button
        v-if="phase === 'ready'"
        variant="solid"
        theme="red"
        class="min-h-11 w-full"
        :label="__('Cancel subscription', null, 'Cuenta')"
        :loading="busy"
        :disabled="busy || Boolean(gap)"
        aria-describedby="cancelar-falta"
        data-testid="cancelar-confirmar"
        @click="confirm"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { seam } from './api'
import { capable, failureText, refusalView } from './autoservicio'
import OlvidoContrasena from './OlvidoContrasena.vue'
import {
  NOTE_MAX,
  cancelGap,
  cancelQuoteView,
  retentionLine,
} from './suscripcion'

const props = defineProps({
  /** The page's payment door (pagos.js createPagos). */
  door: { type: Object, required: true },
  open: { type: Boolean, default: false },
})
// «act»: a next step the parent takes after closing this sheet (plans, support,
// «data»: ask support for a copy of the data).
const emit = defineEmits(['close', 'done', 'act'])

const phase = ref('loading')
const view = ref(null)
const refusal = ref(null)
const failure = ref('')
const reason = ref('')
const note = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')
const passwordInput = ref(null)

const dirty = computed(() =>
  Boolean(reason.value || note.value || password.value),
)
const gap = computed(() =>
  cancelGap({ reason: reason.value, password: password.value }),
)
const retention = computed(() =>
  retentionLine(reason.value, {
    planChange: capable(props.door.boot.value, 'plan_change'),
  }),
)

async function load() {
  phase.value = 'loading'
  failure.value = ''
  try {
    const out = await seam('cancel_quote')
    const read = cancelQuoteView(out)
    if (read?.recorded) {
      view.value = read
      phase.value = 'recorded'
    } else if (read) {
      view.value = read
      phase.value = 'ready'
    } else {
      const fallback = __(
        'We could not check your dates. Try again.',
        null,
        'Cuenta',
      )
      refusal.value = refusalView(out, fallback) || {
        text: fallback,
        next: null,
      }
      phase.value = 'refused'
    }
  } catch (e) {
    failure.value = failureText(e)
    phase.value = 'error'
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    reason.value = ''
    note.value = ''
    password.value = ''
    error.value = ''
    load()
  },
  { immediate: true },
)

async function confirm() {
  if (busy.value || gap.value) return
  busy.value = true
  error.value = ''
  try {
    const out = await seam(
      'cancel_subscription',
      { reason: reason.value, note: note.value.trim().slice(0, NOTE_MAX) },
      { password: password.value },
    )
    if (out?.ok === true) {
      password.value = ''
      emit('done', out)
      return
    }
    // miplan's step-up refusals keep the sheet on the password, with the
    // link to set a new one under it.
    if (['password', 'reset_password', 'wait'].includes(out?.next)) {
      password.value = ''
      await nextTick()
      passwordInput.value?.focus?.()
    }
    error.value =
      (typeof out?.message === 'string' && out.message) ||
      __('We could not record the cancellation. Try again.', null, 'Cuenta')
  } catch (e) {
    error.value = failureText(e)
  } finally {
    busy.value = false
  }
}
</script>
