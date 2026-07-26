<!--
  Campaigns list — FCRM redesign (handoff §5.5). Marketing automation surface,
  net-new (no upstream equivalent). Data via doco_marketing.api.campaigns.list_campaigns.
-->
<template>
  <div class="flex min-h-0 w-full flex-1 flex-col bg-surface-white">
    <!-- toolbar -->
    <div class="flex h-[52px] flex-none items-center justify-between border-b border-outline-gray-1 px-5">
      <div class="flex items-center gap-2">
        <span class="text-[15px] font-bold text-ink-gray-9">{{ modeLabel }}</span>
        <span class="rounded-full bg-surface-gray-2 px-[9px] py-0.5 text-[11.5px] font-semibold text-ink-gray-6">
          {{ rows.length }}
        </span>
        <!-- Campañas | Cadencias mode toggle (spec 4.2 completion) -->
        <div class="ml-1 flex items-center gap-0.5 rounded-full bg-surface-gray-2 p-0.5">
          <button
            v-for="m in modeTabs"
            :key="m.key"
            class="press rounded-full px-3 py-[4px] text-[12px] font-semibold"
            :class="mode === m.key ? 'bg-surface-white text-ink-gray-9 shadow-sm' : 'text-ink-gray-6'"
            :aria-pressed="mode === m.key"
            @click="setMode(m.key)"
          >
            {{ m.label }}
          </button>
        </div>
        <template v-if="mode === 'campaigns'">
          <div class="mx-1 h-[18px] w-px bg-outline-gray-2" />
          <button
            v-for="t in typeTabs"
            :key="t.key"
            class="rounded-full px-3 py-[5px] text-[12px] font-semibold"
            :class="typeFilter === t.key ? 'bg-surface-gray-3 text-ink-gray-9' : 'bg-surface-gray-2 text-ink-gray-6'"
            @click="setType(t.key)"
          >
            {{ t.label }}
          </button>
        </template>
      </div>
      <div class="flex items-center gap-2">
        <button
          v-if="mode === 'campaigns'"
          class="rounded-lg border border-outline-gray-2 px-3 py-[7px] text-[12.5px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2"
          @click="$router.push('/chatflows')"
        >
          🤖 {{ __('Flujos de bot') }}
        </button>
        <button
          v-if="mode === 'campaigns'"
          class="rounded-lg px-3.5 py-[7px] text-[12.5px] font-semibold text-white"
          style="background: var(--brand)"
          @click="showNew = true"
        >
          + {{ __('Nueva campaña') }}
        </button>
        <button
          v-else
          class="rounded-lg px-3.5 py-[7px] text-[12.5px] font-semibold text-white disabled:opacity-50"
          style="background: var(--brand)"
          :disabled="creatingCadence"
          @click="createCadence"
        >
          + {{ creatingCadence ? __('Creando…') : __('Cadencia') }}
        </button>
      </div>
    </div>

    <!-- table header -->
    <div
      class="grid flex-none items-center border-b border-outline-gray-1 bg-surface-gray-1 px-5 text-[10.5px] font-semibold uppercase tracking-[.07em] text-ink-gray-4"
      :style="`grid-template-columns:${GRID};height:34px`"
    >
      <div>{{ mode === 'cadences' ? __('Cadencia') : __('Campaña') }}</div>
      <div>{{ __('Tipo') }}</div>
      <div>{{ __('Estado') }}</div>
      <div v-if="mode === 'campaigns'">{{ __('Inscritos') }}</div>
      <div>{{ __('Apertura') }}</div>
      <div>{{ __('Clics') }}</div>
      <div />
    </div>

    <!-- rows -->
    <div class="scb min-h-0 flex-1 overflow-y-auto">
      <div v-if="campaigns.loading && !rows.length" class="py-10 text-center text-xs text-ink-gray-4">{{ __('Cargando…') }}</div>
      <div v-else-if="!rows.length" class="py-10 text-center text-xs text-ink-gray-4">{{ emptyLabel }}</div>

      <div
        v-for="c in rows"
        :key="c.name"
        class="grid cursor-pointer items-center border-b border-outline-gray-1 px-5 hover:bg-surface-gray-2"
        :style="`grid-template-columns:${GRID};min-height:54px`"
        @click="$router.push(`/campaigns/${c.name}`)"
      >
        <div class="min-w-0">
          <div class="truncate text-[13px] font-semibold text-ink-gray-9">{{ c.title }}</div>
          <div class="truncate text-[11px] text-ink-gray-4">{{ mode === 'cadences' ? c.name : (c.audience || c.name) }}</div>
        </div>
        <div>
          <span class="rounded-md px-2 py-[3px] text-[11px] font-semibold" :class="typeChip(c.type)">{{ typeLabel(c.type) }}</span>
        </div>
        <div>
          <span class="rounded-md px-2 py-[3px] text-[11px] font-semibold" :class="statusChip(c.status)">{{ c.status }}</span>
        </div>
        <div v-if="mode === 'campaigns'" class="text-[13px] font-semibold text-ink-gray-8">{{ c.enrolled_count || 0 }}</div>
        <div><Bar :pct="c.open_rate" color="var(--brand)" /></div>
        <div><Bar :pct="c.click_rate" color="#2f6fed" /></div>
        <Dropdown :options="rowMenu(c)" @click.stop>
          <button class="text-[14px] text-ink-gray-4" @click.stop>···</button>
        </Dropdown>
      </div>
    </div>

    <!-- new campaign dialog -->
    <Dialog v-model="showNew" :options="{ title: __('Nueva campaña') }">
      <template #body-content>
        <div class="flex flex-col gap-3">
          <FormControl :label="__('Título')" v-model="form.title" :placeholder="__('Reactivación clientes')" />
          <FormControl
            type="select"
            :label="__('Tipo')"
            v-model="form.type"
            :options="[
              { label: 'WhatsApp', value: 'whatsapp' },
              { label: 'Email', value: 'email' },
              { label: 'SMS', value: 'sms' },
              { label: 'Automatización', value: 'automation' },
            ]"
          />
        </div>
      </template>
      <template #actions>
        <Button variant="solid" :loading="creating" :disabled="!form.title.trim()" @click="createCampaign">
          {{ __('Crear') }}
        </Button>
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { computed, h, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Dropdown, Dialog, Button, FormControl, createResource, call as frappeCall, toast } from 'frappe-ui'
import { confirmDialog } from '@/utils/dialogs'
import { buildCadenceScaffold } from '@/utils/cadenceScaffold'

