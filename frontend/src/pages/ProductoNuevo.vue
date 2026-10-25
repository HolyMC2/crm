<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col" data-producto-nuevo>
    <PageHeader
      :title="__('New product', null, 'Productos')"
      :subtitle="
        __(
          'Only what you need to sell it: name, group and price. Photos, labels and stock come next, on the product.',
          null,
          'Productos',
        )
      "
      :level="1"
    />
    <p v-if="!boot" role="status" class="px-6 py-8 text-sm text-ink-gray-6">
      {{ __('Loading products…') }}
    </p>
    <section
      v-else-if="guard"
      role="alert"
      class="mx-auto w-full max-w-xl space-y-4 p-6"
    >
      <h1 class="text-xl font-semibold">
        {{ __('Productos is not available') }}
      </h1>
      <p class="text-base text-ink-gray-7">{{ guard }}</p>
      <div class="flex flex-wrap gap-2">
        <Button
          :label="__('Retry permissions')"
          @click="loadProductosBoot({ refresh: true })"
        />
        <Button :label="__('Back', null, 'Productos')" @click="leave" />
      </div>
    </section>
    <section
      v-else-if="!canCreate"
      role="status"
      class="mx-auto w-full max-w-xl space-y-4 p-6"
      data-nuevo-sin-permiso
    >
      <h1 class="text-xl font-semibold">
        {{ __('You cannot add products here', null, 'Productos') }}
      </h1>
      <p class="text-base text-ink-gray-7">
        {{
          __(
            'Ask your manager for permission to add products.',
            null,
            'Productos',
          )
        }}
      </p>
      <div class="flex flex-wrap gap-2">
        <Button
          :label="__('Copy request', null, 'Productos')"
          @click="copyRequest"
        />
        <Button :label="__('Back', null, 'Productos')" @click="leave" />
      </div>
      <p v-if="copied" role="status" class="text-sm text-ink-gray-6">
        {{ copied }}
      </p>
    </section>
    <form
      v-else
      class="flex min-h-0 flex-1 flex-col"
      novalidate
      @submit.prevent="save"
    >
      <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6">
        <div class="mx-auto w-full max-w-xl space-y-5">
          <div data-field="item_name">
            <FormControl
              v-model="form.item_name"
              type="text"
              maxlength="140"
              required
              :label="__('Name', null, 'Productos')"
              :placeholder="
                __('For example: pink silicone case', null, 'Productos')
              "
              :error="problems.item_name"
            />
          </div>
          <div data-field="item_group" class="space-y-1">
            <Link
              v-model="form.item_group"
              doctype="Item Group"
              :filters="{ is_group: 0 }"
              :label="__('Group', null, 'Productos')"
            />
            <p v-if="problems.item_group" class="text-sm text-ink-red-7">
              {{ problems.item_group }}
            </p>
          </div>
          <div data-field="rate">
            <FormControl
              v-model="form.rate"
              type="text"
              inputmode="decimal"
              required
              :label="__('Selling price (MXN)', null, 'Productos')"
              :description="priceHint"
              :error="problems.rate"
            />
          </div>
          <div data-field="barcode">
            <FormControl
              v-model="form.barcode"
              type="text"
              maxlength="40"
              :label="__('Barcode (optional)', null, 'Productos')"
              :description="
                __('If it is printed on the package.', null, 'Productos')
              "
              :error="problems.barcode"
            />
          </div>
          <section
            v-if="similar.length"
            role="status"
            class="rounded-lg bg-surface-amber-1 p-3 text-sm text-ink-amber-7"
            data-nuevo-parecidos
          >
            <p class="font-medium">
              {{
                __(
                  'Products like this already exist. Check them before you add one.',
                  null,
                  'Productos',
                )
              }}
            </p>
            <!-- A new tab: the entry on this page stays as it is. -->
            <ul class="mt-1 space-y-1">
              <li v-for="row in similar" :key="row.key || row.name">
                <RouterLink
                  :to="productRoute(row)"
                  target="_blank"
                  rel="noopener"
                  class="underline"
                  >{{ row.title }}</RouterLink
                >
              </li>
            </ul>
          </section>
          <div>
            <Button
              class="min-h-11"
              variant="ghost"
              :aria-expanded="showMore ? 'true' : 'false'"
              :label="
                showMore
                  ? __('Hide details', null, 'Productos')
                  : __('More details (optional)', null, 'Productos')
              "
              @click="showMore = !showMore"
            />
          </div>
          <template v-if="showMore">
            <Link
              v-model="form.brand"
              doctype="Brand"
              :label="__('Brand', null, 'Productos')"
            />
            <FormControl
              v-model="form.description"
              type="textarea"
              :label="__('Description', null, 'Productos')"
            />
          </template>
          <div
            v-if="problem"
            role="alert"
            class="rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
            data-nuevo-error
          >
            <p class="font-medium">{{ problem.title }}</p>
            <p>{{ problem.detail }}</p>
            <Button
              v-if="problem.action"
              class="mt-2 min-h-11 sm:min-h-8"
              :label="problem.action"
              @click="problem.kind === 'permission' ? copyRequest() : save()"
            />
            <p v-if="copied" role="status" class="mt-2">{{ copied }}</p>
          </div>
        </div>
      </div>
      <footer
        class="flex shrink-0 items-center justify-between gap-2 border-t border-outline-gray-2 bg-surface-base px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-6"
      >
        <Button
          class="min-h-11 sm:min-h-8"
          :label="__('Cancel', null, 'Productos')"
          @click="leave"
        />
        <Button
          class="min-h-11 flex-1 sm:min-h-8 sm:flex-none"
          variant="solid"
          type="submit"
          :label="__('Save product', null, 'Productos')"
          :loading="saving"
        />
      </footer>
    </form>
  </div>
