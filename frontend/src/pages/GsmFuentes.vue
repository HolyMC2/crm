<template>
  <!-- Servidor GSM › Fuentes de novedades: the tools' feeds, Telegram channels and news
       pages the site gathers into «Novedades». The title opens the views (Todas, Activas,
       Con fallas); a row opens its sheet with the address, the switches, how the last
       reading went and what it brought; the page's one action adds a source. -->
  <div class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
    <AppBar
      :context="__('GSM server', null, 'Gsm')"
      :title="title"
      :scopes="scopes"
      :scope="view"
      :scope-title="__('News sources', null, 'Gsm')"
      :back="{ path: '/gsm' }"
      :back-label="__('GSM catalog', null, 'Gsm')"
      :loading="loading && loaded"
      @update:scope="setView"
    />

    <div class="min-h-0 flex-1 overflow-y-auto pb-28 sm:pb-10">
      <div class="mx-auto w-full max-w-3xl pt-2">
        <div
          v-if="loaded && !guard && suggestedMissing"
          class="flex flex-wrap items-center gap-1.5 px-4 pb-2"
        >
          <button
            type="button"
            :class="['press', BTN.tonal]"
            :disabled="busy"
            data-gsm-sugeridas
            @click="addSuggested"
          >
            <span class="lucide-sparkles size-4" aria-hidden="true" />
            {{
              suggestedMissing === 1
                ? __('Add the suggested source', null, 'Gsm')
                : __('Add the {0} suggested sources', [suggestedMissing], 'Gsm')
            }}
          </button>
        </div>

        <EmptyState
          v-if="guard"
          role="alert"
          state="error"
          :title="guard.title"
          :message="guard.detail"
          :action="guard.retry ? __('Retry', null, 'Gsm') : ''"
          @action="load()"
        />
        <EmptyState
          v-else-if="loading && !loaded"
          role="status"
          state="loading"
          :title="__('Loading the sources…', null, 'Gsm')"
        />
        <EmptyState
          v-else-if="loaded && !shown.length"
          :title="
            rows.length
              ? __('No source in this view', null, 'Gsm')
              : __('No news sources yet', null, 'Gsm')
          "
          :message="
            rows.length
              ? ''
              : __(
                  'Paste a feed, a public Telegram channel or a news page.',
                  null,
                  'Gsm',
                )
          "
        />
        <ul
          v-else
          class="divide-y divide-outline-gray-1"
          data-testid="gsm-fuentes"
        >
          <li v-for="row in shown" :key="row.name" :data-fuente="row.name">
            <ListRow
              :title="row.title"
              :subtitle="rowSubtitle(row)"
              @click="openRow(row)"
            >
              <template #trailing>
                <StatusChip
                  :label="stateChip(row.state).label"
                  :tone="stateChip(row.state).tone"
                />
              </template>
            </ListRow>
          </li>
        </ul>
      </div>
    </div>

    <Fab
      :label="__('Add source', null, 'Gsm')"
      icon="lucide-plus"
      extended
      data-gsm-fuente-nueva
      @click="openNew"
    />

    <BottomSheet
      :open="form.open"
      :title="
        form.name ? form.title || form.url : __('New source', null, 'Gsm')
      "
      :subtitle="current ? rowSubtitle(current) : ''"
      @update:open="(open) => !open && closeForm()"
    >
      <div class="space-y-3 px-4 pb-2">
        <Field
          v-model="form.url"
          :label="__('Link', null, 'Gsm')"
          inputmode="url"
          autocomplete="off"
          data-gsm-fuente-enlace
          @update:model-value="onUrl"
        />
        <div
          class="flex flex-wrap gap-1.5"
          role="radiogroup"
          :aria-label="__('Kind', null, 'Gsm')"
        >
          <button
            v-for="k in KINDS"
            :key="k.value"
            type="button"
            role="radio"
            :aria-checked="form.kind === k.value"
            :class="['press', chipClass(form.kind === k.value)]"
            @click="setKind(k.value)"
          >
            {{ __(k.label, null, 'Gsm') }}
          </button>
        </div>
        <Field
          v-model="form.title"
          :label="__('Name', null, 'Gsm')"
          data-gsm-fuente-nombre
          @update:model-value="form.titleTouched = true"
        />
        <Field
          v-if="form.kind === 'page'"
          v-model="form.link_prefix"
          :label="__('News links start with', null, 'Gsm')"
          :placeholder="'/en/news/'"
        />
        <Switch v-model="form.enabled" :label="__('Active', null, 'Gsm')" />
        <Switch
          v-model="form.on_site"
          :label="__('Show on the website', null, 'Gsm')"
          :disabled="!form.enabled"
        />
        <ul
          v-if="current?.latest?.length"
          class="divide-y divide-outline-gray-1 rounded-6 bg-surface-gray-1"
        >
          <li
            v-for="item in current.latest"
            :key="item.url"
            class="flex items-baseline justify-between gap-3 px-3 py-2 text-sm"
          >
            <a
              :href="item.url"
              target="_blank"
              rel="noopener"
              class="min-w-0 truncate text-ink-gray-8 hover:underline"
              >{{ item.title }}</a
            >
            <span class="num shrink-0 text-[var(--muelle-on-surface-variant)]">
              {{ relativeTime(item.published_on) }}
            </span>
          </li>
        </ul>
        <p
          v-if="form.problem"
          role="alert"
          class="text-sm text-ink-red-7"
          data-gsm-fuente-problema
        >
          {{ form.problem }}
        </p>
        <div v-if="form.name" class="flex items-center justify-between gap-2">
          <button
            type="button"
            :class="['press', BTN.tonal]"
            :disabled="form.busy || !form.enabled"
            data-gsm-fuente-revisar
            @click="runCheck"
          >
            <span class="lucide-refresh-cw size-4" aria-hidden="true" />
            {{ __('Read now', null, 'Gsm') }}
          </button>
          <button
            v-if="!form.confirmDelete"
            type="button"
            class="press flex size-12 items-center justify-center rounded-full text-ink-gray-7 [@media(hover:hover)]:hover:bg-surface-gray-2"
            :aria-label="__('Delete source', null, 'Gsm')"
            :title="__('Delete source', null, 'Gsm')"
            :disabled="form.busy"
            @click="form.confirmDelete = true"
          >
            <span class="lucide-trash-2 size-5" aria-hidden="true" />
          </button>
          <button
            v-else
            type="button"
            :class="['press', BTN.text, 'text-ink-red-7']"
            :disabled="form.busy"
            data-gsm-fuente-borrar
            @click="runDelete"
          >
            {{ __('Delete', null, 'Gsm') }}
          </button>
        </div>
      </div>
      <template #actions>
        <button
          v-if="!form.name"
          type="button"
          :class="['press', BTN.text]"
          @click="closeForm"
        >
          {{ __('Cancel', null, 'Gsm') }}
        </button>
        <button
          type="button"
          :class="['press', BTN.filled]"
          :disabled="form.busy || !formOk"
          data-gsm-fuente-guardar
          @click="runSave"
        >
          {{ __('Save and read', null, 'Gsm') }}
        </button>
      </template>
    </BottomSheet>
  </div>
