<!--
  Forms — public lead-capture forms (native Web Forms targeting CRM Lead/Deal).
  The list is the queue: which forms are live, how many people used them lately,
  what those submissions became, and the actions to share or change each one.
  Data: crm.api.form.list_forms (manager-only, like the rest of the forms API).
-->
<template>
  <div class="flex min-h-0 w-full flex-1 flex-col bg-surface-base">
    <div
      class="flex min-h-[52px] flex-none flex-wrap items-center justify-between gap-2 border-b border-outline-gray-1 px-5 py-2"
    >
      <div class="flex items-center gap-2">
        <h1 class="text-[15px] font-bold text-ink-gray-9">
          {{ __('Forms') }}
        </h1>
        <span
          v-if="rows.length"
          class="rounded-full bg-surface-gray-2 px-[9px] py-0.5 text-[11.5px] font-semibold text-ink-gray-6"
          >{{ rows.length }}</span
        >
      </div>
      <button
        class="flex items-center gap-1.5 rounded-lg px-3.5 py-[7px] text-[12.5px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-outline-gray-4"
        style="background: var(--brand)"
        @click="openNew(null)"
      >
        <LucidePlus class="size-3.5" />
        {{ __('New form') }}
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <div
        v-if="forms.loading && !forms.data"
        class="flex justify-center py-16"
      >
        <LoadingIndicator class="size-5 text-ink-gray-5" />
      </div>

      <!-- first run: the empty page is the template picker -->
      <div
        v-else-if="!rows.length"
        class="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-10"
      >
        <div>
          <h2 class="text-xl font-semibold text-ink-gray-9">
            {{ __('Collect leads from a link') }}
          </h2>
          <p class="mt-1.5 max-w-xl text-p-base text-ink-gray-6">
            {{
              __(
                'Make a form, share its link or QR code on Instagram, WhatsApp or a flyer, and every answer lands in your CRM with an owner and a next step.',
              )
            }}
          </p>
        </div>
        <TemplateGrid :templates="templates.data || []" @pick="openNew" />
        <MetaLeadForms
          v-if="addonAvailable"
          class="mt-4"
          :rows="leadSources.data?.meta_lead_forms || []"
        />
      </div>

      <div v-else class="mx-auto flex max-w-5xl flex-col gap-3 p-4 sm:p-5">
        <article
          v-for="f in rows"
          :key="f.name"
          class="rounded-xl border border-outline-gray-2 bg-surface-base transition-colors hover:border-outline-gray-3"
        >
          <div class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <RouterLink
              :to="{ name: 'Form', params: { formId: f.name } }"
              class="min-w-0 flex-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-outline-gray-4"
            >
              <div class="flex items-center gap-2">
                <span
                  class="size-2 shrink-0 rounded-full"
                  :class="
                    f.published ? 'bg-surface-green-3' : 'bg-surface-gray-4'
                  "
                  aria-hidden="true"
                />
                <h2 class="truncate text-base font-semibold text-ink-gray-9">
                  {{ f.title }}
                </h2>
                <span
                  class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="
                    f.published
                      ? 'bg-surface-green-2 text-ink-green-7'
                      : 'bg-surface-gray-2 text-ink-gray-6'
                  "
                  >{{ f.published ? __('Published') : __('Draft') }}</span
                >
              </div>
              <div class="mt-1 truncate text-p-sm text-ink-gray-5">
                /crm-form/{{ f.route }} ·
                {{
                  f.document_type === 'CRM Deal'
                    ? __('creates deals')
                    : __('creates leads')
                }}
              </div>
              <div v-if="chips(f).length" class="mt-2 flex flex-wrap gap-1.5">
                <span
                  v-for="c in chips(f)"
                  :key="c.key"
                  class="inline-flex items-center gap-1 rounded-md bg-surface-gray-2 px-1.5 py-0.5 text-xs text-ink-gray-7"
                >
                  <component :is="c.icon" class="size-3" />
                  {{ c.label }}
                </span>
              </div>
            </RouterLink>

            <!-- numbers: recent use first, then what it turned into -->
            <dl class="grid grid-cols-3 gap-4 text-center sm:w-72 sm:shrink-0">
              <div>
                <dt class="text-xs text-ink-gray-5">{{ __('7 days') }}</dt>
                <dd class="text-lg font-semibold tabular-nums text-ink-gray-9">
                  {{ f.stats?.last_7_days || 0 }}
                </dd>
              </div>
              <div>
                <dt class="text-xs text-ink-gray-5">{{ __('30 days') }}</dt>
                <dd class="text-lg font-semibold tabular-nums text-ink-gray-9">
                  {{ f.stats?.last_30_days || 0 }}
                </dd>
              </div>
              <div>
                <dt class="text-xs text-ink-gray-5">{{ __('Total') }}</dt>
                <dd class="text-lg font-semibold tabular-nums text-ink-gray-9">
                  {{ f.stats?.total || 0 }}
                </dd>
              </div>
            </dl>
          </div>

          <div
            class="flex flex-wrap items-center justify-between gap-2 border-t border-outline-gray-1 px-4 py-2"
          >
            <div class="text-p-sm text-ink-gray-6">
              <template v-if="f.stats?.last_submission">
                {{
                  __('Last submission {0}', [timeAgo(f.stats.last_submission)])
                }}
                <template v-if="outcomeText(f)">
                  · {{ outcomeText(f) }}</template
                >
              </template>
              <template v-else>{{ __('No submissions yet') }}</template>
            </div>
            <div class="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                icon-left="link"
                :label="__('Copy link')"
                @click="copyLink(f)"
              />
              <Button
                size="sm"
                variant="ghost"
                :label="__('QR code')"
                @click="
                  $router.push({
                    name: 'Form',
                    params: { formId: f.name },
                    query: { tab: 'share' },
                  })
                "
              >
                <template #prefix><LucideQrCode class="size-4" /></template>
              </Button>
              <Dropdown placement="right" :options="rowMenu(f)">
                <Button
                  size="sm"
                  variant="ghost"
                  icon="more-horizontal"
                  :aria-label="__('More actions for {0}', [f.title])"
                  @click="isConfirmingDelete = false"
                />
              </Dropdown>
            </div>
          </div>
        </article>

        <MetaLeadForms
          v-if="addonAvailable"
          class="mt-4"
          :rows="leadSources.data?.meta_lead_forms || []"
        />
      </div>
    </div>
  </div>

  <NewFormDialog v-model="showNew" :initial-template="newTemplate" />
