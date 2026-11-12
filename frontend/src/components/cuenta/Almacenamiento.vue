<template>
  <!-- Almacenamiento (capability «storage_blocks»): the space used of what the
       plan and the extra bought allow, a reduction Boat scheduled, and the
       block Boat sells with its price. «Agregar 10 GB» opens Boat's quote in
       a sheet; «Confirmar» buys it. Rows and rules. -->
  <section
    v-if="phase !== 'off'"
    aria-labelledby="cuenta-almacenamiento"
    data-testid="cuenta-almacenamiento"
  >
    <h2
      id="cuenta-almacenamiento"
      class="title-face scroll-mt-16 pb-1 text-xl font-semibold text-ink-gray-9"
    >
      {{ __('Storage', null, 'Cuenta') }}
    </h2>
    <p
      v-if="phase === 'loading'"
      class="py-3 text-base text-ink-gray-6"
      role="status"
    >
      {{ __('Checking your storage…', null, 'Cuenta') }}
    </p>
    <div v-else-if="phase === 'error'" role="alert" class="space-y-2 py-3">
      <p class="text-base text-ink-gray-8">{{ failure }}</p>
      <Button
        class="min-h-11"
        :label="__('Try again', null, 'Cuenta')"
        @click="load"
      />
    </div>
    <div
      v-else-if="phase === 'refused'"
      class="space-y-2 py-3"
      role="status"
      data-testid="almacenamiento-negado"
    >
      <p class="text-base text-ink-gray-8">{{ refusal.text }}</p>
      <Button
        v-if="refusal.next"
        class="min-h-11"
        :label="refusal.next.label"
        @click="$emit('act', refusal.next.act)"
      />
    </div>
    <div v-else-if="phase === 'ready' && card" class="space-y-1 py-3">
      <p
        class="text-base font-medium"
        :class="card.warn ? 'text-ink-amber-8' : 'text-ink-gray-9'"
        data-testid="almacenamiento-uso"
      >
        {{ card.text }}
      </p>
      <span
        v-if="card.pct != null"
        role="progressbar"
        :aria-label="__('Storage', null, 'Cuenta')"
        :aria-valuenow="card.pct"
        aria-valuemin="0"
        aria-valuemax="100"
        class="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-gray-2"
      >
        <span
          class="h-full rounded-full"
          :class="card.warn ? 'bg-surface-amber-5' : 'bg-surface-gray-7'"
          :style="{ width: card.pct + '%' }"
        />
      </span>
      <p v-if="card.detail" class="pt-1 text-sm text-ink-gray-7">
        {{ card.detail }}
      </p>
      <p
        v-if="card.scheduled"
        class="text-sm text-ink-gray-7"
        data-testid="almacenamiento-programado"
      >
        {{ card.scheduled }}
      </p>
      <p v-if="card.waits" class="text-sm text-ink-gray-6">{{ card.waits }}</p>
      <p
        v-if="card.offer"
        class="pt-1 text-base text-ink-gray-8"
        data-testid="almacenamiento-oferta"
      >
        {{ card.offer }}
      </p>
      <p
        v-else-if="card.unavailable"
        class="pt-1 text-sm text-ink-gray-7"
        data-testid="almacenamiento-no-disponible"
      >
        {{ card.unavailable }}
      </p>
      <div
        v-if="card.canAdd || card.canRemove || card.canUndo || card.seePlans"
        class="flex flex-wrap gap-2 pt-2"
      >
        <Button
          v-if="card.canAdd"
          variant="subtle"
          class="min-h-11 max-sm:w-full"
          :label="__('Add {0} GB', [gbText(card.blockGb)], 'Cuenta')"
          :disabled="blocked"
          aria-describedby="almacenamiento-motivo"
          data-testid="almacenamiento-agregar"
          @click="ask(card.blocks + 1)"
        />
        <Button
          v-if="card.canUndo"
          variant="subtle"
          class="min-h-11 max-sm:w-full"
          :label="__('Cancel the scheduled reduction', null, 'Cuenta')"
          :disabled="blocked"
          aria-describedby="almacenamiento-motivo"
          data-testid="almacenamiento-deshacer"
          @click="ask(card.blocks)"
        />
        <Button
          v-else-if="card.canRemove"
          variant="subtle"
          class="min-h-11 max-sm:w-full"
          :label="__('Remove space', null, 'Cuenta')"
          :disabled="blocked"
          aria-describedby="almacenamiento-motivo"
          data-testid="almacenamiento-quitar"
          @click="ask(card.planned - 1)"
        />
        <Button
          v-if="card.seePlans"
          variant="subtle"
          class="min-h-11 max-sm:w-full"
          :label="__('See plans', null, 'Cuenta')"
          data-testid="almacenamiento-planes"
          @click="$emit('act', 'plans')"
        />
      </div>
      <p
        v-if="blocked && !door.loading.value"
        id="almacenamiento-motivo"
        class="text-sm text-ink-gray-6"
        role="status"
      >
        {{ door.paymentActionReason.value }}
      </p>
    </div>
    <AlmacenamientoSheet
      v-if="sheetMounted"
      :door="door"
      :open="Boolean(pending) && !door.loading.value"
      :change="pending"
      :debounce-ms="debounceMs"
      @close="pending = null"
      @act="leave"
      @done="done"
    />
  </section>
