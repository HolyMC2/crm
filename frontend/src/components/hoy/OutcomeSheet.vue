<template>
  <!-- «¿Qué pasó?» for a follow-up (crm.pipeline.services.outcomes): reach
       the person (WhatsApp written, a call), then one tap says how it went.
       An outcome that needs a time or a reason asks for it in a second step. -->
  <BottomSheet
    :open="open"
    :title="state?.title || row?.description || __('Follow-up')"
    :subtitle="subtitle"
    layer="seguimiento-resultado"
    @update:open="(value) => !value && emit('close')"
  >
    <div class="space-y-5 pb-2" data-outcome-sheet>
      <p
        v-if="problem"
        role="alert"
        class="rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
        data-outcome-problem
      >
        {{ problem }}
      </p>
      <div
        v-if="!state && !problem"
        role="status"
        :aria-label="__('Loading…')"
        class="space-y-3"
      >
        <div class="h-11 animate-pulse rounded-7 bg-surface-gray-2" />
        <div class="h-14 animate-pulse rounded-7 bg-surface-gray-2" />
        <div class="h-14 animate-pulse rounded-7 bg-surface-gray-2" />
      </div>
      <template v-else-if="state">
        <div class="flex flex-wrap gap-2" data-outcome-reach>
          <a
            v-if="whatsapp?.kind === 'link'"
            :href="whatsapp.url"
            target="_blank"
            rel="noopener"
            :class="REACH"
            data-outcome-whatsapp
            @click="logOpen"
          >
            <span
              class="lucide-message-circle size-5 text-ink-green-8"
              aria-hidden="true"
            />
            {{ __('Write on WhatsApp') }}
          </a>
          <button
            v-else-if="whatsapp?.kind === 'thread'"
            type="button"
            :class="REACH"
            data-outcome-whatsapp
            @click="openThread"
          >
            <span
              class="lucide-message-circle size-5 text-ink-green-8"
              aria-hidden="true"
            />
            {{ __('Open the chat') }}
          </button>
          <a
            v-if="state.reach?.call"
            :href="state.reach.call"
            :class="REACH"
            data-outcome-call
          >
            <span class="lucide-phone size-5" aria-hidden="true" />
            {{ __('Call them') }}
          </a>
          <RouterLink :to="recordTo" :class="REACH" data-outcome-record>
            <span class="lucide-external-link size-5" aria-hidden="true" />
            {{ __('Open') }}
          </RouterLink>
        </div>
        <p
          v-if="state.reach?.message"
          class="whitespace-pre-line rounded-7 bg-surface-gray-1 px-3 py-2 text-sm text-ink-gray-7"
          data-outcome-message
        >
          {{ state.reach.message }}
        </p>

        <p
          v-if="!state.can_change"
          class="text-sm text-ink-gray-6"
          data-outcome-readonly
        >
          {{
            __('This follow-up is someone else’s. Ask them or your manager.')
          }}
        </p>
        <section
          v-else-if="!asking"
          aria-labelledby="outcome-what"
          data-outcome-actions
        >
          <h3 id="outcome-what" class="text-sm font-semibold text-ink-gray-7">
            {{ __('What happened?') }}
            <span
              v-if="state.attempts"
              class="ml-1 font-normal text-ink-amber-8"
              data-outcome-attempts
              >·
              {{
                state.attempts === 1
                  ? __('1 try without an answer')
                  : __('{0} tries without an answer', [state.attempts])
              }}</span
            >
          </h3>
          <ul class="mt-2 space-y-2">
            <li v-for="action in state.actions" :key="action.key">
              <button
                type="button"
                class="press flex min-h-14 w-full items-center gap-3 rounded-7 border border-outline-gray-2 px-4 py-2 text-left hover:bg-surface-gray-1 disabled:opacity-60"
                :disabled="busy"
                :data-outcome="action.key"
                @click="choose(action)"
              >
                <span
                  :class="[iconOf(action), toneOf(action)]"
                  class="size-5 shrink-0"
                  aria-hidden="true"
                />
                <span class="min-w-0 flex-1">
                  <span class="block text-base font-medium text-ink-gray-9">{{
                    action.label
                  }}</span>
                  <span
                    v-if="action.hint"
                    class="block text-sm text-ink-gray-6"
                    >{{ action.hint }}</span
                  >
                </span>
                <span
                  v-if="action.ask"
                  class="lucide-chevron-right size-4 shrink-0 text-ink-gray-5"
                  aria-hidden="true"
                />
              </button>
            </li>
          </ul>
        </section>
        <section v-else aria-labelledby="outcome-ask" data-outcome-ask>
          <button
            type="button"
            class="press -ml-1 flex min-h-11 items-center gap-1 text-sm font-medium text-ink-gray-7"
            @click="asking = null"
          >
            <span class="lucide-chevron-left size-4" aria-hidden="true" />
            {{ asking.label }}
          </button>
          <h3 id="outcome-ask" class="text-sm font-semibold text-ink-gray-7">
            {{
              asking.ask === 'reason'
                ? __('Why not?')
                : asking.key === 'answered'
                  ? __('When is the next follow-up?')
                  : __('When?')
            }}
          </h3>
          <div class="mt-2 grid grid-cols-2 gap-2">
            <button
              v-for="choice in choices"
              :key="choice.value"
              type="button"
              class="press min-h-12 rounded-7 border border-outline-gray-2 px-3 text-base text-ink-gray-9 hover:bg-surface-gray-1 disabled:opacity-60"
              :disabled="busy"
              :data-outcome-choice="choice.value"
              @click="send(asking, choice.value)"
            >
              {{ choice.label }}
            </button>
          </div>
        </section>
      </template>
    </div>
  </BottomSheet>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { call, toast } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { errorText } from '@/utils/errorText'
