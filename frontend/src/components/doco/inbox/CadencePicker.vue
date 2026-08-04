<!--
  Cadencia 1:1 (spec 4.2). A follow-up sequence for ONE deal ("no contestó" →
  toque día 1/3/7, se detiene al responder). Header chip that opens a dialog:
  when a cadence is running it shows "Seguimiento activo: X · paso 2/3 · próx. en
  2 d" + Detener; otherwise it lists the active cadences to start.

  Reuses the campaign machinery entirely — enroll/stop just call the perm-checked
  doco_marketing.api.cadence endpoints (which delegate to the same enrollment →
  Send Log → dispatch ledger every campaign uses). Self-contained: prop-driven
  (doctype, name), self-hides for non-deals, emits nothing outside itself.
-->
<template>
  <template v-if="isDeal">
    <button
      class="press flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-outline-gray-2"
      :class="active
        ? 'bg-surface-violet-2 text-ink-violet-8'
        : 'bg-surface-gray-2 text-ink-gray-7 hover:bg-surface-gray-3'"
      :title="active ? __('Seguimiento activo') + ': ' + (status.campaign_title || '') : __('Iniciar seguimiento')"
      :aria-label="__('Cadencia de seguimiento')"
      @click="openDialog"
    >
      <LucideCalendarClock class="h-4 w-4" />
    </button>

    <Dialog v-model="show" :options="{ title: __('Cadencia de seguimiento') }">
      <template #body-content>
        <!-- active enrollment: summary + stop -->
        <div v-if="active" class="flex flex-col gap-3">
          <div class="rounded-xl border border-outline-violet-1 bg-surface-violet-2 p-3">
            <div class="flex items-center gap-1.5 text-[13px] font-semibold text-ink-violet-8">
              <LucideCalendarClock class="h-4 w-4 flex-none" />
              <span class="min-w-0 truncate">{{ status.campaign_title || __('Seguimiento') }}</span>
            </div>
            <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-ink-gray-7">
              <span v-if="stepLabel">{{ stepLabel }}</span>
              <span v-if="stepLabel && nextLabel" class="text-ink-gray-4">·</span>
              <span v-if="nextLabel">{{ __('próx.') }} {{ nextLabel }}</span>
            </div>
          </div>
          <Button
            variant="subtle"
            theme="red"
            :loading="busy"
            :label="__('Detener seguimiento')"
            @click="stop"
          />
        </div>

        <!-- no enrollment: pick a cadence to start -->
        <div v-else class="flex flex-col gap-2">
          <div v-if="loadingList" class="py-6 text-center text-[12.5px] text-ink-gray-4">
            {{ __('Cargando cadencias…') }}
          </div>
          <div v-else-if="!cadences.length" class="py-6 text-center text-[12.5px] text-ink-gray-4">
            {{ __('No hay cadencias activas configuradas.') }}
          </div>
          <button
            v-for="c in cadences"
            v-else
            :key="c.name"
            class="press flex items-center justify-between gap-3 rounded-lg border border-outline-gray-2 bg-surface-base p-3 text-left hover:bg-surface-gray-1 disabled:opacity-50"
            :disabled="busy"
            @click="start(c.name)"
          >
            <span class="min-w-0">
              <span class="block truncate text-[13px] font-semibold text-ink-gray-8">{{ c.title }}</span>
              <span class="block text-[11.5px] text-ink-gray-5">
                {{ c.touches }} {{ c.touches === 1 ? __('toque') : __('toques') }}
              </span>
            </span>
            <span class="flex-none text-[12px] font-semibold text-ink-violet-8">{{ __('Iniciar') }}</span>
          </button>
        </div>
      </template>
    </Dialog>
  </template>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Button, Dialog, call, toast } from 'frappe-ui'
import LucideCalendarClock from '~icons/lucide/calendar-clock'
import { touchLabel, nextTouchLabel } from '@/utils/cadenceStatus'

const props = defineProps({
  // cadences are 1:1 on a CRM Deal; the chip self-hides for leads/other refs.
  doctype: { type: String, default: '' },
  name: { type: String, default: '' },
})

const isDeal = computed(() => props.doctype === 'CRM Deal' && !!props.name)

const show = ref(false)
const status = ref({ active: false })
const cadences = ref([])
const loadingList = ref(false)
const busy = ref(false)

const active = computed(() => !!status.value?.active)
const stepLabel = computed(() =>
  active.value ? touchLabel(status.value.touches_done, status.value.total_touches) : '',
)
const nextLabel = computed(() => (active.value ? nextTouchLabel(status.value.next_run_at) : ''))

async function loadStatus() {
  if (!isDeal.value) {
    status.value = { active: false }
    return
  }
  try {
    status.value = (await call('doco_marketing.api.cadence.enrollment_status', {
      deal: props.name,
    })) || { active: false }
  } catch (e) {
    status.value = { active: false } // 403 on an unreadable deal → chip just hides its state
  }
}

async function loadList() {
  loadingList.value = true
  try {
    const out = await call('doco_marketing.api.cadence.list_cadences')
    cadences.value = out?.cadences || []
  } catch (e) {
    cadences.value = []
  } finally {
    loadingList.value = false
  }
}

function openDialog() {
  show.value = true
  if (!active.value) loadList()
}

async function start(campaign) {
  if (busy.value) return
  busy.value = true
  try {
    status.value = await call('doco_marketing.api.cadence.enroll', { deal: props.name, campaign })
    toast.success(__('Seguimiento iniciado'))
  } catch (e) {
    toast.error(e.messages?.[0] || __('No se pudo iniciar el seguimiento'))
  } finally {
    busy.value = false
  }
}

async function stop() {
  if (busy.value) return
  busy.value = true
  try {
    status.value = await call('doco_marketing.api.cadence.stop', { deal: props.name })
    toast.success(__('Seguimiento detenido'))
  } catch (e) {
    toast.error(e.messages?.[0] || __('No se pudo detener el seguimiento'))
  } finally {
    busy.value = false
  }
}

// Fetch once per conversation change (prop-driven, no polling); close a stale dialog.
watch(
  () => [props.doctype, props.name],
  () => {
    show.value = false
    loadStatus()
  },
  { immediate: true },
)
</script>
