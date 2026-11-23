<template>
  <!-- One cash bag (Shell-S14): its amount, who holds it now, the chain of
       hands it went through, its counts and photos, and the next step as one
       filled button, or the sentence that says who takes it. -->
  <div
    class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-efectivo-bolsa
  >
    <AppBar
      :title="bag ? bag.seal : 'Bolsa'"
      :back="{ name: 'Efectivo' }"
      back-label="Efectivo"
      :stack="false"
    >
      <template v-if="bag" #actions>
        <div
          v-if="secondary.length"
          class="flex rounded-full bg-surface-gray-1 p-0.5"
        >
          <button
            v-for="item in secondary"
            :key="item.label"
            type="button"
            class="press grid size-10 place-items-center rounded-full text-ink-gray-7"
            :aria-label="item.label"
            :title="item.label"
            @click="item.run()"
          >
            <span :class="[item.icon, 'size-5']" aria-hidden="true" />
          </button>
        </div>
      </template>
    </AppBar>

    <div class="mx-auto w-full max-w-3xl flex-1">
      <div
        v-if="loadError"
        role="alert"
        class="mx-4 my-3 space-y-3 rounded-6 bg-surface-red-1 p-4 text-sm text-ink-red-7"
      >
        <p>{{ loadError }}</p>
        <Button label="Reintentar" @click="load()" />
      </div>
      <div
        v-else-if="!bag"
        role="status"
        aria-label="Cargando bolsa…"
        class="space-y-3 px-4 py-4"
      >
        <div class="h-36 animate-pulse rounded-7 bg-surface-gray-2" />
        <div
          v-for="n in 3"
          :key="n"
          class="h-12 animate-pulse rounded-7 bg-surface-gray-2"
        />
      </div>
      <template v-else>
        <section
          class="mx-4 mt-2 rounded-8 bg-surface-gray-1 p-4"
          data-efectivo-bolsa-hero
        >
          <div class="flex items-start justify-between gap-3">
            <p class="num break-words text-3xl font-semibold text-ink-gray-9">
              {{ money(bag.amount, safe.currency) }}
            </p>
            <StatusChip
              :label="bagState(bag.state).label"
              :tone="bagState(bag.state).tone"
            />
          </div>
          <p class="mt-1 text-sm text-ink-gray-6">
            {{ PURPOSE[bag.purpose] || '' }} · {{ safe.title }}
          </p>
          <p
            class="mt-3 flex items-center gap-2 text-base font-medium text-ink-gray-9"
            data-efectivo-holder
          >
            <span
              class="lucide-hand size-5 flex-none text-ink-gray-6"
              aria-hidden="true"
            />
            {{ holderText(bag, people) }}
          </p>
        </section>

        <!-- One stepper: every event, then the next step (lit when it is this
             worker's, else who takes it), then the end its purpose defines. -->
        <ol
          class="mx-4 mt-4"
          aria-label="Por qué manos pasó"
          data-efectivo-pasos
        >
          <li
            v-for="(item, i) in chain"
            :key="i"
            class="relative flex gap-3 pb-4"
            data-paso="hecho"
          >
            <span
              class="absolute bottom-0 left-[11px] top-6 w-0.5 bg-[var(--muelle-outline-variant)]"
              aria-hidden="true"
            />
            <span
              class="grid size-6 flex-none place-items-center rounded-full bg-[var(--muelle-secondary-container)] text-[var(--muelle-on-secondary-container)]"
              aria-hidden="true"
            >
              <span class="lucide-check size-3.5" />
            </span>
            <div class="min-w-0">
              <p class="text-base text-ink-gray-9">{{ item.text }}</p>
              <p v-if="item.when" class="text-sm text-ink-gray-6">
                {{ item.when }}
              </p>
            </div>
          </li>
          <li
            v-if="next?.action || next?.reason"
            class="relative flex gap-3 pb-4"
            :data-paso="next.action ? 'tuyo' : 'de-otro'"
          >
            <span
              v-if="end"
              class="absolute bottom-0 left-[11px] top-6 w-0.5 border-l-2 border-dashed border-[var(--muelle-outline-variant)]"
              aria-hidden="true"
            />
            <span
              class="grid size-6 flex-none place-items-center rounded-full"
              :class="
                next.action
                  ? 'bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
                  : 'border-2 border-[var(--muelle-outline)] text-ink-gray-6'
              "
              aria-hidden="true"
            >
              <span
                v-if="next.action"
                :class="[
                  NEXT_ICON[next.action] || 'lucide-arrow-right',
                  'size-3.5',
                ]"
              />
            </span>
            <div class="min-w-0" data-efectivo-guard>
              <p
                class="text-base"
                :class="
                  next.action
                    ? 'font-semibold text-ink-gray-9'
                    : 'text-ink-gray-8'
                "
              >
                {{ next.action ? next.label : next.reason }}
              </p>
              <a
                v-if="next.pos"
                class="text-sm font-medium text-ink-gray-9 underline"
                href="/posapp/cash-custody"
                >Abrir el POS</a
              >
            </div>
          </li>
          <li v-if="end" class="flex gap-3" data-paso="fin">
            <span
              class="size-6 flex-none rounded-full border-2 border-dashed border-[var(--muelle-outline)]"
              aria-hidden="true"
            />
            <p class="text-base text-ink-gray-6">{{ end }}</p>
          </li>
        </ol>

        <!-- The turn its cash came from: whoever opens the bag cold knows which corte it closed. -->
        <!-- The turn its cash came from and its counts, one tonal group. -->
        <ListGroup
          v-if="source || counts.length"
          tag="ul"
          class="mx-4 mt-2"
          aria-label="De qué corte salió y sus conteos"
          data-efectivo-bolsa-turno
        >
          <li v-if="source">
            <ListRow
              :title="source.title"
              :subtitle="source.line"
              :subtitle-lines="2"
              icon="lucide-receipt"
              :to="source.to"
            />
          </li>
          <li
            v-for="c in counts"
            :key="c.name"
            class="flex items-center gap-3 px-4 py-2.5"
          >
            <span
              class="lucide-calculator size-5 flex-none text-ink-gray-6"
              aria-hidden="true"
            />
            <div class="min-w-0 flex-1">
              <p class="text-base text-ink-gray-9">
                {{ who(c.counted_by, people) }}
              </p>
              <p
                class="truncate text-sm"
                :class="
                  c.state === 'Exception' ? 'text-ink-red-7' : 'text-ink-gray-6'
                "
              >
                {{ countLine(c) }}
              </p>
            </div>
            <span class="num text-base font-semibold text-ink-gray-9">{{
              money(c.amount, safe.currency)
            }}</span>
          </li>
        </ListGroup>

        <section class="mt-4" aria-label="Fotos">
          <div class="flex items-center px-4 pb-2">
            <label
              v-if="photos.can_upload"
              class="press inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full bg-[var(--muelle-secondary-container)] px-4 text-sm font-medium text-[var(--muelle-on-secondary-container)]"
            >
              <span class="lucide-camera size-5" aria-hidden="true" />
              {{ uploading ? 'Subiendo…' : 'Agregar foto' }}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                class="sr-only"
                :disabled="uploading"
                @change="addPhoto"
              />
            </label>
          </div>
          <p
            v-if="photoError"
            role="alert"
            class="mx-4 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
          >
            {{ photoError }}
          </p>
          <div v-if="photos.photos.length" class="grid grid-cols-3 gap-2 px-4">
            <a
              v-for="p in photos.photos"
              :key="p.name"
              :href="p.file_url"
              target="_blank"
              rel="noopener"
            >
              <img
                :src="p.file_url"
                alt="Foto de la bolsa"
                class="aspect-square w-full rounded-6 object-cover"
                loading="lazy"
              />
            </a>
          </div>
        </section>
        <div class="h-28 flex-none lg:h-12" aria-hidden="true" />
      </template>
    </div>
    <BottomSheet
      v-model:open="printing"
      title="Imprimir"
      :subtitle="bag ? bag.seal : ''"
      flush
    >
      <ul class="divide-y divide-outline-gray-1">
        <li>
          <ListRow
            title="Hoja de entrega"
            subtitle="El conteo, quién la tuvo y espacio para firmas"
            icon="lucide-file-text"
            @click="print('slip')"
          />
        </li>
        <li>
          <ListRow
            title="Etiqueta de la bolsa"
            subtitle="Sello, importe y para qué es; va pegada a la bolsa"
            icon="lucide-tag"
            @click="print('label')"
          />
        </li>
      </ul>
    </BottomSheet>
    <StepHost :step="step" @close="step = null" @done="load" />
    <!-- The next step is the page's one action: docked with its word on a
         phone, an extended button at the bottom end elsewhere. -->
    <Fab
      v-if="bag && next?.action"
      dock="extended"
      :label="next.label"
      :icon="NEXT_ICON[next.action] || 'lucide-arrow-right'"
      data-efectivo-next
      @click="run(next.action)"
    />
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button, toast } from 'frappe-ui'
import {
  AppBar,
  BottomSheet,
  Fab,
  ListGroup,
  ListRow,
  StatusChip,
} from '@/components/ui'
import StepHost from '@/components/efectivo/StepHost.vue'
import {
  PURPOSE,
  PURPOSE_END,
  bagRead,
  bagState,
  bagStep,
  errorText,
  holderText,
  listPhotos,
  money,
  printEvidence,
  shiftSource,
  uploadPhoto,
  who,
} from '@/components/efectivo/efectivo'
import {
  confirmDeposit,
  dispatchBag,
  returnFromBank,
  reviewCount,
  sendOffsite,
  unpackBag,
  verifyBag,
} from '@/components/efectivo/steps'
import { useLiveList } from '@/composables/liveList'
import { shellBoot } from '@/composables/muelleShell'
import { formatDateTime } from '@/utils/display'
import { moduleEnabled } from '@/vendor/muelle-shell/contracts'

