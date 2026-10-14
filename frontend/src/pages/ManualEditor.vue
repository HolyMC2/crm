<template>
  <div
    class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-testid="manual-editor-page"
  >
    <div class="mx-auto w-full max-w-3xl px-4 pb-10 pt-4 sm:px-6">
      <nav class="mb-3">
        <button
          class="flex min-h-11 items-center gap-1 text-sm text-ink-gray-7 hover:text-ink-gray-9"
          @click="leave"
        >
          <FeatherIcon name="arrow-left" class="h-4 w-4" />
          {{ currentName ? __('Back to the article') : TITLE }}
        </button>
      </nav>

      <section
        v-if="refusal"
        role="alert"
        class="mx-auto max-w-xl space-y-4 py-6"
        data-testid="manual-editor-refusal"
      >
        <h1 class="text-xl font-semibold">
          {{ __('Only the owner or the manager write the shop manual') }}
        </h1>
        <p class="text-base text-ink-gray-7">{{ refusal }}</p>
        <div class="flex flex-wrap gap-2">
          <Button
            variant="solid"
            :label="__('Copy request for the owner')"
            class="min-h-11 sm:min-h-8"
            @click="copy(requestText('write'))"
          />
          <Button
            :label="__('Go to the shop manual')"
            class="min-h-11 sm:min-h-8"
            @click="router.push({ name: 'Manual' })"
          />
        </div>
        <p v-if="copied" role="status" class="text-sm text-ink-gray-6">
          {{ copied }}
        </p>
      </section>

      <div v-else-if="!loaded" role="status" class="py-10 text-sm">
        {{ __('Loading the article…') }}
      </div>

      <form
        v-else
        class="space-y-5"
        data-testid="manual-editor"
        @submit.prevent
      >
        <h1 class="text-xl font-semibold text-ink-gray-9">
          {{ currentName ? __('Edit the article') : __('New article') }}
        </h1>

        <div
          v-if="draftBanner"
          role="status"
          class="flex flex-wrap items-center gap-2 rounded-md bg-surface-amber-1 px-3 py-2 text-sm text-ink-amber-8"
          data-testid="manual-draft-banner"
        >
          <span class="min-w-0 flex-1">{{ draftBanner }}</span>
          <Button
            variant="solid"
            :label="__('Recover')"
            class="min-h-11 sm:min-h-8"
            @click="recoverDraft"
          />
          <Button
            :label="__('Discard', null, CTX)"
            class="min-h-11 sm:min-h-8"
            @click="discardDraft"
          />
        </div>

        <div
          v-if="conflict"
          role="alert"
          class="space-y-2 rounded-md bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
          data-testid="manual-conflict"
        >
          <p class="font-semibold">
            {{ __('Someone else changed this article') }}
          </p>
          <p>
            {{
              __(
                'What you wrote stays here and in your draft. Choose how to continue.',
              )
            }}
          </p>
          <div class="flex flex-wrap gap-2">
            <Button
              variant="solid"
              :label="__('Reapply my changes')"
              class="min-h-11 sm:min-h-8"
              @click="reapply"
            />
            <Button
              :label="__('Use the current version')"
              class="min-h-11 sm:min-h-8"
              @click="useCurrent"
            />
          </div>
        </div>

        <FormControl
          v-model="form.title"
          type="text"
          :label="__('Title', null, CTX)"
          :placeholder="__('For example: Closing the register')"
          maxlength="140"
          data-testid="manual-title"
        />
        <div>
          <label
            class="mb-1.5 block text-xs text-ink-gray-5"
            for="manual-category"
            >{{ __('Category', null, CTX) }}</label
          >
          <input
            id="manual-category"
            v-model="form.category"
            list="manual-categories"
            maxlength="60"
            :placeholder="__('Caja, Taller, Garantías…')"
            class="form-input min-h-11 w-full rounded border-outline-gray-2 bg-surface-gray-2 text-base text-ink-gray-8 sm:min-h-7 sm:text-sm"
            data-testid="manual-category"
          />
          <datalist id="manual-categories">
            <option
              v-for="category in categories"
              :key="category"
              :value="category"
            />
          </datalist>
        </div>
        <FormControl
          v-model="form.summary"
          type="textarea"
          :rows="2"
          :label="__('What it is for')"
          :placeholder="__('One line the team reads in the list')"
          maxlength="280"
        />
        <AudienceChips v-model="form.audience" />
        <FormControl
          v-if="companies.length > 1"
          v-model="form.company"
          type="select"
          :label="__('Company', null, CTX)"
          :options="[
            { label: __('Every company'), value: '' },
            ...companies.map((company) => ({ label: company, value: company })),
          ]"
        />
        <PlacePicker v-model="form.place" :places="boot?.places || []" />

        <div>
          <p class="mb-1.5 text-xs text-ink-gray-5">{{ __('Article') }}</p>
          <div
            class="rounded-lg border border-outline-gray-2"
            data-testid="manual-body"
          >
            <TextEditor
              :content="form.body"
              :placeholder="
                __('Write the steps as you would explain them at the counter.')
              "
              :upload-function="upload"
              :fixed-menu="menu"
              editor-class="manual-editor prose-sm max-w-none px-3 py-2 text-ink-gray-8 focus:outline-none"
              @change="(value) => (form.body = value)"
            />
          </div>
          <p
            v-if="uploadNote"
            role="status"
            class="mt-1 text-sm text-ink-amber-8"
          >
            {{ uploadNote }}
          </p>
        </div>

        <div class="space-y-2 border-t border-outline-gray-1 pt-4">
          <div class="flex flex-wrap gap-2" data-testid="manual-editor-actions">
            <Button
              v-if="status === 'Publicado'"
              variant="solid"
              :label="__('Save changes')"
              :loading="busy === 'save'"
              class="min-h-11 sm:min-h-8"
              data-testid="manual-save"
              @click="save()"
            />
            <template v-else>
              <Button
                :label="__('Save draft')"
                :loading="busy === 'save'"
                class="min-h-11 sm:min-h-8"
                data-testid="manual-save"
                @click="save()"
              />
              <Button
                v-if="status !== 'Retirado'"
                variant="solid"
                :label="__('Publish')"
                :loading="busy === 'publish'"
                class="min-h-11 sm:min-h-8"
                data-testid="manual-editor-publish"
                @click="publish"
              />
            </template>
            <Button
              v-if="currentName"
              :label="__('See the article')"
              class="min-h-11 sm:min-h-8"
              @click="leave"
            />
          </div>
          <!-- Below the buttons: a message never moves the button that was used. -->
          <p
            v-if="blocker"
            role="alert"
            class="text-sm text-ink-red-7"
            data-testid="manual-blocker"
          >
            {{ blocker }}
          </p>
          <p
            v-if="saved"
            role="status"
            class="flex flex-wrap items-center gap-2 text-sm text-ink-green-8"
            data-testid="manual-saved"
          >
            <span>{{ saved }}</span>
            <button
              v-if="status === 'Publicado' && currentName"
              type="button"
              class="min-h-11 underline sm:min-h-0"
              @click="historyOpen = true"
            >
              {{ __('See history') }}
            </button>
          </p>
          <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
            <strong>{{ problem.title }}.</strong> {{ problem.detail }}
          </p>
        </div>
      </form>
    </div>
    <HistorySheet
      v-if="historyOpen"
      :history="history"
      :title="form.title"
      @close="historyOpen = false"
    />
  </div>
