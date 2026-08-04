<!--
  SocialComposer — the create/edit post dialog (W6 B0 extract from SocialCalendar.vue;
  W6 B3 upgrades). Owns the form, per-channel captions, first-comment, live FB preview,
  publish-outcome surfacing and the save/schedule/publish/approve/reject/cancel/regenerate
  actions. Three composer/ sub-components carry the heavier pieces: MediaEditor (photo
  tiles + reorder + upload + alt text), VariantsPanel (manager AI caption variants) and
  SuggestTimeButton (best-time picker). The page opens it imperatively via the exposed
  openNew(day) / openEdit(post); it emits `reload` when a mutation should refresh the
  calendar. Read-layer data (shops, channels) comes in as props.
-->
<template>
  <template v-if="showComposer">
    <div class="fixed inset-0 z-[300] bg-black/30 dark:bg-black/60" @click="showComposer = false" />
    <div class="fixed left-1/2 top-1/2 z-[310] w-[92vw] max-w-[560px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[14px] border border-outline-gray-2 bg-surface-base shadow-xl">
      <div class="flex items-center justify-between border-b border-outline-gray-1 px-4 py-3">
        <span class="text-[14px] font-bold text-ink-gray-9">{{ form.name ? __('Editar publicación') : __('Nueva publicación') }}</span>
        <span v-if="form.status" class="rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="chip(form.status)">{{ form.status }}</span>
      </div>

      <!-- publish outcome: live FB/IG post link(s) · scheduled-in-Meta badge · failure reason -->
      <div v-if="liveLinks.length || scheduledMeta.length || failedChannels.length" class="flex flex-col gap-1.5 border-b border-outline-gray-1 bg-surface-gray-1 px-4 py-2.5">
        <a
          v-for="c in liveLinks" :key="'live-' + c.channel"
          :href="c.permalink" target="_blank" rel="noopener"
          class="flex items-center gap-2 rounded-md bg-surface-green-2 px-2.5 py-1.5 text-[12px] font-semibold text-ink-green-7 hover:brightness-95"
        >
          <span>{{ c.channel.startsWith('IG') ? '🟪' : '🟦' }}</span>
          <span>{{ __('Publicado') }} · {{ c.channel }}</span>
          <span class="ml-auto underline">{{ chLabel(c.channel) }} ↗</span>
        </a>
        <div
          v-for="c in scheduledMeta" :key="'sch-' + c.channel"
          class="flex items-center gap-2 rounded-md bg-surface-blue-2 px-2.5 py-1.5 text-[12px] font-semibold text-ink-blue-7"
        >
          <span>{{ c.channel.startsWith('IG') ? '🟪' : '🟦' }}</span>
          <span>{{ __('Programado en Meta') }} · {{ c.channel }}</span>
          <span class="ml-auto text-[11px] font-normal text-ink-gray-6">{{ __('el enlace aparece al publicarse') }}</span>
        </div>
        <div
          v-for="c in failedChannels" :key="'fail-' + c.channel"
          class="rounded-md bg-surface-red-1 px-2.5 py-1.5 text-[11.5px] text-ink-red-7"
        >
          <span class="font-semibold">{{ c.channel }} · {{ __('Falló') }}:</span> {{ c.error }}
        </div>
      </div>

      <div class="max-h-[68vh] overflow-y-auto p-4">
        <!-- approval hint: an AI/pending draft only publishes once approved; unapproved → auto-cancel at slot -->
        <div v-if="isPending" class="mb-3 flex items-start gap-2 rounded-md bg-surface-amber-1 px-2.5 py-2 text-[11.5px] text-ink-amber-7 dark:bg-amber-300/10 dark:text-amber-200">
          <span class="flex-none">⏳</span>
          <span>{{ __('Requiere aprobación. Pulsa «Aprobar» para publicarla. Si nadie la aprueba antes de la hora programada, se cancela automáticamente.') }}</span>
        </div>

        <label class="mb-1 block text-[11px] font-semibold text-ink-gray-6">{{ __('Título') }}</label>
        <input v-model="form.title" type="text" class="fld mb-3 w-full rounded-md border border-outline-gray-2 px-2 py-1.5 text-[13px]" :placeholder="__('Interno')" />

        <label class="mb-1 block text-[11px] font-semibold text-ink-gray-6">{{ __('Sucursal') }}</label>
        <select v-if="isManager" v-model="form.shop" :disabled="!!form.name" class="fld mb-3 w-full rounded-md border border-outline-gray-2 px-2 py-1.5 text-[13px] disabled:opacity-60">
          <option v-for="s in shopOptions" :key="s.name" :value="s.name">{{ s.shop_name }}</option>
        </select>
        <div v-else class="mb-3 rounded-md bg-surface-gray-1 px-2 py-1.5 text-[12.5px] text-ink-gray-7">{{ shopLabel(form.shop) || '—' }}</div>

        <label class="mb-1 block text-[11px] font-semibold text-ink-gray-6">{{ __('Canales') }}</label>
        <div class="mb-1.5 flex flex-wrap gap-1.5">
          <button
            v-for="c in channels" :key="c" type="button"
            class="rounded-md border px-2.5 py-1 text-[12px] font-medium"
            :class="form.channels.includes(c) ? 'border-green-500 dark:border-green-400 bg-surface-green-2 text-ink-green-7' : 'border-outline-gray-2 text-ink-gray-6'"
            @click="toggleChannel(c)"
          >{{ c }}</button>
        </div>
        <!-- IG publishing rides Meta's App Review; those channels Skip harmlessly until it clears -->
        <p v-if="hasIg" class="mb-3 flex items-start gap-1.5 rounded-md bg-surface-amber-1 px-2 py-1.5 text-[10.5px] text-ink-amber-7 dark:bg-amber-300/10 dark:text-amber-200">
          <span class="flex-none">ℹ️</span>
          <span>{{ __('Instagram se activa tras la aprobación de Meta; por ahora esos canales se omiten sin afectar la publicación.') }}</span>
        </p>

        <label class="mb-1 block text-[11px] font-semibold text-ink-gray-6">{{ __('Texto por canal') }}</label>
        <div v-if="!form.channels.length" class="mb-3 text-[11px] text-ink-gray-4">{{ __('Selecciona un canal arriba.') }}</div>
        <div v-for="c in form.channels" :key="c" class="mb-2">
          <span class="text-[10px] font-mono text-ink-gray-5">{{ c }}</span>
          <textarea v-model="form.captions[c]" rows="2" class="fld w-full rounded-md border border-outline-gray-2 px-2 py-1.5 text-[13px]" :placeholder="__('Caption…')" />
          <p v-if="c === 'IG Story'" class="mt-0.5 text-[10px] text-ink-gray-4">{{ __('IG Story: sin caption ni enlace (el enlace va en la bio).') }}</p>
          <p v-else-if="c === 'IG Reel'" class="mt-0.5 text-[10px] text-ink-gray-4">{{ __('IG Reel: requiere video.') }}</p>
        </div>

        <!-- Variantes IA (managers) — AI caption options at a chosen tone + length -->
        <VariantsPanel v-if="isManager" :post-name="form.name" class="mb-3" @applied="applyVariant" />

        <!-- S8 media — photo tiles (add/remove/reorder) + per-photo alt text -->
        <MediaEditor :media="form.media" :can-cancel="canCancel" />

        <!-- owner feedback → AI rewrites the caption (same items/voice/facts) -->
        <div v-if="form.name && canCancel" class="mb-3 rounded-md border border-outline-gray-2 bg-surface-gray-1 p-2">
          <label class="mb-1 block text-[11px] font-semibold text-ink-gray-6">{{ __('Feedback para la IA') }}</label>
          <div class="flex items-start gap-2">
            <textarea v-model="aiFeedback" rows="2" class="fld w-full rounded-md border border-outline-gray-2 px-2 py-1.5 text-[12.5px]" :placeholder="__('ej. más corto, menciona la garantía, sin emojis, tono más formal…')" />
            <button class="shrink-0 rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12px] font-semibold text-ink-gray-7 disabled:opacity-50" :disabled="busy || !aiFeedback.trim()" @click="regeneratePost">{{ busy ? __('…') : __('↻ Regenerar') }}</button>
          </div>
          <p class="mt-1 text-[10.5px] text-ink-gray-4">{{ __('Reescribe el texto con tus indicaciones y re-adjunta fotos de los artículos si ya tienen.') }}</p>
        </div>

        <div class="mb-3 grid grid-cols-2 gap-3">
          <div>
            <div class="mb-1 flex items-center justify-between gap-2">
              <label class="text-[11px] font-semibold text-ink-gray-6">{{ __('Programar') }}</label>
              <SuggestTimeButton :shop="form.shop" @pick="pickSuggestedTime" />
            </div>
            <input v-model="form.scheduled_time" type="datetime-local" class="fld w-full rounded-md border border-outline-gray-2 px-2 py-1.5 text-[12.5px]" />
          </div>
          <div>
            <label class="mb-1 block text-[11px] font-semibold text-ink-gray-6">{{ __('CTA') }}</label>
            <select v-model="form.cta_type" class="fld w-full rounded-md border border-outline-gray-2 px-2 py-1.5 text-[12.5px]">
              <option value="WhatsApp">WhatsApp</option>
              <option value="Webshop">Webshop</option>
              <option value="None">{{ __('Ninguno') }}</option>
            </select>
          </div>
        </div>
        <input v-if="form.cta_type !== 'None'" v-model="form.cta_link" type="text" class="fld mb-2 w-full rounded-md border border-outline-gray-2 px-2 py-1.5 text-[12.5px]" :placeholder="__('Enlace CTA (wa.me / storefront)')" />
        <p class="mb-3 text-[11px] text-ink-gray-4">{{ __('IG feed/Reels = aviso; enlace por bio. FB lleva enlace clicable.') }}</p>

        <!-- primer comentario: hashtags/enlaces sin ensuciar el texto principal; se publica tras publicar -->
        <label class="mb-1 block text-[11px] font-semibold text-ink-gray-6">{{ __('Primer comentario') }}</label>
        <textarea
          v-model="form.first_comment" rows="2" data-testid="first-comment-input"
          class="fld w-full rounded-md border border-outline-gray-2 px-2 py-1.5 text-[12.5px]"
          :placeholder="__('Hashtags y enlaces van aquí — se publica como primer comentario, sin ensuciar el texto principal.')"
        />
        <p class="text-[10.5px] text-ink-gray-4">{{ __('Se publica automáticamente después de publicar (FB e IG).') }}</p>

        <!-- live preview — how the post will look on Facebook -->
        <div class="mt-4 border-t border-outline-gray-1 pt-3">
          <div class="mb-2 text-[11px] font-semibold text-ink-gray-6">{{ __('Vista previa (Facebook)') }}</div>
          <FbPostCard
            :page-name="previewPost.pageName"
            :message="previewPost.message"
            :images="previewPost.images"
            :time-label="previewPost.timeLabel"
            :cta="previewPost.cta"
            :permalink="previewPost.permalink"
            show-actions
          />
          <p v-if="!previewPost.message && !previewPost.images.length" class="mt-1.5 text-[11px] text-ink-gray-4">
            {{ __('Escribe el texto del canal FB para ver la vista previa.') }}
          </p>
        </div>
      </div>
      <div v-if="form.name && !canCancel" class="border-t border-outline-gray-1 px-4 pt-2 text-[11px] text-ink-gray-5">
        {{ __('Publicación en vivo o cancelada — solo lectura. Despublica desde la cola si hace falta.') }}
      </div>
      <div class="flex flex-wrap items-center justify-end gap-2 border-t border-outline-gray-1 px-4 py-3">
        <button v-if="form.name && canCancel" class="mr-auto rounded-lg px-3 py-1.5 text-[12px] font-semibold text-ink-red-7 hover:bg-surface-red-1" :disabled="busy" @click="cancelPost">{{ __('Cancelar publicación') }}</button>
        <button v-if="isPending" class="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white" style="background:#2563eb" :disabled="busy" @click="approvePost">{{ __('Aprobar') }}</button>
        <button v-if="isPending" class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12px] font-semibold text-ink-red-7" :disabled="busy" @click="rejectPost">{{ __('Rechazar') }}</button>
        <button class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12px] font-semibold text-ink-gray-7 disabled:opacity-50" :disabled="busy || !canCancel" @click="save('Draft')">{{ __('Guardar borrador') }}</button>
        <button class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12px] font-semibold text-ink-gray-7 disabled:opacity-50" :disabled="busy || !canCancel" @click="save('Scheduled')">{{ __('Programar') }}</button>
        <button class="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50" style="background:var(--brand)" :disabled="busy || !canCancel" @click="publishNow">{{ busy ? __('…') : __('Publicar ahora') }}</button>
      </div>
    </div>
  </template>
