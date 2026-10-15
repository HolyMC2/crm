<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
    <div
      class="mx-auto w-full max-w-3xl space-y-4 px-4 pb-28 pt-4 sm:px-6 sm:pb-10"
    >
      <nav>
        <router-link
          :to="archivosLink"
          class="inline-flex min-h-11 items-center gap-1 text-sm text-ink-gray-7 hover:text-ink-gray-9"
        >
          <FeatherIcon name="arrow-left" class="h-4 w-4" />
          {{ __('Back to Archivos') }}
        </router-link>
      </nav>

      <header class="space-y-3">
        <div class="flex flex-wrap items-start gap-3">
          <div class="min-w-0 flex-1">
            <h1 class="text-2xl font-semibold text-ink-gray-9">
              {{ __('Connections') }}
            </h1>
            <p class="text-sm text-ink-gray-6">
              {{
                __(
                  'Where Archivos brings documents from on its own: your Paperless archive and the mailbox where suppliers send invoices.',
                )
              }}
            </p>
          </div>
          <Button
            v-if="canCreate && data?.connectors?.length"
            variant="solid"
            class="min-h-11 shrink-0 sm:min-h-0"
            :icon-left="creating ? 'x' : 'plus'"
            :label="creating ? __('Close') : __('New connection')"
            :aria-expanded="creating ? 'true' : 'false'"
            @click="toggleCreate"
          />
        </div>
        <FormControl
          v-if="data?.companies?.length > 1"
          class="h-11 sm:h-auto sm:max-w-xs"
          type="select"
          :label="__('Company')"
          :model-value="data.company"
          :options="data.companies.map((c) => ({ value: c, label: c }))"
          @update:model-value="selectCompany"
        />
      </header>

      <div v-if="loading && !data" class="space-y-3" aria-busy="true">
        <div class="h-28 animate-pulse rounded-xl bg-surface-gray-2" />
        <div class="h-28 animate-pulse rounded-xl bg-surface-gray-2" />
      </div>
      <ArchivoGuard
        v-else-if="loadProblem"
        :state="loadProblem"
        @action="onGuard"
      />

      <template v-else-if="data">
        <!-- Guards: what stops the connections, and the next step -->
        <ArchivoGuard
          v-for="guard in guards"
          :key="guard.code"
          :state="guard"
          :copy-text="guard.copyText"
          @action="onGuard"
        />
        <div
          v-if="cap"
          class="space-y-2 rounded-lg border p-4"
          :class="
            cap.full
              ? 'border-outline-amber-2 bg-surface-amber-1'
              : 'border-outline-gray-2'
          "
        >
          <p class="text-base text-ink-gray-8">{{ cap.label }}</p>
          <div
            class="h-2 w-full overflow-hidden rounded-full bg-surface-gray-2"
            role="progressbar"
            :aria-valuenow="cap.percent"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-label="__('Monthly capacity used')"
          >
            <div
              class="h-full rounded-full"
              :class="cap.full ? 'bg-surface-amber-2' : 'bg-surface-gray-7'"
              :style="{ width: `${cap.percent}%` }"
            />
          </div>
          <p v-if="cap.full" class="text-sm text-ink-gray-8">
            {{
              __(
                'The monthly capacity is used up. New documents wait until next month, or until your plan grows.',
              )
            }}
          </p>
        </div>

        <!-- New connection: first the type, then its form -->
        <section
          v-if="canCreate && (creating || !data.connectors.length)"
          class="space-y-3 rounded-xl border border-outline-gray-2 p-4"
          :aria-label="__('New connection')"
        >
          <template v-if="!newType">
            <h2 class="text-lg font-semibold text-ink-gray-9">
              {{
                data.connectors.length
                  ? __('What do you want to connect?')
                  : __('Nothing connected yet. What do you want to connect?')
              }}
            </h2>
            <div class="grid gap-2 sm:grid-cols-2">
              <button
                v-for="option in typeOptions"
                :key="option.value"
                type="button"
                class="flex min-h-16 items-start gap-3 rounded-lg border border-outline-gray-2 p-3 text-left hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-outline-gray-4"
                @click="newType = option.value"
              >
                <FeatherIcon
                  :name="typeIcon(option.value)"
                  class="mt-0.5 h-5 w-5 shrink-0 text-ink-gray-7"
                />
                <span>
                  <span class="block text-base font-medium text-ink-gray-9">{{
                    typeLabel(option.value)
                  }}</span>
                  <span class="block text-sm text-ink-gray-6">{{
                    option.hint
                  }}</span>
                </span>
              </button>
            </div>
          </template>
          <template v-else>
            <div class="flex items-center gap-2">
              <FeatherIcon
                :name="typeIcon(newType)"
                class="h-5 w-5 text-ink-gray-7"
              />
              <h2 class="flex-1 text-lg font-semibold text-ink-gray-9">
                {{ __('New: {0}', [typeLabel(newType)]) }}
              </h2>
            </div>
            <ConnectorForm
              :key="newType"
              :type="newType"
              :company="data.company"
              @saved="onCreated"
              @cancel="cancelCreate"
            />
          </template>
        </section>

        <p
          v-if="!data.connectors.length && !canCreate && data.can_configure"
          class="rounded-lg bg-surface-gray-1 p-4 text-base text-ink-gray-7"
        >
          {{ __('No connections for {0}.', [data.company]) }}
        </p>

        <ConnectorCard
          v-for="connector in data.connectors"
          :key="connector.name"
          :connector="connector"
          :kinds="data.kinds || []"
          :blocked="blocked"
          @updated="onUpdated"
        />

        <div v-if="data.connectors.length" class="pt-2">
          <router-link
            :to="archivosLink"
            class="inline-flex min-h-11 items-center gap-2 rounded border border-outline-gray-2 px-4 text-base text-ink-gray-8 hover:bg-surface-gray-1 sm:min-h-9"
          >
            <FeatherIcon name="inbox" class="h-4 w-4" />
            {{ __('See what came in, in Archivos') }}
          </router-link>
        </div>
      </template>
    </div>
  </div>