</template>
<script setup>
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { Button, FeatherIcon, FormControl, TextEditor } from 'frappe-ui'
import AudienceChips from '@/components/manual/AudienceChips.vue'
import PlacePicker from '@/components/manual/PlacePicker.vue'
import { uploadFile } from '@/components/editor/config'
import {
  CTX,
  DOCTYPE,
  TITLE,
  copyText,
  createDraftStore,
  draftKey,
  draftNotice,
  emptyForm,
  formFrom,
  isDirty,
  loadManualBoot,
  manualApi,
  manualBoot,
  outcomeUnknown,
  problemOf,
  publishBlocker,
  requestId,
  requestText,
} from '@/composables/useManual'

const HistorySheet = defineAsyncComponent(
  () => import('@/components/manual/HistorySheet.vue'),
)

const props = defineProps({ name: { type: String, default: '' } })
const route = useRoute()
const router = useRouter()
const boot = manualBoot
const drafts = createDraftStore()
const form = reactive(emptyForm())
const base = ref(emptyForm())
const currentName = ref(props.name || '')
const modified = ref('')
const status = ref('Borrador')
const history = ref([])
const categories = ref([])
const loaded = ref(false)
const refusal = ref('')
const problem = ref(null)
const conflict = ref(false)
const blocker = ref('')
const saved = ref('')
const busy = ref('')
const copied = ref('')
const draftBanner = ref('')
const uploadNote = ref('')
const historyOpen = ref(false)
// A retried save after an unknown outcome reuses its request id.
let pendingRequest = null
let leaving = false

