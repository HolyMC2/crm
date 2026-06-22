<!-- Inbox left pane (286px): search + channel pills + conversation rows. handoff §5.1 -->
<template>
  <div
    class="flex w-[286px] flex-none flex-col border-r border-outline-gray-1"
    style="background: #fcfcfd"
  >
    <div class="flex-none px-3.5 pb-2.5 pt-3.5">
      <div class="mb-3 flex items-center justify-between">
        <div class="text-[15px] font-bold text-ink-gray-9">{{ __('Mi bandeja') }}</div>
        <div class="flex items-center gap-2">
          <span
            class="rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style="color: #15803d; background: #e9f7ef"
          >
            {{ openCount }}
          </span>
          <button
            class="rounded-lg px-2.5 py-1 text-[12px] font-semibold text-white"
            style="background: #16a34a"
            :aria-label="__('New Deal')"
            @click="newDeal"
          >
            + {{ __('Trato') }}
          </button>
          <button
            class="text-[13px] text-ink-gray-4 hover:text-ink-gray-9"
            :aria-label="__('Ocultar bandeja')"
            :title="__('Ocultar bandeja')"
            @click="queueCollapsed = true"
          >
            ⟨
          </button>
        </div>
      </div>
      <div
        class="mb-3 flex items-center gap-2 rounded-[9px] border border-outline-gray-2 px-2.5 py-[7px]"
      >
        <LucideSearch class="h-3.5 w-3.5 text-ink-gray-4" />
        <input
          :value="queueSearch"
          @input="onSearchInput($event.target.value)"
          :placeholder="__('Buscar equipo, cliente…')"
          class="w-full border-0 bg-transparent text-[12.5px] text-ink-gray-8 placeholder:text-ink-gray-4 focus:outline-none focus:ring-0"
        />
      </div>
      <div class="flex flex-wrap gap-1.5">
        <button
          class="rounded-full px-2.5 py-1 text-[11px] font-semibold"
          :style="
            queueChannel === null
              ? 'color:#fff;background:#1c2230'
              : 'color:#5b6472;background:#f1f2f4'
          "
          @click="setQueueChannel(null)"
        >
          {{ __('Todas') }}
        </button>
        <button
          v-for="p in channelPills"
          :key="p.key"
          class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold"
          :style="
            queueChannel === p.key
              ? 'color:#fff;background:#1c2230'
              : 'color:#5b6472;background:#f1f2f4'
          "
          @click="setQueueChannel(p.key)"
        >
          <span class="h-1.5 w-1.5 rounded-full" :style="`background:${p.dot}`" />
          {{ p.count }}
        </button>
      </div>
    </div>

    <div class="scb flex-1 overflow-y-auto px-2 pb-2.5 pt-0.5">
      <!-- "Sin asignar": inbound WhatsApp from numbers with no Lead/Deal. Pinned
        above the deals so an unknown customer never goes unseen; clicking opens
        the orphan thread + Crear Lead/Trato. -->
      <div v-if="unassignedRows.length" class="mb-1.5">
        <div class="flex items-center gap-1.5 px-1.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
          ⚠ {{ __('Sin asignar') }}
          <span class="rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-700">{{ unassignedRows.length }}</span>
        </div>
        <button
          v-for="u in unassignedRows"
          :key="u.phone"
          class="mb-1 block w-full rounded-[11px] p-[11px] text-left hover:bg-surface-gray-2"
          :style="
            activeUnassigned === u.phone
              ? 'border-left:3px solid #f59e0b;background:#fff7ed'
              : 'border-left:3px solid #f59e0b66'
          "
          @click="selectUnassigned(u.phone)"
        >
          <div class="mb-1 flex items-center gap-2">
            <span class="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <LucideMessageCircleQuestion class="h-4 w-4" />
            </span>
            <div class="min-w-0 flex-1">
              <div class="truncate text-[13px] font-semibold text-ink-gray-9">
                {{ u.contact_name || formatPhone(u.phone) }}
              </div>
              <div class="truncate text-[11px] text-ink-gray-5">{{ formatPhone(u.phone) }}</div>
            </div>
            <div class="flex-none text-right text-[10px] font-semibold text-ink-gray-4">
              {{ timeAgo(u.last_message_ts) }}
            </div>
          </div>
          <div class="flex items-center gap-1.5 text-[11.5px] text-ink-gray-6">
            <span class="inline-flex flex-none items-center gap-1 font-semibold" style="color: #25d366">
              <span class="h-1.5 w-1.5 rounded-full" style="background: #25d366" />
              WA
            </span>
            <span class="truncate">{{ u.last_message || '—' }}</span>
            <span v-if="u.count > 1" class="flex-none text-[10px] text-ink-gray-4">· {{ u.count }}</span>
          </div>
        </button>
        <div class="mx-1 mb-1 mt-0.5 border-b border-outline-gray-1" />
      </div>

      <div v-if="queue.loading && !rows.length && !unassignedRows.length" class="px-2 py-6 text-center text-xs text-ink-gray-4">
        {{ __('Cargando…') }}
      </div>
      <div v-else-if="!rows.length && !unassignedRows.length" class="px-2 py-6 text-center text-xs text-ink-gray-4">
        {{ __('Sin conversaciones') }}
      </div>
      <button
        v-for="r in rows"
        :key="(r.ref_doctype || 'CRM Deal') + ':' + r.name"
        class="mb-1 block w-full rounded-[11px] p-[11px] text-left hover:bg-surface-gray-2"
        :style="
          activeDeal === r.name && activeDealDoctype === (r.ref_doctype || 'CRM Deal')
            ? 'border-left:3px solid #16a34a;background:#eef6f0'
            : 'border-left:3px solid transparent'
        "
        @click="selectDeal(r.name, r.ref_doctype || 'CRM Deal')"
      >
        <div class="mb-1.5 flex items-center gap-2">
          <span
            class="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full text-xs font-semibold"
            :style="`background:${avatarColor(r.contact_name)[0]};color:${avatarColor(r.contact_name)[1]}`"
          >
            {{ initials(r.contact_name) }}
          </span>
          <div class="min-w-0 flex-1">
            <div class="truncate text-[13px] font-semibold text-ink-gray-9">
              {{ r.contact_name || r.mobile_no || __('Sin nombre') }}
            </div>
            <div class="truncate text-[11px] text-ink-gray-5">
              {{ r.device || r.mobile_no || '—' }}
            </div>
          </div>
          <div class="flex flex-none flex-col items-end gap-1">
            <div
              class="text-[10px] font-semibold"
              :style="r.sla_overdue ? 'color:#e5484d' : 'color:#8a93a1'"
            >
              {{ timeAgo(r.last_message_ts) }}
            </div>
            <!-- red unread dot: there's an inbound message newer than your last
              open. Clears when you open the conversation (mark-read). -->
            <span
              v-if="r.unread_dot"
              class="h-2.5 w-2.5 rounded-full"
              style="background: #ef4444"
              :title="__('No leído')"
            />
          </div>
        </div>
        <div class="flex items-center gap-1.5 text-[11.5px] text-ink-gray-6">
          <span
            v-if="r.last_channel"
            class="inline-flex flex-none items-center gap-1 font-semibold"
            :style="`color:${chColor(r.last_channel)}`"
          >
            <span class="h-1.5 w-1.5 rounded-full" :style="`background:${chColor(r.last_channel)}`" />
            {{ chLabel(r.last_channel) }}
          </span>
          <span class="truncate">{{ r.last_message || '—' }}</span>
        </div>
        <div class="mt-[7px] flex flex-wrap gap-1.5">
          <!-- Lead vs Trato (Deal) — leads now share the queue -->
          <span
            v-if="r.ref_doctype === 'CRM Lead'"
            class="rounded px-1.5 py-px text-[9.5px] font-semibold"
            style="color: #7c3aed; background: #f3e8ff"
          >
            {{ __('Lead') }}
          </span>
          <!-- "needs reply": last message was inbound (backend r.unread =
            direction=="in"). Labeled amber chip, distinct from the WhatsApp-green
            channel dot, so it reads as an action ("responder"), not decoration.
            Clears when you reply (last direction flips to outbound), not on open —
            it is not a read receipt. -->
          <span
            v-if="r.unread"
            class="inline-flex items-center gap-0.5 rounded px-1.5 py-px text-[9.5px] font-semibold"
            style="color: #b45309; background: #fef3c7"
            :title="__('El cliente escribió por última vez — falta tu respuesta. Desaparece cuando respondes.')"
          >
            ↩ {{ __('Responder') }}
          </span>
          <span
            v-if="r.status"
            class="rounded px-1.5 py-px text-[9.5px] font-semibold"
            :style="statusChip(r.status)"
          >
            {{ r.status }}
          </span>
          <span
            v-if="r.sla_overdue"
            class="rounded px-1.5 py-px text-[9.5px] font-semibold"
            style="color: #e5484d; background: #fdecec"
          >
            {{ __('SLA vencido') }}
          </span>
        </div>
      </button>
    </div>

    <DealModal v-if="showDealModal" v-model="showDealModal" :redirect="{ name: 'Deal 360' }" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import LucideSearch from '~icons/lucide/search'
