<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
      <!-- One alta: the worker's photos, count and place, the assistant's
           proposal and the product it may already be. Who creates products
           decides here: «Dar de alta», «Es el mismo que…» or «No». -->
      <AppBar
        v-if="isPhone"
        back="/productos/altas"
        :back-label="__('New products', null, CTX)"
        :title="alta ? altaTitle(alta, t) : __('New product', null, CTX)"
        :loading="loading"
      />
      <div class="mx-auto w-full max-w-2xl space-y-5 px-4 pb-32 pt-3 sm:px-6">
        <EmptyState
          v-if="!alta && loading"
          state="loading"
          :title="__('Loading…', null, CTX)"
        />
        <EmptyState
          v-else-if="!alta"
          state="error"
          :title="__('This registration did not open', null, CTX)"
          :message="problem"
          :action="__('Try again', null, CTX)"
          @action="load"
        />
        <template v-else>
          <header class="space-y-1">
            <RouterLink
              v-if="!isPhone"
              to="/productos/altas"
              class="press inline-flex min-h-8 items-center rounded-6 px-2 text-base text-ink-gray-7 hover:bg-surface-gray-2"
              >{{ __('New products', null, CTX) }}</RouterLink
            >
            <h1
              v-if="!isPhone"
              class="title-face text-2xl font-semibold text-ink-gray-9"
            >
              {{ altaTitle(alta, t) }}
            </h1>
            <div class="flex flex-wrap items-center gap-2">
              <StatusChip
                :tone="estadoTone(alta.estado)"
                :label="estadoLabel(alta.estado, t)"
              />
              <span class="text-sm text-ink-gray-6">{{
                altaLine(alta, t)
              }}</span>
            </div>
          </header>

          <ul
            v-if="alta.fotos.length"
            class="grid grid-cols-3 gap-2 sm:grid-cols-4"
          >
            <li v-for="(url, index) in alta.fotos" :key="url">
              <button
                type="button"
                class="press block aspect-square w-full overflow-hidden rounded-6 bg-surface-gray-2"
                :aria-label="__('Open photo {0}', [index + 1], CTX)"
                @click="openPhoto(index)"
              >
                <img :src="url" alt="" class="size-full object-cover" />
              </button>
            </li>
          </ul>

          <dl class="divide-y divide-outline-gray-1 text-base">
            <div v-if="alta.nombre" class="flex gap-3 py-2">
              <dt class="w-36 shrink-0 text-ink-gray-6">
                {{ __('They wrote', null, CTX) }}
              </dt>
              <dd class="text-ink-gray-9">{{ alta.nombre }}</dd>
            </div>
            <div class="flex gap-3 py-2">
              <dt class="w-36 shrink-0 text-ink-gray-6">
                {{ __('For', null, CTX) }}
              </dt>
              <dd class="text-ink-gray-9">{{ tipoLabel(alta.tipo, t) }}</dd>
            </div>
            <div class="flex gap-3 py-2">
              <dt class="w-36 shrink-0 text-ink-gray-6">
                {{ __('How many', null, CTX) }}
              </dt>
              <dd class="num text-ink-gray-9">
                {{ piezas(alta.cantidad, t) }}
              </dd>
            </div>
            <div v-if="alta.lugar" class="flex gap-3 py-2">
              <dt class="w-36 shrink-0 text-ink-gray-6">
                {{ __('Where', null, CTX) }}
              </dt>
              <dd class="text-ink-gray-9">{{ alta.lugar }}</dd>
            </div>
            <div v-if="alta.codigo" class="flex gap-3 py-2">
              <dt class="w-36 shrink-0 text-ink-gray-6">
                {{ __('Label code', null, CTX) }}
              </dt>
              <dd class="num text-ink-gray-9">{{ alta.codigo }}</dd>
            </div>
            <div v-if="alta.notas" class="flex gap-3 py-2">
              <dt class="w-36 shrink-0 text-ink-gray-6">
                {{ __('Notes', null, CTX) }}
              </dt>
              <dd class="text-ink-gray-9">{{ alta.notas }}</dd>
            </div>
          </dl>

          <section
            class="space-y-2"
            aria-labelledby="alta-propuesta"
            data-alta-propuesta
          >
            <h2
              id="alta-propuesta"
              class="text-base font-semibold text-ink-gray-9"
            >
              {{ __('What the assistant proposes', null, CTX) }}
            </h2>
            <p
              v-if="alta.agente_estado === 'Pendiente'"
              class="text-base text-ink-gray-7"
            >
              {{ __('The assistant is reading the photos…', null, CTX) }}
            </p>
            <dl v-else class="divide-y divide-outline-gray-1 text-base">
              <div v-if="alta.propuesta.nombre" class="flex gap-3 py-2">
                <dt class="w-36 shrink-0 text-ink-gray-6">
                  {{ __('Name', null, CTX) }}
                </dt>
                <dd class="font-medium text-ink-gray-9">
                  {{ alta.propuesta.nombre }}
                </dd>
              </div>
              <div v-if="alta.propuesta.grupo" class="flex gap-3 py-2">
                <dt class="w-36 shrink-0 text-ink-gray-6">
                  {{ __('Group', null, CTX) }}
                </dt>
                <dd class="text-ink-gray-9">{{ alta.propuesta.grupo }}</dd>
              </div>
              <div
                v-if="alta.propuesta.compatible.length"
                class="flex gap-3 py-2"
              >
                <dt class="w-36 shrink-0 text-ink-gray-6">
                  {{ __('Fits', null, CTX) }}
                </dt>
                <dd class="text-ink-gray-9">
                  {{ alta.propuesta.compatible.join(', ') }}
                </dd>
              </div>
              <div v-if="alta.propuesta.etiqueta" class="flex gap-3 py-2">
                <dt class="w-36 shrink-0 text-ink-gray-6">
                  {{ __('The label says', null, CTX) }}
                </dt>
                <dd class="text-ink-gray-9">{{ alta.propuesta.etiqueta }}</dd>
              </div>
            </dl>
            <p
              v-if="alta.propuesta.nota"
              class="text-sm text-ink-gray-7"
              data-alta-nota
            >
              {{ alta.propuesta.nota }}
            </p>
          </section>

          <section
            v-if="alta.parecido"
            class="flex gap-3 rounded-6 bg-surface-amber-1 p-3"
            data-alta-parecido
          >
            <img
              v-if="alta.parecido.foto"
              :src="alta.parecido.foto"
              alt=""
              class="size-16 shrink-0 rounded-5 object-cover"
            />
            <div class="min-w-0 space-y-0.5">
              <p class="text-sm text-ink-amber-9">
                {{ __('Looks like it already exists', null, CTX) }}
              </p>
              <RouterLink
                :to="{ name: 'Producto', params: { item: alta.parecido.item } }"
                class="text-base font-medium text-ink-gray-9 underline underline-offset-2"
                >{{ alta.parecido.nombre }}</RouterLink
              >
              <p class="text-sm text-ink-gray-7">
                {{
                  [
                    alta.parecido.motivo,
                    __(
                      '{0} in stock there',
                      [qtyText(alta.parecido.existencia)],
                      CTX,
                    ),
                  ]
                    .filter(Boolean)
                    .join('. ')
                }}
              </p>
            </div>
          </section>

          <section
            v-if="alta.estado !== 'Por revisar'"
            class="space-y-1 text-base"
            data-alta-decision
          >
            <p class="text-ink-gray-9">
              {{
                alta.decidido_por
                  ? __('Decided by {0}.', [alta.decidido_por], CTX)
                  : ''
              }}
              <template v-if="alta.motivo">{{ alta.motivo }}</template>
            </p>
            <RouterLink
              v-if="alta.item"
              :to="{ name: 'Producto', params: { item: alta.item } }"
              class="press inline-flex min-h-11 items-center font-medium text-ink-gray-9 underline underline-offset-2"
              >{{ __('Open the product', null, CTX) }}</RouterLink
            >
          </section>
          <p
            v-else-if="!alta.can_decide"
            class="text-base text-ink-gray-7"
            data-alta-espera
          >
            {{
              __(
                'Whoever creates products decides it. You will hear back here and in Avisos.',
                null,
                CTX,
              )
            }}
          </p>
          <p v-if="said" role="status" class="text-base text-ink-green-8">
            {{ said }}
          </p>
        </template>
      </div>
    </div>

    <div
      v-if="alta?.can_decide && alta.estado === 'Por revisar'"
      class="sticky bottom-0 border-t border-outline-gray-1 bg-surface-base px-4 py-3 sm:px-6"
      data-alta-acciones
    >
      <div class="mx-auto flex w-full max-w-2xl flex-wrap gap-2">
        <button
          type="button"
          class="press min-h-11 flex-1 rounded-6 bg-[var(--muelle-accent)] px-4 text-base font-medium text-[var(--muelle-accent-ink)]"
          data-alta-dar
          @click="openSheet('alta')"
        >
          {{ __('Create it', null, CTX) }}
        </button>
        <button
          type="button"
          class="press min-h-11 flex-1 rounded-6 bg-surface-gray-2 px-4 text-base text-ink-gray-9"
          data-alta-mismo
          @click="openSheet('sumar')"
        >
          {{ __('It is the same as…', null, CTX) }}
        </button>
        <button
          type="button"
          class="press min-h-11 rounded-6 px-4 text-base text-ink-gray-8"
          data-alta-no
          @click="openSheet('rechazar')"
        >
          {{ __('No', null, CTX) }}
        </button>
      </div>
    </div>

    <BottomSheet
      :open="sheet === 'alta'"
      :title="__('Create the product', null, CTX)"
      :dismissible="!busy"
      @update:open="(value) => !value && closeSheet()"
    >
      <form id="alta-dar" class="space-y-4" @submit.prevent="decide('alta')">
        <label class="block space-y-1">
          <span class="text-sm text-ink-gray-7">{{
            __('Name', null, CTX)
          }}</span>
          <input
            v-model="datos.nombre"
            class="alta-campo w-full"
            maxlength="140"
            required
            data-alta-dar-nombre
          />
        </label>
        <label class="block space-y-1">
          <span class="text-sm text-ink-gray-7">{{
            __('Group', null, CTX)
          }}</span>
          <select
            v-model="datos.grupo"
            class="alta-campo w-full"
            required
            data-alta-dar-grupo
          >
            <option value="" disabled>
              {{ __('Choose the group', null, CTX) }}
            </option>
            <option
              v-for="grupo in alta?.grupos || []"
              :key="grupo"
              :value="grupo"
            >
              {{ grupo }}
            </option>
          </select>
        </label>
        <label class="block space-y-1">
          <span class="text-sm text-ink-gray-7">{{
            __('Code to scan (optional)', null, CTX)
          }}</span>
          <input
            v-model="datos.codigo"
            class="alta-campo num w-full"
            maxlength="60"
          />
        </label>
        <label v-if="alta?.tipo === 'Para vender'" class="block space-y-1">
          <span class="text-sm text-ink-gray-7">{{
            __('Selling price (optional)', null, CTX)
          }}</span>
          <input
            v-model.number="datos.precio"
            type="number"
            inputmode="decimal"
            min="0"
            step="0.01"
            class="alta-campo num w-full"
          />
        </label>
        <label v-if="!alta?.money_hidden" class="block space-y-1">
          <span class="text-sm text-ink-gray-7">{{
            __('Cost per piece (optional)', null, CTX)
          }}</span>
          <input
            v-model.number="datos.costo"
            type="number"
            inputmode="decimal"
            min="0"
            step="0.01"
            class="alta-campo num w-full"
          />
        </label>
        <p class="text-sm text-ink-gray-6">
          {{
            __(
              'It enters with its photos, {0} in its place, and the person who found it gets a pendiente to label it.',
              [piezas(alta?.cantidad, t)],
              CTX,
            )
          }}
        </p>
        <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
          {{ problem }}
        </p>
      </form>
      <template #actions>
        <button
          type="button"
          class="press min-h-11 rounded-6 px-4 text-base text-ink-gray-8"
          :disabled="busy"
          @click="closeSheet"
        >
          {{ __('Cancel', null, CTX) }}
        </button>
        <button
          type="submit"
          form="alta-dar"
          class="press min-h-11 flex-1 rounded-6 bg-[var(--muelle-accent)] px-4 text-base font-medium text-[var(--muelle-accent-ink)] disabled:opacity-50"
          :disabled="busy || !datos.nombre || !datos.grupo"
          data-alta-dar-confirmar
        >
          {{ busy ? __('Creating…', null, CTX) : __('Create it', null, CTX) }}
        </button>
      </template>
    </BottomSheet>

    <BottomSheet
      :open="sheet === 'sumar'"
      :title="__('It is the same as…', null, CTX)"
      :dismissible="!busy"
      @update:open="(value) => !value && closeSheet()"
    >
      <form id="alta-sumar" class="space-y-4" @submit.prevent="decide('sumar')">
        <input
          v-model="productSearch"
          class="alta-campo w-full"
          :placeholder="__('Search the product', null, CTX)"
          data-alta-buscar
          @input="findProducts"
        />
        <fieldset class="space-y-1">
          <legend class="sr-only">{{ __('Product', null, CTX) }}</legend>
          <label
            v-for="option in productOptions"
            :key="option.item"
            class="press flex min-h-14 cursor-pointer items-center gap-3 rounded-6 px-2"
            :class="datos.item === option.item ? 'bg-surface-gray-3' : ''"
          >
            <input
              v-model="datos.item"
              type="radio"
              :value="option.item"
              class="size-4"
            />
            <img
              v-if="option.foto"
              :src="option.foto"
              alt=""
              class="size-10 shrink-0 rounded-5 object-cover"
            />
            <span class="flex min-w-0 flex-col">
              <span class="truncate text-base text-ink-gray-9">{{
                option.nombre
              }}</span>
              <span class="truncate text-sm text-ink-gray-6">{{
                option.grupo
              }}</span>
            </span>
          </label>
        </fieldset>
        <Segmented
          v-model="datos.modo"
          :options="modos"
          :label="__('How the count goes', null, CTX)"
        />
        <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
          {{ problem }}
        </p>
      </form>
      <template #actions>
        <button
          type="button"
          class="press min-h-11 rounded-6 px-4 text-base text-ink-gray-8"
          :disabled="busy"
          @click="closeSheet"
        >
          {{ __('Cancel', null, CTX) }}
        </button>
        <button
          type="submit"
          form="alta-sumar"
          class="press min-h-11 flex-1 rounded-6 bg-[var(--muelle-accent)] px-4 text-base font-medium text-[var(--muelle-accent-ink)] disabled:opacity-50"
          :disabled="busy || !datos.item"
          data-alta-sumar-confirmar
        >
          {{ __('Add to the product', null, CTX) }}
        </button>
      </template>
    </BottomSheet>

    <BottomSheet
      :open="sheet === 'rechazar'"
      :title="__('Do not create it', null, CTX)"
      :dismissible="!busy"
      @update:open="(value) => !value && closeSheet()"
    >
      <form id="alta-no" class="space-y-3" @submit.prevent="decide('rechazar')">
        <label class="block space-y-1">
          <span class="text-sm text-ink-gray-7">{{
            __('Why? The person who found it reads it.', null, CTX)
          }}</span>
          <textarea
            v-model="datos.motivo"
            rows="3"
            maxlength="500"
            class="alta-campo alta-area w-full py-2"
            required
            data-alta-motivo
          />
        </label>
        <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
          {{ problem }}
        </p>
      </form>
      <template #actions>
        <button
          type="button"
          class="press min-h-11 rounded-6 px-4 text-base text-ink-gray-8"
          :disabled="busy"
          @click="closeSheet"
        >
          {{ __('Cancel', null, CTX) }}
        </button>
        <button
          type="submit"
          form="alta-no"
          class="press min-h-11 flex-1 rounded-6 bg-surface-gray-3 px-4 text-base font-medium text-ink-gray-9 disabled:opacity-50"
          :disabled="busy || !datos.motivo.trim()"
          data-alta-no-confirmar
        >
          {{ __('Do not create it', null, CTX) }}
        </button>
      </template>
    </BottomSheet>

    <MediaViewer
      v-if="viewerOpen"
      v-model:open="viewerOpen"
      v-model:index="viewerIndex"
      :items="viewerItems"
      :title="alta ? altaTitle(alta, t) : ''"
    />
  </div>
