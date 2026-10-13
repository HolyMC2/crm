<template>
  <div ref="root" class="pb-2" data-approval-list>
    <!-- Kinds: one deliberate horizontal chip row (it scrolls on its own at 390 px). -->
    <div
      v-if="chips.length > 2 || state.kind"
      class="flex gap-2 overflow-x-auto px-4 pb-3 sm:px-6"
      role="group"
      :aria-label="__('Kind of request')"
    >
      <button
        v-for="chip in chips"
        :key="chip.key"
        type="button"
        class="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm sm:min-h-8"
        :class="
          chip.active
            ? 'border-outline-gray-5 bg-surface-gray-3 font-semibold text-ink-gray-9'
            : 'border-outline-gray-2 bg-surface-base text-ink-gray-7 hover:bg-surface-gray-2'
        "
        :aria-pressed="chip.active ? 'true' : 'false'"
        @click="selectKind(chip.key)"
      >
        {{ chip.label }}
        <span
          v-if="chip.count"
          class="rounded-full bg-surface-gray-2 px-1.5 text-xs text-ink-gray-7"
          >{{ chip.count }}</span
        >
      </button>
    </div>
    <div
      v-for="kind in failed"
      :key="kind.key"
      role="alert"
      class="mx-4 mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-surface-amber-1 p-3 text-sm text-ink-amber-9 sm:mx-6"
    >
      <span class="min-w-0 flex-1">{{
        __('We could not check {0}. The rest of the list is up to date.', [
          kind.label,
        ])
      }}</span>
      <Button
        class="min-h-11 sm:min-h-8"
        :label="__('Retry')"
        @click="load()"
      />
    </div>
    <div
      v-if="notice"
      role="status"
      class="mx-4 mb-2 rounded-lg bg-surface-green-1 p-3 text-sm text-ink-green-8 sm:mx-6"
    >
      {{ notice }}
    </div>
    <div
      v-if="problem"
      role="alert"
      class="mx-4 mb-3 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7 sm:mx-6"
    >
      <strong>{{ problem.title }}.</strong> {{ problem.detail }}
      <Button class="ml-2" :label="__('Retry')" @click="load()" />
    </div>

    <div
      v-if="loading && !loaded"
      role="status"
      class="px-6 py-8 text-sm text-ink-gray-6"
    >
      {{ __('Loading…') }}
    </div>
    <template v-else-if="loaded">
      <div
        v-if="!rows.length"
        class="mx-auto max-w-md px-6 py-10 text-center text-ink-gray-7"
      >
        <p class="text-lg font-semibold">{{ empty.title }}</p>
        <p v-if="empty.detail" class="mt-1 text-sm">{{ empty.detail }}</p>
        <Button
          v-if="empty.action"
          class="mt-4 min-h-11 sm:min-h-8"
          :label="empty.action.label"
          @click="empty.action.run"
        />
      </div>
      <article
        v-for="row in rows"
        :key="rowKey(row)"
        :data-row="`${row.doctype}:${row.name}`"
        tabindex="-1"
        class="border-b border-outline-gray-1 px-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link sm:px-6"
        :class="row.state === 'resolved' ? 'bg-surface-gray-1' : ''"
      >
        <component
          :is="linkOf(row).is"
          v-bind="linkOf(row).attrs"
          class="block min-w-0 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
          @click="remember(row)"
        >
          <p class="flex flex-wrap items-center gap-2 text-xs">
            <span
              class="rounded bg-surface-gray-2 px-1.5 py-0.5 font-medium text-ink-gray-7"
              >{{ row.kind_label }}</span
            >
            <span
              v-if="row.state === 'resolved'"
              class="rounded bg-surface-green-1 px-1.5 py-0.5 font-medium text-ink-green-8"
              >{{ __('Already settled') }}</span
            >
          </p>
          <p class="mt-1 line-clamp-2 text-base text-ink-gray-9">
            {{ row.title }}
          </p>
          <p v-if="row.detail" class="mt-0.5 text-sm text-ink-gray-7">
            {{ row.detail }}
          </p>
          <p
            v-if="requestText(row, state.segment)"
            class="mt-0.5 text-sm text-ink-gray-5"
          >
            {{ requestText(row, state.segment) }}
          </p>
        </component>
        <div
          v-if="row.guard"
          class="mt-2 flex flex-wrap items-center gap-2 rounded-lg p-2 text-sm"
          :class="
            row.state === 'resolved'
              ? 'bg-surface-gray-2 text-ink-gray-8'
              : 'bg-surface-amber-1 text-ink-amber-9'
          "
          role="note"
        >
          <span class="min-w-0 flex-1">{{ row.guard.message }}</span>
          <Button
            v-for="action in row.guard.actions"
            :key="action.label"
            class="min-h-11 sm:min-h-8"
            :label="action.label"
            :loading="busy.has(rowKey(row))"
            @click="runGuard(row, action)"
          />
        </div>
        <div
          v-if="rowActions(row, state.segment).length"
          class="mt-2 flex flex-wrap gap-2"
        >
          <Button
            v-for="action in rowActions(row, state.segment)"
            :key="action.key"
            class="min-h-11 sm:min-h-8"
            :variant="action.key === 'settle' ? 'solid' : 'subtle'"
            :label="action.label"
            :loading="busy.has(rowKey(row)) && action.key === 'settle'"
            @click="act(row, action.key)"
          />
        </div>
      </article>
      <div v-if="hasMore" class="px-4 py-3 sm:px-6">
        <Button
          class="min-h-11 sm:min-h-8"
          :label="__('Load more')"
          :loading="loading"
          @click="load(rows.length)"
        />
      </div>
    </template>
    <DeclineDialog
      :model-value="Boolean(declining)"
      :todo="declining?.ask || ''"
      :title="declining?.title || ''"
      @update:model-value="(open) => !open && (declining = null)"
      @declined="declined"
    />
  </div>
