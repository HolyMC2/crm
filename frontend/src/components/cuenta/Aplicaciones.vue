<template>
  <!-- Aplicaciones (capability «apps»): the free apps with their state;
       «Activar» opens one sheet (empty or with sample data, when the app ships
       them) and the row follows the install until it is active; «Desactivar»
       is two taps in place with Boat's note about what it hides. -->
  <section
    v-if="phase !== 'off'"
    aria-labelledby="cuenta-apps"
    data-testid="cuenta-apps"
  >
    <h2
      id="cuenta-apps"
      class="title-face text-xl font-semibold text-ink-gray-9"
    >
      {{ __('Apps', null, 'Cuenta') }}
    </h2>
    <p class="pb-1 text-sm text-ink-gray-6">
      {{ __('They come with your plan at no extra cost.', null, 'Cuenta') }}
    </p>
    <p
      v-if="notice"
      class="py-2 text-base text-ink-gray-8"
      role="status"
      data-testid="apps-aviso"
    >
      {{ notice }}
    </p>
    <p
      v-if="phase === 'loading'"
      class="py-3 text-base text-ink-gray-6"
      role="status"
    >
      {{ __('Checking your apps…', null, 'Cuenta') }}
    </p>
    <div v-else-if="phase === 'error'" role="alert" class="space-y-2 py-3">
      <p class="text-base text-ink-gray-8">{{ failure }}</p>
      <Button
        class="min-h-11"
        :label="__('Try again', null, 'Cuenta')"
        @click="load"
      />
    </div>
    <p v-else-if="!rows.length" class="py-3 text-base text-ink-gray-7">
      {{ __('There are no apps to turn on yet.', null, 'Cuenta') }}
    </p>
    <ul v-else class="divide-y divide-outline-gray-1" data-testid="apps-filas">
      <li
        v-for="row in rows"
        :key="row.app"
        class="py-3"
        :data-testid="`app-${row.app}`"
        :data-status="row.status"
      >
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <p class="text-base font-medium text-ink-gray-9">
              {{ row.title }}
            </p>
            <p v-if="row.blurb" class="text-sm text-ink-gray-6">
              {{ row.blurb }}
            </p>
            <p
              v-if="row.reason"
              class="text-sm text-ink-gray-7"
              data-testid="app-motivo"
            >
              {{ row.reason }}
            </p>
          </div>
          <StatusChip v-if="row.chip" :label="row.chip" tone="neutral" />
        </div>
        <div
          v-if="row.progress"
          class="mt-2"
          role="status"
          data-testid="app-avance"
        >
          <p class="text-sm text-ink-gray-7">
            {{ row.progress.label
            }}<template v-if="row.progress.step"
              >, {{ row.progress.step.toLowerCase() }}</template
            >
          </p>
          <span
            v-if="row.progress.pct != null"
            role="progressbar"
            :aria-label="row.title"
            :aria-valuenow="row.progress.pct"
            aria-valuemin="0"
            aria-valuemax="100"
            class="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-surface-gray-2"
          >
            <span
              class="h-full rounded-full bg-surface-gray-7"
              :style="{ width: row.progress.pct + '%' }"
            />
          </span>
        </div>
        <Button
          v-if="row.canActivate"
          variant="subtle"
          class="mt-2 min-h-11 max-sm:w-full"
          :label="__('Activate', null, 'Cuenta')"
          data-testid="app-activar"
          @click="ask(row)"
        />
        <!-- A soft remove is two taps in place, with what it hides. -->
        <template v-if="row.canDeactivate">
          <button
            v-if="arming !== row.app"
            type="button"
            class="press -ml-2 mt-1 inline-flex min-h-11 items-center rounded-full px-2 text-sm font-medium text-ink-gray-7 active:bg-surface-gray-2 [@media(hover:hover)]:hover:bg-surface-gray-2"
            data-testid="app-desactivar"
            @click="arm(row.app)"
          >
            {{ __('Turn off', null, 'Cuenta') }}
          </button>
          <div v-else class="mt-2 space-y-2">
            <p v-if="row.deactivateNote" class="text-sm text-ink-gray-7">
              {{ row.deactivateNote }}
            </p>
            <button
              :ref="(el) => (confirmButton = el)"
              type="button"
              class="press min-h-11 rounded-full bg-surface-red-7 px-4 text-base font-medium text-white disabled:opacity-50"
              :disabled="busy === row.app"
              data-testid="app-desactivar-si"
              @click="deactivate(row)"
              @blur="disarm"
            >
              {{
                busy === row.app
                  ? __('Turning off…', null, 'Cuenta')
                  : __('Turn off {0}', [row.title], 'Cuenta')
              }}
            </button>
          </div>
        </template>
        <a
          v-if="row.manualUrl"
          :href="row.manualUrl"
          target="_blank"
          rel="noopener"
          class="press -ml-2 mt-1 inline-flex min-h-11 items-center rounded-full px-2 text-sm text-ink-gray-7 underline-offset-2 hover:underline"
        >
          {{ __('Read its manual', null, 'Cuenta') }}
        </a>
        <div
          v-if="errors[row.app]"
          role="alert"
          class="mt-2 space-y-2"
          data-testid="app-error"
        >
          <p class="text-sm text-ink-gray-8">{{ errors[row.app].text }}</p>
          <Button
            v-if="errors[row.app].next"
            class="min-h-11"
            :label="errors[row.app].next.label"
            @click="$emit('act', errors[row.app].next.act)"
          />
        </div>
      </li>
    </ul>
    <AplicacionSheet
      v-if="sheetMounted"
      :open="Boolean(pending)"
      :app="pending"
      @close="pending = null"
      @act="leave"
      @done="activated"
    />
  </section>
