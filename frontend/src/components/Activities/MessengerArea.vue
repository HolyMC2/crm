<!--
  Messenger conversation display (MA-23 / Phase D follow-on). Renders the PSID thread
  returned by doco_marketing.api.inbox.get_communications(channel='messenger'):
  in = left/grey, out = left-blue (#0084ff). Shows message_reactions as an emoji badge
  on the bubble + a CTWA/ad referral chip (which ad/link drove the DM). Attachments
  shown as a link. Mirrors the slot WhatsAppArea occupies.
  Each reply says who sent it (teammate · Bot · Desde Meta · Automático de Meta, see
  utils/messengerOrigin) with its ticks, and the last line says until when Meta lets us answer.
-->
<template>
  <div
    ref="scrollEl"
    class="flex max-h-full flex-col gap-2 overflow-y-auto px-3 py-3 sm:px-10"
  >
    <div
      v-if="!messages.length"
      class="py-10 text-center text-[13px] text-ink-gray-4"
    >
      {{ __('Sin mensajes todavía.') }}
    </div>
    <div
      v-for="m in messages"
      :key="m.id"
      class="flex flex-col"
      :class="[
        m.direction === 'out' ? 'items-end' : 'items-start',
        m.reaction ? 'pb-2' : '',
      ]"
    >
      <!-- attribution: the ad / m.me link / CTWA that drove this conversation -->
      <div
        v-if="m.referral_ref || m.referral_source"
        class="mb-0.5 inline-flex items-center gap-1 rounded-full bg-surface-blue-1 px-2 py-0.5 text-[10px] font-semibold text-ink-blue-9"
        :title="__('Origen del mensaje (anuncio / enlace)')"
      >
        📣 {{ __('vino de') }}: {{ m.referral_ref || m.referral_source }}
        <span v-if="m.referral_source && m.referral_ref" class="opacity-70"
          >· {{ m.referral_source }}</span
        >
      </div>
      <div
        class="relative max-w-[78%] rounded-8 px-3 py-2 text-[13px] leading-snug"
        :class="[
          m.direction !== 'out'
            ? 'bg-surface-gray-2 text-ink-gray-8 dark:bg-surface-gray-3'
            : solidOut(m)
              ? 'bg-[#0084ff] text-white'
              : 'border border-dashed border-[#0084ff] bg-[#0084ff]/10 text-ink-gray-8',
          m._optimistic ? 'opacity-60' : '',
        ]"
      >
        <!-- image attachment inline; other types as a typed link -->
        <a
          v-if="m.attach && m.content_type === 'image'"
          :href="m.attach"
          target="_blank"
          rel="noopener"
          class="block"
        >
          <img
            :src="m.attach"
            class="mb-1 max-h-60 rounded-6"
            :alt="__('imagen')"
          />
        </a>
        <a
          v-else-if="m.attach"
          :href="m.attach"
          target="_blank"
          rel="noopener"
          class="block break-all underline"
          :class="solidOut(m) ? 'text-white' : 'text-ink-blue-9'"
        >
          {{ attachLabel(m.content_type) }}
        </a>
        <!-- Archivos: only offered when this is a true WhatsApp Message (its
             `id` resolves there); Webchat/Messenger/Instagram rows are a
             different doctype the save endpoint does not accept (see
             conversation_threads._message/_scope, crm/api). -->
        <div
          v-if="
            archivosEnabled &&
            m.attach &&
            isWhatsappInboxMessage(m, conversation)
          "
        >
          <a
            v-if="saved[m.attach]"
            :href="archivosHref({ document: saved[m.attach] })"
            class="mt-1 inline-flex items-center gap-1 rounded-4 bg-surface-green-1 px-1.5 py-0.5 text-2xs font-medium text-ink-green-9 hover:underline"
          >
            {{ __('In Files') }}
          </a>
          <Dropdown v-else :options="attachmentOptions(m)">
            <button
              type="button"
              class="mt-1 inline-flex items-center gap-1 rounded-4 px-1.5 py-0.5 text-2xs underline opacity-80 hover:opacity-100 disabled:opacity-60"
              :disabled="isBusy(m.attach)"
            >
              {{ isBusy(m.attach) ? __('Saving…') : __('Files…') }}
            </button>
          </Dropdown>
        </div>
        <div
          v-if="m.content"
          class="whitespace-pre-wrap [overflow-wrap:anywhere]"
        >
          {{ m.content }}
        </div>
        <div
          class="mt-0.5 flex items-center justify-end gap-1 text-[10px] opacity-70"
        >
          <span
            v-if="originOf(m)"
            class="font-semibold"
            :title="originOf(m).title"
            data-testid="messenger-origin"
            >{{ originOf(m).text }} ·</span
          >
          <span>{{ fmtTime(m.timestamp) }}</span>
          <span
            v-if="statusTick(m)"
            :title="statusTick(m).title"
            :class="tickClass(m)"
            data-testid="messenger-tick"
            >{{ statusTick(m).text }}</span
          >
        </div>
        <!-- message_reaction: the emoji the customer tapped on this message -->
        <span
          v-if="m.reaction"
          class="absolute -bottom-2.5 rounded-full border border-white bg-surface-base px-1 text-[11px] leading-tight shadow-sm dark:border-surface-gray-4 dark:bg-surface-gray-3"
          :class="m.direction === 'out' ? 'left-1.5' : 'right-1.5'"
        >
          {{ m.reaction }}
        </span>
      </div>
    </div>
    <!-- Meta's reply window: free replies 24 h after the customer's last message,
         then only with the «Agente humano» tag up to 7 days. -->
    <div
      v-if="notice"
      class="mx-auto mt-1 max-w-[92%] rounded-6 px-2.5 py-1 text-center text-[11px] leading-snug"
      :class="ORIGIN_CHIP_CLASS[notice.tone]"
      data-testid="messenger-window"
    >
      {{ notice.text }}
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, computed, onBeforeUnmount } from 'vue'
import { Dropdown, call } from 'frappe-ui'
import {
  ORIGIN_CHIP_CLASS,
  originLabel,
  replyWindow,
  statusTick,
  windowNotice,
} from '@/utils/messengerOrigin'
import { archivosHref } from '@/composables/useArchivos'
import { shellBoot } from '@/composables/muelleShell'
import { moduleEnabled } from '@/vendor/muelle-shell/contracts'
import {
  useConversationArchivos,
  whatsappSaveArgs,
  isWhatsappInboxMessage,
  collectFileUrls,
} from '@/composables/useConversationArchivos'

