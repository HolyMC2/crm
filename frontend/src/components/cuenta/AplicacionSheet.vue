<template>
  <!-- «Activar» an app: what it does, how it starts (empty, or with sample
       data when the app ships them) and one «Activar» that starts the install. -->
  <BottomSheet
    :open="open"
    :title="app ? __('Turn on {0}', [app.title], 'Cuenta') : ''"
    :dismissible="!busy"
    @update:open="(value) => !value && $emit('close')"
  >
    <div v-if="app" class="space-y-4 pb-2" data-testid="app-activacion">
      <p v-if="app.description" class="text-base text-ink-gray-8">
        {{ app.description }}
      </p>
      <ul v-if="app.features.length" class="space-y-1 text-sm text-ink-gray-7">
        <li v-for="feature in app.features" :key="feature" class="flex gap-2">
          <span
            class="lucide-check mt-0.5 size-4 flex-none text-ink-gray-5"
            aria-hidden="true"
          />
          <span class="min-w-0">{{ feature }}</span>
        </li>
      </ul>
      <p v-if="app.dependencyNote" class="text-sm text-ink-gray-7">
        {{ app.dependencyNote }}
      </p>
      <!-- A choice only when the app ships sample data: the kit's two-way
           control, the chosen way's detail under it. -->
      <div
        v-if="app.seeds.length > 1"
        class="space-y-2"
        data-testid="app-inicio"
      >
        <p class="text-sm font-semibold text-ink-gray-7">
          {{ __('How it starts', null, 'Cuenta') }}
        </p>
        <Segmented
          :model-value="seed"
          :options="app.seeds"
          :label="__('How it starts', null, 'Cuenta')"
          @update:model-value="chooseSeed"
        />
        <p
          v-if="chosen"
          class="text-sm text-ink-gray-6"
          data-testid="app-inicio-detalle"
        >
          {{ chosen.detail }}
        </p>
      </div>
      <p class="text-sm text-ink-gray-6">
        {{
          __(
            'It installs in a few minutes; you follow it here and keep working meanwhile.',
            null,
            'Cuenta',
          )
        }}
      </p>
      <div v-if="refusal" role="alert" class="space-y-2">
        <p class="text-base text-ink-gray-8">{{ refusal.text }}</p>
        <Button
          v-if="refusal.next"
          class="min-h-11"
          :label="refusal.next.label"
          @click="$emit('act', refusal.next.act)"
        />
      </div>
      <p v-if="failure" role="alert" class="text-sm text-ink-red-7">
        {{ failure }}
      </p>
    </div>
    <template #actions>
      <Button
        class="min-h-11 w-full"
        :label="__('Cancel', null, 'Cuenta')"
        @click="$emit('close')"
      />
      <Button
        variant="solid"
        class="min-h-11 w-full"
        :label="__('Turn on', null, 'Cuenta')"
        :loading="busy"
        :disabled="busy || !app"
        data-testid="app-confirmar"
        @click="confirm"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet, Segmented } from '@/components/ui'
import { seam } from './api'
import { failureText, refusalView } from './autoservicio'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** A row of aplicaciones.appRows. */
  app: { type: Object, default: null },
})
const emit = defineEmits(['close', 'done', 'act'])

const seed = ref('clean')
const busy = ref(false)
const refusal = ref(null)
const failure = ref('')
const chosen = computed(
  () => props.app?.seeds?.find((choice) => choice.value === seed.value) || null,
)

function chooseSeed(value) {
  if (busy.value || !props.app?.seeds?.some((c) => c.value === value)) return
  seed.value = value
}

watch(
  () => [props.open, props.app],
  ([open]) => {
    if (!open) return
    seed.value = 'clean'
    refusal.value = null
    failure.value = ''
  },
  { immediate: true },
)

async function confirm() {
  if (busy.value || !props.app) return
  busy.value = true
  refusal.value = null
  failure.value = ''
  try {
    const out = await seam('activate_app', {
      app: props.app.app,
      seed_choice: seed.value,
    })
    if (out?.ok === true) emit('done', out)
    else refusal.value = refusalView(out)
  } catch (error) {
    // Boat dispatches one install per app: a second tap after a lost answer
    // returns the install already running.
    failure.value = failureText(error)
  } finally {
    busy.value = false
  }
}
</script>
