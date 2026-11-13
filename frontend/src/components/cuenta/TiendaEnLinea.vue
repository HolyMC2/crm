<template>
  <!-- «Tu tienda en línea» (capability «storefront_address»): the store's
       address with Boat's word on it (Funcionando, Conectando…, Sin
       dirección) and «Elegir dirección» where none is chosen; then «Enciende
       tu tienda»: what this site checks, each step with where it is fixed
       (the store's name right in its step), and «Encender tienda» once all
       pass. A connecting address is read again every few seconds by itself.
       Rows and rules. -->
  <section
    v-if="phase !== 'off'"
    aria-labelledby="cuenta-tienda-en-linea"
    data-testid="cuenta-tienda-en-linea"
  >
    <h2
      id="cuenta-tienda-en-linea"
      class="title-face scroll-mt-16 pb-1 text-xl font-semibold text-ink-gray-9"
    >
      {{ __('Your online store', null, 'Cuenta') }}
    </h2>
    <p
      v-if="phase === 'loading'"
      class="py-3 text-base text-ink-gray-6"
      role="status"
    >
      {{ __('Checking your online store…', null, 'Cuenta') }}
    </p>
    <div v-else-if="phase === 'error'" role="alert" class="space-y-2 py-3">
      <p class="text-base text-ink-gray-8">{{ failure }}</p>
      <Button
        class="min-h-11"
        :label="__('Try again', null, 'Cuenta')"
        @click="load"
      />
    </div>
    <template v-else>
      <div
        id="cuenta-direccion"
        class="scroll-mt-16 space-y-1 py-3"
        data-testid="tienda-direccion"
      >
        <h3 class="text-base font-semibold text-ink-gray-9">
          {{ __('Your store’s address', null, 'Cuenta') }}
        </h3>
        <template v-if="address">
          <div class="flex flex-wrap items-center gap-2">
            <a
              v-if="address.url"
              :href="address.url"
              target="_blank"
              rel="noopener"
              class="min-w-0 break-all text-base font-medium text-ink-gray-9 underline"
              data-testid="tienda-direccion-url"
              >{{ address.address }}</a
            >
            <span
              v-else-if="address.address"
              class="min-w-0 break-all text-base font-medium text-ink-gray-9"
              >{{ address.address }}</span
            >
            <span role="status" aria-live="polite">
              <StatusChip
                :label="address.chip.label"
                :tone="address.chip.tone"
                data-testid="tienda-direccion-estado"
              />
            </span>
          </div>
          <p
            v-if="address.line"
            class="text-sm text-ink-gray-7"
            data-testid="tienda-direccion-linea"
          >
            {{ address.line }}
          </p>
          <div
            v-if="address.blocked"
            class="space-y-2 pt-1"
            role="status"
            data-testid="tienda-direccion-negada"
          >
            <p class="text-sm text-ink-gray-7">{{ address.blocked.text }}</p>
            <Button
              v-if="blockedNext"
              class="min-h-11"
              :label="blockedNext.label"
              @click="$emit('act', blockedNext.act)"
            />
          </div>
          <Button
            v-if="address.canChoose"
            variant="solid"
            class="mt-2 min-h-11 max-sm:w-full"
            :label="__('Choose address', null, 'Cuenta')"
            data-testid="tienda-direccion-elegir"
            @click="openSheet"
          />
        </template>
        <div v-else class="space-y-2" role="status">
          <p class="text-sm text-ink-gray-7">
            {{
              __(
                'We could not check the address. Try again in a moment.',
                null,
                'Cuenta',
              )
            }}
          </p>
          <Button
            class="min-h-11"
            :label="__('Try again', null, 'Cuenta')"
            @click="load"
          />
        </div>
      </div>

      <!-- With the online store not on in Muelle, the address part above says
           it once with «Ver complementos»; nothing more here. -->
      <div
        v-if="!block?.hidden"
        class="space-y-2 border-t border-outline-gray-1 py-3"
        data-testid="tienda-encender"
      >
        <h3 class="text-base font-semibold text-ink-gray-9">
          {{ __('Turn on your store', null, 'Cuenta') }}
        </h3>
        <p
          v-if="turnOn?.on"
          class="text-base text-ink-green-8"
          role="status"
          data-testid="tienda-encendida"
        >
          {{ __('Your store is online.', null, 'Cuenta') }}
          <a
            v-if="address?.url"
            :href="address.url"
            target="_blank"
            rel="noopener"
            class="underline"
            >{{ __('See my store', null, 'Cuenta') }}</a
          >
        </p>
        <div
          v-else-if="block"
          class="space-y-2"
          role="status"
          data-testid="tienda-encender-bloqueo"
        >
          <p class="text-sm text-ink-gray-7">{{ block.text }}</p>
          <Button
            v-if="blockNext"
            class="min-h-11"
            :label="blockNext.label"
            @click="$emit('act', blockNext.act)"
          />
        </div>
        <ul
          v-else
          class="divide-y divide-outline-gray-1"
          data-testid="tienda-pasos"
        >
          <li
            v-for="row in rows"
            :key="row.key"
            class="flex items-start gap-3 py-3"
            :data-state="row.state"
            :data-testid="`tienda-paso-${row.key}`"
          >
            <span
              :class="ICON[row.state]"
              class="mt-0.5 size-5 flex-none"
              aria-hidden="true"
            />
            <!-- The way to fix a step sits under its sentence; the address
                 step's way is «Elegir dirección» just above. -->
            <div class="min-w-0 flex-1">
              <p class="text-base text-ink-gray-9">{{ row.label }}</p>
              <p v-if="row.hint" class="text-sm text-ink-gray-7">
                {{ row.hint }}
              </p>
              <RouterLink
                v-if="row.fix?.kind === 'shell'"
                :to="row.fix.to"
                class="press mt-2 inline-flex min-h-11 items-center rounded-6 bg-surface-gray-2 px-3 text-sm font-medium text-ink-gray-8"
                >{{ row.fix.label }}</RouterLink
              >
              <a
                v-else-if="row.fix?.kind === 'href'"
                :href="row.fix.href"
                class="press mt-2 inline-flex min-h-11 items-center rounded-6 bg-surface-gray-2 px-3 text-sm font-medium text-ink-gray-8"
                >{{ row.fix.label }}</a
              >
              <!-- The name buyers see is saved right here (Boat keeps it). -->
              <div
                v-else-if="row.fix?.kind === 'name'"
                class="mt-2 space-y-1"
                data-testid="tienda-nombre-form"
              >
                <label
                  for="cuenta-tienda-nombre"
                  class="block text-sm text-ink-gray-7"
                  >{{ __('Your store’s name', null, 'Cuenta') }}</label
                >
                <!-- A name's width on a desk, not the column's. -->
                <div class="flex max-w-lg flex-wrap gap-2">
                  <input
                    id="cuenta-tienda-nombre"
                    v-model="shopName"
                    type="text"
                    maxlength="80"
                    autocomplete="organization"
                    class="h-11 min-w-0 flex-1 basis-48 rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9 focus:ring-0"
                    data-testid="tienda-nombre"
                    @keydown.enter.prevent="saveName"
                  />
                  <Button
                    class="min-h-11"
                    :label="row.fix.label"
                    :loading="naming"
                    :disabled="naming || !shopName.trim()"
                    data-testid="tienda-nombre-guardar"
                    @click="saveName"
                  />
                </div>
                <p
                  v-if="nameError"
                  role="alert"
                  class="text-sm text-ink-red-7"
                  data-testid="tienda-nombre-error"
                >
                  {{ nameError }}
                </p>
              </div>
            </div>
          </li>
        </ul>
        <template v-if="turnOn && !turnOn.on && !block">
          <Button
            variant="solid"
            class="min-h-11 max-sm:w-full"
            :label="__('Turn on store', null, 'Cuenta')"
            :loading="turning"
            :disabled="!turnOn.can || turning"
            aria-describedby="tienda-encender-motivo"
            data-testid="tienda-encender-boton"
            @click="turnOnNow"
          />
          <p
            v-if="turnOn.reason"
            id="tienda-encender-motivo"
            class="text-sm text-ink-gray-6"
          >
            {{ turnOn.reason }}
          </p>
        </template>
        <div
          v-if="refusal"
          role="alert"
          class="space-y-1"
          data-testid="tienda-encender-negado"
        >
          <p class="text-sm text-ink-red-7">{{ refusal.text }}</p>
          <ul
            v-if="refusal.missing.length"
            class="list-disc space-y-0.5 pl-5 text-sm text-ink-gray-7"
          >
            <li v-for="row in refusal.missing" :key="row.label">
              {{ row.hint ? `${row.label}: ${row.hint}` : row.label }}
            </li>
          </ul>
        </div>
      </div>
    </template>
    <DireccionSheet
      v-if="sheetMounted"
      :open="sheetOpen"
      :zone="address?.zone || ''"
      :suggested="address?.suggested || ''"
      @close="sheetOpen = false"
      @connected="connected"
    />
  </section>
</template>
<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, ref } from 'vue'
import { Button, toast } from 'frappe-ui'
import { StatusChip } from '@/components/ui'
import { seam, storeReadiness, turnOnStore } from './api'
import { failureText, nextStep, refusalView } from './autoservicio'
import {
  POLL_MS,
  addressOff,
  addressView,
  checklistBlock,
  checklistRows,
  turnOnRefusal,
  turnOnView,
} from './tiendaEnLinea'

