<template>
  <!-- The money tags (crm docs/DINERO_EN_ORDEN.md §3d): the catalog by kind,
       a starter set from this business's own records to accept in one tap,
       and a new tag with the words that suggest it on new movements. -->
  <BottomSheet
    :open="open"
    title="Etiquetas"
    subtitle="Para qué fue el dinero: una parte del negocio, un proyecto o lo tuyo."
    layer="por-explicar-etiquetas"
    @update:open="emit('update:open', $event)"
  >
    <div class="space-y-5 pb-2" data-etiquetas-sheet>
      <section v-if="starter.length" aria-label="Sugeridas para tu negocio">
        <p class="text-sm font-medium text-ink-gray-7">
          Sugeridas para tu negocio
        </p>
        <ul class="mt-1 divide-y divide-outline-gray-1">
          <li v-for="t in starter" :key="t.label">
            <button
              type="button"
              role="checkbox"
              class="press flex min-h-11 w-full items-center gap-3 py-2 text-left"
              :aria-checked="picked.includes(t.label)"
              :data-etiqueta-sugerida="t.label"
              @click="togglePick(t.label)"
            >
              <span
                class="flex size-6 flex-none items-center justify-center rounded-4 border"
                :class="
                  picked.includes(t.label)
                    ? 'border-transparent bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
                    : 'border-outline-gray-3'
                "
                aria-hidden="true"
              >
                <span
                  v-if="picked.includes(t.label)"
                  class="lucide-check size-4"
                />
              </span>
              <span class="min-w-0 flex-1 text-base text-ink-gray-9">{{
                t.label
              }}</span>
              <span class="text-xs text-ink-gray-6">{{
                GROUP_WORDS[t.grupo]
              }}</span>
            </button>
          </li>
        </ul>
        <Button
          class="mt-2 min-h-11"
          variant="solid"
          :label="
            picked.length === 1
              ? 'Crear 1 etiqueta'
              : `Crear ${picked.length} etiquetas`
          "
          :disabled="!picked.length"
          :loading="busy"
          data-etiquetas-crear-sugeridas
          @click="create(starter.filter((t) => picked.includes(t.label)))"
        />
      </section>

      <section
        v-for="group in groups"
        :key="group.key"
        :aria-label="group.label"
      >
        <p class="text-sm font-medium text-ink-gray-7">{{ group.label }}</p>
        <div class="mt-2 flex flex-wrap gap-2">
          <span
            v-for="t in group.tags"
            :key="t.label"
            class="inline-flex min-h-8 items-center rounded-full bg-surface-gray-2 px-3 text-sm text-ink-gray-8"
            >{{ t.label }}</span
          >
        </div>
      </section>

      <form
        class="space-y-2 rounded-7 border border-outline-gray-2 p-3"
        aria-label="Nueva etiqueta"
        @submit.prevent="create([newTag()])"
      >
        <p class="text-sm font-medium text-ink-gray-7">Nueva etiqueta</p>
        <input
          v-model="form.label"
          maxlength="60"
          autocomplete="off"
          class="min-h-11 w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-base text-ink-gray-9"
          placeholder="Remodelación, Taller, Casa…"
          aria-label="Nombre de la etiqueta"
          data-etiqueta-nombre
        />
        <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo">
          <button
            v-for="(word, key) in GROUP_WORDS"
            :key="key"
            type="button"
            role="radio"
            class="press min-h-10 rounded-full px-3 text-sm"
            :class="
              form.grupo === key
                ? 'bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
                : 'border border-outline-gray-2 text-ink-gray-8'
            "
            :aria-checked="form.grupo === key"
            @click="form.grupo = key"
          >
            {{ word }}
          </button>
        </div>
        <textarea
          v-model="form.words"
          rows="2"
          class="w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 py-2 text-sm text-ink-gray-9"
          placeholder="Palabras del banco que la sugieren, una por renglón (ANTHROPIC, PETROPLAZAS…)"
          aria-label="Palabras que la sugieren"
          data-etiqueta-palabras
        />
        <Button
          class="min-h-11"
          label="Agregar"
          :disabled="!form.label.trim()"
          :loading="busy"
          data-etiqueta-agregar
          @click="create([newTag()])"
        />
      </form>
      <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
        {{ problem }}
      </p>
    </div>
  </BottomSheet>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { errorText } from '@/components/bancos/bancos'
import { porExplicarApi } from '@/components/dinero/porExplicar'

const GROUP_WORDS = Object.freeze({
  Business: 'Del negocio',
  Project: 'Proyecto',
  Personal: 'Tuyo',
})

const props = defineProps({
  open: { type: Boolean, default: false },
  data: { type: Object, default: null },
})
const emit = defineEmits(['update:open', 'done'])

const starter = ref([])
const picked = ref([])
const busy = ref(false)
const problem = ref('')
const form = reactive({ label: '', grupo: 'Business', words: '' })

const groups = computed(() =>
  Object.entries(GROUP_WORDS)
    .map(([key, label]) => ({
      key,
      label,
      tags: (props.data?.etiquetas || []).filter((t) => t.grupo === key),
    }))
    .filter((g) => g.tags.length),
)

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    problem.value = ''
    Object.assign(form, { label: '', grupo: 'Business', words: '' })
    try {
      starter.value = await porExplicarApi('etiquetas_sugeridas', {
        company: props.data?.company,
      })
      picked.value = starter.value.map((t) => t.label)
    } catch (e) {
      starter.value = []
      problem.value = errorText(e)
    }
  },
  { immediate: true },
)

function togglePick(label) {
  picked.value = picked.value.includes(label)
    ? picked.value.filter((t) => t !== label)
    : [...picked.value, label]
}

function newTag() {
  return {
    label: form.label.trim(),
    grupo: form.grupo,
    palabras: form.words
      .split('\n')
      .map((w) => w.trim())
      .filter(Boolean),
  }
}

async function create(tags) {
  if (busy.value || !tags.length || !tags[0].label) return
  busy.value = true
  problem.value = ''
  try {
    const page = await porExplicarApi('etiquetas_crear', {
      company: props.data.company,
      etiquetas_nuevas: tags,
    })
    emit('done', page)
    const made = new Set(tags.map((t) => t.label))
    starter.value = starter.value.filter((t) => !made.has(t.label))
    picked.value = picked.value.filter((t) => !made.has(t))
    Object.assign(form, { label: '', grupo: 'Business', words: '' })
  } catch (e) {
    problem.value = errorText(e)
  } finally {
    busy.value = false
  }
}
</script>
