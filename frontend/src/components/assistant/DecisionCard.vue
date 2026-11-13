<template>
  <!-- A question about a document, drawn whole (doco books/decision_cards.py):
       the line as the paper prints it, the articles it may be with their photo,
       stock and last price, and the article «Crear» would make, editable. Once
       answered it is one line saying what was done. -->
  <article
    class="decision-card rounded-7 border border-outline-gray-2 bg-surface-base"
    :aria-label="title"
    data-testid="decision-card"
    :data-type="card.type"
    :data-status="card.status"
  >
    <!-- Answered: what the answer did, and the article it touched. -->
    <div v-if="!pending" class="flex items-start gap-2 p-3">
      <span
        :class="[
          result.icon,
          'mt-0.5 size-4 flex-none',
          result.skipped ? 'text-ink-gray-5' : 'text-ink-green-7',
        ]"
        aria-hidden="true"
      />
      <div class="min-w-0 flex-1">
        <p
          class="break-words text-base text-ink-gray-9"
          data-testid="decision-result"
        >
          {{ result.text }}
        </p>
        <p
          v-if="card.line?.text && card.line.text !== result.text"
          class="mt-0.5 truncate text-sm text-ink-gray-6"
        >
          {{ card.line.text }}
        </p>
      </div>
      <RouterLink
        v-if="result.to"
        :to="result.to"
        class="press flex min-h-11 flex-none items-center rounded-6 px-3 text-sm font-medium text-ink-blue-link"
        data-testid="decision-open"
        @click="$emit('navigate')"
      >
        {{ __('Open', null, 'Assistant link') }}
      </RouterLink>
    </div>

    <template v-else>
      <!-- The line as printed: the question's title. -->
      <header class="space-y-1 px-3 pt-3">
        <p v-if="progress" class="text-sm text-ink-gray-6">{{ progress }}</p>
        <h3
          class="title-face break-words text-lg font-semibold leading-snug text-ink-gray-9"
          data-testid="decision-line"
        >
          {{ card.line?.text ? `«${card.line.text}»` : card.prompt }}
        </h3>
        <p
          v-if="figures || card.line?.part_number"
          class="num text-sm text-ink-gray-7"
        >
          {{
            [
              figures,
              card.line?.part_number
                ? __('code {0}', [card.line.part_number])
                : '',
            ]
              .filter(Boolean)
              .join(' · ')
          }}
        </p>
        <ul
          v-if="serials.shown.length"
          class="flex flex-wrap gap-1 pt-1"
          :aria-label="__('Serial numbers on the paper')"
          data-testid="decision-serials"
        >
          <li class="py-0.5 pr-1 text-xs text-ink-gray-6">IMEI</li>
          <li
            v-for="serial in serials.shown"
            :key="serial"
            class="num rounded-full bg-surface-gray-2 px-2 py-0.5 text-xs text-ink-gray-8"
          >
            {{ serial }}
          </li>
          <li
            v-if="serials.more"
            class="rounded-full px-2 py-0.5 text-xs text-ink-gray-6"
          >
            {{ __('+{0} more', [serials.more]) }}
          </li>
        </ul>
      </header>

      <!-- Which article: the matches, then a search of the catalog. -->
      <section
        v-if="card.type === 'cap_item'"
        class="mt-2 px-3"
        :aria-label="__('Existing articles')"
      >
        <p v-if="matches.length" class="pt-1 text-sm text-ink-gray-6">
          {{
            matches.length === 1
              ? __('Is it this one?')
              : __('Is it one of these?')
          }}
        </p>
        <ul class="divide-y divide-outline-gray-1">
          <li
            v-for="match in matches"
            :key="match.code"
            class="decision-match py-2"
            data-testid="decision-match"
          >
            <span
              class="flex size-12 flex-none items-center justify-center overflow-hidden rounded-6 bg-surface-gray-2"
            >
              <img
                v-if="match.image"
                :src="match.image"
                :alt="match.name"
                loading="lazy"
                class="size-full object-cover"
              />
              <span
                v-else
                class="lucide-package size-5 text-ink-gray-5"
                aria-hidden="true"
              />
            </span>
            <div class="min-w-0 flex-1">
              <p class="break-words text-base text-ink-gray-9">
                {{ match.name }}
              </p>
              <p
                v-if="matchFacts(match, currency)"
                class="num text-sm text-ink-gray-6"
              >
                {{ matchFacts(match, currency) }}
              </p>
            </div>
            <button
              type="button"
              class="decision-match-action press min-h-11 rounded-full bg-surface-gray-2 px-4 text-sm font-medium text-ink-gray-9 hover:bg-surface-gray-3 disabled:opacity-50"
              :disabled="busy"
              data-testid="decision-link"
              @click="link(match)"
            >
              {{ __('Link', null, 'Decision card') }}
            </button>
          </li>
        </ul>
        <div v-if="card.actions?.search" class="py-2">
          <ComprasPicker
            model-value=""
            :label="__('Search another article')"
            :placeholder="__('Name or code')"
            :empty-text="__('No article you can use matches.')"
            clear-on-pick
            :disabled="busy"
            :load="searchItems"
            @pick="found"
          />
        </div>
      </section>

      <!-- «Crear»: the article the line would become, editable first. -->
      <section
        v-if="card.type === 'cap_item' && card.actions?.new"
        class="mx-3 mt-1 space-y-3 border-t border-outline-gray-1 py-3"
        :aria-label="__('New article')"
        data-testid="decision-new"
      >
        <p class="text-sm text-ink-gray-6">
          {{
            matches.length
              ? __('Not one of these? Create it')
              : __('Not in the catalog yet. Create it')
          }}
        </p>
        <div class="flex items-start gap-3">
          <!-- The picture: the one picked here, or a slot that takes one. -->
          <div class="flex-none">
            <button
              v-if="!photo.preview"
              type="button"
              class="press flex size-20 flex-col items-center justify-center gap-1 rounded-7 border border-dashed border-outline-gray-3 text-xs text-ink-gray-7 hover:bg-surface-gray-1 disabled:opacity-50"
              :disabled="busy || photo.sending"
              data-testid="decision-photo"
              @click="pickPhoto"
            >
              <span
                :class="[
                  photo.sending
                    ? 'lucide-loader-circle animate-spin'
                    : 'lucide-camera',
                  'size-5',
                ]"
                aria-hidden="true"
              />
              {{ photo.sending ? __('Uploading…') : __('Add photo') }}
            </button>
            <div v-else class="relative size-20">
              <img
                :src="photo.preview"
                :alt="__('Photo of the new article')"
                class="size-20 rounded-7 object-cover"
              />
              <button
                type="button"
                class="press absolute -right-2 -top-2 flex size-8 items-center justify-center rounded-full bg-surface-gray-9 text-ink-base"
                :aria-label="__('Remove photo')"
                :title="__('Remove photo')"
                @click="clearPhoto"
              >
                <span class="lucide-x size-4" aria-hidden="true" />
              </button>
            </div>
            <input
              ref="photoInput"
              type="file"
              accept="image/*"
              class="hidden"
              @change="photoPicked"
            />
          </div>
          <label class="min-w-0 flex-1">
            <span class="mb-1 block text-sm text-ink-gray-7">{{
              __('Name')
            }}</span>
            <textarea
              v-model="draft.item_name"
              rows="3"
              maxlength="140"
              class="decision-field decision-name block w-full resize-none py-2"
              :disabled="busy"
              data-testid="decision-name"
            />
          </label>
        </div>
        <p v-if="photo.error" role="alert" class="text-sm text-ink-red-7">
          {{ photo.error }}
        </p>
        <div class="decision-pickers grid gap-2">
          <ComprasPicker
            v-model="draft.item_group"
            :label="__('Item group')"
            :placeholder="__('Search group')"
            :empty-text="__('No group matches.')"
            :codes="false"
            :disabled="busy"
            :load="(q) => searchFor('item_group', q)"
          />
          <ComprasPicker
            v-model="draft.stock_uom"
            :label="__('Unit')"
            :placeholder="__('Search unit')"
            :empty-text="__('No unit matches.')"
            :codes="false"
            :disabled="busy"
            :load="(q) => searchFor('uom', q)"
          />
        </div>
        <button
          type="button"
          class="press inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-medium"
          :class="
            draft.has_serial
              ? 'bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
              : 'bg-surface-gray-2 text-ink-gray-8'
          "
          :aria-pressed="draft.has_serial ? 'true' : 'false'"
          :disabled="busy || card.proposal?.serials_allowed === false"
          data-testid="decision-serial"
          @click="draft.has_serial = !draft.has_serial"
        >
          <span
            :class="[
              draft.has_serial ? 'lucide-check' : 'lucide-plus',
              'size-4',
            ]"
            aria-hidden="true"
          />
          {{ __('Tracks serial numbers (IMEI)') }}
        </button>
        <p
          v-if="card.proposal?.serials_allowed === false"
          class="text-sm text-ink-gray-6"
          data-testid="decision-serial-off"
        >
          {{
            __(
              'Your inventory does not track serial numbers. Turn on «Activar serie / lote» in the inventory settings to track IMEIs.',
            )
          }}
        </p>
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt class="text-ink-gray-6">
            {{ (preview || card.proposal)?.plan ? __('Made as') : __('Code') }}
          </dt>
          <dd class="break-words text-ink-gray-9" data-testid="decision-code">
            {{ codeLine(preview || card.proposal) }}
          </dd>
        </dl>
        <div
          v-if="card.research?.note"
          class="rounded-7 bg-surface-gray-1 p-3 text-sm text-ink-gray-7"
        >
          <span class="block text-ink-gray-6">{{
            __('Found on the web')
          }}</span>
          <p class="mt-1">{{ card.research.note }}</p>
          <a
            v-for="url in card.research.sources || []"
            :key="url"
            :href="url"
            target="_blank"
            rel="noopener noreferrer nofollow"
            class="mr-3 inline-flex min-h-11 items-center gap-1 text-ink-gray-6 underline sm:min-h-0"
          >
            {{ hostOf(url) }}
            <span class="lucide-external-link size-3" aria-hidden="true" />
          </a>
        </div>
        <div class="flex justify-end">
          <button
            type="button"
            class="press min-h-11 rounded-full px-5 text-sm font-medium disabled:opacity-50"
            :class="
              matches.length
                ? 'bg-surface-gray-2 text-ink-gray-9 hover:bg-surface-gray-3'
                : 'bg-surface-gray-10 text-ink-base hover:bg-surface-gray-9'
            "
            :disabled="busy || photo.sending || !draftName(draft)"
            data-testid="decision-create"
            @click="create"
          >
            {{ __('Create article') }}
          </button>
        </div>
        <p v-if="!draftName(draft)" class="text-right text-sm text-ink-gray-6">
          {{ __('Write the name of the new article to create it.') }}
        </p>
      </section>

      <!-- Supplier and warehouse: their choices, and the name typed here. -->
      <section
        v-if="card.type !== 'cap_item'"
        class="mt-2 px-3"
        data-testid="decision-choices"
      >
        <p v-if="card.line?.text" class="text-sm text-ink-gray-6">
          {{ card.prompt }}
        </p>
        <ul class="divide-y divide-outline-gray-1">
          <li
            v-for="option in card.options || []"
            :key="option.i"
            class="flex min-h-11 items-center gap-3 py-1"
          >
            <span class="min-w-0 flex-1 break-words text-base text-ink-gray-9">
              {{ option.label }}
            </span>
            <button
              type="button"
              class="press min-h-11 flex-none rounded-full bg-surface-gray-2 px-4 text-sm font-medium text-ink-gray-9 hover:bg-surface-gray-3 disabled:opacity-50"
              :disabled="busy"
              data-testid="decision-option"
              @click="answer('link', option)"
            >
              {{ __('Choose', null, 'Decision card') }}
            </button>
          </li>
        </ul>
        <form
          v-if="card.actions?.write"
          class="flex items-end gap-2 py-2"
          @submit.prevent="written"
        >
          <label class="min-w-0 flex-1">
            <span class="mb-1 block text-sm text-ink-gray-7">{{
              card.type === 'cap_supplier'
                ? __('Or write the supplier')
                : __('Or write the warehouse')
            }}</span>
            <input
              v-model="typed"
              type="text"
              class="decision-field block w-full"
              :disabled="busy"
              data-testid="decision-write"
            />
          </label>
          <button
            type="submit"
            class="press min-h-11 rounded-full bg-surface-gray-2 px-4 text-sm font-medium text-ink-gray-9 disabled:opacity-50"
            :disabled="busy || !typed.trim()"
          >
            {{ __('Use', null, 'Decision card') }}
          </button>
        </form>
        <div v-if="card.actions?.new && card.proposal?.name" class="pb-2">
          <button
            type="button"
            class="press min-h-11 rounded-full bg-surface-gray-2 px-4 text-sm font-medium text-ink-gray-9 disabled:opacity-50"
            :disabled="busy"
            @click="answer('new')"
          >
            {{ __('Create supplier «{0}»', [card.proposal.name]) }}
          </button>
        </div>
      </section>

      <p
        v-if="state.error"
        role="alert"
        class="px-3 pt-2 text-sm text-ink-red-7"
        data-testid="decision-error"
      >
        {{ state.error }}
      </p>

      <!-- The way out of this question, and every question at once. -->
      <footer
        v-if="card.actions?.skip || card.actions?.sheet"
        class="flex flex-wrap items-center justify-between gap-2 border-t border-outline-gray-1 px-1 py-1"
      >
        <button
          v-if="card.actions?.skip"
          type="button"
          class="press min-h-11 rounded-full px-3 text-sm font-medium text-ink-gray-7 hover:bg-surface-gray-2 disabled:opacity-50"
          :disabled="busy"
          data-testid="decision-skip"
          @click="answer('skip')"
        >
          {{ __('Skip', null, 'Decision card') }}
        </button>
        <button
          v-if="card.actions?.sheet"
          type="button"
          class="press ml-auto min-h-11 rounded-full px-3 text-sm font-medium text-ink-gray-7 hover:bg-surface-gray-2 disabled:opacity-50"
          :disabled="busy"
          data-testid="decision-sheet"
          @click="tap(card.actions.sheet.data)"
        >
          {{ __('Decide all at once ({0})', [card.actions.sheet.n]) }}
        </button>
      </footer>
    </template>
  </article>
