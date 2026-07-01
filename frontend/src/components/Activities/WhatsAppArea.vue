<!-- eslint-disable vue/no-v-html -->
<template>
  <div>
    <!-- Header + pinned notes float together at the top: one sticky block with
         an opaque bg so the message thread scrolls underneath them. -->
    <div
      v-if="contact?.phone || contact?.name || pinnedNotes.length"
      class="sticky top-0 z-20 bg-surface-white pt-2 dark:bg-surface-gray-1"
    >
    <!-- WhatsApp-style conversation header: avatar + name + phone -->
    <div
      v-if="contact?.phone || contact?.name"
      class="wa-contact-header mx-3 mb-3 flex items-center gap-3 rounded-md border bg-surface-white px-3 py-2 shadow-sm dark:bg-surface-gray-2 sm:mx-10"
    >
      <div
        class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-gray-3 text-sm font-semibold text-ink-gray-7"
      >
        <img
          v-if="contact?.image"
          :src="contact.image"
          :alt="contact?.name || contact?.phone"
          class="h-full w-full object-cover"
        />
        <span v-else>{{ headerInitials }}</span>
      </div>
      <div class="flex min-w-0 flex-1 flex-col leading-tight">
        <div class="truncate text-sm font-semibold text-ink-gray-9">
          {{ contact?.name || contact?.phone || __('Conversation') }}
        </div>
        <div v-if="contact?.phone" class="font-mono text-xs text-ink-gray-5">
          {{ formattedPhone }}
        </div>
      </div>
    </div>

    <!-- pinned notes, kept on top of the conversation -->
    <div
      v-if="pinnedNotes.length"
      class="mx-3 mb-3 flex flex-col gap-2 sm:mx-10"
    >
      <div
        v-for="note in pinnedNotes"
        :key="note.name"
        class="flex items-start gap-2 rounded-md border border-amber-200 bg-surface-amber-1 px-3 py-2 dark:border-amber-900/40"
      >
        <FeatherIcon
          name="bookmark"
          class="mt-0.5 size-4 shrink-0 text-ink-amber-3"
        />
        <div
          class="min-w-0 flex-1 cursor-pointer"
          @click="emit('openNote', note)"
        >
          <div class="truncate text-sm font-semibold text-ink-gray-8">
            {{ note.title }}
          </div>
          <div
            v-if="note.content"
            class="prose-f line-clamp-2 text-xs text-ink-gray-6"
            v-html="sanitizeHTML(note.content)"
          />
          <div
            v-if="note.modified || note.creation"
            class="mt-0.5 text-2xs text-ink-gray-5"
            :title="formatTimestampFull(note.modified || note.creation)"
          >
            {{ formatDateTime(note.modified || note.creation) }}
          </div>
        </div>
        <button
          type="button"
          class="shrink-0 text-ink-gray-4 hover:text-ink-gray-7"
          :title="__('Unpin')"
          @click.stop="emit('unpinNote', note)"
        >
          <FeatherIcon name="x" class="size-4" />
        </button>
      </div>
      <button
        v-if="moreNotes > 0"
        type="button"
        class="self-start text-xs font-medium text-ink-blue-link hover:underline"
        @click="emit('openNotes')"
      >
        + {{ moreNotes }} {{ __('more notes') }}
      </button>
    </div>
    </div>

    <template v-for="whatsapp in messages" :key="whatsapp.name">
      <!-- internal comment, inline in the thread -->
      <div
        v-if="whatsapp._kind === 'comment'"
        class="my-3 flex justify-center px-3 sm:px-10"
      >
        <div
          class="max-w-[88%] rounded-lg border border-blue-200 bg-surface-blue-1 px-3 py-2 dark:border-blue-900/40"
        >
          <div class="mb-1 flex flex-wrap items-center gap-2">
            <span
              class="rounded bg-surface-blue-2 px-1.5 py-0.5 text-2xs font-semibold uppercase text-ink-blue-3"
            >
              {{ __('Internal') }}
            </span>
            <span class="text-sm font-medium text-ink-gray-8">
              {{ whatsapp.owner_name || whatsapp.owner }}
            </span>
            <Tooltip :text="formatTimestampFull(whatsapp.creation)">
              <span class="text-2xs text-ink-gray-4">
                {{ formatDateTime(whatsapp.creation) }}
              </span>
            </Tooltip>
          </div>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div
            class="prose-f text-sm text-ink-gray-7"
            v-html="sanitizeHTML(whatsapp.content)"
          />
        </div>
      </div>

      <!-- whatsapp message bubble -->
      <div
        v-else
        class="activity group flex gap-2"
        :class="[
          whatsapp.type == 'Outgoing' ? 'flex-row-reverse' : '',
          whatsapp.reaction ? 'mb-7' : 'mb-3',
        ]"
      >
      <div
        :id="whatsapp.name"
        class="group/message relative max-w-[85%] min-w-0 sm:max-w-[34rem] [overflow-wrap:anywhere] [&_a]:[overflow-wrap:anywhere] rounded-md bg-surface-gray-1 text-ink-gray-9 p-1.5 pl-2 text-base shadow-sm"
        :class="{ 'opacity-60': whatsapp._optimistic }"
      >
        <Badge
          v-if="whatsapp.status == 'failed'"
          theme="red"
          :label="whatsapp.status"
          class="absolute -top-2 right-0"
        />
        <!-- unified-thread: which other deal/RO this bubble belongs to -->
        <div
          v-if="whatsapp._ref_label && !whatsapp._is_active_ref"
          class="mb-1 inline-flex items-center gap-1 rounded bg-surface-gray-3 px-1.5 py-px text-[9.5px] font-semibold text-ink-gray-6"
          :title="__('De otro trato del mismo cliente')"
        >
          🔗 {{ whatsapp._ref_label }}
        </div>
        <div
          v-if="whatsapp.is_reply"
          class="mb-1 cursor-pointer rounded border-0 border-l-4 bg-surface-gray-3 p-2 text-ink-gray-5"
          :class="
            whatsapp.reply_to_type == 'Incoming'
              ? 'border-green-500'
              : 'border-blue-400'
          "
          @click="() => scrollToMessage(whatsapp.reply_to)"
        >
          <div
            class="mb-1 text-sm font-bold"
            :class="
              whatsapp.reply_to_type == 'Incoming'
                ? 'text-ink-green-2'
                : 'text-ink-blue-link'
            "
          >
            {{ whatsapp.reply_to_from || __('You') }}
          </div>
          <div class="flex flex-col gap-2 max-h-12 overflow-hidden">
            <div v-if="whatsapp.header" class="text-base font-semibold">
              {{ whatsapp.header }}
            </div>
            <div v-html="formatWhatsAppMessage(whatsapp.reply_message)" />
            <div v-if="whatsapp.footer" class="text-xs text-ink-gray-5">
              {{ whatsapp.footer }}
            </div>
          </div>
        </div>
        <div class="flex gap-2 justify-between [&>div]:min-w-0">
          <div
            v-if="whatsapp.status != 'failed'"
            class="absolute -right-0.5 -top-0.5 flex cursor-pointer gap-1 rounded-full bg-surface-white pb-2 pl-2 pr-1.5 pt-1.5 opacity-0 group-hover/message:opacity-100"
            :style="{
              background:
                'radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 1) 35%, rgba(238, 130, 238, 0) 100%)',
            }"
          >
            <Dropdown :options="messageOptions(whatsapp)">
              <FeatherIcon name="chevron-down" class="size-4 text-ink-gray-5" />
            </Dropdown>
          </div>
          <div
            v-if="whatsapp.reaction"
            class="absolute -bottom-5 flex gap-1 rounded-full border bg-surface-white p-1 pb-[3px] shadow-sm"
          >
            <div class="flex size-4 items-center justify-center">
              {{ whatsapp.reaction }}
            </div>
          </div>
          <div
            v-if="whatsapp.message_type == 'Template'"
            class="flex flex-col gap-2"
          >
            <div v-if="whatsapp.header" class="text-base font-semibold">
              {{ whatsapp.header }}
            </div>
            <div v-html="formatWhatsAppMessage(whatsapp.template)" />
            <div v-if="whatsapp.footer" class="text-xs text-ink-gray-5">
              {{ whatsapp.footer }}
            </div>
          </div>
          <div
            v-else-if="whatsapp.content_type == 'text'"
            v-html="formatWhatsAppMessage(whatsapp.message)"
          />
          <div
            v-else-if="whatsapp.content_type == 'button'"
            v-html="formatWhatsAppMessage(whatsapp.message)"
          />
          <div v-else-if="whatsapp.content_type == 'image'">
            <!-- concrete width (w-60) so the bubble — a shrink-to-fit max-w box —
                 sizes to the image; max-w-[68vw] keeps it inside narrow phones
                 (never tied to the collapsing flex item). NO flex-1: flex-basis:0%
                 inside a shrink-to-fit parent collapses the whole bubble. -->
            <img
              :src="whatsapp.attach"
              class="h-auto w-60 max-w-[68vw] cursor-pointer rounded-md sm:max-w-[15rem]"
              @click="() => openFileInAnotherTab(whatsapp.attach)"
            />
            <!-- message is null on media-only rows; guard before .startsWith or
              the throw blanks the whole thread (Vue aborts the v-for subtree). -->
            <div
              v-if="whatsapp.message && !whatsapp.message.startsWith('/files/')"
              class="mt-1.5"
              v-html="formatWhatsAppMessage(whatsapp.message)"
            />
          </div>
          <div
            v-else-if="whatsapp.content_type == 'document'"
            class="flex items-center gap-2"
          >
            <DocumentIcon
              class="size-10 cursor-pointer rounded-md text-ink-gray-4"
              @click="() => openFileInAnotherTab(whatsapp.attach)"
            />
            <div class="text-ink-gray-5">Document</div>
          </div>
          <div
            v-else-if="whatsapp.content_type == 'audio'"
            class="flex items-center gap-2"
          >
            <audio :src="whatsapp.attach" controls class="cursor-pointer" />
          </div>
          <div
            v-else-if="whatsapp.content_type == 'video'"
            class="flex-col items-center gap-2"
          >
            <video
              :src="whatsapp.attach"
              controls
              class="h-auto w-60 max-w-[68vw] cursor-pointer rounded-md sm:max-w-[15rem]"
            />
            <!-- same null guard as the image branch -->
            <div
              v-if="whatsapp.message && !whatsapp.message.startsWith('/files/')"
              class="mt-1.5"
              v-html="formatWhatsAppMessage(whatsapp.message)"
            />
          </div>
          <div class="-mb-1 flex shrink-0 items-end gap-1 text-ink-gray-5">
            <Tooltip :text="formatTimestampFull(whatsapp.creation)">
              <div class="text-2xs">
                {{ formatDateTime(whatsapp.creation) }}
              </div>
            </Tooltip>
            <Tooltip v-if="provenanceBadge(whatsapp)" :text="provenanceBadge(whatsapp).tip">
              <span class="rounded bg-surface-gray-3 px-1 text-2xs text-ink-gray-6">
                {{ provenanceBadge(whatsapp).icon }} {{ provenanceBadge(whatsapp).label }}
              </span>
            </Tooltip>
            <!-- WhatsApp-style receipts: ✓ enviado · ✓✓ entregado · ✓✓ azul leído ·
                 🕓 enviando. Tooltip names each so it's self-explanatory. -->
            <div v-if="whatsapp.type == 'Outgoing'" class="flex items-end">
              <Tooltip :text="waStatusLabel(whatsapp.status)">
                <span class="inline-flex">
                  <DoubleCheckIcon
                    v-if="whatsapp.status == 'read'"
                    class="size-4 text-ink-blue-2"
                  />
                  <DoubleCheckIcon
                    v-else-if="whatsapp.status == 'delivered'"
                    class="size-4"
                  />
                  <CheckIcon
                    v-else-if="['sent', 'Success'].includes(whatsapp.status)"
                    class="size-4"
                  />
                  <FeatherIcon
                    v-else-if="whatsapp.status != 'failed'"
                    name="clock"
                    class="size-3 text-ink-gray-4"
                  />
                </span>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
      <div
        v-if="whatsapp.status != 'failed'"
        class="flex items-center justify-center opacity-0 transition-all ease-in group-hover:opacity-100"
      >
        <IconPicker
          v-slot="{ togglePopover }"
          v-model="emoji"
          v-model:reaction="reaction"
          @update:modelValue="() => reactOnMessage(whatsapp.name, emoji)"
        >
          <Button
            class="rounded-full !size-6 mt-0.5"
            @click="() => (reaction = true) && togglePopover()"
          >
            <template #icon>
              <ReactIcon class="text-ink-gray-3" />
            </template>
          </Button>
        </IconPicker>
      </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import IconPicker from '@/components/IconPicker.vue'
