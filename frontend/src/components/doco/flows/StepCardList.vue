<!--
  StepCardList — shared linear step editor (NEXT_BETS bet #3): one component for
  CRM Campaign steps (kind="campaign") and Chatflow steps (kind="chatflow").
  Vertical cards + drag-reorder (sortablejs) + inline edit + WhatsApp template
  preview. Deliberately NOT a node graph — both engines are linear (campaign
  branch = forward jump only). `frozen` mirrors the server freeze guards
  (campaign Active / chatflow runs mid-flight): inputs disable, banner explains.
-->
<template>
  <div>
    <div class="mb-3 flex items-center justify-between">
      <div class="text-[13px] font-bold text-ink-gray-9">{{ __('Secuencia') }}</div>
      <button
        v-if="!frozen"
        class="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white"
        style="background: var(--brand)"
        @click="addStep"
      >
        + {{ __('Paso') }}
      </button>
    </div>

    <div
      v-if="frozen"
      class="mb-3 max-w-[520px] rounded-[10px] border border-outline-amber-4 bg-surface-amber-1 px-3 py-2 text-[12px] text-ink-amber-7"
    >
      {{ frozenHint }}
    </div>

    <div
      v-if="!steps.length"
      class="rounded-[10px] border border-dashed border-outline-gray-2 py-6 text-center text-xs text-ink-gray-4"
    >
      {{ __('Sin pasos. Agrega un paso para empezar.') }}
    </div>

    <!-- listKey forces a clean re-render after each drag: Sortable moves DOM
         nodes itself, and re-keying the container hands the DOM back to Vue -->
    <div ref="listEl" :key="listKey">
      <div v-for="(s, i) in steps" :key="uid(s)" class="mb-2 max-w-[520px]">
        <div class="rounded-[11px] border border-outline-gray-2 p-3">
          <!-- header row -->
          <div class="mb-2 flex items-center gap-2">
            <span
              v-if="!frozen"
              class="drag-h flex-none cursor-grab text-ink-gray-4 hover:text-ink-gray-7 active:cursor-grabbing"
              :aria-label="__('Arrastrar para reordenar')"
            >
              <GripIcon class="h-4 w-4" />
            </span>
            <span class="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-surface-gray-2 text-[14px]">
              {{ glyph(s) }}
            </span>

            <template v-if="kind === 'campaign'">
              <select v-model="s.step_type" class="dm-input flex-1" :disabled="frozen" @change="onCampaignType(s)">
                <option value="send_whatsapp">{{ __('Enviar WhatsApp') }}</option>
                <option value="send_email">{{ __('Enviar Email') }}</option>
                <option value="wait">{{ __('Esperar') }}</option>
                <option value="branch">{{ __('Bifurcación') }}</option>
                <option value="end">{{ __('Fin') }}</option>
              </select>
            </template>
            <template v-else>
              <input
                v-model="s.step_label"
                class="dm-input w-[130px] flex-none"
                :placeholder="__('etiqueta')"
                :disabled="frozen"
                :title="__('Etiqueta única — el motor identifica el paso por ella')"
              />
              <select v-model="s.send_type" class="dm-input flex-1" :disabled="frozen">
                <option value="message">{{ __('Mensaje') }}</option>
                <option value="template">{{ __('Plantilla') }}</option>
                <option value="escalate">{{ __('Escalar a humano') }}</option>
              </select>
            </template>

            <span
              v-if="kind === 'chatflow' && Number(s.wait_hours) > 0"
              class="flex-none rounded-full bg-surface-amber-1 px-2 py-[2px] text-[10.5px] font-semibold text-ink-amber-7"
            >
              ⏳ {{ s.wait_hours }}h
            </span>
            <span class="flex-none text-[10.5px] font-semibold text-ink-gray-4">#{{ i + 1 }}</span>
            <button
              v-if="!frozen"
              class="flex-none text-ink-gray-4 hover:text-ink-red-7"
              @click="removeStep(i)"
              :aria-label="__('Eliminar')"
            >
              ✕
            </button>
          </div>

          <!-- ── campaign per-type config ── -->
          <template v-if="kind === 'campaign'">
            <div v-if="s.step_type === 'wait'" class="flex items-center gap-2 text-[12px]">
              <span class="text-ink-gray-5">{{ __('Esperar') }}</span>
              <input v-model.number="s.wait_hours" type="number" min="0" class="dm-input w-20" :disabled="frozen" />
              <span class="text-ink-gray-5">{{ __('horas') }}</span>
            </div>
            <div v-else-if="s.step_type === 'send_whatsapp'" class="flex items-center gap-2 text-[12px]">
              <span class="text-ink-gray-5">{{ __('Plantilla') }}</span>
              <select v-model="s.template" class="dm-input flex-1" :disabled="frozen">
                <option value="">{{ __('(texto libre / ninguna)') }}</option>
                <option v-for="t in waList" :key="t.name" :value="t.name">{{ waLabel(t) }}</option>
              </select>
              <PreviewToggle v-if="s.template" :open="isPreviewOpen(s)" @toggle="togglePreview(s)" />
            </div>
            <div v-else-if="s.step_type === 'send_email'" class="flex items-center gap-2 text-[12px]">
              <span class="text-ink-gray-5">{{ __('Plantilla') }}</span>
              <select v-model="s.template" class="dm-input flex-1" :disabled="frozen">
                <option value="">{{ __('(ninguna)') }}</option>
                <option v-for="t in emailTemplates.data || []" :key="t.name" :value="t.name">{{ t.name }}</option>
              </select>
            </div>
            <div v-else-if="s.step_type === 'branch'" class="flex flex-wrap items-center gap-2 text-[12px]">
              <select v-model="s.branch_condition" class="dm-input" :disabled="frozen">
                <option value="opened_previous">{{ __('Si abrió el anterior') }}</option>
                <option value="clicked_previous">{{ __('Si dio clic anterior') }}</option>
                <option value="score_gte">{{ __('Si score ≥') }}</option>
              </select>
              <input
                v-if="s.branch_condition === 'score_gte'"
                v-model.number="s.branch_value"
                type="number"
                class="dm-input w-20"
                placeholder="60"
                :disabled="frozen"
              />
              <span class="text-ink-gray-5">→ {{ __('saltar a') }}</span>
              <select v-model.number="s.branch_to_step" class="dm-input" :disabled="frozen">
                <option v-for="j in forwardSteps(i)" :key="j" :value="j">{{ __('Paso') }} {{ j + 1 }}</option>
              </select>
            </div>
            <div
              v-if="(s.step_type === 'send_whatsapp' || s.step_type === 'send_email') && (s.sent || s.opened || s.clicked)"
              class="mt-1.5 text-[11px] text-ink-gray-5"
            >
              {{ s.sent || 0 }} {{ __('enviados') }} · {{ s.opened || 0 }} {{ __('abiertos') }} · {{ s.clicked || 0 }} {{ __('clics') }}
            </div>
          </template>

          <!-- ── chatflow per-type config ── -->
          <template v-else>
            <div v-if="s.send_type === 'message'" class="flex flex-col gap-2 text-[12px]">
              <div class="flex items-center gap-2">
                <span class="text-ink-gray-5">{{ __('Canal') }}</span>
                <select v-model="s.channel" class="dm-input" :disabled="frozen">
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                </select>
              </div>
              <textarea
                v-model="s.message"
                rows="2"
                class="dm-input w-full"
                :placeholder="__('Texto del mensaje (queda en revisión antes de enviarse)')"
                :disabled="frozen"
              />
            </div>
            <div v-else-if="s.send_type === 'template'" class="flex items-center gap-2 text-[12px]">
              <span class="text-ink-gray-5">{{ __('Plantilla') }}</span>
              <select v-model="s.template" class="dm-input flex-1" :disabled="frozen">
                <option value="">—</option>
                <option v-for="t in waList" :key="t.name" :value="t.name">{{ waLabel(t) }}</option>
              </select>
              <PreviewToggle v-if="s.template" :open="isPreviewOpen(s)" @toggle="togglePreview(s)" />
            </div>
            <div v-else-if="s.send_type === 'escalate'" class="flex flex-col gap-2 text-[12px]">
              <div class="flex items-center gap-2">
                <span class="flex-none text-ink-gray-5">{{ __('Asignar a') }}</span>
                <Link
                  class="flex-1"
                  :value="s.assign_to || ''"
                  doctype="User"
                  :disabled="frozen"
                  :placeholder="__('(dueño del trato)')"
                  @change="(v) => (s.assign_to = v)"
                />
              </div>
              <textarea
                v-model="s.message"
                rows="2"
                class="dm-input w-full"
                :placeholder="__('Nota para el humano (opcional)')"
                :disabled="frozen"
              />
            </div>
            <div class="mt-2 flex items-center gap-2 text-[11.5px] text-ink-gray-5">
              <span>{{ __('Espera antes de este paso') }}</span>
              <input v-model.number="s.wait_hours" type="number" min="0" class="dm-input w-16" :disabled="frozen" />
              <span>{{ __('horas (0 = inmediato)') }}</span>
            </div>
          </template>

          <!-- ── WhatsApp template preview (shared) ── -->
          <div v-if="isPreviewOpen(s) && previewTpl(s)" class="mt-2">
            <div class="rounded-[10px] bg-surface-green-2 px-3 py-2">
              <div class="whitespace-pre-wrap text-[12px] leading-relaxed text-ink-gray-8">
                <template v-for="(part, k) in tplParts(previewTpl(s).template)" :key="k">
                  <span
                    v-if="k % 2 === 1"
                    class="mx-[1px] rounded bg-surface-amber-1 px-1 font-mono text-[11px] font-semibold text-ink-amber-7"
                  >{{ part }}</span>
                  <span v-else>{{ part }}</span>
                </template>
              </div>
              <div v-if="previewTpl(s).footer" class="mt-1 text-[11px] text-ink-gray-5">
                {{ previewTpl(s).footer }}
              </div>
            </div>
            <div class="mt-1 flex items-center gap-2 text-[10.5px] text-ink-gray-4">
              <span>{{ variablesHint }}</span>
              <span
                v-if="previewTpl(s).status && previewTpl(s).status !== 'APPROVED'"
                class="rounded bg-surface-amber-1 px-1.5 py-[1px] font-semibold text-ink-amber-7"
              >
                {{ previewTpl(s).status }}
              </span>
            </div>
          </div>
        </div>
        <div v-if="i < steps.length - 1" class="ml-[18px] h-3 w-px bg-outline-gray-2" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createListResource } from 'frappe-ui'
