<template>
  <!-- «Cambios propuestos»: what «Enriquecer» proposed for the products, one
       card at a time. Right applies, left skips, up edits before applying;
       the buttons and the keys (→ ← ↑, Z) do the same. A kind's surest ones
       apply at once. The deck follows its job live (doco.workspaces.revisar). -->
  <section
    class="mx-auto flex h-full w-full max-w-xl flex-col px-4 pb-4 pt-3 sm:px-6"
    :aria-label="__('Proposed changes', null, 'Revisar')"
  >
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="press flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
        :aria-label="__('Back to products', null, 'Revisar')"
        :title="__('Back to products', null, 'Revisar')"
        data-testid="revisar-volver"
        @click="emit('close')"
      >
        <span class="lucide-arrow-left size-5" aria-hidden="true" />
      </button>
      <div class="min-w-0 flex-1">
        <h1 class="title-face truncate text-xl font-semibold text-ink-gray-9">
          {{ __('Proposed changes', null, 'Revisar') }}
        </h1>
        <button
          v-if="ready && data.trabajos.length"
          type="button"
          class="press max-w-full truncate text-left text-sm text-ink-gray-6 underline-offset-2 hover:underline"
          data-testid="revisar-trabajo"
          @click="jobsOpen = true"
        >
          {{ data.titulo }}
        </button>
      </div>
      <button
        type="button"
        class="press flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2 disabled:opacity-40"
        :disabled="!last || busy"
        :aria-label="__('Undo the last one', null, 'Revisar')"
        :title="__('Undo the last one', null, 'Revisar')"
        data-testid="revisar-deshacer"
        @click="undoLast"
      >
        <span class="lucide-undo-2 size-5" aria-hidden="true" />
      </button>
    </div>

    <EmptyState
      v-if="guard"
      role="alert"
      state="error"
      :title="guard.title"
      :message="guard.detail"
    />
    <EmptyState
      v-else-if="!ready"
      role="status"
      state="loading"
      :title="__('Opening the changes…', null, 'Revisar')"
    />
    <template v-else>
      <div class="mt-3" data-testid="revisar-progreso">
        <p class="num text-sm text-ink-gray-7">
          {{
            __(
              '{0} of {1} reviewed',
              [progress.done, progress.total],
              'Revisar',
            )
          }}
          <span v-if="data.estado === 'Preparando'" class="text-ink-gray-5">
            ·
            {{
              __(
                'still reading products: {0} of {1}',
                [data.revisados, data.articulos],
                'Revisar',
              )
            }}
          </span>
        </p>
        <div
          class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-gray-2"
          aria-hidden="true"
        >
          <div
            class="h-full rounded-full bg-[var(--muelle-accent)] transition-[width] duration-300 motion-reduce:transition-none"
            :style="{ width: `${Math.round(progress.share * 100)}%` }"
          />
        </div>
        <p v-if="data.error" class="mt-2 text-sm text-ink-red-7">
          {{ data.error }}
        </p>
      </div>

      <div
        v-if="safeKinds.length && data.puede_editar"
        class="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0"
        role="group"
        :aria-label="__('Apply the sure ones', null, 'Revisar')"
      >
        <button
          v-for="kind in safeKinds"
          :key="kind.grupo"
          type="button"
          :class="chipClass(confirming === kind.grupo)"
          :disabled="busy"
          :data-testid="'revisar-seguras-' + kind.grupo"
          @click="applySafe(kind)"
        >
          {{
            confirming === kind.grupo
              ? __('Yes, apply {0}', [kind.seguras], 'Revisar')
              : __(
                  '{0}: apply the {1} sure ones',
                  [kind.label, kind.seguras],
                  'Revisar',
                )
          }}
        </button>
      </div>

      <div
        v-if="problem"
        role="alert"
        class="mt-3 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
      >
        {{ problem }}
      </div>

      <div class="relative mt-4 min-h-[22rem] flex-1">
        <EmptyState
          v-if="!cards.length"
          :title="
            data.estado === 'Preparando'
              ? __('The first changes are on their way', null, 'Revisar')
              : __('Nothing left to review', null, 'Revisar')
          "
          :message="
            data.estado === 'Preparando'
              ? __('They show here as soon as they are ready.', null, 'Revisar')
              : __(
                  'Every proposed change of this job is decided.',
                  null,
                  'Revisar',
                )
          "
          :action="
            data.puede_editar ? __('Review more products', null, 'Revisar') : ''
          "
          @action="startOpen = true"
        />
        <article
          v-for="(card, i) in visible"
          :key="card.name"
          class="absolute inset-0 flex flex-col overflow-hidden rounded-7 border border-outline-gray-2 bg-surface-base shadow-sm"
          :class="i === 0 ? 'touch-none select-none' : 'pointer-events-none'"
          :style="cardStyle(i)"
          :aria-hidden="i > 0"
          :data-testid="i === 0 ? 'revisar-tarjeta' : null"
          @pointerdown="i === 0 && onDown($event)"
          @pointermove="i === 0 && onMove($event)"
          @pointerup="i === 0 && onUp($event)"
          @pointercancel="i === 0 && onCancel()"
        >
          <div
            v-if="i === 0 && drag.active && drag.hint"
            class="pointer-events-none absolute right-4 top-4 z-10 rounded-full px-3 py-1 text-sm font-semibold"
            :class="
              drag.hint === 'apply'
                ? 'bg-surface-green-2 text-ink-green-8'
                : drag.hint === 'skip'
                  ? 'bg-surface-gray-3 text-ink-gray-8'
                  : 'bg-surface-amber-2 text-ink-amber-8'
            "
            :style="{ opacity: drag.progress }"
          >
            {{ hintText(drag.hint) }}
          </div>
          <header
            class="flex items-center gap-3 border-b border-outline-gray-1 p-4"
          >
            <img
              v-if="card.imagen"
              :src="card.imagen"
              alt=""
              class="size-12 flex-none rounded-5 object-cover"
              loading="lazy"
            />
            <div class="min-w-0 flex-1">
              <p class="truncate text-base font-medium text-ink-gray-9">
                {{ card.titulo || card.reference_name }}
              </p>
              <p class="text-sm text-ink-gray-6">{{ card.etiqueta }}</p>
            </div>
          </header>
          <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            <div>
              <p class="text-xs font-medium text-ink-gray-5">
                {{ __('Now', null, 'Revisar') }}
              </p>
              <p class="text-base text-ink-gray-6">
                {{ card.antes_texto || __('(empty)', null, 'Revisar') }}
              </p>
            </div>
            <div>
              <p class="text-xs font-medium text-ink-gray-5">
                {{ __('Proposed', null, 'Revisar') }}
              </p>
              <ul v-if="listOf(card)" class="mt-1 flex flex-wrap gap-1.5">
                <li
                  v-for="model in listOf(card)"
                  :key="model"
                  class="rounded-full bg-surface-gray-2 px-2.5 py-1 text-sm text-ink-gray-8"
                >
                  {{ model }}
                </li>
              </ul>
              <p v-else class="text-lg font-medium text-ink-gray-9">
                {{ card.despues_texto }}
              </p>
            </div>
            <p v-if="card.motivo" class="text-sm text-ink-gray-7">
              {{ card.motivo }}
            </p>
          </div>
          <footer
            class="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-outline-gray-1 px-4 py-3 text-sm text-ink-gray-6"
          >
            <a
              v-if="card.fuente_url"
              :href="card.fuente_url"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 underline-offset-2 hover:underline"
              @pointerdown.stop
            >
              {{ sourceText(card.fuente) }}
              <span class="lucide-external-link size-3.5" aria-hidden="true" />
            </a>
            <span v-else>{{ sourceText(card.fuente) }}</span>
            <span>{{ sureText(card.confianza, data.segura) }}</span>
          </footer>
        </article>
      </div>

      <div
        v-if="cards.length && data.puede_editar"
        class="mt-4 flex items-center justify-center gap-5"
      >
        <button
          type="button"
          class="press flex size-14 items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-8 hover:bg-surface-gray-3 disabled:opacity-40"
          :disabled="busy"
          :aria-label="__('Skip', null, 'Revisar')"
          :title="__('Skip (←)', null, 'Revisar')"
          data-testid="revisar-saltar"
          @click="decide('skip')"
        >
          <span class="lucide-x size-6" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="press flex size-12 items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-8 hover:bg-surface-gray-3 disabled:opacity-40"
          :disabled="busy"
          :aria-label="__('Edit before applying', null, 'Revisar')"
          :title="__('Edit before applying (↑)', null, 'Revisar')"
          data-testid="revisar-editar"
          @click="openEdit"
        >
          <span class="lucide-pencil size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="press flex size-14 items-center justify-center rounded-full bg-surface-gray-10 text-ink-base hover:bg-surface-gray-9 disabled:opacity-40"
          :disabled="busy"
          :aria-label="__('Apply', null, 'Revisar')"
          :title="__('Apply (→)', null, 'Revisar')"
          data-testid="revisar-aplicar"
          @click="decide('apply')"
        >
          <span class="lucide-check size-6" aria-hidden="true" />
        </button>
      </div>
      <p
        v-else-if="cards.length"
        class="mt-4 text-center text-sm text-ink-gray-6"
      >
        {{ __('The owner applies these changes.', null, 'Revisar') }}
      </p>
    </template>

    <BottomSheet
      v-if="editMounted"
      v-model:open="editOpen"
      :title="__('Edit before applying', null, 'Revisar')"
    >
      <form id="revisar-edicion" class="pb-4" @submit.prevent="applyEdit">
        <label class="block">
          <span class="mb-1.5 block text-sm text-ink-gray-7">{{
            editing?.etiqueta
          }}</span>
          <textarea
            v-model="draft"
            rows="5"
            class="w-full rounded-6 border-0 bg-surface-gray-2 p-3 text-base text-ink-gray-9 focus:ring-2 focus:ring-outline-gray-4"
            data-testid="revisar-texto"
          />
        </label>
      </form>
      <template #actions>
        <button
          type="button"
          :class="['press', BTN.text]"
          @click="editOpen = false"
        >
          {{ __('Cancel', null, 'Revisar') }}
        </button>
        <button
          type="submit"
          form="revisar-edicion"
          :class="['press', BTN.filled]"
          :disabled="!draft.trim()"
        >
          {{ __('Apply with my change', null, 'Revisar') }}
        </button>
      </template>
    </BottomSheet>

    <BottomSheet
      v-if="jobsOpen || startOpen"
      :open="jobsOpen || startOpen"
      :title="
        startOpen
          ? __('Review more products', null, 'Revisar')
          : __('Jobs', null, 'Revisar')
      "
      @update:open="
        (v) => {
          if (!v) jobsOpen = startOpen = false
        }
      "
    >
      <div v-if="startOpen" class="space-y-3 pb-4">
        <p class="text-sm text-ink-gray-7">
          {{
            __(
              'Pick a group: I read up to 200 of its products and propose a full title, a description, the models they fit and the group when it is wrong. Nothing changes until you apply it.',
              null,
              'Revisar',
            )
          }}
        </p>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="g in groups"
            :key="g.name"
            type="button"
            :class="chipClass(pick === g.name)"
            :aria-pressed="pick === g.name"
            @click="pick = g.name"
          >
            {{ g.name }} <span class="num">{{ g.items }}</span>
          </button>
        </div>
      </div>
      <ul v-else class="divide-y divide-outline-gray-1 pb-4">
        <li v-for="job in data.trabajos" :key="job.name">
          <button
            type="button"
            class="press flex min-h-14 w-full items-center gap-3 py-2 text-left"
            @click="openJob(job.name)"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate text-base text-ink-gray-9">{{
                job.titulo
              }}</span>
              <span class="block text-sm text-ink-gray-6">{{
                __('{0} waiting', [job.pendientes], 'Revisar')
              }}</span>
            </span>
            <span
              v-if="job.name === data.lote"
              class="lucide-check size-5 text-ink-gray-7"
              aria-hidden="true"
            />
          </button>
        </li>
      </ul>
      <template #actions>
        <button
          v-if="!startOpen && data.puede_editar"
          type="button"
          :class="['press', BTN.tonal]"
          @click="openStart"
        >
          {{ __('Review more products', null, 'Revisar') }}
        </button>
        <button
          v-if="startOpen"
          type="button"
          :class="['press', BTN.filled]"
          :disabled="!pick || busy"
          data-testid="revisar-empezar"
          @click="startJob"
        >
          {{ __('Start', null, 'Revisar') }}
        </button>
      </template>
    </BottomSheet>
  </section>