import { HOY_HOME } from '@/composables/useHoy'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** The Hoy / Pendientes row: a CRM Task on a prospect or a deal. */
  row: { type: Object, default: null },
  /** Where the record's page goes back to. */
  returnTo: { type: String, default: HOY_HOME },
  returnLabel: { type: String, default: 'Hoy' },
})
const emit = defineEmits(['close', 'done'])

const API = 'crm.api.follow_up_outcomes.'
const REACH =
  'press flex min-h-11 items-center gap-2 rounded-7 bg-surface-gray-2 px-3 text-base font-medium text-ink-gray-9 hover:bg-surface-gray-3'
// The server names the outcome; the icon is the page's (Tailwind only builds
// the icon classes it finds in these files).
const ICONS = {
  answered: 'lucide-phone',
  no_answer: 'lucide-phone-missed',
  won: 'lucide-party-popper',
  lost: 'lucide-circle-x',
  notified: 'lucide-check-check',
  coming: 'lucide-calendar-check',
}

const router = useRouter()
const state = ref(null)
const problem = ref('')
const busy = ref(false)
const asking = ref(null)

const whatsapp = computed(() => state.value?.reach?.whatsapp || null)
const subtitle = computed(() =>
  [state.value?.who, state.value?.detail].filter(Boolean).join(' · '),
)
const recordTo = computed(() => {
  const record = state.value?.record
  if (!record) return props.returnTo
  const path =
    record.doctype === 'CRM Deal'
      ? `/deals/${encodeURIComponent(record.name)}`
      : `/prospectos/${encodeURIComponent(record.name)}`
  return {
    path,
    query: { return_to: props.returnTo, return_label: props.returnLabel },
  }
})
const choices = computed(() => {
  if (!asking.value || !state.value) return []
  if (asking.value.ask === 'reason')
    return (state.value.reasons || []).map((row) => ({
      value: row.value,
      label: row.label,
    }))
  return (state.value.whens || []).map((row) => ({
    value: row.key,
    label: row.label,
  }))
})

function iconOf(action) {
  return ICONS[action.key] || 'lucide-circle-dot'
}
function toneOf(action) {
  if (action.tone === 'success') return 'text-ink-green-8'
  if (action.key === 'lost') return 'text-ink-red-7'
  return 'text-ink-gray-7'
}

async function read() {
  state.value = null
  problem.value = ''
  asking.value = null
  if (!props.row?.name) return
  try {
    state.value = await call(API + 'options', { task: String(props.row.name) })
  } catch (error) {
    problem.value = errorText(
      error,
      __('This follow-up could not open. Try again.'),
    )
  }
}
watch(
  () => [props.open, props.row?.name],
  ([open]) => open && read(),
  { immediate: true },
)

function choose(action) {
  if (action.ask) asking.value = action
  else send(action)
}

async function send(action, value) {
  if (busy.value || !state.value) return
  busy.value = true
  problem.value = ''
  try {
    const answer = await call(API + 'record', {
      task: state.value.task,
      action: action.key,
      modified: state.value.modified,
      when: action.ask === 'when' ? value : undefined,
      reason: action.ask === 'reason' ? value : undefined,
    })
    toast.success(answer?.message || __('Saved.'))
    emit('done', answer)
    emit('close')
  } catch (error) {
    problem.value = errorText(error, __('It was not saved. Try again.'))
  } finally {
    busy.value = false
  }
}

// Manual WhatsApp: the chat opens on this phone with the text written; the
// record says it was opened, never that it was sent.
function logOpen() {
  const record = state.value?.record
  if (!record) return
  call('crm.api.whatsapp_channel.log_manual_open', {
    reference_doctype: record.doctype,
    reference_name: record.name,
    text: state.value.reach?.message || '',
  }).catch(() => {})
}

// The shop's own account: the record's chat in the Bandeja, with the text
// copied for the composer (outside 24 h an approved template goes out there).
async function openThread() {
  const message = state.value?.reach?.message
  if (message && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(message)
      toast.success(__('Message copied: paste it in the chat.'))
    } catch {
      // A browser without clipboard access still opens the chat.
    }
  }
  const record = whatsapp.value
  emit('close')
  router.push({
    name: 'Inbox',
    query: {
      deal: record.name,
      doctype: record.doctype,
      return_to: props.returnTo,
      return_label: props.returnLabel,
    },
  })
}
</script>