</template>

<script setup>
import { ref, computed } from 'vue'
import { call as frappeCall, toast } from 'frappe-ui'
import { inputDialog } from '@/utils/dialogs'
import FbPostCard from '@/components/doco/social/FbPostCard.vue'
import VariantsPanel from '@/components/doco/social/composer/VariantsPanel.vue'
import SuggestTimeButton from '@/components/doco/social/composer/SuggestTimeButton.vue'
import MediaEditor from '@/components/doco/social/composer/MediaEditor.vue'
import { chip, chLabel, toDtLocal, fromDtLocal, blankForm } from '@/composables/socialCalendar'

const props = defineProps({
  shop: { type: String, default: '' },
  shopOptions: { type: Array, default: () => [] },
  isManager: { type: Boolean, default: false },
  channels: { type: Array, default: () => [] },
})
const emit = defineEmits(['reload'])

const shopLabel = (name) => props.shopOptions.find((s) => s.name === name)?.shop_name || name

// ── composer ───────────────────────────────────────────────────────────────
const showComposer = ref(false)
const busy = ref(false)
const aiFeedback = ref('')
const form = ref(blankForm())
// live FB preview for the composer (FbPostCard) — bound to the FB caption + CTA + schedule
const previewPost = computed(() => {
  const caps = form.value.captions || {}
  const msg = caps['FB Feed'] || caps['FB Reel'] || Object.values(caps).find(Boolean) || ''
  const cta =
    form.value.cta_type && form.value.cta_type !== 'None'
      ? { label: form.value.cta_link || '', button: form.value.cta_type === 'WhatsApp' ? 'WhatsApp' : __('Ver más') }
      : null
  let timeLabel = __('Borrador')
  if (form.value.status === 'Published') {
    timeLabel = __('Publicado')
  } else if (form.value.scheduled_time) {
    try {
      timeLabel = __('Programado') + ' · ' + new Date(form.value.scheduled_time).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    } catch {
      timeLabel = String(form.value.scheduled_time)
    }
  }
  return {
    pageName: shopLabel(form.value.shop) || __('Tu página'),
    message: msg,
    images: (form.value.media || []).filter((m) => (m.media_type || 'Image') === 'Image').map((m) => m.media_file),
    timeLabel,
    cta,
    // published → the preview card itself becomes a clickable link to the live post
    permalink: primaryPermalink.value,
  }
})
const canCancel = computed(() => !['Published', 'Partially Published', 'Cancelado'].includes(form.value.status))
const isPending = computed(() => !!form.value.name && form.value.status === 'Pending Approval')
// any IG channel selected → show the App-Review notice + IG media-type hints
const hasIg = computed(() => (form.value.channels || []).some((c) => c.startsWith('IG')))