</template>

<script setup>
import {
  computed,
  getCurrentInstance,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import { BottomSheet, EmptyState, chipClass } from '@/components/ui'
import { comprasApi, problemOf } from '@/composables/useCompras'
import { BTN } from '@/documentos/tools'
import {
  freshCards,
  listOf,
  progressOf,
  sourceText,
  sureText,
  swipeAction,
  swipeProgress,
} from '@/utils/revisar'

const props = defineProps({ lote: { type: String, default: '' } })
const emit = defineEmits(['close', 'lote'])

const API = 'doco.workspaces.revisar.'
const call = (method, args = {}) => comprasApi(API + method, args)
// doco books/propuestas.EVENT: {lote, counts} when its proposals change
const EVENT = 'propuestas'
const REFILL = 5
const FLY_MS = 220

const ready = ref(false)
const guard = ref(null)
const problem = ref('')
const busy = ref(false)
const data = ref({ trabajos: [], tarjetas: [], tipos: [], conteo: {} })
const cards = ref([])
const decided = new Set()
const last = ref(null)
const confirming = ref('')
const socket = getCurrentInstance()?.appContext.config.globalProperties.$socket

const visible = computed(() => cards.value.slice(0, 2))
const progress = computed(() => progressOf(data.value.conteo))
const safeKinds = computed(() =>
  (data.value.tipos || []).filter((k) => k.seguras > 0),
)

function show(next) {
  data.value = { trabajos: [], tarjetas: [], tipos: [], conteo: {}, ...next }
  cards.value = freshCards([], next.tarjetas || [], decided)
  if (next.lote && next.lote !== props.lote) emit('lote', next.lote)
}

async function start() {
  guard.value = null
  try {
    show(await call('bootstrap', { lote: props.lote || null }))
  } catch (error) {
    guard.value = {
      title: __('Could not open the changes', null, 'Revisar'),
      detail: problemOf(error).detail,
    }
    return
  }
  ready.value = true
}

async function refill() {
  try {
    const next = await call('deck', { lote: data.value.lote || null })
    data.value = { ...data.value, ...next, tarjetas: [] }
    cards.value = [
      ...cards.value,
      ...freshCards(cards.value, next.tarjetas || [], decided),
    ]
  } catch {
    // the next decision or event reads it again
  }
}

// ---- deciding ---------------------------------------------------------------
const fly = reactive({ name: '', dx: 0, dy: 0 })

async function decide(action, value = null) {
  const card = cards.value[0]
  // a card still flying out is decided already
  if (!card || busy.value || fly.name) return
  problem.value = ''
  confirming.value = ''
  decided.add(card.name)
  // the card leaves at once; the server follows
  fly.name = card.name
  fly.dx = action === 'apply' ? 1 : action === 'skip' ? -1 : 0
  fly.dy = 0
  await new Promise((resolve) =>
    setTimeout(resolve, reducedMotion() ? 0 : FLY_MS),
  )
  cards.value = cards.value.slice(1)
  fly.name = ''
  try {
    const got = await call('decide', {
      name: card.name,
      action: action === 'skip' ? 'skip' : 'apply',
      value,
      lote: data.value.lote || null,
    })
    data.value = { ...data.value, conteo: got.conteo }
    last.value = card
    if (got.estado === 'Caducada')
      problem.value = __(
        '«{0}» changed after the proposal; I left it as it is.',
        [card.titulo],
        'Revisar',
      )
  } catch (error) {
    decided.delete(card.name)
    cards.value = [card, ...cards.value]
    problem.value = problemOf(error).detail
  }
  if (cards.value.length < REFILL) refill()
}

async function undoLast() {
  const card = last.value
  if (!card || busy.value) return
  busy.value = true
  problem.value = ''
  try {
    const got = await call('undo', {
      name: card.name,
      lote: data.value.lote || null,
    })
    data.value = { ...data.value, conteo: got.conteo }
    if (got.estado === 'Pendiente' || got.estado === 'Deshecha') {
      decided.delete(card.name)
      if (got.estado === 'Pendiente') cards.value = [card, ...cards.value]
    }
    last.value = null
  } catch (error) {
    problem.value = problemOf(error).detail
  } finally {
    busy.value = false
  }
}

async function applySafe(kind) {
  if (confirming.value !== kind.grupo) {
    confirming.value = kind.grupo
    return
  }
  confirming.value = ''
  busy.value = true
  problem.value = ''
  try {
    const got = await call('apply_safe', {
      lote: data.value.lote,
      grupo: kind.grupo,
    })
    show(got)
    if (got.failed?.length)
      problem.value = __(
        '{0} could not be applied: {1}',
        [got.failed.length, got.failed[0].error],
        'Revisar',
      )
  } catch (error) {
    problem.value = problemOf(error).detail
  } finally {
    busy.value = false
  }
}

// ---- edit before applying ---------------------------------------------------
const editMounted = ref(false)
const editOpen = ref(false)
const editing = ref(null)
const draft = ref('')

function openEdit() {
  const card = cards.value[0]
  if (!card) return
  editing.value = card
  draft.value = listOf(card)
    ? listOf(card).join('\n')
    : card.despues_texto || ''
  editMounted.value = true
  editOpen.value = true
}

function applyEdit() {
  editOpen.value = false
  decide('apply', draft.value.trim())
}

// ---- the gesture ------------------------------------------------------------
const drag = reactive({
  active: false,
  id: null,
  x: 0,
  y: 0,
  dx: 0,
  dy: 0,
  t: 0,
  w: 1,
  h: 1,
  hint: '',
  progress: 0,
})

function reducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

function onDown(event) {
  if (!data.value.puede_editar || busy.value || event.button > 0) return
  const box = event.currentTarget.getBoundingClientRect()
  Object.assign(drag, {
    active: true,
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    dx: 0,
    dy: 0,
    t: Date.now(),
    w: box.width,
    h: box.height,
    hint: '',
    progress: 0,
  })
  event.currentTarget.setPointerCapture?.(event.pointerId)
}

function onMove(event) {
  if (!drag.active || event.pointerId !== drag.id) return
  drag.dx = event.clientX - drag.x
  drag.dy = event.clientY - drag.y
  const up = -drag.dy > Math.abs(drag.dx)
  drag.hint = up ? 'edit' : drag.dx > 0 ? 'apply' : drag.dx < 0 ? 'skip' : ''
  drag.progress = up
    ? Math.min(-drag.dy / (drag.h * 0.25), 1)
    : swipeProgress(drag.dx, drag.w)
}

function onUp(event) {
  if (!drag.active || event.pointerId !== drag.id) return
  const action = swipeAction({
    dx: drag.dx,
    dy: drag.dy,
    ms: Date.now() - drag.t,
    width: drag.w,
    height: drag.h,
  })
  drag.active = false
  if (action === 'edit') {
    drag.dx = drag.dy = 0
    openEdit()
  } else if (action) {
    decide(action)
    drag.dx = drag.dy = 0
  } else {
    drag.dx = drag.dy = 0
  }
  drag.hint = ''
}

function onCancel() {
  Object.assign(drag, { active: false, dx: 0, dy: 0, hint: '', progress: 0 })
}

function cardStyle(i) {
  if (i > 0) return { transform: 'scale(0.96) translateY(10px)', zIndex: 1 }
  const leaving = fly.name === cards.value[0]?.name
  const dx = leaving ? fly.dx * (drag.w || 400) * 1.5 : drag.dx
  const dy = leaving ? 0 : Math.min(drag.dy, 0) * 0.4
  return {
    transform: `translate(${dx}px, ${dy}px) rotate(${dx / 24}deg)`,
    transition:
      drag.active || reducedMotion()
        ? 'none'
        : `transform ${FLY_MS}ms ease-out`,
    zIndex: 2,
  }
}

function hintText(hint) {
  if (hint === 'apply') return __('Apply', null, 'Revisar')
  if (hint === 'skip') return __('Skip', null, 'Revisar')
  return __('Edit', null, 'Revisar')
}

function onKey(event) {
  if (editOpen.value || jobsOpen.value || startOpen.value || !ready.value)
    return
  if (event.target?.closest?.('input, textarea, [contenteditable]')) return
  if (event.key === 'ArrowRight') decide('apply')
  else if (event.key === 'ArrowLeft') decide('skip')
  else if (event.key === 'ArrowUp') openEdit()
  else if (event.key === 'z' || event.key === 'Z') undoLast()
  else return
  event.preventDefault()
}

// ---- jobs -------------------------------------------------------------------
const jobsOpen = ref(false)
const startOpen = ref(false)
const groups = ref([])
const pick = ref('')

async function openStart() {
  jobsOpen.value = false
  startOpen.value = true
  if (!groups.value.length) groups.value = await call('groups').catch(() => [])
}

async function startJob() {
  busy.value = true
  problem.value = ''
  try {
    show(await call('start', { item_group: pick.value }))
    startOpen.value = false
    pick.value = ''
  } catch (error) {
    problem.value = problemOf(error).detail
    startOpen.value = false
  } finally {
    busy.value = false
  }
}

function openJob(name) {
  jobsOpen.value = false
  emit('lote', name)
}

// ---- live -------------------------------------------------------------------
function onEvent(payload) {
  if (!payload?.lote || payload.lote !== data.value.lote) return
  if (cards.value.length < REFILL || data.value.estado === 'Preparando')
    refill()
}

watch(
  () => props.lote,
  (lote, before) => {
    if (lote !== before && lote !== data.value.lote) {
      decided.clear()
      last.value = null
      start()
    }
  },
)
onMounted(() => {
  start()
  socket?.on(EVENT, onEvent)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  socket?.off(EVENT, onEvent)
  window.removeEventListener('keydown', onKey)
})
</script>
