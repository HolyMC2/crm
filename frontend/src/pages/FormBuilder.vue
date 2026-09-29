<!--
  One form: build it with the live preview beside it, decide what happens after
  someone submits, share it, and follow what it produced. Reached from /forms.
-->
<template>
  <div class="flex min-h-0 w-full flex-1 flex-col bg-surface-base">
    <!-- toolbar -->
    <div
      class="flex min-h-[52px] flex-none flex-wrap items-center justify-between gap-2 border-b border-outline-gray-1 px-3 py-2 sm:px-5"
    >
      <div class="flex min-w-0 items-center gap-2">
        <RouterLink
          :to="{ name: 'Forms' }"
          class="flex items-center gap-1 rounded px-1 text-[13px] text-ink-gray-6 hover:text-ink-gray-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-outline-gray-4"
        >
          <LucideChevronLeft class="size-4" />
          {{ __('Forms') }}
        </RouterLink>
        <span class="text-ink-gray-4">/</span>
        <h1 class="truncate text-[15px] font-bold text-ink-gray-9">
          {{ b.form.title || __('Untitled form') }}
        </h1>
        <span
          class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
          :class="
            b.savedPublished.value
              ? 'bg-surface-green-2 text-ink-green-7'
              : 'bg-surface-gray-2 text-ink-gray-6'
          "
          >{{ b.savedPublished.value ? __('Published') : __('Draft') }}</span
        >
        <span
          v-if="b.dirty.value"
          class="shrink-0 text-xs text-ink-amber-6"
          role="status"
          >{{ __('Unsaved changes') }}</span
        >
      </div>
      <div class="flex items-center gap-2">
        <Button
          :label="__('Save')"
          :disabled="!b.dirty.value"
          :loading="b.saving.value && !publishing"
          @click="save"
        />
        <Dropdown v-if="b.savedPublished.value" :options="liveMenu">
          <Button :label="__('Published')" icon-right="chevron-down">
            <template #prefix>
              <span class="size-2 rounded-full bg-surface-green-3" />
            </template>
          </Button>
        </Dropdown>
        <Popover v-else placement="bottom-end">
          <template #target="{ togglePopover }">
            <button
              class="flex items-center gap-1.5 rounded-lg px-3.5 py-[7px] text-[12.5px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-outline-gray-4"
              style="background: var(--brand)"
              :aria-label="__('Publish')"
              @click="b.publishable.value ? publish() : togglePopover()"
            >
              <LucideLoaderCircle
                v-if="publishing"
                class="size-3.5 animate-spin"
              />
              {{ __('Publish') }}
              <span
                v-if="!b.publishable.value"
                class="rounded-full bg-white/25 px-1.5 text-[11px]"
                >{{ blockingLeft }}</span
              >
            </button>
          </template>
          <template #body-main>
            <div class="w-72 p-3">
              <div class="mb-2 text-sm font-semibold text-ink-gray-9">
                {{ __('Before it goes live') }}
              </div>
              <ReadinessList :items="b.checklist.value" />
            </div>
          </template>
        </Popover>
      </div>
    </div>

    <!-- tabs -->
    <div
      class="flex flex-none gap-1 overflow-x-auto border-b border-outline-gray-1 px-3 sm:px-5"
      role="tablist"
    >
      <button
        v-for="t in tabs"
        :key="t.key"
        role="tab"
        class="relative flex shrink-0 items-center gap-1.5 px-2.5 py-2.5 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-outline-gray-4"
        :class="
          tab === t.key
            ? 'text-ink-gray-9'
            : 'text-ink-gray-5 hover:text-ink-gray-8'
        "
        :aria-selected="tab === t.key"
        @click="setTab(t.key)"
      >
        <component :is="t.icon" class="size-4" />
        {{ t.label }}
        <span
          v-if="t.count"
          class="rounded-full bg-surface-gray-2 px-1.5 text-[11px] text-ink-gray-7"
          >{{ t.count }}</span
        >
        <span
          v-if="tab === t.key"
          class="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-surface-gray-9"
        />
      </button>
    </div>

    <div v-if="!b.loaded.value" class="flex flex-1 justify-center py-16">
      <LoadingIndicator class="size-5 text-ink-gray-5" />
    </div>
    <div v-else class="flex min-h-0 flex-1">
      <!-- editor -->
      <div class="min-w-0 flex-1 overflow-y-auto">
        <div class="mx-auto flex max-w-2xl flex-col gap-5 p-4 sm:p-6">
          <div
            v-if="!b.savedPublished.value && tab !== 'submissions'"
            class="rounded-lg border border-outline-gray-2 p-3"
          >
            <button
              class="flex w-full items-center justify-between gap-2 text-left"
              :aria-expanded="showChecklist"
              @click="showChecklist = !showChecklist"
            >
              <span class="text-sm font-medium text-ink-gray-8">
                {{
                  b.publishable.value
                    ? __('Ready to publish')
                    : __('{0} of {1} steps done before publishing', [
                        blockingDone,
                        blockingTotal,
                      ])
                }}
              </span>
              <span class="flex items-center gap-2">
                <span
                  class="h-1.5 w-24 overflow-hidden rounded-full bg-surface-gray-2"
                  aria-hidden="true"
                >
                  <span
                    class="block h-full rounded-full bg-surface-green-3 transition-[width]"
                    :style="{
                      width: `${(blockingDone / blockingTotal) * 100}%`,
                    }"
                  />
                </span>
                <LucideChevronDown
                  class="size-4 text-ink-gray-5 transition-transform"
                  :class="showChecklist ? 'rotate-180' : ''"
                />
              </span>
            </button>
            <ReadinessList
              v-if="showChecklist"
              class="mt-3"
              :items="b.checklist.value"
            />
          </div>

          <FormCanvas v-if="tab === 'questions'" />
          <MessagesPanel v-else-if="tab === 'messages'" />
          <AfterSubmitPanel v-else-if="tab === 'after'" />
          <SharePanel v-else-if="tab === 'share'" />
          <SubmissionsPanel
            v-else-if="tab === 'submissions'"
            :name="formId"
            :document-type="b.form.document_type"
            :published="b.savedPublished.value"
            @share="setTab('share')"
          />
        </div>
      </div>

      <!-- live preview, side by side on wide screens -->
      <aside
        v-if="tab !== 'submissions'"
        class="hidden w-[440px] shrink-0 border-l border-outline-gray-1 bg-surface-gray-1 p-5 pb-16 lg:flex lg:flex-col"
        :aria-label="__('Preview')"
      >
        <FormPreview
          ref="previewRef"
          :form="b.form"
          :settings="b.settings"
          :business="b.options.data?.business || ''"
          :link-options="b.linkOptions"
          :testing="testing"
          @test="runTest"
        />
      </aside>
    </div>

    <!-- narrow screens: the preview opens as a sheet -->
    <button
      v-if="b.loaded.value && tab !== 'submissions'"
      class="fixed bottom-20 right-4 z-10 flex items-center gap-1.5 rounded-full bg-surface-gray-9 px-4 py-2.5 text-sm font-medium text-ink-white shadow-lg lg:hidden"
      @click="showSheet = true"
    >
      <LucideEye class="size-4" />
      {{ __('Preview') }}
    </button>
    <Dialog v-model="showSheet" :options="{ title: __('Preview'), size: 'xl' }">
      <template #body-content>
        <div class="h-[70vh]">
          <FormPreview
            :form="b.form"
            :settings="b.settings"
            :business="b.options.data?.business || ''"
            :link-options="b.linkOptions"
            :testing="testing"
            @test="runTest"
          />
        </div>
      </template>
    </Dialog>

    <TestRunDialog v-model="showReport" :report="report" />
  </div>