</template>

<script setup>
import {
  Button,
  Dropdown,
  LoadingIndicator,
  call,
  createResource,
  toast,
} from 'frappe-ui'
import { useTelemetry } from 'frappe-ui/frappe'
import LucidePlus from '~icons/lucide/plus'
import LucideQrCode from '~icons/lucide/qr-code'
import LucideUser from '~icons/lucide/user'
import LucideMegaphone from '~icons/lucide/megaphone'
import LucideBell from '~icons/lucide/bell'
import LucideShieldCheck from '~icons/lucide/shield-check'
import TemplateGrid from '@/components/Forms/TemplateGrid.vue'
import MetaLeadForms from '@/components/Forms/channels/MetaLeadForms.vue'
import WhatsAppIcon from '@/components/Icons/WhatsAppIcon.vue'
import { addonAvailable } from '@/utils/crmCapabilities'
import NewFormDialog from '@/components/Forms/NewFormDialog.vue'
import { outcome, publicUrl } from '@/components/Forms/formModel'
import { usersStore } from '@/stores/users'
import { ConfirmDelete, copyToClipboard, timeAgo } from '@/utils'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const { capture } = useTelemetry()
const { getUser } = usersStore()

const forms = createResource({ url: 'crm.api.form.list_forms', auto: true })
const templates = createResource({
  url: 'crm.api.form.get_form_templates',
  cache: 'crm-form-templates',
  auto: true,
})
const rows = computed(() => forms.data || [])

