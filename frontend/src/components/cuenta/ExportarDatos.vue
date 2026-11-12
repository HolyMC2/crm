<template>
  <!-- «Una copia de tus datos»: one row under a rule. «Pedir mis datos», then
       «Preparando…» while doco builds the zip, then «Descargar (zip)» with its
       size and the day it stops being available. A refusal (three a day) says
       when the next one can start, beside the button it disables. -->
  <section
    ref="root"
    aria-labelledby="cuenta-datos"
    class="space-y-2"
    data-testid="cuenta-datos"
    :data-state="exp.loaded.value ? view.state : 'loading'"
  >
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <!-- One spinner while it runs: the «Preparando…» button's own. -->
      <span
        class="lucide-download size-5 flex-none text-ink-gray-6"
        aria-hidden="true"
      />
      <div class="min-w-0 flex-1 basis-48">
        <h2 id="cuenta-datos" class="text-base font-semibold text-ink-gray-9">
          {{ __('A copy of your data', null, 'Cuenta') }}
        </h2>
        <p
          id="cuenta-datos-linea"
          class="text-sm text-ink-gray-6"
          role="status"
          data-testid="cuenta-datos-linea"
        >
          {{
            exp.loaded.value
              ? view.line
              : __('Checking your copy…', null, 'Cuenta')
          }}
        </p>
      </div>
      <template v-if="exp.loaded.value">
        <Button
          v-if="view.state === 'ready'"
          class="min-h-11 max-sm:w-full"
          :label="__('Download (zip)', null, 'Cuenta')"
          data-testid="cuenta-datos-descargar"
          @click="exp.download()"
        />
        <Button
          v-else-if="view.state === 'running'"
          class="min-h-11 max-sm:w-full"
          :label="__('Preparing…', null, 'Cuenta')"
          :loading="true"
          aria-describedby="cuenta-datos-linea"
        />
        <Button
          v-else
          class="min-h-11 max-sm:w-full"
          :label="view.askLabel"
          :loading="exp.asking.value"
          :disabled="!view.canAsk || exp.asking.value"
          :aria-describedby="view.refusal ? 'cuenta-datos-limite' : undefined"
          data-testid="cuenta-datos-pedir"
          @click="exp.ask()"
        />
      </template>
    </div>
    <!-- A ready copy can be replaced by a newer one (it counts toward the day's three).
         What follows the row lines up with its title, past the icon. -->
    <Button
      v-if="view.state === 'ready' && view.canAsk"
      variant="ghost"
      class="ml-6 min-h-11"
      :label="view.askLabel"
      :loading="exp.asking.value"
      :disabled="exp.asking.value"
      data-testid="cuenta-datos-otra"
      @click="exp.ask()"
    />
    <!-- Beside the button it disables; a ready copy has none to disable. -->
    <p
      v-if="view.refusal && !view.canAsk && view.state !== 'ready'"
      id="cuenta-datos-limite"
      class="pl-8 text-sm text-ink-gray-7"
      data-testid="cuenta-datos-limite"
    >
      {{ view.refusal }}
    </p>
    <p
      v-if="askNote"
      role="alert"
      class="pl-8 text-sm text-ink-red-7"
      data-testid="cuenta-datos-error"
    >
      {{ askNote }}
    </p>
    <div
      v-if="exp.readError.value"
      role="alert"
      class="flex flex-wrap items-center gap-x-3 gap-y-2 pl-8"
    >
      <p class="min-w-0 flex-1 basis-48 text-sm text-ink-red-7">
        {{ exp.readError.value }}
      </p>
      <Button
        class="min-h-11"
        :label="__('Try again', null, 'Cuenta')"
        :loading="exp.loading.value"
        @click="exp.load()"
      />
    </div>
  </section>
</template>
<script setup>
import { computed, getCurrentInstance, onBeforeUnmount, ref } from 'vue'
import { Button } from 'frappe-ui'
import { createExport } from './exportar'

const root = ref(null)
// doco tells the person who asked when the zip is done (doco_data_export).
const socket =
  getCurrentInstance()?.appContext.config.globalProperties.$socket || null
const exp = createExport({
  listen:
    typeof socket?.on === 'function'
      ? (event, handler) => {
          socket.on(event, handler)
          return () => socket.off?.(event, handler)
        }
      : null,
})
onBeforeUnmount(exp.dispose)
exp.load()

const view = computed(() => exp.view.value)
// The daily limit's sentence shows once, beside the button it disables.
const askNote = computed(() =>
  exp.askError.value && exp.askError.value !== view.value.refusal
    ? exp.askError.value
    : '',
)

/**
 * The cancel sheet's «Pedir mis datos»: the block comes into view and a copy
 * is asked for, unless one is being prepared or ready. Focus stays where the
 * closing sheet hands it; the line under the title announces the state.
 */
async function reveal() {
  root.value?.scrollIntoView?.({ block: 'center' })
  await exp.start()
}
defineExpose({ reveal })
</script>