</template>

<script setup>
import {
  Button,
  Dialog,
  Dropdown,
  LoadingIndicator,
  Popover,
  call,
  toast,
} from 'frappe-ui'
import { useTelemetry } from 'frappe-ui/frappe'
import { globalStore } from '@/stores/global'
import LucideChevronLeft from '~icons/lucide/chevron-left'
import LucideChevronDown from '~icons/lucide/chevron-down'
import LucideLoaderCircle from '~icons/lucide/loader-circle'
import LucideEye from '~icons/lucide/eye'
import LucideListChecks from '~icons/lucide/list-checks'
import LucideMessageSquare from '~icons/lucide/message-square'
import LucideWorkflow from '~icons/lucide/workflow'
import LucideShare2 from '~icons/lucide/share-2'
import LucideInbox from '~icons/lucide/inbox'
import FormCanvas from '@/components/Forms/FormCanvas.vue'
import MessagesPanel from '@/components/Forms/MessagesPanel.vue'
import AfterSubmitPanel from '@/components/Forms/AfterSubmitPanel.vue'
import SharePanel from '@/components/Forms/SharePanel.vue'
import SubmissionsPanel from '@/components/Forms/SubmissionsPanel.vue'
import FormPreview from '@/components/Forms/FormPreview.vue'
import TestRunDialog from '@/components/Forms/TestRunDialog.vue'
import ReadinessList from '@/components/Forms/ReadinessList.vue'
import { FORM_BUILDER, useFormBuilder } from '@/components/Forms/useFormBuilder'
import { publicUrl } from '@/components/Forms/formModel'
import { computed, onBeforeUnmount, provide, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'

const props = defineProps({ formId: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
const { $dialog } = globalStore()
const { capture } = useTelemetry()

const b = useFormBuilder(props.formId)
provide(FORM_BUILDER, b)

const TAB_KEYS = ['questions', 'messages', 'after', 'share', 'submissions']
const tab = ref(
  TAB_KEYS.includes(route.query.tab) ? route.query.tab : 'questions',
)
watch(
  () => route.query.tab,
  (t) => {
    if (TAB_KEYS.includes(t)) tab.value = t
  },
)
function setTab(key) {
  tab.value = key
  router.replace({ query: { ...route.query, tab: key } })
}
const tabs = computed(() => [
  { key: 'questions', label: __('Questions'), icon: LucideListChecks },
  { key: 'messages', label: __('Messages'), icon: LucideMessageSquare },
  { key: 'after', label: __('After someone submits'), icon: LucideWorkflow },
  { key: 'share', label: __('Share'), icon: LucideShare2 },
  { key: 'submissions', label: __('Submissions'), icon: LucideInbox },
])

const showChecklist = ref(false)
const blocking = computed(() => b.checklist.value.filter((i) => i.blocking))
const blockingTotal = computed(() => blocking.value.length)
const blockingDone = computed(() => blocking.value.filter((i) => i.ok).length)
const blockingLeft = computed(() => blockingTotal.value - blockingDone.value)

async function save() {
  const ok = await b.save()
  if (ok) toast.success(__('Form saved'))
}

const publishing = ref(false)
async function publish() {
  publishing.value = true
  try {
    await b.setPublished(true)
  } finally {
    publishing.value = false
  }
}
const liveMenu = computed(() => [
  {
    label: __('Open public page'),
    icon: 'external-link',
    onClick: () =>
      window.open(publicUrl(window.location.origin, b.form.route), '_blank'),
  },
  { label: __('Share'), icon: 'share-2', onClick: () => setTab('share') },
  {
    label: __('Unpublish'),
    icon: 'eye-off',
    onClick: () =>
      $dialog({
        title: __('Unpublish this form?'),
        message: __(
          'The link and QR code stop working until you publish it again.',
        ),
        actions: [
          {
            label: __('Unpublish'),
            variant: 'solid',
            theme: 'red',
            onClick: async (close) => {
              await b.setPublished(false)
              close()
            },
          },
        ],
      }),
  },
])

// a test uses what's saved: save first so the author tests what they see
const testing = ref(false)
const showReport = ref(false)
const showSheet = ref(false)
const report = ref(null)
async function runTest({ values, consent }) {
  if (b.dirty.value && !(await b.save())) return
  testing.value = true
  try {
    report.value = await call('crm.api.form.run_test_submission', {
      name: props.formId,
      values,
      consent: consent ? 1 : 0,
    })
    showSheet.value = false
    showReport.value = true
    capture('form_test_submission', { ok: !!report.value?.ok })
  } catch (e) {
    toast.error(e?.messages?.[0] || __('The test could not run'))
  } finally {
    testing.value = false
  }
}

onBeforeRouteLeave(() => {
  if (!b.dirty.value) return true
  return window.confirm(__('Leave without saving? Your changes will be lost.'))
})
function beforeUnload(event) {
  if (!b.dirty.value) return
  event.preventDefault()
  event.returnValue = ''
}
window.addEventListener('beforeunload', beforeUnload)
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
</script>
