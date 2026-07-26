<!--
  Score explicable (spec 5.4). The lead grade chip becomes tappable: it opens a
  breakdown of WHY the lead carries this grade — the enabled scoring rules that
  match right now, each with its point contribution, plus the recent score-change
  timeline. Prop-driven and self-contained: it renders its own grade badge as the
  trigger (styled per `variant` to match the site it mounts in) and fetches the
  breakdown lazily on first open.

  Desktop → a floating card anchored under the badge (Teleported to <body> so a
  table cell's overflow can't clip it). Mobile → a bottom sheet (.sheet-in). All
  copy is text-interpolated (no v-html); colors are frappe-ui tokens (dark-safe).
-->
<template>
  <button
    v-if="grade"
    ref="triggerRef"
    type="button"
    class="press cursor-pointer text-white"
    :class="triggerClass"
    :style="`background:${bg}`"
    :aria-label="__('Explicar puntaje')"
    :aria-expanded="open"
    @click.stop="toggle"
  >
    <slot name="trigger" :grade="grade" :score="score">{{ triggerText }}</slot>
  </button>

  <Teleport to="body">
    <template v-if="open">
      <div class="fixed inset-0 z-40" :class="isMobile ? 'bg-black/40' : ''" @click="close" />
      <div
        ref="cardRef"
        role="dialog"
        :aria-label="__('Desglose de puntaje')"
        class="flex max-h-[82vh] flex-col overflow-hidden border border-outline-gray-2 bg-surface-white shadow-lg"
        :class="
          isMobile
            ? 'sheet-in fixed inset-x-0 bottom-0 z-50 rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+10px)]'
            : 'fixed z-50 w-[300px] rounded-xl'
        "
        :style="isMobile ? '' : `top:${pos.top}px;left:${pos.left}px`"
        @click.stop
      >
        <div v-if="isMobile" class="mx-auto mt-2 h-1 w-10 flex-none rounded-full bg-surface-gray-4" aria-hidden="true" />

        <div class="flex items-center justify-between gap-2 px-3.5 pb-2 pt-3">
          <div class="flex items-center gap-2">
            <span
              class="flex-none rounded px-[7px] py-px text-[11px] font-bold text-white"
              :style="`background:${bg}`"
            >{{ grade }}</span>
            <span class="text-[13px] font-semibold text-ink-gray-8">{{ headline }}</span>
          </div>
          <button
            v-if="isMobile"
            class="press flex size-7 flex-none items-center justify-center rounded-lg text-ink-gray-5 hover:bg-surface-gray-2"
            :aria-label="__('Cerrar')"
            @click="close"
          >
            ✕
          </button>
        </div>

        <div class="scb overflow-y-auto px-3.5 pb-3.5">
          <div v-if="loading" class="py-4 text-center text-[12.5px] text-ink-gray-4">
            {{ __('Cargando…') }}
          </div>

          <button
            v-else-if="error"
            type="button"
            class="press w-full py-4 text-center text-[12.5px] font-medium text-ink-blue-3 hover:underline"
            @click="reload"
          >
            {{ __('No se pudo cargar — reintentar') }}
          </button>

          <template v-else>
            <p
              v-if="decayed"
              class="mb-2 rounded-lg bg-surface-amber-1 px-2.5 py-1.5 text-[11.5px] text-ink-amber-3"
            >
              {{ __('Incluye ajuste por inactividad (las reglas suman {0}).', [ruleScore]) }}
            </p>

            <ul v-if="contributions.length" class="flex flex-col gap-1.5">
              <li
                v-for="(c, i) in contributions"
                :key="c.rule + ':' + i"
                class="flex items-start justify-between gap-2 rounded-lg border border-outline-gray-1 bg-surface-gray-1 px-2.5 py-1.5"
              >
                <div class="min-w-0 flex-1">
                  <div class="truncate text-[12.5px] font-semibold text-ink-gray-8">{{ c.rule }}</div>
                  <div class="truncate text-[11px] text-ink-gray-5">{{ c.description || criterion(c) }}</div>
                </div>
                <span
                  class="flex-none rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
                  :class="c.points >= 0 ? 'bg-surface-green-2 text-ink-green-3' : 'bg-surface-red-1 text-ink-red-3'"
                >{{ signed(c.points) }}</span>
              </li>
            </ul>

            <div v-else class="py-3 text-center text-[12.5px] text-ink-gray-4">
              {{ __('Sin reglas activas que expliquen este puntaje.') }}
            </div>

            <div v-if="moreCount > 0" class="mt-1.5 text-center text-[11px] text-ink-gray-4">
              {{ __('y {0} regla(s) más', [moreCount]) }}
            </div>

            <div v-if="lastChange" class="mt-3 border-t border-outline-gray-1 pt-2">
              <div class="mb-1 text-[10px] font-bold uppercase tracking-[.06em] text-ink-gray-4">
                {{ __('Cambios recientes') }}
              </div>
              <div
                v-for="(h, i) in recentHistory"
                :key="'h' + i"
                class="flex items-center justify-between gap-2 py-0.5 text-[11.5px]"
              >
                <span class="flex items-center gap-1.5 text-ink-gray-6">
                  <span
                    class="tabular-nums font-semibold"
                    :class="h.delta >= 0 ? 'text-ink-green-3' : 'text-ink-red-3'"
                  >{{ signed(h.delta) }}</span>
                  <span>{{ triggerLabel(h.trigger) }}</span>
                </span>
                <span class="flex-none text-ink-gray-4">{{ timeAgo(h.ts) }}</span>
              </div>
            </div>
          </template>
        </div>
      </div>
    </template>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, nextTick, watch, onBeforeUnmount } from 'vue'