</template>
<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'frappe-ui'
import {
  AppBar,
  BottomSheet,
  EmptyState,
  Fab,
  Field,
  ListRow,
  StatusChip,
  Switch,
} from '@/components/ui'
import { chipClass } from '@/components/ui/chipClass'
import { BTN } from '@/documentos/tools'
import { problemOf } from '@/composables/useCompras'
import { relativeTime } from '@/utils/display'
import {
  KINDS,
  VIEWS,
  checkReceipt,
  fuentesApi,
  guessKind,
  inView,
  normalizeView,
  rowSubtitle,
  stateChip,
  suggestTitle,
} from '@/composables/useGsmFuentes'

const route = useRoute()
const router = useRouter()
const view = ref(normalizeView(route.query.vista))
const rows = ref([])
const counts = ref({})
const suggestedMissing = ref(0)
const loading = ref(false)
const loaded = ref(false)
const busy = ref(false)
const guard = ref(null)
const form = reactive(blankForm())
let ticket = 0

function blankForm() {
  return {
    open: false,
    name: '',
    title: '',
    url: '',
    kind: 'feed',
    kindTouched: false,
    titleTouched: false,
    link_prefix: '',
    enabled: true,
    on_site: true,
    busy: false,
    problem: '',
    confirmDelete: false,
  }
}