</template>
<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import ComprasPicker from '@/components/compras/ComprasPicker.vue'
import { prepareImage } from '@/components/ui/imageFiles'
import { errorText } from '@/utils/errorText'
import {
  cardKey,
  choiceFor,
  codeLine,
  draftFrom,
  draftName,
  isPending,
  lineFigures,
  matchFacts,
  progressText,
  resultOf,
  serialsOf,
} from './decisionCards'
import {
  ASSISTANT_API,
  answerCard,
  assistant,
  tap,
  uploadAssistantFile,
} from './useAssistant'

const props = defineProps({ card: { type: Object, required: true } })
defineEmits(['navigate'])

const CAPTURE_SEARCH = 'doco.docoutils.books.shell_capture.search'

const pending = computed(() => isPending(props.card))
const result = computed(() => resultOf(props.card))
const progress = computed(() => progressText(props.card))
const figures = computed(() => lineFigures(props.card))
const serials = computed(() => serialsOf(props.card))
const currency = computed(() => props.card.line?.currency || 'MXN')
const state = computed(() => assistant.decisions[cardKey(props.card)] || {})
const busy = computed(() => state.value.state === 'sending')
const title = computed(() =>
  __('Question about «{0}»', [props.card.line?.text || props.card.subject]),
)

// Matches from the card, then what the person found in the catalog.
const extra = ref([])
const matches = computed(() => [...(props.card.matches || []), ...extra.value])