import { createResource } from 'frappe-ui'
import { GRADE_COLORS, timeAgo } from '@/composables/crmFormat'
import { isMobile } from '@/composables/breakpoint'
import { signedPoints, criterionText, gradeHeadline, popoverPosition } from '@/utils/scoreExplain'

const props = defineProps({
  // 'CRM Lead' | 'CRM Deal' — a deal is resolved to its linked lead server-side
  doctype: { type: String, default: '' },
  name: { type: String, default: '' },
  score: { type: [Number, String], default: '' },
  grade: { type: String, default: '' },
  // 'chip' (leads table cell) | 'card' (board card) | 'header' (deal header)
  variant: { type: String, default: 'chip' },
})

const open = ref(false)
const triggerRef = ref(null)
const cardRef = ref(null)
const pos = reactive({ top: 0, left: 0 })
const loadedKey = ref('')
let triggerRect = null

const res = createResource({
  url: 'doco_marketing.api.score_explain.get_score_breakdown',
  onError() {}, // a 403 / missing lead must not raise a toast — inline states handle it
})

const bg = computed(() => GRADE_COLORS[props.grade]?.[0] || '#9aa2ae')
const triggerText = computed(() =>
  props.variant === 'header' ? `${props.grade} · ${props.score}` : props.grade,
)
const triggerClass = computed(() =>
  ({
    header: 'flex-none rounded px-[7px] py-px text-[11px] font-bold',
    card: 'flex-none rounded px-[5px] py-px text-[9px] font-bold',
    chip: 'rounded-[3px] px-[5px] py-px text-[9px] font-bold',
  })[props.variant] || 'rounded-[3px] px-[5px] py-px text-[9px] font-bold',
)

const headline = computed(() => gradeHeadline(props.grade, props.score))
const loading = computed(() => res.loading)
const error = computed(() => !res.loading && !!res.error)
const contributions = computed(() => res.data?.contributions || [])
const decayed = computed(() => !!res.data?.decayed)
const ruleScore = computed(() => res.data?.rule_score ?? 0)
const moreCount = computed(() => Math.max(0, (res.data?.matched_rules || 0) - contributions.value.length))
const history = computed(() => res.data?.history || [])
const recentHistory = computed(() => history.value.slice(0, 3))
const lastChange = computed(() => history.value[0] || null)

const signed = signedPoints
const criterion = (c) => criterionText(c.field, c.operator, c.value)
function triggerLabel(t) {
  return (
    { Activity: __('Actividad'), 'Rule Evaluation': __('Reglas'), Decay: __('Inactividad'), Manual: __('Manual') }[
      t
    ] || t
  )
}

function ensureLoaded() {
  const key = `${props.doctype}:${props.name}`
  if (loadedKey.value === key && res.data) return
  loadedKey.value = key
  res.submit({ doctype: props.doctype, name: props.name })
}
function reload() {
  loadedKey.value = ''
  ensureLoaded()
}

async function toggle() {
  if (open.value) return close()
  const el = triggerRef.value
  triggerRect = el ? el.getBoundingClientRect() : null
  open.value = true
  ensureLoaded()
  window.addEventListener('keydown', onKey)
  if (!isMobile.value) {
    await nextTick()
    place()
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
  }
}
function place() {
  const card = cardRef.value
  if (!card || !triggerRect) return
  const r = card.getBoundingClientRect()
  const p = popoverPosition(
    triggerRect,
    { w: r.width, h: r.height },
    { w: window.innerWidth, h: window.innerHeight },
  )
  pos.top = p.top
  pos.left = p.left
}
function close() {
  open.value = false
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('scroll', close, true)
  window.removeEventListener('resize', close)
}
function onKey(e) {
  if (e.key === 'Escape') close()
}

// switching the underlying record drops the cached breakdown so a reopen refetches
watch(
  () => [props.doctype, props.name],
  () => {
    loadedKey.value = ''
    if (open.value) close()
  },
)
onBeforeUnmount(close)
</script>