const DireccionSheet = defineAsyncComponent(
  () => import('./DireccionSheet.vue'),
)

defineEmits(['act'])

const ICON = {
  ok: 'lucide-circle-check text-ink-green-8',
  missing: 'lucide-circle text-ink-gray-5',
  unknown: 'lucide-circle-help text-ink-gray-5',
}

const phase = ref('loading')
const failure = ref('')
const readiness = ref(null)
const addressAnswer = ref(null)
const address = computed(() => addressView(addressAnswer.value))
const rows = computed(() => checklistRows(readiness.value))
const block = computed(() => checklistBlock(readiness.value))
const blockNext = computed(() => nextStep(block.value?.next))
const turnOn = computed(() => turnOnView(readiness.value))
const blockedNext = computed(() => nextStep(address.value?.blocked?.next))

let alive = true
let timer = 0
onBeforeUnmount(() => {
  alive = false
  clearTimeout(timer)
})

function take(out) {
  readiness.value = out
  addressAnswer.value = out?.address ?? null
}

async function load() {
  if (phase.value !== 'ready') phase.value = 'loading'
  try {
    const out = await storeReadiness()
    if (!alive) return
    take(out)
    phase.value = address.value?.hidden ? 'off' : 'ready'
    schedule()
  } catch (error) {
    if (!alive) return
    failure.value = failureText(error)
    phase.value = 'error'
  }
}
load()

