<!--
  Social — content calendar + composer (MA-23, S5). Month grid of scheduled posts
  (colored by status) + an unscheduled-drafts tray + a composer modal (text/link
  posts; media lands in S8). Data: doco_marketing.api.social.* + services/social.publish.
-->
<template>
  <div class="scb flex min-h-0 w-full flex-1 flex-col overflow-y-auto bg-surface-gray-2">
    <!-- toolbar -->
    <div class="flex h-[52px] flex-none items-center justify-between border-b border-outline-gray-1 bg-surface-white px-5">
      <div class="flex items-center gap-3">
        <span class="text-[15px] font-bold text-ink-gray-9">{{ __('Social') }}</span>
        <div class="flex items-center gap-1">
          <button class="rounded-md px-1.5 py-1 text-ink-gray-6 hover:bg-surface-gray-2" @click="shiftMonth(-1)">‹</button>
          <span class="min-w-[140px] text-center text-[13px] font-semibold capitalize text-ink-gray-8">{{ monthLabel }}</span>
          <button class="rounded-md px-1.5 py-1 text-ink-gray-6 hover:bg-surface-gray-2" @click="shiftMonth(1)">›</button>
        </div>
      </div>
      <button class="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white" style="background:#16a34a" @click="openNew()">
        + {{ __('Nueva publicación') }}
      </button>
    </div>

    <div class="p-4">
      <!-- weekday header -->
      <div class="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wide text-ink-gray-4">
        <div v-for="d in weekdays" :key="d">{{ d }}</div>
      </div>
      <!-- month grid -->
      <div class="mt-1 grid grid-cols-7 gap-1">
        <div
          v-for="day in days"
          :key="day.key"
          class="min-h-[92px] rounded-lg border p-1 text-left"
          :class="[
            day.inMonth ? 'border-outline-gray-2 bg-surface-white' : 'border-transparent bg-surface-gray-1/50',
            dragOver === day.key ? 'ring-2 ring-green-400' : '',
          ]"
          @click="openNew(day)"
          @dragover.prevent="dragOver = day.key"
          @dragleave="dragOver = (dragOver === day.key ? '' : dragOver)"
          @drop="onDrop(day)"
        >
          <div class="mb-0.5 text-[11px]" :class="day.isToday ? 'font-bold text-ink-green-3' : 'text-ink-gray-4'">{{ day.n }}</div>
          <div class="flex flex-col gap-0.5">
            <button
              v-for="p in (postsByDay[day.key] || [])"
              :key="p.name"
              draggable="true"
              class="truncate rounded px-1 py-0.5 text-left text-[10.5px] font-medium"
              :class="chip(p.status)"
              :title="p.title + ' · ' + p.status + ' · ' + __('arrastra para reprogramar')"
              @click.stop="openEdit(p)"
              @dragstart="dragged = p"
              @dragend="dragged = null"
            >{{ chanIcons(p.channels) }} {{ p.title || p.name }}</button>
          </div>
        </div>
      </div>

      <!-- unscheduled drafts tray -->
      <div v-if="(cal.data?.drafts || []).length" class="mt-4">
        <div class="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink-gray-4">{{ __('Borradores sin programar') }}</div>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="p in cal.data.drafts" :key="p.name"
            draggable="true"
            class="rounded-md px-2 py-1 text-[11.5px] font-medium" :class="chip(p.status)"
            :title="__('arrastra a un día para fecharlo')"
            @click="openEdit(p)"
            @dragstart="dragged = p"
            @dragend="dragged = null"
          >{{ chanIcons(p.channels) }} {{ p.title || p.name }}</button>
        </div>
      </div>
    </div>

    <!-- composer modal -->
    <template v-if="showComposer">
      <div class="fixed inset-0 z-[300] bg-black/30" @click="showComposer = false" />
      <div class="fixed left-1/2 top-1/2 z-[310] w-[92vw] max-w-[560px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[14px] border border-outline-gray-2 bg-surface-white shadow-xl">
        <div class="flex items-center justify-between border-b border-outline-gray-1 px-4 py-3">
          <span class="text-[14px] font-bold text-ink-gray-9">{{ form.name ? __('Editar publicación') : __('Nueva publicación') }}</span>
          <span v-if="form.status" class="rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="chip(form.status)">{{ form.status }}</span>
        </div>
        <div class="max-h-[68vh] overflow-y-auto p-4">
          <label class="mb-1 block text-[11px] font-semibold text-ink-gray-6">{{ __('Título') }}</label>
          <input v-model="form.title" type="text" class="mb-3 w-full rounded-md border border-outline-gray-2 px-2 py-1.5 text-[13px]" :placeholder="__('Interno')" />

          <label class="mb-1 block text-[11px] font-semibold text-ink-gray-6">{{ __('Canales') }}</label>
          <div class="mb-3 flex flex-wrap gap-1.5">
            <button
              v-for="c in channels" :key="c" type="button"
              class="rounded-md border px-2.5 py-1 text-[12px] font-medium"
              :class="form.channels.includes(c) ? 'border-green-500 bg-surface-green-2 text-ink-green-3' : 'border-outline-gray-2 text-ink-gray-6'"
              @click="toggleChannel(c)"
            >{{ c }}</button>
          </div>

          <label class="mb-1 block text-[11px] font-semibold text-ink-gray-6">{{ __('Texto por canal') }}</label>
          <div v-if="!form.channels.length" class="mb-3 text-[11px] text-ink-gray-4">{{ __('Selecciona un canal arriba.') }}</div>
          <div v-for="c in form.channels" :key="c" class="mb-2">
            <span class="text-[10px] font-mono text-ink-gray-5">{{ c }}</span>
            <textarea v-model="form.captions[c]" rows="2" class="w-full rounded-md border border-outline-gray-2 px-2 py-1.5 text-[13px]" :placeholder="__('Caption…')" />
          </div>

          <div class="mb-3 grid grid-cols-2 gap-3">
            <div>
              <label class="mb-1 block text-[11px] font-semibold text-ink-gray-6">{{ __('Programar') }}</label>
              <input v-model="form.scheduled_time" type="datetime-local" class="w-full rounded-md border border-outline-gray-2 px-2 py-1.5 text-[12.5px]" />
            </div>
            <div>
              <label class="mb-1 block text-[11px] font-semibold text-ink-gray-6">{{ __('CTA') }}</label>
              <select v-model="form.cta_type" class="w-full rounded-md border border-outline-gray-2 px-2 py-1.5 text-[12.5px]">
                <option value="WhatsApp">WhatsApp</option>
                <option value="Webshop">Webshop</option>
                <option value="None">{{ __('Ninguno') }}</option>
              </select>
            </div>
          </div>
          <input v-if="form.cta_type !== 'None'" v-model="form.cta_link" type="text" class="mb-2 w-full rounded-md border border-outline-gray-2 px-2 py-1.5 text-[12.5px]" :placeholder="__('Enlace CTA (wa.me / storefront)')" />
          <p class="text-[11px] text-ink-gray-4">{{ __('Imágenes/video: S8. IG feed/Reels = aviso; enlace por bio. FB lleva enlace clicable.') }}</p>
        </div>
        <div v-if="form.name && !canCancel" class="border-t border-outline-gray-1 px-4 pt-2 text-[11px] text-ink-gray-5">
          {{ __('Publicación en vivo o cancelada — solo lectura. Despublica desde la cola si hace falta.') }}
        </div>
        <div class="flex flex-wrap items-center justify-end gap-2 border-t border-outline-gray-1 px-4 py-3">
          <button v-if="form.name && canCancel" class="mr-auto rounded-lg px-3 py-1.5 text-[12px] font-semibold text-ink-red-4 hover:bg-surface-red-1" :disabled="busy" @click="cancelPost">{{ __('Cancelar publicación') }}</button>
          <button class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12px] font-semibold text-ink-gray-7 disabled:opacity-50" :disabled="busy || !canCancel" @click="save('Draft')">{{ __('Guardar borrador') }}</button>
          <button class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12px] font-semibold text-ink-gray-7 disabled:opacity-50" :disabled="busy || !canCancel" @click="save('Scheduled')">{{ __('Programar') }}</button>
          <button class="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50" style="background:#16a34a" :disabled="busy || !canCancel" @click="publishNow">{{ busy ? __('…') : __('Publicar ahora') }}</button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { createResource, call as frappeCall, toast } from 'frappe-ui'

const weekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const cursor = ref(new Date())

function shiftMonth(d) {
  cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + d, 1)
}

const monthStart = computed(() => new Date(cursor.value.getFullYear(), cursor.value.getMonth(), 1))
const monthLabel = computed(() => monthStart.value.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }))

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const days = computed(() => {
  const first = monthStart.value
  const start = new Date(first)
  start.setDate(1 - ((first.getDay() + 6) % 7)) // Monday-start
  const today = ymd(new Date())
  const out = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    out.push({ key: ymd(d), n: d.getDate(), inMonth: d.getMonth() === first.getMonth(), isToday: ymd(d) === today, date: d })
  }
  return out
})

const cal = createResource({
  url: 'doco_marketing.api.social.get_calendar',
  makeParams: () => ({ start: days.value[0].key, end: days.value[41].key + ' 23:59:59' }),
  auto: true,
})

const postsByDay = computed(() => {
  const m = {}
  for (const p of cal.data?.scheduled || []) {
    if (!p.scheduled_time) continue
    // Bucket by the DATE STRING (site-tz naive, as the backend stores it) — NOT a
    // browser-local Date — so a post always lands on its stored day regardless of
    // the operator's browser timezone (frontend-3). Deployment is single-tz (MX).
    const k = p.scheduled_time.slice(0, 10)
    ;(m[k] = m[k] || []).push(p)
  }
  return m
})

