<template>
  <div
    class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-testid="manual-article-page"
  >
    <div class="mx-auto w-full max-w-3xl px-4 pb-6 pt-4 sm:px-6 sm:pb-10">
      <nav class="mb-3">
        <button
          class="flex min-h-11 items-center gap-1 text-sm text-ink-gray-7 hover:text-ink-gray-9"
          data-testid="manual-article-back"
          @click="goBack"
        >
          <FeatherIcon name="arrow-left" class="h-4 w-4" />
          {{ backLabel }}
        </button>
      </nav>

      <section
        v-if="refusal"
        role="alert"
        class="mx-auto max-w-xl space-y-4 py-6"
        data-testid="manual-article-refusal"
      >
        <h1 class="text-xl font-semibold">{{ refusal.title }}</h1>
        <p class="text-base text-ink-gray-7">{{ refusal.detail }}</p>
        <div class="flex flex-wrap gap-2">
          <Button
            variant="solid"
            :label="__('Copy request for the manager')"
            class="min-h-11 sm:min-h-8"
            @click="copy(requestText(refusal.request))"
          />
          <Button
            :label="__('Go to the shop manual')"
            class="min-h-11 sm:min-h-8"
            @click="router.push({ name: 'Manual' })"
          />
          <Button
            :label="__('Try again')"
            class="min-h-11 sm:min-h-8"
            @click="load"
          />
        </div>
        <p v-if="copied" role="status" class="text-sm text-ink-gray-6">
          {{ copied }}
        </p>
      </section>

      <div v-else-if="!article" role="status" class="py-10 text-sm">
        {{ __('Loading the article…') }}
      </div>

      <article v-else data-testid="manual-article">
        <header class="mb-4 space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <Badge
              v-if="article.category"
              theme="gray"
              :label="article.category"
            />
            <Badge
              v-if="badge"
              :theme="badge.theme"
              :label="badge.label"
              data-testid="manual-article-status"
            />
          </div>
          <h1 class="text-2xl font-semibold text-ink-gray-9">
            {{ article.title }}
          </h1>
          <p class="text-sm text-ink-gray-6">
            {{ updatedLine(article, lang) }}
          </p>
          <p v-if="article.summary" class="text-base text-ink-gray-7">
            {{ article.summary }}
          </p>
        </header>

        <div
          v-if="article.can_edit"
          class="mb-4 flex flex-wrap gap-2"
          data-testid="manual-article-actions"
        >
          <Button
            icon-left="edit-2"
            :label="__('Edit', null, CTX)"
            class="min-h-11 sm:min-h-8"
            @click="
              router.push({
                name: 'ManualEditar',
                params: { name: article.name },
              })
            "
          />
          <Button
            v-if="article.status === 'Borrador'"
            variant="solid"
            :label="__('Publish')"
            :loading="busy === 'publish'"
            class="min-h-11 sm:min-h-8"
            data-testid="manual-publish"
            @click="transition('publish')"
          />
          <Button
            v-if="article.status === 'Publicado'"
            :label="__('Retire')"
            class="min-h-11 sm:min-h-8"
            data-testid="manual-retire"
            @click="confirmRetire = true"
          />
          <Button
            v-if="article.status === 'Retirado'"
            variant="solid"
            :label="__('Publish again')"
            :loading="busy === 'republish'"
            class="min-h-11 sm:min-h-8"
            data-testid="manual-republish"
            @click="transition('republish')"
          />
          <Button
            icon-left="clock"
            :label="__('History', null, CTX)"
            class="min-h-11 sm:min-h-8"
            data-testid="manual-history"
            @click="historyOpen = true"
          />
        </div>

        <div
          v-if="confirmRetire"
          role="alertdialog"
          aria-labelledby="manual-retire-q"
          class="mb-4 space-y-2 rounded-lg bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
        >
          <p id="manual-retire-q">
            {{
              __(
                'Your team will not see it any more. You can publish it again.',
              )
            }}
          </p>
          <div class="flex flex-wrap gap-2">
            <Button
              variant="solid"
              :label="__('Yes, retire it')"
              :loading="busy === 'retire'"
              class="min-h-11 sm:min-h-8"
              data-testid="manual-retire-confirm"
              @click="transition('retire')"
            />
            <Button
              :label="__('Cancel', null, CTX)"
              class="min-h-11 sm:min-h-8"
              @click="confirmRetire = false"
            />
          </div>
        </div>

        <div
          v-if="notice"
          role="status"
          class="mb-4 flex flex-wrap items-center gap-2 rounded-md bg-surface-green-1 px-3 py-2 text-sm text-ink-green-8"
          data-testid="manual-article-notice"
        >
          <span class="min-w-0 flex-1">{{ notice.text }}</span>
          <Button
            v-if="notice.undo"
            :label="__('Undo')"
            class="min-h-11 sm:min-h-8"
            data-testid="manual-undo"
            @click="transition(notice.undo)"
          />
        </div>
        <div
          v-if="problem"
          role="alert"
          class="mb-4 flex flex-wrap items-center gap-2 rounded-md bg-surface-red-1 px-3 py-2 text-sm text-ink-red-7"
        >
          <span class="min-w-0 flex-1"
            ><strong>{{ problem.title }}.</strong> {{ problem.detail }}</span
          >
          <Button
            :label="__('Refresh', null, CTX)"
            class="min-h-11 sm:min-h-8"
            @click="load"
          />
        </div>

        <!-- Sanitized by doco on save and in the answer, and again here (articleHtml). -->
        <!-- eslint-disable vue/no-v-html -->
        <div
          class="prose prose-sm max-w-none text-ink-gray-8 sm:prose-base [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md"
          data-testid="manual-article-body"
          v-html="body"
        />
        <!-- eslint-enable vue/no-v-html -->

        <p
          v-if="!article.can_edit"
          class="mt-8 border-t border-outline-gray-1 pt-4 text-sm text-ink-gray-6"
        >
          {{ __('Only the owner or the manager write the shop manual.') }}
          <button
            class="ml-1 min-h-11 font-medium text-ink-gray-8 underline sm:min-h-0"
            @click="copy(requestText('write'))"
          >
            {{ __('Copy request for the owner') }}
          </button>
        </p>
        <p
          v-if="copied && !refusal"
          role="status"
          class="mt-2 text-sm text-ink-gray-6"
        >
          {{ copied }}
        </p>
      </article>
    </div>

    <!-- The step itself: sticky at the bottom of this page's own scroller. -->
    <div
      v-if="article?.place"
      class="sticky bottom-0 mt-auto border-t border-outline-gray-2 bg-surface-base px-4 py-3 sm:px-6"
      data-testid="manual-place"
    >
      <div class="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-2">
        <template v-if="place.available">
          <Button
            variant="solid"
            size="md"
            :label="article.place.action"
            class="min-h-11 flex-1 sm:flex-none"
            data-testid="manual-place-go"
            @click="goToPlace"
          />
        </template>
        <template v-else>
          <span class="min-w-0 flex-1 text-sm text-ink-gray-7">{{
            place.reason
          }}</span>
          <Button
            :label="__('Copy request')"
            class="min-h-11 sm:min-h-8"
            data-testid="manual-place-request"
            @click="copy(place.request)"
          />
        </template>
      </div>
    </div>

    <HistorySheet
      v-if="historyOpen && article"
      :history="article.history || []"
      :title="article.title"
      @close="historyOpen = false"
    />
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge, Button, FeatherIcon } from 'frappe-ui'
import { shellBoot } from '@/composables/muelleShell'
import {
  CTX,
  TITLE,
  copyText,
  locale,
  manualApi,
  openTarget,
  placeActionUrl,
  placeAvailability,
  problemOf,
  requestText,
  statusBadge,
  updatedLine,
} from '@/composables/useManual'
import { articleHtml } from '@/utils/manualHtml'
import { readReturn } from '@/vendor/muelle-shell/contracts'