</template>
<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { Button, toast } from 'frappe-ui'
import { seam } from './api'
import { failureText, refusalView, seamOff } from './autoservicio'
import { gb as gbText, storageCard } from './almacenamiento'

// The quote sheet mounts on its first open.
const AlmacenamientoSheet = defineAsyncComponent(
  () => import('./AlmacenamientoSheet.vue'),
)

const props = defineProps({
  /** The page's payment door (pagos.js createPagos). */
  door: { type: Object, required: true },
  /**
   * Raised by the page when a step elsewhere («Comprar más espacio» in Resumen
   * or «Salud de tu sistema») asks for more space: the sheet opens on one
   * more block, so buying is that tap and «Confirmar».
   */
  openRequest: { type: Number, default: 0 },
  /** How long the sheet waits after a stepper tap before asking Boat again. */
  debounceMs: { type: Number, default: 300 },
})
const emit = defineEmits(['act', 'off', 'handled'])

const phase = ref('loading')
const state = ref(null)
const refusal = ref(null)
const failure = ref('')
const pending = ref(null)
const sheetMounted = ref(false)
const data = computed(() => props.door.boot.value)
const card = computed(() => storageCard(state.value))
const blocked = computed(() => props.door.paymentActionsBlocked())
let asked = 0

async function load() {
  const turn = ++asked
  failure.value = ''
  // A recorded cancel refuses more space: say so instead of asking Boat.
  if (data.value?.cancel?.state === 'scheduled') {
    refusal.value = refusalView({
      ok: false,
      message: __(
        'You cancelled your subscription. Resume it to change your storage.',
        null,
        'Cuenta',
      ),
      next: 'resume_subscription',
    })
    phase.value = 'refused'
    return
  }
  if (!state.value) phase.value = 'loading'
  try {
    const out = await seam('storage_quote', {})
    if (turn !== asked) return
    if (storageCard(out)) {
      state.value = out
      phase.value = 'ready'
    } else if (seamOff(out)) {
      phase.value = 'off'
      emit('off')
    } else {
      const fallback = __('We could not read your storage.', null, 'Cuenta')
      refusal.value = refusalView(out, fallback) || {
        text: fallback,
        next: null,
      }
      phase.value = 'refused'
    }
  } catch (error) {
    if (turn !== asked) return
    failure.value = failureText(error)
    phase.value = 'error'
  }
}
// Every fresh read of the plan (a change, a pull, «Revisar estado») asks again.
watch(
  () => props.door.boot.value,
  (boot) => boot && load(),
  { immediate: true },
)

// «Comprar más espacio» from Resumen: one more block, once the space is read.
// The request is answered once («handled» tells the page to drop it, so a
// later visit to Tienda opens nothing); where no block can be bought the plans
// are the way to more space.
let handled = 0
watch(
  () => [props.openRequest, phase.value],
  ([request, now]) => {
    if (!request) {
      handled = 0
      return
    }
    if (request === handled || now === 'loading') return
    handled = request
    emit('handled')
    if (now === 'ready' && card.value?.canAdd) ask(card.value.blocks + 1)
    else if (now === 'ready' || now === 'off') emit('act', 'plans')
  },
  { immediate: true },
)

function ask(target) {
  const view = card.value
  if (blocked.value || !view || target < 0 || target > view.maxBlocks) return
  sheetMounted.value = true
  pending.value = {
    blocks: view.blocks,
    planned: view.planned,
    blockGb: view.blockGb,
    maxBlocks: view.maxBlocks,
    target,
  }
}
// A next step out of the sheet (the invoices, support) closes it first.
function leave(key) {
  pending.value = null
  emit('act', key)
}
async function done(answer, said = '') {
  pending.value = null
  toast.success(said || __('Change saved', null, 'Cuenta'))
  await props.door.load()
}
</script>
