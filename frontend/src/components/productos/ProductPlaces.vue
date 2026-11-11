<template>
  <!-- «Dónde está»: the cajón to walk to, under the shelf it sits on, so a
       worker finds the product without scrolling to the stock by store. -->
  <div
    class="col-span-2 rounded-6 bg-surface-gray-1 px-4 py-3 ring-1 ring-outline-gray-1 xl:col-span-1"
    data-places
  >
    <dt class="text-xs text-ink-gray-6">
      {{ __('Where it is', null, CTX) }}
    </dt>
    <dd v-for="place in cut.shown" :key="place.warehouse" class="mt-1">
      <p
        v-if="places.length > 1"
        class="mt-2 text-xs font-medium text-ink-gray-7"
        data-place-store
      >
        {{ place.label }}
      </p>
      <ul v-if="place.cajones.length">
        <li v-for="cajon in place.cajones" :key="cajon.ubicacion">
          <!-- 'a' and 'span' resolve to no registered component. -->
          <component
            :is="binHref ? 'a' : 'span'"
            :href="binHref ? binHref(cajon.ubicacion) : undefined"
            class="-mx-2 flex min-h-11 items-center gap-2 rounded-5 px-2 sm:min-h-9"
            :class="binHref ? 'press hover:bg-surface-gray-2' : ''"
            data-place-bin
          >
            <span
              class="lucide-inbox size-4 shrink-0 text-ink-gray-6"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1 py-1">
              <span
                v-if="cajon.trail"
                class="block text-xs text-ink-gray-6"
                data-place-trail
                >{{ cajon.trail }}</span
              >
              <span class="block text-sm font-semibold text-ink-gray-9">{{
                cajon.name
              }}</span>
            </span>
            <span class="num shrink-0 text-sm text-ink-gray-7">{{
              cajon.qty === null
                ? __('not counted', null, CTX)
                : [qty(cajon.qty), unit].filter(Boolean).join(' ')
            }}</span>
          </component>
        </li>
      </ul>
      <p
        v-else
        class="flex min-h-11 flex-wrap items-center gap-x-3 text-sm sm:min-h-9"
        data-place-unfiled
      >
        <span class="text-ink-amber-8">{{
          __('Not filed in a bin here')
        }}</span>
        <a
          v-if="assignHref"
          :href="assignHref(place)"
          class="press font-medium text-ink-gray-9 underline underline-offset-2"
          >{{ __('Assign bin') }}</a
        >
      </p>
    </dd>
    <dd v-if="cut.hidden > 0">
      <a
        href="#existencias"
        class="press mt-1 inline-flex min-h-11 items-center text-sm font-medium text-ink-gray-8 underline underline-offset-2 sm:min-h-8"
        data-places-more
        >{{ __('{0} more', [cut.hidden]) }}</a
      >
    </dd>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { qty } from '@/composables/useProductos'

const CTX = 'Productos'
// Lines the tile shows before «N más» points to the stock by store.
const LIMIT = 4

const props = defineProps({
  // productPlaces(): [{warehouse, label, cajones: [{ubicacion, name, trail, qty}]}]
  places: { type: Array, required: true },
  unit: { type: String, default: '' },
  // Escáner's page of a cajón and its «asignar» door, for its workers only.
  binHref: { type: Function, default: null },
  assignHref: { type: Function, default: null },
})

// Stores in order, as many cajones as still fit; a store with none takes
// one line («Sin cajón en esta tienda»).
const cut = computed(() => {
  let room = LIMIT
  let hidden = 0
  const shown = []
  for (const place of props.places) {
    const lines = Math.max(place.cajones.length, 1)
    if (room <= 0) {
      hidden += lines
    } else if (!place.cajones.length) {
      shown.push(place)
      room -= 1
    } else {
      const fits = place.cajones.slice(0, room)
      shown.push({ ...place, cajones: fits })
      hidden += place.cajones.length - fits.length
      room -= fits.length
    }
  }
  return { shown, hidden }
})
</script>
