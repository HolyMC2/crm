<template>
  <!-- «¿Ya llegó?» (crm docs/DINERO_EN_ORDEN.md §3e): a photo of the customer's
       receipt or its amount, bank and tracking key; Banxico answers while the
       customer waits, and the sheet follows the check until it settles. -->
  <BottomSheet
    :open="open"
    :title="check ? '' : '¿Ya llegó la transferencia?'"
    :aria-label="check ? 'Revisión de la transferencia' : ''"
    :subtitle="
      check
        ? ''
        : 'Con la foto del comprobante o sus datos, Muelle la busca en Banxico.'
    "
    :dismissible="!busy"
    layer="transferencia-revisar"
    @update:open="emit('update:open', $event)"
    @closed="reset()"
  >
    <!-- The answer, followed live. -->
    <section
      v-if="check"
      class="flex flex-col items-center pb-2 pt-1 text-center"
      aria-live="polite"
      data-revisar-estado
      :data-estado="check.estado"
    >
      <div class="seal" :class="`seal--${tone}`" aria-hidden="true">
        <svg viewBox="0 0 88 88" class="seal__ring">
          <circle cx="44" cy="44" r="40" class="seal__track" />
          <circle
            v-if="check.estado === 'Searching'"
            cx="44"
            cy="44"
            r="40"
            class="seal__arc"
          />
        </svg>
        <span :class="[estado.icon, 'seal__icon size-9']" />
      </div>
      <p class="title-face mt-3 text-xl font-semibold text-ink-gray-9">
        {{ headline }}
      </p>
      <p class="num mt-1 text-3xl font-semibold text-ink-gray-9">
        {{ money(check.monto, check.currency) }}
      </p>
      <p
        v-if="quienYDesde"
        class="mt-1 break-words text-base text-ink-gray-8"
        data-revisar-quien
      >
        {{ quienYDesde }}
      </p>
      <p
        v-if="check.estado !== 'Arrived'"
        class="mt-2 max-w-sm text-sm text-ink-gray-6"
        data-revisar-motivo
      >
        {{ check.motivo }}
      </p>
      <p
        v-else
        class="mt-2 inline-flex items-center gap-1.5 text-sm text-ink-green-7"
        data-revisar-motivo
      >
        <span class="lucide-landmark size-4" aria-hidden="true" />
        {{
          check.via === 'Bank movement'
            ? 'Está en los movimientos del banco'
            : 'Banxico la confirma'
        }}
      </p>
      <dl
        class="mt-4 grid w-full max-w-sm grid-cols-2 gap-x-4 gap-y-2 rounded-7 bg-surface-gray-1 p-3 text-left text-sm"
      >
        <div v-if="check.clave_rastreo" class="col-span-2 min-w-0">
          <dt class="text-ink-gray-6">Clave de rastreo</dt>
          <dd class="num break-all text-ink-gray-9">
            {{ check.clave_rastreo }}
          </dd>
        </div>
        <div class="min-w-0">
          <dt class="text-ink-gray-6">
            {{ check.estado === 'Arrived' ? 'Llegó a' : 'Llegaría a' }}
          </dt>
          <dd class="break-words text-ink-gray-9">
            {{ bancoCorto(check.cuenta?.banco) || check.cuenta?.nombre }}
            {{ check.cuenta?.ultimos }}
          </dd>
        </div>
        <div class="min-w-0">
          <dt class="text-ink-gray-6">
            {{ check.estado === 'Arrived' ? 'Hora en Banxico' : 'Revisando' }}
          </dt>
          <dd class="num text-ink-gray-9">
            {{
              check.estado === 'Arrived'
                ? check.hora || '—'
                : `${elapsed} · ${check.intentos} ${check.intentos === 1 ? 'consulta' : 'consultas'}`
            }}
          </dd>
        </div>
      </dl>
    </section>

    <!-- The receipt. -->
    <form
      v-else
      class="space-y-4 pb-2"
      data-revisar-form
      @submit.prevent="submit()"
    >
      <input
        ref="fileInput"
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        class="sr-only"
        tabindex="-1"
        aria-hidden="true"
        data-revisar-file
        @change="onFile"
      />
      <button
        type="button"
        class="press flex min-h-16 w-full items-center gap-3 rounded-7 border border-dashed border-outline-gray-3 px-4 text-left"
        :disabled="reading"
        data-revisar-foto
        @click="fileInput?.click()"
      >
        <img
          v-if="photo.preview"
          :src="photo.preview"
          alt=""
          class="size-12 flex-none rounded-5 object-cover"
        />
        <span
          v-else
          class="lucide-camera size-6 flex-none text-ink-gray-7"
          aria-hidden="true"
        />
        <span class="min-w-0 flex-1">
          <span class="block text-base font-medium text-ink-gray-9">
            {{
              reading
                ? 'Leyendo el comprobante…'
                : photo.preview
                  ? 'Otra foto'
                  : 'Foto del comprobante'
            }}
          </span>
          <span class="block text-sm text-ink-gray-6">
            {{
              reading
                ? 'Toma unos segundos.'
                : 'Muelle lee el monto, el banco y la clave de rastreo.'
            }}
          </span>
        </span>
        <span
          v-if="reading"
          class="lucide-loader-circle size-5 flex-none animate-spin text-ink-gray-6 motion-reduce:animate-none"
          aria-hidden="true"
        />
      </button>
      <ul v-if="avisos.length" class="space-y-1" data-revisar-avisos>
        <li
          v-for="a in avisos"
          :key="a"
          class="flex gap-2 rounded-6 bg-surface-amber-1 px-3 py-2 text-sm text-ink-amber-9"
        >
          <span
            class="lucide-triangle-alert mt-0.5 size-4 flex-none"
            aria-hidden="true"
          />
          {{ a }}
        </li>
      </ul>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label
            class="block text-sm font-medium text-ink-gray-7"
            for="trf-monto"
            >Monto</label
          >
          <input
            id="trf-monto"
            v-model="form.monto"
            inputmode="decimal"
            autocomplete="off"
            class="num mt-1 min-h-12 w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-2xl text-ink-gray-9"
            placeholder="$0.00"
            data-revisar-monto
          />
        </div>
        <div>
          <label
            class="block text-sm font-medium text-ink-gray-7"
            for="trf-fecha"
            >Fecha</label
          >
          <input
            id="trf-fecha"
            v-model="form.fecha"
            type="date"
            :max="today"
            class="num mt-1 min-h-12 w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-base text-ink-gray-9"
            data-revisar-fecha
          />
        </div>
      </div>

      <div>
        <p class="text-sm font-medium text-ink-gray-7">
          ¿Desde qué banco o app?
        </p>
        <div
          class="mt-2 flex flex-wrap gap-2"
          role="radiogroup"
          aria-label="¿Desde qué banco o app?"
        >
          <button
            v-for="b in bancosVisibles"
            :key="b.codigo"
            type="button"
            role="radio"
            class="press min-h-11 rounded-full px-4 text-sm"
            :class="
              form.banco_emisor === b.codigo
                ? 'bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
                : 'border border-outline-gray-2 text-ink-gray-8'
            "
            :aria-checked="form.banco_emisor === b.codigo"
            :data-revisar-banco="b.codigo"
            @click="form.banco_emisor = b.codigo"
          >
            {{ bancoCorto(b.nombre) }}
          </button>
          <select
            v-model="otroBanco"
            class="min-h-11 rounded-full border border-dashed border-outline-gray-3 bg-surface-base px-4 text-sm text-ink-gray-7"
            aria-label="Otro banco"
            data-revisar-otro-banco
          >
            <option value="">Otro…</option>
            <option v-for="b in bancos" :key="b.codigo" :value="b.codigo">
              {{ b.nombre }}
            </option>
          </select>
        </div>
      </div>

      <p
        v-if="mismoBanco"
        class="rounded-6 bg-surface-gray-1 px-3 py-2 text-sm text-ink-gray-7"
        data-revisar-mismo-banco
      >
        Entre cuentas de {{ bancoCorto(cuentaElegida?.banco) }} no pasa por
        Banxico: Muelle espera el movimiento en tu banco.
      </p>
      <div v-else>
        <label
          class="block text-sm font-medium text-ink-gray-7"
          :for="form.usarReferencia ? 'trf-ref' : 'trf-clave'"
        >
          {{ form.usarReferencia ? 'Referencia numérica' : 'Clave de rastreo' }}
        </label>
        <input
          v-if="!form.usarReferencia"
          id="trf-clave"
          v-model="form.clave_rastreo"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          class="num mt-1 min-h-12 w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-base uppercase tracking-wide text-ink-gray-9"
          placeholder="Como viene en el comprobante"
          data-revisar-clave
        />
        <input
          v-else
          id="trf-ref"
          v-model="form.referencia"
          inputmode="numeric"
          maxlength="7"
          autocomplete="off"
          class="num mt-1 min-h-12 w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-base text-ink-gray-9"
          placeholder="Hasta 7 dígitos"
          data-revisar-referencia
        />
        <button
          type="button"
          class="press mt-1 min-h-10 text-sm font-medium text-ink-gray-7 underline"
          data-revisar-cambiar-criterio
          @click="form.usarReferencia = !form.usarReferencia"
        >
          {{
            form.usarReferencia
              ? 'Usar la clave de rastreo'
              : '¿No trae clave? Usar la referencia numérica'
          }}
        </button>
      </div>

      <div v-if="cuentas.length > 1">
        <p class="text-sm font-medium text-ink-gray-7">¿A qué cuenta?</p>
        <Segmented
          v-model="form.bank_account"
          class="mt-2"
          label="¿A qué cuenta?"
          :options="
            cuentas.map((c) => ({
              value: c.bank_account,
              label: `${bancoCorto(c.banco)} ${c.ultimos}`,
            }))
          "
        />
      </div>

      <p
        v-if="problem"
        role="alert"
        class="text-sm text-ink-red-7"
        data-revisar-problema
      >
        {{ problem }}
      </p>
      <p v-else-if="falta && touched" class="text-sm text-ink-gray-6">
        {{ falta }}
      </p>
    </form>

    <template #actions>
      <div v-if="check" class="flex flex-wrap gap-2">
        <Button
          v-if="check.estado === 'Does not match'"
          class="min-h-11 flex-1"
          label="Corregir datos"
          data-revisar-corregir
          @click="corregir()"
        />
        <Button
          v-else-if="check.estado === 'Searching'"
          class="min-h-11 flex-1"
          label="Revisar otra"
          data-revisar-otra
          @click="reset()"
        />
        <Button
          v-if="check.puede_reintentar"
          class="min-h-11 flex-1"
          label="Volver a intentar"
          :loading="busy"
          data-revisar-reintentar
          @click="reintentar()"
        />
        <Button
          class="min-h-11 flex-1"
          variant="solid"
          :label="
            check.estado === 'Searching' ? 'Seguir en segundo plano' : 'Listo'
          "
          data-revisar-listo
          @click="emit('update:open', false)"
        />
      </div>
      <div v-else class="flex gap-2">
        <Button
          class="min-h-11 flex-1"
          label="Cancelar"
          :disabled="busy"
          @click="emit('update:open', false)"
        />
        <Button
          class="min-h-11 flex-1"
          variant="solid"
          :label="mismoBanco ? 'Revisar en el banco' : 'Revisar con Banxico'"
          :loading="busy"
          :disabled="reading"
          data-revisar-enviar
          @click="submit()"
        />
      </div>
    </template>
  </BottomSheet>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet, Segmented } from '@/components/ui'