import Sortable from 'sortablejs'
import GripIcon from '~icons/lucide/grip-vertical'
import Link from '@/components/Controls/Link.vue'

const props = defineProps({
  kind: { type: String, required: true }, // 'campaign' | 'chatflow'
  frozen: { type: Boolean, default: false },
  frozenHint: { type: String, default: '' },
})
const steps = defineModel({ type: Array, required: true })

// ── template sources ─────────────────────────────────────────────────────────
const waTemplates = createListResource({
  doctype: 'WhatsApp Templates',
  fields: ['name', 'template_name', 'template', 'footer', 'status'],
  pageLength: 200,
  auto: true,
})
const emailTemplates = createListResource({
  doctype: 'Email Template',
  fields: ['name'],
  pageLength: 100,
  auto: props.kind === 'campaign',
})
const waList = computed(() => waTemplates.data || [])
function waLabel(t) {
  const label = t.template_name || t.name
  return t.status && t.status !== 'APPROVED' ? `${label} (${t.status})` : label
}

// ── stable keys without polluting the payload ────────────────────────────────
let seq = 0
const uids = new WeakMap()
function uid(s) {
  if (!uids.has(s)) uids.set(s, ++seq)
  return uids.get(s)
}

// ── drag reorder ─────────────────────────────────────────────────────────────
const listEl = ref(null)
const listKey = ref(0)
let sortable = null
function mountSortable() {
  sortable?.destroy()
  sortable = null
  if (!listEl.value || props.frozen) return
  sortable = Sortable.create(listEl.value, {
    handle: '.drag-h',
    animation: 150,
    onEnd({ oldIndex, newIndex }) {
      if (oldIndex === newIndex || oldIndex == null || newIndex == null) return
      const moved = steps.value.splice(oldIndex, 1)[0]
      steps.value.splice(newIndex, 0, moved)
      listKey.value++ // re-key: Vue re-owns the DOM Sortable just mutated
    },
  })
}
onMounted(mountSortable)
watch(
  () => [props.frozen, listKey.value],
  () => setTimeout(mountSortable),
)
onBeforeUnmount(() => sortable?.destroy())