</template>
<script setup>
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue'
import { Button, toast } from 'frappe-ui'
import { StatusChip } from '@/components/ui'
import { seam } from './api'
import { failureText, refusalView, seamOff } from './autoservicio'
import {
  POLL_MS,
  appRows,
  installing,
  mergeApp,
  siteNotice,
} from './aplicaciones'

// The activation sheet mounts on its first open.
const AplicacionSheet = defineAsyncComponent(
  () => import('./AplicacionSheet.vue'),
)

const props = defineProps({
  /** The page's payment door (pagos.js createPagos). */
  door: { type: Object, required: true },
  // Wrapped: a browser's setTimeout called as `timers.set()` throws «Illegal invocation».
  timers: {
    type: Object,
    default: () => ({
      set: (fn, ms) => setTimeout(fn, ms),
      clear: (id) => clearTimeout(id),
    }),
  },
})
const emit = defineEmits(['act', 'off'])

const phase = ref('loading')
const answer = ref(null)
const failure = ref('')
const pending = ref(null)
const sheetMounted = ref(false)
const arming = ref('')
const busy = ref('')
const errors = ref({})
const confirmButton = ref(null)
const rows = computed(() => appRows(answer.value))
const notice = computed(() => siteNotice(answer.value))
let poll = null
let gone = false

function stopPoll() {
  if (poll != null) props.timers.clear(poll)
  poll = null
}
// While an app installs, Boat is asked again until it is active or stops.
function schedule() {
  stopPoll()
  if (!gone && installing(rows.value))
    poll = props.timers.set(() => {
      poll = null
      load({ quiet: true })
    }, POLL_MS)
}

async function load({ quiet = false } = {}) {
  if (!quiet && !answer.value) phase.value = 'loading'
  try {
    const out = await seam('my_apps')
    if (gone) return
    if (seamOff(out)) {
      phase.value = 'off'
      emit('off')
      return
    }
    if (out?.ok === false) {
      if (!answer.value) {
        failure.value = refusalView(out).text
        phase.value = 'error'
      }
      return
    }
    answer.value = out
    failure.value = ''
    phase.value = 'ready'
  } catch (error) {
    if (gone) return
    // A poll that fails keeps the list it had and tries again.
    if (!answer.value) {
      failure.value = failureText(error)
      phase.value = 'error'
    }
  } finally {
    schedule()
  }
}
watch(
  () => props.door.boot.value,
  (boot) => boot && load(),
  { immediate: true },
)
onBeforeUnmount(() => {
  gone = true
  stopPoll()
})

// A next step out of the sheet (Equipo, the invoices, support) closes it first.
function leave(key) {
  pending.value = null
  emit('act', key)
}
function ask(row) {
  errors.value = { ...errors.value, [row.app]: null }
  sheetMounted.value = true
  pending.value = row
}
function activated(out) {
  pending.value = null
  answer.value = mergeApp(answer.value, out)
  toast.success(
    out?.status === 'active'
      ? __('App turned on', null, 'Cuenta')
      : __('We are installing it; it takes a few minutes.', null, 'Cuenta'),
  )
  schedule()
}

async function arm(app) {
  arming.value = app
  await nextTick()
  confirmButton.value?.focus?.()
}
function disarm() {
  if (!busy.value) arming.value = ''
}
async function deactivate(row) {
  if (busy.value) return
  busy.value = row.app
  errors.value = { ...errors.value, [row.app]: null }
  try {
    const out = await seam('deactivate_app', { app: row.app })
    if (out?.ok === true) {
      answer.value = mergeApp(answer.value, out)
      toast.success(out.note || __('App turned off', null, 'Cuenta'))
      await load({ quiet: true })
    } else
      errors.value = {
        ...errors.value,
        [row.app]: refusalView(
          out,
          __('We could not turn the app off. Try again.', null, 'Cuenta'),
        ),
      }
  } catch (error) {
    errors.value = {
      ...errors.value,
      [row.app]: { text: failureText(error), next: null },
    }
  } finally {
    busy.value = ''
    arming.value = ''
  }
}
</script>
