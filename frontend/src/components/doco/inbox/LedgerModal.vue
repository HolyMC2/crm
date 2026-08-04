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

        <!-- consent (manager-gated endpoint: reps get 403 → section self-hides) -->
        <div v-if="consentRows.length" class="mb-3 rounded-lg border border-outline-gray-1 bg-surface-gray-1 px-3 py-2">
          <div class="mb-1.5 flex items-center justify-between">
            <div class="text-[10px] font-bold uppercase tracking-wide text-ink-gray-5">{{ __('Consentimiento') }}</div>
            <a
              class="text-[11px] font-semibold text-ink-gray-6 underline hover:text-ink-gray-9"
              :href="csvHref"
              :download="true"
            >
              {{ __('Exportar CSV') }}
            </a>
          </div>
          <div
            v-if="consentTampered"
            class="mb-1.5 rounded bg-surface-red-1 px-2 py-1 text-[11px] font-semibold text-ink-red-7"
          >
            ⚠ {{ __('{0} registro(s) no pasan la verificación de integridad', [consentTampered]) }}
          </div>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="r in consentRows"
              :key="r.name"
              class="inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[11px] font-semibold"
              :class="consentChip(r)"
              :title="`${r.source_form || ''} · ${r.consent_class || ''}${r.consent_text ? ' · «' + r.consent_text + '»' : ''}`"
            >
              {{ r.action === 'Grant' ? '✔' : '✖' }} {{ r.channel }}
              <span class="font-normal opacity-80">· {{ classLabel(r.consent_class) }} · {{ fmtDay(r.ts) }}</span>
              <span v-if="r.hash_ok === false">⚠</span>
            </span>
          </div>
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
          <div v-else-if="ledger.error && !messages.length" class="py-8 text-center text-[12px] text-ink-red-6">
            {{ __('No se pudo cargar el historial.') }}
            <button class="ml-1 font-semibold underline hover:text-ink-red-7" @click="ledger.reload()">{{ __('Reintentar') }}</button>
          </div>
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
import { activeDeal, activeDealDoctype, consentHistory, ledger, ledgerOpen } from '@/composables/inbox'

const messages = computed(() => ledger.data?.messages || [])
const counts = computed(() => ledger.data?.counts || {})
const identities = computed(() => ledger.data?.identities || [])

// consent chips (manager-only endpoint; error → empty → hidden)
const consentRows = computed(() => consentHistory.data?.rows || [])
const consentTampered = computed(() => consentHistory.data?.tampered || 0)
const csvHref = computed(
  () =>
    `/api/method/doco_marketing.api.consent.export_consent_csv?reference_doctype=${encodeURIComponent(activeDealDoctype.value || '')}&reference_name=${encodeURIComponent(activeDeal.value || '')}`,
)
function consentChip(r) {
  if (r.hash_ok === false) return 'bg-surface-red-1 text-ink-red-7'
  return r.action === 'Grant' ? 'bg-surface-green-2 text-ink-green-7' : 'bg-surface-red-1 text-ink-red-7'
}
const CLASS_LABEL = { Explicit: 'explícito', Implied: 'implícito', Imported: 'importado' }
function classLabel(c) {
  return CLASS_LABEL[c] || c || ''
}
function fmtDay(ts) {
  if (!ts) return ''
  try {
    return new Date(String(ts).replace(' ', 'T')).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })
  } catch {
    return String(ts).slice(0, 10)
  }
}

const COLORS = {
  WhatsApp: '#25d366',
  Messenger: '#0084ff',
  Facebook: '#1877f2',
  Instagram: '#e1306c',
  Email: '#6b7280',
  Phone: 'var(--brand)',
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