const props = defineProps({ name: { type: String, required: true } })
const data = ref(null)
const loadError = ref('')
const step = ref(null)
const photos = ref({ photos: [], can_upload: false })
const uploading = ref(false)
const photoError = ref('')
const printing = ref(false)

const bag = computed(() => data.value?.bag || null)
const safe = computed(() => data.value?.safe || { can: {} })
const people = computed(() => data.value?.people || {})
const counts = computed(() => data.value?.counts || [])
/** The bag's turn; the whole turn opens in Documentos when that module is on. */
const sourceOf = (extra = {}) =>
  shiftSource(bag.value?.shift, people.value, {
    currency: safe.value.currency,
    link: moduleEnabled(shellBoot.value, 'documentos'),
    ...extra,
  })
const source = computed(() => sourceOf())

const next = computed(() => {
  const found = bagStep(bag.value, safe.value, data.value?.me)
  if (
    found?.reason &&
    bag.value?.purpose === 'Float' &&
    bag.value?.state === 'Available'
  )
    return { ...found, pos: true }
  return found
})

const NEXT_ICON = Object.freeze({
  verify: 'lucide-badge-check',
  dispatch: 'lucide-truck',
  confirm_bank: 'lucide-landmark',
  review: 'lucide-scale',
})
// The end of the bag's road, when its purpose defines one and it is not there yet.
const DONE = ['Deposited', 'Issued', 'Unpacked', 'Transferred']
const end = computed(() =>
  bag.value && !DONE.includes(bag.value.state)
    ? PURPOSE_END[bag.value.purpose] || ''
    : '',
)

