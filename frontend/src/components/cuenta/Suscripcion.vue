<template>
  <!-- «Tu suscripción» (capability «cancel»). Active: one quiet «Cancelar
       suscripción» at the foot of Resumen, which opens the cancel sheet.
       Recorded: the day it ends, how long a copy of the data can be asked
       for, and «Reanudar» while Boat allows it. -->
  <section
    v-if="view"
    aria-labelledby="cuenta-suscripcion"
    class="space-y-2"
    :class="
      view.state === 'active' ? '' : 'border-b border-outline-gray-1 pb-4'
    "
    data-testid="cuenta-suscripcion"
    :data-state="view.state"
  >
    <div class="flex items-start gap-3">
      <span
        v-if="view.state !== 'active'"
        class="lucide-calendar-clock size-5 flex-none text-ink-amber-8"
        aria-hidden="true"
      />
      <div class="min-w-0 flex-1 space-y-1">
        <h2
          id="cuenta-suscripcion"
          :class="
            view.state === 'active'
              ? 'text-sm font-semibold text-ink-gray-7'
              : 'text-base font-semibold text-ink-gray-9'
          "
        >
          {{ view.title }}
        </h2>
        <p
          v-for="line in view.lines"
          :key="line"
          class="text-sm text-ink-gray-7"
        >
          {{ line }}
        </p>
      </div>
    </div>
    <!-- The copy of the data is the export block on Resumen («export»). -->
    <div v-if="view.state !== 'active'" class="flex flex-wrap gap-2 pt-1">
      <Button
        v-if="view.canResume"
        variant="solid"
        class="min-h-11 max-sm:w-full"
        :label="__('Resume my subscription', null, 'Cuenta')"
        :loading="resuming"
        :disabled="resuming || door.loading.value"
        data-testid="suscripcion-reanudar"
        @click="resume"
      />
      <Button
        class="min-h-11 max-sm:w-full"
        :label="__('Ask for my data', null, 'Cuenta')"
        data-testid="suscripcion-datos"
        @click="$emit('act', 'export')"
      />
    </div>
    <!-- A payment hold does not hold a cancel: Boat's cancel_quote answers for
         itself; only a read or a request in flight waits. -->
    <Button
      v-if="view.canCancel"
      variant="subtle"
      class="min-h-11 max-sm:w-full"
      :label="__('Cancel subscription', null, 'Cuenta')"
      :disabled="cancelWaits"
      data-testid="suscripcion-cancelar"
      @click="openCancel"
    />
    <p
      v-if="view.canCancel && door.busy.value && !door.loading.value"
      class="text-sm text-ink-gray-6"
      role="status"
    >
      {{ door.paymentActionReason.value }}
    </p>
    <div v-if="refusal" role="alert" class="space-y-2">
      <p class="text-sm text-ink-gray-8">{{ refusal.text }}</p>
      <Button
        v-if="refusal.next"
        class="min-h-11"
        :label="refusal.next.label"
        @click="$emit('act', refusal.next.act)"
      />
    </div>
    <p v-if="door.supportError.value" class="text-sm text-ink-red-7">
      {{ door.supportError.value }}
    </p>
    <CancelarSheet
      v-if="sheetMounted"
      :door="door"
      :open="cancelling && !door.loading.value"
      @close="cancelling = false"
      @act="leave"
      @done="cancelled"
    />
  </section>
</template>
<script setup>
import { computed, defineAsyncComponent, nextTick, ref } from 'vue'
import { Button, toast } from 'frappe-ui'
import { seam } from './api'
import { failureText, refusalView } from './autoservicio'
import { subscriptionView } from './suscripcion'

// The cancel sheet mounts on its first open.
const CancelarSheet = defineAsyncComponent(() => import('./CancelarSheet.vue'))

const props = defineProps({
  /** The page's payment door (pagos.js createPagos). */
  door: { type: Object, required: true },
})
const emit = defineEmits(['act'])

const view = computed(() => subscriptionView(props.door.boot.value))
const cancelWaits = computed(
  () => props.door.loading.value || Boolean(props.door.busy.value),
)
const resuming = ref(false)
const refusal = ref(null)
const cancelling = ref(false)
const sheetMounted = ref(false)

function openCancel() {
  if (cancelWaits.value) return
  refusal.value = null
  sheetMounted.value = true
  cancelling.value = true
}
// The sheet closes first, then its next step: support's own dialog never opens
// under the modal sheet, which takes every tap outside it, and the export
// block it scrolls to is not behind it.
async function leave(key) {
  cancelling.value = false
  await nextTick()
  emit('act', key)
}
async function cancelled() {
  cancelling.value = false
  toast.success(__('Your cancellation is recorded', null, 'Cuenta'))
  await props.door.load()
}
async function resume() {
  if (resuming.value) return
  resuming.value = true
  refusal.value = null
  try {
    const out = await seam('resume_subscription')
    if (out?.ok === true) {
      toast.success(
        (typeof out.message === 'string' && out.message) ||
          __('Your subscription continues', null, 'Cuenta'),
      )
      await props.door.load()
    } else refusal.value = refusalView(out)
  } catch (error) {
    refusal.value = { text: failureText(error), next: null }
  } finally {
    resuming.value = false
  }
}
</script>
