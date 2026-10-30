<template>
  <!-- An answer to a survey (Shell look, record-header): the bar names the
       customer with the follow-up's state; the island calls and writes to
       them, the bolt holds the next steps and «⋯» every tool. The hero shows
       the score, what they said and the one filled step: take it, or close
       the follow-up. Then the customer and sale, the follow-up so far and
       Actividad, beside them on a desk. -->
  <div class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
    <AppBar
      :back="true"
      :back-label="backLabel"
      :title="answer?.customer_name || ''"
      :bell="isPhone"
      @back="onBack"
    >
      <template v-if="answer" #title>
        <div class="flex min-h-12 min-w-0 flex-col justify-center px-3">
          <span
            class="title-face line-clamp-2 break-words text-xl font-semibold leading-tight [text-wrap:balance]"
            data-appbar-title
            >{{ answer.customer_name }}</span
          >
          <span class="flex min-w-0 items-center gap-2 pt-0.5">
            <StatusChip
              :label="chip.label"
              :tone="chip.tone"
              data-testid="encuesta-status"
            />
            <span class="truncate text-sm leading-tight text-ink-gray-6">{{
              kindLine
            }}</span>
          </span>
        </div>
      </template>
      <template #actions>
        <RecordIsland
          v-if="answer"
          :reach="{ phone: answer.phone || '' }"
          :who="answer.customer_name || ''"
          :groups="boltGroups"
          :phone="isPhone"
          :subtitle="kit.scopeTitle.value"
          @pick="onBolt"
          @tools="kit.openTools()"
        />
      </template>
    </AppBar>

    <div class="min-h-0 flex-1 overflow-y-auto pb-28 sm:pb-10">
      <EmptyState
        v-if="guard"
        role="alert"
        state="error"
        :title="guard.title"
        :message="guard.detail"
        :action="__('Retry', null, 'Encuestas')"
        @action="load"
      />
      <EmptyState
        v-else-if="!answer"
        role="status"
        state="loading"
        :title="__('Loading answer…')"
      />

      <div
        v-else
        class="mx-auto grid w-full max-w-6xl gap-x-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
      >
        <div class="flex min-w-0 flex-col gap-5 pt-4">
          <div
            v-if="notice"
            role="status"
            class="mx-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-6 bg-surface-green-1 p-3 text-base text-ink-green-8"
          >
            <span
              class="lucide-circle-check size-5 flex-none"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1">{{ notice }}</span>
            <RouterLink
              v-if="nextName"
              :to="{ ...recordRoute(nextName), query: listQuery }"
              :class="['press', BTN.tonal]"
              data-testid="encuesta-next-customer"
              >{{ __('Next customer') }}
              <span class="lucide-chevron-right size-5" aria-hidden="true"
            /></RouterLink>
          </div>
          <div
            v-if="problem"
            role="alert"
            class="mx-4 space-y-2 rounded-6 bg-surface-red-1 p-3 text-base text-ink-red-7"
          >
            <p>
              <strong>{{ problem.title }}.</strong> {{ problem.detail }}
            </p>
            <button type="button" :class="['press', BTN.tonal]" @click="load">
              <span class="lucide-refresh-cw size-5" aria-hidden="true" />
              {{ __('Refresh', null, 'Encuestas') }}
            </button>
          </div>

          <!-- The hero: the score, what they said, and the one next step. -->
          <section
            class="flex flex-col gap-3 px-4"
            :aria-label="__('Next step', null, 'Compras')"
            data-testid="encuesta-hero"
          >
            <div class="flex items-center gap-3">
              <span
                class="num flex size-14 flex-none items-center justify-center rounded-full text-2xl font-semibold tabular-nums"
                :class="SCORE_CLASS[answer.bucket]"
                :aria-label="scoreLabel(answer.score, answer.scale)"
                :title="scoreLabel(answer.score, answer.scale)"
                data-testid="encuesta-score"
                >{{ answer.score }}</span
              >
              <div class="min-w-0">
                <p class="text-lg font-semibold text-ink-gray-9">
                  {{ bucketLabel(answer.bucket, answer.kind) }}
                </p>
                <p class="text-base text-ink-gray-6">
                  {{
                    [
                      scoreLabel(answer.score, answer.scale),
                      when(answer.creation),
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  }}
                </p>
              </div>
            </div>
            <blockquote
              class="rounded-6 bg-surface-gray-1 p-3 text-base"
              :aria-label="__('What they said')"
            >
              <p
                v-if="answer.comment"
                class="whitespace-pre-line break-words text-ink-gray-9"
              >
                {{ answer.comment }}
              </p>
              <p v-else class="text-ink-gray-6">
                {{ __('They gave a score without a comment.') }}
              </p>
            </blockquote>
            <p
              v-if="!answer.phone"
              role="status"
              class="text-base text-ink-gray-7"
            >
              {{
                __(
                  'This sale has no phone. Open the customer to find another way to reach them.',
                )
              }}
            </p>
            <p
              v-else-if="!waHref && !whatsappOff"
              class="text-base text-ink-gray-7"
            >
              {{ __('The phone looks incomplete; call or open the customer.') }}
            </p>
            <div
              v-if="nextSteps.length"
              class="flex flex-wrap gap-2"
              data-testid="encuesta-next"
            >
              <template v-for="step in nextSteps" :key="step.key">
                <a
                  v-if="step.href"
                  :href="step.href"
                  :target="step.external ? '_blank' : undefined"
                  :rel="step.external ? 'noopener' : undefined"
                  :class="['press', step.filled ? BTN.filled : BTN.tonal]"
                  :data-step="step.key"
                  :data-testid="step.testid"
                  ><span :class="[step.icon, 'size-5']" aria-hidden="true" />
                  {{ step.label }}</a
                >
                <button
                  v-else
                  type="button"
                  :class="['press', step.filled ? BTN.filled : BTN.tonal]"
                  :disabled="!!busy"
                  :data-step="step.key"
                  :data-testid="step.testid"
                  @click="step.run()"
                >
                  <span
                    :class="[
                      busy === step.key
                        ? 'lucide-loader-circle animate-spin'
                        : step.icon,
                      'size-5',
                    ]"
                    aria-hidden="true"
                  />
                  {{ step.label }}
                </button>
              </template>
            </div>
          </section>

          <!-- Who answered and about what, each to its own record. -->
          <section class="px-4" aria-labelledby="encuesta-cliente">
            <h2
              id="encuesta-cliente"
              class="pb-1 text-base font-semibold text-ink-gray-9"
            >
              {{ __('Customer and sale') }}
            </h2>
            <ul class="divide-y divide-outline-gray-1">
              <li v-for="row in facts" :key="row.key">
                <component
                  :is="row.to ? RouterLink : 'div'"
                  :to="row.to"
                  class="flex min-h-14 items-center gap-3 rounded-6 py-2"
                  :class="
                    row.to &&
                    'press [@media(hover:hover)]:hover:bg-surface-gray-1'
                  "
                >
                  <span
                    class="flex size-10 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7"
                    aria-hidden="true"
                  >
                    <span :class="[row.icon, 'size-5']" />
                  </span>
                  <span class="flex min-w-0 flex-1 flex-col">
                    <span class="text-sm text-ink-gray-6">{{ row.label }}</span>
                    <span class="break-words text-base text-ink-gray-9">{{
                      row.value
                    }}</span>
                  </span>
                  <span
                    v-if="row.to"
                    class="lucide-chevron-right size-4 flex-none text-ink-gray-5"
                    aria-hidden="true"
                  />
                </component>
              </li>
            </ul>
          </section>
        </div>

        <aside class="flex min-w-0 flex-col gap-5 pt-5 lg:pt-4">
          <section
            v-if="steps.length"
            class="px-4"
            aria-labelledby="encuesta-seguimiento"
          >
            <h2
              id="encuesta-seguimiento"
              class="pb-1 text-base font-semibold text-ink-gray-9"
            >
              {{ __('Follow-up') }}
            </h2>
            <ol class="divide-y divide-outline-gray-1">
              <li
                v-for="(step, index) in steps"
                :key="index"
                class="flex min-w-0 gap-3 py-3"
              >
                <span
                  class="flex size-10 flex-none items-center justify-center rounded-full"
                  :class="
                    step.status === 'Completed'
                      ? 'bg-surface-green-1 text-ink-green-7'
                      : 'bg-surface-gray-2 text-ink-gray-7'
                  "
                  aria-hidden="true"
                >
                  <span
                    :class="[
                      step.status === 'Completed'
                        ? 'lucide-circle-check'
                        : 'lucide-user-check',
                      'size-5',
                    ]"
                  />
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-base text-ink-gray-9">
                    {{ step.responsible_name || step.responsible }}
                  </p>
                  <p class="text-sm text-ink-gray-6">
                    {{
                      step.status === 'Completed'
                        ? __('Done', null, 'Encuestas')
                        : __('In progress', null, 'Encuestas')
                    }}
                  </p>
                  <p
                    v-if="step.resolution"
                    class="whitespace-pre-line break-words pt-1 text-base text-ink-gray-8"
                  >
                    {{ step.resolution }}
                  </p>
                </div>
              </li>
            </ol>
          </section>
          <!-- Shell SPEC §6 DD2: Conexiones, Actividad and the «⋯» sheets. -->
          <RecordKit
            :kit="kit"
            :title="answer.customer_name || props.name"
            :cadena="false"
          />
        </aside>
      </div>
    </div>

    <BottomSheet
      :open="closing"
      :title="__('Close follow-up')"
      :subtitle="answer?.customer_name || ''"
      :dismissible="busy !== 'close'"
      @update:open="(value) => (closing = value)"
    >
      <div class="space-y-3 pt-1" data-testid="encuesta-close-sheet">
        <FormControl
          v-model="whatWeDid"
          type="textarea"
          :rows="4"
          :label="__('What did you do?')"
          :placeholder="
            __('E.g. called her, refunded the difference, she was happy.')
          "
        />
        <p
          v-if="closeProblem"
          role="alert"
          class="rounded-6 bg-surface-red-1 p-3 text-base text-ink-red-7"
        >
          <strong>{{ closeProblem.title }}.</strong> {{ closeProblem.detail }}
        </p>
      </div>
      <template #actions>
        <button
          type="button"
          :class="['press', BTN.filled, 'w-full justify-center']"
          :disabled="!whatWeDid.trim() || busy === 'close'"
          data-testid="encuesta-close-confirm"
          @click="close"
        >
          <span
            :class="[
              busy === 'close'
                ? 'lucide-loader-circle animate-spin'
                : 'lucide-check',
              'size-5',
            ]"
            aria-hidden="true"
          />
          {{ __('Close follow-up') }}
        </button>
      </template>
    </BottomSheet>
  </div>