const scopes = computed(() =>
  VIEWS.map((v) => ({
    value: v.value,
    label: __(v.label, null, 'Gsm'),
    count: counts.value[v.key] ?? undefined,
  })),
)
const title = computed(
  () =>
    ({
      todas: __('News sources', null, 'Gsm'),
      activas: __('Active sources', null, 'Gsm'),
      con_fallas: __('Failing sources', null, 'Gsm'),
    })[view.value],
)
const shown = computed(() => rows.value.filter((r) => inView(r, view.value)))
const current = computed(() =>
  form.name ? rows.value.find((r) => r.name === form.name) : null,
)
const formOk = computed(
  () =>
    form.url.trim().length > 3 &&
    form.title.trim().length > 0 &&
    (form.kind !== 'page' || form.link_prefix.replace(/[/\s]/g, '').length > 0),
)

async function load() {
  const mine = ++ticket
  loading.value = true
  guard.value = null
  try {
    const result = await fuentesApi('sources')
    if (mine !== ticket) return
    rows.value = result.sources || []
    counts.value = result.counts || {}
    suggestedMissing.value = Number(result.suggested_missing) || 0
    loaded.value = true
  } catch (error) {
    if (mine !== ticket) return
    const p = problemOf(error)
    guard.value = {
      title:
        p.kind === 'permission'
          ? __('You cannot manage the news sources', null, 'Gsm')
          : __('Could not load the sources', null, 'Gsm'),
      detail: p.detail,
      retry: p.kind !== 'permission',
    }
  } finally {
    if (mine === ticket) loading.value = false
  }
}

function setView(value) {
  view.value = normalizeView(value)
  router.replace({ query: view.value === 'todas' ? {} : { vista: view.value } })
}

function openNew() {
  Object.assign(form, blankForm(), { open: true })
}
function openRow(row) {
  Object.assign(form, blankForm(), {
    open: true,
    name: row.name,
    title: row.title,
    url: row.url,
    kind: row.kind,
    kindTouched: true,
    titleTouched: true,
    link_prefix: row.link_prefix,
    enabled: row.enabled,
    on_site: row.on_site,
  })
}
function closeForm() {
  form.open = false
}
function onUrl(value) {
  if (!form.kindTouched) form.kind = guessKind(value, form.link_prefix)
  if (!form.titleTouched) form.title = suggestTitle(value)
}
function setKind(value) {
  form.kind = value
  form.kindTouched = true
}

async function runSave() {
  form.busy = true
  form.problem = ''
  try {
    const out = await fuentesApi('save', {
      name: form.name || undefined,
      title: form.title,
      url: form.url,
      kind: form.kind,
      link_prefix: form.link_prefix,
      enabled: form.enabled ? 1 : 0,
      on_site: form.on_site ? 1 : 0,
    })
    const receipt = checkReceipt(out.result)
    form.name = out.name
    await load()
    if (receipt.ok) {
      toast.success(receipt.line || __('Source saved', null, 'Gsm'))
      form.open = false
    } else {
      // saved, but it could not be read: the sheet stays with the reason and the row's state
      form.problem = receipt.line
    }
  } catch (error) {
    form.problem = problemOf(error).detail
  } finally {
    form.busy = false
  }
}
async function runCheck() {
  form.busy = true
  form.problem = ''
  try {
    const out = await fuentesApi('check', { name: form.name })
    const receipt = checkReceipt(out.result)
    await load()
    if (receipt.ok) toast.success(receipt.line)
    else form.problem = receipt.line
  } catch (error) {
    form.problem = problemOf(error).detail
  } finally {
    form.busy = false
  }
}
async function runDelete() {
  form.busy = true
  try {
    await fuentesApi('remove', { name: form.name })
    toast.success(__('Source deleted', null, 'Gsm'))
    form.open = false
    await load()
  } catch (error) {
    form.problem = problemOf(error).detail
  } finally {
    form.busy = false
  }
}
async function addSuggested() {
  busy.value = true
  try {
    const out = await fuentesApi('add_suggested')
    toast.success(
      out.added === 1
        ? __('1 source added', null, 'Gsm')
        : __('{0} sources added', [out.added], 'Gsm'),
    )
    await load()
  } catch (error) {
    toast.error(problemOf(error).detail)
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>
