<template>
  <div
    class="inquiry-workspace flex min-h-0 w-full flex-1 flex-col overflow-y-auto bg-surface-gray-2"
    data-testid="inquiries-page"
  >
    <header
      class="flex min-h-[52px] flex-none flex-wrap items-center justify-between gap-3 border-b border-outline-gray-1 bg-surface-base px-5 py-3"
    >
      <div>
        <h1 class="text-lg font-semibold text-ink-gray-9">
          {{ __('Consultas') }}
        </h1>
        <p class="mt-1 text-sm text-ink-gray-6">
          {{ __('Captura, identifica personas y da seguimiento desde CRM.') }}
        </p>
      </div>
      <button
        type="button"
        data-testid="open-capture"
        class="inquiry-button inquiry-primary"
        @click="showCapture = true"
      >
        {{ __('Capturar consulta') }}
      </button>
    </header>
    <div class="space-y-4 p-4">
      <CaptureForm
        v-if="actor"
        v-show="showCapture"
        :key="actor"
        :actor="actor"
        :current-actor="currentActor"
        @hide="showCapture = false"
        @created="created"
      />
      <p
        v-if="notice"
        role="status"
        class="rounded-lg bg-surface-green-2 p-3 text-sm text-ink-green-8"
      >
        {{ __(notice) }}
      </p>
      <div
        class="grid items-start gap-4 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]"
      >
        <section
          class="space-y-3 rounded-xl border border-outline-gray-2 bg-surface-base p-4"
          :aria-busy="listBusy"
        >
          <h2 class="font-semibold text-ink-gray-9">
            {{ __('Bandeja de consultas') }}
          </h2>
          <label class="block space-y-1 text-sm text-ink-gray-7">
            <span>{{ __('Filtrar por estado') }}</span>
            <select
              v-model="status"
              data-testid="inquiry-status-filter"
              class="inquiry-input"
            >
              <option value="">{{ __('Todos los estados') }}</option>
              <option
                v-for="value in INQUIRY_STATUSES"
                :key="value"
                :value="value"
              >
                {{ __(INQUIRY_LABELS[value]) }}
              </option>
            </select>
          </label>
          <label class="block space-y-1 text-sm text-ink-gray-7">
            <span>{{ __('Filtrar por responsable') }}</span>
            <select v-model="assignedTo" class="inquiry-input">
              <option value="">{{ __('Todos los accesibles') }}</option>
              <option
                v-if="actor && !assignees.some((user) => user.name === actor)"
                :value="actor"
              >
                {{ __('Asignadas a mí') }}
              </option>
              <option
                v-for="user in assignees"
                :key="user.name"
                :value="user.name"
              >
                {{ user.full_name || user.name }}
              </option>
            </select>
          </label>
          <div v-if="assigneeError" class="space-y-2">
            <p role="alert" class="text-sm text-ink-red-7">
              {{ __('No se pudo cargar la lista de responsables.') }}
            </p>
            <button type="button" class="inquiry-button" @click="loadAssignees">
              {{ __('Reintentar responsables') }}
            </button>
          </div>
          <p v-if="listError" role="alert" class="text-sm text-ink-red-7">
            {{ __(listError.message) }}
          </p>
          <button
            type="button"
            class="inquiry-button"
            :disabled="listBusy"
            @click="loadList"
          >
            {{ listBusy ? __('Cargando…') : __('Actualizar bandeja') }}
          </button>
          <div
            v-if="!listBusy && !listError && !items.length"
            class="space-y-2 py-4 text-sm text-ink-gray-6"
          >
            <p>{{ __('No hay consultas accesibles con estos filtros.') }}</p>
            <button
              type="button"
              class="inquiry-button"
              @click="showCapture = true"
            >
              {{ __('Capturar una consulta manual') }}
            </button>
          </div>
          <ul class="space-y-2">
            <li v-for="item in items" :key="item.name">
              <router-link
                :to="{ name: 'Inquiries', query: { name: item.name } }"
                :aria-current="selectedName === item.name ? 'page' : undefined"
                class="block space-y-1 rounded-lg border p-3"
                :class="
                  selectedName === item.name
                    ? 'border-outline-gray-3 bg-surface-gray-2'
                    : 'border-outline-gray-1 hover:bg-surface-gray-1'
                "
              >
                <div class="break-words font-medium text-ink-gray-9">
                  {{ item.title }}
                </div>
                <div class="text-xs text-ink-gray-6">
                  {{ __(INQUIRY_LABELS[item.status]) }} ·
                  {{ item.assigned_to || __('Sin responsable') }}
                </div>
                <div
                  v-if="item.next_action_at"
                  class="text-xs"
                  :class="
                    overdue(item)
                      ? 'font-semibold text-ink-red-7'
                      : 'text-ink-gray-6'
                  "
                >
                  {{
                    overdue(item)
                      ? __('Acción vencida:')
                      : __('Próxima acción:')
                  }}
                  {{ localDate(item.next_action_at) }}
                </div>
              </router-link>
            </li>
          </ul>
          <div
            class="flex items-center justify-between gap-2 border-t border-outline-gray-1 pt-3"
          >
            <button
              type="button"
              data-testid="inquiry-previous"
              class="inquiry-button"
              :disabled="listBusy || start === 0"
              @click="start -= pageLength"
            >
              {{ __('Anterior') }}
            </button>
            <span class="text-xs text-ink-gray-6">{{
              __('Página {0}', [Math.floor(start / pageLength) + 1])
            }}</span>
            <button
              type="button"
              data-testid="inquiry-next"
              class="inquiry-button"
              :disabled="listBusy || !hasMore"
              @click="start += pageLength"
            >
              {{ __('Siguiente') }}
            </button>
          </div>
        </section>
        <div class="min-w-0 space-y-3">
          <p
            v-if="transferNotice"
            role="status"
            class="rounded-lg bg-surface-green-2 p-3 text-sm text-ink-green-8"
          >
            {{ __(transferNotice) }}
          </p>
          <div
            v-if="detailUpdateAvailable"
            role="status"
            class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-outline-gray-2 bg-surface-base p-3 text-sm text-ink-gray-7"
          >
            <span>{{
              __(
                'Puede haber cambios en las consultas. Recarga para ver los datos actuales; conservaremos tus campos pendientes.',
              )
            }}</span>
            <button
              type="button"
              class="inquiry-button"
              :disabled="detailBusy || !!mutationBusy"
              @click="loadDetail"
            >
              {{ __('Ver datos actuales') }}
            </button>
          </div>
          <p v-if="detailBusy" role="status" class="text-sm text-ink-gray-6">
            {{ __('Cargando consulta…') }}
          </p>
          <div
            v-if="detailError"
            class="space-y-2 rounded-lg border border-outline-gray-2 bg-surface-base p-4"
          >
            <p role="alert" class="text-sm text-ink-red-7">
              {{ __(detailError.message) }}
            </p>
            <button
              type="button"
              class="inquiry-button"
              :disabled="detailBusy"
              @click="loadDetail"
            >
              {{ __('Reintentar consulta') }}
            </button>
          </div>
          <InquiryDetail
            v-if="inquiry"
            :key="`${actor}:${inquiry.name}`"
            :inquiry="inquiry"
            :assignees="assignees"
            :pending="mutationBusy"
            :error="mutationError"
            :mutate="mutate"
            @reload="loadDetail"
          />
          <div
            v-else-if="!selectedName"
            class="rounded-xl border border-dashed border-outline-gray-2 p-8 text-center text-sm text-ink-gray-6"
          >
            {{
              __(
                'Selecciona una consulta para identificar personas, asignar seguimiento o crear un prospecto.',
              )
            }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { dayjsLocal } from 'frappe-ui'
import { sessionStore } from '@/stores/session'
import { globalStore } from '@/stores/global'
import CaptureForm from '@/components/Inquiries/CaptureForm.vue'
import InquiryDetail from '@/components/Inquiries/InquiryDetail.vue'
import { useInquiryWorkspace } from '@/components/Inquiries/useInquiryWorkspace'
import { INQUIRY_STATUSES, INQUIRY_LABELS } from '@/utils/inquiries'

const session = sessionStore()
const { $socket } = globalStore()
const actor = computed(() => session.user || '')
function currentActor() {
  return actor.value
}
const route = useRoute()
const router = useRouter()
const selectedName = computed(() =>
  typeof route.query.name === 'string' ? route.query.name : '',
)
const showCapture = ref(route.query.capture === '1')
const notice = ref('')
const {
  items,
  hasMore,
  start,
  status,
  assignedTo,
  pageLength,
  listBusy,
  listError,
  inquiry,
  detailBusy,
  detailError,
  detailUpdateAvailable,
  transferNotice,
  mutationBusy,
  mutationError,
  assignees,
  assigneeError,
  loadList,
  loadDetail,
  loadAssignees,
  mutate,
} = useInquiryWorkspace(actor, selectedName, { socket: $socket })

watch(
  () => route.query.capture,
  (value) => {
    if (value === '1') showCapture.value = true
  },
)
watch(actor, () => {
  notice.value = ''
  showCapture.value = false
})
function localDate(value) {
  return dayjsLocal(value).format('D MMM YYYY, HH:mm')
}
function overdue(item) {
  return (
    item.status !== 'Closed' &&
    dayjsLocal(item.next_action_at).valueOf() < Date.now()
  )
}
function created(value) {
  notice.value =
    'Consulta guardada. Selecciona a cada persona antes de crear o vincular un prospecto.'
  showCapture.value = false
  void loadList()
  void router.push({ name: 'Inquiries', query: { name: value.name } })
}
</script>

<style>
.inquiry-workspace .inquiry-input {
  @apply block w-full rounded-lg border border-outline-gray-2 bg-surface-base px-3 py-2 text-sm text-ink-gray-9 focus:border-outline-gray-3;
}
.inquiry-workspace .inquiry-button {
  @apply rounded-lg border border-outline-gray-2 bg-surface-base px-3 py-2 text-sm font-medium text-ink-gray-8 hover:bg-surface-gray-2 disabled:cursor-not-allowed disabled:opacity-50;
}
.inquiry-workspace .inquiry-primary {
  @apply border-transparent bg-surface-gray-10 text-ink-base hover:bg-surface-gray-8;
}
</style>