// ── AI variants + suggested time ───────────────────────────────────────────────
// pick_variant already wrote the chosen caption onto every non-published channel row
// server-side; mirror it into the local per-channel captions so the preview matches.
function applyVariant({ caption, channels }) {
  const chs = channels && channels.length ? channels : form.value.channels
  for (const ch of chs) form.value.captions[ch] = caption
  const n = chs.length
  toast.success(__('Variante aplicada') + ` (${n} ${n === 1 ? __('canal') : __('canales')})`)
}
function pickSuggestedTime(dtLocal) {
  if (!dtLocal) return
  form.value.scheduled_time = dtLocal
  toast.success(__('Hora sugerida aplicada'))
}

// ── publish outcome surfacing (S13) ───────────────────────────────────────────
// A live channel carries a permalink → link straight to the FB/IG post. A natively-
// scheduled channel is handed to Meta but not public yet (link would 404) → info
// badge, no link. A failed channel shows WHY instead of silently vanishing.
const liveLinks = computed(() =>
  (form.value.channelStates || []).filter((c) => c.status === 'Published' && c.permalink),
)
const scheduledMeta = computed(() =>
  (form.value.channelStates || []).filter((c) => c.status === 'Scheduled' && c.native_scheduled),
)
const failedChannels = computed(() =>
  (form.value.channelStates || []).filter((c) => c.status === 'Failed' && c.error),
)
// FB post to hang off the preview card (prefer an FB channel, else any live one)
const primaryPermalink = computed(
  () => liveLinks.value.find((c) => c.channel.startsWith('FB'))?.permalink || liveLinks.value[0]?.permalink || '',
)