</template>
<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Button, FormControl } from 'frappe-ui'
import Link from '@/components/Controls/Link.vue'
import { PageHeader } from '@/components/ui'
import {
  loadProductosBoot,
  money,
  newItemDraft,
  newItemPayload,
  newItemProblems,
  outcomeUnknown,
  parseRate,
  productRoute,
  productosApi,
  productosBoot,
  problemOf,
  requestId,
} from '@/composables/useProductos'

// Nuevo producto: the least needed to sell an item. One call creates the item
// and its first price; a retry with the same request id creates nothing new.
const route = useRoute()
const router = useRouter()
const boot = productosBoot
const form = reactive(newItemDraft(route.query))
const showMore = ref(false)
const problems = ref({})
const problem = ref(null)
const saving = ref(false)
const copied = ref('')
const similar = ref([])
let rid = null
let sentKey = ''
let lookupTimer = 0
let lookupTicket = 0

// The same rule as the list: a disabled module says why, and retries.
const guard = computed(() =>
  boot.value && !boot.value.enabled
    ? boot.value.reason ||
      __('Ask your manager for permission to read items, then retry.')
    : '',
)
const canCreate = computed(() => Boolean(boot.value?.capabilities?.create_item))
const priceHint = computed(() => {
  const rate = parseRate(form.rate)
  return rate > 0 ? __('Sells at {0}', [money(rate)], 'Productos') : ''
})

function leave() {
  router.push({ name: 'Productos' })
}

async function copyRequest() {
  const text = __(
    'I need permission to add products in Productos.',
    null,
    'Productos',
  )
  try {
    await navigator.clipboard.writeText(text)
    copied.value = __('Request copied.', null, 'Productos')
  } catch {
    copied.value = text
  }
}

// Once a problem is shown, each change checks the form again, so a message
// goes away as soon as its field is right.
watch(
  form,
  () => {
    if (Object.keys(problems.value).length)
      problems.value = newItemProblems(form)
  },
  { deep: true },
)

function focusFirstProblem() {
  const [field] = Object.keys(problems.value)
  nextTick(() =>
    document
      .querySelector(
        `[data-field="${field}"] input, [data-field="${field}"] textarea`,
      )
      ?.focus(),
  )
}

// A refusal is a refusal: the worker asks for the change. An unknown outcome
// keeps the request id, so «Check result» sends the same product again and the
// server answers with what it already did.
function creationProblem(error) {
  const found = problemOf(error)
  return found.kind === 'permission'
    ? { ...found, action: __('Copy request', null, 'Productos') }
    : found
}

async function save() {
  if (saving.value) return
  problem.value = null
  problems.value = newItemProblems(form)
  if (Object.keys(problems.value).length) return focusFirstProblem()
  const key = JSON.stringify(newItemPayload(form, '').data)
  if (!rid || key !== sentKey) rid = requestId()
  sentKey = key
  saving.value = true
  try {
    const created = await productosApi('create_item', newItemPayload(form, rid))
    // The record opens with a notice and the next step, creating another.
    router.replace({
      name: 'Producto',
      params: { item: created.name },
      query: { creado: '1' },
    })
  } catch (error) {
    problem.value = creationProblem(error)
    if (!outcomeUnknown(error)) rid = null
  } finally {
    saving.value = false
  }
}

// Products that look alike, while the worker types. A hint, never a block: two
// products can share a name, and a barcode from Escáner may belong to nothing yet.
async function findSimilar(search) {
  const mine = ++lookupTicket
  try {
    const page = await productosApi('queue', {
      view: 'todos',
      search,
      store: '',
      start: 0,
      page_length: 3,
    })
    if (mine === lookupTicket) similar.value = page.rows || []
  } catch {
    if (mine === lookupTicket) similar.value = []
  }
}
watch(
  () => [form.item_name.trim(), form.barcode.trim()],
  ([name, code]) => {
    window.clearTimeout(lookupTimer)
    lookupTicket += 1
    const search = code.length >= 3 ? code : name.length >= 3 ? name : ''
    if (!search) {
      similar.value = []
      return
    }
    lookupTimer = window.setTimeout(() => findSimilar(search), 400)
  },
  { immediate: true },
)

onMounted(() => loadProductosBoot())
onBeforeUnmount(() => window.clearTimeout(lookupTimer))
</script>
