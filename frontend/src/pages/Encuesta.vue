<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
    <div class="mx-auto w-full max-w-3xl px-4 pb-28 pt-4 sm:px-6 sm:pb-10">
      <nav class="mb-3">
        <button
          class="flex min-h-11 items-center gap-1 text-sm text-ink-gray-7 hover:text-ink-gray-9"
          @click="goBack"
        >
          <FeatherIcon name="arrow-left" class="h-4 w-4" />
          {{ backLabel }}
        </button>
      </nav>

      <section
        v-if="guard"
        role="alert"
        class="mx-auto max-w-xl space-y-4 py-6"
      >
        <h1 class="text-xl font-semibold">{{ guard.title }}</h1>
        <p class="text-base text-ink-gray-7">{{ guard.detail }}</p>
        <div class="flex flex-wrap gap-2">
          <Button :label="__('Retry', null, 'Encuestas')" @click="load" />
          <Button :label="__('Back to Encuestas')" @click="goBack" />
        </div>
      </section>

      <div v-else-if="!answer" role="status" class="py-10 text-sm">
        {{ __('Loading answer…') }}
      </div>

      <template v-else>
        <header class="mb-4 flex items-start gap-3">
          <span
            class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-2xl font-semibold"
            :class="SCORE_CLASS[answer.bucket]"
            :aria-label="scoreLabel(answer.score)"
            >{{ answer.score }}</span
          >
          <div class="min-w-0 flex-1">
            <p
              class="flex flex-wrap items-center gap-1 text-sm text-ink-gray-6"
            >
              <Badge
                :theme="bucketTheme(answer.bucket)"
                :label="bucketLabel(answer.bucket)"
              />
              <Badge
                :theme="followUpTheme(answer.follow_up_status)"
                :label="followUpLabel(answer.follow_up_status)"
              />
              <span>{{ when(answer.creation) }}</span>
            </p>
            <h1 class="truncate text-2xl font-semibold text-ink-gray-9">
              {{ answer.customer_name }}
            </h1>
            <p class="mt-1 text-sm text-ink-gray-6">
              {{ [answer.sale, answer.company].filter(Boolean).join(' · ') }}
            </p>
          </div>
        </header>

        <div
          v-if="notice"
          role="status"
          class="mb-4 rounded-lg bg-surface-green-1 p-3 text-sm text-ink-green-8"
        >
          {{ notice }}
          <RouterLink
            v-if="nextName"
            :to="{ ...recordRoute(nextName), query: listQuery }"
            class="ml-1 font-medium underline"
            >{{ __('Next customer') }}</RouterLink
          >
        </div>
        <div
          v-if="problem"
          role="alert"
          class="mb-4 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          <strong>{{ problem.title }}.</strong> {{ problem.detail }}
          <Button
            class="ml-2"
            :label="__('Refresh', null, 'Encuestas')"
            @click="load"
          />
        </div>

        <section class="mb-4 rounded-lg border border-outline-gray-2 p-4">
          <h2 class="mb-1 text-sm font-medium text-ink-gray-6">
            {{ __('What they said') }}
          </h2>
          <p
            v-if="answer.comment"
            class="whitespace-pre-line text-base text-ink-gray-9"
          >
            {{ answer.comment }}
          </p>
          <p v-else class="text-base text-ink-gray-6">
            {{ __('They gave a score without a comment.') }}
          </p>
        </section>

        <section class="mb-4 flex flex-wrap gap-2">
          <Button
            v-if="answer.actions?.take"
            :variant="
              answer.follow_up_status === 'Completed' ? 'subtle' : 'solid'
            "
            icon-left="user-check"
            :label="takeLabel"
            :loading="busy === 'take'"
            class="min-h-11 sm:min-h-8"
            @click="take"
          />
          <Button
            v-if="answer.actions?.close"
            :variant="answer.actions?.take ? 'subtle' : 'solid'"
            icon-left="check"
            :label="__('Close follow-up')"
            class="min-h-11 sm:min-h-8"
            @click="closing = true"
          />
          <a
            v-if="waHref"
            :href="waHref"
            target="_blank"
            rel="noopener"
            class="inline-flex min-h-11 items-center gap-1 rounded bg-surface-gray-2 px-3 text-sm font-medium text-ink-gray-8 hover:bg-surface-gray-3 sm:min-h-8"
          >
            <FeatherIcon name="message-circle" class="h-4 w-4" />
            {{ __('Message on WhatsApp') }}
          </a>
          <a
            v-if="answer.phone"
            :href="`tel:${answer.phone}`"
            class="inline-flex min-h-11 items-center gap-1 rounded bg-surface-gray-2 px-3 text-sm font-medium text-ink-gray-8 hover:bg-surface-gray-3 sm:min-h-8"
          >
            <FeatherIcon name="phone" class="h-4 w-4" />
            {{ __('Call', null, 'Encuestas') }}
          </a>
          <RouterLink
            v-if="garantiaLink"
            :to="garantiaLink"
            class="inline-flex min-h-11 items-center gap-1 rounded bg-surface-gray-2 px-3 text-sm font-medium text-ink-gray-8 hover:bg-surface-gray-3 sm:min-h-8"
          >
            <FeatherIcon name="shield" class="h-4 w-4" />
            {{ __('Open a warranty case') }}
          </RouterLink>
        </section>
        <p
          v-if="!answer.phone"
          role="status"
          class="mb-4 text-sm text-ink-gray-6"
        >
          {{
            __(
              'This sale has no phone. Open the customer to find another way to reach them.',
            )
          }}
        </p>
        <p
          v-else-if="!waHref && !whatsappOff"
          class="mb-4 text-sm text-ink-gray-6"
        >
          {{ __('The phone looks incomplete; call or open the customer.') }}
        </p>

        <section class="mb-4 rounded-lg border border-outline-gray-2 p-4">
          <h2 class="mb-2 text-sm font-medium text-ink-gray-6">
            {{ __('Customer and sale') }}
          </h2>
          <dl class="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt class="text-ink-gray-6">
                {{ __('Customer', null, 'Encuestas') }}
              </dt>
              <dd>
                <RouterLink
                  v-if="customerLink"
                  :to="customerLink"
                  class="font-medium text-ink-gray-9 underline"
                  >{{ answer.customer_name }}</RouterLink
                >
                <span v-else>{{ answer.customer_name }}</span>
              </dd>
            </div>
            <div>
              <dt class="text-ink-gray-6">
                {{ __('Phone', null, 'Encuestas') }}
              </dt>
              <dd>{{ answer.phone || '—' }}</dd>
            </div>
            <div>
              <dt class="text-ink-gray-6">
                {{ __('Sale', null, 'Encuestas') }}
              </dt>
              <dd>{{ answer.sale || '—' }}</dd>
            </div>
            <div>
              <dt class="text-ink-gray-6">
                {{ __('Answered', null, 'Encuestas') }}
              </dt>
              <dd>{{ when(answer.creation, true) }}</dd>
            </div>
          </dl>
        </section>

        <section
          v-if="steps.length"
          class="rounded-lg border border-outline-gray-2 p-4"
        >
          <h2 class="mb-2 text-sm font-medium text-ink-gray-6">
            {{ __('Follow-up') }}
          </h2>
          <ol class="space-y-3">
            <li v-for="(step, index) in steps" :key="index" class="text-sm">
              <p class="font-medium text-ink-gray-9">
                {{ step.responsible_name || step.responsible }}
                <Badge
                  class="ml-1"
                  :theme="step.status === 'Completed' ? 'green' : 'blue'"
                  :label="
                    step.status === 'Completed'
                      ? __('Done', null, 'Encuestas')
                      : __('In progress', null, 'Encuestas')
                  "
                />
              </p>
              <p
                v-if="step.resolution"
                class="whitespace-pre-line text-ink-gray-8"
              >
                {{ step.resolution }}
              </p>
            </li>
          </ol>
        </section>
      </template>
    </div>

    <Dialog
      v-model="closing"
      :options="{ title: __('Close follow-up'), size: 'md' }"
    >
      <template #body-content>
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
          class="mt-3 rounded-md bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          <strong>{{ closeProblem.title }}.</strong> {{ closeProblem.detail }}
        </p>
      </template>
      <template #actions>
        <div class="flex flex-wrap justify-end gap-2">
          <Button
            :label="__('Cancel', null, 'Encuestas')"
            @click="closing = false"
          />
          <Button
            variant="solid"
            :label="__('Close follow-up')"
            :loading="busy === 'close'"
            :disabled="!whatWeDid.trim()"
            class="min-h-11 sm:min-h-8"
            @click="close"
          />
        </div>
      </template>
    </Dialog>
  </div>
</template>
<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge, Button, Dialog, FeatherIcon, FormControl } from 'frappe-ui'
import { whatsappMode } from '@/composables/whatsapp'
import {
  bucketLabel,
  bucketTheme,
  customerHref,
  encuestasApi,
  encuestasBoot,
  followUpLabel,
  followUpTheme,
  garantiaHref,
  greeting,
  loadEncuestasBoot,
  problemOf,
  recordRoute,
  safeReturn,
  scoreLabel,
  whatsappHref,
} from '@/composables/useEncuestas'
import { shellBoot } from '@/composables/muelleShell'
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
