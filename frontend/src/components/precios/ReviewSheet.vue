<template>
  <!-- «Revisar y guardar»: every new price old → new with its margin, the
       products marked «Sigue igual», and what still needs an OK, in one place.
       After saving: what saved, what came back (with its reason, kept as a
       draft on its row) and the next steps (labels, back to the document). -->
  <BottomSheet
    :open="open"
    :title="outcome ? 'Listo' : 'Revisar y guardar'"
    :subtitle="outcome ? '' : pendingLine(entries.length, kept.length)"
    :dismissible="!saving"
    layer="precios-revisar"
    @update:open="(value) => emit('update:open', value)"
  >
    <div v-if="outcome" class="space-y-3" data-precios-resultado>
      <p class="text-base text-ink-gray-9">{{ doneLine }}</p>
      <p
        v-if="outcome.failed"
        class="rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
      >
        {{
          outcome.failed === 1
            ? '1 producto no se guardó'
            : `${outcome.failed} productos no se guardaron`
        }}. Siguen en la lista con su razón y tu precio, para revisarlos.
      </p>
      <div class="flex flex-col gap-2">
        <button
          v-if="outcome.failed"
          type="button"
          class="press inline-flex min-h-11 items-center justify-center rounded-6 bg-[var(--muelle-accent)] px-4 text-base font-medium text-[var(--muelle-accent-ink)]"
          @click="emit('show-failed')"
        >
          Revisar los que faltan
        </button>
        <RouterLink
          v-if="labelsTo"
          :to="labelsTo"
          class="press inline-flex min-h-11 items-center justify-center gap-2 rounded-6 bg-surface-gray-2 px-4 text-base font-medium text-ink-gray-9"
        >
          <span class="lucide-tag size-4" aria-hidden="true" />
          Imprimir etiquetas de los cambiados
        </RouterLink>
        <button
          v-if="returnLabel"
          type="button"
          class="press inline-flex min-h-11 items-center justify-center rounded-6 bg-surface-gray-2 px-4 text-base font-medium text-ink-gray-9"
          @click="emit('back')"
        >
          Volver a {{ returnLabel }}
        </button>
      </div>
    </div>

    <div v-else class="space-y-4" data-precios-revision>
      <section v-if="entries.length" aria-label="Precios nuevos">
        <h3 class="title-face mb-1 text-base font-semibold text-ink-gray-9">
          Precios nuevos
        </h3>
        <ul class="divide-y divide-outline-gray-1">
          <li v-for="entry in entries" :key="entry.key" class="py-2">
            <div class="flex items-center gap-3">
              <div class="min-w-0 flex-1">
                <p class="truncate text-base text-ink-gray-9">
                  {{ entry.name }}
                </p>
                <p class="truncate text-sm text-ink-gray-6">
                  {{ entry.list
                  }}<template v-if="entry.margin !== null">
                    · margen {{ entry.margin }} %</template
                  >
                </p>
              </div>
              <div class="num text-right">
                <p class="text-base font-medium text-ink-gray-9">
                  {{ money(entry.value, currency) }}
                </p>
                <p class="text-sm text-ink-gray-6">
                  <template v-if="entry.before === null"
                    >Primer precio</template
                  >
                  <template v-else>
                    {{ money(entry.before, currency) }} ·
                    {{ entry.pct > 0 ? '▲' : '▼' }} {{ Math.abs(entry.pct) }} %
                  </template>
                </p>
              </div>
            </div>
            <label
              v-if="entry.needsAck"
              class="mt-1 flex min-h-11 items-start gap-2 text-sm text-ink-amber-8"
            >
              <input
                type="checkbox"
                class="mt-1"
                :checked="entry.acked"
                @change="
                  emit('ack', { key: entry.key, value: $event.target.checked })
                "
              />
              <span>{{ entry.ackText }}</span>
            </label>
          </li>
        </ul>
      </section>
      <section v-if="kept.length" aria-label="Siguen igual">
        <h3 class="title-face mb-1 text-base font-semibold text-ink-gray-9">
          Siguen igual
        </h3>
        <p class="mb-1 text-sm text-ink-gray-6">
          Se confirma su precio de hoy en todas sus listas.
        </p>
        <ul class="divide-y divide-outline-gray-1">
          <li
            v-for="entry in kept"
            :key="entry.code"
            class="truncate py-2 text-base text-ink-gray-9"
          >
            {{ entry.name }}
          </li>
        </ul>
      </section>
      <p
        v-if="blocked.length"
        class="rounded-6 bg-surface-gray-1 p-3 text-sm text-ink-gray-7"
      >
        {{
          blocked.length === 1
            ? '1 precio no se puede guardar'
            : `${blocked.length} precios no se pueden guardar`
        }}
        desde tu usuario y se quedan fuera: {{ blocked.slice(0, 3).join(', ')
        }}<template v-if="blocked.length > 3"> y más</template>. Ábrelos en el
        producto para pedir el cambio.
      </p>
      <p
        v-if="problem"
        role="alert"
        class="rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
      >
        <strong>{{ problem.title }}.</strong> {{ problem.detail }}
      </p>
    </div>

    <template v-if="!outcome" #actions>
      <button
        type="button"
        class="press inline-flex min-h-11 items-center rounded-6 px-4 text-base font-medium text-ink-gray-8 hover:bg-surface-gray-2"
        :disabled="saving"
        @click="emit('update:open', false)"
      >
        Seguir editando
      </button>
      <button
        type="button"
        class="press inline-flex min-h-11 items-center gap-2 rounded-6 bg-[var(--muelle-accent)] px-4 text-base font-medium text-[var(--muelle-accent-ink)] disabled:opacity-50"
        :disabled="!ready || saving"
        data-precios-guardar
        @click="emit('save')"
      >
        <span
          v-if="saving"
          class="lucide-loader-circle size-4 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        {{ saveLabel }}
      </button>
    </template>
    <template v-if="!outcome && missing" #footer>
      <p class="px-4 pb-2 text-sm text-ink-amber-8">
        {{
          missing === 1
            ? 'Marca el aviso de arriba para guardar.'
            : `Marca los ${missing} avisos de arriba para guardar.`
        }}
      </p>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { BottomSheet } from '@/components/ui'