import LucideMessageCircleQuestion from '~icons/lucide/message-circle-question'
import { statusesStore } from '@/stores/statuses'
import DealModal from '@/components/Modals/DealModal.vue'
import {
  queue,
  channels,
  unassigned,
  queueChannel,
  queueSearch,
  queueCollapsed,
  activeDeal,
  activeDealDoctype,
  activeUnassigned,
  selectDeal,
  selectUnassigned,
  setQueueChannel,
  onSearchInput,
  reloadQueue,
  avatarColor,
  initials,
  timeAgo,
  CHANNEL_META,
} from '@/composables/inbox'

const { getDealStatus } = statusesStore()

// the doco DealModal — deal + repair-order intake fields (not the generic doctype
// modal, which only creates a bare deal)
const showDealModal = ref(false)
function newDeal() {
  showDealModal.value = true
}

const rows = computed(() => queue.data || [])
const openCount = computed(() => rows.value.length)
const unassignedRows = computed(() => unassigned.data || [])

// Pretty-print a raw WhatsApp number (e.g. 5216691530561 / 526691530561) as
// +52 669 153 0561 — strip the country code + the MX mobile "1", group the rest.
function formatPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '')
  let n = d
  if (n.startsWith('521')) n = n.slice(3)
  else if (n.startsWith('52')) n = n.slice(2)
  if (n.length === 10) return `+52 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`
  return raw ? `+${d}` : '—'
}

// channel pills with live unread counts derived from the queue (WA real; others 0)
const channelPills = computed(() => {
  const live = (channels.data || []).filter((c) => c.key !== 'email')
  const order = live.length ? live.map((c) => c.key) : ['whatsapp', 'messenger', 'instagram']
  return order.map((key) => ({
    key,
    dot: CHANNEL_META[key]?.[1] || '#9aa2ae',
    count: rows.value.filter((r) => r.last_channel === key).length,
  }))
})

function chColor(key) {
  return CHANNEL_META[key]?.[1] || '#9aa2ae'
}
function chLabel(key) {
  return key === 'whatsapp' ? 'WA' : key === 'messenger' ? 'Msgr' : key === 'instagram' ? 'IG' : CHANNEL_META[key]?.[0] || key
}
function statusChip(status) {
  const s = getDealStatus(status)
  const color = s?.color || '#5b6472'
  return `color:${color};background:${color}1a` // 1a = ~10% alpha
}
</script>