import CheckIcon from '@/components/Icons/CheckIcon.vue'
import DoubleCheckIcon from '@/components/Icons/DoubleCheckIcon.vue'
import DocumentIcon from '@/components/Icons/DocumentIcon.vue'
import ReactIcon from '@/components/Icons/ReactIcon.vue'
import { formatDate, formatDateTime, formatTimestampFull, sanitizeHTML } from '@/utils'
import { useTelemetry } from 'frappe-ui/frappe'
import { Tooltip, Dropdown, createResource, toast } from 'frappe-ui'
import { ref, computed } from 'vue'
import { usersStore } from '@/stores/users'

const { getUser } = usersStore()

// Phase-1 message provenance badge: who/how an outgoing message was sent.
// Automation (which rule) · Bot (which flow) · Human (which teammate typed it).
function provenanceBadge(wa) {
  const t = wa.doco_sent_by_type
  if (t === 'Automation')
    return { icon: '⚙', label: __('Auto'), tip: wa.doco_automation_source || __('Automatic message') }
  if (t === 'Bot')
    return { icon: '🤖', label: wa.doco_bot || __('Bot'), tip: wa.doco_bot || __('Bot') }
  if (wa.type === 'Outgoing' && wa.doco_actor_user) {
    const name = getUser(wa.doco_actor_user)?.full_name || wa.doco_actor_user
    return { icon: '', label: name, tip: __('Sent by') + ' ' + name }
  }
  return null
}

