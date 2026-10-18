<template>
  <ModuleLayout
    :title="TITLE"
    :entries="entries"
    :active-key="state.vista"
    @select="selectVista"
  >
    <template #sidebar>
      <div
        v-if="ready && categories.length"
        class="px-3 pb-2 pt-7 text-xs text-ink-gray-6"
      >
        {{ __('Categories') }}
      </div>
      <nav
        v-if="ready && categories.length"
        class="flex flex-col gap-1"
        :aria-label="__('Categories')"
      >
        <button
          v-for="category in ['', ...categories]"
          :key="category || 'all'"
          class="flex min-h-11 items-center rounded-lg px-3 text-left text-sm hover:bg-surface-gray-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
          :class="
            state.categoria === category
              ? 'bg-surface-gray-2 font-semibold text-ink-gray-9'
              : 'text-ink-gray-7'
          "
          :aria-current="state.categoria === category ? 'true' : undefined"
          @click="selectCategory(category)"
        >
          <span class="truncate">{{ category || __('All', null, CTX) }}</span>
        </button>
      </nav>
    </template>

    <section
      v-if="guard"
      role="alert"
      class="mx-auto w-full max-w-xl space-y-4 p-6"
      data-testid="manual-guard"
    >
      <h1 class="text-xl font-semibold">
        {{ __('The shop manual is not available') }}
      </h1>
      <p class="text-base text-ink-gray-7">{{ guard }}</p>
      <div class="flex flex-wrap gap-2">
        <Button
          variant="solid"
          :label="__('Copy request for the manager')"
          class="min-h-11 sm:min-h-8"
          @click="copy(requestText('article'))"
        />
        <Button
          :label="__('Retry permissions')"
          class="min-h-11 sm:min-h-8"
          @click="retryBoot"
        />
      </div>
      <p v-if="copied" role="status" class="text-sm text-ink-gray-6">
        {{ copied }}
      </p>
    </section>

    <!-- The page is `relative` so the phone's «Escribir artículo» FAB sits
         over its one scroller. -->
    <div v-else class="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        class="min-h-0 flex-1 overflow-y-auto"
        :class="fab ? 'pb-24' : 'pb-6'"
        data-manual-scroller
      >
        <a
          v-if="back"
          :href="'#'"
          class="mx-4 mt-2 inline-flex min-h-11 items-center text-sm text-ink-gray-7 hover:text-ink-gray-9 sm:mx-6 sm:min-h-0"
          data-testid="manual-back"
          @click.prevent="goBack"
          >← {{ __('Back to {0}', [back.label], CTX) }}</a
        >
        <!-- On a phone the app bar already says «Manual de la tienda». -->
        <PageHeader
          v-if="!isPhone"
          :title="TITLE"
          :subtitle="boot?.company || __('How things are done in your shop')"
          :level="1"
        >
          <!-- While the manual is empty, its empty state carries these two. -->
          <template
            v-if="caps.write && !(emptyManual && !rows.length)"
            #actions
          >
            <Button
              icon-left="layers"
              :label="__('Start with templates')"
              class="min-h-11 sm:min-h-8"
              data-testid="manual-templates"
              @click="templatesOpen = true"
            />
            <Button
              variant="solid"
              icon-left="plus"
              :label="__('Write an article')"
              class="min-h-11 sm:min-h-8"
              data-testid="manual-new"
              @click="router.push({ name: 'ManualNuevo' })"
            />
          </template>
        </PageHeader>

        <!-- On a phone the header is gone: the search keeps its own top gap. -->
        <div class="px-4 pb-2 pt-3 sm:px-6 sm:pt-0">
          <label class="sr-only" for="manual-search">{{
            __('Search the shop manual')
          }}</label>
          <input
            id="manual-search"
            v-model="search"
            type="search"
            enterkeyhint="search"
            :placeholder="__('Search the shop manual')"
            class="form-input min-h-11 w-full rounded-lg border-outline-gray-2 bg-surface-gray-1 text-base text-ink-gray-9 sm:min-h-8 sm:text-sm"
            data-testid="manual-search"
          />
        </div>

        <div v-if="caps.write" class="px-4 pb-2 sm:hidden">
          <FormControl
            class="h-11 w-full"
            type="select"
            :aria-label="__('List', null, CTX)"
            :model-value="state.vista"
            :options="entries.map((e) => ({ label: e.label, value: e.value }))"
            @update:model-value="selectVista"
          />
        </div>
        <div
          v-if="categories.length"
          class="flex gap-2 overflow-x-auto px-4 pb-3 sm:hidden"
          role="group"
          :aria-label="__('Categories')"
        >
          <button
            v-for="category in ['', ...categories]"
            :key="category || 'all'"
            class="min-h-11 shrink-0 rounded-full border px-4 text-sm"
            :class="
              state.categoria === category
                ? 'border-outline-gray-4 bg-surface-gray-3 font-semibold text-ink-gray-9'
                : 'border-outline-gray-2 text-ink-gray-7'
            "
            @click="selectCategory(category)"
          >
            {{ category || __('All', null, CTX) }}
          </button>
        </div>

        <div
          v-if="lugarInfo.unknown"
          role="status"
          class="mx-4 mb-3 flex flex-wrap items-center gap-2 rounded-md bg-surface-gray-2 px-3 py-2 text-sm text-ink-gray-8 sm:mx-6"
          data-testid="manual-lugar-unknown"
        >
          <span class="min-w-0 flex-1">{{
            __('That screen is no longer in the list.')
          }}</span>
          <Button
            variant="solid"
            :label="__('See the whole manual')"
            class="min-h-11 sm:min-h-8"
            @click="clearLugar"
          />
        </div>
        <div
          v-else-if="lugarPlace"
          role="status"
          class="mx-4 mb-3 flex flex-wrap items-center gap-2 rounded-md bg-surface-gray-2 px-3 py-2 text-sm text-ink-gray-8 sm:mx-6"
          data-testid="manual-lugar"
        >
          <span class="min-w-0 flex-1">
            {{
              lugarEmpty
                ? __('Your shop does not have an article for «{0}» yet.', [
                    lugarPlace.action,
                  ])
                : __('Articles for «{0}»', [lugarPlace.action])
            }}
          </span>
          <template v-if="lugarEmpty">
            <Button
              v-if="caps.write"
              variant="solid"
              :label="__('Write it now')"
              class="min-h-11 sm:min-h-8"
              @click="
                router.push({
                  name: 'ManualNuevo',
                  query: { lugar: lugarPlace.key },
                })
              "
            />
            <Button
              v-else
              variant="solid"
              :label="__('Copy request for the manager')"
              class="min-h-11 sm:min-h-8"
              @click="copy(requestText('place', lugarPlace.action))"
            />
          </template>
          <Button
            :label="__('See the whole manual')"
            class="min-h-11 sm:min-h-8"
            @click="clearLugar"
          />
        </div>

        <div
          v-if="notice"
          role="status"
          class="mx-4 mb-3 rounded-md bg-surface-green-1 px-3 py-2 text-sm text-ink-green-8 sm:mx-6"
        >
          {{ notice }}
        </div>
        <p
          v-if="copied"
          role="status"
          class="mx-4 mb-3 text-sm text-ink-gray-6 sm:mx-6"
        >
          {{ copied }}
        </p>
        <div
          v-if="problem"
          role="alert"
          class="mx-4 mb-3 flex flex-wrap items-center gap-2 rounded-md bg-surface-red-1 px-3 py-2 text-sm text-ink-red-7 sm:mx-6"
        >
          <span class="min-w-0 flex-1"
            ><strong>{{ problem.title }}.</strong> {{ problem.detail }}</span
          >
          <Button
            :label="__('Try again')"
            class="min-h-11 sm:min-h-8"
            @click="load()"
          />
        </div>

        <div
          v-if="loading && !rows.length"
          role="status"
          class="px-6 py-8 text-sm text-ink-gray-6"
        >
          {{ __('Loading the shop manual…') }}
        </div>

        <section
          v-else-if="!rows.length && emptyManual && caps.write"
          class="mx-auto max-w-md px-6 py-10 text-center"
          data-testid="manual-empty-editor"
        >
          <p class="text-lg font-semibold text-ink-gray-9">
            {{ __('Write how things are done in your shop') }}
          </p>
          <p class="mt-1 text-sm text-ink-gray-7">
            {{
              __(
                'Opening, closing the register, warranties: your team reads it on the phone or at the counter, with the button to do it right there.',
              )
            }}
          </p>
          <div class="mt-4 flex flex-wrap justify-center gap-2">
            <Button
              variant="solid"
              :label="__('Start with templates')"
              class="min-h-11 sm:min-h-8"
              @click="templatesOpen = true"
            />
            <Button
              :label="__('Write an article')"
              class="min-h-11 sm:min-h-8"
              @click="router.push({ name: 'ManualNuevo' })"
            />
          </div>
        </section>

        <section
          v-else-if="!rows.length && emptyManual"
          role="status"
          class="mx-auto max-w-md px-6 py-10 text-center"
          data-testid="manual-empty-reader"
        >
          <p class="text-lg font-semibold text-ink-gray-9">
            {{ __('Your shop has not published its manual yet') }}
          </p>
          <p class="mt-1 text-sm text-ink-gray-7">
            {{
              __(
                'When the owner or the manager publish an article for your puesto, it shows up here.',
              )
            }}
          </p>
          <Button
            class="mt-4 min-h-11 sm:min-h-8"
            variant="solid"
            :label="__('Copy request for the manager')"
            @click="copy(requestText('publish'))"
          />
        </section>

        <section
          v-else-if="!rows.length"
          class="mx-auto max-w-md px-6 py-10 text-center text-ink-gray-7"
        >
          <p class="text-lg font-semibold">{{ emptyTitle }}</p>
          <Button
            v-if="state.q || state.categoria"
            class="mt-4 min-h-11 sm:min-h-8"
            :label="__('Clear the search')"
            @click="clearSearch"
          />
        </section>

        <ul
          v-else
          class="divide-y divide-outline-gray-1"
          data-testid="manual-rows"
        >
          <li v-for="row in rows" :key="row.name">
            <RouterLink
              :to="articleRoute(row)"
              class="flex min-h-14 items-start gap-3 px-4 py-3 hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link sm:px-6"
            >
              <span
                class="lucide-book-open mt-1 size-4 shrink-0 text-ink-gray-5"
                aria-hidden="true"
              />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium text-ink-gray-9">{{
                  row.title
                }}</span>
                <span class="block truncate text-sm text-ink-gray-6">{{
                  metaLine(row, now, lang)
                }}</span>
                <span
                  v-if="row.summary"
                  class="mt-0.5 line-clamp-2 block text-sm text-ink-gray-7"
                  >{{ row.summary }}</span
                >
              </span>
              <Badge
                v-if="statusBadge(row, caps.write, now)"
                :theme="statusBadge(row, caps.write, now).theme"
                :label="statusBadge(row, caps.write, now).label"
              />
            </RouterLink>
          </li>
        </ul>
        <div v-if="hasMore" class="px-4 py-3 sm:px-6">
          <Button
            :label="__('Show more')"
            :loading="loading"
            class="min-h-11 sm:min-h-8"
            @click="load({ more: true })"
          />
        </div>

        <!-- On a phone Ayuda is in «Más». -->
        <footer
          v-if="helpAvailable && !isPhone"
          class="mt-6 border-t border-outline-gray-1 px-4 py-4 text-sm text-ink-gray-7 sm:px-6"
          data-testid="manual-help"
        >
          {{ __('Questions about how to use Muelle?') }}
          <button
            class="ml-1 min-h-11 font-medium text-ink-gray-9 underline sm:min-h-0"
            @click="openHelp"
          >
            {{ __('Open Help') }}
          </button>
        </footer>
      </div>
      <Fab
        v-if="fab"
        :label="__('Write an article')"
        icon="lucide-pencil"
        data-testid="manual-fab"
        @click="router.push({ name: 'ManualNuevo' })"
      />
    </div>
    <TemplatesSheet
      v-if="templatesOpen"
      :templates="boot?.templates || []"
      :boot="boot || {}"
      @close="templatesOpen = false"
      @done="templatesDone"
    />
  </ModuleLayout>
