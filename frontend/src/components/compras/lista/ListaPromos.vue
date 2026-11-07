<template>
  <!-- The promos of the list: the banners the list prints and the owner's own.
       A printed promo only switches off; the owner's can go. Each one says what
       it gives per how many pieces of which brand or model. -->
  <BottomSheet
    :open="open"
    :title="__('Promos', null, 'Lista')"
    :subtitle="__('{0} on this list', [promos.length], 'Lista')"
    layer="lista-promos"
    @update:open="emit('update:open', $event)"
  >
    <div class="space-y-3 pb-2">
      <p v-if="!promos.length" class="text-sm text-ink-gray-6">
        {{
          __(
            'The list printed no promos. The owner can add one below.',
            null,
            'Lista',
          )
        }}
      </p>
      <ul
        v-else
        class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
      >
        <li
          v-for="p in promos"
          :key="p.name"
          class="p-3"
          :class="p.active ? '' : 'opacity-60'"
        >
          <div class="flex items-start gap-3">
            <span
              :class="[
                p.kind === 'Descuento' ? 'lucide-badge-percent' : 'lucide-gift',
                'mt-0.5 size-5 flex-none text-ink-gray-6',
              ]"
              aria-hidden="true"
            />
            <div class="min-w-0 flex-1">
              <p class="text-sm">{{ p.text }}</p>
              <p class="mt-0.5 text-xs text-ink-gray-6">
                {{ meta(p) }}
              </p>
            </div>
            <button
              v-if="owner"
              type="button"
              class="press flex size-9 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
              :aria-label="
                editing === p.name
                  ? __('Close', null, 'Lista')
                  : __('Edit promo', null, 'Lista')
              "
              @click="toggleEdit(p)"
            >
              <span
                :class="[
                  editing === p.name ? 'lucide-x' : 'lucide-pencil',
                  'size-4',
                ]"
                aria-hidden="true"
              />
            </button>
          </div>
          <div
            v-if="editing === p.name"
            class="mt-3 grid grid-cols-2 gap-2 text-sm"
          >
            <label class="block">
              <span :class="LABEL">{{ __('Brand', null, 'Lista') }}</span>
              <input v-model="draft.brand" :class="INPUT" />
            </label>
            <label class="block">
              <span :class="LABEL">{{ __('Model', null, 'Lista') }}</span>
              <input v-model="draft.model" :class="INPUT" />
            </label>
            <label class="block">
              <span :class="LABEL">{{
                __('Per how many pieces', null, 'Lista')
              }}</span>
              <input
                v-model="draft.min_qty"
                :class="INPUT"
                type="number"
                min="1"
                step="1"
                inputmode="numeric"
              />
            </label>
            <label v-if="p.kind === 'Descuento'" class="block">
              <span :class="LABEL">{{ __('Discount %', null, 'Lista') }}</span>
              <input
                v-model="draft.discount"
                :class="INPUT"
                type="number"
                min="0"
                max="100"
                step="0.5"
                inputmode="decimal"
              />
            </label>
            <label v-else class="block">
              <span :class="LABEL">{{ __('Gift', null, 'Lista') }}</span>
              <input v-model="draft.gift" :class="INPUT" />
            </label>
            <div class="col-span-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                :class="['press', BTN.filled, 'min-h-10 px-4 text-sm']"
                :disabled="busy"
                @click="saveEdit(p)"
              >
                {{ __('Save', null, 'Lista') }}
              </button>
              <button
                type="button"
                :class="['press', BTN.text, 'min-h-10 px-3 text-sm']"
                :disabled="busy"
                @click="emit('update', p.name, { active: !p.active })"
              >
                {{
                  p.active
                    ? __('Switch off', null, 'Lista')
                    : __('Switch on', null, 'Lista')
                }}
              </button>
              <button
                v-if="p.source === 'Dueño'"
                type="button"
                :class="[
                  'press ml-auto',
                  BTN.text,
                  'min-h-10 px-3 text-sm text-ink-red-7',
                ]"
                :disabled="busy"
                @click="
                  confirmRemove === p.name
                    ? emit('remove', p.name)
                    : (confirmRemove = p.name)
                "
              >
                <span class="lucide-trash-2 size-4" aria-hidden="true" />
                {{
                  confirmRemove === p.name
                    ? __('Delete', null, 'Lista')
                    : __('Remove', null, 'Lista')
                }}
              </button>
            </div>
          </div>
        </li>
      </ul>

      <form
        v-if="owner"
        class="rounded-6 bg-surface-gray-1 p-3"
        @submit.prevent="add"
      >
        <label class="block">
          <span :class="LABEL">{{
            __('Your own promo or discount', null, 'Lista')
          }}</span>
          <input
            v-model="text"
            :class="INPUT"
            :placeholder="__('For 3 Realme C85 take a speaker', null, 'Lista')"
          />
        </label>
        <p class="mt-1 text-xs text-ink-gray-5">
          {{
            __(
              'Write it as the supplier would; the pieces, brand, model and gift or % are read from it.',
              null,
              'Lista',
            )
          }}
        </p>
        <button
          type="submit"
          :class="['press mt-2', BTN.tonal, 'min-h-10 px-4 text-sm']"
          :disabled="busy || !text.trim()"
        >
          <span class="lucide-plus size-4" aria-hidden="true" />
          {{ __('Add promo', null, 'Lista') }}
        </button>
      </form>
      <p v-else class="text-xs text-ink-gray-6">
        {{ __('Only the owner changes promos.', null, 'Lista') }}
      </p>
    </div>
  </BottomSheet>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { BottomSheet } from '@/components/ui'
