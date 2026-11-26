<template>
  <!-- A record's bar, WhatsApp-style: the ways to reach its person share one
       island (llamar, WhatsApp, correo), then the bolt with what to do next
       and «⋯» with every tool. On the phone correo waits in «⋯». -->
  <div class="flex flex-none items-center gap-1" data-record-island>
    <div
      v-if="callTo || whatsapp || showMail"
      class="flex items-center rounded-full bg-surface-gray-1 p-0.5"
      role="group"
      aria-label="Contactar"
    >
      <a
        v-if="callTo"
        :href="callTo"
        :class="ICON"
        :aria-label="`Llamar a ${who}`"
        :title="`Llamar · ${reach.phone}`"
        data-reach="call"
      >
        <span class="lucide-phone size-5" aria-hidden="true" />
      </a>
      <a
        v-if="whatsapp?.href"
        :href="whatsapp.href"
        target="_blank"
        rel="noopener"
        :class="ICON"
        :aria-label="`WhatsApp a ${who}`"
        :title="`WhatsApp · ${reach.phone}`"
        data-reach="whatsapp"
      >
        <WhatsAppIcon class="size-5" aria-hidden="true" />
      </a>
      <button
        v-else-if="whatsapp"
        type="button"
        :class="ICON"
        :aria-label="`WhatsApp a ${who}`"
        :title="`WhatsApp · ${reach.phone}`"
        data-reach="whatsapp"
        @click="emit('message')"
      >
        <WhatsAppIcon class="size-5" aria-hidden="true" />
      </button>
      <button
        v-if="showMail"
        type="button"
        :class="[ICON, mail.allowed ? '' : 'opacity-50']"
        :aria-label="mail.allowed ? `Correo a ${who}` : 'Correo'"
        :title="mail.allowed ? reach.email || 'Enviar por correo' : mail.reason"
        :aria-disabled="mail.allowed ? undefined : 'true'"
        data-reach="mail"
        @click="emit('mail')"
      >
        <span class="lucide-mail size-5" aria-hidden="true" />
      </button>
    </div>
    <AccionesMenu
      v-if="groups.length"
      ref="menu"
      :groups="groups"
      :phone="phone"
      :subtitle="subtitle"
      @pick="emit('pick', $event)"
    />
    <button
      type="button"
      class="press flex size-12 flex-none items-center justify-center rounded-full text-ink-gray-7 active:bg-surface-gray-2 [@media(hover:hover)]:hover:bg-surface-gray-2"
      aria-label="Herramientas"
      title="Herramientas"
      aria-keyshortcuts="."
      data-testid="documentos-tools-open"
      @click="emit('tools')"
    >
      <span class="lucide-ellipsis-vertical size-6" aria-hidden="true" />
    </button>
  </div>
</template>
<script setup>
import { computed, ref } from 'vue'
import WhatsAppIcon from '@/components/Icons/WhatsAppIcon.vue'
import { useRecordActions } from '@/composables/recordActions'
import { leaveTo } from '@/composables/leavePage'
import AccionesMenu from './AccionesMenu.vue'

const props = defineProps({
  // header.reach: { phone, email }
  reach: { type: Object, default: () => ({}) },
  // Whose they are, for the labels («Llamar a Ana López»).
  who: { type: String, default: '' },
  // record.actions.email ({ allowed, reason }), or null where mail does not apply
  mail: { type: Object, default: null },
  // true: WhatsApp opens the shop's composer (emits `message`); false: wa.me
  composer: { type: Boolean, default: false },
  // ⚡ groups (documentos/acciones.js recordActionsFor)
  groups: { type: Array, default: () => [] },
  phone: { type: Boolean, default: false },
  subtitle: { type: String, default: '' },
})
const emit = defineEmits(['message', 'mail', 'pick', 'tools'])

const ICON =
  'press flex size-10 flex-none items-center justify-center rounded-full text-ink-gray-7 active:bg-surface-gray-3 [@media(hover:hover)]:hover:bg-surface-gray-3'

const digits = computed(() =>
  String(props.reach?.phone || '').replace(/[^+\d]/g, ''),
)
const callTo = computed(() => (digits.value ? `tel:${digits.value}` : ''))
const whatsapp = computed(() => {
  if (!digits.value) return null
  if (props.composer) return { href: '' }
  return { href: `https://wa.me/${digits.value.replace(/^\+/, '')}` }
})
const showMail = computed(() => !!props.mail && !props.phone)

// From the keyboard: «a» opens the bolt, «.» opens «⋯», and Ctrl+K lists the
// bolt's steps and follow-ups first under «Acciones» (what the worker may do).
const menu = ref(null)
useRecordActions(() => [
  ...(props.groups.length
    ? [
        {
          id: 'acciones',
          title: 'Acciones',
          icon: 'lucide-zap',
          keys: ['a'],
          run: () => menu.value?.open(),
        },
      ]
    : []),
  ...props.groups
    .flatMap((group) => group.items || [])
    .filter((item) => item.allowed !== false && !item.to)
    .map((item) => ({
      id: `bolt.${item.key}`,
      title: item.label,
      icon: item.icon,
      keywords: item.hint || '',
      run: () => (item.href ? leaveTo(item.href) : emit('pick', item)),
    })),
  {
    id: 'herramientas',
    title: 'Herramientas',
    icon: 'lucide-ellipsis-vertical',
    keys: ['.'],
    run: () => emit('tools'),
  },
])
</script>