import { money, pendingLine } from '@/composables/usePrecios'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** [{ key, code, name, list, before, value, pct, margin, needsAck, acked, ackText }] */
  entries: { type: Array, default: () => [] },
  /** [{ code, name }] */
  kept: { type: Array, default: () => [] },
  /** Names of the drafts on lists the worker cannot write. */
  blocked: { type: Array, default: () => [] },
  currency: { type: String, default: 'MXN' },
  saving: { type: Boolean, default: false },
  problem: { type: Object, default: null },
  outcome: { type: Object, default: null },
  labelsTo: { type: String, default: '' },
  /** Where the worker came from («la recepción»); empty hides the way back. */
  returnLabel: { type: String, default: '' },
})
const emit = defineEmits(['update:open', 'ack', 'save', 'show-failed', 'back'])

const missing = computed(
  () => props.entries.filter((entry) => entry.needsAck && !entry.acked).length,
)
const ready = computed(
  () => (props.entries.length || props.kept.length) && !missing.value,
)
const saveLabel = computed(() => {
  const n = props.entries.length + props.kept.length
  if (props.saving) return 'Guardando…'
  return n === 1 ? 'Guardar 1 cambio' : `Guardar ${n} cambios`
})
const doneLine = computed(() => {
  const o = props.outcome || {}
  const bits = []
  if (o.saved)
    bits.push(
      o.saved === 1
        ? 'Guardé el precio de 1 producto'
        : `Guardé los precios de ${o.saved} productos`,
    )
  if (o.kept)
    bits.push(
      o.kept === 1
        ? 'confirmé 1 que sigue igual'
        : `confirmé ${o.kept} que siguen igual`,
    )
  if (!bits.length) return 'No se guardó ningún cambio.'
  const text = bits.join(' y ')
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`
})
</script>