</template>
<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, toast } from 'frappe-ui'
import DeclineDialog from '@/components/pendientes/DeclineDialog.vue'
import { toQuery } from '@/composables/usePendientes'
import {
  approvalArgs,
  approvalError,
  approvalTarget,
  aprobacionesApi,
  countText,
  doneOf,
  requestId,
  requestText,
  rowActions,
  rowKey,
  withoutDoneQuery,
} from '@/composables/useAprobaciones'

// «Por aprobar» / «Esperando respuesta»: rows the owners report (Gastos,
// Compras, Asistencia, WhatsApp…), oldest request first. A row opens its
// owner's screen, which decides and comes back with `done`; the list then
// says «Listo» and moves the focus to the next row.
const props = defineProps({
  state: { type: Object, required: true },
})
const emit = defineEmits(['loaded', 'segment'])
const route = useRoute(),
  router = useRouter()
const answer = reactive({ kinds: [], count: null }),
  rows = ref([]),
  hasMore = ref(false),
  loading = ref(false),
  loaded = ref(false),
  problem = ref(null),
  notice = ref(''),
  busy = reactive(new Set()),
  declining = ref(null),
  root = ref(null)
const OPENED = 'muelle:aprobaciones:opened'

const failed = computed(() => answer.kinds.filter((kind) => kind.failed))
const chips = computed(() => [
  {
    key: '',
    label: __('All'),
    count: countText(answer.count),
    active: !props.state.kind,
  },
  // Kinds with something waiting (or the one picked); empty ones stay out of the way.
  ...answer.kinds
    .filter(
      (kind) =>
        !kind.failed && (kind.count > 0 || props.state.kind === kind.key),
    )
    .map((kind) => ({
      key: kind.key,
      label: kind.label,
      count: countText({ value: kind.count, capped: kind.capped }),
      active: props.state.kind === kind.key,
    })),
])
const empty = computed(() => {
  if (props.state.kind || props.state.q)
    return {
      title: __('Nothing matches these filters.'),
      action: {
        label: __('Clear filters'),
        run: () => update({ kind: '', q: '' }),
      },
    }
  if (props.state.segment === 'waiting')
    return {
      title: __('You are not waiting for any answer'),
      detail: __(
        'When you ask someone to approve something, it shows here until they answer.',
      ),
    }
  return {
    title: __('You have nothing to approve'),
    detail: __('When someone asks you to decide something, it shows here.'),
    action: {
      label: __('See what you asked for'),
      run: () => emit('segment', 'waiting'),
    },
  }
})

function linkOf(row) {
  const target = approvalTarget(row, props.state)
  if (target?.to) return { is: 'RouterLink', attrs: { to: target.to } }
  if (target?.href) return { is: 'a', attrs: { href: target.href } }
  return { is: 'div', attrs: {} }
}

function update(patch) {
  router.replace({
    name: 'Pendientes',
    query: toQuery({ ...props.state, ...patch }),
  })
}
function selectKind(kind) {
  update({ kind })
}

