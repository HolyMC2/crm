<!--
  Menciones (W6 C3 SPA — Marco's top ask: "la gente nos @menciona cuando quiere un
  producto"). A triage inbox over the Social Mention doctype: comments/captions/stories
  that @'d us on IG + FB tagged posts land here. A manager/marketer can suggest a reply
  (AI/template), edit it, and publish it as a PUBLIC comment (human-gated, MA-1 — nothing
  auto-sends), or discard. Data: doco_marketing.services.social.mentions.* + api.social.get_shops.

  Self-contained (no import from composables/socialCalendar.js — under concurrent sibling
  edit this wave). Colours use frappe-ui semantic tokens (surface/ink/outline), which are
  theme-aware: light + dark are handled by the token system, not hand-written dark: pairs
  (same convention as SocialCalendar.vue / SocialEvergreen.vue).
-->
<template>
  <div
    data-testid="mentions-page"
    class="flex min-h-0 w-full flex-1 flex-col overflow-y-auto bg-surface-gray-2"
  >
    <!-- toolbar -->
    <div class="flex min-h-[52px] flex-none flex-wrap items-center justify-between gap-2 border-b border-outline-gray-1 bg-surface-base px-5 py-2">
      <div class="flex items-center gap-3">
        <span class="text-[15px] font-bold text-ink-gray-9">💬 {{ __('Menciones') }}</span>
        <select
          v-if="isManager || shopOptions.length > 1"
          v-model="shop"
          @change="reloadAll"
          class="rounded-lg border border-outline-gray-2 bg-surface-base px-2 py-1 text-[12px] font-semibold text-ink-gray-7"
          :title="__('Filtrar por sucursal')"
        >
          <option v-if="isManager" value="">{{ __('Todas las sucursales') }}</option>
          <option v-for="s in shopOptions" :key="s.name" :value="s.name">{{ s.shop_name }}</option>
        </select>
      </div>
      <router-link
        to="/social"
        class="text-[12px] font-semibold text-ink-blue-7 hover:underline"
        :title="__('Ir al calendario social')"
      >
        {{ __('Ir al calendario →') }}
      </router-link>
    </div>

    <!-- status filter chips -->
    <div class="flex flex-none flex-wrap items-center gap-2 border-b border-outline-gray-1 bg-surface-base px-5 py-2">
      <button
        v-for="f in FILTERS"
        :key="f.v"
        :data-testid="`mentions-filter-${f.v || 'todas'}`"
        class="flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold"
        :class="statusFilter === f.v ? 'bg-surface-gray-10 text-ink-base' : 'bg-surface-gray-2 text-ink-gray-7 hover:bg-surface-gray-3'"
        @click="setFilter(f.v)"
      >
        {{ __(f.label) }}
        <span
          v-if="f.v === 'Nuevo' && nuevoCount"
          class="rounded-full bg-surface-red-7 px-1.5 text-[10px] font-bold text-ink-red-1"
        >{{ nuevoCount }}</span>
      </button>
    </div>

    <div class="flex-1 p-4">
      <!-- loading -->
      <div v-if="mentionsRes.loading && !rows.length" class="py-16 text-center text-[13px] text-ink-gray-5">
        {{ __('Cargando…') }}
      </div>

      <!-- empty -->
      <div
        v-else-if="!rows.length"
        class="mx-auto mt-10 max-w-[520px] rounded-2xl border border-dashed border-outline-gray-2 bg-surface-base px-6 py-10 text-center"
      >
        <div class="text-[34px]">💬</div>
        <div class="mt-2 text-[15px] font-bold text-ink-gray-8">{{ __('Sin menciones por aquí') }}</div>
        <p class="mx-auto mt-2 max-w-[440px] text-[12.5px] leading-relaxed text-ink-gray-6">
          {{ __('Cuando alguien te etiquete o @mencione en un comentario, una publicación o una historia de Instagram/Facebook, aparecerá aquí automáticamente. La captación en vivo está pendiente de activación en Meta.') }}
        </p>
      </div>

      <!-- list -->
      <div v-else class="mx-auto flex max-w-[820px] flex-col gap-2.5">
        <div
          v-for="(row, i) in rows"
          :key="row.name"
          :data-testid="`mention-card-${i}`"
          class="rounded-xl border border-outline-gray-2 bg-surface-base px-4 py-3"
        >
          <!-- head: type + author + time -->
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-full bg-surface-gray-2 px-2 py-0.5 text-[10.5px] font-semibold text-ink-gray-7">
              {{ TYPE_EMOJI[row.mention_type] || '' }} {{ typeLabel(row.mention_type) }}
            </span>
            <span class="text-[13.5px] font-semibold text-ink-gray-9">{{ authorLabel(row.author_username) }}</span>
            <span v-if="row.rating" class="text-[12px] tracking-tight text-ink-amber-7" :title="`${row.rating}/5`">{{ '★'.repeat(row.rating) }}</span>
            <span class="rounded-full px-2 py-0.5 text-[10.5px] font-semibold" :class="statusChip(row.status)">
              {{ statusLabel(row.status) }}
            </span>
            <span class="ml-auto text-[11.5px] text-ink-gray-5">{{ relTime(row.raised_at) }}</span>
          </div>

          <!-- post context (parity with the inbox Comentarios pane): the publication
               this mention lives on — thumbnail + caption, linked to the network. -->
          <a
            v-if="previews[row.name] && (previews[row.name].image || previews[row.name].caption)"
            :data-testid="`mention-preview-${i}`"
            :href="previews[row.name].permalink || row.permalink || undefined"
            target="_blank"
            rel="noopener"
            class="mt-2 flex items-center gap-2.5 rounded-lg border border-outline-gray-1 bg-surface-gray-1 p-2 hover:bg-surface-gray-2"
          >
            <img
              v-if="previews[row.name].image"
              :src="previews[row.name].image"
              :alt="__('Vista previa de la publicación')"
              class="h-12 w-12 flex-none rounded-md border border-outline-gray-1 object-cover"
              loading="lazy"
            />
            <div class="min-w-0 flex-1">
              <div class="truncate text-[10.5px] font-semibold text-ink-gray-5">
                {{ previewKindLabel(row, previews[row.name]) }}
                <template v-if="previews[row.name].username"> · @{{ previews[row.name].username }}</template>
              </div>
              <div v-if="previews[row.name].caption" class="line-clamp-2 text-[12px] leading-snug text-ink-gray-7">
                {{ previews[row.name].caption }}
              </div>
            </div>
            <span class="flex-none text-[11px] font-semibold text-ink-blue-7">→</span>
          </a>

          <!-- what they wrote -->
          <p v-if="row.text" class="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-ink-gray-7">{{ row.text }}</p>

          <!-- story asset -->
          <img
            v-if="row.media_preview"
            :src="row.media_preview"
            :alt="__('Vista previa de la historia')"
            class="mt-2 max-h-[220px] rounded-lg border border-outline-gray-1 object-cover"
          />

          <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <a
              v-if="row.permalink"
              :href="row.permalink"
              target="_blank"
              rel="noopener"
              class="text-[11.5px] font-semibold text-ink-blue-7 hover:underline"
            >{{ __('Ver en la red →') }}</a>
            <span v-if="isManager && shop === '' && row.shop" class="text-[11.5px] text-ink-gray-5">· {{ shopLabel(row.shop) }}</span>
            <span v-if="row.status === 'Atendido' && row.replied_at" class="text-[11.5px] text-ink-green-7">
              ✓ {{ __('Respondida') }} {{ relTime(row.replied_at) }}
            </span>
          </div>

          <!-- already-sent reply (read-only) -->
          <div v-if="row.status === 'Atendido' && row.suggested_reply" class="mt-2 rounded-lg bg-surface-green-1 px-3 py-2 text-[12.5px] text-ink-gray-8">
            {{ row.suggested_reply }}
          </div>

          <!-- reply editor (Nuevo cards) -->
          <div v-if="row.status === 'Nuevo' && replyOpen === row.name" class="mt-2.5">
            <textarea
              v-model="replyText"
              :data-testid="`mention-reply-${i}`"
              rows="3"
              :placeholder="__('Escribe una respuesta pública…')"
              class="w-full rounded-lg border border-outline-gray-2 bg-surface-base px-3 py-2 text-[13px] text-ink-gray-8 focus:border-outline-gray-3 focus:outline-none"
            />
          </div>

          <!-- actions -->
          <div v-if="row.status === 'Nuevo'" class="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              :data-testid="`mention-suggest-${i}`"
              class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2 disabled:opacity-40"
              :disabled="busy === row.name"
              :title="__('Generar una respuesta sugerida')"
              @click="onSuggest(row)"
            >
              {{ busy === row.name && suggesting === row.name ? __('💡 …') : __('💡 Sugerir respuesta') }}
            </button>
            <button
              :data-testid="`mention-send-${i}`"
              class="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
              style="background: var(--brand)"
              :disabled="busy === row.name"
              :title="__('Publicar la respuesta como comentario público')"
              @click="onSend(row)"
            >
              {{ __('Responder') }}
            </button>
            <button
              :data-testid="`mention-dismiss-${i}`"
              class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2 disabled:opacity-40"
              :disabled="busy === row.name"
              :title="__('Descartar esta mención')"
              @click="onDismiss(row)"
            >
              {{ __('Descartar') }}
            </button>
          </div>

          <!-- Reseña → Testimonio draft (any status: a good review stays quotable) -->
          <div v-if="row.mention_type === 'Reseña'" class="mt-2.5">
            <button
              v-if="!row.testimonial_post"
              :data-testid="`mention-testimonial-${i}`"
              class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2 disabled:opacity-40"
              :disabled="busy === row.name"
              :title="__('Crear un borrador de publicación tipo Testimonio con esta reseña')"
              @click="onTestimonial(row)"
            >
              ⭐ {{ __('Crear testimonio') }}
            </button>
            <router-link
              v-else
              to="/social"
              class="text-[12px] font-semibold text-ink-green-7 hover:underline"
              :title="row.testimonial_post"
            >
              ✓ {{ __('Testimonio en borrador — ver calendario →') }}
            </router-link>
          </div>

          <!-- discarded: allow reactivation -->
          <div v-if="row.status === 'Descartado'" class="mt-2.5">
            <button
              :data-testid="`mention-reactivate-${i}`"
              class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2 disabled:opacity-40"
              :disabled="busy === row.name"
              @click="onReactivate(row)"
            >
              {{ __('Reactivar') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- confirm: publish public reply -->
    <template v-if="confirmSend">
      <div class="fixed inset-0 z-[300] bg-black/30 dark:bg-black/60" @click="confirmSend = null" />
      <div class="fixed left-1/2 top-1/2 z-[310] w-[92vw] max-w-[440px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[14px] border border-outline-gray-2 bg-surface-base shadow-xl">
        <div class="border-b border-outline-gray-1 px-4 py-3 text-[14px] font-bold text-ink-gray-9">
          {{ __('Publicar respuesta') }}
        </div>
        <div class="px-4 py-4 text-[12.5px] leading-relaxed text-ink-gray-7">
          {{ __('Se publicará como comentario PÚBLICO en la red social, visible para cualquiera. ¿Enviar?') }}
          <div class="mt-2 rounded-lg bg-surface-gray-2 px-3 py-2 text-[12.5px] text-ink-gray-8">{{ replyText }}</div>
        </div>
        <div class="flex items-center justify-end gap-2 border-t border-outline-gray-1 px-4 py-3">
          <button
            class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2"
            @click="confirmSend = null"
          >
            {{ __('Cancelar') }}
          </button>
          <button
            data-testid="mention-send-confirm"
            class="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
            style="background: var(--brand)"
            :disabled="busy === confirmSend.name"
            @click="doSend"
          >
            {{ __('Publicar') }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { createResource, call as frappeCall, toast } from 'frappe-ui'

const TYPE_EMOJI = { Comentario: '💬', Caption: '📝', Historia: '📸', FB: '📘', 'Reseña': '⭐' }
const FILTERS = [
  { v: 'Nuevo', label: 'Nuevas' },
  { v: 'Atendido', label: 'Atendidas' },
  { v: 'Descartado', label: 'Descartadas' },
  { v: '', label: 'Todas' },
]

function typeLabel(t) {
  return { Comentario: __('Comentario'), Caption: __('Descripción'), Historia: __('Historia'), FB: __('Facebook'), 'Reseña': __('Reseña') }[t] || t
}
function statusChip(s) {
  return {
    Nuevo: 'bg-surface-blue-2 text-ink-blue-7',
    Atendido: 'bg-surface-green-2 text-ink-green-7',
    Descartado: 'bg-surface-gray-2 text-ink-gray-6',
  }[s] || 'bg-surface-gray-2 text-ink-gray-6'
}
function statusLabel(s) {
  return { Nuevo: __('Nueva'), Atendido: __('Atendida'), Descartado: __('Descartada') }[s] || s
}
function authorLabel(u) {
  return u ? (u.startsWith('@') ? u : '@' + u) : __('Alguien')
}
// Relative time in es-MX ("hace 5 min", "hace 2 h", "hace 3 d"); falls back to a date.
function relTime(dt) {
  if (!dt) return ''
  const d = new Date(String(dt).replace(' ', 'T'))
  if (isNaN(d.getTime())) return ''
  const secs = Math.floor((Date.now() - d.getTime()) / 1000)
  if (secs < 60) return __('hace un momento')
  // Placeholder args MUST go through __'s second parameter — calling
  // __('… {0} …') bare makes translate() run format(msg, undefined), which
  // throws inside the replace callback and white-screens the whole route.
  const mins = Math.floor(secs / 60)
  if (mins < 60) return __('hace {0} min', [mins])
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return __('hace {0} h', [hrs])
  const days = Math.floor(hrs / 24)
  if (days < 7) return __('hace {0} d', [days])
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

// ── shop selector (managers get every branch + "Todas"; an employee is auto-pinned) ──
const shopsRes = createResource({ url: 'doco_marketing.api.social.get_shops', auto: true })
const isManager = computed(() => !!shopsRes.data?.is_manager)
const shopOptions = computed(() => shopsRes.data?.shops || [])
const shopLabel = (name) => shopOptions.value.find((s) => s.name === name)?.shop_name || name
const shop = ref('')
watch(
  shopOptions,
  (opts) => {
    if (!isManager.value && opts.length && !shop.value) {
      shop.value = opts[0].name
      reloadAll()
    }
  },
  { immediate: true },
)

// ── list + Nuevo badge ──────────────────────────────────────────────────────────
const statusFilter = ref('Nuevo')
const mentionsRes = createResource({
  url: 'doco_marketing.services.social.mentions.list_mentions',
  makeParams: () => ({ shop: shop.value || undefined, status: statusFilter.value || undefined }),
  auto: true,
})
// Separate always-on count for the "Nuevas" badge, independent of the active filter.
const nuevoRes = createResource({
  url: 'doco_marketing.services.social.mentions.list_mentions',
  makeParams: () => ({ shop: shop.value || undefined, status: 'Nuevo' }),
  auto: true,
})
const rows = computed(() => mentionsRes.data || [])
const nuevoCount = computed(() => (nuevoRes.data || []).length)

// ── post context previews (FB-inbox parity) ────────────────────────────────────
// name -> {image, caption, username, permalink, media_type} | false (none) |
// null (in flight). Fetched per visible row; the server caches Graph 5 min and
// degrades to {} on any failure, so a dead preview never blocks the row.
// Historia rows skip this — their asset is already stored on the row itself.
const previews = ref({})
watch(
  rows,
  (rs) => {
    for (const r of rs) {
      // Historia carries its own stored asset; Reseña stories are not readable
      // via Graph — neither gets a preview call.
      if (r.mention_type === 'Historia' || r.mention_type === 'Reseña' || previews.value[r.name] !== undefined) continue
      previews.value[r.name] = null
      frappeCall('doco_marketing.services.social.mentions.get_media_preview', { name: r.name })
        .then((p) => {
          previews.value[r.name] = p && (p.image || p.caption) ? p : false
        })
        .catch(() => {
          previews.value[r.name] = false
        })
    }
  },
  { immediate: true },
)

function previewKindLabel(row, p) {
  if (row.mention_type === 'FB') return __('Publicación que te etiquetó')
  if (p?.media_type === 'VIDEO' || p?.media_type === 'REELS') return __('En el reel')
  return __('En la publicación')
}

function setFilter(v) {
  statusFilter.value = v
  replyOpen.value = null
  mentionsRes.reload()
}
function reloadAll() {
  mentionsRes.reload()
  nuevoRes.reload()
}

// ── reply / triage actions (backend enforces role + state regardless) ────────────
const busy = ref('')
const suggesting = ref('')
const replyOpen = ref(null)
const replyText = ref('')
const confirmSend = ref(null)

function openReply(row, text) {
  replyOpen.value = row.name
  replyText.value = text || ''
}

async function onSuggest(row) {
  if (busy.value) return
  busy.value = row.name
  suggesting.value = row.name
  try {
    const r = await frappeCall('doco_marketing.services.social.mentions.draft_reply', { name: row.name })
    openReply(row, r?.suggested_reply || '')
    toast.success(__('Respuesta sugerida — revísala antes de enviar'))
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo sugerir'))
  } finally {
    busy.value = ''
    suggesting.value = ''
  }
}

function onSend(row) {
  if (busy.value) return
  // First press opens the editor (prefilled with any existing draft) so the reply is
  // always reviewed before it goes public; second press asks to confirm + publish.
  if (replyOpen.value !== row.name) {
    openReply(row, row.suggested_reply || '')
    return
  }
  if (!replyText.value.trim()) {
    toast.error(__('Escribe o sugiere una respuesta primero.'))
    return
  }
  confirmSend.value = row
}

async function doSend() {
  const row = confirmSend.value
  if (!row) return
  busy.value = row.name
  try {
    await frappeCall('doco_marketing.services.social.mentions.send_reply', {
      name: row.name, message: replyText.value,
    })
    toast.success(__('Respuesta publicada'))
    confirmSend.value = null
    replyOpen.value = null
    replyText.value = ''
    reloadAll()
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo enviar'))
  } finally {
    busy.value = ''
  }
}

async function onTestimonial(row) {
  if (busy.value) return
  busy.value = row.name
  try {
    const r = await frappeCall('doco_marketing.services.social.mentions.create_testimonial', { name: row.name })
    toast.success(r?.existing ? __('Ya existía un borrador de testimonio') : __('Borrador de testimonio creado — revísalo en el calendario'))
    reloadAll()
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo crear el testimonio'))
  } finally {
    busy.value = ''
  }
}

async function onDismiss(row) {
  if (busy.value) return
  busy.value = row.name
  try {
    await frappeCall('doco_marketing.services.social.mentions.set_status', { name: row.name, status: 'Descartado' })
    toast.success(__('Descartada'))
    reloadAll()
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo descartar'))
  } finally {
    busy.value = ''
  }
}

async function onReactivate(row) {
  if (busy.value) return
  busy.value = row.name
  try {
    await frappeCall('doco_marketing.services.social.mentions.set_status', { name: row.name, status: 'Nuevo' })
    toast.success(__('Reactivada'))
    reloadAll()
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo reactivar'))
  } finally {
    busy.value = ''
  }
}
</script>