const companies = computed(() => boot.value?.companies || [])
const dirty = computed(() => loaded.value && isDirty(form, base.value))
const menu = [
  'Paragraph',
  ['Heading 2', 'Heading 3'],
  'Separator',
  'Bold',
  'Italic',
  'Separator',
  'Bullet List',
  'Numbered List',
  'Separator',
  'Image',
  'Link',
]
const key = () =>
  draftKey({
    site: window.site_name || location.host,
    user: decodeURIComponent(
      document.cookie
        .split('; ')
        .find((part) => part.startsWith('user_id='))
        ?.slice(8) || '',
    ),
    name: currentName.value,
  })

function adopt(article) {
  currentName.value = article.name
  modified.value = article.modified
  status.value = article.status
  history.value = article.history || []
  base.value = formFrom(article)
}

async function load() {
  await loadManualBoot()
  if (!boot.value?.enabled || !boot.value?.capabilities?.write) {
    refusal.value =
      boot.value?.reason ||
      __(
        'Only the owner or the manager write the shop manual. Copy the request for the owner.',
      )
    return
  }
  try {
    if (currentName.value) {
      const article = await manualApi('get_article', {
        name: currentName.value,
      })
      if (!article.can_edit) {
        refusal.value = __(
          'Only the owner or the manager write the shop manual. Copy the request for the owner.',
        )
        return
      }
      adopt(article)
      Object.assign(form, formFrom(article))
    } else {
      const lugar =
        typeof route.query.lugar === 'string' ? route.query.lugar : ''
      const prefill = emptyForm({
        place: (boot.value.places || []).some((p) => p.key === lugar)
          ? lugar
          : '',
      })
      base.value = prefill
      Object.assign(form, prefill)
    }
    loaded.value = true
    manualApi('list_articles', { vista: 'publicados', limit: 1 })
      .then((page) => (categories.value = page.categories || []))
      .catch(() => {})
    const stored = await drafts.load(key())
    if (stored && isDirty(stored.form, base.value))
      draftBanner.value = draftNotice(stored, { modified: modified.value })
  } catch (error) {
    const p = problemOf(error)
    if (p.kind === 'permission') refusal.value = p.detail
    else problem.value = p
  }
}

async function recoverDraft() {
  const stored = await drafts.load(key())
  if (stored) Object.assign(form, stored.form)
  draftBanner.value = ''
}
async function discardDraft() {
  await drafts.clear(key())
  draftBanner.value = ''
}

function values() {
  return {
    title: form.title,
    category: form.category,
    summary: form.summary,
    body: form.body,
    company: form.company || null,
    place: form.place || '',
    audience: [...form.audience],
  }
}

