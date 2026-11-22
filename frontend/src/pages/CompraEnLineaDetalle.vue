<template>
  <!-- One online purchase. Its facts come from Mercado Pago as they are; a
       purchase to register is one of three: goods for the shop (the catalog's
       items or new ones, where it arrives, the repairs and deals it is for:
       one paid bill linked to the purchase, so it is never booked twice), an
       expense, or set aside. Each tap shows the card it applies first; the
       receipt keeps «Deshacer». -->
  <div class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
    <AppBar
      :back="backTo"
      :back-label="__('Online purchases', null, 'EnLinea')"
      :context="__('Online purchases', null, 'EnLinea')"
      :title="title"
    />
    <div class="min-h-0 flex-1 overflow-y-auto pb-28 sm:pb-10">
      <div class="mx-auto w-full max-w-3xl space-y-6 px-4 pt-2">
        <EmptyState
          v-if="guard"
          role="alert"
          state="error"
          :title="guard.title"
          :message="guard.detail"
          :action="__('Retry', null, 'Compras')"
          @action="load"
        />
        <EmptyState
          v-else-if="!reading"
          role="status"
          state="loading"
          :title="__('Loading the purchase…', null, 'EnLinea')"
        />
        <template v-else>
          <section :aria-label="__('Purchase', null, 'EnLinea')">
            <div class="flex items-center gap-2">
              <StatusChip :label="chip.label" :tone="chip.tone" />
              <span class="text-sm text-ink-gray-6">{{
                reading.compra_mp
              }}</span>
            </div>
            <dl
              class="mt-3 grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-base"
            >
              <dt class="text-ink-gray-6">
                {{ __('Total', null, 'EnLinea') }}
              </dt>
              <dd class="num text-ink-gray-9">
                {{ money(reading.total, reading.moneda) }}
              </dd>
              <dt class="text-ink-gray-6">{{ __('Date', null, 'EnLinea') }}</dt>
              <dd class="text-ink-gray-9">{{ reading.fecha }}</dd>
              <dt class="text-ink-gray-6">
                {{ __('Paid with', null, 'EnLinea') }}
              </dt>
              <dd class="text-ink-gray-9">{{ reading.pago?.medio }}</dd>
              <template v-if="reading.vendedor">
                <dt class="text-ink-gray-6">
                  {{ __('Seller', null, 'EnLinea') }}
                </dt>
                <dd class="text-ink-gray-9">{{ reading.vendedor }}</dd>
              </template>
              <template v-if="reading.pedido">
                <dt class="text-ink-gray-6">
                  {{ __('Order', null, 'EnLinea') }}
                </dt>
                <dd class="num text-ink-gray-9">{{ reading.pedido }}</dd>
              </template>
              <template v-if="reading.ya_registrada_en">
                <dt class="text-ink-gray-6">
                  {{ __('Registered in', null, 'EnLinea') }}
                </dt>
                <dd class="text-ink-gray-9">{{ reading.ya_registrada_en }}</dd>
              </template>
            </dl>
            <ul
              v-if="reading.articulos?.length"
              class="mt-3 divide-y divide-outline-gray-1"
            >
              <li
                v-for="(a, i) in reading.articulos"
                :key="i"
                class="flex gap-3 py-2"
              >
                <span class="min-w-0 flex-1 text-base text-ink-gray-8">{{
                  a.nombre
                }}</span>
                <span class="num flex-none text-ink-gray-7"
                  >{{ a.cantidad }} ×
                  {{ money(a.precio, reading.moneda) }}</span
                >
              </li>
            </ul>
            <p
              v-else-if="reading.sin_leer"
              class="mt-3 text-sm text-ink-gray-7"
            >
              {{
                __(
                  'Mercado Libre has not given its items yet. «Bring purchases» on the list reads them now.',
                  null,
                  'EnLinea',
                )
              }}
            </p>
          </section>

          <section
            v-if="toRegister"
            class="space-y-4"
            :aria-label="__('Register it', null, 'EnLinea')"
          >
            <Segmented
              v-model="mode"
              :options="modes"
              :label="__('What it is', null, 'EnLinea')"
              fit="content"
            />

            <!-- Goods for the shop -->
            <div
              v-if="mode === 'tienda'"
              class="space-y-4"
              data-en-linea-tienda
            >
              <div
                v-for="(l, i) in form.lineas"
                :key="i"
                class="space-y-2 border-t border-outline-gray-1 pt-3"
              >
                <p class="text-sm text-ink-gray-6">{{ l.descripcion }}</p>
                <ComprasPicker
                  v-if="!l.nuevo"
                  v-model="l.articulo"
                  :display="l.articuloLabel"
                  :label="__('Catalog item', null, 'EnLinea')"
                  :placeholder="__('Search the catalog', null, 'EnLinea')"
                  :load="(q) => comprasApi('items', { search: q })"
                  :hint="
                    l.articulo
                      ? ''
                      : __('Not in the catalog yet.', null, 'EnLinea')
                  "
                  @pick="(o) => (l.articuloLabel = o.label)"
                />
                <template v-else>
                  <label class="block text-sm text-ink-gray-7">
                    {{ __('New item name', null, 'EnLinea') }}
                    <input
                      v-model="l.nombre"
                      class="compra-campo mt-1 w-full"
                      type="text"
                      maxlength="140"
                    />
                  </label>
                  <ComprasPicker
                    v-model="l.grupo"
                    :display="l.grupo"
                    :label="__('Item group', null, 'EnLinea')"
                    :load="(q) => enLineaApi('item_groups', { search: q })"
                    :codes="false"
                  />
                </template>
                <div class="flex flex-wrap items-end gap-3">
                  <label class="text-sm text-ink-gray-7">
                    {{ __('Quantity', null, 'EnLinea') }}
                    <input
                      v-model.number="l.cantidad"
                      class="compra-campo num mt-1 w-24"
                      type="number"
                      min="1"
                      step="1"
                    />
                  </label>
                  <span class="num pb-2 text-ink-gray-7">{{
                    money(l.precio, reading.moneda)
                  }}</span>
                  <button
                    type="button"
                    :class="['press ml-auto', BTN.text]"
                    @click="toggleNew(l)"
                  >
                    {{
                      l.nuevo
                        ? __('Pick from the catalog', null, 'EnLinea')
                        : __('It is a new item', null, 'EnLinea')
                    }}
                  </button>
                </div>
              </div>
              <ComprasPicker
                v-model="form.almacen"
                :display="form.almacenLabel"
                :label="__('Arrives at', null, 'EnLinea')"
                :placeholder="__('The store it goes to', null, 'EnLinea')"
                :load="
                  (q) =>
                    comprasApi('warehouses', {
                      company: reading.empresa,
                      search: q,
                    })
                "
                :codes="false"
                @pick="(o) => (form.almacenLabel = o.label)"
              />
              <div class="space-y-2">
                <ComprasPicker
                  :label="__('For repairs', null, 'EnLinea')"
                  :placeholder="__('Search an open repair', null, 'EnLinea')"
                  :load="(q) => enLineaApi('repairs', { search: q })"
                  clear-on-pick
                  @pick="(o) => addTo(form.reparaciones, o)"
                />
                <ChipList
                  :items="form.reparaciones"
                  @remove="(i) => form.reparaciones.splice(i, 1)"
                />
              </div>
              <div class="space-y-2">
                <ComprasPicker
                  :label="__('For deals', null, 'EnLinea')"
                  :placeholder="__('Search a deal', null, 'EnLinea')"
                  :load="(q) => enLineaApi('deals', { search: q })"
                  :codes="false"
                  clear-on-pick
                  @pick="(o) => addTo(form.tratos, o)"
                />
                <ChipList
                  :items="form.tratos"
                  @remove="(i) => form.tratos.splice(i, 1)"
                />
              </div>
              <button
                type="button"
                :class="['press w-full sm:w-auto', BTN.filled]"
                :disabled="busy || !form.lineas.length"
                data-en-linea-revisar
                @click="
                  review(
                    'registrar_compra_en_linea',
                    shopArgs(reading, form),
                    __('Register purchase', null, 'EnLinea'),
                  )
                "
              >
                {{ __('Review and register', null, 'EnLinea') }}
              </button>
            </div>

            <!-- An expense -->
            <div
              v-else-if="mode === 'gasto'"
              class="space-y-4"
              data-en-linea-gasto
            >
              <ComprasPicker
                v-model="gasto.cuenta"
                :display="gasto.label"
                :label="__('Expense account', null, 'EnLinea')"
                :placeholder="__('Search an account', null, 'EnLinea')"
                :hint="
                  __(
                    'Empty: the one in the Mercado Pago settings.',
                    null,
                    'EnLinea',
                  )
                "
                :load="(q) => enLineaApi('accounts', { search: q })"
                :codes="false"
                @pick="(o) => (gasto.label = o.label)"
              />
              <button
                type="button"
                :class="['press w-full sm:w-auto', BTN.filled]"
                :disabled="busy"
                @click="
                  review(
                    'gasto_mercado_pago',
                    {
                      compras: [
                        {
                          compra: reading.compra_mp,
                          cuenta: gasto.cuenta || undefined,
                        },
                      ],
                    },
                    __('Register expense', null, 'EnLinea'),
                  )
                "
              >
                {{ __('Review and register', null, 'EnLinea') }}
              </button>
            </div>

            <!-- Set aside -->
            <div v-else class="space-y-4" data-en-linea-apartar>
              <label class="block text-sm text-ink-gray-7">
                {{ __('Why it is not registered', null, 'EnLinea') }}
                <input
                  v-model="aparte"
                  class="compra-campo mt-1 w-full"
                  type="text"
                  maxlength="140"
                  :placeholder="__('Personal, refunded…', null, 'EnLinea')"
                />
              </label>
              <button
                type="button"
                :class="['press w-full sm:w-auto', BTN.tonal]"
                :disabled="busy"
                @click="
                  review(
                    'gasto_mercado_pago',
                    {
                      compras: [
                        {
                          compra: reading.compra_mp,
                          apartar: true,
                          nota: aparte || undefined,
                        },
                      ],
                    },
                    __('Set aside', null, 'EnLinea'),
                  )
                "
              >
                {{ __('Set aside', null, 'EnLinea') }}
              </button>
            </div>
          </section>

          <section
            v-if="done"
            role="status"
            class="space-y-2 border-t border-outline-gray-1 pt-3"
          >
            <p class="whitespace-pre-line text-sm text-ink-gray-8">
              {{ done.receipt }}
            </p>
            <button
              v-if="done.action"
              type="button"
              :class="['press', BTN.text]"
              :disabled="busy"
              data-en-linea-deshacer
              @click="undo"
            >
              {{ __('Undo', null, 'EnLinea') }}
            </button>
          </section>
        </template>
      </div>
    </div>

    <BottomSheet
      :open="sheet.open"
      :title="__('Check before registering', null, 'EnLinea')"
      :dismissible="!busy"
      @close="sheet.open = false"
    >
      <ul class="divide-y divide-outline-gray-1 px-4" data-en-linea-tarjeta>
        <li v-for="line in sheet.lines" :key="line.n" class="py-2">
          <p
            :class="[
              'text-base',
              line.error ? 'text-ink-gray-5 line-through' : 'text-ink-gray-9',
            ]"
          >
            {{ line.label }}
          </p>
          <p v-if="line.error" class="text-sm text-ink-red-7">
            {{ line.error }}
          </p>
        </li>
      </ul>
      <p
        v-if="sheet.problem"
        role="alert"
        class="px-4 pt-2 text-sm text-ink-red-7"
      >
        {{ sheet.problem }}
      </p>
      <template #actions>
        <button
          type="button"
          :class="['press', BTN.text]"
          :disabled="busy"
          @click="sheet.open = false"
        >
          {{ __('Cancel', null, 'Compras') }}
        </button>
        <button
          type="button"
          :class="['press', BTN.filled]"
          :disabled="busy || !acceptableCount(sheet.lines)"
          data-en-linea-aplicar
          @click="apply"
        >
          {{ sheet.verb }}
        </button>
      </template>
    </BottomSheet>
  </div>
