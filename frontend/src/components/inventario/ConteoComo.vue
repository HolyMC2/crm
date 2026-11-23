<template>
  <!-- «Cómo se cuenta»: what a counter sees and is asked for (blind, a second
       person's sample, when a photo, from what cost), for the shop and, where
       the shop has several, for a store that counts its own way. -->
  <section
    class="rounded-7 bg-surface-gray-1 px-4 pb-4 pt-3"
    :aria-label="__('How it is counted', null, CTX)"
    data-conteos-como
  >
    <p class="text-xs font-medium text-ink-gray-6">
      {{ __('How it is counted', null, CTX) }}
    </p>
    <div class="flex min-h-12 items-center justify-between gap-3">
      <span class="min-w-0 flex-1 text-md text-ink-gray-9">{{
        __('Blind', null, CTX)
      }}</span>
      <AjustesSwitch
        :model-value="settings.blind"
        :label="__('Blind', null, CTX)"
        data-como-ciegas
        @update:model-value="
          (on) =>
            $emit('save', 'blind', { blind: on }, (s) => {
              s.blind = on
            })
        "
      />
    </div>
    <p v-if="errors.blind" role="alert" class="pb-1 text-sm text-ink-red-7">
      {{ errors.blind }}
    </p>
    <div class="flex min-h-12 items-center justify-between gap-3">
      <span class="min-w-0 flex-1 text-md text-ink-gray-9">{{
        __('Someone else recounts a sample', null, CTX)
      }}</span>
      <AjustesSwitch
        :model-value="settings.sample"
        :label="__('Someone else recounts a sample', null, CTX)"
        data-como-muestra
        @update:model-value="
          (on) =>
            $emit('save', 'sample', { sample: on }, (s) => {
              s.sample = on
            })
        "
      />
    </div>
    <p v-if="errors.sample" role="alert" class="pb-1 text-sm text-ink-red-7">
      {{ errors.sample }}
    </p>
    <ChipGroup
      class="pt-2"
      :label="__('Photo', null, CTX)"
      :options="proofOptions()"
      :model-value="settings.proof"
      testid="foto"
      @update:model-value="
        (proof) =>
          proof &&
          $emit('save', 'proof', { proof }, (s) => {
            s.proof = proof
          })
      "
    />
    <p v-if="errors.proof" role="alert" class="pt-1 text-sm text-ink-red-7">
      {{ errors.proof }}
    </p>
    <!-- The cost from which a product is «de alto valor»: the shop's money. -->
    <div
      v-if="seesMoney"
      class="flex min-h-12 items-center justify-between gap-3 pt-3"
    >
      <span class="min-w-0 flex-1 text-md text-ink-gray-9">{{
        __('High value from', null, CTX)
      }}</span>
      <ConteoMonto
        :model-value="settings.high_value"
        :currency="settings.currency || ''"
        :label="__('High value from', null, CTX)"
        placeholder="—"
        data-como-alto
        @commit="
          (amount) =>
            $emit('save', 'high_value', { high_value: amount || 0 }, (s) => {
              s.high_value = amount || 0
            })
        "
      />
    </div>
    <p
      v-if="errors.high_value"
      role="alert"
      class="pt-1 text-sm text-ink-red-7"
    >
      {{ errors.high_value }}
    </p>

    <!-- A store that counts its own way: its chip opens the same three
         choices, «Como la tienda» first. A dot marks a store that differs. -->
    <template v-if="stores.length > 1">
      <p class="mb-1.5 mt-4 text-xs font-medium text-ink-gray-6">
        {{ __('Different in', null, CTX) }}
      </p>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="store in stores"
          :key="store.name"
          type="button"
          :class="chipClass(store.name === openStore)"
          :aria-expanded="String(store.name === openStore)"
          :data-como-almacen="store.name"
          @click="openStore = store.name === openStore ? '' : store.name"
        >
          <span
            v-if="store.count?.own?.length"
            class="size-1.5 flex-none rounded-full bg-current"
            aria-hidden="true"
          />
          {{ store.label }}
        </button>
      </div>
      <ExpandTransition>
        <div
          v-if="current"
          class="flex flex-col gap-3 pt-3"
          data-como-almacen-ajustes
        >
          <template v-for="rule in RULES" :key="rule.key">
            <!-- What the tenant's own settings decide is shown, not offered. -->
            <div
              v-if="fixed(rule.key)"
              class="flex min-h-11 items-center justify-between gap-3"
            >
              <span class="min-w-0 flex-1 text-sm text-ink-gray-7">{{
                rule.label()
              }}</span>
              <span class="num text-md font-medium text-ink-gray-9">{{
                valueWords(rule.key)
              }}</span>
              <span
                class="lucide-lock size-4 flex-none text-ink-gray-6"
                role="img"
                :aria-label="__('Set by the shop settings', null, CTX)"
                :title="__('Set by the shop settings', null, CTX)"
              />
            </div>
            <ChipGroup
              v-else-if="rule.key !== 'high_value'"
              :label="rule.label()"
              :options="rule.options()"
              :model-value="ownValue(rule.key)"
              :testid="`almacen-${rule.key}`"
              @update:model-value="(value) => setOwn(rule.key, value)"
            />
            <div
              v-else-if="seesMoney"
              class="flex min-h-12 items-center justify-between gap-3"
            >
              <span class="min-w-0 flex-1 text-md text-ink-gray-9">{{
                rule.label()
              }}</span>
              <ConteoMonto
                :model-value="
                  own('high_value') ? current.count.high_value : null
                "
                :currency="settings.currency || ''"
                :label="rule.label()"
                :placeholder="amountText(settings.high_value) || '—'"
                @commit="(amount) => setOwn('high_value', amount)"
              />
            </div>
          </template>
          <p
            v-if="errors[`w:${current.name}`]"
            role="alert"
            class="text-sm text-ink-red-7"
          >
            {{ errors[`w:${current.name}`] }}
          </p>
        </div>
      </ExpandTransition>
    </template>
  </section>
</template>
<script setup>
import { computed, ref } from 'vue'
import { ChipGroup, ExpandTransition, chipClass } from '@/components/ui'
import AjustesSwitch from '@/components/ajustes/AjustesSwitch.vue'
import ConteoMonto from './ConteoMonto.vue'
import {
  CTX,
  amountText,
  blindOptions,
  currencySign,
  ownProofOptions,
  proofOptions,
} from './conteos'

const props = defineProps({
  /** The page's `settings` and `warehouses`. */
  settings: { type: Object, required: true },
  warehouses: { type: Array, default: () => [] },
  /** Whoever is kept from the shop's money gets no amount to read or set. */
  seesMoney: { type: Boolean, default: false },
  /** The page's refusals: by the shop's choice, and `w:<store>` for a store's. */
  errors: { type: Object, default: () => ({}) },
})
// save(what, args, paint(settings)) for the shop; store(name, args, paint(store)) for one store.
const emit = defineEmits(['save', 'store'])

const RULES = [
  { key: 'blind', label: () => __('Blind', null, CTX), options: blindOptions },
  {
    key: 'proof',
    label: () => __('Photo', null, CTX),
    options: ownProofOptions,
  },
  { key: 'high_value', label: () => __('High value from', null, CTX) },
]

const openStore = ref('')
// The stores somebody can count in: one with counting off has no list to set.
const stores = computed(() => props.warehouses.filter((store) => !store.off))
const current = computed(
  () => stores.value.find((store) => store.name === openStore.value) || null,
)
const own = (key) => !!current.value?.count?.own?.includes(key)
const fixed = (key) => !!current.value?.count?.fixed?.includes(key)

/** The chip that is on: '' («Como la tienda») unless this store sets it apart. */
function ownValue(key) {
  if (!own(key)) return ''
  const count = current.value.count
  return key === 'blind' ? (count.blind ? 'yes' : 'no') : count.proof
}
/** A choice the tenant's settings made, in words. */
function valueWords(key) {
  const count = current.value.count
  if (key === 'blind')
    return count.blind ? __('Yes', null, CTX) : __('No', null, CTX)
  if (key === 'proof')
    return (
      proofOptions().find((option) => option.value === count.proof)?.label || ''
    )
  if (!props.seesMoney || !count.high_value) return '—'
  return `${currencySign(props.settings.currency)}${amountText(count.high_value)}`
}

function setOwn(key, value) {
  const name = current.value.name
  // Nothing chosen: this store takes the shop's again.
  if (value === '' || value === null || value === undefined) {
    if (!own(key)) return
    emit('store', name, { inherit: [key] }, (store) => {
      store.count.own = store.count.own.filter((k) => k !== key)
      store.count[key] = props.settings[key]
    })
    return
  }
  const sent = key === 'blind' ? value === 'yes' : value
  emit('store', name, { [key]: sent }, (store) => {
    store.count[key] = sent
    if (!store.count.own.includes(key)) store.count.own.push(key)
  })
}
</script>
