<!-- Inbox left pane (286px): search + channel pills + conversation rows. handoff §5.1 -->
<template>
  <div
    class="flex flex-col bg-surface-white"
    :class="isMobile ? 'min-h-0 w-full flex-1' : 'w-[286px] flex-none border-r border-outline-gray-1'"
  >
    <div class="flex-none px-3.5 pb-2.5 pt-3.5">
      <div class="mb-3 flex items-center justify-between">
        <div class="text-[15px] font-bold text-ink-gray-9">{{ __('Mi bandeja') }}</div>
        <div class="flex items-center gap-2">
          <button
            :class="soundEnabled ? 'text-ink-green-3' : 'text-ink-gray-4'"
            :title="soundEnabled ? __('Sonido de notificación activado') : __('Activar sonido de notificación')"
            :aria-label="__('Sonido de notificación')"
            @click="toggleSound"
          >
            <LucideVolume2 v-if="soundEnabled" class="h-4 w-4" />
            <LucideVolumeX v-else class="h-4 w-4" />
          </button>
          <span
            class="rounded-full px-2 py-0.5 text-[11px] font-semibold text-ink-green-3 bg-surface-green-2"
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
            v-if="!isMobile"
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
      <!-- omnichannel tabs (Meta-style): Todos | WhatsApp | Messenger | Comentarios -->
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="t in inboxTabs"
          :key="t.id"
          class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
          :class="
            inboxTab === t.id
              ? 'bg-surface-green-2 text-ink-green-3'
              : 'bg-surface-gray-2 text-ink-gray-6 hover:bg-surface-gray-3'
          "
          @click="setInboxTab(t.id)"
        >
          <span v-if="t.dot" class="h-1.5 w-1.5 rounded-full" :style="`background:${t.dot}`" />
          {{ t.label }}
          <span v-if="t.count != null" class="text-[10px] opacity-70">{{ t.count }}</span>
        </button>
      </div>
    </div>

    <div class="scb flex-1 overflow-y-auto px-2 pb-2.5 pt-0.5">
      <!-- "Sin asignar": inbound WhatsApp from numbers with no Lead/Deal. Pinned
        above the deals so an unknown customer never goes unseen; clicking opens
        the orphan thread + Crear Lead/Trato. -->
      <div v-if="visibleUnassigned.length && inboxTab !== 'comments'" class="mb-1.5">
        <div class="flex items-center gap-1.5 px-1.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-amber-3">
          ⚠ {{ __('Sin asignar') }}
          <span class="rounded-full bg-surface-amber-1 px-1.5 text-[10px] text-ink-amber-3">{{ visibleUnassigned.length }}</span>
        </div>
        <button
          v-for="u in visibleUnassigned"
          :key="(u.last_channel === 'messenger' ? 'm:' + u.psid : 'w:' + u.phone)"
          class="mb-1 block w-full rounded-[11px] p-[11px] text-left hover:bg-surface-gray-2"
          :class="activeUnassigned === (u.last_channel === 'messenger' ? u.psid : u.phone) ? 'bg-surface-amber-1' : ''"
          :style="
            activeUnassigned === (u.last_channel === 'messenger' ? u.psid : u.phone)
              ? 'border-left:3px solid #f59e0b'
              : 'border-left:3px solid #f59e0b66'
          "
          @click="selectUnassigned(u.last_channel === 'messenger' ? u.psid : u.phone, u.last_channel)"
        >
          <div class="mb-1 flex items-center gap-2">
            <span class="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-surface-amber-1 text-ink-amber-3">
              <LucideMessageCircleQuestion class="h-4 w-4" />
            </span>
            <div class="min-w-0 flex-1">
              <div class="truncate text-[13px] font-semibold text-ink-gray-9">
                {{ u.contact_name || (u.last_channel === 'messenger' ? __('Messenger') + ' ' + (u.psid || '').slice(-6) : formatPhone(u.phone)) }}
              </div>
              <div class="truncate text-[11px] text-ink-gray-5">{{ u.last_channel === 'messenger' ? __('Messenger') : formatPhone(u.phone) }}</div>
            </div>
            <div class="flex-none text-right text-[10px] font-semibold text-ink-gray-4">
              {{ timeAgo(u.last_message_ts) }}
            </div>
          </div>
          <div class="flex items-center gap-1.5 text-[11.5px] text-ink-gray-6">
            <span
              class="inline-flex flex-none items-center font-semibold"
              :style="`color: ${u.last_channel === 'messenger' ? '#0084ff' : '#25d366'}`"
            >
              {{ u.last_channel === 'messenger' ? 'Msgr' : 'WA' }}
            </span>
            <span class="truncate">{{ u.last_message || '—' }}</span>
            <span v-if="u.count > 1" class="flex-none text-[10px] text-ink-gray-4">· {{ u.count }}</span>
          </div>
        </button>
        <div class="mx-1 mb-1 mt-0.5 border-b border-outline-gray-1" />
      </div>

      <!-- "Comentarios": comments on our Facebook posts. In the Comentarios TAB the
        status chips (Nuevos/Respondidos/Todos) let you review answered ones too. -->
      <div v-if="inboxTab === 'comments' || (inboxTab === 'all' && commentGroups.length)" class="mb-1.5">
        <div class="flex items-center gap-1.5 px-1.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-blue-3">
          <LucideFacebook class="h-3 w-3" /> {{ __('Comentarios') }}
          <span class="rounded-full bg-surface-blue-1 px-1.5 text-[10px] text-ink-blue-3">{{ commentGroups.length }}</span>
        </div>
        <!-- status sub-filter — answered comments stay reviewable, never lost -->
        <div v-if="inboxTab === 'comments'" class="mb-1.5 flex gap-1.5 px-1.5">
          <button
            v-for="s in commentStatusChips"
            :key="s.id"
            class="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            :class="commentStatus === s.id ? 'bg-surface-blue-2 text-ink-blue-3' : 'bg-surface-gray-2 text-ink-gray-6 hover:bg-surface-gray-3'"
            @click="setCommentStatus(s.id)"
          >
            {{ s.label }}<span v-if="s.count != null" class="ml-1 opacity-70">{{ s.count }}</span>
          </button>
        </div>
        <!-- search by commenter / text -->
        <div v-if="inboxTab === 'comments'" class="mb-1.5 flex items-center gap-2 rounded-[9px] border border-outline-gray-2 px-2.5 py-[6px]">
          <LucideSearch class="h-3.5 w-3.5 text-ink-gray-4" />
          <input
            :value="commentSearch"
            @input="setCommentSearch($event.target.value)"
            :placeholder="__('Buscar comentario o usuario…')"
            class="w-full border-0 bg-transparent text-[12px] text-ink-gray-8 placeholder:text-ink-gray-4 focus:outline-none focus:ring-0"
          />
        </div>
        <div v-if="inboxTab === 'comments' && !commentGroups.length" class="px-2 py-6 text-center text-xs text-ink-gray-4">
          {{ commentSearch ? __('Sin resultados') : __('Sin comentarios') }}
        </div>
        <!-- one row per POST (grouped) — opens the post + all its comments -->
        <button
          v-for="g in commentGroups"
          :key="g.post_id || g.latest_name"
          class="mb-1 block w-full rounded-[11px] p-[11px] text-left hover:bg-surface-gray-2"
          :class="activeCommentPost === (g.post_id || g.latest_name) ? 'bg-surface-blue-1' : ''"
          :style="activeCommentPost === (g.post_id || g.latest_name) ? 'border-left:3px solid #1877f2' : 'border-left:3px solid #1877f266'"
          @click="selectCommentGroup(g.post_id || g.latest_name)"
        >
          <div class="mb-1 flex items-center gap-2">
            <span class="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full text-white" style="background: #1877f2">
              <LucideFacebook class="h-3.5 w-3.5" />
            </span>
            <div class="min-w-0 flex-1">
              <div class="truncate text-[13px] font-semibold text-ink-gray-9">{{ __('Publicación') }}</div>
              <div class="truncate text-[11px] text-ink-gray-5">
                {{ g.count }} {{ g.count === 1 ? __('comentario') : __('comentarios') }}
              </div>
            </div>
            <div class="flex-none text-right text-[10px] font-semibold text-ink-gray-4">{{ timeAgo(g.latest_ts) }}</div>
          </div>
          <div class="flex items-center gap-1.5 text-[11.5px] text-ink-gray-6">
            <span class="inline-flex flex-none items-center font-semibold text-ink-gray-8">{{ g.from_name || 'FB' }}:</span>
            <span class="truncate">{{ g.message || '—' }}</span>
            <span v-if="g.lead" class="flex-none rounded px-1 text-[9px] font-semibold text-ink-violet-1 bg-surface-violet-1">{{ __('Lead') }}</span>
          </div>
        </button>
        <div class="mx-1 mb-1 mt-0.5 border-b border-outline-gray-1" />
      </div>

      <template v-if="inboxTab !== 'comments'">
      <div v-if="queue.loading && !rows.length && !visibleUnassigned.length" class="px-2 py-6 text-center text-xs text-ink-gray-4">
        {{ __('Cargando…') }}
      </div>
      <div v-else-if="!rows.length && !visibleUnassigned.length" class="px-2 py-6 text-center text-xs text-ink-gray-4">
        {{ __('Sin conversaciones') }}
      </div>
      <button
        v-for="r in rows"
        :key="(r.ref_doctype || 'CRM Deal') + ':' + r.name"
        class="mb-1 block w-full rounded-[11px] p-[11px] text-left hover:bg-surface-gray-2"
        :class="activeDeal === r.name && activeDealDoctype === (r.ref_doctype || 'CRM Deal') ? 'bg-surface-green-2' : ''"
        :style="
          activeDeal === r.name && activeDealDoctype === (r.ref_doctype || 'CRM Deal')
            ? 'border-left:3px solid #16a34a'
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
              :class="r.sla_overdue ? 'text-ink-red-4' : 'text-ink-gray-4'"
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
            class="inline-flex flex-none items-center font-semibold"
            :style="`color:${chColor(r.last_channel)}`"
          >
            {{ chLabel(r.last_channel) }}
          </span>
          <span class="truncate">{{ r.last_message || '—' }}</span>
        </div>
        <div class="mt-[7px] flex flex-wrap gap-1.5">
          <!-- Lead vs Trato (Deal) — leads now share the queue -->
          <span
            v-if="r.ref_doctype === 'CRM Lead'"
            class="rounded px-1.5 py-px text-[9.5px] font-semibold text-ink-violet-1 bg-surface-violet-1"
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
            class="inline-flex items-center gap-0.5 rounded py-px pl-1.5 pr-0.5 text-[9.5px] font-semibold text-ink-amber-3 bg-surface-amber-1"
            :title="__('El cliente escribió por última vez — falta tu respuesta. Desaparece cuando respondes o al completar el trato.')"
          >
            ↩ {{ __('Responder') }}
            <button
              class="ml-0.5 flex h-3 w-3 items-center justify-center rounded-full leading-none hover:bg-surface-amber-2"
              :aria-label="__('Marcar como respondido')"
              :title="__('Marcar como respondido')"
              @click.stop="clearResponder(r.ref_doctype || 'CRM Deal', r.name)"
            >
              ×
            </button>
          </span>
          <span
            v-if="r.status"
            class="inline-flex items-center gap-1 rounded bg-surface-gray-2 px-1.5 py-px text-[9.5px] font-semibold text-ink-gray-7"
          >
            <span class="h-1.5 w-1.5 flex-none rounded-full" :style="`background:${statusColor(r.status)}`" />
            {{ r.status }}
          </span>
          <span
            v-if="r.sla_overdue"
            class="rounded px-1.5 py-px text-[9.5px] font-semibold text-ink-red-4 bg-surface-red-1"
          >
            {{ __('SLA vencido') }}
          </span>
        </div>
      </button>
      </template>
    </div>

    <DealModal v-if="showDealModal" v-model="showDealModal" :redirect="{ name: 'Deal 360' }" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import LucideSearch from '~icons/lucide/search'
