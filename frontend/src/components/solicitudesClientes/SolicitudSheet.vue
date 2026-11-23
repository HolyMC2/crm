<template>
  <!-- One request (doco storefront_support_staff.request): who asks and what
       about, their own words, the purchase or payment as a link into its page,
       the ways to reach them, what happened so far, and the steps the cell
       allows from where it is (one filled: the next step). A step that tells
       the customer takes the message box's words, and «Rechazar» needs them;
       «Programar» opens pickup, visit or hand-over at the shop and the day in
       place, with a note the customer reads in their account (the message
       box's words, or the note's own box when they get no notices). The
       cell's answer replaces the sheet; a refusal keeps it and says why. -->
  <BottomSheet
    :open="open"
    :title="detail?.who || __('Request', null, CTX)"
    :subtitle="subtitle"
    :dismissible="!busy"
    @update:open="(value) => emit('update:open', value)"
  >
    <div
      v-if="!detail && !failure"
      role="status"
      :aria-label="__('Loading…', null, CTX)"
      class="space-y-3 pb-2"
    >
      <div class="h-6 w-1/2 animate-pulse rounded-full bg-surface-gray-2" />
      <div class="h-24 animate-pulse rounded-6 bg-surface-gray-2" />
      <div class="h-14 animate-pulse rounded-6 bg-surface-gray-2" />
    </div>
    <div v-else-if="!detail" role="alert" class="space-y-3 pb-2">
      <p class="text-base text-ink-gray-8">{{ failure }}</p>
      <button
        type="button"
        :class="['press', BTN.tonal]"
        data-solicitud-reintentar
        @click="load"
      >
        {{ __('Try again', null, CTX) }}
      </button>
    </div>
    <div v-else class="space-y-5 pb-2" data-solicitud-hoja>
      <div class="flex flex-wrap items-center gap-2">
        <StatusChip
          v-if="state"
          :label="state.label"
          :tone="state.tone"
          data-solicitud-estado
        />
        <StatusChip
          v-if="due"
          :label="due.label"
          :tone="due.tone"
          data-solicitud-vence
        />
        <span class="flex-1" />
        <div
          v-if="reach.length"
          class="flex items-center gap-1"
          role="group"
          :aria-label="__('Reach the customer', null, CTX)"
        >
          <a
            v-for="link in reach"
            :key="link.key"
            :href="link.href"
            :target="link.key === 'whatsapp' ? '_blank' : undefined"
            :rel="link.key === 'whatsapp' ? 'noopener' : undefined"
            class="press flex size-11 items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-8"
            :aria-label="link.label"
            :title="link.label"
            :data-solicitud-contacto="link.key"
          >
            <span :class="[link.icon, 'size-5']" aria-hidden="true" />
          </a>
        </div>
      </div>

      <blockquote
        v-if="detail.words"
        class="whitespace-pre-line break-words rounded-6 bg-surface-gray-1 p-3 text-base text-ink-gray-9"
        data-solicitud-palabras
      >
        {{ detail.words }}
      </blockquote>
      <p v-if="guide" class="text-sm text-ink-gray-7" data-solicitud-guia>
        {{ guide }}
      </p>

      <dl
        v-if="facts.length"
        class="divide-y divide-outline-gray-1"
        data-solicitud-datos
      >
        <div
          v-for="fact in facts"
          :key="fact.key"
          class="flex min-h-11 items-center gap-3 py-1.5"
          :data-dato="fact.key"
        >
          <dt class="w-28 flex-none text-sm text-ink-gray-6">
            {{ fact.label }}
          </dt>
          <dd class="min-w-0 flex-1 break-words text-base text-ink-gray-9">
            <RouterLink
              v-if="fact.link?.to"
              :to="fact.link.to"
              class="underline decoration-outline-gray-3 underline-offset-2"
              >{{ fact.value }}</RouterLink
            >
            <a
              v-else-if="fact.link?.href"
              :href="fact.link.href"
              class="underline decoration-outline-gray-3 underline-offset-2"
              >{{ fact.value }}</a
            >
            <template v-else>{{ fact.value }}</template>
          </dd>
        </div>
      </dl>

      <div v-if="buttons.length" class="space-y-3" data-solicitud-paso-forma>
        <div
          v-if="scheduling"
          ref="schedule"
          class="space-y-3"
          data-solicitud-programar
        >
          <div
            class="flex flex-wrap gap-1.5"
            role="group"
            :aria-label="__('Pickup or visit', null, CTX)"
          >
            <button
              v-for="mode in MODES"
              :key="mode"
              type="button"
              :class="chipClass(draft.mode === mode)"
              :aria-pressed="draft.mode === mode"
              :data-solicitud-modo="mode"
              @click="draft.mode = mode"
            >
              {{ modeChoice(mode) }}
            </button>
          </div>
          <DateField
            id="solicitud-cuando"
            v-model="draft.when"
            mode="datetime"
            :label="__('Day and time', null, CTX)"
            required
          />
          <div v-if="!messageBox">
            <label
              for="solicitud-nota"
              class="mb-1 block text-sm text-ink-gray-7"
              >{{ __('Note for the customer', null, CTX) }}</label
            >
            <textarea
              id="solicitud-nota"
              v-model="draft.reason"
              rows="2"
              :maxlength="REASON_MAX"
              class="w-full rounded-6 border-0 bg-surface-gray-2 px-3 py-2 text-base text-ink-gray-9 placeholder:text-ink-gray-5 focus:ring-2 focus:ring-outline-gray-4"
              :readonly="!!busy"
              :placeholder="__('Bring the box and the ticket', null, CTX)"
              data-solicitud-nota
            />
            <p class="mt-1 text-sm text-ink-gray-6">
              {{
                __('They read it with the date in their account.', null, CTX)
              }}
            </p>
          </div>
          <RouterLink
            v-if="citas"
            :to="citas"
            :class="['press', BTN.text]"
            data-solicitud-citas
            >{{ __('Book it in appointments', null, CTX) }}</RouterLink
          >
        </div>
        <div v-if="messageBox">
          <label
            for="solicitud-mensaje"
            class="mb-1 block text-sm text-ink-gray-7"
            >{{ __('Message for the customer', null, CTX) }}</label
          >
          <textarea
            id="solicitud-mensaje"
            ref="message"
            v-model="draft.reason"
            rows="3"
            :maxlength="REASON_MAX"
            class="w-full rounded-6 border-0 bg-surface-gray-2 px-3 py-2 text-base text-ink-gray-9 placeholder:text-ink-gray-5 focus:ring-2 focus:ring-outline-gray-4"
            :readonly="!!busy"
            :aria-invalid="problem ? 'true' : undefined"
            :aria-describedby="problem ? 'solicitud-problema' : undefined"
            data-solicitud-mensaje
          />
        </div>
        <p
          v-else-if="
            detail.queue === 'devoluciones' ||
            detail.queue === 'garantias' ||
            detail.queue === 'datos'
          "
          role="note"
          class="text-sm text-ink-gray-7"
          data-solicitud-sin-avisos
        >
          {{
            __(
              'This customer gets no notices in the app: answer by WhatsApp or email.',
              null,
              CTX,
            )
          }}
        </p>
        <p
          v-if="problem"
          id="solicitud-problema"
          role="alert"
          class="text-sm text-ink-red-7"
          data-solicitud-problema
        >
          {{ problem }}
        </p>
      </div>

      <section
        v-if="detail.history?.length"
        aria-labelledby="solicitud-actividad"
        data-solicitud-actividad
      >
        <h3
          id="solicitud-actividad"
          class="mb-1 text-sm font-semibold text-ink-gray-7"
        >
          {{ __('Activity', null, CTX) }}
        </h3>
        <ol class="space-y-2">
          <li v-for="(row, index) in detail.history" :key="index">
            <p class="text-sm text-ink-gray-6">
              {{ historyWhen(row) }}
            </p>
            <p class="break-words text-sm text-ink-gray-8">{{ row.text }}</p>
          </li>
        </ol>
      </section>
    </div>

    <template v-if="detail && buttons.length" #actions>
      <div class="flex flex-wrap gap-2">
        <template v-if="scheduling">
          <button
            type="button"
            :class="['press flex-none', BTN.tonal]"
            :disabled="!!busy"
            data-solicitud-programar-cancelar
            @click="scheduling = false"
          >
            {{ __('Cancel', null, CTX) }}
          </button>
          <button
            type="button"
            :class="['press flex-1', BTN.filled]"
            :disabled="!!busy"
            data-solicitud-paso="programar"
            @click="take('programar')"
          >
            <span
              v-if="busy === 'programar'"
              class="lucide-loader-circle size-5 animate-spin"
              aria-hidden="true"
            />
            {{ __('Schedule', null, CTX) }}
          </button>
        </template>
        <template v-else>
          <button
            v-for="button in buttons"
            :key="button.action"
            type="button"
            :class="[
              'press',
              button.primary
                ? `flex-1 ${BTN.filled}`
                : `flex-none ${BTN.tonal}`,
            ]"
            :disabled="!!busy"
            :data-solicitud-paso="button.action"
            @click="press(button.action)"
          >
            <span
              v-if="busy === button.action"
              class="lucide-loader-circle size-5 animate-spin"
              aria-hidden="true"
            />
            {{ button.label }}
          </button>
        </template>
      </div>
    </template>
  </BottomSheet>
