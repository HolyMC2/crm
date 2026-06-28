<!--
  Comentarios workspace — middle pane when a Page-feed comment is selected.
  A comment on one of our Facebook posts is a warm lead: reply publicly, DM the
  commenter (private reply → mints a Messenger thread that surfaces in the inbox),
  convert to a CRM Lead, or hide it on Facebook. Backend: doco_marketing.api.comments.
-->
<template>
  <div class="flex min-h-0 w-full flex-1 flex-col bg-surface-gray-1">
    <div v-if="!c" class="flex flex-1 items-center justify-center text-[13px] text-ink-gray-4">
      {{ __('Selecciona un comentario') }}
    </div>
    <template v-else>
      <!-- header -->
      <div class="flex-none border-b border-outline-gray-1 bg-surface-white px-4 py-3">
        <div class="flex items-center gap-2.5">
          <button
            v-if="isMobile"
            class="text-ink-gray-5 hover:text-ink-gray-9"
            :aria-label="__('Atrás')"
            @click="mobileBack"
          >
            ←
          </button>
          <span
            class="flex h-9 w-9 flex-none items-center justify-center rounded-full text-white"
            style="background: #1877f2"
          >
            <LucideFacebook class="h-4.5 w-4.5" />
          </span>
          <div class="min-w-0 flex-1">
            <div class="truncate text-[14px] font-bold text-ink-gray-9">
              {{ c.from_name || __('Usuario de Facebook') }}
            </div>
            <div class="flex items-center gap-1.5 text-[11px] text-ink-gray-5">
              {{ __('Comentario en Facebook') }} · {{ timeAgo(c.created_ts) }}
              <a
                v-if="c.permalink"
                :href="c.permalink"
                target="_blank"
                rel="noopener"
                class="text-ink-blue-3 hover:underline"
                >{{ __('ver post') }}</a
              >
            </div>
          </div>
          <span
            class="flex-none rounded px-1.5 py-px text-[10px] font-semibold"
            :style="statusChip(c.status)"
          >
            {{ statusLabel(c.status) }}
          </span>
        </div>
      </div>

      <!-- body -->
      <div class="scb flex-1 overflow-y-auto px-4 py-4">
        <div class="rounded-xl border border-outline-gray-1 bg-surface-white p-3.5 text-[13.5px] text-ink-gray-8">
          {{ c.message || __('(sin texto)') }}
        </div>

        <div v-if="c.lead" class="mt-3 flex items-center gap-2 text-[12px]">
          <span class="rounded px-1.5 py-px text-[10px] font-semibold text-ink-violet-1 bg-surface-violet-1">{{ __('Lead') }}</span>
          <button class="text-ink-blue-3 hover:underline" @click="openLead">{{ c.lead }}</button>
        </div>

        <div v-if="c.reply_text" class="mt-3 rounded-xl border border-outline-blue-1 bg-surface-blue-1 p-3 text-[12.5px] text-ink-gray-8">
          <div class="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink-blue-3">{{ __('Tu respuesta') }}</div>
          {{ c.reply_text }}
        </div>
      </div>

      <!-- action bar -->
      <div class="flex-none border-t border-outline-gray-1 bg-surface-white px-4 py-3">
        <div class="mb-2 flex flex-wrap items-center gap-2">
          <button
            v-if="!c.lead"
            class="rounded-lg px-2.5 py-1 text-[12px] font-semibold text-white"
            style="background: #7c3aed"
            :disabled="busy"
            @click="onConvert"
          >
            + {{ __('Lead') }}
          </button>
          <button
            class="rounded-lg border border-outline-gray-2 px-2.5 py-1 text-[12px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2"
            :disabled="busy"
            @click="onHide"
          >
            {{ c.is_hidden ? __('Mostrar') : __('Ocultar') }}
          </button>
          <!-- reply mode toggle -->
          <div class="ml-auto inline-flex overflow-hidden rounded-lg border border-outline-gray-2 text-[11px] font-semibold">
            <button
              class="px-2 py-1"
              :class="mode === 'public' ? 'bg-surface-gray-3 text-ink-gray-9' : 'text-ink-gray-5'"
              @click="mode = 'public'"
            >
              {{ __('Público') }}
            </button>
            <button
              class="px-2 py-1"
              :class="mode === 'private' ? 'bg-surface-blue-2 text-ink-blue-3' : 'text-ink-gray-5'"
              :title="__('Manda un mensaje privado (DM) al autor del comentario')"
              @click="mode = 'private'"
            >
              {{ __('Privado (DM)') }}
            </button>
          </div>
        </div>
        <div class="flex items-end gap-2">
          <textarea
            v-model="reply"
            rows="2"
            :placeholder="mode === 'private' ? __('Responder por mensaje privado…') : __('Responder en el comentario…')"
            class="scb flex-1 resize-none rounded-lg border border-outline-gray-2 px-2.5 py-2 text-[13px] text-ink-gray-8 placeholder:text-ink-gray-4 focus:outline-none focus:ring-1 focus:ring-outline-blue-2"
            @keydown.enter.exact.prevent="onReply"
          />
          <button
            class="rounded-lg px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
            style="background: #1877f2"
            :disabled="busy || !reply.trim()"
            @click="onReply"
          >
            {{ __('Enviar') }}
          </button>
        </div>
        <div v-if="mode === 'private'" class="mt-1.5 text-[11px] text-ink-gray-5">
          {{ __('El DM abre una conversación de Messenger; aparecerá en la bandeja cuando respondan.') }}
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'frappe-ui'
import LucideFacebook from '~icons/lucide/facebook'
import { isMobile } from '@/composables/breakpoint'
import {
  comments,
  activeComment,
  mobileBack,
  replyComment,
  convertCommentToLead,
  hideComment,
  timeAgo,
} from '@/composables/inbox'