function link(match) {
  if (match.i != null) return answer('link', match)
  return answer('code', match.code)
}

function answer(action, value) {
  return answerCard(props.card, choiceFor(props.card, action, value))
}

function searchFor(kind, txt) {
  return call(CAPTURE_SEARCH, { name: props.card.capture, kind, txt })
}
function searchItems(txt) {
  return searchFor('item', txt)
}

/** A searched article joins the matches with its photo, stock and price. */
async function found(option) {
  if (matches.value.some((m) => m.code === option.value)) return
  try {
    const answer = await call(`${ASSISTANT_API}.decision_item`, {
      session_id: props.card.sid,
      di: props.card.di,
      item_code: option.value,
    })
    const row = answer?.ok ? answer.match : null
    extra.value = [
      ...extra.value,
      row || { code: option.value, name: option.label },
    ]
  } catch {
    extra.value = [...extra.value, { code: option.value, name: option.label }]
  }
}

// «Crear»: the proposal as the card shows it, edited in place.
const draft = reactive(draftFrom(props.card))
watch(
  () => cardKey(props.card),
  () => Object.assign(draft, draftFrom(props.card)),
)
function create() {
  return answer('create', draft)
}

// An edited name or group can change what «Crear» does (a variant of an
// existing template, another code): doco says so before the tap.
const preview = ref(null)
let previewTimer = 0
let previewTicket = 0
watch(
  () => [draft.item_name, draft.item_group],
  ([name, group]) => {
    window.clearTimeout(previewTimer)
    const proposal = props.card.proposal || {}
    if (name === proposal.item_name && group === proposal.item_group) {
      preview.value = null
      return
    }
    previewTimer = window.setTimeout(() => askPreview(name, group), 400)
  },
)
async function askPreview(name, group) {
  const mine = ++previewTicket
  try {
    const answer = await call(`${ASSISTANT_API}.decision_preview`, {
      session_id: props.card.sid,
      di: props.card.di,
      item_name: name,
      item_group: group,
    })
    if (mine === previewTicket && answer?.ok) preview.value = answer
  } catch {
    // the proposal's own line stays; «Crear» re-checks everything anyway
  }
}

