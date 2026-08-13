<!--
  "Por aprobar" panel (#22). The review gate for auto-acuses: the */5 sweep DRAFTS an
  acknowledgement for every unanswered inbound, and it lands here as Pendiente. NOTHING
  has been sent. A human reads it, optionally edits the text, then "Aprobar y enviar"
  (the only path that messages the customer) or "Descartar". Lives in the left queue
  pane, swapped in when the Por-aprobar tab is active.
-->
<template>
  <div class="px-0.5">
    <div v-if="autoAcks.loading && !rows.length" class="px-2 py-6 text-center text-xs text-ink-gray-4">
      {{ __('Cargando…') }}
    </div>
    <div v-else-if="autoAcks.error && !rows.length" class="px-2 py-6 text-center text-xs text-ink-red-6">
      {{ __('No se pudo cargar la lista.') }}
      <button class="ml-1 font-semibold underline hover:text-ink-red-7" @click="reloadAutoAcks">{{ __('Reintentar') }}</button>
    </div>
    <div v-else-if="!rows.length" class="px-2 py-8 text-center text-xs text-ink-gray-4">
      ✅ {{ __('Nada por aprobar') }}
      <div class="mt-1 text-[10.5px] text-ink-gray-4">{{ __('Los acuses automáticos pendientes aparecen aquí antes de enviarse.') }}</div>
    </div>

    <div
      v-for="r in rows"
      :key="r.name"
      class="mb-1.5 rounded-[11px] border border-outline-gray-2 bg-surface-base p-[11px]"
    >
      <div class="mb-1 flex items-center gap-2">
        <span
          class="inline-flex flex-none items-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
          :style="`background:${chColor(r.channel)}`"
        >
          {{ chLabel(r.channel) }}
        </span>
        <button
          class="group min-w-0 flex-1 text-left"
          :title="__('Abrir la conversación para revisar con contexto completo')"
          @click="openConvo(r)"
        >
          <!-- name first, number second: the backend resolves identity through the
               contact chain, so a bare phone here means we genuinely don't know them. -->
          <div class="truncate text-[12.5px] font-semibold text-ink-gray-9 group-hover:text-ink-blue-9">
            {{ displayName(r) }}
            <span class="text-[10px] font-normal text-ink-blue-9 opacity-0 group-hover:opacity-100">↗ {{ __('abrir') }}</span>
          </div>
          <div class="flex items-center gap-1.5 truncate text-[10.5px] text-ink-gray-5">
            <span class="truncate">{{ formatPhone(r.mobile_no || r.to) }}</span>
            <span v-if="r.status" class="flex-none rounded px-1 py-px text-[9.5px] font-semibold" :style="statusChip(r)">
              {{ r.status }}
            </span>
          </div>
        </button>
        <span class="flex-none text-[10px] font-semibold text-ink-amber-7" :title="__('Esperando desde el entrante')">
          {{ timeAgo(r.last_inbound_at || r.creation) }}
        </span>
      </div>

      <!-- editable draft — the reviewer adjusts the wording before sending -->
      <textarea
        v-model="drafts[r.name]"
        rows="2"
        class="scb mb-1.5 w-full resize-none rounded-md border border-outline-gray-2 bg-surface-gray-1 px-2 py-1.5 text-[12px] text-ink-gray-8 focus:outline-none focus:ring-1 focus:ring-outline-gray-3 dark:bg-surface-gray-2"
        :placeholder="__('Mensaje del acuse…')"
      />

      <!-- Manager-eyes policy: only managers act (server enforces _APPROVER_ROLES) -->
      <div v-if="canAct" class="flex items-center justify-end gap-1.5">
        <button
          class="rounded-md px-2 py-1 text-[11px] font-semibold text-ink-gray-6 hover:bg-surface-gray-2 disabled:opacity-50"
          :disabled="busy[r.name]"
          @click="onDiscard(r)"
        >
          {{ __('Descartar') }}
        </button>
        <button
          class="rounded-md px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
          style="background: var(--brand)"
          :disabled="busy[r.name] || !(drafts[r.name] || '').trim()"
          @click="onApprove(r)"
        >
          {{ busy[r.name] ? '…' : __('Aprobar y enviar') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, watch } from 'vue'
import { toast } from 'frappe-ui'
import { autoAcks, reloadAutoAcks, approveAutoAck, discardAutoAck, selectDeal, timeAgo, CHANNEL_META } from '@/composables/inbox'
import { formatPhone } from '@/composables/crmFormat'
import { usersStore } from '@/stores/users'
import { statusesStore } from '@/stores/statuses'

const { isManager } = usersStore()
const { getDealStatus, getLeadStatus } = statusesStore()
const canAct = computed(() => isManager())
const rows = computed(() => autoAcks.data || [])
// Per-row local edit buffer (so editing one draft never mutates the shared resource)
// + a busy flag to disable the row while its action is in flight.
const drafts = reactive({})
const busy = reactive({})

// Seed/refresh the edit buffers whenever the list reloads, preserving any in-progress
// edit the reviewer hasn't sent yet (don't clobber typing on a background refresh).
watch(
  rows,
  (list) => {
    for (const r of list) if (!(r.name in drafts)) drafts[r.name] = r.draft_body || ''
  },
  { immediate: true },
)

// Open the conversation so the reviewer sees the full thread/calls/items/deal before
// approving (the acuse then appears in the in-conversation strip).
function openConvo(r) {
  if (r.reference_doctype && r.reference_name) selectDeal(r.reference_name, r.reference_doctype)
}

// contact_name is server-resolved (Contact → deal fields → primary contact → lead);
// only fall through to the raw number when nothing named this customer.
function displayName(r) {
  return r.contact_name || formatPhone(r.mobile_no || r.to) || '—'
}
// Deal and lead statuses live in separate stores; the row's reference tells us which.
// Hue as text + 10% wash (same treatment as the queue), so it stays readable in dark.
function statusChip(r) {
  const store = r.reference_doctype === 'CRM Lead' ? getLeadStatus : getDealStatus
  const c = store(r.status)?.color || '#5b6472'
  return `color:${c};background:${c}1a`
}

function chColor(channel) {
  const k = (channel || '').toLowerCase()
  return CHANNEL_META[k]?.[1] || (k === 'comment' ? '#1877f2' : '#9aa2ae')
}
function chLabel(channel) {
  const k = (channel || '').toLowerCase()
  return k === 'whatsapp' ? 'WA' : k === 'messenger' ? 'Msgr' : k === 'comment' ? 'FB' : channel
}

async function onApprove(r) {
  busy[r.name] = true
  try {
    await approveAutoAck(r.name, drafts[r.name])
    delete drafts[r.name]
    toast.success(__('Acuse enviado'))
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo enviar el acuse'))
  } finally {
    busy[r.name] = false
  }
}

async function onDiscard(r) {
  busy[r.name] = true
  try {
    await discardAutoAck(r.name)
    delete drafts[r.name]
  } catch (e) {
    toast.error(__('No se pudo descartar'))
  } finally {
    busy[r.name] = false
  }
}
</script>
