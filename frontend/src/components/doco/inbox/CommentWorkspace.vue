<!--
  Comentarios workspace — post-thread view (Meta-style). Shows the Facebook POST a
  comment group is on (image + caption + counts) and ALL its comments below; each
  comment can be replied to (public or private DM), converted to a CRM Lead, or
  hidden on FB. Backend: doco_marketing.api.comments.
-->
<template>
  <div class="flex min-h-0 w-full flex-1 flex-col bg-surface-gray-1">
    <div v-if="!groupComments.length" class="flex flex-1 items-center justify-center text-[13px] text-ink-gray-4">
      {{ __('Selecciona una publicación') }}
    </div>
    <template v-else>
      <!-- header -->
      <div class="flex-none border-b border-outline-gray-1 bg-surface-white px-4 py-3">
        <div class="mx-auto flex w-full max-w-2xl items-center gap-2.5">
          <button v-if="isMobile" class="text-ink-gray-5 hover:text-ink-gray-9" :aria-label="__('Atrás')" @click="mobileBack">←</button>
          <span class="flex h-9 w-9 flex-none items-center justify-center rounded-full text-white" style="background: #1877f2">
            <LucideFacebook class="h-4.5 w-4.5" />
          </span>
          <div class="min-w-0 flex-1">
            <div class="truncate text-[14px] font-bold text-ink-gray-9">{{ __('Publicación de Facebook') }}</div>
            <div class="text-[11px] text-ink-gray-5">
              {{ groupComments.length }} {{ groupComments.length === 1 ? __('comentario') : __('comentarios') }}
            </div>
          </div>
        </div>
      </div>

      <!-- scroll body: post card + comment thread (centered column on desktop) -->
      <div class="scb flex-1 overflow-y-auto px-4 py-4">
        <div class="mx-auto w-full max-w-2xl">
        <!-- quick post view -->
        <a
          v-if="post.image || post.message"
          :href="post.permalink"
          target="_blank"
          rel="noopener"
          class="mb-4 block overflow-hidden rounded-xl border border-outline-gray-1 bg-surface-white hover:bg-surface-gray-1"
        >
          <img v-if="post.image" :src="post.image" class="max-h-56 w-full object-cover" :alt="__('publicación')" />
          <div class="p-3">
            <div v-if="post.message" class="line-clamp-2 text-[12.5px] text-ink-gray-8">{{ post.message }}</div>
            <div class="mt-1.5 flex items-center gap-3 text-[11px] text-ink-gray-5">
              <span>👍 {{ post.reactions ?? 0 }}</span>
              <span>💬 {{ post.comments ?? 0 }}</span>
              <span>↗ {{ post.shares ?? 0 }}</span>
              <span class="ml-auto font-semibold text-ink-blue-3">{{ __('ver en Facebook') }}</span>
            </div>
          </div>
        </a>
        <div v-else-if="postPreview.loading" class="mb-4 h-28 animate-pulse rounded-xl bg-surface-gray-2" />

        <!-- comments on this post -->
        <div
          v-for="cm in groupComments"
          :key="cm.name"
          class="mb-3 rounded-xl border border-outline-gray-1 bg-surface-white p-3"
        >
          <div class="mb-1 flex items-center gap-2">
            <span class="truncate text-[13px] font-semibold text-ink-gray-9">{{ cm.from_name || __('Usuario de Facebook') }}</span>
            <span class="flex-none rounded px-1.5 py-px text-[9.5px] font-semibold" :style="statusChip(cm.status)">{{ statusLabel(cm.status) }}</span>
            <span class="ml-auto flex-none text-[10px] text-ink-gray-4">{{ timeAgo(cm.created_ts) }}</span>
          </div>
          <div class="text-[13px] text-ink-gray-8">{{ cm.message || __('(sin texto)') }}</div>

          <div v-if="cm.reply_text" class="mt-2 rounded-lg border border-outline-blue-1 bg-surface-blue-1 px-2.5 py-1.5 text-[12px] text-ink-gray-8">
            <span class="font-semibold text-ink-blue-3">{{ __('Tú') }}:</span> {{ cm.reply_text }}
          </div>

          <!-- per-comment actions -->
          <div class="mt-2 flex flex-wrap items-center gap-2 text-[11.5px]">
            <button class="font-semibold text-ink-blue-3 hover:underline" :disabled="busy" @click="toggleReply(cm.name, 'public')">{{ __('Responder') }}</button>
            <button class="font-semibold text-ink-blue-3 hover:underline" :disabled="busy" @click="toggleReply(cm.name, 'private')">{{ __('DM privado') }}</button>
            <button v-if="!cm.lead" class="font-semibold text-ink-violet-1 hover:underline" :disabled="busy" @click="onConvert(cm)">{{ __('Crear Lead') }}</button>
            <button v-else class="text-ink-violet-1 hover:underline" @click="openLead(cm.lead)">{{ cm.lead }}</button>
            <button class="text-ink-gray-5 hover:underline" :disabled="busy" @click="onHide(cm)">{{ cm.is_hidden ? __('Mostrar') : __('Ocultar') }}</button>
          </div>

          <!-- inline reply composer (this comment) -->
          <div v-if="replyingTo === cm.name" class="mt-2">
            <div class="mb-1 text-[10px] font-semibold" :class="mode === 'private' ? 'text-ink-blue-3' : 'text-ink-gray-5'">
              {{ mode === 'private' ? __('Mensaje privado al autor') : __('Respuesta pública') }}
            </div>
            <div class="flex items-end gap-2">
              <textarea
                v-model="reply"
                rows="2"
                :placeholder="mode === 'private' ? __('Responder por DM…') : __('Responder en el comentario…')"
                class="scb flex-1 resize-none rounded-lg border border-outline-gray-2 px-2.5 py-2 text-[13px] text-ink-gray-8 placeholder:text-ink-gray-4 focus:outline-none focus:ring-1 focus:ring-outline-blue-2"
                @keydown.enter.exact.prevent="onReply(cm)"
              />
              <button
                class="rounded-lg px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                style="background: #1877f2"
                :disabled="busy || !reply.trim()"
                @click="onReply(cm)"
              >
                {{ __('Enviar') }}
              </button>
            </div>
            <div v-if="mode === 'private'" class="mt-1 text-[11px] text-ink-gray-5">
              {{ __('El DM abre una conversación de Messenger; aparece en la bandeja cuando respondan.') }}
            </div>
          </div>
        </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast, createResource } from 'frappe-ui'