// Cadences drop the «Inscritos» (enrolled) column — they are 1:1, enrolled from
// the deal header, so an audience-size count is meaningless for them (spec 4.2).
const GRID_CAMPAIGNS = '1fr 120px 110px 90px 130px 130px 26px'
const GRID_CADENCES = '1fr 120px 110px 130px 130px 26px'
const router = useRouter()

// ── Campañas | Cadencias mode ────────────────────────────────────────────────
const mode = ref('campaigns') // 'campaigns' | 'cadences'
const modeTabs = [
  { key: 'campaigns', label: __('Campañas') },
  { key: 'cadences', label: __('Cadencias') },
]
const modeLabel = computed(() => (mode.value === 'cadences' ? __('Cadencias') : __('Campañas')))
const emptyLabel = computed(() => (mode.value === 'cadences' ? __('Sin cadencias') : __('Sin campañas')))
const GRID = computed(() => (mode.value === 'cadences' ? GRID_CADENCES : GRID_CAMPAIGNS))

const typeFilter = ref(null)
const typeTabs = [
  { key: null, label: __('Todas') },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'email', label: 'Email' },
  { key: 'sms', label: 'SMS' },
  { key: 'automation', label: __('Automatización') },
]

const campaigns = createResource({ url: 'doco_marketing.api.campaigns.list_campaigns', params: {}, auto: true })
const rows = computed(() => campaigns.data || [])

// Compose the list params from the active mode + (campaigns-only) type filter.
function reloadList() {
  const params = {}
  if (mode.value === 'cadences') params.cadences = 1
  else if (typeFilter.value) params.type = typeFilter.value
  campaigns.submit(params)
}
function setMode(key) {
  if (mode.value === key) return
  mode.value = key
  reloadList()
}
function setType(key) {
  typeFilter.value = key
  reloadList()
}