const props = defineProps({
  messages: { type: Array, default: () => [] },
  // The conversation this history belongs to ({ provider, ... } from
  // crm.api.conversation_threads). Optional: without it the Files actions
  // stay hidden, since only a WhatsApp conversation's message id is a
  // WhatsApp Message name the save endpoint accepts. ConversationWorkspace.vue
  // passes it as `:conversation="state.conversation"`.
  conversation: { type: Object, default: null },
  // The «until when can we answer» line. Off where the composer already says it
  // (MessengerBox in the deal view).
  window: { type: Boolean, default: true },
})

const scrollEl = ref(null)

// Only Meta chats get labels and the window line: Conversaciones also renders
// WhatsApp and Webchat histories here.
const isMetaChat = computed(() =>
  props.conversation
    ? ['Messenger', 'Instagram'].includes(props.conversation.provider)
    : props.messages.every((m) => !m.channel || m.channel === 'messenger'),
)

// Conversaciones' history (crm) carries no sender: ask doco_marketing for the
// outgoing rows on screen. Labels are a nicety, so a failed call leaves them off.
const origins = ref({})
watch(
  () => [props.messages, props.conversation?.provider],
  async () => {
    if (!props.conversation || !isMetaChat.value) return
    const names = props.messages
      .filter(
        (m) =>
          m.direction === 'out' &&
          m.id &&
          m.sent_via === undefined &&
          !(m.id in origins.value),
      )
      .map((m) => m.id)
    if (!names.length) return
    try {
      const found = await call(
        'doco_marketing.api.inbox.get_messenger_origins',
        {
          names,
        },
      )
      origins.value = { ...origins.value, ...(found || {}) }
    } catch {
      // the bubbles still render, just without who sent them
    }
  },
  { immediate: true },
)