</template>

<script setup>
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
} from 'vue'
import { RouterLink } from 'vue-router'
import {
  AppBar,
  BottomSheet,
  EmptyState,
  Segmented,
  StatusChip,
} from '@/components/ui'
import { isMobile as isPhone } from '@/composables/breakpoint'
import {
  CTX,
  altaLine,
  altaTitle,
  altasApi,
  estadoLabel,
  estadoTone,
  piezas,
  problemOf,
  requestId,
  tipoLabel,
} from '@/composables/useAltas'

const MediaViewer = defineAsyncComponent(
  () => import('@/components/ui/MediaViewer.vue'),
)
const props = defineProps({ name: { type: String, required: true } })
const t = (...args) => __(...args)
const alta = ref(null)
const loading = ref(false)
const problem = ref('')
const said = ref('')
const sheet = ref('')
const busy = ref(false)
const datos = reactive(blank())
const productSearch = ref('')
const found = ref([])
const viewerOpen = ref(false)
const viewerIndex = ref(0)
let searchTimer = null
let pollTimer = null
let polls = 0
let request = requestId()

const modos = computed(() => [
  {
    value: 'sumar',
    label: __('Add {0}', [piezas(alta.value?.cantidad, t)], CTX),
  },
  {
    value: 'contar',
    label: __('{0} in total', [piezas(alta.value?.cantidad, t)], CTX),
  },
])
const productOptions = computed(() => {
  const seen = new Set()
  const list = []
  for (const option of [
    ...(alta.value?.parecido ? [alta.value.parecido] : []),
    ...(alta.value?.parecidos || []),
    ...found.value,
  ]) {
    if (seen.has(option.item)) continue
    seen.add(option.item)
    list.push(option)
  }
  return list
})
const viewerItems = computed(() =>
  (alta.value?.fotos || []).map((url) => ({ url, kind: 'image', thumb: url })),
)