import { BTN } from '@/documentos/tools'

defineProps({
  open: { type: Boolean, default: false },
  promos: { type: Array, default: () => [] },
  owner: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['update:open', 'add', 'update', 'remove'])

const LABEL = 'mb-1 block text-xs font-medium text-ink-gray-6'
const INPUT =
  'block w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 py-2 text-sm text-ink-gray-9 placeholder:text-ink-gray-4 focus:border-outline-gray-4 focus:ring-0'

const text = ref('')
const editing = ref('')
const confirmRemove = ref('')
const draft = reactive({
  brand: '',
  model: '',
  min_qty: 1,
  gift: '',
  discount: 0,
})

function meta(p) {
  const who = [p.brand, p.model].filter(Boolean).join(' ')
  const gives =
    p.kind === 'Descuento'
      ? __('{0} % off', [p.discount], 'Lista')
      : p.gift
        ? __('gift: {0}', [p.gift], 'Lista')
        : ''
  return [
    who
      ? __('per {0} of {1}', [p.min_qty, who], 'Lista')
      : __('per {0} pieces', [p.min_qty], 'Lista'),
    gives,
    p.source === 'Dueño'
      ? __('yours', null, 'Lista')
      : __('printed on the list', null, 'Lista'),
    p.active ? '' : __('off', null, 'Lista'),
  ]
    .filter(Boolean)
    .join(' · ')
}

function toggleEdit(p) {
  confirmRemove.value = ''
  if (editing.value === p.name) {
    editing.value = ''
    return
  }
  editing.value = p.name
  Object.assign(draft, {
    brand: p.brand,
    model: p.model,
    min_qty: p.min_qty,
    gift: p.gift,
    discount: p.discount,
  })
}

function saveEdit(p) {
  const fields = {
    brand: draft.brand,
    model: draft.model,
    min_qty: Math.max(1, Math.round(Number(draft.min_qty) || 1)),
  }
  if (p.kind === 'Descuento') fields.discount = Number(draft.discount) || 0
  else fields.gift = draft.gift
  emit('update', p.name, fields)
  editing.value = ''
}

function add() {
  if (!text.value.trim()) return
  emit('add', text.value.trim())
  text.value = ''
}
</script>