</template>
<script setup>
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Badge, Button, FormControl } from 'frappe-ui'
import { Fab, PageHeader } from '@/components/ui'
import { isMobile as isPhone } from '@/composables/breakpoint'
import ModuleLayout from '@/components/shell/ModuleLayout.vue'
import {
  CTX,
  TITLE,
  backTarget,
  copyText,
  listQuery,
  listState,
  loadManualBoot,
  locale,
  lugarOf,
  manualApi,
  manualBoot,
  metaLine,
  parse,
  problemOf,
  requestText,
  resolveLugar,
  statusBadge,
  vistaLabel,
  vistasFor,
} from '@/composables/useManual'

const TemplatesSheet = defineAsyncComponent(
  () => import('@/components/manual/TemplatesSheet.vue'),
)

const route = useRoute()
const router = useRouter()
const boot = manualBoot
const caps = computed(() => boot.value?.capabilities || {})
const lang = locale()
// The site's clock from the last answer, so «hace 3 días» never mixes time zones.
const now = ref(Date.now())
const rows = ref([])
const counts = ref({})
const categories = ref([])
const hasMore = ref(false)
const loading = ref(false)
const ready = ref(false)
const problem = ref(null)
const notice = ref('')
const copied = ref('')
const templatesOpen = ref(false)
const lugarEmpty = ref(false)
const helpAvailable = typeof window.docoSupport?.openHelp === 'function'
let ticket = 0