</template>
<script setup>
import { computed, defineComponent, h, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from 'frappe-ui'
import {
  AppBar,
  BottomSheet,
  EmptyState,
  Segmented,
  StatusChip,
} from '@/components/ui'
import ComprasPicker from '@/components/compras/ComprasPicker.vue'
import { chipClass } from '@/components/ui/chipClass'
import { BTN } from '@/documentos/tools'
import {
  comprasApi,
  money,
  problemOf,
  requestId,
} from '@/composables/useCompras'
import {
  acceptableCount,
  applyCard,
  enLineaApi,
  formFrom,
  previewCard,
  shopArgs,
  stateChip,
  undoAction,
} from '@/composables/useComprasEnLinea'

// The picked repairs and deals: removable chips (the bin is the chip's ×).
const ChipList = defineComponent({
  props: { items: { type: Array, required: true } },
  emits: ['remove'],
  setup(props, { emit }) {
    return () =>
      props.items.length
        ? h(
            'div',
            { class: 'flex flex-wrap gap-1.5' },
            props.items.map((item, i) =>
              h(
                'button',
                {
                  type: 'button',
                  class: ['press', chipClass(true)],
                  'aria-label': `${__('Remove', null, 'EnLinea')} ${item.label}`,
                  onClick: () => emit('remove', i),
                },
                [
                  item.label,
                  h('span', {
                    class: 'lucide-x size-3.5',
                    'aria-hidden': 'true',
                  }),
                ],
              ),
            ),
          )
        : null
  },
})

const route = useRoute()
const reading = ref(null)
const guard = ref(null)
const busy = ref(false)
const mode = ref('tienda')
const form = reactive(formFrom(null))
const gasto = reactive({ cuenta: '', label: '' })
const aparte = ref('')
const done = ref(null)
const sheet = reactive({
  open: false,
  lines: [],
  tool: '',
  args: null,
  verb: '',
  rid: '',
  problem: '',
})

const backTo = computed(() => {
  const back = route.query.return_to
  return typeof back === 'string' && back.startsWith('/crm/')
    ? back.slice(4)
    : { name: 'CompraEnLinea' }
})
const title = computed(
  () =>
    reading.value?.articulos?.[0]?.nombre ||
    __('Online purchase', null, 'EnLinea'),
)
const chip = computed(() => stateChip(reading.value?.estado_compra))
const toRegister = computed(
  () =>
    reading.value?.estado_compra === 'por revisar' && !reading.value?.sin_leer,
)
const modes = computed(() => [
  { value: 'tienda', label: __('For the shop', null, 'EnLinea') },
  { value: 'gasto', label: __('An expense', null, 'EnLinea') },
  { value: 'apartar', label: __('Set aside', null, 'EnLinea') },
])

async function load() {
  guard.value = null
  try {
    const got = await enLineaApi('purchase', { name: route.params.name })
    reading.value = got
    Object.assign(form, formFrom(got))
    form.lineas.forEach((l) => (l.nuevo = !l.articulo))
  } catch (error) {
    const p = problemOf(error)
    guard.value = {
      title: __('Could not open the purchase', null, 'EnLinea'),
      detail: p.detail,
    }
  }
}

function toggleNew(line) {
  line.nuevo = !line.nuevo
  if (line.nuevo) {
    line.articulo = ''
    line.articuloLabel = ''
  }
}
function addTo(list, option) {
  if (option && !list.some((x) => x.value === option.value)) list.push(option)
}

async function review(tool, args, verb) {
  busy.value = true
  sheet.problem = ''
  try {
    const card = await previewCard(tool, args)
    Object.assign(sheet, {
      open: true,
      lines: card.lines || [],
      tool,
      args,
      verb,
      rid: requestId(),
    })
  } catch (error) {
    toast.error(problemOf(error).detail)
  } finally {
    busy.value = false
  }
}
async function apply() {
  busy.value = true
  try {
    const result = await applyCard(sheet.tool, sheet.args, sheet.rid)
    sheet.open = false
    done.value = result
    toast.success(__('Registered', null, 'EnLinea'))
    await load()
  } catch (error) {
    sheet.problem = problemOf(error).detail
  } finally {
    busy.value = false
  }
}
async function undo() {
  busy.value = true
  try {
    const result = await undoAction(done.value.action)
    toast.success(__('Undone', null, 'EnLinea'))
    done.value = { receipt: result.receipt }
    await load()
  } catch (error) {
    toast.error(problemOf(error).detail)
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>
<style scoped>
/* The shell's filled field (Compra nueva's), 44 px on a phone, 40 on a desk. */
.compra-campo {
  height: 2.75rem;
  border: 1px solid transparent;
  border-radius: 0.5rem;
  background: var(--surface-gray-2);
  padding: 0 0.75rem;
  font-size: 1rem;
  color: var(--ink-gray-9);
}
@media (min-width: 640px) {
  .compra-campo {
    height: 2.5rem;
  }
}
.compra-campo:focus {
  outline: none;
  border-color: var(--outline-gray-4);
  background: var(--surface-base, transparent);
}
</style>