import { prepareImage } from '@/components/ui/imageFiles'
import { errorText, money } from '@/components/bancos/bancos'
import {
  bancoCorto,
  estadoDe,
  faltaParaRevisar,
  hoyIso,
  titleCase,
  transcurrido,
  transferenciasApi,
} from '@/components/dinero/transferencias'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** inicio(): accounts and banks; the page already has them. */
  setup: { type: Object, default: null },
  company: { type: String, default: '' },
  /** Amount the caller expects (a sale's transfer), prefilled. */
  monto: { type: [Number, String], default: '' },
})
const emit = defineEmits(['update:open', 'revisada'])

const POLL_MS = 3000
const today = hoyIso()
const own = ref(null)
const setupData = computed(() => props.setup || own.value)
const cuentas = computed(() => setupData.value?.cuentas || [])
const bancos = computed(() => setupData.value?.bancos || [])
const bancosVisibles = computed(() =>
  bancos.value.filter((b) => b.comun).slice(0, 8),
)

const fileInput = ref(null)
const form = reactive(blank())
const photo = reactive({ preview: '', data: '', filename: '' })
const avisos = ref([])
const reading = ref(false)
const busy = ref(false)
const problem = ref('')
const touched = ref(false)
const check = ref(null)
const now = ref(Date.now())
let poll = null
let clock = null

