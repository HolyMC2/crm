<!--
  Chatflows — visual step editor for bot flows (NEXT_BETS bet #3). First SPA
  surface for the Chatflow doctype (Desk-only before). Manager-gated server-side
  (doco_marketing.api.chatflow editor endpoints, System/Sales Manager).
  Left: flow list. Right: flags + shared StepCardList (kind="chatflow").
-->
<template>
  <div class="flex min-h-0 w-full flex-1 flex-col bg-surface-base">
    <!-- toolbar -->
    <div class="flex h-[52px] flex-none items-center justify-between border-b border-outline-gray-1 px-5">
      <div class="flex items-center gap-2">
        <button class="text-[13px] text-ink-gray-5 hover:text-ink-gray-9" @click="$router.push('/campaigns')">
          ← {{ __('Campañas') }}
        </button>
        <span class="text-ink-gray-4">/</span>
        <span class="text-[15px] font-bold text-ink-gray-9">{{ __('Flujos de bot') }}</span>
        <span class="rounded-full bg-surface-gray-2 px-[9px] py-0.5 text-[11.5px] font-semibold text-ink-gray-6">
          {{ rows.length }}
        </span>
      </div>
      <button
        class="rounded-lg px-3.5 py-[7px] text-[12.5px] font-semibold text-white"
        style="background: var(--brand)"
        @click="newFlow"
      >
        + {{ __('Nuevo flujo') }}
      </button>
    </div>

    <div v-if="forbidden" class="p-8 text-center text-[13px] text-ink-gray-5">
      {{ __('Solo los gestores pueden editar flujos de bot.') }}
    </div>

    <div v-else class="flex min-h-0 flex-1">
      <!-- flow list -->
      <div class="scb min-h-0 w-[300px] flex-none overflow-y-auto border-r border-outline-gray-1 p-3">
        <div v-if="flows.loading && !rows.length" class="py-8 text-center text-xs text-ink-gray-4">{{ __('Cargando…') }}</div>
        <div v-else-if="!rows.length" class="py-8 text-center text-xs text-ink-gray-4">{{ __('Sin flujos. Crea el primero.') }}</div>
        <button
          v-for="f in rows"
          :key="f.name"
          class="mb-1.5 block w-full rounded-[10px] border px-3 py-2.5 text-left"
          :class="selectedName === f.name ? 'border-outline-green-4 bg-surface-green-2' : 'border-outline-gray-2 hover:bg-surface-gray-2'"
          @click="selectFlow(f.name)"
        >
          <div class="flex items-center gap-2">
            <span class="h-2 w-2 flex-none rounded-full" :style="`background:${f.enabled ? 'var(--brand)' : 'var(--outline-gray-2)'}`" />
            <span class="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink-gray-9">{{ f.flow_name }}</span>
            <span v-if="f.auto_send" class="flex-none rounded bg-surface-amber-1 px-1.5 py-[1px] text-[10px] font-semibold text-ink-amber-7">AUTO</span>
          </div>
          <div class="mt-1 flex items-center gap-2 text-[11px] text-ink-gray-5">
            <span>{{ f.trigger_type === 'Inbound Keyword' ? `🔑 «${f.trigger_keyword || '—'}»` : __('Manual') }}</span>
            <span>· {{ f.steps_count }} {{ __('pasos') }}</span>
            <span v-if="f.active_runs" class="rounded bg-surface-blue-1 px-1.5 py-[1px] font-semibold text-ink-blue-7">
              {{ f.active_runs }} {{ __('en curso') }}
            </span>
          </div>
        </button>
      </div>

      <!-- editor -->
      <div class="scb min-h-0 flex-1 overflow-y-auto p-5">
        <div v-if="!editing" class="py-10 text-center text-xs text-ink-gray-4">
          {{ __('Elige un flujo o crea uno nuevo.') }}
        </div>
        <template v-else>
          <!-- name + actions -->
          <div class="mb-4 flex flex-wrap items-center gap-2">
            <input
              v-if="isNew"
              v-model="form.flow_name"
              class="dm-input min-w-[220px] flex-1 text-[14px] font-bold"
              :placeholder="__('Nombre del flujo (fijo después de crear)')"
            />
            <span v-else class="text-[15px] font-bold text-ink-gray-9">{{ form.flow_name }}</span>
            <span class="rounded-md px-2 py-[3px] text-[11px] font-semibold" :class="form.enabled ? 'bg-surface-green-2 text-ink-green-8' : 'bg-surface-gray-2 text-ink-gray-6'">
              {{ form.enabled ? __('Activo') : __('Inactivo') }}
            </span>
            <div class="flex-1" />
            <button
              v-if="dirty || saving"
              class="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
              style="background: var(--brand)"
              :disabled="saving"
              @click="save"
            >
              {{ saving ? __('Guardando…') : __('Guardar') }}
            </button>
            <button
              v-if="!isNew"
              class="rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold"
              :class="form.enabled ? 'border-outline-amber-4 bg-surface-amber-1 text-ink-amber-7' : 'border-outline-green-4 bg-surface-green-2 text-ink-green-8'"
              @click="toggleEnabled"
            >
              {{ form.enabled ? '⏸ ' + __('Desactivar') : '▶ ' + __('Activar') }}
            </button>
          </div>

          <!-- live-runs banner -->
          <div
            v-if="activeRuns > 0"
            class="mb-4 flex max-w-[640px] items-center gap-3 rounded-[10px] border border-outline-blue-3 bg-surface-blue-1 px-3 py-2 text-[12px] text-ink-blue-7"
          >
            <span class="flex-1">
              {{ __('{0} conversación(es) siguen este flujo — los pasos están congelados hasta que terminen.', [activeRuns]) }}
            </span>
            <button
              class="flex-none rounded-md border border-outline-gray-2 bg-surface-base px-2.5 py-1 text-[11.5px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2"
              @click="cancelRuns"
            >
              {{ __('Cancelar conversaciones') }}
            </button>
          </div>

          <!-- flags -->
          <div class="mb-5 flex max-w-[640px] flex-wrap items-end gap-4">
            <Field :label="__('Disparador')">
              <select v-model="form.trigger_type" class="dm-input">
                <option value="Manual">{{ __('Manual') }}</option>
                <option value="Inbound Keyword">{{ __('Palabra clave entrante') }}</option>
              </select>
            </Field>
            <Field v-if="form.trigger_type === 'Inbound Keyword'" :label="__('Palabra clave')">
              <input v-model="form.trigger_keyword" class="dm-input w-36" :placeholder="__('precio')" />
            </Field>
            <label v-if="form.trigger_type === 'Inbound Keyword'" class="flex items-center gap-1.5 text-[12px] text-ink-gray-7">
              <input v-model="form.handle_new_numbers" type="checkbox" :true-value="1" :false-value="0" />
              {{ __('Crear lead para números nuevos') }}
            </label>
            <label
              v-if="form.trigger_type === 'Inbound Keyword' && !form.handle_new_numbers"
              class="flex items-center gap-1.5 text-[12px] text-ink-gray-7"
            >
              <input v-model="form.reply_unassigned" type="checkbox" :true-value="1" :false-value="0" />
              {{ __('Responder sin crear lead') }}
            </label>
            <label
              v-if="form.enabled"
              class="flex items-center gap-1.5 text-[12px] text-ink-gray-7"
              :title="__('Los pasos de plantilla se envían solos (con log + supresión + ventana 24h). El texto libre siempre pasa por revisión.')"
            >
              <input v-model="form.auto_send" type="checkbox" :true-value="1" :false-value="0" />
              {{ __('Auto-enviar plantillas (sin revisión)') }}
            </label>
          </div>
          <div class="mb-5 max-w-[640px]">
            <Field :label="__('Descripción')">
              <input v-model="form.description" class="dm-input w-full" :placeholder="__('¿Qué hace este flujo?')" />
            </Field>
          </div>

          <!-- steps -->
          <StepCardList
            v-model="form.steps"
            kind="chatflow"
            :frozen="activeRuns > 0"
            :frozen-hint="__('Pasos congelados: hay conversaciones a medio flujo (el motor sigue la posición y la etiqueta de cada paso). Cancélalas o espera a que terminen.')"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, h, ref } from 'vue'
