<template>
  <section
    class="rounded border border-outline-gray-2 p-3 space-y-3"
    :aria-label="__('Customer link')"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h4 class="font-semibold">{{ __('Customer link') }}</h4>
      <span v-if="share.url" class="text-sm text-ink-gray-6" data-offer-views>
        {{
          share.view_count
            ? __('Opened {0} times · last {1}', [
                share.view_count,
                when(share.last_viewed_at),
              ])
            : __('Not opened yet')
        }}
      </span>
    </div>
    <p v-if="loading" role="status" class="text-sm">{{ __('Loading…') }}</p>
    <template v-else-if="!share.url">
      <p class="text-sm text-ink-gray-6">
        {{
          __(
            'Send the customer a private link to read this offer, accept or decline it, and write to you. Only people with the link can open it.',
          )
        }}
      </p>
      <button
        v-if="writable"
        class="offer-button"
        :disabled="busy"
        @click="run('share_link')"
      >
        {{ __('Create customer link') }}
      </button>
    </template>
    <template v-else>
      <div class="flex min-w-0 flex-wrap gap-2">
        <input
          class="offer-input min-w-0 flex-1"
          :value="share.url"
          readonly
          :aria-label="__('Customer link')"
          @focus="$event.target.select()"
        />
        <button class="offer-button" @click="copy">
          {{ copied ? __('Copied') : __('Copy link') }}
        </button>
        <a
          class="offer-button inline-flex items-center"
          :href="whatsappUrl"
          target="_blank"
          rel="noopener noreferrer"
          >{{ __('Send by WhatsApp') }}</a
        >
        <a class="offer-button inline-flex items-center" :href="mailUrl">{{
          __('Send by email')
        }}</a>
        <a
          class="offer-button inline-flex items-center"
          :href="share.url"
          target="_blank"
          rel="noopener noreferrer"
          >{{ __('Open customer view') }}</a
        >
        <button
          v-if="writable"
          class="offer-button"
          :disabled="busy"
          @click="revoke"
        >
          {{ __('Replace link') }}
        </button>
      </div>
    </template>
    <p
      v-if="share.online_decision"
      data-offer-online-decision
      class="text-sm break-words"
    >
      {{
        offer.status === 'Accepted'
          ? __('Accepted online, signed as «{0}».', [
              share.online_decision.name,
            ])
          : __('Declined online.')
      }}
      <span v-if="share.online_decision.note" class="block text-ink-gray-6">{{
        share.online_decision.note
      }}</span>
      <span
        v-if="offer.status === 'Accepted' && offer.capabilities?.can_erp"
        class="block text-ink-gray-6"
      >
        {{ __('Next: review and create the ERP quotation.') }}
      </span>
    </p>
    <div v-if="share.messages.length || share.url" class="space-y-2">
      <h5 class="text-sm font-semibold">
        {{ __('Messages with the customer') }}
      </h5>
      <p v-if="!share.messages.length" class="text-sm text-ink-gray-6">
        {{ __('No messages yet.') }}
      </p>
      <div
        v-for="(message, index) in share.messages"
        :key="index"
        class="rounded border border-outline-gray-2 p-2 text-sm break-words whitespace-pre-wrap"
        :class="message.from_customer ? '' : 'ml-6 bg-surface-gray-1'"
      >
        <span class="block text-xs text-ink-gray-6"
          >{{ message.from_customer ? __('Customer') : message.author }} ·
          {{ when(message.at) }}</span
        >{{ message.message }}
      </div>
      <form
        v-if="writable && share.url"
        class="space-y-2"
        @submit.prevent="reply"
      >
        <textarea
          v-model="draft"
          class="offer-input"
          rows="2"
          maxlength="2000"
          :placeholder="__('Reply to the customer on their offer page…')"
          :disabled="busy"
        />
        <button class="offer-button" :disabled="busy || !draft.trim()">
          {{ __('Send reply') }}
        </button>
      </form>
    </div>
    <p v-if="error" role="alert" class="text-sm">{{ error }}</p>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import { offerDecisionTime } from './offerPresentation'

const props = defineProps({
  offer: { type: Object, required: true },
  writable: { type: Boolean, default: false },
})
const empty = () => ({
  url: '',
  view_count: 0,
  last_viewed_at: '',
  online_decision: null,
  messages: [],
})
const share = reactive(empty())
const loading = ref(false)
const busy = ref(false)
const copied = ref(false)
const error = ref('')
const draft = ref('')

const shareText = computed(() =>
  __('Here is your offer «{0}»: {1}', [props.offer.title, share.url]),
)
const whatsappUrl = computed(
  () => `https://wa.me/?text=${encodeURIComponent(shareText.value)}`,
)
const mailUrl = computed(
  () =>
    `mailto:?subject=${encodeURIComponent(props.offer.title || '')}&body=${encodeURIComponent(shareText.value)}`,
)
const when = (value) => (value ? offerDecisionTime(value) : '')

function apply(result) {
  Object.assign(share, empty(), result)
}
async function run(method, args = {}) {
  busy.value = true
  error.value = ''
  try {
    apply(
      await call(`crm.api.offers.${method}`, {
        name: props.offer.name,
        ...args,
      }),
    )
    return true
  } catch (e) {
    error.value =
      e?.messages?.[0] ||
      e?.message ||
      __('Unable to update the customer link.')
    return false
  } finally {
    busy.value = false
  }
}
async function load() {
  loading.value = true
  error.value = ''
  try {
    apply(
      await call('crm.api.offers.get_share_state', { name: props.offer.name }),
    )
  } catch (e) {
    apply({})
    error.value = e?.messages?.[0] || e?.message || ''
  } finally {
    loading.value = false
  }
}
async function copy() {
  try {
    await navigator.clipboard.writeText(share.url)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    error.value = __('Copy the link from the box above.')
  }
}
function revoke() {
  if (
    window.confirm(
      __(
        'Replace the link? The link you already sent will stop working; send the customer the new one.',
      ),
    )
  )
    run('share_link', { rotate: 1 })
}
async function reply() {
  if (await run('reply_to_customer', { message: draft.value.trim() }))
    draft.value = ''
}

watch(
  () => [props.offer.name, props.offer.status, props.offer.modified],
  load,
  { immediate: true },
)
// Customer views and messages don't change the offer; pick them up when the seller returns.
function onFocus() {
  if (!busy.value && !loading.value) load()
}
window.addEventListener('focus', onFocus)
onBeforeUnmount(() => window.removeEventListener('focus', onFocus))
</script>
