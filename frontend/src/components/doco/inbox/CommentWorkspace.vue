<!--
  Comentarios workspace — post-thread view (Meta-style). Shows the Facebook POST a
  comment group is on (via the reusable FbPostCard) and its comments below, with a
  sort (Relevantes / Recientes / Todos) + search + paginated "cargar más" so a post
  with hundreds of comments never floods the pane. Each comment is replyable
  (público / DM privado), convertible to a Lead, or hideable. Backend:
  doco_marketing.api.comments.get_post_comments / get_post_preview.
-->
<template>
  <div class="flex min-h-0 w-full flex-1 flex-col bg-surface-gray-1">
    <div v-if="!activeCommentPost" class="flex flex-1 items-center justify-center text-[13px] text-ink-gray-4">
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
              {{ post.comments ?? threadComments.length }} {{ (post.comments ?? threadComments.length) === 1 ? __('comentario') : __('comentarios') }}
            </div>
          </div>
        </div>
      </div>

      <div class="scb flex-1 overflow-y-auto px-4 py-4">
        <div class="mx-auto w-full max-w-2xl">
          <!-- the post (reusable FB card) -->
          <FbPostCard
            v-if="post.image || post.message || post.images?.length"
            class="mb-4"
            :page-name="post.page_name || __('Doco')"
            :page-avatar="post.page_avatar"
            :message="post.message"
            :images="post.images || (post.image ? [post.image] : [])"
            :time-label="fmtPostTime(post.created)"
            :reactions="post.reactions"
            :comments="post.comments"
            :shares="post.shares"
            :permalink="post.permalink"
          />
          <div v-else-if="postPreview.loading" class="mb-4 h-40 animate-pulse rounded-xl bg-surface-gray-2" />

          <!-- thread controls: sort + search -->
          <div class="mb-3 flex flex-wrap items-center gap-2">
            <div class="flex gap-1">
              <button
                v-for="s in sortOptions"
                :key="s.id"
                class="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                :class="sort === s.id ? 'bg-surface-blue-2 text-ink-blue-3' : 'bg-surface-gray-2 text-ink-gray-6 hover:bg-surface-gray-3'"
                @click="setSort(s.id)"
              >
                {{ s.label }}
              </button>
            </div>
            <div class="ml-auto flex min-w-[160px] flex-1 items-center gap-2 rounded-full border border-outline-gray-2 bg-surface-white px-2.5 py-1">
              <LucideSearch class="h-3.5 w-3.5 text-ink-gray-4" />
              <input
                v-model="search"
                :placeholder="__('Buscar en comentarios…')"
                class="w-full border-0 bg-transparent text-[12px] text-ink-gray-8 placeholder:text-ink-gray-4 focus:outline-none focus:ring-0"
              />
            </div>
          </div>

          <div v-if="loading && !threadComments.length" class="py-6 text-center text-[12px] text-ink-gray-4">{{ __('Cargando…') }}</div>
          <div v-else-if="threadError && !threadComments.length" class="py-6 text-center text-[12px] text-ink-red-3">
            {{ __('No se pudieron cargar los comentarios.') }}
            <button class="ml-1 font-semibold underline hover:text-ink-red-4" @click="fetchThread(true)">{{ __('Reintentar') }}</button>
          </div>
          <div v-else-if="!threadComments.length" class="py-6 text-center text-[12px] text-ink-gray-4">
            {{ search ? __('Sin resultados') : __('Sin comentarios') }}
          </div>

          <!-- comments -->
          <div v-for="cm in threadComments" :key="cm.name" class="mb-3 rounded-xl border border-outline-gray-1 bg-surface-white p-3">
            <div class="mb-1 flex items-center gap-2">
              <span class="truncate text-[13px] font-semibold text-ink-gray-9">{{ cm.from_name || __('Usuario de Facebook') }}</span>
              <span class="flex-none rounded px-1.5 py-px text-[9.5px] font-semibold" :style="statusChip(cm.status)">{{ statusLabel(cm.status) }}</span>
              <span class="ml-auto flex-none text-[10px] text-ink-gray-4">{{ timeAgo(cm.created_ts) }}</span>
            </div>
            <div class="text-[13px] text-ink-gray-8">{{ cm.message || __('(sin texto)') }}</div>

            <div v-if="cm.reply_text" class="mt-2 rounded-lg border border-outline-blue-1 bg-surface-blue-1 px-2.5 py-1.5 text-[12px] text-ink-gray-8">
              <div class="mb-0.5 text-[10px] font-semibold text-ink-blue-3">
                {{ cm.reply_by || __('Tú') }}<span v-if="cm.reply_at" class="font-normal text-ink-gray-5"> · {{ timeAgo(cm.reply_at) }}</span>
              </div>
              {{ cm.reply_text }}
            </div>

            <div class="mt-2 flex flex-wrap items-center gap-2 text-[11.5px]">
              <button class="font-semibold text-ink-blue-3 hover:underline" :disabled="busy" @click="toggleReply(cm.name, 'public')">{{ __('Responder') }}</button>
              <button v-if="!cm.dm_psid" class="font-semibold text-ink-blue-3 hover:underline" :disabled="busy" @click="toggleReply(cm.name, 'private')">{{ __('DM privado') }}</button>
              <button v-else class="font-semibold hover:underline" style="color: #0084ff" @click="openMessengerForPsid(cm.dm_psid)">💬 {{ __('Continuar en Messenger') }}</button>
              <button v-if="!cm.lead" class="font-semibold text-ink-violet-1 hover:underline" :disabled="busy" @click="onConvert(cm)">{{ __('Crear Lead') }}</button>
              <button v-else class="text-ink-violet-1 hover:underline" @click="openLead(cm.lead)">{{ cm.lead }}</button>
              <button class="text-ink-gray-5 hover:underline" :disabled="busy" @click="onHide(cm)">{{ cm.is_hidden ? __('Mostrar') : __('Ocultar') }}</button>
            </div>

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
                <div class="flex h-8 items-center">
                  <CannedReplyPicker channel="Comentarios" @pick="onCanned" />
                </div>
                <button class="rounded-lg px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50" style="background: #1877f2" :disabled="busy || !reply.trim()" @click="onReply(cm)">
                  {{ __('Enviar') }}
                </button>
              </div>
            </div>
          </div>

          <button
            v-if="hasMore"
            class="mb-2 w-full rounded-lg border border-outline-gray-2 py-2 text-[12px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2 disabled:opacity-50"
            :disabled="loading"
            @click="loadMore"
          >
            {{ loading ? __('Cargando…') : __('Cargar más comentarios') }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast, createResource } from 'frappe-ui'