const router = useRouter()
const reply = ref('')
const mode = ref('public')
const busy = ref(false)

const c = computed(() => (comments.data || []).find((x) => x.name === activeComment.value) || null)

// reset the composer when switching comments
watch(activeComment, () => {
  reply.value = ''
  mode.value = 'public'
})

function statusLabel(s) {
  return (
    { New: __('Nuevo'), Replied: __('Respondido'), 'Lead Created': __('Lead'), Ignored: __('Ignorado'), Removed: __('Borrado') }[s] || s
  )
}
function statusChip(s) {
  const m = {
    New: ['#92400e', '#fef3c7'],
    Replied: ['#1e40af', '#dbeafe'],
    'Lead Created': ['#5b21b6', '#ede9fe'],
    Ignored: ['#374151', '#f3f4f6'],
    Removed: ['#7f1d1d', '#fee2e2'],
  }[s] || ['#374151', '#f3f4f6']
  return `color:${m[0]};background:${m[1]}`
}

async function onReply() {
  if (busy.value || !reply.value.trim()) return
  busy.value = true
  try {
    await replyComment(activeComment.value, reply.value.trim(), mode.value)
    reply.value = ''
    toast.success(__('Respuesta enviada'))
  } catch (e) {
    toast.error(e?.message || __('No se pudo enviar'))
  } finally {
    busy.value = false
  }
}
async function onConvert() {
  busy.value = true
  try {
    const lead = await convertCommentToLead(activeComment.value)
    toast.success(__('Lead creado') + ': ' + lead)
  } catch (e) {
    toast.error(e?.message || __('No se pudo crear el lead'))
  } finally {
    busy.value = false
  }
}
async function onHide() {
  busy.value = true
  try {
    await hideComment(activeComment.value, !c.value?.is_hidden)
  } catch (e) {
    toast.error(e?.message || __('No se pudo ocultar'))
  } finally {
    busy.value = false
  }
}
function openLead() {
  if (c.value?.lead) router.push({ name: 'Lead', params: { leadId: c.value.lead } })
}
</script>
