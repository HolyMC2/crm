<template>
  <!-- Más › Configuración › Asistente para clientes (S46): the customer agent per
       channel, how its replies reach the customer, what it may do, its notices and a
       test chat that sends nothing (doco_marketing api.customer_agent). -->
  <div class="flex h-full flex-col overflow-y-auto">
    <AppBar
      v-if="isPhone"
      back
      back-label="Más"
      title="Asistente para clientes"
      :loading="loading"
    />
    <div class="mx-auto w-full max-w-3xl space-y-4 px-4 pb-28 pt-3">
      <header v-if="!isPhone" class="flex items-center gap-3">
        <h1 class="title-face flex-1 text-xl font-semibold text-ink-gray-9">
          Asistente para clientes
        </h1>
      </header>

      <EmptyState v-if="loading && !data" state="loading" title="Cargando…" />
      <EmptyState
        v-else-if="error && !data"
        state="error"
        title="No se pudo cargar"
        :message="error"
        action="Reintentar"
        @action="load"
      />

      <template v-else-if="data">
        <div
          v-if="data.platform_blockers.length"
          class="space-y-1 rounded-7 bg-surface-gray-2 px-4 py-3 text-sm text-ink-gray-8"
          data-testid="platform-blockers"
        >
          <p
            v-for="reason in data.platform_blockers"
            :key="reason"
            class="flex gap-2"
          >
            <span
              class="lucide-triangle-alert mt-0.5 size-4 flex-none"
              aria-hidden="true"
            />
            {{ reason }}
          </p>
        </div>

        <RouterLink
          v-if="data.review_count"
          :to="{ path: '/inbox', query: { tab: 'aprobar' } }"
          class="state-layer flex min-h-12 items-center gap-3 rounded-7 bg-surface-gray-1 px-4 text-sm text-ink-gray-9"
          data-testid="review-count"
        >
          <span
            class="lucide-inbox size-4 text-ink-gray-6"
            aria-hidden="true"
          />
          <span class="flex-1"> {{ data.review_count }} por aprobar </span>
          <span
            class="lucide-chevron-right size-4 text-ink-gray-5"
            aria-hidden="true"
          />
        </RouterLink>

        <ListGroup tag="ul" data-testid="channels">
          <li
            v-if="!data.accounts.length"
            class="px-4 py-3 text-sm text-ink-gray-7"
          >
            Conecta un WhatsApp, una página o el chat de tu tienda en Canales.
          </li>
          <li
            v-for="account in data.accounts"
            :key="account.provider + account.account_name"
            class="flex min-h-14 items-center gap-3 px-4 py-2"
          >
            <span
              :class="[
                providerIcon(account.provider),
                'size-5 flex-none text-ink-gray-6',
              ]"
              aria-hidden="true"
            />
            <!-- The switch is the row: the channel's name leads, a tap anywhere turns it. -->
            <Switch
              class="min-w-0 flex-1"
              :model-value="account.on"
              :disabled="!data.can_edit || busy === key(account) || blocked"
              :label="account.label"
              :description="providerLabel(account.provider)"
              :data-testid="`channel-${account.provider}`"
              @update:model-value="(on) => toggle(account, on)"
            />
          </li>
        </ListGroup>
        <p v-if="!data.can_edit" class="px-1 text-sm text-ink-gray-6">
          Solo el administrador del sistema enciende y ajusta el asistente.
        </p>

        <section aria-label="Cómo responde" class="space-y-1" role="radiogroup">
          <button
            v-for="mode in modes"
            :key="mode.value"
            type="button"
            role="radio"
            :aria-checked="form.mode === mode.value"
            :disabled="!data.can_edit"
            class="state-layer flex w-full items-center gap-3 rounded-7 px-4 py-3 text-left"
            :class="
              form.mode === mode.value
                ? 'bg-[var(--muelle-secondary-container)] text-[var(--muelle-on-secondary-container)]'
                : 'bg-surface-gray-1 text-ink-gray-9'
            "
            :data-testid="`mode-${mode.value}`"
            @click="form.mode = mode.value"
          >
            <span
              :class="[
                form.mode === mode.value
                  ? 'lucide-circle-dot'
                  : 'lucide-circle',
                'size-5 flex-none',
              ]"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1">
              <span class="flex items-center gap-2 text-base font-medium">
                {{ mode.label }}
                <StatusChip v-if="mode.trial" label="Prueba" tone="warn" />
              </span>
              <span class="block text-sm">{{ mode.line }}</span>
            </span>
          </button>
        </section>

        <div
          class="flex flex-wrap gap-2"
          role="group"
          aria-label="Qué puede hacer"
        >
          <button
            v-for="tool in data.tools"
            :key="tool.name"
            type="button"
            :class="chipClass(form.tools.includes(tool.name))"
            :aria-pressed="form.tools.includes(tool.name)"
            :disabled="!data.can_edit || !tool.available"
            :title="tool.available ? tool.description : tool.blocker"
            :data-testid="`tool-${tool.name}`"
            @click="toggleTool(tool.name)"
          >
            {{ tool.label }}
          </button>
        </div>
        <!-- What a tool lacks on this shop (no store checkout, no online payment). -->
        <ul
          v-if="limits.length"
          class="space-y-1 px-1 text-sm text-ink-gray-7"
          data-testid="tool-limits"
        >
          <li v-for="line in limits" :key="line.name" class="flex gap-2">
            <span
              :class="[
                line.off ? 'lucide-circle-alert' : 'lucide-info',
                'mt-0.5 size-4 flex-none text-ink-gray-6',
              ]"
              aria-hidden="true"
            />
            <span
              ><span class="font-medium text-ink-gray-8"
                >{{ line.label }}:</span
              >
              {{ line.text }}</span
            >
          </li>
        </ul>

        <ListGroup>
          <div class="flex min-h-14 items-center gap-3 px-4 py-2">
            <span
              class="lucide-image size-5 flex-none text-ink-gray-6"
              aria-hidden="true"
            />
            <Switch
              v-model="form.product_cards"
              class="min-w-0 flex-1"
              label="Enviar fotos de productos"
              :description="
                cardsBlocked ? `Activa «${stockLabel}» para mandarlas` : ''
              "
              :disabled="!data.can_edit || cardsBlocked"
              data-testid="product-cards-switch"
            />
          </div>
        </ListGroup>

        <Field
          v-model="form.handoff_text"
          type="textarea"
          label="Al pasar con una persona"
          :rows="2"
          :disabled="!data.can_edit"
          :error="
            form.handoff_text.trim() ? '' : 'Escribe el aviso para el cliente'
          "
        />
        <Field
          v-model="form.closed_text"
          type="textarea"
          label="Fuera de horario"
          :rows="2"
          :disabled="!data.can_edit"
        />
        <Field
          v-model="form.instructions"
          type="textarea"
          label="Indicaciones para el asistente"
          :rows="4"
          :disabled="!data.can_edit"
        />
        <div class="grid gap-3 sm:grid-cols-3">
          <Field
            v-model="form.idle_minutes"
            type="select"
            label="Deja el chat sin respuesta tras"
            :options="idleOptions"
            :disabled="!data.can_edit"
          />
          <Field
            v-model="form.return_hours"
            type="select"
            label="Vuelve después de una persona"
            :options="returnOptions"
            :disabled="!data.can_edit"
          />
          <Field
            v-model="form.max_turns"
            type="number"
            label="Respuestas antes de pasar"
            :disabled="!data.can_edit"
          />
        </div>

        <div class="flex flex-wrap items-center justify-end gap-2 pt-2">
          <Button data-testid="try-open" @click="trying = true">Probar</Button>
          <Button
            v-if="data.can_edit"
            variant="solid"
            :loading="saving"
            :disabled="!dirty || !form.handoff_text.trim()"
            data-testid="save"
            @click="save"
          >
            Guardar
          </Button>
        </div>
      </template>
    </div>

    <BottomSheet
      v-if="trying"
      :open="trying"
      title="Probar el asistente"
      @update:open="(value) => (trying = value)"
    >
      <div class="space-y-3" data-testid="try-sheet">
        <ul class="space-y-2">
          <li
            v-for="(line, index) in tryLines"
            :key="index"
            class="space-y-1.5"
          >
            <p
              v-if="line.text || line.decision"
              class="max-w-[85%] whitespace-pre-wrap rounded-6 px-3 py-2 text-sm"
              :class="
                line.from === 'cliente'
                  ? 'ml-auto bg-[var(--muelle-secondary-container)] text-[var(--muelle-on-secondary-container)]'
                  : 'bg-surface-gray-2 text-ink-gray-9'
              "
            >
              {{ line.text }}
              <span
                v-if="line.decision"
                class="mt-1 block text-xs text-ink-gray-7"
                data-testid="try-decision"
              >
                {{ decisionText(line) }}
              </span>
            </p>
            <ProductCards v-if="line.cards?.length" :cards="line.cards" />
          </li>
        </ul>
        <p v-if="tryError" class="text-sm text-ink-red-6">{{ tryError }}</p>
        <form class="flex items-end gap-2" @submit.prevent="tryReply">
          <Field
            v-model="tryText"
            class="flex-1"
            label="Como cliente"
            :disabled="tryBusy"
          />
          <Button
            variant="solid"
            type="submit"
            :loading="tryBusy"
            :disabled="!tryText.trim()"
            data-testid="try-send"
          >
            Probar
          </Button>
        </form>
      </div>
    </BottomSheet>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { call, toast } from 'frappe-ui'
