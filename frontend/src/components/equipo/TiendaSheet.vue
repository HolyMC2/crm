<template>
  <!-- «Tienda» on a person in Equipo (owner only): which shop they work in
       and what they do there. The only shop, or their default one, is picked
       on open; a shop they are already in offers «Quitar de la tienda», two
       taps in place. The answer replaces the page's view. -->
  <BottomSheet
    :open="open"
    :title="__('Shop of {0}', [who], 'Equipo')"
    :dismissible="!busy"
    @update:open="(value) => emit('update:open', value)"
  >
    <div class="space-y-4 pb-2" data-testid="tienda-hoja">
      <section v-if="shops.length">
        <h3
          id="tienda-hoja-tienda"
          class="mb-1.5 text-sm font-medium text-ink-gray-7"
        >
          {{ __('Which shop', null, 'Equipo') }}
        </h3>
        <div
          class="space-y-2"
          role="radiogroup"
          aria-labelledby="tienda-hoja-tienda"
        >
          <button
            v-for="s in shops"
            :key="s.name"
            type="button"
            role="radio"
            class="press flex min-h-12 w-full items-center gap-3 rounded-6 border px-3 py-2 text-left"
            :class="
              shop === s.name
                ? 'border-[var(--muelle-accent)] bg-surface-gray-1'
                : 'border-outline-gray-2'
            "
            :aria-checked="shop === s.name"
            :disabled="!!busy"
            :data-tienda="s.name"
            @click="pickShop(s.name)"
          >
            <span
              class="min-w-0 flex-1 break-words text-base text-ink-gray-9"
              >{{ s.label || s.name }}</span
            >
            <span
              v-if="shop === s.name"
              class="lucide-check size-5 flex-none text-ink-gray-9"
              aria-hidden="true"
            />
          </button>
        </div>
      </section>
      <p v-else class="text-base text-ink-gray-7">
        {{ __('There are no shops yet.', null, 'Equipo') }}
      </p>

      <section v-if="shop">
        <h3
          id="tienda-hoja-nivel"
          class="mb-1.5 text-sm font-medium text-ink-gray-7"
        >
          {{ __('What they do there', null, 'Equipo') }}
        </h3>
        <div
          class="space-y-2"
          role="radiogroup"
          aria-labelledby="tienda-hoja-nivel"
        >
          <button
            v-for="l in levels"
            :key="l.value"
            type="button"
            role="radio"
            class="press flex min-h-12 w-full items-center gap-3 rounded-6 border px-3 py-2 text-left"
            :class="
              level === l.value
                ? 'border-[var(--muelle-accent)] bg-surface-gray-1'
                : 'border-outline-gray-2'
            "
            :aria-checked="level === l.value"
            :disabled="!!busy"
            :data-nivel="l.value"
            @click="pickLevel(l.value)"
          >
            <span class="min-w-0 flex-1">
              <span class="block text-base text-ink-gray-9">{{ l.label }}</span>
              <span v-if="l.hint" class="block text-sm text-ink-gray-6">{{
                l.hint
              }}</span>
            </span>
            <span
              v-if="level === l.value"
              class="lucide-check size-5 flex-none text-ink-gray-9"
              aria-hidden="true"
            />
          </button>
        </div>
      </section>

      <!-- Leaving a shop: the first tap asks in place, the second removes. -->
      <div
        v-if="grant?.enabled"
        class="space-y-2 border-t border-outline-gray-1 pt-3"
      >
        <button
          v-if="!confirmingRemove"
          type="button"
          class="press inline-flex min-h-11 items-center rounded-full px-1 text-base-medium text-ink-red-7 disabled:opacity-50"
          :disabled="!!busy"
          data-testid="tienda-quitar"
          @click="confirmingRemove = true"
        >
          {{ __('Remove from the shop', null, 'Equipo') }}
        </button>
        <template v-else>
          <p class="text-sm text-ink-gray-7">
            {{
              __(
                'They stop seeing the stock and prices of {0}.',
                [shopLabel],
                'Equipo',
              )
            }}
          </p>
          <div class="flex gap-2">
            <button
              type="button"
              :class="['press flex-1', BTN.danger]"
              :disabled="!!busy"
              data-testid="tienda-quitar-si"
              @click="remove"
            >
              <span
                v-if="busy === 'remove'"
                class="lucide-loader-circle size-5 animate-spin"
                aria-hidden="true"
              />
              {{
                failed === 'remove'
                  ? __('Try again', null, 'Equipo')
                  : __('Yes, remove from the shop', null, 'Equipo')
              }}
            </button>
            <button
              type="button"
              :class="['press flex-none', BTN.tonal]"
              :disabled="!!busy"
              @click="confirmingRemove = false"
            >
              {{ __('Cancel', null, 'Equipo') }}
            </button>
          </div>
        </template>
      </div>

      <p
        v-if="problem"
        role="alert"
        class="rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
        data-testid="tienda-problema"
      >
        {{ problem }}
      </p>
    </div>

    <template #actions>
      <p v-if="!shop && shops.length" class="text-sm text-ink-gray-6">
        {{ __('Choose a shop.', null, 'Equipo') }}
      </p>
      <div class="flex gap-2">
        <button
          type="button"
          :class="['press flex-none', BTN.tonal]"
          :disabled="!!busy"
          data-testid="tienda-cancelar"
          @click="emit('update:open', false)"
        >
          {{ __('Cancel', null, 'Equipo') }}
        </button>
        <button
          type="button"
          :class="['press flex-1', BTN.filled]"
          :disabled="!shop || !!busy"
          data-testid="tienda-guardar"
          @click="save"
        >
          <span
            v-if="busy === 'save'"
            class="lucide-loader-circle size-5 animate-spin"
            aria-hidden="true"
          />
          {{
            failed === 'save'
              ? __('Try again', null, 'Equipo')
              : __('Save', null, 'Equipo')
          }}
        </button>
      </div>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { BottomSheet } from '@/components/ui'