// The photo: cut to size on the phone, uploaded as the person's private file;
// doco makes the public copy on the article it creates.
const photoInput = ref(null)
const photo = reactive({ preview: '', sending: false, error: '' })
function pickPhoto() {
  photoInput.value?.click()
}
async function photoPicked(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  clearPhoto()
  photo.preview = URL.createObjectURL(file)
  photo.sending = true
  photo.error = ''
  try {
    draft.image = await uploadAssistantFile(await prepareImage(file))
  } catch (error) {
    clearPhoto()
    photo.error = errorText(error, __('The photo did not upload. Try again.'))
  } finally {
    photo.sending = false
  }
}
function clearPhoto() {
  if (photo.preview) URL.revokeObjectURL(photo.preview)
  photo.preview = ''
  draft.image = ''
}

// Supplier and warehouse: the name typed on the card.
const typed = ref('')
async function written() {
  if (await answer('write', typed.value)) typed.value = ''
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

onBeforeUnmount(() => {
  window.clearTimeout(previewTimer)
  if (photo.preview) URL.revokeObjectURL(photo.preview)
})
</script>
<style scoped>
/* The card lays out by its own width: the dock, the sheet and full screen differ. */
.decision-card {
  container-type: inline-size;
}
/* A match: photo, name and facts; «Vincular» under them when the card is narrow. */
.decision-match {
  display: grid;
  grid-template-columns: 3rem minmax(0, 1fr);
  column-gap: 0.75rem;
  row-gap: 0.25rem;
  align-items: center;
}
.decision-match-action {
  grid-column: 2;
  justify-self: start;
}
.decision-pickers {
  grid-template-columns: minmax(0, 1fr);
}
@container (min-width: 22rem) {
  .decision-match {
    grid-template-columns: 3rem minmax(0, 1fr) auto;
  }
  .decision-match-action {
    grid-column: 3;
    justify-self: end;
  }
  .decision-pickers {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
/* the article's name grows with what it says, where the browser can */
.decision-name {
  field-sizing: content;
  min-height: 4.5rem;
}
/* The shell's filled field (Compras' .compra-campo): 44 px on a phone, 40 on a desk. */
.decision-field {
  min-height: 2.75rem;
  border: 1px solid transparent;
  border-radius: 0.5rem;
  background: var(--surface-gray-2);
  padding-left: 0.75rem;
  padding-right: 0.75rem;
  font-size: 1rem;
  color: var(--ink-gray-9);
}
.decision-field:focus {
  outline: none;
  border-color: var(--outline-gray-4);
  background: var(--surface-base, transparent);
}
.decision-field:disabled {
  opacity: 0.6;
}
@media (min-width: 640px) {
  .decision-field {
    min-height: 2.5rem;
    font-size: 0.875rem;
  }
}
</style>
