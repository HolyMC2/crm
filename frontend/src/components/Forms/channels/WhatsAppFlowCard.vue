<template>
  <section class="flex flex-col gap-3">
    <div class="flex items-start justify-between gap-3">
      <div>
        <div
          class="flex items-center gap-2 text-base font-semibold text-ink-gray-9"
        >
          <WhatsAppIcon class="size-4" />
          {{ __('Fill it in inside WhatsApp') }}
        </div>
        <div class="text-p-sm text-ink-gray-6">
          {{
            __(
              'A WhatsApp Flow asks the same questions inside the chat. Replies become records exactly like web submissions.',
            )
          }}
        </div>
      </div>
      <span
        v-if="view.flow"
        class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
        :class="statusClass"
        >{{ statusLabel }}</span
      >
    </div>

    <div v-if="c.channels.loading && !c.channels.data" class="py-2">
      <LoadingIndicator class="size-4 text-ink-gray-5" />
    </div>
    <template v-else>
      <p
        v-if="view.step === 'unavailable'"
        class="rounded-md bg-surface-gray-2 p-2.5 text-p-sm text-ink-gray-7"
      >
        {{
          view.mode === 'off'
            ? __('WhatsApp is turned off for this business.')
            : __(
                'WhatsApp is in manual mode (wa.me links). Flows need the WhatsApp Business API connected.',
              )
        }}
      </p>
      <p v-else-if="view.step === 'none'" class="text-p-sm text-ink-gray-7">
        {{
          __(
            'Build the Flow from this form, check it, then publish it to WhatsApp.',
          )
        }}
      </p>
      <p
        v-else-if="view.step === 'outdated'"
        class="text-p-sm text-ink-amber-7"
      >
        {{
          __(
            'The form changed since the Flow was built. Update it before publishing.',
          )
        }}
      </p>
      <p
        v-else-if="view.step === 'published'"
        class="text-p-sm text-ink-gray-7"
      >
        {{
          __(
            'Live on WhatsApp. Send it from any chat in the inbox; replies land in Submissions.',
          )
        }}
      </p>

      <div
        v-if="view.unsupported.length"
        class="rounded-md border border-outline-gray-2 p-2.5 text-p-sm"
      >
        <div class="font-medium text-ink-gray-8">
          {{ __("Questions WhatsApp can't ask") }}
        </div>
        <ul class="mt-1 flex flex-col gap-0.5 text-ink-gray-6">
          <li v-for="u in view.unsupported" :key="u.fieldname">
            <span :class="u.required ? 'text-ink-red-6' : ''">{{
              u.label
            }}</span>
            — {{ u.reason }}
          </li>
        </ul>
        <p v-if="view.blocking.length" class="mt-1.5 text-ink-red-6">
          {{
            __(
              'Required questions are missing in WhatsApp. Make them optional or remove them to publish.',
            )
          }}
        </p>
      </div>

      <ul
        v-if="c.metaErrors.value.length"
        class="rounded-md bg-surface-red-2 p-2.5 text-p-sm text-ink-red-7"
      >
        <li v-for="(e, i) in c.metaErrors.value" :key="i">
          {{ e.message || e.error }}
        </li>
      </ul>

      <p
        v-if="b.dirty.value && view.canBuild"
        class="text-p-sm text-ink-gray-5"
      >
        {{ __('Save the form first: the Flow is built from the saved form.') }}
      </p>
      <div class="flex flex-wrap gap-2">
        <Button
          v-if="view.canBuild"
          :label="
            view.flow ? __('Update from the form') : __('Build WhatsApp Flow')
          "
          icon-left="refresh-cw"
          :loading="c.busy.value === 'build'"
          :disabled="b.dirty.value"
          @click="c.buildFlow"
        />
        <Button
          v-if="view.flow && view.step !== 'published'"
          variant="solid"
          :label="__('Publish to WhatsApp')"
          :disabled="!view.canPublish || b.dirty.value"
          :loading="c.busy.value === 'publish'"
          @click="confirmPublish"
        />
        <Button
          v-if="view.flow?.on_meta"
          :label="__('Check status')"
          icon-left="activity"
          :loading="c.busy.value === 'check'"
          @click="c.checkFlow"
        />
        <a
          v-if="view.flow?.preview_url"
          :href="view.flow.preview_url"
          target="_blank"
          rel="noopener"
        >
          <Button
            :label="__('Preview in WhatsApp')"
            icon-left="external-link"
          />
        </a>
      </div>
    </template>
  </section>
</template>

<script setup>
import { Button, LoadingIndicator } from 'frappe-ui'
import WhatsAppIcon from '@/components/Icons/WhatsAppIcon.vue'
import { globalStore } from '@/stores/global'
import { computed, inject } from 'vue'
import { FORM_BUILDER } from '../useFormBuilder'
import { FORM_CHANNELS } from './useFormChannels'
import { flowView } from './channelModel'

const b = inject(FORM_BUILDER)
const c = inject(FORM_CHANNELS)
const { $dialog } = globalStore()

const view = computed(() => flowView(c.channels.data?.whatsapp))
const statusLabel = computed(() => {
  if (view.value.step === 'outdated') return __('Out of date')
  return __(view.value.flow?.status || 'Draft')
})
const statusClass = computed(() =>
  view.value.step === 'published'
    ? 'bg-surface-green-2 text-ink-green-7'
    : view.value.step === 'outdated'
      ? 'bg-surface-amber-2 text-ink-amber-7'
      : 'bg-surface-gray-2 text-ink-gray-6',
)

// publishing registers the Flow with Meta: say so before doing it
function confirmPublish() {
  $dialog({
    title: __('Publish the WhatsApp Flow?'),
    message: __(
      'The Flow is sent to WhatsApp (Meta) and becomes usable in chats. If you change the form later, update and publish the Flow again.',
    ),
    actions: [
      {
        label: __('Publish to WhatsApp'),
        variant: 'solid',
        onClick: async (close) => {
          close()
          await c.publishFlow()
        },
      },
    ],
  })
}
</script>