// addon: Facebook/Messenger lead forms and per-channel submission counts
const leadSources = createResource({
  url: 'doco_marketing.api.form_channels.lead_sources',
  auto: addonAvailable.value,
})
const byChannel = computed(() =>
  Object.fromEntries(
    (leadSources.data?.forms || []).map((f) => [f.name, f.by_channel || {}]),
  ),
)

const showNew = ref(false)
// null opens the picker; a key (or '' for blank) jumps to naming it
const newTemplate = ref(null)
function openNew(key) {
  newTemplate.value = key === undefined ? null : key
  showNew.value = true
}

function chips(f) {
  const a = f.after_submit || {}
  const out = []
  if (a.assign_to)
    out.push({
      key: 'owner',
      icon: LucideUser,
      label: getUser(a.assign_to)?.full_name || a.assign_to,
    })
  if (a.notify)
    out.push({
      key: 'notify',
      icon: LucideBell,
      label: __('{0} notified', [a.notify]),
    })
  if (a.campaign)
    out.push({ key: 'campaign', icon: LucideMegaphone, label: __('Follow-up') })
  const viaWhatsApp = byChannel.value[f.name]?.whatsapp
  if (viaWhatsApp)
    out.push({
      key: 'whatsapp',
      icon: WhatsAppIcon,
      label: __('{0} via WhatsApp', [viaWhatsApp]),
    })
  if (a.consent)
    out.push({
      key: 'consent',
      icon: LucideShieldCheck,
      label: __('Asks consent'),
    })
  return out
}

function outcomeText(f) {
  const o = outcome(f.stats, f.document_type)
  if (!o) return ''
  if (f.document_type === 'CRM Lead')
    return o.won
      ? __('{0}% became deals, {1} won', [o.rate, o.won])
      : __('{0}% became deals', [o.rate])
  return __('{0}% won', [o.rate])
}

function copyLink(f) {
  copyToClipboard(publicUrl(window.location.origin, f.route))
  capture('form_embed_copied', { embed_type: 'link', source: 'list' })
}

async function setPublished(f, value) {
  try {
    await call('crm.api.form.set_published', {
      name: f.name,
      published: value ? 1 : 0,
    })
    if (value) capture('form_published', { source: 'list' })
    toast.success(value ? __('Form published') : __('Form unpublished'))
  } catch (e) {
    toast.error(e?.messages?.[0] || __('Could not update form'))
  } finally {
    forms.reload()
  }
}

async function duplicate(f) {
  try {
    const doc = await call('crm.api.form.duplicate_form', { name: f.name })
    toast.success(__('Copy created as a draft'))
    router.push({ name: 'Form', params: { formId: doc.name } })
  } catch (e) {
    toast.error(e?.messages?.[0] || __('Could not duplicate form'))
  }
}

const isConfirmingDelete = ref(false)
function rowMenu(f) {
  return [
    {
      label: __('Edit'),
      icon: 'edit-2',
      onClick: () => router.push({ name: 'Form', params: { formId: f.name } }),
    },
    {
      label: __('Submissions'),
      icon: 'inbox',
      onClick: () =>
        router.push({
          name: 'Form',
          params: { formId: f.name },
          query: { tab: 'submissions' },
        }),
    },
    {
      label: __('Open public page'),
      icon: 'external-link',
      onClick: () =>
        window.open(publicUrl(window.location.origin, f.route), '_blank'),
    },
    {
      label: f.published ? __('Unpublish') : __('Publish'),
      icon: f.published ? 'eye-off' : 'eye',
      onClick: () => setPublished(f, !f.published),
    },
    { label: __('Duplicate'), icon: 'copy', onClick: () => duplicate(f) },
    ...ConfirmDelete({
      isConfirmingDelete,
      onConfirmDelete: async () => {
        await call('crm.api.form.delete_form', { name: f.name })
        forms.reload()
        toast.success(__('Form deleted'))
      },
    }),
  ]
}
</script>