import {
  AppBar,
  BottomSheet,
  Button,
  EmptyState,
  Field,
  ListGroup,
  StatusChip,
  Switch,
  chipClass,
} from '@/components/ui'
import { isMobile as isPhone } from '@/composables/breakpoint'
import {
  decisionText,
  modes,
  productCards,
  providerIcon,
  providerLabel,
  toolLimits,
} from '@/components/asistente/clientes'
import ProductCards from '@/components/asistente/ProductCards.vue'

const API = 'doco_marketing.api.customer_agent'
const loading = ref(false)
const error = ref('')
const data = ref(null)
const saving = ref(false)
const busy = ref('')
const form = reactive({
  mode: 'borrador',
  tools: [],
  handoff_text: '',
  closed_text: '',
  instructions: '',
  idle_minutes: 60,
  return_hours: 24,
  max_turns: 20,
  product_cards: true,
})
const saved = ref('')
const idleOptions = [15, 30, 60, 120, 240, 480, 1440].map((m) => ({
  value: m,
  label: m < 60 ? `${m} min` : `${m / 60} h`,
}))
const returnOptions = [0, 4, 12, 24, 48].map((h) => ({
  value: h,
  label: h ? `${h} h` : 'De inmediato',
}))
const blocked = computed(() => Boolean(data.value?.platform_blockers?.length))
const limits = computed(() => toolLimits(data.value?.tools))
const STOCK_TOOL = 'public_stock_availability'
const cardsBlocked = computed(() => !form.tools.includes(STOCK_TOOL))
const stockLabel = computed(
  () => data.value?.tools?.find((t) => t.name === STOCK_TOOL)?.label || '',
)
const dirty = computed(() => JSON.stringify(snapshot()) !== saved.value)

