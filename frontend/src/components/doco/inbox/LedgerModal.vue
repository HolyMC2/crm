<!--
  Bitácora — the unified cross-channel ledger for a person. One timeline of every
  WhatsApp + Messenger + Facebook-comment touch we have, resolved through the
  Contact Channel Identity registry (doco_marketing.api.inbox.get_contact_ledger).
  Opened from the deal header; read-only, for context + reporting.
-->
<template>
  <Dialog v-model="ledgerOpen" :options="{ size: '2xl' }">
    <template #body>
      <div class="px-4 py-4 sm:px-6">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-[15px] font-bold text-ink-gray-9">{{ __('Bitácora') }}</h3>
          <button class="text-ink-gray-5 hover:text-ink-gray-9" @click="ledgerOpen = false" :aria-label="__('Cerrar')">✕</button>
        </div>

        <!-- per-channel counts -->
        <div class="mb-3 flex flex-wrap gap-2">
          <span
            v-for="(n, ch) in counts"
            :key="ch"
            class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            :style="`color:${chColor(ch)};background:${chColor(ch)}1a`"
          >
            <span class="h-1.5 w-1.5 rounded-full" :style="`background:${chColor(ch)}`" />
            {{ ch }} · {{ n }}
          </span>
          <span v-if="!Object.keys(counts).length && !ledger.loading" class="text-[12px] text-ink-gray-5">
            {{ __('Sin historial todavía.') }}
          </span>
        </div>

        <!-- linked identities -->
        <div v-if="identities.length" class="mb-3 rounded-lg border border-outline-gray-1 bg-surface-gray-1 px-3 py-2">
          <div class="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink-gray-5">{{ __('Identidades') }}</div>
          <div class="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
            <span v-for="(id, i) in identities" :key="i" class="inline-flex items-center gap-1.5">
              <span class="font-semibold" :style="`color:${chColor(id.channel)}`">{{ id.channel }}</span>
              <span class="text-ink-gray-7">{{ id.identifier }}</span>
            </span>
          </div>
        </div>

        <!-- merged timeline -->
        <div class="scb max-h-[55vh] overflow-y-auto">
          <div v-if="ledger.loading" class="py-8 text-center text-[12px] text-ink-gray-4">{{ __('Cargando…') }}</div>
          <div v-else-if="!messages.length" class="py-8 text-center text-[12px] text-ink-gray-4">{{ __('Sin mensajes.') }}</div>
          <div
            v-for="(m, i) in messages"
            :key="i"
            class="flex items-start gap-2.5 border-b border-outline-gray-1 py-2 last:border-0"
          >
            <span class="mt-1 h-2 w-2 flex-none rounded-full" :style="`background:${chColor(m.channel)}`" />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 text-[10.5px] text-ink-gray-5">
                <span class="font-semibold" :style="`color:${chColor(m.channel)}`">{{ m.channel }}</span>
                <span>· {{ m.direction === 'out' ? __('enviado') : __('recibido') }}</span>
                <span>· {{ fmt(m.ts) }}</span>
              </div>
              <div class="truncate text-[13px] text-ink-gray-8">{{ m.content || (m.content_type !== 'text' ? '['+m.content_type+']' : '—') }}</div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { computed } from 'vue'
import { Dialog } from 'frappe-ui'
import { ledger, ledgerOpen } from '@/composables/inbox'

const messages = computed(() => ledger.data?.messages || [])
const counts = computed(() => ledger.data?.counts || {})
const identities = computed(() => ledger.data?.identities || [])

const COLORS = {
  WhatsApp: '#25d366',
  Messenger: '#0084ff',
  Facebook: '#1877f2',
  Instagram: '#e1306c',
  Email: '#6b7280',
  Phone: '#16a34a',
}
function chColor(ch) {
  return COLORS[ch] || '#9aa2ae'
}
function fmt(ts) {
  if (!ts) return ''
  try {
    return new Date(String(ts).replace(' ', 'T')).toLocaleString('es-MX', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(ts).slice(0, 16)
  }
}
</script>