function blank() {
  return {
    monto: props.monto ? String(props.monto) : '',
    fecha: today,
    banco_emisor: '',
    clave_rastreo: '',
    referencia: '',
    folio: '',
    usarReferencia: false,
    bank_account: '',
  }
}

const cuentaElegida = computed(
  () =>
    cuentas.value.find((c) => c.bank_account === form.bank_account) ||
    cuentas.value[0] ||
    null,
)
const bancoReceptor = computed(() => {
  const name = cuentaElegida.value?.banco
  return bancos.value.find((b) => b.nombre === name)?.codigo || ''
})
const mismoBanco = computed(
  () => Boolean(form.banco_emisor) && form.banco_emisor === bancoReceptor.value,
)
const falta = computed(() =>
  faltaParaRevisar(form, { mismoBanco: mismoBanco.value }),
)
const estado = computed(() => estadoDe(check.value?.estado))
const tone = computed(() => estado.value.tone)
const elapsed = computed(() => transcurrido(check.value?.creada, now.value))
/** «de Ana López, desde Banamex». */
const quienYDesde = computed(() => {
  const c = check.value
  if (!c) return ''
  const who = c.ordenante ? `de ${titleCase(c.ordenante)}` : ''
  const from = c.banco_emisor ? `desde ${bancoCorto(c.banco_emisor)}` : ''
  return [who, from].filter(Boolean).join(', ')
})
/** The «Otro…» picker shows a bank only when it is not one of the chips. */
const otroBanco = computed({
  get: () =>
    bancosVisibles.value.some((b) => b.codigo === form.banco_emisor)
      ? ''
      : form.banco_emisor,
  set: (value) => {
    if (value) form.banco_emisor = value
  },
})
const headline = computed(() => {
  const state = check.value?.estado
  if (state === 'Searching')
    return check.value.mismo_banco
      ? 'Esperando a tu banco'
      : 'Buscando en Banxico'
  return estado.value.label
})