function snapshot() {
  return {
    ...form,
    tools: [...form.tools].sort(),
    idle_minutes: Number(form.idle_minutes),
    return_hours: Number(form.return_hours),
    max_turns: Number(form.max_turns),
    product_cards: form.product_cards !== false,
  }
}

function fill(status) {
  data.value = status
  Object.assign(form, status.config, {
    tools: [...(status.config.tools || [])],
  })
  saved.value = JSON.stringify(snapshot())
}

function messageOf(failure, fallback) {
  return failure?.messages?.[0] || failure?.message || fallback
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    fill(await call(`${API}.status`))
  } catch (failure) {
    error.value = messageOf(failure, 'Revisa tu conexión e intenta de nuevo.')
  } finally {
    loading.value = false
  }
}

function key(account) {
  return account.provider + account.account_name
}

function toggleTool(name) {
  form.tools = form.tools.includes(name)
    ? form.tools.filter((t) => t !== name)
    : [...form.tools, name]
}

async function save() {
  saving.value = true
  try {
    fill(
      await call(`${API}.save_config`, { values: JSON.stringify(snapshot()) }),
    )
    toast.success('Guardado.')
  } catch (failure) {
    toast.error(messageOf(failure, 'No se pudo guardar.'))
  } finally {
    saving.value = false
  }
}

async function toggle(account, on) {
  if (dirty.value) {
    toast.error('Guarda los ajustes antes de encender o apagar un canal.')
    return
  }
  busy.value = key(account)
  try {
    fill(
      await call(`${API}.${on ? 'turn_on' : 'turn_off'}`, {
        provider: account.provider,
        account_name: account.account_name,
      }),
    )
    toast.success(
      on ? `Encendido en ${account.label}.` : `Apagado en ${account.label}.`,
    )
  } catch (failure) {
    toast.error(messageOf(failure, 'No se pudo cambiar.'))
  } finally {
    busy.value = ''
  }
}

const trying = ref(false)
const tryText = ref('')
const tryBusy = ref(false)
const tryError = ref('')
const tryLines = ref([])

async function tryReply() {
  const text = tryText.value.trim()
  if (!text) return
  tryBusy.value = true
  tryError.value = ''
  const history = tryLines.value.map((l) => ({ from: l.from, text: l.text }))
  tryLines.value = [...tryLines.value, { from: 'cliente', text }]
  tryText.value = ''
  try {
    const out = await call(`${API}.try_reply`, {
      text,
      history: JSON.stringify(history),
    })
    tryLines.value = [
      ...tryLines.value,
      {
        from: 'asistente',
        text: out.reply,
        decision: out.decision,
        reason: out.reason,
        cards: productCards(out.cards),
      },
    ]
  } catch (failure) {
    tryError.value = messageOf(failure, 'No se pudo probar en este momento.')
  } finally {
    tryBusy.value = false
  }
}

onMounted(load)
</script>