</template>
<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { FormControl } from 'frappe-ui'
import { AppBar, BottomSheet, EmptyState, StatusChip } from '@/components/ui'
import RecordIsland from '@/components/documentos/RecordIsland.vue'
import RecordKit from '@/components/documentos/compras/RecordKit.vue'
import { useRecordKit } from '@/components/documentos/compras/recordKit'
import { recordActionsFor } from '@/documentos/acciones'
import { BTN } from '@/documentos/tools'
import { whatsappMode } from '@/composables/whatsapp'
import {
  bucketLabel,
  conversationHref,
  customerHref,
  encuestasApi,
  encuestasBoot,
  followUpLabel,
  garantiaHref,
  greeting,
  kindLabel,
  loadEncuestasBoot,
  problemOf,
  recordRoute,
  safeReturn,
  scoreLabel,
  whatsappHref,
} from '@/composables/useEncuestas'
import { shellBoot } from '@/composables/muelleShell'
import { isMobile as isPhone } from '@/composables/breakpoint'
import { can, moduleEnabled } from '@/vendor/muelle-shell/contracts'

const SCORE_CLASS = {
  detractor: 'bg-surface-red-2 text-ink-red-8',
  passive: 'bg-surface-amber-2 text-ink-amber-8',
  promoter: 'bg-surface-green-2 text-ink-green-8',
}

