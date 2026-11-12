<template>
  <!-- Usuarios y cajas (capability «seats»): what the plan includes, the
       extras and how many are in use, with a stepper per kind. A tap opens
       Boat's quote in a sheet; «Confirmar» applies it. Rows and rules. -->
  <section
    v-if="phase !== 'off'"
    aria-labelledby="cuenta-usuarios"
    data-testid="cuenta-usuarios"
  >
    <h2
      id="cuenta-usuarios"
      class="title-face scroll-mt-16 pb-1 text-xl font-semibold text-ink-gray-9"
    >
      {{ __('Users and registers', null, 'Cuenta') }}
    </h2>
    <p
      v-if="phase === 'loading'"
      class="py-3 text-base text-ink-gray-6"
      role="status"
    >
      {{ __('Checking your users and registers…', null, 'Cuenta') }}
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
      data-testid="usuarios-negado"
    >
      <p class="text-base text-ink-gray-8">{{ refusal.text }}</p>
      <Button
        v-if="refusal.next"
        class="min-h-11"
        :label="refusal.next.label"
        @click="$emit('act', refusal.next.act)"
      />
    </div>
    <ul
      v-else-if="phase === 'ready'"
      class="divide-y divide-outline-gray-1"
      data-testid="usuarios-filas"
    >
      <!-- On a narrow phone the stepper drops under the words instead of
           squeezing them. -->
      <li
        v-for="row in rows"
        :key="row.key"
        class="flex flex-wrap items-center gap-x-3 gap-y-2 py-3"
        :data-testid="`usuarios-${row.key}`"
      >
        <div class="min-w-0 flex-1 basis-48">
          <p class="text-base font-medium text-ink-gray-9">{{ row.label }}</p>
          <p class="text-sm text-ink-gray-7">{{ row.summary }}</p>
          <p v-if="row.used" class="text-sm text-ink-gray-6">
            {{ row.used }}
          </p>
          <p v-if="row.scheduled" class="text-sm text-ink-gray-7">
            {{ row.scheduled }}
          </p>
          <p v-if="row.price" class="text-sm text-ink-gray-6">
            {{ row.price }}
          </p>
          <p
            v-else-if="!row.limitless"
            :id="`usuarios-${row.key}-motivo`"
            class="text-sm text-ink-gray-6"
          >
            {{
              __(
                'Your plan does not sell extra ones; another plan may include more.',
                null,
                'Cuenta',
              )
            }}
          </p>
        </div>
        <div
          v-if="!row.limitless"
          class="ml-auto flex flex-none items-center gap-1"
          role="group"
          :aria-label="__('{0} extra', [row.label], 'Cuenta')"
        >
          <button
            type="button"
            class="press flex size-11 items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-8 disabled:opacity-50"
            :aria-label="__('Remove 1 extra {0}', [row.one], 'Cuenta')"
            :title="__('Remove 1 extra {0}', [row.one], 'Cuenta')"
            :disabled="blocked || row.planned <= 0"
            data-testid="usuarios-menos"
            @click="ask(row, row.planned - 1)"
          >
            <span class="lucide-minus size-5" aria-hidden="true" />
          </button>
          <span
            class="num w-8 text-center text-lg font-semibold text-ink-gray-9"
            >{{ row.planned }}</span
          >
          <button
            type="button"
            class="press flex size-11 items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-8 disabled:opacity-50"
            :aria-label="__('Add 1 extra {0}', [row.one], 'Cuenta')"
            :title="__('Add 1 extra {0}', [row.one], 'Cuenta')"
            :aria-describedby="
              row.sold ? undefined : `usuarios-${row.key}-motivo`
            "
            :disabled="blocked || !row.sold"
            data-testid="usuarios-mas"
            @click="ask(row, row.planned + 1)"
          >
            <span class="lucide-plus size-5" aria-hidden="true" />
          </button>
        </div>
      </li>
    </ul>
    <p
      v-if="phase === 'ready' && blocked && !door.loading.value"
      class="text-sm text-ink-gray-6"
      role="status"
    >
      {{ door.paymentActionReason.value }}
    </p>
    <UsuariosSheet
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
import { readSeats, seatRows } from './usuarios'

// The quote sheet mounts on its first open.
const UsuariosSheet = defineAsyncComponent(() => import('./UsuariosSheet.vue'))

const props = defineProps({
  /** The page's payment door (pagos.js createPagos). */
  door: { type: Object, required: true },
  /** How long the sheet waits after a stepper tap before asking Boat again. */
  debounceMs: { type: Number, default: 300 },
})
const emit = defineEmits(['act', 'off'])

const phase = ref('loading')
const quote = ref(null)
const refusal = ref(null)
const failure = ref('')
const pending = ref(null)
const sheetMounted = ref(false)
const data = computed(() => props.door.boot.value)
const rows = computed(() =>
  quote.value ? seatRows(quote.value, data.value) : [],
)
const blocked = computed(() => props.door.paymentActionsBlocked())
let asked = 0

async function load() {
  const turn = ++asked
  failure.value = ''
  // A recorded cancel refuses every change but dropping a scheduled one: say so
  // instead of asking Boat a quote it will refuse.
  if (data.value?.cancel?.state === 'scheduled') {
    refusal.value = refusalView({
      ok: false,
      message: __(
        'You cancelled your subscription. Resume it to change users or registers.',
        null,
        'Cuenta',
      ),
      next: 'resume_subscription',
    })
    phase.value = 'refused'
    return
  }
  if (!quote.value) phase.value = 'loading'
  try {
    const out = await readSeats(seam, data.value)
    if (turn !== asked) return
    if (out.quote) {
      quote.value = out.quote
      phase.value = 'ready'
    } else if (seamOff(out.refusal)) {
      phase.value = 'off'
      emit('off')
    } else {
      const fallback = __(
        'We could not read your users and registers.',
        null,
        'Cuenta',
      )
      refusal.value = refusalView(out.refusal, fallback) || {
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

// A next step out of the sheet (plans, the invoices, support) closes it first.
function leave(key) {
  pending.value = null
  emit('act', key)
}
function ask(row, target) {
  if (blocked.value || target < 0) return
  sheetMounted.value = true
  pending.value = {
    key: row.key,
    extra: row.extra,
    planned: row.planned,
    target,
  }
}
async function done(answer, said = '') {
  pending.value = null
  toast.success(
    said ||
      (answer?.scheduled?.length && !answer?.applied?.length
        ? __('Change scheduled', null, 'Cuenta')
        : __('Change saved', null, 'Cuenta')),
  )
  await props.door.load()
}
</script>