// reload when the visible month changes (makeParams picks up the new range)
watch(() => cursor.value, () => cal.reload())

const channelsRes = createResource({ url: 'doco_marketing.api.social.get_channels', auto: true })
const channels = computed(() => channelsRes.data || ['FB Feed', 'FB Reel', 'IG Feed', 'IG Reel', 'IG Story'])

function chip(status) {
  return {
    Draft: 'bg-surface-gray-2 text-ink-gray-6',
    'Pending Approval': 'bg-surface-amber-1 text-ink-amber-3',
    Scheduled: 'bg-surface-blue-2 text-ink-blue-3',
    Publishing: 'bg-surface-blue-2 text-ink-blue-3',
    Published: 'bg-surface-green-2 text-ink-green-3',
    'Partially Published': 'bg-surface-amber-1 text-ink-amber-3',
    Failed: 'bg-surface-red-1 text-ink-red-4',
    Cancelado: 'bg-surface-gray-2 text-ink-gray-4 line-through',
  }[status] || 'bg-surface-gray-2 text-ink-gray-6'
}

function chanIcons(chs) {
  const has = (p) => (chs || []).some((c) => c.startsWith(p))
  return (has('FB') ? '🟦' : '') + (has('IG') ? '🟪' : '')
}

// ── drag-reschedule ──────────────────────────────────────────────────────
const dragged = ref(null)
const dragOver = ref('')
async function onDrop(day) {
  dragOver.value = ''
  const p = dragged.value
  dragged.value = null
  if (!p) return
  const t = (p.scheduled_time || '').slice(11, 16) || '10:00'
  try {
    await frappeCall('doco_marketing.api.social.reschedule', { name: p.name, scheduled_time: `${day.key} ${t}:00` })
    toast.success(__('Reprogramado'))
    cal.reload()
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo reprogramar'))
  }
}

// ── composer ───────────────────────────────────────────────────────────────
const showComposer = ref(false)
const busy = ref(false)
const blank = () => ({ name: '', title: '', channels: [], captions: {}, scheduled_time: '', cta_type: 'WhatsApp', cta_link: '', status: '' })
const form = ref(blank())
const canCancel = computed(() => !['Published', 'Partially Published', 'Cancelado'].includes(form.value.status))

function toDtLocal(dt) {
  return dt ? dt.replace(' ', 'T').slice(0, 16) : ''
}
function fromDtLocal(v) {
  return v ? v.replace('T', ' ') + ':00' : null
}

function openNew(day) {
  form.value = blank()
  if (day) form.value.scheduled_time = `${day.key}T10:00`
  showComposer.value = true
}

async function openEdit(p) {
  const doc = await frappeCall('doco_marketing.api.social.get_post', { name: p.name })
  const caps = {}
  for (const c of doc.channels || []) caps[c.channel] = c.caption || ''
  form.value = {
    name: doc.name,
    title: doc.title || '',
    channels: (doc.channels || []).map((c) => c.channel),
    captions: caps,
    scheduled_time: toDtLocal(doc.scheduled_time),
    cta_type: doc.cta_type || 'WhatsApp',
    cta_link: doc.cta_link || '',
    status: doc.status,
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
    status,
    source: 'Manual',
    scheduled_time: fromDtLocal(form.value.scheduled_time),
    cta_type: form.value.cta_type,
    cta_link: form.value.cta_type === 'None' ? '' : form.value.cta_link,
    channels: form.value.channels.map((c) => ({ channel: c, caption: form.value.captions[c] || '' })),
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
    cal.reload()
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo guardar'))
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
    cal.reload() // reload regardless — the post may have persisted even on publish error
  }
}

async function cancelPost() {
  busy.value = true
  try {
    await frappeCall('doco_marketing.api.social.cancel', { name: form.value.name })
    toast.success(__('Cancelado'))
    showComposer.value = false
    cal.reload()
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo cancelar'))
  } finally {
    busy.value = false
  }
}
</script>