const props = defineProps({
  messages: { type: Array, default: () => [] },
  contact: {
    type: Object,
    default: () => ({}),
  },
  pinnedNotes: { type: Array, default: () => [] },
  moreNotes: { type: Number, default: 0 },
})

const emit = defineEmits(['openNote', 'unpinNote', 'openNotes'])

const list = defineModel({ type: Object })

const headerInitials = computed(() => {
  const n = (props.contact?.name || props.contact?.phone || '?').trim()
  const parts = n.split(/\s+/).filter(Boolean).slice(0, 2)
  return parts.map((p) => p[0]).join('').toUpperCase() || '?'
})

const formattedPhone = computed(() => {
  const p = props.contact?.phone
  if (!p) return ''
  const d = String(p).replace(/\D/g, '')
  // MX +52 + 10 digits → "+52 669 259 0270"
  if (d.length === 12 && d.startsWith('52')) {
    return `+52 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`
  }
  return p.startsWith('+') ? p : `+${d}`
})

const { capture } = useTelemetry()

function openFileInAnotherTab(url) {
  window.open(url, '_blank')
}

// WhatsApp delivery-receipt label for the per-message tooltip. 'Success' is the
// local post-send state before Meta's first 'sent' callback; both read as Enviado.
function waStatusLabel(status) {
  return (
    {
      read: __('Leído'),
      delivered: __('Entregado'),
      sent: __('Enviado'),
      Success: __('Enviado'),
      failed: __('No entregado'),
    }[status] || __('Enviando…')
  )
}