import { createResource, call as frappeCall, toast } from 'frappe-ui'
import StepCardList from '@/components/doco/flows/StepCardList.vue'
import { confirmDialog } from '@/utils/dialogs'

const forbidden = ref(false)
const flows = createResource({
  url: 'doco_marketing.api.chatflow.flows_overview',
  auto: true,
  onError: (e) => {
    if ((e?.messages?.[0] || '').toLowerCase().includes('permission') || e?.exc_type === 'PermissionError')
      forbidden.value = true
  },
})
const rows = computed(() => flows.data || [])

// ── selection / form ─────────────────────────────────────────────────────────
const selectedName = ref('')
const isNew = ref(false)
const editing = ref(false)
const activeRuns = ref(0)
const form = ref(emptyForm())
let loaded = ''
const dirty = computed(() => JSON.stringify(form.value) !== loaded)

function emptyForm() {
  return {
    flow_name: '',
    enabled: 0,
    auto_send: 0,
    trigger_type: 'Manual',
    trigger_keyword: '',
    handle_new_numbers: 0,
    reply_unassigned: 0,
    description: '',
    steps: [],
  }
}

function loadForm(d) {
  form.value = {
    flow_name: d.flow_name || '',
    enabled: d.enabled ? 1 : 0,
    auto_send: d.auto_send ? 1 : 0,
    trigger_type: d.trigger_type || 'Manual',
    trigger_keyword: d.trigger_keyword || '',
    handle_new_numbers: d.handle_new_numbers ? 1 : 0,
    reply_unassigned: d.reply_unassigned ? 1 : 0,
    description: d.description || '',
    steps: (d.steps || []).map((s) => ({
      step_label: s.step_label || '',
      send_type: s.send_type || 'message',
      channel: s.channel || 'whatsapp',
      template: s.template || '',
      message: s.message || '',
      assign_to: s.assign_to || '',
      wait_hours: s.wait_hours || 0,
    })),
  }
  loaded = JSON.stringify(form.value)
}