const state = computed(() => listState(route.query, Boolean(caps.value.write)))
const search = ref(typeof route.query.q === 'string' ? route.query.q : '')
const back = computed(() => backTarget(route.query))
// A moved or unknown key never reaches the server: it explains and offers the whole manual.
const lugarInfo = computed(() => lugarOf(route.query, boot.value?.places || []))
const lugarPlace = computed(() => lugarInfo.value.place)
const guard = computed(() =>
  boot.value && !boot.value.enabled
    ? boot.value.reason ||
      __(
        "The shop manual is for the team's accounts. Ask the owner or the manager to check your user.",
      )
    : '',
)
const entries = computed(() =>
  vistasFor(Boolean(caps.value.write)).map((vista) => ({
    value: vista.value,
    icon: vista.icon,
    label:
      vistaLabel(vista.value) +
      (counts.value[vista.value] !== undefined
        ? ` (${counts.value[vista.value]})`
        : ''),
  })),
)
// Nothing at all in the manual for this person (not just this search).
const emptyManual = computed(
  () =>
    ready.value &&
    !state.value.q &&
    !state.value.categoria &&
    !lugarInfo.value.send &&
    state.value.vista === 'publicados' &&
    (caps.value.write
      ? !Object.values(counts.value).some(Boolean)
      : !categories.value.length),
)
// The one create action of the list: a FAB on a phone (the empty manual's
// own state carries «Empezar con plantillas» and «Escribir artículo»).
const fab = computed(
  () =>
    isPhone.value &&
    Boolean(caps.value.write) &&
    !(emptyManual.value && !rows.value.length),
)
const emptyTitle = computed(() =>
  state.value.q
    ? __('No articles match «{0}»', [state.value.q])
    : state.value.vista === 'borradores'
      ? __('No drafts')
      : state.value.vista === 'retirados'
        ? __('Nothing retired')
        : state.value.categoria
          ? __('No articles in this category')
          : __('Nothing published yet. Your drafts are under «Drafts».'),
)