import LucideFacebook from '~icons/lucide/facebook'
import LucideSearch from '~icons/lucide/search'
import { isMobile } from '@/composables/breakpoint'
import FbPostCard from '@/components/doco/social/FbPostCard.vue'
import CannedReplyPicker from '@/components/doco/inbox/CannedReplyPicker.vue'
import {
  activeCommentPost,
  mobileBack,
  replyComment,
  convertCommentToLead,
  hideComment,
  openMessengerForPsid,
  timeAgo,
} from '@/composables/inbox'

const router = useRouter()
const reply = ref('')
const mode = ref('public')
const busy = ref(false)
const replyingTo = ref(null)
const sort = ref('relevant')
const search = ref('')

const sortOptions = [
  { id: 'relevant', label: __('Relevantes') },
  { id: 'recent', label: __('Recientes') },
  { id: 'all', label: __('Todos') },
]

// post preview (FB card) — server-cached 5 min
const postPreview = createResource({ url: 'doco_marketing.api.comments.get_post_preview' })
const post = computed(() => postPreview.data || {})

// paginated thread
const LIMIT = 30
const postComments = createResource({ url: 'doco_marketing.api.comments.get_post_comments' })
const threadComments = ref([])
const hasMore = ref(false)
const loading = ref(false)
const threadError = ref(false)
const start = ref(0)

async function fetchThread(reset = true) {
  if (!activeCommentPost.value) {
    threadComments.value = []
    return
  }
  if (reset) start.value = 0
  loading.value = true
  try {
    const res = await postComments.submit({
      post_id: activeCommentPost.value,
      sort: sort.value,
      search: search.value || undefined,
      start: start.value,
      limit: LIMIT,
    })
    const rows = res?.comments || []
    threadComments.value = reset ? rows : [...threadComments.value, ...rows]
    hasMore.value = !!res?.has_more
    threadError.value = false
  } catch (e) {
    if (reset) threadComments.value = []
    threadError.value = true
  } finally {
    loading.value = false
  }
}
function loadMore() {
  start.value += LIMIT
  fetchThread(false)
}

// open a different post → reset everything + (re)load post + thread
watch(
  activeCommentPost,
  (pid) => {
    reply.value = ''
    replyingTo.value = null
    mode.value = 'public'
    sort.value = 'relevant'
    search.value = ''
    postPreview.data = null
    if (pid) postPreview.submit({ post_id: pid })
    fetchThread(true)
  },
  { immediate: true },
)
watch(sort, () => fetchThread(true))
let _t = null
watch(search, () => {
  clearTimeout(_t)
  _t = setTimeout(() => fetchThread(true), 300)
})

function setSort(s) {
  sort.value = s
}
function toggleReply(name, m) {
  if (replyingTo.value === name && mode.value === m) replyingTo.value = null
  else {
    replyingTo.value = name
    mode.value = m
    reply.value = ''
  }
}
function onCanned(body) {
  reply.value = reply.value.trim() ? reply.value + '\n' + body : body
}
function fmtPostTime(ts) {
  if (!ts) return ''
  try {
    return new Date(String(ts).replace(' ', 'T')).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return String(ts).slice(0, 10)
  }
}
function statusLabel(s) {
  return { New: __('Nuevo'), Replied: __('Respondido'), 'Lead Created': __('Lead'), Ignored: __('Ignorado'), Removed: __('Borrado') }[s] || s
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
    const m = mode.value
    const res = await replyComment(cm.name, reply.value.trim(), m)
    reply.value = ''
    replyingTo.value = null
    await fetchThread(true)
    if (m === 'private' && res?.already_replied) {
      toast.success(__('Ya respondiste en privado · abriendo Messenger'))
      openMessengerForPsid(res.dm_psid || cm.dm_psid)
    } else {
      toast.success(m === 'private' ? __('Mensaje privado enviado') : __('Respuesta enviada'))
    }
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
    await fetchThread(true)
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
    await fetchThread(true)
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