import { BTN } from '@/documentos/tools'
import {
  SHOP_ACCESS,
  equipoApi,
  problemOf,
  shopChanged,
  shopGrant,
  shopLevelChoices,
  shopLevelFor,
  shopLevelHint,
  shopLevelLabel,
  shopPreselect,
} from '@/composables/useEquipo'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** The person's login: set_shop_access's `user`. */
  user: { type: String, default: '' },
  /** Their name, for the title. */
  who: { type: String, default: '' },
  /** get_person's `tiendas`: {can_change, reason, shops, grants}. */
  tiendas: { type: Object, default: null },
})
const emit = defineEmits(['update:open', 'saved'])

const shop = ref('')
const level = ref('User')
// 'save' or 'remove' while its request runs.
const busy = ref('')
// The action whose last request failed: its button reads «Volver a intentar».
const failed = ref('')
const problem = ref('')
const confirmingRemove = ref(false)

const shops = computed(() => props.tiendas?.shops || [])
const grant = computed(() => shopGrant(props.tiendas, shop.value))
const levels = computed(() =>
  shopLevelChoices(grant.value?.enabled ? grant.value.level : null).map(
    (value) => ({
      value,
      label: shopLevelLabel(value),
      hint: shopLevelHint(value),
    }),
  ),
)
const shopLabel = computed(
  () =>
    shops.value.find((s) => s.name === shop.value)?.label ||
    grant.value?.shop_label ||
    shop.value,
)

function reset() {
  shop.value = shopPreselect(props.tiendas)
  level.value = shopLevelFor(props.tiendas, shop.value)
  busy.value = ''
  failed.value = ''
  problem.value = ''
  confirmingRemove.value = false
}
watch(
  () => props.open,
  (value) => {
    if (value) reset()
  },
  { immediate: true },
)

function pickShop(name) {
  if (busy.value || name === shop.value) return
  shop.value = name
  level.value = shopLevelFor(props.tiendas, name)
  failed.value = ''
  confirmingRemove.value = false
}
function pickLevel(value) {
  if (busy.value) return
  level.value = value
  failed.value = ''
}

async function send(kind, args) {
  busy.value = kind
  failed.value = ''
  problem.value = ''
  try {
    const answer = await equipoApi(SHOP_ACCESS, { user: props.user, ...args })
    emit('saved', answer)
    emit('update:open', false)
  } catch (error) {
    failed.value = kind
    problem.value = problemOf(error).detail
  } finally {
    busy.value = ''
  }
}
function save() {
  if (!shop.value || busy.value) return
  // Nothing to change: the sheet just closes.
  if (!shopChanged(props.tiendas, shop.value, level.value)) {
    emit('update:open', false)
    return
  }
  send('save', { shop: shop.value, level: level.value, enabled: 1 })
}
function remove() {
  if (!grant.value?.enabled || busy.value) return
  // The grant keeps its level; only `enabled` goes off.
  send('remove', {
    shop: shop.value,
    level: grant.value.level || level.value,
    enabled: 0,
  })
}
</script>