import LucideMessageCircleQuestion from '~icons/lucide/message-circle-question'
import LucideFacebook from '~icons/lucide/facebook'
import LucideVolume2 from '~icons/lucide/volume-2'
import LucideVolumeX from '~icons/lucide/volume-x'
import { statusesStore } from '@/stores/statuses'
import { soundEnabled, toggleSound } from '@/composables/notificationSound'
import { isMobile } from '@/composables/breakpoint'
import DealModal from '@/components/Modals/DealModal.vue'
import {
  queue,
  unassigned,
  commentPosts,
  commentCounts,
  inboxTab,
  commentStatus,
  commentSearch,
  setCommentSearch,
  queueSearch,
  queueCollapsed,
  activeDeal,
  activeDealDoctype,
  activeUnassigned,
  activeCommentPost,
  selectDeal,
  selectUnassigned,
  selectCommentGroup,
  setInboxTab,
  setCommentStatus,
  onSearchInput,
  reloadQueue,
  clearResponder,
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
// Server-grouped: one entry per post {post_id, count, latest_ts, from_name, message, lead}.
const commentGroups = computed(() => commentPosts.data || [])

// Orphans visible in the current tab: both on Todos, channel-scoped on WhatsApp/Messenger.
const visibleUnassigned = computed(() => {
  if (inboxTab.value === 'whatsapp') return unassignedRows.value.filter((u) => u.last_channel !== 'messenger')
  if (inboxTab.value === 'messenger') return unassignedRows.value.filter((u) => u.last_channel === 'messenger')
  return unassignedRows.value
})

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

// Omnichannel tabs (Meta-style). Counts: per-channel deal rows; Comentarios = new.
const inboxTabs = computed(() => [
  { id: 'all', label: __('Todos') },
  { id: 'whatsapp', label: 'WhatsApp', dot: CHANNEL_META.whatsapp?.[1] || '#25d366', count: rows.value.filter((r) => r.last_channel === 'whatsapp').length },
  { id: 'messenger', label: 'Messenger', dot: CHANNEL_META.messenger?.[1] || '#0084ff', count: rows.value.filter((r) => r.last_channel === 'messenger').length },
  { id: 'comments', label: __('Comentarios'), dot: '#1877f2', count: commentCounts.data?.new ?? null },
])
// Comentarios status sub-filter chips (review answered comments).
const commentStatusChips = computed(() => [
  { id: 'New', label: __('Nuevos'), count: commentCounts.data?.new },
  { id: 'answered', label: __('Respondidos'), count: commentCounts.data?.answered },
  { id: 'all', label: __('Todos'), count: commentCounts.data?.all },
])

function chColor(key) {
  return CHANNEL_META[key]?.[1] || '#9aa2ae'
}
function chLabel(key) {
  return key === 'whatsapp' ? 'WA' : key === 'messenger' ? 'Msgr' : key === 'instagram' ? 'IG' : CHANNEL_META[key]?.[0] || key
}
// status hue as a small dot only; the label rides a theme-aware ink color so it
// stays readable in dark (the stored status .color can be a dark hex or a color
// name like "black"/"gray" — using it as text rendered black-on-black in dark).
function statusColor(status) {
  return getDealStatus(status)?.color || '#9aa2ae'
}
</script>