// ── step CRUD ────────────────────────────────────────────────────────────────
function addStep() {
  if (props.kind === 'campaign') {
    steps.value.push({
      step_type: 'send_whatsapp',
      channel: 'whatsapp',
      wait_hours: 0,
      template: '',
      branch_condition: 'opened_previous',
    })
    return
  }
  // chatflow labels must be unique + non-blank (server guard) — prefill one
  const labels = new Set(steps.value.map((x) => (x.step_label || '').trim().toLowerCase()))
  let n = steps.value.length + 1
  while (labels.has(`paso-${n}`)) n++
  steps.value.push({
    step_label: `paso-${n}`,
    send_type: 'message',
    channel: 'whatsapp',
    template: '',
    message: '',
    assign_to: '',
    wait_hours: 0,
  })
}
function removeStep(i) {
  steps.value.splice(i, 1)
}
function onCampaignType(s) {
  s.channel = s.step_type === 'send_whatsapp' ? 'whatsapp' : s.step_type === 'send_email' ? 'email' : ''
}
function forwardSteps(i) {
  const out = []
  for (let j = i + 1; j < steps.value.length; j++) out.push(j)
  return out
}

// ── glyphs ───────────────────────────────────────────────────────────────────
const CAMPAIGN_GLYPH = { send_whatsapp: '💬', send_email: '✉', wait: '⏳', branch: '🔀', end: '⏹' }
const CHATFLOW_GLYPH = { message: '💬', template: '📋', escalate: '🚨' }
function glyph(s) {
  return props.kind === 'campaign' ? CAMPAIGN_GLYPH[s.step_type] || '•' : CHATFLOW_GLYPH[s.send_type] || '•'
}