async function selectFlow(name) {
  try {
    const d = await frappeCall('doco_marketing.api.chatflow.get_flow', { name })
    selectedName.value = name
    isNew.value = false
    editing.value = true
    activeRuns.value = d.active_runs || 0
    loadForm(d)
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo cargar el flujo'))
  }
}

function newFlow() {
  selectedName.value = ''
  isNew.value = true
  editing.value = true
  activeRuns.value = 0
  form.value = emptyForm()
  loaded = '' // new form is always dirty until saved
}

// ── save / toggle / cancel-runs ──────────────────────────────────────────────
const saving = ref(false)
async function save() {
  if (isNew.value && !form.value.flow_name.trim()) {
    toast.error(__('Ponle nombre al flujo.'))
    return
  }
  saving.value = true
  try {
    const payload = { ...form.value }
    if (!isNew.value) payload.name = selectedName.value
    const d = await frappeCall('doco_marketing.api.chatflow.save_flow', { payload: JSON.stringify(payload) })
    selectedName.value = d.name
    isNew.value = false
    activeRuns.value = d.active_runs || 0
    loadForm(d)
    flows.reload()
    toast.success(__('Flujo guardado'))
  } catch (e) {
    // the server message (dup name, frozen steps, guard text) is the real
    // diagnosis — the generic fallback must not point at steps for a name error
    toast.error(e?.messages?.[0] || __('No se pudo guardar el flujo'))
  } finally {
    saving.value = false
  }
}

async function toggleEnabled() {
  if (dirty.value) await save()
  if (dirty.value) return // save failed — don't flip a flow whose edits didn't land
  try {
    const next = form.value.enabled ? 0 : 1
    if (next) {
      // enabling re-runs the controller's content guards via save_flow
      const d = await frappeCall('doco_marketing.api.chatflow.save_flow', {
        payload: JSON.stringify({ name: selectedName.value, enabled: 1 }),
      })
      loadForm(d)
    } else {
      const r = await frappeCall('doco_marketing.api.chatflow.set_enabled', { name: selectedName.value, enabled: 0 })
      form.value.enabled = 0
      form.value.auto_send = r.auto_send ? 1 : 0
      loaded = JSON.stringify(form.value)
    }
    flows.reload()
    toast.success(form.value.enabled ? __('Flujo activado') : __('Flujo desactivado'))
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo cambiar el estado'))
  }
}

function cancelRuns() {
  confirmDialog({
    title: __('Cancelar conversaciones'),
    message: __(
      'Se cancelan {0} conversación(es) a medio flujo — los pasos pendientes ya no se programarán. Un paso que esté saliendo justo en este momento aún puede alcanzar a enviarse.',
      [activeRuns.value],
    ),
    confirmLabel: __('Cancelar conversaciones'),
    onConfirm: async () => {
      try {
        const r = await frappeCall('doco_marketing.api.chatflow.cancel_runs', { flow: selectedName.value })
        toast.success(__('{0} conversación(es) canceladas', [r.cancelled]))
        activeRuns.value = 0
        flows.reload()
      } catch (e) {
        toast.error(e?.messages?.[0] || __('No se pudo cancelar'))
      }
    },
  })
}

// ── tiny presentational helper (same shape as CampaignDetail's) ─────────────
const Field = (props, { slots }) =>
  h('div', { class: 'flex flex-col gap-1' }, [
    h('span', { class: 'text-[10px] font-semibold uppercase tracking-[.07em] text-ink-gray-4' }, props.label),
    slots.default?.(),
  ])
Field.props = ['label']
</script>

<style scoped>
.dm-input {
  border: 1px solid var(--outline-gray-2, #e4e7ec);
  border-radius: 8px;
  padding: 5px 9px;
  font-size: 12px;
  background: var(--surface-gray-2);
  color: var(--text-ink-gray-8);
}
.dm-input:focus {
  outline: none;
  background: var(--surface-base);
  border-color: var(--outline-green-4);
}
</style>
