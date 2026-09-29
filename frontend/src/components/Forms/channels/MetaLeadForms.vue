<template>
  <section v-if="rows.length" class="flex flex-col gap-3">
    <div>
      <h2 class="text-base font-semibold text-ink-gray-9">
        {{ __('Lead forms on Facebook and Messenger') }}
      </h2>
      <p class="text-p-sm text-ink-gray-6">
        {{
          __(
            'Forms people fill in inside Facebook ads and Messenger. Their answers arrive in the CRM too.',
          )
        }}
      </p>
    </div>
    <article
      v-for="f in rows"
      :key="`${f.kind}-${f.id}`"
      class="rounded-xl border border-outline-gray-2 bg-surface-base"
    >
      <div class="flex flex-wrap items-center gap-3 p-4">
        <component
          :is="iconFor(f.kind)"
          class="size-5 shrink-0 text-ink-gray-6"
        />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <h3 class="truncate text-base font-semibold text-ink-gray-9">
              {{ f.name }}
            </h3>
            <span
              class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
              :class="
                f.enabled
                  ? 'bg-surface-green-2 text-ink-green-7'
                  : 'bg-surface-gray-2 text-ink-gray-6'
              "
              >{{ f.enabled ? __('Syncing leads') : __('Not syncing') }}</span
            >
          </div>
          <div class="truncate text-p-sm text-ink-gray-5">
            {{ f.label }}<template v-if="f.page"> · {{ f.page }}</template>
          </div>
        </div>
        <div class="text-center">
          <div class="text-xs text-ink-gray-5">{{ __('Total') }}</div>
          <div class="text-lg font-semibold tabular-nums text-ink-gray-9">
            {{ f.leads }}
          </div>
        </div>
      </div>
      <div
        class="flex flex-wrap items-center justify-end gap-1 border-t border-outline-gray-1 px-4 py-2"
      >
        <Button
          v-if="f.record_filter && f.leads"
          size="sm"
          variant="ghost"
          :label="open === key(f) ? __('Hide') : __('Latest records')"
          @click="toggle(f)"
        />
        <Button
          v-else-if="f.record_doctype === 'CRM Inquiry'"
          size="sm"
          variant="ghost"
          :label="__('Open Inquiries')"
          @click="
            $router.push({ name: 'Inquiries', query: { returnTo: '/forms' } })
          "
        />
        <Button
          v-if="f.kind === 'facebook_lead_form'"
          size="sm"
          variant="ghost"
          icon-left="settings"
          :label="__('Lead syncing')"
          @click="openLeadSyncing"
        />
      </div>
      <div v-if="open === key(f)" class="border-t border-outline-gray-1">
        <div v-if="records.loading" class="p-3">
          <LoadingIndicator class="size-4 text-ink-gray-5" />
        </div>
        <RouterLink
          v-for="r in records.data || []"
          :key="r.name"
          :to="{
            name: 'Lead',
            params: { leadId: r.name },
            query: { returnTo: '/forms' },
          }"
          class="flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-surface-gray-1"
        >
          <span class="truncate text-ink-gray-9">{{
            r.lead_name || r.name
          }}</span>
          <span class="shrink-0 text-ink-gray-5">{{
            timeAgo(r.creation)
          }}</span>
        </RouterLink>
      </div>
    </article>
  </section>
</template>

<script setup>
import { Button, LoadingIndicator, createResource } from 'frappe-ui'
import LucideMegaphone from '~icons/lucide/megaphone'
import LucideMessageCircle from '~icons/lucide/message-circle'
import { showSettings, activeSettingsPage } from '@/composables/settings'
import { timeAgo } from '@/utils'
import { ref } from 'vue'

// meta_lead_forms from doco_marketing.api.form_channels.lead_sources (the page
// loads it once and also uses its per-channel submission counts)
defineProps({ rows: { type: Array, default: () => [] } })

const iconFor = (kind) =>
  kind === 'messenger_lead_form' ? LucideMessageCircle : LucideMegaphone
const key = (f) => `${f.kind}-${f.id}`

const open = ref('')
const records = createResource({ url: 'frappe.client.get_list' })
function toggle(f) {
  if (open.value === key(f)) {
    open.value = ''
    return
  }
  open.value = key(f)
  records.submit({
    doctype: f.record_doctype,
    filters: f.record_filter,
    fields: ['name', 'lead_name', 'creation'],
    order_by: 'creation desc',
    limit_page_length: 10,
  })
}

// Settings → Lead Syncing in the CRM itself (Facebook page and form mapping)
function openLeadSyncing() {
  activeSettingsPage.value = __('Lead Syncing')
  showSettings.value = true
}
</script>