const props = defineProps({ name: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
const answer = ref(null)
const guard = ref(null)
const problem = ref(null)
const notice = ref('')
const nextName = ref(null)
const busy = ref('')
const closing = ref(false)
const whatWeDid = ref('')
const closeProblem = ref(null)

// The engine's «⋯» tools, Conexiones and Actividad, loaded after paint.
const kit = useRecordKit('Quality Feedback', {
  name: () => props.name,
  title: () => answer.value?.customer_name || '',
  modified: () => answer.value?.modified,
  changed: () => load(),
})

const returnTo = computed(() => safeReturn(route.query.return_to))
const listQuery = computed(() =>
  typeof route.query.list === 'string' ? { list: route.query.list } : {},
)
const backLabel = computed(() =>
  returnTo.value
    ? __('Back to {0}', [
        typeof route.query.return_label === 'string'
          ? route.query.return_label.slice(0, 40)
          : __('previous screen'),
      ])
    : __('Back to Encuestas'),
)
const steps = computed(() => answer.value?.follow_up_detail?.steps || [])
const takeLabel = computed(() =>
  answer.value?.follow_up_status === 'Completed'
    ? __('Reopen and take it')
    : __("I'll take it"),
)
const whatsappOff = computed(() => whatsappMode.value === 'off')
const waHref = computed(() =>
  whatsappOff.value
    ? null
    : whatsappHref(answer.value?.phone, greeting(answer.value)),
)
// Hand-offs only to the modules this worker can open (the shell boot says which).
const customerLink = computed(() =>
  moduleEnabled(shellBoot.value, 'contactos')
    ? customerHref(answer.value)
    : null,
)
const garantiaLink = computed(() =>
  can(shellBoot.value, 'garantias', 'create')
    ? garantiaHref(answer.value)
    : null,
)
// The server offers it only to a reader of that deal or lead; Conversaciones checks again.
const conversationLink = computed(() => conversationHref(answer.value))

// ── the bar: the customer, the follow-up's state, what kind of answer ────
const chip = computed(() => {
  const a = answer.value || {}
  const label = followUpLabel(a.follow_up_status)
  if (a.follow_up_status === 'Completed') return { label, tone: 'success' }
  if (a.follow_up_status === 'Open') return { label, tone: 'info' }
  return { label, tone: a.bucket === 'detractor' ? 'danger' : 'neutral' }
})
const kindLine = computed(() => {
  const a = answer.value || {}
  return [a.kind === 'service' ? kindLabel('service') : a.sale, a.company]
    .filter(Boolean)
    .join(' · ')
})

// ── the hero's steps: take it or close it (filled), then the ways to reach ─
const nextSteps = computed(() => {
  const a = answer.value || {}
  const done = a.follow_up_status === 'Completed'
  const out = []
  if (a.actions?.take)
    out.push({
      key: 'take',
      label: takeLabel.value,
      icon: 'lucide-user-check',
      filled: !done,
      testid: 'encuesta-take',
      run: take,
    })
  if (a.actions?.close)
    out.push({
      key: 'close',
      label: __('Close follow-up'),
      icon: 'lucide-check',
      filled: !a.actions?.take,
      testid: 'encuesta-close',
      run: () => {
        closeProblem.value = null
        closing.value = true
      },
    })
  // The bar's island calls; this one opens WhatsApp with the greeting written.
  if (waHref.value)
    out.push({
      key: 'whatsapp',
      label: __('Message on WhatsApp'),
      icon: 'lucide-message-circle',
      href: waHref.value,
      external: true,
    })
  if (garantiaLink.value)
    out.push({
      key: 'garantia',
      label: __('Open a warranty case'),
      icon: 'lucide-shield',
      run: () => router.push(garantiaLink.value),
    })
  // «¿Cómo te atendimos?»: the conversation it was about, back here after.
  if (conversationLink.value)
    out.push({
      key: 'conversation',
      label: __('Open the conversation'),
      icon: 'lucide-message-square',
      testid: 'encuesta-open-conversation',
      run: () => router.push(conversationLink.value),
    })
  return out.sort((x, y) => Number(!!y.filled) - Number(!!x.filled))
})

const facts = computed(() => {
  const a = answer.value || {}
  return [
    {
      key: 'customer',
      label: __('Customer', null, 'Encuestas'),
      value: a.customer_name || '—',
      icon: 'lucide-user',
      to: customerLink.value,
    },
    {
      key: 'phone',
      label: __('Phone', null, 'Encuestas'),
      value: a.phone || '—',
      icon: 'lucide-phone',
    },
    a.kind === 'service'
      ? {
          key: 'conversation',
          label: __('Conversation', null, 'Encuestas'),
          value: a.conversation || '—',
          icon: 'lucide-message-square',
        }
      : {
          key: 'sale',
          label: __('Sale', null, 'Encuestas'),
          value: a.sale || '—',
          icon: 'lucide-receipt',
        },
    {
      key: 'answered',
      label: __('Answered', null, 'Encuestas'),
      value: when(a.creation, true),
      icon: 'lucide-calendar',
    },
  ]
})

// ── the bolt: the hero's steps; «⋯» keeps print, share and the rest ──────
const boltSteps = computed(() =>
  nextSteps.value.map((step) =>
    step.href
      ? {
          ...step,
          run: () =>
            step.external
              ? window.open(step.href, '_blank', 'noopener')
              : window.location.assign(step.href),
        }
      : step,
  ),
)
const boltGroups = computed(() =>
  recordActionsFor({ steps: boltSteps.value, tools: kit.tools.value }),
)
function onBolt({ key }) {
  if (key.startsWith('paso:')) boltSteps.value[Number(key.slice(5))]?.run()
  else kit.onTool(key)
}

function when(value, withTime = false) {
  if (!value) return ''
  const date = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(date)
}

async function load() {
  problem.value = null
  try {
    answer.value = await encuestasApi('record', { name: props.name })
    nextName.value = answer.value.next || null
    guard.value = null
  } catch (error) {
    const found = problemOf(error)
    if (!answer.value)
      guard.value = {
        title:
          found.kind === 'permission'
            ? __('You cannot open this answer')
            : __('Could not open the answer'),
        detail: found.detail,
      }
    else problem.value = found
  }
}

async function take() {
  busy.value = 'take'
  problem.value = null
  notice.value = ''
  try {
    answer.value = await encuestasApi('take', {
      name: answer.value.name,
      modified: answer.value.modified,
    })
    notice.value = __('It is yours now. It also shows in your Pendientes.')
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    busy.value = ''
  }
}

async function close() {
  busy.value = 'close'
  closeProblem.value = null
  try {
    const out = await encuestasApi('close', {
      name: answer.value.name,
      what_we_did: whatWeDid.value.trim(),
      modified: answer.value.modified,
    })
    answer.value = out.record
    nextName.value = out.next || null
    closing.value = false
    whatWeDid.value = ''
    notice.value = out.next
      ? __('Follow-up closed.')
      : __('Follow-up closed. Nobody else is waiting.')
  } catch (error) {
    // The text stays in the box; the message says what to do.
    closeProblem.value = problemOf(error)
  } finally {
    busy.value = ''
  }
}

function onBack(event) {
  event?.preventDefault?.()
  goBack()
}
function goBack() {
  if (returnTo.value) return window.location.assign(returnTo.value)
  const list = typeof route.query.list === 'string' ? route.query.list : ''
  if (list.startsWith('/encuestas')) return router.push(list)
  router.push({ name: 'Encuestas' })
}

watch(
  () => props.name,
  () => {
    answer.value = null
    notice.value = ''
    load()
  },
)
onMounted(async () => {
  await loadEncuestasBoot()
  if (!encuestasBoot.value?.enabled) {
    guard.value = {
      title: __('Encuestas is not available'),
      detail:
        encuestasBoot.value?.reason ||
        __('Ask the owner for access to what customers answered.'),
    }
    return
  }
  await load()
})
</script>