</template>

<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { toast } from 'frappe-ui'
import { BottomSheet, DateField, StatusChip, chipClass } from '@/components/ui'
import { shellBoot } from '@/composables/muelleShell'
import { BTN } from '@/documentos/tools'
import { errorText } from '@/utils/errorText'
import { formatDate, formatTime } from '@/utils/display'
import { scrollWithin } from '@/utils/scrollWithin'
import { readRequest, takeStep } from './api'
import {
  CTX,
  MODES,
  REASON_MAX,
  actionButtons,
  citasLink,
  detailFacts,
  detailSubtitle,
  dueChip,
  guideText,
  hasMessage,
  modeChoice,
  reachLinks,
  stateChip,
  stepPayload,
  stepProblem,
  stepToast,
} from './view'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** The item id the queue gave (rr:…, ld:…, dp:…, tx:…). */
  id: { type: String, default: '' },
})
const emit = defineEmits(['update:open', 'changed'])

const detail = ref(null)
const failure = ref('')
const busy = ref('')
const problem = ref('')
const scheduling = ref(false)
const message = ref(null)
const schedule = ref(null)
const draft = reactive({ reason: '', mode: '', when: '' })

const subtitle = computed(() => detailSubtitle(detail.value))
const state = computed(() => stateChip(detail.value?.state))
const due = computed(() => dueChip(detail.value))
const reach = computed(() => reachLinks(detail.value?.contact))
const guide = computed(() => guideText(detail.value))
const facts = computed(() =>
  detailFacts(detail.value, { boot: shellBoot.value }),
)
const buttons = computed(() => actionButtons(detail.value))
const messageBox = computed(() => hasMessage(detail.value))
const citas = computed(() => citasLink(detail.value?.citas))