// Where the person was, so coming back puts the focus on the next row.
function remember(row) {
  try {
    sessionStorage.setItem(
      OPENED,
      JSON.stringify({
        key: `${row.doctype}:${row.name}`,
        index: rows.value.indexOf(row),
        title: row.title,
      }),
    )
  } catch {
    /* private storage */
  }
}
function opened() {
  try {
    return JSON.parse(sessionStorage.getItem(OPENED) || 'null')
  } catch {
    return null
  }
}

let generation = 0
async function load(start = 0) {
  const current = ++generation
  loading.value = true
  problem.value = null
  try {
    const page = await aprobacionesApi(
      'queue',
      approvalArgs(props.state, start),
    )
    if (current !== generation) return
    answer.kinds = page.kinds || []
    answer.count = page.count || null
    rows.value = start ? [...rows.value, ...page.rows] : page.rows || []
    hasMore.value = Boolean(page.has_more)
    loaded.value = true
    emit('loaded')
    if (!start) await afterReturn()
  } catch (error) {
    if (current === generation) problem.value = approvalError(error)
  } finally {
    if (current === generation) loading.value = false
  }
}

function focusRow(index) {
  const list = rows.value
  if (!list.length) return
  const row = list[Math.min(Math.max(index, 0), list.length - 1)]
  const key = `${row.doctype}:${row.name}`
  const element = [...(root.value?.querySelectorAll('[data-row]') || [])].find(
    (item) => item.dataset.row === key,
  )
  if (!element) return
  element.focus({ preventScroll: true })
  element.scrollIntoView?.({ block: 'nearest' })
}

// Back from an owner screen with `done=<doctype>:<name>`: a settled row has left
// («Listo», focus on the next); one still waiting keeps the focus.
async function afterReturn() {
  const done = doneOf(route.query)
  if (!done) return
  const key = `${done.doctype}:${done.name}`
  const before = opened()
  const index = rows.value.findIndex(
    (row) => `${row.doctype}:${row.name}` === key,
  )
  await nextTick()
  // After the page restored its scroll position (two frames).
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (index >= 0) focusRow(index)
      else focusRow(before?.key === key ? before.index : 0)
    }),
  )
  if (index < 0)
    notice.value = __('Done: {0}', [
      before?.key === key && before.title ? before.title : done.name,
    ])
  router.replace({ name: 'Pendientes', query: withoutDoneQuery(route.query) })
}

async function call(row, method, args) {
  const key = rowKey(row)
  busy.add(key)
  try {
    const result = await aprobacionesApi(method, args)
    // Owner endpoints answer {ok, message} instead of raising (Asistencia).
    if (result?.ok === false) toast.error(result.message)
    else if (result?.message) toast.success(result.message)
    return result
  } catch (error) {
    const reason = approvalError(error)
    toast.error(`${reason.title}. ${reason.detail}`)
    return null
  } finally {
    busy.delete(key)
  }
}

async function runGuard(row, action) {
  if (action.kind === 'route') {
    const target = approvalTarget({ url: action.target }, props.state)
    remember(row)
    if (target?.to) return router.push(target.to)
    if (target?.href) return window.location.assign(target.href)
    return
  }
  if (action.kind === 'call') {
    const ours = action.target.startsWith('doco.pendientes.aprobaciones.')
    const args = { ...(action.args || {}) }
    if (ours) args.request_id = requestId()
    const result = await call(row, action.target, args)
    if (result) {
      if (ours) notice.value = __('Removed from your list: {0}', [row.title])
      load()
    }
    return
  }
  load()
}

async function act(row, key) {
  if (key === 'decline') {
    declining.value = row
    return
  }
  if (key === 'settle') {
    const result = await call(row, 'settle', {
      todo: row.ask,
      request_id: requestId(),
    })
    if (result) {
      notice.value = __('Done: {0}', [row.title])
      load()
    }
  }
}

function declined() {
  const row = declining.value
  declining.value = null
  notice.value = __('Not approved: {0}. We told who asked.', [row?.title || ''])
  load()
}

// Each value on its own: a return that only drops `done` must not reload.
watch(
  [() => props.state.segment, () => props.state.kind, () => props.state.q],
  () => {
    loaded.value = false
    rows.value = []
    notice.value = ''
    load()
  },
  { immediate: true },
)
defineExpose({ reload: load })
</script>