async function approvePost() {
  busy.value = true
  try {
    await frappeCall('doco_marketing.api.social.approve', { name: form.value.name })
    toast.success(__('Aprobado y programado'))
    showComposer.value = false
    emit('reload')
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo aprobar'))
  } finally {
    busy.value = false
  }
}

function rejectPost() {
  inputDialog({
    title: __('Rechazar publicación'),
    message: __('Motivo del rechazo (opcional):'),
    type: 'textarea',
    placeholder: __('Motivo…'),
    confirmLabel: __('Rechazar'),
    theme: 'red',
    onConfirm: async (reason) => {
      busy.value = true
      try {
        await frappeCall('doco_marketing.api.social.reject', { name: form.value.name, reason })
        toast.success(__('Rechazado'))
        showComposer.value = false
        emit('reload')
      } catch (e) {
        toast.error(e?.messages?.[0] || __('No se pudo rechazar'))
      } finally {
        busy.value = false
      }
    },
  })
}

function openNew(day) {
  form.value = blankForm()
  form.value.first_comment = '' // not in blankForm (shared, B1-owned) — seed the key here
  // default the new post's branch to the toolbar selection, else the user's first shop
  form.value.shop = props.shop || props.shopOptions[0]?.name || ''
  if (day) form.value.scheduled_time = `${day.key}T10:00`
  showComposer.value = true
}