// ── template preview ─────────────────────────────────────────────────────────
const openPreviews = ref(new Set())
function isPreviewOpen(s) {
  return openPreviews.value.has(uid(s))
}
function togglePreview(s) {
  const k = uid(s)
  const next = new Set(openPreviews.value)
  next.has(k) ? next.delete(k) : next.add(k)
  openPreviews.value = next
}
function previewTpl(s) {
  return waList.value.find((t) => t.name === s.template)
}
function tplParts(body) {
  // odd indexes = {{n}} tokens (split with a capture group keeps them)
  return String(body || '').split(/(\{\{\s*\d+\s*\}\})/g)
}
// built in script — a literal `{{n}}` inside a template interpolation would
// terminate the interpolation early and break the SFC parse
const variablesHint = __('Las variables {0} se llenan al enviar', ['{' + '{n}' + '}'])

const PreviewToggle = (p, { emit }) =>
  h(
    'button',
    {
      class:
        'flex-none rounded-md border border-outline-gray-2 px-2 py-1 text-[11px] font-medium text-ink-gray-6 hover:bg-surface-gray-2',
      onClick: () => emit('toggle'),
    },
    (p.open ? '▴ ' : '▾ ') + __('Vista previa'),
  )
PreviewToggle.props = ['open']
PreviewToggle.emits = ['toggle']
</script>

<style scoped>
.dm-input {
  border: 1px solid var(--outline-gray-2, #e4e7ec);
  border-radius: 8px;
  padding: 5px 9px;
  font-size: 12px;
  background: var(--surface-gray-2);
  color: var(--ink-gray-8);
}
.dm-input:focus {
  outline: none;
  background: var(--surface-base);
  border-color: var(--outline-green-4);
}
.dm-input:disabled {
  opacity: 0.6;
}
</style>