function formatWhatsAppMessage(message) {
  // Guard null/undefined. A single message with no text body (a media-only row,
  // a template row whose `message` is empty, etc.) would otherwise throw on
  // .replace() — and because this runs inside the thread's v-for, ONE such
  // message makes Vue abort the whole subtree and render an EMPTY conversation
  // while the header/composer (sibling components) stay. That is the
  // "thread shows empty but the preview has messages" bug.
  if (message == null) return ''
  message = String(message)
  // if message contains _text_, make it italic
  message = message.replace(/_(.*?)_/g, '<i>$1</i>')
  // if message contains *text*, make it bold
  message = message.replace(/\*(.*?)\*/g, '<b>$1</b>')
  // if message contains ~text~, make it strikethrough
  message = message.replace(/~(.*?)~/g, '<s>$1</s>')
  // if message contains ```text```, make it monospace
  message = message.replace(/```(.*?)```/g, '<code>$1</code>')
  // if message contains `text`, make it inline code
  message = message.replace(/`(.*?)`/g, '<code>$1</code>')
  // if message contains > text, make it a blockquote
  message = message.replace(/^> (.*)$/gm, '<blockquote>$1</blockquote>')
  // if contain /n, make it a new line
  message = message.replace(/\n/g, '<br>')
  // if contains *<space>text, make it a bullet point
  message = message.replace(/\* (.*?)(?=\s*\*|$)/g, '<li>$1</li>')
  message = message.replace(/- (.*?)(?=\s*-|$)/g, '<li>$1</li>')
  message = message.replace(/(\d+)\. (.*?)(?=\s*(\d+)\.|$)/g, '<li>$2</li>')

  return sanitizeHTML(message)
}

const emoji = ref('')
const reaction = ref(true)

function reactOnMessage(name, emoji) {
  createResource({
    url: 'crm.api.whatsapp.react_on_whatsapp_message',
    params: {
      emoji,
      reply_to_name: name,
    },
    auto: true,
    onSuccess() {
      capture('whatsapp_react_on_message')
      list.value.reload()
    },
    onError(error) {
      toast.error(
        error.messages?.[0] || __('Failed to add reaction to the message'),
      )
    },
  })
}

const reply = defineModel('reply', { type: Object, default: () => ({}) })
const replyMode = ref(false)

function messageOptions(message) {
  return [
    {
      label: 'Reply',
      onClick: () => {
        replyMode.value = true
        reply.value = {
          ...message,
          message: formatWhatsAppMessage(message.message),
        }
      },
    },
    // {
    //   label: 'Forward',
    //   onClick: () => console.log('Forward'),
    // },
    // {
    //   label: 'Delete',
    //   onClick: () => console.log('Delete'),
    // },
  ]
}

function scrollToMessage(name) {
  const element = document.getElementById(name)
  element.scrollIntoView({ behavior: 'smooth' })

  // Highlight the message
  element.classList.add('bg-yellow-100')
  setTimeout(() => {
    element.classList.remove('bg-yellow-100')
  }, 1000)
}
</script>
