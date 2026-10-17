<template>
  <!-- What Archivos is for, where the work stands and how to start: shown
       instead of an empty pane while no file is open. -->
  <div class="mx-auto w-full max-w-2xl space-y-6 p-6 xl:p-10">
    <header class="space-y-2">
      <h2 class="text-2xl font-semibold text-ink-gray-9">
        {{ __('Every file of the shop, next to the operation it proves') }}
      </h2>
      <p class="text-base text-ink-gray-7">
        {{
          __(
            'Archivos keeps the invoices, receipts, contracts and photos of {0}. Explore finds any file you may see; the Inbox holds only what still needs a decision.',
            [company],
          )
        }}
      </p>
    </header>

    <!-- Drop anywhere in the box or choose a file -->
    <label
      class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-outline-gray-4"
      :class="
        dragging
          ? 'border-outline-gray-5 bg-surface-gray-2'
          : 'border-outline-gray-2 hover:bg-surface-gray-1'
      "
      @dragenter.prevent="dragging = true"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <span
        class="flex h-11 w-11 items-center justify-center rounded-full bg-surface-gray-2"
      >
        <FeatherIcon name="upload-cloud" class="h-5 w-5 text-ink-gray-7" />
      </span>
      <span class="text-base font-medium text-ink-gray-9">
        {{ __('Drop a file here or') }}
        <span class="underline">{{ __('choose one') }}</span>
      </span>
      <span class="text-sm text-ink-gray-6">
        {{
          __('PDF, JPG or PNG photo, SAT XML, CSV or TXT · up to {0} MB', [
            limitMb,
          ])
        }}
      </span>
      <input
        type="file"
        :accept="ACCEPT"
        class="sr-only"
        :aria-label="__('Receive a file')"
        @change="pick"
      />
    </label>

    <!-- The two halves of Archivos, each with where the work stands now -->
    <ul class="grid gap-3 sm:grid-cols-2" :aria-label="__('How it works')">
      <li
        v-for="part in parts"
        :key="part.key"
        class="flex flex-col gap-2 rounded-lg border border-outline-gray-2 p-4"
      >
        <div class="flex items-center gap-2">
          <FeatherIcon :name="part.icon" class="h-4 w-4 text-ink-gray-6" />
          <h3 class="text-base font-semibold text-ink-gray-9">
            {{ part.title }}
          </h3>
        </div>
        <p class="flex-1 text-sm text-ink-gray-7">{{ part.body }}</p>
        <button
          type="button"
          class="inline-flex min-h-11 items-center gap-1 self-start rounded text-sm font-medium text-ink-gray-8 hover:text-ink-gray-9 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-outline-gray-4 sm:min-h-0"
          @click="$emit('view', part.view)"
        >
          {{ part.action }}
          <FeatherIcon name="arrow-right" class="h-3.5 w-3.5" />
        </button>
      </li>
    </ul>

    <!-- Problems never hide: they lead to the list that explains each one -->
    <div
      v-if="attention"
      class="flex flex-wrap items-center gap-3 rounded-lg border border-outline-amber-2 bg-surface-amber-1 p-4"
      role="status"
    >
      <FeatherIcon
        name="alert-triangle"
        class="h-5 w-5 shrink-0 text-ink-amber-7"
      />
      <div class="min-w-0 flex-1">
        <p class="text-base font-medium text-ink-gray-9">
          {{
            attention === 1
              ? __('1 file needs attention')
              : __('{0} files need attention', [attention])
          }}
        </p>
        <p class="text-sm text-ink-gray-7">
          {{ __('Each one shows what went wrong and what to do next.') }}
        </p>
      </div>
      <Button
        class="min-h-11 sm:min-h-0"
        :label="__('Review them')"
        @click="$emit('view', 'ayuda')"
      />
    </div>

    <ul class="space-y-2 text-sm text-ink-gray-6">
      <li class="flex gap-2">
        <FeatherIcon name="message-circle" class="mt-0.5 h-4 w-4 shrink-0" />
        <span>{{
          __(
            'Ask the assistant: «find me the invoice from…», «send it to me» (to your own chat) or «file it in the purchase…».',
          )
        }}</span>
      </li>
      <li class="flex gap-2">
        <FeatherIcon name="info" class="mt-0.5 h-4 w-4 shrink-0" />
        <span>{{
          __(
            'Tip: customers, suppliers and expenses show «Files on this record». Adding a file there brings you here with the record already chosen, and returns you when it is linked.',
          )
        }}</span>
      </li>
      <li class="flex gap-2">
        <FeatherIcon name="book-open" class="mt-0.5 h-4 w-4 shrink-0" />
        <a
          :href="MANUAL_HREF"
          class="inline-flex min-h-11 items-center font-medium text-ink-gray-8 underline hover:text-ink-gray-9 sm:min-h-0"
          @click="openManual"
          >{{ __('How Archivos works, in the shop manual') }}</a
        >
      </li>
    </ul>
  </div>
</template>
<script setup>
import { computed, getCurrentInstance, ref } from 'vue'
import { Button, FeatherIcon } from 'frappe-ui'
import { ACCEPT } from '@/composables/useArchivos'

const props = defineProps({
  company: { type: String, default: '' },
  counts: { type: Object, default: () => ({}) },
  limitMb: { type: Number, default: 10 },
})
const emit = defineEmits(['view', 'file'])
const dragging = ref(false)

const attention = computed(() => Number(props.counts?.ayuda) || 0)
const parts = computed(() => {
  const waiting = Number(props.counts?.por_clasificar) || 0
  const filed = Number(props.counts?.archivo) || 0
  return [
    {
      key: 'explore',
      icon: 'folder',
      title: __('Explore'),
      body: __(
        'Every file you may see: by record, contact, month, type or channel, and in folders.',
      ),
      view: 'recientes',
      action: filed ? __('{0} filed', [filed]) : __('Open Explore'),
    },
    {
      key: 'inbox',
      icon: 'inbox',
      title: __('Inbox'),
      body: __(
        'Only what needs a decision: files to link to their operation, files with a problem and fiscal gaps.',
      ),
      view: 'por_clasificar',
      action: waiting
        ? __('{0} to classify', [waiting])
        : __('Nothing waiting'),
    },
  ]
})

// The manual's Archivos chapter (place «archivos»), with the way back here.
const MANUAL_PATH =
  '/manual?lugar=archivos&return_to=%2Fcrm%2Farchivos&return_label=Archivos'
const MANUAL_HREF = `/crm${MANUAL_PATH}`
const router = getCurrentInstance()?.proxy?.$router
function openManual(event) {
  if (!router || event.metaKey || event.ctrlKey || event.shiftKey) return
  event.preventDefault()
  router.push(MANUAL_PATH)
}

function pick(event) {
  const chosen = event.target.files?.[0]
  event.target.value = ''
  if (chosen) emit('file', chosen)
}
function onDrop(event) {
  dragging.value = false
  const chosen = event.dataTransfer?.files?.[0]
  if (chosen) emit('file', chosen)
}
</script>