async function save({ quiet = false } = {}) {
  blocker.value = ''
  problem.value = null
  if (!form.title.trim()) {
    blocker.value = __('Write a title to save the article.')
    return false
  }
  busy.value = 'save'
  const requestKey = pendingRequest || requestId()
  pendingRequest = requestKey
  try {
    const wasNew = !currentName.value
    const article = await manualApi('save_article', {
      request_id: requestKey,
      name: currentName.value || null,
      modified: modified.value || null,
      values: values(),
    })
    pendingRequest = null
    const oldKey = key()
    adopt(article)
    // Keep what the person is typing; only the saved version moves.
    base.value = { ...values(), audience: [...form.audience] }
    conflict.value = false
    await drafts.clear(oldKey)
    await drafts.clear(key())
    if (!quiet)
      saved.value =
        article.status === 'Publicado'
          ? __('Changes published.')
          : __('Draft saved.')
    if (wasNew)
      router.replace({ name: 'ManualEditar', params: { name: article.name } })
    return true
  } catch (error) {
    if (!outcomeUnknown(error)) pendingRequest = null
    const p = problemOf(error)
    if (p.kind === 'conflict') conflict.value = true
    else problem.value = p
    return false
  } finally {
    busy.value = ''
  }
}

async function publish() {
  blocker.value = publishBlocker(form)
  if (blocker.value) return
  if ((dirty.value || !currentName.value) && !(await save({ quiet: true })))
    return
  busy.value = 'publish'
  try {
    const article = await manualApi('publish', {
      name: currentName.value,
      modified: modified.value,
    })
    adopt(article)
    saved.value = __('Published. Your team can read it now.')
    leaving = true
    router.push({ name: 'ManualArticulo', params: { name: article.name } })
  } catch (error) {
    const p = problemOf(error)
    if (p.kind === 'conflict') conflict.value = true
    else problem.value = p
  } finally {
    busy.value = ''
  }
}

async function reapply() {
  // Take the current version's stamp and save what is on screen over it.
  const article = await manualApi('get_article', { name: currentName.value })
  modified.value = article.modified
  status.value = article.status
  conflict.value = false
  await save()
}
async function useCurrent() {
  const article = await manualApi('get_article', { name: currentName.value })
  adopt(article)
  Object.assign(form, formFrom(article))
  conflict.value = false
}

async function upload(file) {
  uploadNote.value = ''
  // A photo is a private file of the article: the first «Guardar borrador» creates it.
  if (!currentName.value) {
    if (!form.title.trim()) {
      uploadNote.value = __(
        'Write the title first: the photo is saved with the article.',
      )
      throw new Error(uploadNote.value)
    }
    if (!(await save({ quiet: true }))) throw new Error('save')
    saved.value = __('Draft saved with your photo.')
  }
  return uploadFile(file, DOCTYPE, currentName.value, true)
}

function leave() {
  if (currentName.value)
    router.push({ name: 'ManualArticulo', params: { name: currentName.value } })
  else router.push({ name: 'Manual' })
}
async function copy(text) {
  copied.value = await copyText(text)
}

// Typing goes to the draft store every second while there are unsaved changes.
let draftTimer
watch(
  form,
  () => {
    if (!loaded.value) return
    saved.value = ''
    window.__MUELLE_HAS_DRAFT__ = dirty.value
    clearTimeout(draftTimer)
    draftTimer = setTimeout(() => {
      if (dirty.value) drafts.save(key(), values(), modified.value)
    }, 1000)
  },
  { deep: true },
)
function beforeUnload(event) {
  if (!dirty.value) return
  event.preventDefault()
  event.returnValue = ''
}
onBeforeRouteLeave((to) => {
  if (leaving || !dirty.value) return true
  if (to.name === 'ManualEditar' && to.params.name === currentName.value)
    return true
  return window.confirm(
    __(
      'You have unsaved changes. They stay as a draft on this device. Leave anyway?',
    ),
  )
})
onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload)
  load()
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnload)
  window.__MUELLE_HAS_DRAFT__ = false
  clearTimeout(draftTimer)
})
</script>
<style scoped>
/* Scoped so the global stylesheet stays within budget. */
:deep(.manual-editor) {
  min-height: 12rem;
}
:deep(.manual-editor img) {
  max-width: 100%;
  height: auto;
}
</style>
