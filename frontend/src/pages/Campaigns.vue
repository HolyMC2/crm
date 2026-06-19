<!--
  Campaigns list — FCRM redesign (handoff §5.5). Marketing automation surface,
  net-new (no upstream equivalent). Data via doco_marketing.api.campaigns.list_campaigns.
-->
<template>
  <div class="flex min-h-0 w-full flex-1 flex-col bg-surface-white">
    <!-- toolbar -->
    <div class="flex h-[52px] flex-none items-center justify-between border-b border-outline-gray-1 px-5">
      <div class="flex items-center gap-2">
        <span class="text-[15px] font-bold text-ink-gray-9">{{ __('Campañas') }}</span>
        <span class="rounded-full px-[9px] py-0.5 text-[11.5px] font-semibold text-ink-gray-6" style="background: #f1f2f4">
          {{ rows.length }}
        </span>
        <div class="mx-1 h-[18px] w-px" style="background: #e4e7ec" />
        <button
          v-for="t in typeTabs"
          :key="t.key"
          class="rounded-full px-3 py-[5px] text-[12px] font-semibold"
          :style="typeFilter === t.key ? 'color:#fff;background:#1c2230' : 'color:#5b6472;background:#f1f2f4'"
          @click="setType(t.key)"
        >
          {{ t.label }}
        </button>
      </div>
      <button
        class="rounded-lg px-3.5 py-[7px] text-[12.5px] font-semibold text-white"
        style="background: #16a34a"
        @click="showNew = true"
      >
        + {{ __('Nueva campaña') }}
      </button>
    </div>

    <!-- table header -->
    <div
      class="grid flex-none items-center border-b border-outline-gray-1 bg-surface-gray-1 px-5 text-[10.5px] font-semibold uppercase tracking-[.07em] text-ink-gray-4"
      :style="`grid-template-columns:${GRID};height:34px`"
    >
      <div>{{ __('Campaña') }}</div>
      <div>{{ __('Tipo') }}</div>
      <div>{{ __('Estado') }}</div>
      <div>{{ __('Inscritos') }}</div>
      <div>{{ __('Apertura') }}</div>
      <div>{{ __('Clics') }}</div>
      <div />
    </div>

    <!-- rows -->
    <div class="scb min-h-0 flex-1 overflow-y-auto">
      <div v-if="campaigns.loading && !rows.length" class="py-10 text-center text-xs text-ink-gray-4">{{ __('Cargando…') }}</div>
      <div v-else-if="!rows.length" class="py-10 text-center text-xs text-ink-gray-4">{{ __('Sin campañas') }}</div>

      <div
        v-for="c in rows"
        :key="c.name"
        class="grid cursor-pointer items-center border-b px-5 hover:bg-surface-gray-1"
        :style="`grid-template-columns:${GRID};min-height:54px;border-color:#f0f1f3`"
        @click="$router.push(`/campaigns/${c.name}`)"
      >
        <div class="min-w-0">
          <div class="truncate text-[13px] font-semibold text-ink-gray-9">{{ c.title }}</div>
          <div class="truncate text-[11px] text-ink-gray-4">{{ c.audience || c.name }}</div>
        </div>
        <div>
          <span class="rounded-md px-2 py-[3px] text-[11px] font-semibold" :style="typeChip(c.type)">{{ typeLabel(c.type) }}</span>
        </div>
        <div>
          <span class="rounded-md px-2 py-[3px] text-[11px] font-semibold" :style="statusChip(c.status)">{{ c.status }}</span>
        </div>
        <div class="text-[13px] font-semibold text-ink-gray-8">{{ c.enrolled_count || 0 }}</div>
        <div><Bar :pct="c.open_rate" color="#16a34a" /></div>
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

const GRID = '1fr 120px 110px 90px 130px 130px 26px'
const router = useRouter()

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
function setType(key) {
  typeFilter.value = key
  campaigns.submit(key ? { type: key } : {})
}

const TYPE_META = {
  whatsapp: ['WhatsApp', '#16a34a', '#e9f7ef'],
  email: ['Email', '#2f6fed', '#eaf1fe'],
  sms: ['SMS', '#7b3fa0', '#f3e9fb'],
  automation: ['Auto', '#b9790a', '#fdf6e9'],
}
function typeLabel(t) {
  return TYPE_META[t]?.[0] || t
}
function typeChip(t) {
  const m = TYPE_META[t] || ['', '#5b6472', '#f1f2f4']
  return `color:${m[1]};background:${m[2]}`
}
const STATUS_META = {
  Active: ['#15803d', '#e9f7ef'],
  Paused: ['#b9790a', '#fdf6e9'],
  Draft: ['#5b6472', '#f1f2f4'],
  Completed: ['#2f6fed', '#eaf1fe'],
}
function statusChip(s) {
  const m = STATUS_META[s] || ['#5b6472', '#f1f2f4']
  return `color:${m[0]};background:${m[1]}`
}

const Bar = (props) =>
  h('div', { class: 'flex items-center gap-1.5' }, [
    h('div', { class: 'h-1.5 rounded-sm', style: 'width:54px;background:#f0f1f3' }, [
      h('div', { class: 'h-full rounded-sm', style: `width:${Math.min(100, props.pct || 0)}%;background:${props.color}` }),
    ]),
    h('span', { class: 'text-[11px] text-ink-gray-5' }, `${props.pct || 0}%`),
  ])
Bar.props = ['pct', 'color']

function rowMenu(c) {
  const toggle = c.status === 'Active' ? 'Paused' : 'Active'
  return [
    { label: __('Abrir'), onClick: () => router.push(`/campaigns/${c.name}`) },
    {
      label: c.status === 'Active' ? __('Pausar') : __('Reanudar'),
      onClick: () => setStatus(c.name, toggle),
    },
  ]
}
async function setStatus(name, status) {
  await frappeCall('doco_marketing.api.campaigns.set_status', { name, status })
  toast.success(status === 'Active' ? __('Reanudada') : __('Pausada'))
  campaigns.reload()
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
</script>
