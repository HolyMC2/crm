<template>
  <!-- The daily reminder (crm docs/DINERO_EN_ORDEN.md §3d): what is left to
       explain and the cash to count, in the owner's chat and the bell. Saved
       in the company's «Plan de Dinero». -->
  <BottomSheet
    :open="open"
    title="Recordatorio"
    subtitle="Te aviso en el chat del asistente y en la campana. Solo a ti."
    layer="por-explicar-recordatorio"
    @update:open="emit('update:open', $event)"
  >
    <div class="space-y-5 pb-2" data-recordatorio>
      <button
        type="button"
        role="switch"
        class="press flex min-h-11 w-full items-center gap-3 text-left"
        :aria-checked="form.on"
        data-recordatorio-activo
        @click="form.on = !form.on"
      >
        <span class="min-w-0 flex-1">
          <span class="block text-base text-ink-gray-9"
            >Recuérdame lo que falta explicar</span
          >
          <span class="block text-xs text-ink-gray-6"
            >Una vez al día, solo si hay algo.</span
          >
        </span>
        <span
          class="relative h-7 w-12 flex-none rounded-full transition-colors"
          :class="form.on ? 'bg-[var(--muelle-accent)]' : 'bg-surface-gray-4'"
          aria-hidden="true"
        >
          <span
            class="absolute top-0.5 size-6 rounded-full bg-surface-base shadow transition-transform"
            :class="form.on ? 'translate-x-5' : 'translate-x-0.5'"
          />
        </span>
      </button>

      <div v-if="form.on">
        <p class="text-sm font-medium text-ink-gray-7">¿A qué hora?</p>
        <div
          class="mt-2 flex flex-wrap gap-2"
          role="radiogroup"
          aria-label="¿A qué hora?"
        >
          <button
            v-for="h in REMIND_HOURS"
            :key="h"
            type="button"
            role="radio"
            class="press min-h-11 rounded-full px-4 text-sm"
            :class="
              form.hour === h
                ? 'bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
                : 'border border-outline-gray-2 text-ink-gray-8'
            "
            :aria-checked="form.hour === h"
            :data-recordatorio-hora="h"
            @click="form.hour = h"
          >
            {{ hourText(h) }}
          </button>
        </div>
      </div>

      <div>
        <p class="text-sm font-medium text-ink-gray-7">
          Pedirme contar la caja
        </p>
        <div
          class="mt-2 flex flex-wrap gap-2"
          role="radiogroup"
          aria-label="Pedirme contar la caja"
        >
          <button
            v-for="n in COUNT_EVERY"
            :key="n"
            type="button"
            role="radio"
            class="press min-h-11 rounded-full px-4 text-sm"
            :class="
              form.every === n
                ? 'bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
                : 'border border-outline-gray-2 text-ink-gray-8'
            "
            :aria-checked="form.every === n"
            :data-recordatorio-cada="n"
            @click="form.every = n"
          >
            {{ everyText(n) }}
          </button>
        </div>
      </div>
      <p v-if="form.problem" role="alert" class="text-sm text-ink-red-7">
        {{ form.problem }}
      </p>
    </div>
    <template #actions>
      <div class="flex gap-2">
        <Button
          class="min-h-11 flex-1"
          label="Cancelar"
          @click="emit('update:open', false)"
        />
        <Button
          class="min-h-11 flex-1"
          variant="solid"
          label="Guardar"
          :loading="form.busy"
          data-recordatorio-guardar
          @click="save()"
        />
      </div>
    </template>
  </BottomSheet>
</template>

<script setup>
import { reactive, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { errorText } from '@/components/bancos/bancos'
import {
  COUNT_EVERY,
  REMIND_HOURS,
  everyText,
  hourText,
  porExplicarApi,
} from '@/components/dinero/porExplicar'

const props = defineProps({
  open: { type: Boolean, default: false },
  data: { type: Object, default: null },
})
const emit = defineEmits(['update:open', 'done'])

const form = reactive({
  on: true,
  hour: 20,
  every: 7,
  busy: false,
  problem: '',
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    const r = props.data?.recordatorio || {}
    Object.assign(form, {
      on: Boolean(r.remind ?? 1),
      hour: Number(r.hour ?? 20),
      every: Number(r.every ?? 7),
      busy: false,
      problem: '',
    })
  },
  { immediate: true },
)

async function save() {
  if (form.busy) return
  form.busy = true
  form.problem = ''
  try {
    const page = await porExplicarApi('recordatorio_guardar', {
      company: props.data.company,
      activo: form.on ? 1 : 0,
      hora: form.hour,
      contar_cada: form.every,
    })
    emit('done', page)
    emit('update:open', false)
  } catch (e) {
    form.problem = errorText(e)
  } finally {
    form.busy = false
  }
}
</script>