// keep channel-targeting rows (Desk-only feature) + alt text so a round-trip doesn't wipe them
const mapMedia = (doc) => (doc.media || []).map((m) => ({
  media_file: m.media_file,
  media_type: m.media_type || 'Image',
  alt_text: m.alt_text || '',
  channels: (m.channels || []).map((t) => ({ social_channel: t.social_channel })),
}))

async function openEdit(p) {
  aiFeedback.value = ''
  const doc = await frappeCall('doco_marketing.api.social.get_post', { name: p.name })
  const caps = {}
  for (const c of doc.channels || []) caps[c.channel] = c.caption || ''
  form.value = {
    name: doc.name,
    title: doc.title || '',
    shop: doc.shop || '',
    channels: (doc.channels || []).map((c) => c.channel),
    captions: caps,
    media: mapMedia(doc),
    scheduled_time: toDtLocal(doc.scheduled_time),
    cta_type: doc.cta_type || 'WhatsApp',
    cta_link: doc.cta_link || '',
    first_comment: doc.first_comment || '',
    status: doc.status,
    // per-channel publish state (permalink/status/error) so the composer can link
    // the live FB post + surface a failure instead of hiding the outcome.
    channelStates: (doc.channels || []).map((c) => ({
      channel: c.channel,
      status: c.status,
      permalink: c.permalink || '',
      meta_post_id: c.meta_post_id || '',
      error: c.error || '',
      native_scheduled: c.native_scheduled,
    })),
  }
  showComposer.value = true
}