function originOf(m) {
  if (!isMetaChat.value) return null
  return originLabel(
    m.sent_via === undefined ? { ...m, ...origins.value[m.id] } : m,
  )
}

// Meta's automatic replies are drawn outlined, not as our solid blue bubble.
function solidOut(m) {
  return m.direction === 'out' && !originOf(m)?.auto
}

function tickClass(m) {
  if (!statusTick(m)?.read) return ''
  return solidOut(m) ? 'font-bold text-[#bae6fd]' : 'font-bold text-[#0084ff]'
}

const now = ref(Date.now())
const ticker = setInterval(() => (now.value = Date.now()), 60 * 1000)
onBeforeUnmount(() => clearInterval(ticker))
const notice = computed(() =>
  props.window && isMetaChat.value
    ? windowNotice(replyWindow(props.messages, now.value), now.value)
    : null,
)

// «Guardar en Archivos» / «Vincular a…» (ARC-S2.3), gated the same way the
// rest of the shell reads the Archivos module flag.
const archivosEnabled = computed(() =>
  moduleEnabled(shellBoot.value, 'archivos'),
)
const { saved, isBusy, refreshSaved, save, linkTo } = useConversationArchivos()
watch(
  () => [props.messages, props.conversation],
  () => {
    if (archivosEnabled.value)
      refreshSaved(() => ({
        fileUrls: collectFileUrls(props.messages, (m) =>
          isWhatsappInboxMessage(m, props.conversation),
        ),
      }))
  },
  { immediate: true },
)
function attachmentOptions(m) {
  return [
    {
      label: __('Save to Files'),
      onClick: () =>
        save(m.attach, whatsappSaveArgs({ name: m.id, attach: m.attach })),
    },
    {
      label: __('Link to…'),
      onClick: () =>
        linkTo(m.attach, whatsappSaveArgs({ name: m.id, attach: m.attach }), {
          target:
            props.conversation?.reference_doctype &&
            props.conversation?.reference_name
              ? {
                  doctype: props.conversation.reference_doctype,
                  name: props.conversation.reference_name,
                }
              : null,
          returnLabel: __('Conversation'),
        }),
    },
  ]
}

function attachLabel(ct) {
  return ct === 'video'
    ? '📹 ' + __('Ver video')
    : ct === 'audio'
      ? '🎵 ' + __('Escuchar audio')
      : '📎 ' + __('Ver adjunto')
}

function fmtTime(ts) {
  if (!ts) return ''
  try {
    return new Date(String(ts).replace(' ', 'T')).toLocaleString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: 'short',
    })
  } catch {
    return String(ts).slice(0, 16)
  }
}

// Stick to the newest message ONLY when the user is already near the bottom (#21).
// Measured BEFORE the DOM updates (watch flushes pre-render), so an incoming message
// while you've scrolled up to read history no longer yanks you down. Your own send
// happens at the bottom → still auto-scrolls.
watch(
  () => props.messages.length,
  () => {
    const el = scrollEl.value
    const near = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120
    // Our own just-sent (optimistic) bubble always scrolls into view, even if the user
    // had scrolled up — you should see the message you just sent.
    const last = props.messages[props.messages.length - 1]
    const ownSend = !!last?._optimistic
    nextTick(() => {
      if ((near || ownSend) && scrollEl.value)
        scrollEl.value.scrollTop = scrollEl.value.scrollHeight
    })
  },
  { immediate: true },
)
</script>