function historyWhen(row) {
  const when = row?.date
    ? `${formatDate(row.date)} ${formatTime(row.date)}`.trim()
    : ''
  return [when, row?.who].filter(Boolean).join(', ')
}

function reset() {
  draft.reason = ''
  draft.mode = ''
  draft.when = ''
  problem.value = ''
  scheduling.value = false
}

let sequence = 0
async function load() {
  const mine = ++sequence
  detail.value = null
  failure.value = ''
  reset()
  if (!props.id) return
  try {
    const answer = await readRequest(props.id)
    if (mine === sequence) detail.value = answer || null
  } catch (error) {
    if (mine === sequence)
      failure.value = errorText(
        error,
        __('This request could not open. Try again.', null, CTX),
      )
  }
}
watch([() => props.open, () => props.id], ([open]) => open && load(), {
  immediate: true,
})
watch(
  () => draft.reason,
  () => (problem.value = ''),
)

async function press(action) {
  if (busy.value || !detail.value) return
  if (action === 'programar') {
    problem.value = ''
    scheduling.value = true
    // The form opens under the facts: bring it up to the buttons.
    nextTick(() => schedule.value && scrollWithin(schedule.value))
    return
  }
  await take(action)
}

async function take(action) {
  if (busy.value || !detail.value) return
  const why = stepProblem(action, draft)
  if (why) {
    problem.value = why
    if (action === 'rechazar')
      nextTick(() => {
        if (!message.value) return
        scrollWithin(message.value)
        message.value.focus({ preventScroll: true })
      })
    return
  }
  busy.value = action
  try {
    const answer = await takeStep(stepPayload(detail.value.id, action, draft))
    const before = detail.value
    detail.value = answer || before
    toast.success(stepToast(action, answer?.notified === true, before))
    reset()
    emit('changed', answer)
  } catch (error) {
    toast.error(
      errorText(
        error,
        __('That step did not go through. Try again.', null, CTX),
      ),
    )
  } finally {
    busy.value = ''
  }
}
</script>
