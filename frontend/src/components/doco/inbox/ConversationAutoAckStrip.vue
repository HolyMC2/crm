<!--
  In-conversation auto-ack review strip (#22). When the open deal/lead has a pending
  auto-acuse, show it HERE — above the thread — so the reviewer approves it with the full
  conversation, calls, items and deal/lead context in view (the "Por aprobar" list just
  navigates here). Editable before sending; Aprobar y enviar is the only customer-facing path.
-->
<template>
  <div v-if="rows.length" class="mx-3 mb-2 rounded-lg border border-outline-amber-3 bg-surface-amber-1 px-3 py-2.5 sm:mx-10">
    <div class="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-amber-6">
      ⏳ {{ __('Acuse automático por aprobar') }}
    </div>
    <div v-for="r in rows" :key="r.name" class="mt-1.5 first:mt-0">
      <textarea
        v-model="drafts[r.name]"
        rows="2"
        class="scb mb-1.5 w-full resize-none rounded-md border border-outline-amber-3 bg-surface-base px-2 py-1.5 text-[12.5px] text-ink-gray-8 focus:outline-none dark:bg-surface-gray-2"
      />
      <!-- Manager-eyes policy: only managers act (server enforces _APPROVER_ROLES) -->
      <div v-if="canAct" class="flex items-center justify-end gap-1.5">
        <button
          class="rounded-md px-2 py-1 text-[11px] font-semibold text-ink-gray-6 hover:bg-surface-amber-2 disabled:opacity-50"
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
import { autoAckForConvo, approveAutoAck, discardAutoAck } from '@/composables/inbox'
import { usersStore } from '@/stores/users'

const { isManager } = usersStore()
const canAct = computed(() => isManager())
const rows = computed(() => autoAckForConvo.data || [])
const drafts = reactive({})
const busy = reactive({})

watch(
  rows,
  (list) => {
    for (const r of list) if (!(r.name in drafts)) drafts[r.name] = r.draft_body || ''
  },
  { immediate: true },
)

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
