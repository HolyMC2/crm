<template>
  <div class="min-w-0 space-y-5 p-3 text-ink-gray-8 sm:p-6">
    <header class="space-y-2">
      <h2 class="text-xl font-semibold">{{ __('Effective configuration') }}</h2>
      <p class="text-sm text-ink-gray-6">
        {{
          __(
            'Review saved settings and their sources for this sales scope. Explicit record values and native permissions still apply. Unsaved editor drafts are not included.',
          )
        }}
      </p>
    </header>
    <form class="grid gap-3 sm:grid-cols-2" @submit.prevent="load">
      <label class="space-y-1 text-sm"
        ><span>{{ __('Company scope (optional)') }}</span
        ><input
          v-model="company"
          class="effective-input"
          :disabled="loading"
          list="effective-companies"
          :placeholder="__('Global scope')" /><datalist
          id="effective-companies"
        >
          <option
            v-for="name in companies"
            :key="name"
            :value="name"
          /></datalist
      ></label>
      <label class="space-y-1 text-sm"
        ><span>{{ __('Sales pipeline') }}</span
        ><select v-model="pipeline" class="effective-input" :disabled="loading">
          <option value="">{{ __('Resolve the scope default') }}</option>
          <option v-for="item in choices" :key="item.name" :value="item.name">
            {{ item.label }}{{ item.company ? ` · ${item.company}` : '' }}
          </option>
        </select></label
      >
      <button
        type="submit"
        class="effective-button sm:col-span-2"
        :disabled="loading"
      >
        {{
          loading
            ? __('Loading configuration…')
            : __('Review saved configuration')
        }}
      </button>
    </form>
    <p v-if="error" role="alert" class="text-sm">{{ error }}</p>
    <template v-if="result">
      <p class="text-sm text-ink-gray-6">
        {{ __('Showing saved scope') }}:
        {{ result.scope.company || __('Global') }} ·
        {{ result.sections.pipeline.values?.label || __('Default pipeline') }}
      </p>
      <p v-if="result.choices.state === 'denied'" role="status">
        {{ __('Pipeline choices are restricted by your permissions.') }}
      </p>
      <p v-else-if="result.choices.state === 'unavailable'" role="status">
        {{
          __(
            'Pipeline choices could not be loaded. Retry the configuration review.',
          )
        }}
      </p>
      <p v-if="result.choices.truncated" role="status">
        {{
          __(
            'The pipeline list is limited. Narrow the company scope or open Sales pipelines for more records.',
          )
        }}
      </p>
      <section
        class="effective-section"
        :aria-label="__('Pipeline and defaults')"
      >
        <h3 class="text-lg font-semibold">{{ __('Pipeline and defaults') }}</h3>
        <p v-if="sections.pipeline.state !== 'configured'">
          {{ stateText(sections.pipeline.state) }}
        </p>
        <template v-else>
          <p class="font-medium">
            {{ sections.pipeline.values.label }}
            <span v-if="sections.pipeline.values.archived"
              >· {{ __('Archived') }}</span
            >
          </p>
          <p
            v-if="sections.pipeline.values.selection"
            class="text-sm text-ink-gray-6"
          >
            {{
              sections.pipeline.values.selection === 'explicit'
                ? __('Explicitly selected pipeline')
                : __('Pipeline resolved from the scope default')
            }}
          </p>
          <dl class="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt>{{ __('Pipeline company') }}</dt>
              <dd>
                {{
                  sections.pipeline.values.company ||
                  __('Global; the record company still applies')
                }}
              </dd>
            </div>
            <div>
              <dt>{{ __('Currency when a deal has none') }}</dt>
              <dd>
                {{
                  sections.pipeline.values.currency ||
                  __('Not configured in this pipeline')
                }}
              </dd>
            </div>
            <div>
              <dt>{{ __('Probability policy') }}</dt>
              <dd>{{ __(sections.pipeline.values.probability_policy) }}</dd>
            </div>
            <div>
              <dt>{{ __('Pipeline role access') }}</dt>
              <dd>
                {{
                  sections.pipeline.values.roles.length
                    ? sections.pipeline.values.roles.join(', ')
                    : __(
                        'All CRM sales roles; native record access still applies',
                      )
                }}
              </dd>
            </div>
          </dl>
          <p class="text-sm">
            {{ policyText(sections.pipeline.values.probability_policy) }}
          </p>
          <p
            v-if="sections.pipeline.values.default.state === 'configured'"
            class="text-sm"
          >
            {{ __('Default for the reviewed company scope') }}:
            {{ sections.pipeline.values.default.label }} ·
            {{
              sections.pipeline.values.default.company || __('Global fallback')
            }}
            ·
            {{
              sections.pipeline.values.default.reason === 'only_pipeline'
                ? __('Only eligible pipeline in that scope')
                : __('Explicit default')
            }}
          </p>
          <p v-else class="text-sm">
            {{ __('Scope default') }}:
            {{ stateText(sections.pipeline.values.default.state) }}
          </p>
          <ul class="space-y-2 text-sm" :aria-label="__('Pipeline stages')">
            <li
              v-for="stage in sections.pipeline.items"
              :key="stage.status"
              class="break-words rounded border border-outline-gray-2 p-2"
            >
              {{ stage.status }} · {{ __(stage.type) }} ·
              {{ stage.probability }}%
              <span v-if="stage.archived">· {{ __('Archived') }}</span
              ><span v-if="stage.has_entry_requirements">
                ·
                {{
                  __(
                    'Entry requirements apply; open the pipeline to review them.',
                  )
                }}</span
              >
            </li>
          </ul>
        </template>
        <SourceLinks :source="sections.pipeline.source" @editor="openEditor" />
      </section>
      <div class="grid gap-4 sm:grid-cols-2">
        <section class="effective-section">
          <h3 class="font-semibold">{{ __('Site business timezone') }}</h3>
          <p>
            {{
              sections.site_timezone.values?.effective_timezone ||
              stateText(sections.site_timezone.state)
            }}
          </p>
          <p
            v-if="sections.site_timezone.values?.uses_framework_fallback"
            role="status"
          >
            {{
              __(
                'No site timezone is saved. The framework fallback shown here is currently in effect; configure the intended business timezone in System Settings.',
              )
            }}
          </p>
          <p class="text-sm text-ink-gray-6">
            {{
              __(
                'Native task dates, SLA calculations and assignment weekdays use site time. This does not combine their separate schedule rules.',
              )
            }}
          </p>
          <SourceLinks
            :source="sections.site_timezone.source"
            @editor="openEditor"
          />
        </section>
        <section class="effective-section">
          <h3 class="font-semibold">{{ __('Your display timezone') }}</h3>
          <p>
            {{
              sections.personal_timezone.values?.effective_timezone ||
              stateText(sections.personal_timezone.state)
            }}
          </p>
          <p
            v-if="sections.personal_timezone.values?.inherits_site"
            class="text-sm"
          >
            {{
              sections.personal_timezone.values.effective_timezone
                ? __('No personal override; inherits the site timezone.')
                : __(
                    'No personal override. Site timezone is not readable with this role.',
                  )
            }}
          </p>
          <p class="text-sm text-ink-gray-6">
            {{
              __(
                'Changing this preference changes your display, not business hours or assignment weekdays.',
              )
            }}
          </p>
          <SourceLinks
            :source="sections.personal_timezone.source"
            @editor="openEditor"
          />
        </section>
        <section class="effective-section">
          <h3 class="font-semibold">{{ __('CRM reporting currency') }}</h3>
          <p>
            {{
              sections.crm_currency.values?.currency ||
              stateText(sections.crm_currency.state)
            }}
          </p>
          <p class="text-sm text-ink-gray-6">
            {{
              __(
                'CRM reporting and exchange conversion use this source. A pipeline currency fills an empty deal currency; it does not replace an explicit deal currency.',
              )
            }}
          </p>
          <SourceLinks
            :source="sections.crm_currency.source"
            @editor="openEditor"
          />
        </section>
        <section class="effective-section">
          <h3 class="font-semibold">{{ __('Sales hierarchy') }}</h3>
          <p>
            {{
              sections.hierarchy.state === 'configured'
                ? sections.hierarchy.values.enable_sales_hierarchy
                  ? __('Enabled')
                  : __('Disabled')
                : stateText(sections.hierarchy.state)
            }}
          </p>
          <p class="text-sm text-ink-gray-6">
            {{
              __(
                'Reporting-tree visibility is additional to role, company, pipeline and native record permissions.',
              )
            }}
          </p>
          <SourceLinks
            :source="sections.hierarchy.source"
            @editor="openEditor"
          />
        </section>
        <section class="effective-section sm:col-span-2">
          <h3 class="font-semibold">{{ __('System defaults') }}</h3>
          <dl
            v-if="sections.system_defaults.state === 'configured'"
            class="grid gap-2 text-sm sm:grid-cols-3"
          >
            <div>
              <dt>{{ __('System currency setting') }}</dt>
              <dd>
                {{
                  sections.system_defaults.values.currency ||
                  __('Not configured')
                }}
              </dd>
            </div>
            <div>
              <dt>{{ __('Date format') }}</dt>
              <dd>
                {{
                  sections.system_defaults.values.date_format ||
                  __('Not configured')
                }}
              </dd>
            </div>
            <div>
              <dt>{{ __('Time format') }}</dt>
              <dd>
                {{
                  sections.system_defaults.values.time_format ||
                  __('Not configured')
                }}
              </dd>
            </div>
          </dl>
          <p v-else>{{ stateText(sections.system_defaults.state) }}</p>
          <p class="text-sm text-ink-gray-6">
            {{
              __(
                'These are site defaults. Record metadata and explicit values can override them; CRM reporting currency is a separate setting.',
              )
            }}
          </p>
          <SourceLinks
            :source="sections.system_defaults.source"
            @editor="openEditor"
          />
        </section>
      </div>
      <section
        class="effective-section"
        :aria-label="__('SLA schedule candidates')"
      >
        <h3 class="text-lg font-semibold">
          {{ __('SLA schedule candidates') }}
        </h3>
        <p class="text-sm text-ink-gray-6">
          {{
            __(
              'These are readable CRM policies, not a schedule selected for this pipeline. Native record type, dates, communication priority and conditions decide applicability. Hours and holiday exceptions belong to each policy.',
            )
          }}
        </p>
        <p v-if="sections.slas.state !== 'configured'">
          {{ stateText(sections.slas.state) }}
        </p>
        <p
          v-if="sections.slas.truncated || sections.slas.warnings?.length"
          role="status"
        >
          {{
            __(
              'This policy summary is incomplete or limited. Open the canonical editor for permitted details and retry failed reads.',
            )
          }}
        </p>
        <SourceLinks :source="sections.slas.source" @editor="openEditor" />
        <details
          v-for="rule in sections.slas.items || []"
          :key="rule.name"
          class="rounded border border-outline-gray-2 p-3"
        >
          <summary
            class="min-h-11 cursor-pointer break-words py-2 font-medium focus-visible:ring-2"
          >
            {{ rule.name }} · {{ __(rule.document_type) }} ·
            {{ rule.enabled ? __('Enabled') : __('Disabled') }}
          </summary>
          <div class="space-y-2 text-sm">
            <p>
              {{ __('Validity') }}:
              {{ rule.start_date || __('No start limit') }} —
              {{ rule.end_date || __('No end limit') }} ·
              {{
                rule.conditional
                  ? __('Record conditions apply')
                  : __('No additional condition expression')
              }}
            </p>
            <p v-if="rule.default">
              {{
                __(
                  'Marked as a default policy; native applicability still decides the record policy.',
                )
              }}
            </p>
            <ul>
              <li v-for="(hours, index) in rule.hours" :key="index">
                {{ __(hours.day) }}: {{ hours.start }} — {{ hours.end }}
              </li>
            </ul>
            <p v-if="!rule.hours.length">
              {{ __('No working hours are configured in this policy.') }}
            </p>
            <p class="font-medium">{{ __('Holiday exceptions') }}</p>
            <p v-if="rule.holiday.state !== 'configured'">
              {{ stateText(rule.holiday.state) }}
            </p>
            <template v-else
              ><p>
                {{ rule.holiday.source.name }} ·
                {{ rule.holiday.values.from_date }} —
                {{ rule.holiday.values.to_date }}
              </p>
              <ul class="flex flex-wrap gap-2">
                <li v-for="(holiday, index) in rule.holiday.items" :key="index">
                  {{ holiday.date
                  }}{{ holiday.weekly_off ? ` · ${__('Weekly off')}` : '' }}
                </li>
              </ul>
              <p v-if="!rule.holiday.items.length">
                {{ __('No holiday dates in this list.') }}
              </p>
              <p v-if="rule.holiday.truncated">
                {{
                  __(
                    'Showing the first 100 dates; open the holiday list for all exceptions.',
                  )
                }}
              </p>
              <SourceLinks :source="rule.holiday.source" @editor="openEditor"
            /></template>
            <SourceLinks :source="rule.source" @editor="openEditor" />
          </div>
        </details>
      </section>
      <section
        class="effective-section"
        :aria-label="__('Assignment weekday candidates')"
      >
        <h3 class="text-lg font-semibold">
          {{ __('Assignment weekday candidates') }}
        </h3>
        <p class="text-sm text-ink-gray-6">
          {{
            __(
              'Assignment rules independently use site weekdays and record conditions. They do not inherit SLA working hours or holidays. Capacity and routing stay in their owning services.',
            )
          }}
        </p>
        <p v-if="sections.assignment.state !== 'configured'">
          {{ stateText(sections.assignment.state) }}
        </p>
        <p
          v-if="
            sections.assignment.truncated ||
            sections.assignment.warnings?.length
          "
          role="status"
        >
          {{
            __(
              'This assignment summary is incomplete or limited. Open Assignment Rules for permitted details and retry failed reads.',
            )
          }}
        </p>
        <SourceLinks
          :source="sections.assignment.source"
          @editor="openEditor"
        />
        <div
          v-for="rule in sections.assignment.items || []"
          :key="rule.name"
          class="space-y-2 rounded border border-outline-gray-2 p-3 text-sm"
        >
          <h4 class="break-words font-medium">
            {{ rule.name }} · {{ __(rule.document_type) }} ·
            {{ rule.enabled ? __('Enabled') : __('Disabled') }}
          </h4>
          <p>
            {{ __(rule.method) }} · {{ __('Priority') }} {{ rule.priority }} ·
            {{
              rule.conditional
                ? __('Record conditions apply')
                : __('No additional condition expression')
            }}
          </p>
          <p>
            {{
              rule.weekdays.length
                ? rule.weekdays.map((day) => __(day)).join(', ')
                : __('No weekday restriction')
            }}
          </p>
          <SourceLinks :source="rule.source" @editor="openEditor" />
        </div>
      </section>
    </template>
  </div>