function articleRoute(row) {
  const query = {}
  if (back.value) {
    query.return_to = back.value.to
    query.return_label = back.value.label
  }
  return { name: 'ManualArticulo', params: { name: row.name }, query }
}

async function load({ more = false } = {}) {
  const current = ++ticket
  loading.value = true
  problem.value = null
  try {
    const page = await manualApi('list_articles', {
      ...state.value,
      lugar: lugarInfo.value.send,
      start: more ? rows.value.length : 0,
    })
    if (current !== ticket) return
    if (lugarInfo.value.send && !more) {
      const found = resolveLugar(page.rows || [])
      lugarEmpty.value = found.kind === 'none'
      if (found.kind === 'one') {
        router.replace({
          name: 'ManualArticulo',
          params: { name: found.name },
          query: back.value
            ? { return_to: back.value.to, return_label: back.value.label }
            : {},
        })
        return
      }
    }
    // Rows patch in place: the list keeps its scroll when only the page grows.
    rows.value = more ? rows.value.concat(page.rows || []) : page.rows || []
    hasMore.value = Boolean(page.has_more)
    categories.value = page.categories || []
    counts.value = page.counts || {}
    if (!Number.isNaN(parse(page.now))) now.value = parse(page.now)
    ready.value = true
  } catch (error) {
    if (current === ticket) problem.value = problemOf(error)
  } finally {
    if (current === ticket) loading.value = false
  }
}

function replaceQuery(next) {
  const query = { ...listQuery(next) }
  for (const key of ['lugar', 'return_to', 'return_label'])
    if (route.query[key]) query[key] = route.query[key]
  router.replace({ query })
}
function selectVista(vista) {
  replaceQuery({ ...state.value, vista })
}
function selectCategory(categoria) {
  replaceQuery({ ...state.value, categoria })
}
function clearSearch() {
  search.value = ''
  replaceQuery({ ...state.value, q: '', categoria: '' })
}
function clearLugar() {
  const query = { ...route.query }
  delete query.lugar
  router.replace({ query })
}
function goBack() {
  const target = back.value?.to
  if (!target) return
  if (target.startsWith('/crm/')) router.push(target.slice(4))
  else window.location.assign(target)
}
async function copy(text) {
  copied.value = await copyText(text)
}
function openHelp() {
  window.docoSupport?.openHelp?.()
}
async function retryBoot() {
  await loadManualBoot({ refresh: true })
  if (boot.value?.enabled) load()
}
function templatesDone(result) {
  templatesOpen.value = false
  const made = result?.created?.length || 0
  notice.value = made
    ? __('{0} drafts ready. Review them and publish the ones you want.', [made])
    : __('Those templates are already in your drafts.')
  if (state.value.vista === 'borradores') load()
  else selectVista('borradores')
}

let debounce
watch(search, (value) => {
  clearTimeout(debounce)
  debounce = setTimeout(() => {
    if ((value || '').trim() !== state.value.q)
      replaceQuery({ ...state.value, q: (value || '').trim() })
  }, 250)
})
watch(
  () => [
    route.query.q,
    route.query.categoria,
    route.query.vista,
    route.query.lugar,
  ],
  () => {
    if (route.name !== 'Manual' || !boot.value?.enabled) return
    if (typeof route.query.q !== 'string' && search.value) search.value = ''
    load()
  },
)
onMounted(async () => {
  await loadManualBoot()
  if (boot.value?.enabled) load()
})
</script>