function blank() {
  return {
    nombre: '',
    grupo: '',
    codigo: '',
    precio: null,
    costo: null,
    item: '',
    modo: 'sumar',
    motivo: '',
  }
}

function qtyText(value) {
  const n = Number(value) || 0
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

function openPhoto(index) {
  viewerIndex.value = index
  viewerOpen.value = true
}

function openSheet(kind) {
  Object.assign(datos, blank(), {
    nombre: alta.value?.propuesta?.nombre || alta.value?.nombre || '',
    grupo: alta.value?.propuesta?.grupo || '',
    codigo: alta.value?.codigo || '',
    item: alta.value?.parecido?.item || '',
  })
  problem.value = ''
  request = requestId()
  sheet.value = kind
}

function closeSheet() {
  if (!busy.value) sheet.value = ''
}

function findProducts() {
  clearTimeout(searchTimer)
  const text = productSearch.value.trim()
  if (!text) {
    found.value = []
    return
  }
  searchTimer = setTimeout(async () => {
    try {
      found.value =
        (await altasApi('buscar_producto', { texto: text }))?.rows || []
    } catch {
      found.value = []
    }
  }, 250)
}

async function decide(accion) {
  if (busy.value) return
  busy.value = true
  problem.value = ''
  const payload =
    accion === 'alta'
      ? {
          nombre: datos.nombre.trim(),
          grupo: datos.grupo,
          codigo: datos.codigo.trim(),
          precio: datos.precio || 0,
          costo: datos.costo || 0,
        }
      : accion === 'sumar'
        ? { item: datos.item, modo: datos.modo }
        : { motivo: datos.motivo.trim() }
  try {
    const answer = await altasApi('decidir', {
      request_id: request,
      alta: props.name,
      accion,
      datos: payload,
    })
    said.value =
      accion === 'rechazar'
        ? __('Not created. The person who found it was told why.', null, CTX)
        : [
            __(
              '{0} is in. A pendiente to label it went to who found it.',
              [answer.item_name],
              CTX,
            ),
            ...(answer.said || []),
          ].join(' ')
    sheet.value = ''
    await load()
  } catch (error) {
    problem.value = problemOf(error).detail
  } finally {
    busy.value = false
  }
}

async function load() {
  loading.value = true
  try {
    alta.value = await altasApi('detalle', { alta: props.name })
    problem.value = ''
  } catch (error) {
    if (!alta.value) problem.value = problemOf(error).detail
  } finally {
    loading.value = false
  }
  clearTimeout(pollTimer)
  // The assistant answers in about a minute: read again quietly until it does.
  if (alta.value?.agente_estado === 'Pendiente' && polls < 12) {
    polls += 1
    pollTimer = setTimeout(load, 10000)
  }
}

onMounted(load)
onBeforeUnmount(() => {
  clearTimeout(searchTimer)
  clearTimeout(pollTimer)
})
</script>

<style scoped>
/* The shell's filled field: 44 px on a phone, 40 on a desk. */
.alta-campo {
  height: 2.75rem;
  border: 1px solid transparent;
  border-radius: 0.5rem;
  background: var(--surface-gray-2);
  padding: 0 0.75rem;
  font-size: 1rem;
  color: var(--ink-gray-9);
}
.alta-campo:focus {
  outline: none;
  border-color: var(--outline-gray-4);
  background: var(--surface-base, transparent);
}
@media (min-width: 640px) {
  .alta-campo {
    height: 2.5rem;
  }
}
.alta-campo.alta-area {
  height: auto;
}
</style>