</template>
<script setup>
import {
  computed,
  defineComponent,
  h,
  onActivated,
  onUnmounted,
  ref,
} from 'vue'
import { call } from 'frappe-ui'
import { activeSettingsPage } from '@/composables/settings'
const result = ref(null),
  loading = ref(false),
  error = ref(''),
  pipeline = ref(''),
  company = ref('')
const sections = computed(() => result.value?.sections || {})
const choices = computed(() => result.value?.choices.pipelines || [])
const companies = computed(() => [
  ...new Set(choices.value.map((item) => item.company).filter(Boolean)),
])
const editorNames = new Set([
  'Sales pipelines',
  'Preferences',
  'Dashboard',
  'Sales Hierarchy',
  'Defaults',
  'SLA Policies',
  'Assignment Rules',
])
function openEditor(name) {
  if (editorNames.has(name)) activeSettingsPage.value = __(name)
}
function stateText(state) {
  return (
    {
      not_configured: __('No readable configuration is saved for this source.'),
      denied: __('Your permissions do not allow reading this configuration.'),
      unavailable: __(
        'This configuration source could not be read. Retry or ask your administrator.',
      ),
    }[state] || __('Configuration unavailable.')
  )
}
function policyText(policy) {
  return (
    {
      Stage: __(
        'Stage probability applies when the deal is validated. Won and Lost outcomes use their canonical closing probabilities.',
      ),
      Manual: __(
        'Explicit deal probabilities are preserved. A missing probability takes the configured stage value.',
      ),
      Legacy: __(
        'Historical probabilities are preserved. New records without a positive probability take the configured stage value.',
      ),
    }[policy] || __('Open the pipeline to review this probability policy.')
  )
}
function sourceUrl(value) {
  return typeof value === 'string' &&
    /^\/app\/[a-z-]+(?:\/[^/?#\\\s]+)?$/.test(value)
    ? value
    : ''
}
const SourceLinks = defineComponent({
  props: { source: { type: Object, default: null } },
  emits: ['editor'],
  setup(props, { emit }) {
    return () =>
      props.source
        ? h(
            'div',
            {
              class:
                'flex flex-wrap items-center gap-2 text-xs text-ink-gray-6',
            },
            [
              h(
                'span',
                { class: 'min-w-0 break-all' },
                `${__('Source')}: ${props.source.doctype}${props.source.name ? ` · ${props.source.name}` : ''}`,
              ),
              sourceUrl(props.source.url)
                ? h(
                    'a',
                    {
                      href: sourceUrl(props.source.url),
                      class:
                        'inline-flex min-h-11 items-center px-2 underline focus-visible:ring-2',
                    },
                    __('Open source'),
                  )
                : null,
              props.source.can_write && editorNames.has(props.source.editor)
                ? h(
                    'button',
                    {
                      type: 'button',
                      class:
                        'min-h-11 rounded border border-outline-gray-2 px-3 focus-visible:ring-2',
                      onClick: () => emit('editor', props.source.editor),
                    },
                    __('Open {0}', [__(props.source.editor)]),
                  )
                : null,
            ],
          )
        : null
  },
})
let epoch = 0
async function load() {
  if (loading.value) return
  const stamp = ++epoch
  loading.value = true
  error.value = ''
  try {
    const data = await call(
      'crm.api.effective_settings.get_effective_settings',
      { pipeline: pipeline.value || null, company: company.value || null },
    )
    if (stamp !== epoch) return
    const keys = [
      'pipeline',
      'site_timezone',
      'personal_timezone',
      'system_defaults',
      'crm_currency',
      'hierarchy',
      'slas',
      'assignment',
    ]
    if (
      !data?.scope ||
      !data.choices ||
      !keys.every((key) =>
        ['configured', 'not_configured', 'denied', 'unavailable'].includes(
          data.sections?.[key]?.state,
        ),
      )
    )
      throw new Error('Incomplete configuration')
    result.value = data
  } catch (failure) {
    if (stamp === epoch)
      error.value = ['PermissionError', 'AuthenticationError'].includes(
        failure?.exc_type || failure?.responseJSON?.exc_type,
      )
        ? __(
            'You cannot review this configuration scope. Check your session and permissions.',
          )
        : __(
            'Configuration could not be loaded. Your selection is preserved; retry the review.',
          )
  } finally {
    if (stamp === epoch) loading.value = false
  }
}
onActivated(load)
onUnmounted(() => {
  epoch++
})
load()
</script>
<style scoped>
.effective-button {
  @apply min-h-11 rounded border border-outline-gray-2 bg-surface-base px-3 py-2 text-sm focus-visible:ring-2 disabled:opacity-50;
}
.effective-input {
  @apply block min-h-11 w-full min-w-0 rounded border border-outline-gray-2 bg-surface-base px-3 text-sm focus-visible:ring-2 disabled:opacity-50;
}
.effective-section {
  @apply min-w-0 space-y-3 rounded border border-outline-gray-2 p-3;
}
dt {
  @apply text-ink-gray-6;
}
dd {
  @apply break-words;
}
</style>