import LucideFacebook from '~icons/lucide/facebook'
import { isMobile } from '@/composables/breakpoint'
import {
  comments,
  activeCommentPost,
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
const replyingTo = ref(null) // comment name whose inline composer is open

// all comments on the open post
const groupComments = computed(() =>
  (comments.data || []).filter((x) => (x.post_id || x.name) === activeCommentPost.value),
)

// quick post view — fetched once per post (server-cached 5 min)
const postPreview = createResource({ url: 'doco_marketing.api.comments.get_post_preview' })
const post = computed(() => postPreview.data || {})

watch(
  activeCommentPost,
  (pid) => {
    reply.value = ''
    replyingTo.value = null
    mode.value = 'public'
    postPreview.data = null
    if (pid) postPreview.submit({ post_id: pid })
  },
  { immediate: true },
)

function toggleReply(name, m) {
  if (replyingTo.value === name && mode.value === m) {
    replyingTo.value = null
  } else {
    replyingTo.value = name
    mode.value = m
    reply.value = ''
  }
}
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

async function onReply(cm) {
  if (busy.value || !reply.value.trim()) return
  busy.value = true
  try {
    await replyComment(cm.name, reply.value.trim(), mode.value)
    reply.value = ''
    replyingTo.value = null
    toast.success(__('Respuesta enviada'))
  } catch (e) {
    toast.error(e?.messages?.[0] || e?.message || __('No se pudo enviar'))
  } finally {
    busy.value = false
  }
}
async function onConvert(cm) {
  busy.value = true
  try {
    const lead = await convertCommentToLead(cm.name)
    toast.success(__('Lead creado') + ': ' + lead)
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo crear el lead'))
  } finally {
    busy.value = false
  }
}
async function onHide(cm) {
  busy.value = true
  try {
    await hideComment(cm.name, !cm.is_hidden)
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo ocultar'))
  } finally {
    busy.value = false
  }
}
function openLead(lead) {
  if (lead) router.push({ name: 'Lead', params: { leadId: lead } })
}
</script>
