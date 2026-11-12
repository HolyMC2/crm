<template>
  <!-- «Dispositivos con sesión abierta»: this one first, then the others by
       last use. Each other one signs out with two taps in place («Cerrar»,
       then «Sí, cerrar»), and so do all of them at once. -->
  <BottomSheet
    :open="open"
    :title="t('Devices signed in')"
    :dismissible="!busy"
    @update:open="(value) => !value && close()"
  >
    <EmptyState
      v-if="failure"
      state="error"
      :message="failure"
      :action="t('Retry')"
      @action="load"
    />
    <div v-else-if="!sessions" class="space-y-3" role="status">
      <div
        v-for="n in 3"
        :key="n"
        class="h-14 animate-pulse rounded-6 bg-surface-gray-2"
      />
    </div>
    <div v-else class="pb-2" data-testid="sesiones-lista">
      <ul class="divide-y divide-outline-gray-1">
        <li
          v-for="row in sessions"
          :key="row.id"
          class="flex min-h-14 items-center gap-3 py-2"
          data-testid="sesion"
        >
          <!-- Under 360 px the name already says the kind («… en iPhone»),
               so the room goes to the name. -->
          <span
            class="flex size-9 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7 max-[359px]:hidden"
            aria-hidden="true"
          >
            <span
              :class="[KIND_ICONS[row.kind] || KIND_ICONS.other, 'size-5']"
            />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-md font-medium text-ink-gray-9">
              {{ row.device }}
              <span
                v-if="row.support"
                class="ml-1 rounded-full bg-surface-gray-2 px-2 py-0.5 text-sm font-normal text-ink-gray-7"
                >{{ t('Support') }}</span
              >
            </span>
            <span class="block text-sm text-ink-gray-6">{{
              sessionLine(row)
            }}</span>
          </span>
          <button
            v-if="!row.current"
            :ref="(el) => (armButtons[row.id] = el)"
            type="button"
            class="press min-h-11 flex-none rounded-full px-3 text-base"
            :class="
              armed === row.id
                ? 'bg-surface-red-1 text-ink-red-7'
                : 'bg-surface-gray-2 text-ink-gray-8'
            "
            :disabled="busy"
            data-testid="sesion-cerrar"
            @click="closeOne(row)"
            @blur="disarm(row.id)"
          >
            {{ armed === row.id ? t('Yes, sign out') : t('Sign out') }}
          </button>
        </li>
      </ul>
      <!-- What a sign-out did, in the sheet: a toast would cover its actions. -->
      <p
        v-if="notice"
        class="flex items-center gap-2 pt-3 text-base text-ink-gray-8"
        role="status"
        data-testid="sesiones-aviso"
      >
        <span class="lucide-check size-5 flex-none" aria-hidden="true" />
        {{ notice }}
      </p>
      <p v-if="trusted > 0" class="pt-3 text-sm text-ink-gray-6">
        {{
          trusted === 1
            ? t(
                '1 browser stays signed in without your password; signing out the other devices ends it.',
              )
            : t(
                '{0} browsers stay signed in without your password; signing out the other devices ends them.',
                [trusted],
              )
        }}
      </p>
    </div>
    <template #actions>
      <button
        v-if="others > 0 || trusted > 0"
        ref="allButton"
        type="button"
        class="press min-h-11 w-full rounded-6 px-4 text-base font-medium"
        :class="
          armed === ALL
            ? 'bg-surface-red-1 text-ink-red-7'
            : 'bg-surface-gray-2 text-ink-gray-8'
        "
        :disabled="busy"
        data-testid="sesiones-cerrar-otras"
        @click="closeOthers"
        @blur="disarm(ALL)"
      >
        {{
          armed === ALL
            ? t('Yes, sign out the other devices')
            : t('Sign out of the other devices')
        }}
      </button>
      <Button class="min-h-11 w-full" :label="t('Done')" @click="close" />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Button, toast } from 'frappe-ui'
import { BottomSheet, EmptyState } from '@/components/ui'
import { errorText } from '@/utils/errorText'
import { formatDate, relativeTime } from '@/utils/display'
import { closeOtherSessions, closeSession, loadSessions } from './perfil'

const props = defineProps({
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'changed'])

const t = (text, replace) => __(text, replace, 'Perfil')
const ALL = '__all__'
// How long a «Cerrar» waits for its second tap.
const DISARM_MS = 4000
const KIND_ICONS = {
  phone: 'lucide-smartphone',
  tablet: 'lucide-smartphone',
  computer: 'lucide-monitor',
  other: 'lucide-monitor-smartphone',
}

const sessions = ref(null)
const trusted = ref(0)
const failure = ref('')
const notice = ref('')
const busy = ref(false)
const armed = ref('')
const armButtons = {}
const allButton = ref(null)
let disarmTimer = null

const others = computed(
  () => (sessions.value || []).filter((row) => !row.current).length,
)

function sessionLine(row) {
  if (row.current) return t('This device')
  const last = relativeTime(row.last_active)
  // «8 nov» stays on one line when the sentence wraps.
  const since = row.started
    ? formatDate(row.started, { relative: false }).replace(/ /g, '\u00a0')
    : ''
  return since
    ? t('Active {0}, since {1}', [last, since])
    : t('Active {0}', [last])
}

async function load() {
  failure.value = ''
  try {
    const out = await loadSessions()
    sessions.value = out?.sessions || []
    trusted.value = Number(out?.trusted_devices || 0)
  } catch (error) {
    sessions.value = null
    failure.value = errorText(
      error,
      t('Your devices could not load. Check your connection and retry.'),
    )
  }
}

watch(
  () => props.open,
  (open) => {
    armed.value = ''
    notice.value = ''
    if (open) load()
  },
  { immediate: true },
)
onBeforeUnmount(() => clearTimeout(disarmTimer))

function close() {
  if (busy.value) return
  emit('close')
}

function disarm(key) {
  if (armed.value !== key || busy.value) return
  clearTimeout(disarmTimer)
  disarmTimer = null
  armed.value = ''
}

async function arm(key, element) {
  armed.value = key
  await nextTick()
  element?.focus?.()
  clearTimeout(disarmTimer)
  disarmTimer = setTimeout(() => disarm(key), DISARM_MS)
}

async function closeOne(row) {
  if (armed.value !== row.id) return arm(row.id, armButtons[row.id])
  clearTimeout(disarmTimer)
  busy.value = true
  try {
    await closeSession(row.id)
    sessions.value = sessions.value.filter((item) => item.id !== row.id)
    notice.value = t('Signed out of {0}', [row.device])
    emit('changed')
  } catch (error) {
    toast.error(
      errorText(error, t('That device was not signed out. Try again.')),
    )
  } finally {
    busy.value = false
    armed.value = ''
  }
}

async function closeOthers() {
  if (armed.value !== ALL) return arm(ALL, allButton.value)
  clearTimeout(disarmTimer)
  busy.value = true
  try {
    const out = await closeOtherSessions()
    sessions.value = out?.sesiones?.sessions || []
    trusted.value = Number(out?.sesiones?.trusted_devices || 0)
    const closed = Number(out?.closed || 0)
    notice.value =
      closed === 1
        ? t('Signed out of 1 other device')
        : t('Signed out of {0} other devices', [closed])
    emit('changed')
  } catch (error) {
    toast.error(
      errorText(error, t('The other devices were not signed out. Try again.')),
    )
  } finally {
    busy.value = false
    armed.value = ''
  }
}
</script>