</template>
<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, FeatherIcon, FormControl, toast } from 'frappe-ui'
import ArchivoGuard from '@/components/archivos/ArchivoGuard.vue'
import ConnectorCard from '@/components/archivos/conectores/ConnectorCard.vue'
import ConnectorForm from '@/components/archivos/conectores/ConnectorForm.vue'
import { archivosApi, problem } from '@/composables/useArchivos'
import {
  capacity,
  connectorMethod,
  typeIcon,
  typeLabel,
} from '@/utils/archivosConectores'

const route = useRoute(),
  router = useRouter()

const data = ref(null),
  loading = ref(false),
  loadProblem = ref(null),
  creating = ref(false),
  newType = ref('')

const company = computed(() => String(route.query.company || ''))
// Back to Archivos keeps the company the person was looking at.
const archivosLink = computed(() => ({
  name: 'Archivos',
  query: company.value ? { company: company.value } : {},
}))
const blocked = computed(
  () => Boolean(data.value?.stopped) || !data.value?.automation_enabled,
)
const canCreate = computed(
  () => Boolean(data.value?.can_configure) && !blocked.value,
)
const cap = computed(() =>
  data.value?.automation_enabled ? capacity(data.value) : null,
)
const typeOptions = computed(() =>
  (data.value?.types || ['Paperless', 'Mailbox']).map((value) => ({
    value,
    hint:
      value === 'Mailbox'
        ? __('Invoices (XML and PDF) that suppliers send to an email account.')
        : __('Your scanned documents in Paperless, with their text and data.'),
  })),
)

const guards = computed(() => {
  const d = data.value
  if (!d) return []
  const out = []
  if (d.stopped)
    out.push({
      code: 'stopped',
      message: __(
        'Connections are stopped on this site. Muelle support turns them back on; your settings are kept.',
      ),
      actions: [{ label: __('Copy message for support'), kind: 'copy' }],
      copyText: __(
        'The connections of Archivos are stopped on my site. Please turn them back on.',
      ),
    })
  if (!d.automation_enabled)
    out.push({
      code: 'unlicensed',
      message: __(
        'Activate Documents in your plan to connect your archive and your invoice mailbox. Files you already saved stay available.',
      ),
      actions: d.can_configure
        ? [
            {
              label: __('Open my plan'),
              kind: 'route',
              target: '/desk/mi-plan',
            },
          ]
        : [{ label: __('Copy request for an administrator'), kind: 'copy' }],
      copyText: __(
        'Please activate Documents in our Muelle plan so Archivos can connect our archive and invoice mailbox.',
      ),
    })
  if (!d.can_configure)
    out.push({
      code: 'permission',
      message: __(
        'Only an administrator can set up connections. Ask an administrator of your company to connect the archive and the mailbox.',
      ),
      actions: [
        { label: __('Copy request for an administrator'), kind: 'copy' },
        { label: __('Back to Archivos'), kind: 'back' },
      ],
      copyText: __(
        'Please connect our Paperless archive and our invoice mailbox in Archivos, Connections.',
      ),
    })
  return out
})

let seq = 0
async function load() {
  const mine = ++seq
  loading.value = true
  loadProblem.value = null
  try {
    const result = await archivosApi(connectorMethod('overview'), {
      company: company.value || undefined,
    })
    if (mine === seq) data.value = result
  } catch (error) {
    if (mine === seq) loadProblem.value = problem(error)
  } finally {
    if (mine === seq) loading.value = false
  }
}
watch(company, () => {
  creating.value = false
  newType.value = ''
  load()
})
onMounted(load)

function selectCompany(value) {
  router.replace({ query: { ...route.query, company: value || undefined } })
}
function onGuard(action) {
  if (action.kind === 'retry') load()
  else if (action.kind === 'back') router.push(archivosLink.value)
}
function toggleCreate() {
  if (creating.value) cancelCreate()
  else creating.value = true
}
function cancelCreate() {
  creating.value = false
  newType.value = ''
}
function onCreated(connector) {
  data.value = {
    ...data.value,
    connectors: [...data.value.connectors, connector],
  }
  cancelCreate()
  toast.success(__('Connection saved'))
}
function onUpdated(connector) {
  if (!data.value || !connector?.name) return
  data.value = {
    ...data.value,
    connectors: data.value.connectors.map((c) =>
      c.name === connector.name ? { ...c, ...connector } : c,
    ),
  }
}
</script>