function toggleChannel(c) {
  const i = form.value.channels.indexOf(c)
  if (i >= 0) {
    form.value.channels.splice(i, 1)
  } else {
    form.value.channels.push(c)
    if (!(c in form.value.captions)) form.value.captions[c] = ''
  }
}

function payload(status) {
  return {
    name: form.value.name || undefined,
    title: form.value.title,
    shop: form.value.shop || undefined,
    status,
    source: 'Manual',
    scheduled_time: fromDtLocal(form.value.scheduled_time),
    cta_type: form.value.cta_type,
    cta_link: form.value.cta_type === 'None' ? '' : form.value.cta_link,
    first_comment: form.value.first_comment || '',
    channels: form.value.channels.map((c) => ({ channel: c, caption: form.value.captions[c] || '' })),
    media: form.value.media.map((m, i) => ({ media_file: m.media_file, seq: i, alt_text: m.alt_text || '', channels: m.channels || [] })),
  }
}

async function save(status) {
  if (status === 'Scheduled' && (!form.value.scheduled_time || !form.value.channels.length)) {
    toast.error(__('Programar requiere fecha/hora y al menos un canal.'))
    return
  }
  busy.value = true
  try {
    const r = await frappeCall('doco_marketing.api.social.save_post', { payload: JSON.stringify(payload(status)) })
    form.value.name = r.name
    form.value.status = r.status
    toast.success(__('Guardado'))
    showComposer.value = false
    emit('reload')
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo guardar'))
  } finally {
    busy.value = false
  }
}

async function regeneratePost() {
  if (!form.value.name || !aiFeedback.value.trim()) return
  busy.value = true
  try {
    const r = await frappeCall('doco_marketing.api.social.regenerate', {
      name: form.value.name,
      feedback: aiFeedback.value.trim(),
    })
    for (const c of Object.keys(form.value.captions)) form.value.captions[c] = r.caption
    // regenerate may swap items server-side and re-attach their photos — refetch
    // media so a later save doesn't clobber the server's rows with a stale list.
    const doc = await frappeCall('doco_marketing.api.social.get_post', { name: form.value.name })
    form.value.media = mapMedia(doc)
    aiFeedback.value = ''
    toast.success(__('Borrador regenerado'))
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo regenerar'))
  } finally {
    busy.value = false
  }
}

async function publishNow() {
  if (!form.value.channels.length) {
    toast.error(__('Selecciona al menos un canal.'))
    return
  }
  busy.value = true
  try {
    // "Publicar ahora" = immediate: save WITHOUT a future schedule so the publisher
    // posts now instead of native-scheduling the date field for later.
    const r = await frappeCall('doco_marketing.api.social.save_post', { payload: JSON.stringify({ ...payload('Draft'), scheduled_time: null }) })
    await frappeCall('doco_marketing.services.social.publish.publish_now', { name: r.name })
    toast.success(__('Publicación enviada'))
    showComposer.value = false
  } catch (e) {
    toast.error(e?.messages?.[0] || __('Falló la publicación'))
  } finally {
    busy.value = false
    emit('reload') // reload regardless — the post may have persisted even on publish error
  }
}

async function cancelPost() {
  busy.value = true
  try {
    await frappeCall('doco_marketing.api.social.cancel', { name: form.value.name })
    toast.success(__('Cancelado'))
    showComposer.value = false
    emit('reload')
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo cancelar'))
  } finally {
    busy.value = false
  }
}

defineExpose({ openNew, openEdit })
</script>