const TYPE_META = {
  whatsapp: ['WhatsApp', 'var(--brand)', 'var(--brand-soft)'],
  email: ['Email', '#2f6fed', '#eaf1fe'],
  sms: ['SMS', '#7b3fa0', '#f3e9fb'],
  automation: ['Auto', '#b9790a', '#fdf6e9'],
}
function typeLabel(t) {
  return TYPE_META[t]?.[0] || t
}
// native subtle Badge pairings (theme-aware) — bound via :class
const TYPE_CHIP = {
  whatsapp: 'text-ink-green-3 bg-surface-green-2',
  email: 'text-ink-blue-2 bg-surface-blue-1',
  sms: 'text-ink-violet-1 bg-surface-violet-1',
  automation: 'text-ink-amber-3 bg-surface-amber-1',
}
function typeChip(t) {
  return TYPE_CHIP[t] || 'text-ink-gray-6 bg-surface-gray-2'
}
const STATUS_CHIP = {
  Active: 'text-ink-green-3 bg-surface-green-2',
  Paused: 'text-ink-amber-3 bg-surface-amber-1',
  Draft: 'text-ink-gray-6 bg-surface-gray-2',
  Completed: 'text-ink-blue-2 bg-surface-blue-1',
}
function statusChip(s) {
  return STATUS_CHIP[s] || 'text-ink-gray-6 bg-surface-gray-2'
}

const Bar = (props) =>
  h('div', { class: 'flex items-center gap-1.5' }, [
    h('div', { class: 'h-1.5 rounded-sm bg-surface-gray-3', style: 'width:54px' }, [
      h('div', { class: 'h-full rounded-sm', style: `width:${Math.min(100, props.pct || 0)}%;background:${props.color}` }),
    ]),
    h('span', { class: 'text-[11px] text-ink-gray-5' }, `${props.pct || 0}%`),
  ])
Bar.props = ['pct', 'color']

function rowMenu(c) {
  const items = [{ label: __('Abrir'), onClick: () => router.push(`/campaigns/${c.name}`) }]
  // status-aware: Draft→Activar, Active→Pausar, Paused→Reanudar (Completed: none)
  if (c.status === 'Active') items.push({ label: __('Pausar'), onClick: () => setStatus(c.name, 'Paused') })
  else if (c.status === 'Paused') items.push({ label: __('Reanudar'), onClick: () => setStatus(c.name, 'Active') })
  else if (c.status === 'Draft') items.push({ label: __('Activar'), onClick: () => setStatus(c.name, 'Active') })
  items.push({ label: __('Eliminar'), onClick: () => deleteCampaign(c.name) })
  return items
}
async function setStatus(name, status) {
  await frappeCall('doco_marketing.api.campaigns.set_status', { name, status })
  toast.success(__('Estado actualizado'))
  campaigns.reload()
}
function deleteCampaign(name) {
  confirmDialog({
    title: __('Eliminar campaña'),
    message: __('¿Eliminar esta campaña?'),
    confirmLabel: __('Eliminar'),
    onConfirm: async () => {
      await frappeCall('frappe.client.delete', { doctype: 'CRM Campaign', name })
      toast.success(__('Campaña eliminada'))
      campaigns.reload()
    },
  })
}

// new campaign
const showNew = ref(false)
const creating = ref(false)
const form = ref({ title: '', type: 'whatsapp' })
async function createCampaign() {
  if (!form.value.title.trim() || creating.value) return
  creating.value = true
  try {
    const res = await frappeCall('doco_marketing.api.campaigns.save_campaign', {
      payload: JSON.stringify({ title: form.value.title.trim(), type: form.value.type, status: 'Draft' }),
    })
    showNew.value = false
    form.value = { title: '', type: 'whatsapp' }
    router.push(`/campaigns/${res.name}`)
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo crear'))
  } finally {
    creating.value = false
  }
}

// new cadence — a Draft campaign flagged is_cadence=1 with a día-1/3/7 scaffold
// (wait+send pairs, blank template slots). Opens straight in the editor so the
// operator fills templates then activates; no dialog needed (title/type fixed).
const creatingCadence = ref(false)
async function createCadence() {
  if (creatingCadence.value) return
  creatingCadence.value = true
  try {
    const res = await frappeCall('doco_marketing.api.campaigns.save_campaign', {
      payload: JSON.stringify({
        title: __('Cadencia de seguimiento'),
        type: 'whatsapp',
        status: 'Draft',
        is_cadence: 1,
        enrollment_trigger: 'manual',
        steps: buildCadenceScaffold(),
      }),
    })
    router.push(`/campaigns/${res.name}`)
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo crear la cadencia'))
  } finally {
    creatingCadence.value = false
  }
}
</script>