const HistorySheet = defineAsyncComponent(
  () => import('@/components/manual/HistorySheet.vue'),
)

const props = defineProps({ name: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
const lang = locale()
const article = ref(null)
const refusal = ref(null)
const problem = ref(null)
const notice = ref(null)
const copied = ref('')
const busy = ref('')
const confirmRetire = ref(false)
const historyOpen = ref(false)

const back = computed(() => readReturn(new URLSearchParams(route.query)))
const backLabel = computed(() =>
  back.value ? __('Back to {0}', [back.value.label], CTX) : TITLE,
)
const body = computed(() => articleHtml(article.value?.body))
const badge = computed(() =>
  article.value ? statusBadge(article.value, article.value.can_edit) : null,
)
const place = computed(() =>
  placeAvailability(
    article.value?.place,
    shellBoot.value,
    article.value?.title,
  ),
)

async function load() {
  problem.value = null
  try {
    article.value = await manualApi('get_article', { name: props.name })
    refusal.value = null
  } catch (error) {
    const p = problemOf(error)
    if (
      p.kind === 'permission' ||
      Number(error?.status) === 403 ||
      Number(error?.status) === 404
    )
      refusal.value = {
        title: __('This article is not in your shop manual'),
        detail: p.detail,
        request: 'article',
      }
    else if (!article.value) refusal.value = { ...p, request: 'article' }
    else problem.value = p
  }
}

async function transition(action) {
  busy.value = action
  problem.value = null
  try {
    const next = await manualApi(action, {
      name: article.value.name,
      modified: article.value.modified,
    })
    // Only what changed: the page stays where the person is.
    article.value = next
    confirmRetire.value = false
    notice.value =
      action === 'retire'
        ? {
            text: __(
              'Retired. Your team no longer sees it; it stays under «Retired».',
            ),
            undo: 'republish',
          }
        : action === 'republish' && notice.value?.undo
          ? { text: __('Published again.') }
          : { text: __('Published. Your team can read it now.') }
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    busy.value = ''
  }
}

function goBack() {
  if (back.value) return openTarget(back.value.to, router)
  const list = typeof route.query.list === 'string' ? route.query.list : ''
  router.push(list.startsWith('/manual') ? list : { name: 'Manual' })
}
function goToPlace() {
  const url = placeActionUrl(article.value.place, article.value)
  if (url) openTarget(url, router)
}
async function copy(text) {
  copied.value = await copyText(text)
}

watch(
  () => props.name,
  (next, previous) => {
    if (next && next !== previous) {
      article.value = null
      notice.value = null
      load()
    }
  },
)
onMounted(load)
</script>
