<!--
  "Sin asignar" workspace — shown in the inbox center pane when an orphan
  (unknown-number) WhatsApp conversation is selected. Read-only thread + the two
  triage actions. Converting re-points the messages server-side (assignUnassigned);
  a Deal then opens in the normal DealWorkspace, a Lead drops to the Leads view.
-->
<template>
  <div class="flex min-w-0 flex-1 flex-col">
    <!-- header -->
    <div class="flex h-[60px] flex-none items-center justify-between border-b border-outline-gray-1 px-4">
      <div class="flex items-center gap-2.5">
        <span class="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <LucideMessageCircleQuestion class="h-5 w-5" />
        </span>
        <div>
          <div class="text-[15px] font-semibold text-ink-gray-9">{{ formatPhone(activeUnassigned) }}</div>
          <div class="text-[11px] font-medium text-amber-700">
            {{ __('Sin asignar — número sin Lead ni Trato') }}
          </div>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2 disabled:opacity-50"
          :disabled="busy"
          @click="convert('CRM Lead')"
        >
          + {{ __('Crear Lead') }}
        </button>
        <button
          class="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
          style="background: #16a34a"
          :disabled="busy"
          @click="convert('CRM Deal')"
        >
          + {{ __('Crear Trato') }}
        </button>
      </div>
    </div>

    <!-- thread -->
    <div class="scb flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-4">
      <div v-if="unassignedThread.loading && !messages.length" class="py-8 text-center text-xs text-ink-gray-4">
        {{ __('Cargando…') }}
      </div>
      <div v-else-if="!messages.length" class="py-8 text-center text-xs text-ink-gray-4">
        {{ __('Sin mensajes') }}
      </div>
      <div
        v-for="m in messages"
        :key="m.id"
        class="flex"
        :class="m.direction === 'out' ? 'justify-end' : 'justify-start'"
      >
        <div
          class="max-w-[78%] rounded-lg px-3 py-1.5 text-sm shadow-sm"
          :class="m.direction === 'out' ? 'bg-surface-green-2 text-ink-gray-9' : 'bg-surface-gray-2 text-ink-gray-9'"
        >
          <img
            v-if="m.content_type === 'image' && m.attach"
            :src="m.attach"
            class="mb-1 max-h-48 rounded-md"
          />
          <div v-if="m.content" class="whitespace-pre-wrap break-words">{{ m.content }}</div>
          <div class="mt-0.5 text-right text-[10px] text-ink-gray-4">{{ hhmm(m.timestamp) }}</div>
        </div>
      </div>
    </div>

    <div class="flex-none border-t border-outline-gray-1 px-4 py-2.5 text-center text-[11px] text-ink-gray-5">
      {{ __('Convierte a Lead o Trato para responder y dar seguimiento.') }}
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { toast } from 'frappe-ui'
import LucideMessageCircleQuestion from '~icons/lucide/message-circle-question'
import { activeUnassigned, unassignedThread, assignUnassigned, hhmm } from '@/composables/inbox'

const busy = ref(false)
const messages = computed(() => unassignedThread.data?.messages || [])

// duplicated from ConversationQueue (frontend dup is fine; provenance noted) —
// pretty MX number from a raw WhatsApp id.
function formatPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '')
  let n = d
  if (n.startsWith('521')) n = n.slice(3)
  else if (n.startsWith('52')) n = n.slice(2)
  if (n.length === 10) return `+52 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`
  return raw ? `+${d}` : '—'
}

async function convert(target) {
  if (busy.value) return
  busy.value = true
  try {
    const res = await assignUnassigned(activeUnassigned.value, target)
    const label = target === 'CRM Deal' ? __('Trato') : __('Lead')
    toast.success(`${label} ${__('creado')}: ${res.name}`)
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo convertir'))
  } finally {
    busy.value = false
  }
}
</script>
