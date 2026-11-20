<template>
  <!-- One merchant group of Por explicar: what it is, the likely answer, what a
       tap does in the books (before it is done), and its movements on demand. -->
  <div class="py-4" :data-por-explicar-grupo="group.label">
    <div class="flex items-start justify-between gap-3">
      <p class="min-w-0 break-words text-base font-medium text-ink-gray-9">
        {{ group.label }}
      </p>
      <p
        class="num whitespace-nowrap text-base font-semibold"
        :class="deposit ? 'text-ink-green-7' : 'text-ink-gray-9'"
      >
        {{ deposit ? '+' : '−' }}{{ ctx.fmt(group.total) }}
      </p>
    </div>
    <p class="mt-0.5 text-sm text-ink-gray-6">
      {{ group.bank_label }} · {{ countText(group.count) }} ·
      {{ rangeText(group.first, group.last) }}
    </p>

    <div
      v-if="group.guess"
      class="mt-3 rounded-6 bg-surface-gray-1 p-3"
      data-por-explicar-propuesta
    >
      <p class="flex items-start gap-2 text-sm text-ink-gray-9">
        <span
          class="lucide-sparkles mt-0.5 size-4 flex-none text-ink-gray-6"
          aria-hidden="true"
        />
        <span class="min-w-0">
          <span class="text-ink-gray-6">Parece:</span>
          {{ answer }}.
          <span class="text-ink-gray-6">{{ why }}</span>
        </span>
      </p>
      <ul
        v-if="effect.length"
        class="mt-2 space-y-0.5 border-t border-outline-gray-1 pt-2 text-sm text-ink-gray-8"
        aria-label="Al confirmar"
        data-por-explicar-efecto
      >
        <li v-for="(line, i) in effect" :key="i">
          <span v-if="i === 0" class="text-ink-gray-6">Al confirmar: </span
          >{{ line }}
        </li>
      </ul>
    </div>
    <p
      v-if="group.tags?.length"
      class="mt-2 flex flex-wrap gap-1.5"
      :aria-label="`Etiquetas: ${group.tags.join(', ')}`"
      data-por-explicar-grupo-etiquetas
    >
      <span
        v-for="t in group.tags"
        :key="t"
        class="inline-flex min-h-6 items-center gap-1 rounded-full bg-surface-gray-2 px-2 text-xs text-ink-gray-8"
      >
        <span class="lucide-tag size-3" aria-hidden="true" />{{ t }}
      </span>
    </p>

    <div class="mt-3 flex flex-wrap gap-2">
      <Button
        v-if="group.guess && canExplain"
        class="min-h-11"
        variant="solid"
        label="Sí, es eso"
        :loading="busy"
        data-por-explicar-si
        @click="emit('si')"
      />
      <Button
        v-if="canExplain"
        class="min-h-11"
        :variant="group.guess ? 'subtle' : 'solid'"
        :label="group.guess ? 'Otra cosa' : '¿Qué fue?'"
        data-por-explicar-que-fue
        @click="emit('otra')"
      />
      <Button
        class="min-h-11"
        variant="ghost"
        :label="open ? 'Ocultar' : 'Ver movimientos'"
        :aria-expanded="open"
        @click="emit('toggle')"
      />
    </div>
    <p
      v-if="problem"
      role="alert"
      class="mt-2 flex items-start gap-1.5 text-sm text-ink-red-7"
      data-por-explicar-grupo-problema
    >
      <span
        class="lucide-circle-alert mt-0.5 size-4 flex-none"
        aria-hidden="true"
      />
      <span class="min-w-0">{{ problem }}</span>
    </p>

    <ul
      v-if="open"
      class="mt-2 divide-y divide-outline-gray-1"
      :aria-label="`Movimientos de ${group.label}`"
    >
      <li
        v-for="r in group.rows"
        :key="r.name"
        class="flex items-start justify-between gap-3 py-2 text-sm"
      >
        <span class="min-w-0 flex-1">
          <span class="block text-ink-gray-6">{{ dayText(r.date) }}</span>
          <span class="block break-words text-ink-gray-8">{{
            r.description
          }}</span>
        </span>
        <span class="num whitespace-nowrap text-ink-gray-9">{{
          ctx.fmt(r.amount)
        }}</span>
        <button
          v-if="canExplain"
          type="button"
          class="press -my-1 grid size-10 flex-none place-items-center rounded-full text-ink-gray-7"
          aria-label="Adjuntar ticket o factura"
          title="Adjuntar ticket o factura"
          :data-por-explicar-adjuntar="r.name"
          @click="emit('adjuntar', r)"
        >
          <span class="lucide-paperclip size-5" aria-hidden="true" />
        </button>
      </li>
      <li
        v-if="group.count > group.rows.length"
        class="py-2 text-sm text-ink-gray-6"
      >
        Y {{ countText(group.count - group.rows.length) }} más: aparecen al
        explicar estos.
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Button } from 'frappe-ui'
import {
  answerText,
  countText,
  effectLines,
  rangeText,
  whyText,
} from '@/components/dinero/porExplicar'

const props = defineProps({
  group: { type: Object, required: true },
  /** {fmt, names, own}: money, account names and the own accounts' balances. */
  ctx: { type: Object, required: true },
  canExplain: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  open: { type: Boolean, default: false },
  problem: { type: String, default: '' },
})
const emit = defineEmits(['si', 'otra', 'toggle', 'adjuntar'])

const deposit = computed(() => props.group.direction === 'Deposit')
const answer = computed(() => {
  const g = props.group.guess
  return answerText(g.kind, g.account, props.group.direction, props.ctx.names)
})
const why = computed(() => whyText(props.group.guess, props.ctx.names))
const effect = computed(() => {
  const g = props.group.guess
  return g ? effectLines(props.group, g.kind, g.account, props.ctx) : []
})

function dayText(day) {
  if (!day) return ''
  return new Date(`${day}T12:00:00`).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
</script>