const secondary = computed(() => {
  const b = bag.value
  const can = safe.value.can || {}
  const out = []
  if (b?.state === 'In Transit' && (can.dispatch || can.confirm_bank))
    out.push({
      label: 'Regresó sin depositar',
      icon: 'lucide-undo-2',
      run: () => run('return_bank'),
    })
  if (b?.state === 'Available' && can.unpack)
    out.push({
      label: 'Abrir la bolsa',
      icon: 'lucide-package-open',
      run: () => run('unpack'),
    })
  // A custodian without an off-site ledger still finds the step, and reads why.
  if (
    ['Available', 'Unverified'].includes(b?.state) &&
    (can.transfer_safe ||
      (safe.value.can_manage && safe.value.transfer_blocker))
  )
    out.push({
      label: 'Sacar de la tienda',
      icon: 'lucide-truck',
      run: () => run('transfer_safe'),
    })
  if (b)
    out.push({
      label: 'Imprimir',
      icon: 'lucide-printer',
      run: () => (printing.value = true),
    })
  return out
})

const chain = computed(() => {
  const b = bag.value
  if (!b) return []
  const out = []
  const name = (u) => who(u, people.value)
  for (const e of data.value?.events || []) {
    const text = {
      prepare: `La selló ${name(e.actor)}`,
      drop: `${name(e.actor)} la dejó en la caja fuerte al cerrar su caja`,
      verify: `${name(e.actor)} la contó`,
      receive: `${name(e.actor)} la recibió en su caja`,
      dispatch: `${name(e.actor)} salió con ella al banco`,
      confirm_bank: `Depositada · registró la ficha ${name(e.actor)}`,
      return_bank: `Regresó del banco sin depositar · ${name(e.actor)}`,
      unpack: `${name(e.actor)} la abrió y el efectivo quedó suelto`,
      review: `${name(e.actor)} resolvió la diferencia`,
      transfer_safe: `${name(e.actor)} la envió completa fuera de la tienda`,
    }[e.action]
    if (text) out.push({ text, when: formatDateTime(e.creation) })
  }
  if (!out.length)
    out.push({ text: `La selló ${name(b.prepared_by)}`, when: '' })
  return out
})