async function loadSetup() {
  if (props.setup || own.value) return
  try {
    own.value = await transferenciasApi('inicio', {
      company: props.company || undefined,
    })
  } catch (e) {
    problem.value = errorText(e)
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      loadSetup()
      if (!form.monto && props.monto) form.monto = String(props.monto)
    } else stop()
  },
  { immediate: true },
)
watch(
  cuentas,
  (list) => {
    if (!form.bank_account && list.length)
      form.bank_account = list[0].bank_account
  },
  { immediate: true },
)

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function onFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  problem.value = ''
  avisos.value = []
  reading.value = true
  try {
    const light = await prepareImage(file, { keepPng: false })
    photo.data = await readAsDataUrl(light)
    photo.preview = light.type?.startsWith('image/')
      ? URL.createObjectURL(light)
      : ''
    photo.filename = light.name || file.name || 'comprobante.jpg'
    const read = await transferenciasApi('leer', {
      foto: photo.data,
      filename: photo.filename,
    })
    const c = read.campos || {}
    if (c.monto) form.monto = String(c.monto)
    if (c.fecha) form.fecha = String(c.fecha).slice(0, 10)
    if (c.banco_emisor && /^\d{4,5}$/.test(String(c.banco_emisor)))
      form.banco_emisor = String(c.banco_emisor)
    if (c.clave_rastreo) {
      form.clave_rastreo = String(c.clave_rastreo)
      form.usarReferencia = false
    } else if (c.referencia) {
      form.referencia = String(c.referencia).replace(/\D/g, '').slice(0, 7)
      form.usarReferencia = true
    }
    if (c.folio) form.folio = String(c.folio)
    if (read.bank_account) form.bank_account = read.bank_account
    avisos.value = read.avisos || []
    if (read.cuenta_ajena)
      avisos.value = [
        ...avisos.value,
        'La cuenta destino del comprobante no es ninguna de tus cuentas.',
      ]
    if (!falta.value && !avisos.value.length) await submit()
  } catch (e) {
    problem.value = errorText(e)
  } finally {
    reading.value = false
  }
}