// A connecting address is read again until Boat says it answers; then the
// checklist is read again (doco saves the address as the store's domain). A
// refusal ends the reads: Boat switched the choice off (the block hides) or
// does not take the read.
function schedule() {
  clearTimeout(timer)
  if (alive && address.value?.state === 'connecting')
    timer = setTimeout(poll, POLL_MS)
}
async function poll() {
  if (!alive) return
  if (document.visibilityState === 'hidden') return schedule()
  try {
    const out = await seam('storefront_address_state')
    if (!alive) return
    if (out?.ok !== true) {
      if (addressOff(out)) phase.value = 'off'
      return
    }
    addressAnswer.value = out
    if (out.state === 'live') return refreshChecklist()
  } catch {
    // The last answer stays on screen; the next read tries again.
  }
  schedule()
}
async function refreshChecklist() {
  try {
    const out = await storeReadiness()
    if (alive) take(out)
  } catch {
    // The address chip already says it works; the steps catch up on the next visit.
  }
  schedule()
}

const sheetMounted = ref(false)
const sheetOpen = ref(false)
function openSheet() {
  sheetMounted.value = true
  sheetOpen.value = true
}
async function connected(out) {
  sheetOpen.value = false
  addressAnswer.value = out
  toast.success(__('Connecting your address', null, 'Cuenta'))
  await refreshChecklist()
}

// The name buyers see (Boat's storefront_shop_name); the steps are read again.
const shopName = ref('')
const naming = ref(false)
const nameError = ref('')
async function saveName() {
  const name = shopName.value.trim()
  if (naming.value || !name) return
  naming.value = true
  nameError.value = ''
  try {
    const out = await seam('storefront_shop_name', { name })
    if (!alive) return
    if (out?.ok === true) {
      toast.success(__('Name saved', null, 'Cuenta'))
      shopName.value = ''
      await refreshChecklist()
    } else nameError.value = refusalView(out).text
  } catch (error) {
    nameError.value = failureText(error)
  } finally {
    naming.value = false
  }
}

const turning = ref(false)
const refusal = ref(null)
async function turnOnNow() {
  if (turning.value || !turnOn.value?.can) return
  turning.value = true
  refusal.value = null
  try {
    const out = await turnOnStore()
    if (!alive) return
    if (Array.isArray(out?.items)) take(out)
    if (out?.ok === true)
      toast.success(__('Your store is online.', null, 'Cuenta'))
    else refusal.value = turnOnRefusal(out)
  } catch (error) {
    refusal.value = { text: failureText(error), missing: [] }
  } finally {
    turning.value = false
  }
}
</script>