function countLine(c) {
  if (c.state === 'Exception') {
    const d = Number(c.difference) || 0
    return d
      ? `No cuadró: ${d < 0 ? 'faltan' : 'sobran'} ${money(Math.abs(d), safe.value.currency)}`
      : 'No cuadró'
  }
  if (c.state === 'Reviewed')
    return `Diferencia resuelta por ${who(c.reviewed_by, people.value)}`
  return `Cuadró · ${formatDateTime(c.creation)}`
}

function run(action) {
  const b = bag.value
  const s = safe.value
  const p = people.value
  const builders = {
    verify: () => verifyBag(b, s, p),
    dispatch: () => dispatchBag(b, s, p, data.value?.me),
    confirm_bank: () => confirmDeposit(b, s, p),
    return_bank: () => returnFromBank(b, s, p),
    unpack: () => unpackBag(b, s),
    transfer_safe: () => sendOffsite(b, s, p),
    review: () => {
      const open = [...counts.value]
        .reverse()
        .find((c) => c.state === 'Exception')
      return open
        ? reviewCount(
            open,
            s,
            p,
            sourceOf({ note: open.note, noteBy: open.counted_by }),
          )
        : null
    },
  }
  step.value = builders[action]?.() || null
}

async function print(layout) {
  printing.value = false
  try {
    await printEvidence('POS Cash Bag', props.name, layout)
  } catch (error) {
    toast.error(errorText(error))
  }
}

async function loadPhotos() {
  try {
    photos.value = await listPhotos('POS Cash Bag', props.name)
  } catch {
    photos.value = { photos: [], can_upload: false }
  }
}
function addPhoto(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = async () => {
    uploading.value = true
    photoError.value = ''
    try {
      await uploadPhoto('POS Cash Bag', props.name, String(reader.result || ''))
      await loadPhotos()
    } catch (error) {
      photoError.value = errorText(error)
    } finally {
      uploading.value = false
    }
  }
  reader.readAsDataURL(file)
}

let sequence = 0
async function load() {
  const mine = ++sequence
  loadError.value = ''
  try {
    const result = await bagRead(props.name)
    if (mine !== sequence) return
    data.value = result
  } catch (error) {
    if (mine === sequence) loadError.value = errorText(error)
  }
  loadPhotos()
}
watch(() => props.name, load, { immediate: true })
useLiveList(['POS Cash Bag', 'POS Cash Count'], load)
</script>