async function submit() {
  touched.value = true
  if (falta.value || busy.value) return
  busy.value = true
  problem.value = ''
  try {
    const datos = {
      monto: form.monto,
      fecha: form.fecha,
      banco_emisor: form.banco_emisor,
      bank_account: form.bank_account || undefined,
      folio: form.folio || undefined,
      ...(mismoBanco.value
        ? {}
        : form.usarReferencia
          ? { referencia: form.referencia }
          : { clave_rastreo: form.clave_rastreo }),
    }
    check.value = await transferenciasApi('revisar', {
      datos,
      foto: photo.data || undefined,
      filename: photo.filename || undefined,
    })
    emit('revisada', check.value)
    follow()
  } catch (e) {
    problem.value = errorText(e)
  } finally {
    busy.value = false
  }
}

function follow() {
  stop()
  clock = setInterval(() => (now.value = Date.now()), 1000)
  poll = setInterval(async () => {
    if (!check.value || check.value.estado !== 'Searching') return stop()
    try {
      check.value = await transferenciasApi('ver', { name: check.value.name })
      if (check.value.estado !== 'Searching') emit('revisada', check.value)
    } catch {
      // A blip: the next tick asks again.
    }
  }, POLL_MS)
}

function stop() {
  if (poll) clearInterval(poll)
  if (clock) clearInterval(clock)
  poll = clock = null
}

async function reintentar() {
  busy.value = true
  try {
    check.value = await transferenciasApi('reintentar', {
      name: check.value.name,
    })
    follow()
  } catch (e) {
    problem.value = errorText(e)
  } finally {
    busy.value = false
  }
}

function corregir() {
  stop()
  check.value = null
}

function reset() {
  stop()
  check.value = null
  Object.assign(form, blank(), {
    bank_account: cuentas.value[0]?.bank_account || '',
  })
  if (photo.preview) URL.revokeObjectURL(photo.preview)
  Object.assign(photo, { preview: '', data: '', filename: '' })
  avisos.value = []
  problem.value = ''
  touched.value = false
}

onBeforeUnmount(stop)
</script>

<style scoped>
.seal {
  position: relative;
  display: grid;
  place-items: center;
  width: 88px;
  height: 88px;
}
.seal__ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.seal__track {
  fill: none;
  stroke-width: 5;
  stroke: currentColor;
  opacity: 0.18;
}
.seal__arc {
  fill: none;
  stroke-width: 5;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-dasharray: 60 252;
  transform-origin: 44px 44px;
  animation: seal-turn 1.1s linear infinite;
}
.seal--warning {
  color: var(--ink-amber-8, #b45309);
}
.seal--success {
  color: var(--ink-green-7, #15803d);
}
.seal--danger {
  color: var(--ink-red-7, #b91c1c);
}
.seal--neutral {
  color: var(--ink-gray-6, #6b7280);
}
.seal--success .seal__track {
  opacity: 1;
  fill: currentColor;
  fill-opacity: 0.12;
}
@keyframes seal-turn {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .seal__arc {
    animation: none;
  }
}
</style>
