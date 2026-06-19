<!-- Inbox left pane (286px): search + channel pills + conversation rows. handoff §5.1 -->
<template>
  <div
    class="flex w-[286px] flex-none flex-col border-r border-outline-gray-1"
    style="background: #fcfcfd"
  >
    <div class="flex-none px-3.5 pb-2.5 pt-3.5">
      <div class="mb-3 flex items-center justify-between">
        <div class="text-[15px] font-bold text-ink-gray-9">{{ __('Mi bandeja') }}</div>
        <span
          class="rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style="color: #15803d; background: #e9f7ef"
        >
          {{ openCount }} {{ __('abiertas') }}
        </span>
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
      <div v-if="queue.loading && !rows.length" class="px-2 py-6 text-center text-xs text-ink-gray-4">
        {{ __('Cargando…') }}
      </div>
      <div v-else-if="!rows.length" class="px-2 py-6 text-center text-xs text-ink-gray-4">
        {{ __('Sin conversaciones') }}
      </div>
      <button
        v-for="r in rows"
        :key="r.deal"
        class="mb-1 block w-full rounded-[11px] p-[11px] text-left hover:bg-surface-gray-2"
        :style="
          activeDeal === r.deal
            ? 'border-left:3px solid #16a34a;background:#eef6f0'
            : 'border-left:3px solid transparent'
        "
        @click="selectDeal(r.deal)"
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
          <div class="flex-none text-right">
            <div
              class="text-[10px] font-semibold"
              :style="r.sla_overdue ? 'color:#e5484d' : 'color:#8a93a1'"
            >
              {{ timeAgo(r.last_message_ts) }}
            </div>
            <span
              v-if="r.unread"
              class="mt-[3px] inline-block min-w-[16px] rounded-full px-[5px] py-px text-[9.5px] font-bold text-white"
              style="background: #25d366"
            >
              ●
            </span>
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
  </div>
</template>

<script setup>
import { computed } from 'vue'
import LucideSearch from '~icons/lucide/search'
import { statusesStore } from '@/stores/statuses'
import {
  queue,
  channels,
  queueChannel,
  queueSearch,
  activeDeal,
  selectDeal,
  setQueueChannel,
  onSearchInput,
  avatarColor,
  initials,
  timeAgo,
  CHANNEL_META,
} from '@/composables/inbox'

const { getDealStatus } = statusesStore()

const rows = computed(() => queue.data || [])
const openCount = computed(() => rows.value.length)

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
