<!--
  Messenger conversation display (MA-23 / Phase D follow-on). Renders the PSID thread
  returned by doco_marketing.api.inbox.get_communications(channel='messenger'):
  in = left/grey, out = left-blue (#0084ff). Shows message_reactions as an emoji badge
  on the bubble + a CTWA/ad referral chip (which ad/link drove the DM). Attachments
  shown as a link. Mirrors the slot WhatsAppArea occupies.
-->
<template>
  <div
    ref="scrollEl"
    class="flex max-h-full flex-col gap-2 overflow-y-auto px-3 py-3 sm:px-10"
  >
    <div
      v-if="!messages.length"
      class="py-10 text-center text-[13px] text-ink-gray-4 dark:text-ink-gray-5"
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
        class="relative max-w-[78%] rounded-2xl px-3 py-2 text-[13px] leading-snug"
        :class="[
          m.direction === 'out'
            ? 'bg-[#0084ff] text-white'
            : 'bg-surface-gray-2 text-ink-gray-8 dark:bg-surface-gray-3 dark:text-ink-gray-8',
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
            class="mb-1 max-h-60 rounded-lg"
            :alt="__('imagen')"
          />
        </a>
        <a
          v-else-if="m.attach"
          :href="m.attach"
          target="_blank"
          rel="noopener"
          class="block break-all underline"
          :class="m.direction === 'out' ? 'text-white' : 'text-ink-blue-9'"
        >
          {{ attachLabel(m.content_type) }}
        </a>
        <!-- Archivos: only offered when this is a true WhatsApp Message (its
             `id` resolves there); Webchat/Messenger/Instagram rows are a
             different doctype the save endpoint does not accept (see
             conversation_threads._message/_scope, crm/api). -->
        <div
          v-if="archivosEnabled && m.attach && isWhatsappInboxMessage(m, conversation)"
        >
          <a
            v-if="saved[m.attach]"
            :href="archivosHref({ document: saved[m.attach] })"
            class="mt-1 inline-flex items-center gap-1 rounded bg-surface-green-1 px-1.5 py-0.5 text-2xs font-medium text-ink-green-9 hover:underline"
          >
            {{ __('In Files') }}
          </a>
          <Dropdown v-else :options="attachmentOptions(m)">
            <button
              type="button"
              class="mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs underline opacity-80 hover:opacity-100 disabled:opacity-60"
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
        <div class="mt-0.5 text-right text-[10px] opacity-60">
          {{ fmtTime(m.timestamp) }}
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
  </div>
</template>

<script setup>
import { ref, watch, nextTick, computed } from 'vue'
import { Dropdown } from 'frappe-ui'
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
})

const scrollEl = ref(null)

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
      onClick: () => save(m.attach, whatsappSaveArgs({ name: m.id, attach: m.attach })),
    },
    {
      label: __('Link to…'),
      onClick: () =>
        linkTo(
          m.attach,
          whatsappSaveArgs({ name: m.id, attach: m.attach }),
          {
            target:
              props.conversation?.reference_doctype &&
              props.conversation?.reference_name
                ? {
                    doctype: props.conversation.reference_doctype,
                    name: props.conversation.reference_name,
                  }
                : null,
            returnLabel: __('Conversation'),
          },
        ),
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
