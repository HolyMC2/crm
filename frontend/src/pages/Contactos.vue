<template>
  <ContactosLayout
    :segment="state.segment"
    :segments="segments"
    @select="selectSegment"
  >
    <template #sidebar
      ><Button
        class="c-customize"
        label="Personalizar"
        icon-left="sliders"
        variant="ghost"
        @click="customize = true"
    /></template>
    <header class="c-page-heading">
      <div>
        <h1>{{ title }}</h1>
        <p>Personas, empresas y tu siguiente acción</p>
      </div>
      <!-- Opened from another screen (return_to): the way back, saved or not. -->
      <Button
        v-if="returnTo"
        :label="`Volver a ${returnLabel}`"
        icon-left="arrow-left"
        variant="ghost"
        data-testid="contactos-return"
        @click="goToReturn(router, returnTo)"
      />
      <Button
        v-if="capabilities.create"
        label="Nuevo"
        icon-left="plus"
        variant="solid"
        class="c-new"
        @click="newIdentity = true"
      />
    </header>
    <div class="c-toolbar">
      <FormControl
        v-if="state.segment !== 'followups'"
        ref="searchControl"
        v-model="state.q"
        class="c-search"
        type="text"
        placeholder="Buscar nombre, teléfono, correo o RFC"
        aria-label="Buscar contactos"
      />
      <Button
        v-if="state.segment !== 'followups'"
        label="Filtros"
        icon-left="filter"
        @click="filtersOpen = !filtersOpen"
      />
      <Button
        v-if="state.segment !== 'followups'"
        label="Guardar segmento"
        class="c-save-segment"
        icon-left="bookmark"
        @click="segmentOpen = true"
      />
      <Button
        class="c-mobile-actions-toggle"
        icon="more-horizontal"
        aria-label="Más acciones de Contactos"
        :aria-expanded="mobileActions"
        @click="mobileActions = !mobileActions"
      />
    </div>
    <div v-if="mobileActions" class="c-mobile-actions">
      <Button
        v-if="state.segment !== 'followups'"
        label="Guardar segmento"
        icon-left="bookmark"
        @click="openFromMobileMenu('segment')"
      /><Button
        label="Personalizar"
        icon-left="sliders"
        @click="openFromMobileMenu('customize')"
      />
    </div>
    <div class="c-mobile-segment">
      <FormControl
        type="select"
        aria-label="Lista de contactos"
        :model-value="state.segment"
        :options="segmentOptions"
        @update:model-value="selectSegment"
      />
    </div>
    <div
      v-if="filtersOpen && state.segment !== 'followups'"
      class="c-filter-panel"
    >
      <FormControl
        v-model="state.filters.kind"
        type="select"
        label="Tipo"
        :options="[
          { label: 'Todos', value: '' },
          { label: 'Personas', value: 'person' },
          { label: 'Empresas', value: 'company' },
        ]"
      />
      <FormControl
        v-model="state.filters.role"
        type="select"
        label="Rol"
        :options="[
          { label: 'Todos', value: '' },
          { label: 'Cliente', value: 'customer' },
          { label: 'Proveedor', value: 'supplier' },
        ]"
      />
      <FormControl v-model="state.filters.tags" label="Etiqueta del origen" />
      <FormControl
        v-model="state.filters.missing_phone"
        type="checkbox"
        label="Sin teléfono"
      />
      <FormControl
        v-model="state.filters.disabled"
        type="checkbox"
        label="Deshabilitados"
      />
      <div
        v-if="extraFilterFields.length"
        class="c-extra-filter"
        data-filter="extra"
      >
        <FormControl
          v-model="extraFilter.field"
          type="select"
          :label="__('More details')"
          :options="[
            { label: __('Choose a detail'), value: '' },
            ...extraFilterFields.map((field) => ({
              label: field.label,
              value: field.fieldname,
            })),
          ]"
          data-input="extra-field"
        />
        <template v-if="extraFilterField">
          <FormControl
            v-if="extraFilterField.kind === 'list'"
            v-model="extraFilter.value"
            type="select"
            :label="__('Is')"
            :options="[
              { label: __('Choose an option'), value: '' },
              ...extraFilterField.options.map((option) => ({
                label: option,
                value: option,
              })),
            ]"
            data-input="extra-value"
          />
          <FormControl
            v-else-if="extraFilterField.kind === 'check'"
            v-model="extraFilter.value"
            type="select"
            :label="__('Is')"
            :options="[
              { label: __('Choose'), value: '' },
              { label: __('Yes'), value: '1' },
              { label: __('No'), value: '0' },
            ]"
            data-input="extra-value"
          />
          <FormControl
            v-else-if="extraFilterField.kind === 'text'"
            v-model="extraFilter.value"
            :label="__('Contains')"
            data-input="extra-value"
          />
          <template v-else
            ><FormControl
              v-model="extraFilter.from"
              :type="extraFilterField.kind === 'date' ? 'date' : 'number'"
              :label="__('From')"
              data-input="extra-from" /><FormControl
              v-model="extraFilter.to"
              :type="extraFilterField.kind === 'date' ? 'date' : 'number'"
              :label="__('Up to')"
              data-input="extra-to"
          /></template>
          <Button
            :label="__('Add filter')"
            :disabled="!extraFilterClauses.length"
            data-act="add-extra-filter"
            @click="addExtraFilter"
          />
        </template>
      </div>
      <Button label="Limpiar filtros" @click="clearFilters" />
      <Button
        v-if="legacyReview"
        label="Aplicar este alcance revisado"
        variant="solid"
        @click="applyLegacyReview"
      />
    </div>
    <div
      v-if="activeFilters.length && state.segment !== 'followups'"
      class="c-filter-chips"
    >
      <button
        v-for="chip in activeFilters"
        :key="chip.key"
        :data-chip="chip.key"
        @click="removeChip(chip)"
      >
        {{ chip.label }} <span aria-hidden="true">×</span></button
      ><Button label="Limpiar" variant="ghost" @click="clearFilters" />
    </div>
    <div v-if="legacyBlocked" class="c-recovery" role="alert">
      <strong>Esta vista guardada necesita revisión.</strong>
      <p>
        Sus filtros anteriores no se pueden trasladar con seguridad a esta
        lista. La búsqueda permanece detenida para conservar el alcance.
      </p>
      <div class="c-actions">
        <Button
          label="Editar filtros y revisar alcance"
          @click="reviewLegacy"
        /><Button label="Abrir todos explícitamente" @click="discardLegacy" />
      </div>
    </div>
    <RecoveryMessage
      :error="error || bootError"
      action="ver el directorio de Contactos"
      :on-action="runListGuard"
      :guard-codes="['field_retired']"
      @retry="retry"
    />
    <div v-if="loading" class="c-loading" role="status">Buscando…</div>
    <div ref="scroller" class="c-list-scroll" @scroll="remember">
      <template v-if="state.segment === 'followups'">
        <div class="c-queue-tabs">
          <Button
            :variant="state.taskStatus === 'Open' ? 'solid' : 'ghost'"
            label="Pendientes"
            @click="state.taskStatus = 'Open'"
          /><Button
            :variant="state.taskStatus === 'Closed' ? 'solid' : 'ghost'"
            label="Hechos"
            @click="state.taskStatus = 'Closed'"
          /><Button
            :variant="state.taskStatus === 'Cancelled' ? 'solid' : 'ghost'"
            label="Cancelados"
            @click="state.taskStatus = 'Cancelled'"
          />
        </div>
        <article v-for="task in rows" :key="task.name" class="c-task-row">
          <div>
            <span
              class="c-due"
              :class="{ overdue: dueLabel(task, boot?.today) === 'Vencido' }"
              >{{ dueLabel(task, boot?.today) }}</span
            >
            <h3>{{ plainText(task.description) }}</h3>
            <p>
              {{ formatDay(task.date || task.due_date) || 'Sin fecha' }} ·
              {{ task.reference_label || task.reference_name }}
            </p>
          </div>
          <div class="c-actions">
            <Button label="Abrir registro" @click="openTask(task)" /><Button
              v-if="task.status === 'Open'"
              label="Hecho y siguiente"
              @click="completeTask(task)"
            />
          </div>
        </article>
      </template>
      <template v-else>
        <div v-if="rows.length" class="c-list-head" :style="gridStyle">
          <span>Nombre</span
          ><span v-if="state.columns.includes('roles')">Tipo / roles</span
          ><span v-if="state.columns.includes('phone')">Teléfono / correo</span
          ><span v-if="state.columns.includes('company')">Empresa</span
          ><span v-if="state.columns.includes('next')">Próxima acción</span>
        </div>
        <button
          v-for="row in rows"
          :key="row.source + ':' + row.name"
          class="c-contact-row"
          :class="{
            compact: state.density === 'compact',
            selected: state.selected === row.source + ':' + row.name,
          }"
          :style="gridStyle"
          @click="openRow(row)"
          @pointerenter="hoverRow(row, $event)"
          @pointerleave="hoverRow(null)"
        >
          <span class="c-row-identity"
            ><span class="c-avatar" :class="{ company: row.kind === 'company' }"
              ><FeatherIcon
                :name="
                  row.source === 'address'
                    ? 'map-pin'
                    : row.kind === 'company'
                      ? 'briefcase'
                      : 'user'
                "
                class="h-4 w-4" /></span
            ><span
              ><strong>{{ row.title || row.name }}</strong
              ><small>{{
                row.subtitle || row.fields?.designation || row.name
              }}</small
              ><span v-if="tags(row).length" class="c-tags"
                ><span v-for="tag in tags(row)" :key="tag">{{
                  tag
                }}</span></span
              ></span
            ></span
          >
          <span v-if="state.columns.includes('roles')" class="c-row-roles"
            ><span class="c-type">{{ identityTypeLabel(row) }}</span
            ><small>{{ roleLabel(row) }}</small></span
          >
          <span v-if="state.columns.includes('phone')" class="c-row-channel">{{
            row.fields?.mobile_no ||
            row.fields?.phone ||
            row.fields?.email_id ||
            'Sin canal'
          }}</span>
          <span
            v-if="state.columns.includes('company')"
            class="c-row-company"
            >{{
              row.fields?.company_name || row.fields?.organization || '—'
            }}</span
          >
          <span v-if="state.columns.includes('next')" class="c-row-next">{{
            row.next_action?.label || row.next_followup?.description || '—'
          }}</span>
        </button>
      </template>
      <div v-if="!loading && !rows.length && !error" class="c-empty">
        <FeatherIcon name="users" class="h-8 w-8" />
        <h2>
          {{
            state.q || activeFilters.length
              ? 'No encontramos coincidencias'
              : state.segment === 'followups'
                ? 'Tu lista de seguimientos está al día'
                : 'Aún no hay contactos en esta lista'
          }}
        </h2>
        <p>
          {{
            state.q
              ? 'Prueba otro nombre o un canal secundario.'
              : 'Crea un registro o cambia de lista para continuar.'
          }}
        </p>
        <div class="c-actions">
          <Button label="Limpiar filtros" @click="clearSearch" /><Button
            v-if="capabilities.create"
            label="Nuevo contacto"
            variant="solid"
            @click="newIdentity = true"
          />
        </div>
      </div>
    </div>
    <footer class="c-pagination">
      <span
        >{{ rows.length }} registros en esta página{{
          partial ? ' · Resultados parciales' : ''
        }}</span
      >
      <div class="c-actions">
        <Button
          label="Anterior"
          :disabled="!state.cursorStack.length || loading"
          @click="previousPage"
        /><Button
          label="Siguiente"
          :disabled="!hasMore || loading"
          @click="nextPage"
        />
      </div>
    </footer>
    <IdentityEditor
      v-if="newIdentity"
      v-model="newIdentity"
      :defaults="createDefaults"
      @saved="created"
    />
    <Dialog v-model="segmentOpen" :options="{ title: 'Guardar segmento' }"
      ><template #body-content
        ><div class="c-editor">
          <FormControl v-model="segmentTitle" label="Nombre *" /><FormControl
            v-model="segmentVisibility"
            type="select"
            label="Visibilidad"
            :options="
              capabilities.manager
                ? [
                    { label: 'Solo yo', value: 'Private' },
                    { label: 'Equipo', value: 'Team' },
                  ]
                : [{ label: 'Solo yo', value: 'Private' }]
            "
          />
          <p>
            El segmento conserva la búsqueda y los filtros. Cada persona ve
            únicamente sus registros autorizados.
          </p>
          <RecoveryMessage :error="segmentError" @retry="saveSegment" /><Button
            label="Guardar segmento"
            variant="solid"
            :disabled="!segmentTitle.trim()"
            @click="saveSegment"
          /></div></template
    ></Dialog>
    <Dialog
      v-model="customize"
      :options="{ title: 'Personalizar Contactos', size: 'lg' }"
      ><template #body-content
        ><div class="c-editor">
          <h3>Tus preferencias</h3>
          <FormControl
            v-model="state.density"
            type="select"
            label="Densidad"
            :options="[
              { label: 'Compacta', value: 'compact' },
              { label: 'Cómoda', value: 'comfortable' },
            ]"
          /><label
            v-for="column in availableColumns"
            :key="column.value"
            class="c-candidate"
            ><input
              v-model="state.columns"
              type="checkbox"
              :value="column.value"
            />{{ column.label }}</label
          >
          <template v-if="capabilities.manager"
            ><h3>Configuración de la tienda</h3>
            <p>
              Ordena las secciones disponibles. Los permisos de cada registro se
              conservan.
            </p>
            <NativeLinkField
              v-model="configurationCountry"
              doctype="Country"
              label="País de la tienda para teléfonos" />
            <p>
              La acción principal prioriza tus seguimientos vencidos y próximos.
              Si no hay pendientes, permite añadir uno.
            </p>
            <div
              v-for="(section, index) in sectionOrder"
              :key="section"
              class="c-order-row"
            >
              <span>{{ sectionLabels[section] || section }}</span
              ><Button
                icon="arrow-up"
                :aria-label="`Subir ${sectionLabels[section] || section}`"
                :disabled="index === 0"
                @click="moveSection(index, -1)"
              /><Button
                icon="arrow-down"
                :aria-label="`Bajar ${sectionLabels[section] || section}`"
                :disabled="index === sectionOrder.length - 1"
                @click="moveSection(index, 1)"
              />
            </div>
            <RecoveryMessage
              :error="configError"
              @retry="saveConfiguration" /><Button
              label="Guardar configuración de tienda"
              @click="saveConfiguration" /></template
          ><ExtraFieldsSettings
            v-if="capabilities.fields?.define"
            @changed="reloadBoot"
          /><template v-else-if="capabilities.manager"
            ><h3>{{ __('Client fields') }}</h3>
            <p class="c-muted" data-hint="fields-owner-only">
              {{
                capabilities.fields?.reason ||
                __('Only the owner adds or retires fields.')
              }}
              {{
                __(
                  'From a cliente, «Add field» sends them the request; from here you can copy it.',
                )
              }}
            </p>
            <Button
              :label="__('Copy request')"
              data-act="copy-fields-request"
              @click="copyFieldsRequest"
            /><span v-if="fieldsRequestCopied" role="status">{{
              __('Request copied. Send it to the owner.')
            }}</span></template
          ><Button
            label="Listo"
            variant="solid"
            @click="customize = false"
          /></div></template
    ></Dialog>
  </ContactosLayout>
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
import { call } from 'frappe-ui'
import { useRoute, useRouter } from 'vue-router'
import ContactosLayout from '@/components/contactos/ContactosLayout.vue'
import IdentityEditor from '@/components/contactos/IdentityEditor.vue'
import NativeLinkField from '@/components/contactos/NativeLinkField.vue'
import RecoveryMessage from '@/components/contactos/RecoveryMessage.vue'
import ExtraFieldsSettings from '@/components/contactos/ExtraFieldsSettings.vue'
import {
  contactosApi,
  contactosReadKey,
  contactosReads,
  personalizarApi,
  prefetchRecord,
  useContactosBootstrap,
  useContactosDraft,
} from '@/composables/useContactos'
import {
  clauseLabel,
  extraClauses,
  isExtraClause,
  requestText,
} from '@/utils/extraFields'
import {
  contactScope,
  contactStorage,
  enterContactScope,
  loadContactState,
  saveContactState,
  contactoRoute,
  dueLabel,
  formatDay,
  sourceSlug,
  sourceLabel,
  legacyFilters,
  identityTypeLabel,
  identityPrefill,
  segmentScope,
  saveSegmentScope,
} from '@/utils/contactos'
import { safeReturn } from '@/composables/useCompras'
import { goToReturn } from '@/utils/atencion'
const route = useRoute(),
  router = useRouter(),
  scope = contactScope()
// Another screen asked for a new contact (?create=1): its name, number and role filled in,
// and its way back (return_to) once saved.
const createDefaults = computed(() =>
  route.query.create ? identityPrefill(route.query) : {},
)
const returnTo = computed(() => safeReturn(route.query.return_to))
const returnLabel = computed(() =>
  typeof route.query.return_label === 'string' && route.query.return_label
    ? route.query.return_label.slice(0, 40)
    : 'la pantalla anterior',
)
const storage = contactStorage()
enterContactScope(storage, scope)
const saved = loadContactState(storage, scope, 'list')
const state = reactive({
  q: '',
  segment: 'all',
  filters: {},
  cursor: null,
  cursorStack: [],
  selected: '',
  scrollTop: 0,
  density: 'compact',
  columns: ['roles', 'phone', 'company', 'next'],
  taskStatus: 'Open',
  ...saved,
})
if (route.query.segment) state.segment = String(route.query.segment)
if (route.query.q) state.q = String(route.query.q)
const legacyBlocked = ref(false),
  legacyReview = ref(false)
const mobileActions = ref(false)
const hydratedSegment = ref(null)
const legacySource =
  route.query.legacy_source ||
  route.query.source ||
  (state.segment === 'companies' ? 'organization' : 'contact')
if (route.query.filters) {
  const translation = legacyFilters(route.query.filters, legacySource)
  if (translation.unsupported) legacyBlocked.value = true
  else state.filters = { ...state.filters, ...translation.filters }
}
if (
  route.query.legacy_view &&
  !['list', 'List'].includes(String(route.query.legacy_view))
)
  legacyBlocked.value = true
const {
  boot,
  error: bootError,
  capabilities,
  reload: reloadBoot,
  ensure: ensureBoot,
} = useContactosBootstrap()
const rows = ref([]),
  error = ref(null),
  loading = ref(false),
  hasMore = ref(false),
  nextCursor = ref(null),
  partial = ref(false),
  filtersOpen = ref(false),
  newIdentity = ref(false),
  customize = ref(false),
  scroller = ref(null),
  searchControl = ref(null),
  segmentOpen = ref(false),
  segmentTitle = ref(''),
  segmentVisibility = ref('Private'),
  segmentError = ref(null),
  configError = ref(null),
  sectionOrder = ref([]),
  configurationCountry = ref('')
const { id } = useContactosDraft('list-operations')
const segments = computed(
  () => boot.value?.segments?.rows || boot.value?.segments || [],
)
const names = {
  all: 'Todos los contactos',
  people: 'Personas',
  companies: 'Empresas',
  customers: 'Clientes',
  suppliers: 'Proveedores',
  followups: 'Mis seguimientos',
  addresses: 'Direcciones',
}
const title = computed(
  () =>
    names[state.segment] ||
    segments.value.find((s) => s.name === state.segment)?.title ||
    'Contactos',
)
const segmentOptions = computed(() => [
  ...Object.entries(names).map(([value, label]) => ({ value, label })),
  ...segments.value.map((s) => ({ value: s.name, label: s.title || s.name })),
])
const availableColumns = [
  { value: 'roles', label: 'Tipo / roles' },
  { value: 'phone', label: 'Teléfono / correo' },
  { value: 'company', label: 'Empresa' },
  { value: 'next', label: 'Próxima acción' },
]
const sectionLabels = {
  identity: 'Datos',
  followups: 'Seguimientos',
  notes: 'Notas',
  addresses: 'Direcciones',
  relations: 'Relaciones',
  overview: 'Resumen',
  documents: 'Documentos',
  repairs: 'Reparaciones',
  conversations: 'Conversaciones',
  campaigns: 'Campañas',
  connections: 'Conexiones',
  storefront: 'Tienda',
  saldo: 'Saldo',
  extra: __('More details'),
}
const gridStyle = computed(() => ({
  gridTemplateColumns: [
    'minmax(190px, 2fr)',
    ...state.columns.map((v) =>
      v === 'roles' ? 'minmax(100px, 1fr)' : 'minmax(130px, 1fr)',
    ),
  ].join(' '),
}))
const activeFilters = computed(() =>
  Object.entries(state.filters)
    .filter(([, value]) => !!value)
    .flatMap(([key, value]) => {
      if (key !== 'native_filters')
        return [
          {
            key,
            label:
              key === 'source'
                ? `Origen: ${sourceLabel(value)}`
                : ({
                    kind: 'Tipo',
                    role: 'Rol',
                    tags: 'Etiqueta',
                    missing_phone: 'Sin teléfono',
                    disabled: 'Deshabilitados',
                  }[key] || key) +
                  (typeof value === 'string' ? `: ${value}` : ''),
          },
        ]
      // «Más datos» clauses read like the record («Talla: M»), one chip each.
      const clauses = Array.isArray(value) ? value : []
      const others = clauses.filter((clause) => !isExtraClause(clause))
      return [
        ...clauses.filter(isExtraClause).map((clause) => ({
          key: `native:${JSON.stringify(clause)}`,
          clause,
          label: clauseLabel(clause, boot.value?.extra_fields),
        })),
        ...(others.length
          ? [{ key, label: `Filtros de origen: ${others.length}` }]
          : []),
      ]
    }),
)
// «Más datos» filter row: the clientes' extra fields this person may read.
const extraFilter = reactive({ field: '', value: '', from: '', to: '' })
const extraFilterFields = computed(() =>
  ['suppliers', 'addresses', 'followups'].includes(state.segment)
    ? []
    : boot.value?.extra_fields || [],
)
const extraFilterField = computed(() =>
  extraFilterFields.value.find((field) => field.fieldname === extraFilter.field),
)
const extraFilterClauses = computed(() =>
  extraClauses(extraFilterField.value, extraFilter),
)
watch(
  () => extraFilter.field,
  () => Object.assign(extraFilter, { value: '', from: '', to: '' }),
)
function addExtraFilter() {
  const clauses = extraFilterClauses.value
  if (!clauses.length) return
  const kept = (state.filters.native_filters || []).filter(
    (clause) => clause[0] !== extraFilter.field,
  )
  // Contactos filters a source's own fields: these live on Clientes.
  state.filters = {
    ...state.filters,
    source: 'customer',
    native_filters: [...kept, ...clauses],
  }
  Object.assign(extraFilter, { field: '', value: '', from: '', to: '' })
}
function removeClauses(test) {
  const remaining = (state.filters.native_filters || []).filter(
    (clause) => !test(clause),
  )
  const next = { ...state.filters }
  if (remaining.length) next.native_filters = remaining
  else {
    delete next.native_filters
    if (next.source === 'customer') delete next.source
  }
  state.filters = next
}
function removeChip(chip) {
  if (chip.clause) return removeClauses((clause) => clause === chip.clause)
  if (chip.key === 'native_filters')
    return removeClauses((clause) => !isExtraClause(clause))
  const next = { ...state.filters }
  delete next[chip.key]
  state.filters = next
}
/** A segment on a retired extra field: «Quitar filtro» or (the owner) «Reactivar». */
async function runListGuard(action) {
  if (action.kind === 'remove_filter') {
    removeClauses((clause) => clause[0] === action.target)
    return
  }
  if (action.kind === 'reactivate') {
    try {
      await personalizarApi('change_field', {
        record_type: 'clientes',
        fieldname: action.target,
        change: { action: 'reactivate' },
        modified: action.modified,
      })
      await reloadBoot()
      await fetchRows()
    } catch (e) {
      error.value = e
    }
    return
  }
  await retry()
}
const fieldsRequestCopied = ref(false)
async function copyFieldsRequest() {
  try {
    await navigator.clipboard.writeText(requestText())
    fieldsRequestCopied.value = true
  } catch {
    fieldsRequestCopied.value = false
  }
}
let generation = 0,
  debounce
function filters() {
  const value = Object.fromEntries(
    Object.entries(state.filters).filter(([, v]) => !!v),
  )
  if (state.segment === 'people') value.kind = 'person'
  if (state.segment === 'companies') value.kind = 'company'
  if (state.segment === 'customers') value.role = 'customer'
  if (state.segment === 'suppliers') value.role = 'supplier'
  if (state.segment === 'addresses') value.source = 'address'
  return value
}
async function fetchRows(restore = false) {
  if (legacyBlocked.value) {
    rows.value = []
    hasMore.value = false
    loading.value = false
    return
  }
  const own = ++generation
  error.value = null
  const [method, args] = listRequest()
  const key = contactosReadKey(method, args)
  const hit = contactosReads.get(key)
  // A page seen before (back from a record, segment switch) renders at once;
  // the server answer then replaces its rows without moving the scroll.
  loading.value = !hit
  try {
    if (hit) await showRows(hit.value, restore)
    const result = await contactosReads.load(key, () =>
      contactosApi(method, args),
    )
    if (own !== generation) return
    await showRows(result, restore && !hit, !!hit)
  } catch (e) {
    if (own === generation) {
      rows.value = []
      error.value = e
    }
  } finally {
    if (own === generation) loading.value = false
  }
}
function listRequest() {
  if (state.segment === 'followups')
    return [
      'list_followups',
      { status: state.taskStatus, cursor: state.cursor },
    ]
  return [
    'search',
    {
      q: state.q,
      filters: filters(),
      cursor: state.cursor,
      segment:
        names[state.segment] || hydratedSegment.value === state.segment
          ? null
          : state.segment,
    },
  ]
}
async function showRows(result, restore, keepScroll = false) {
  if (result.available === false)
    throw new Error(
      result.reason ||
        'No tienes permiso para leer tus seguimientos. Pide acceso al responsable.',
    )
  rows.value = result.rows || []
  hasMore.value = !!result.has_more
  nextCursor.value = result.next_cursor
  partial.value = !!result.partial
  if (keepScroll) return
  await nextTick()
  if (scroller.value) scroller.value.scrollTop = restore ? state.scrollTop : 0
}
// Palette «New contact» and the PWA shortcut open the create dialog.
watch(
  () => route.query.create,
  (value) => {
    if (value) newIdentity.value = true
  },
  { immediate: true },
)
function remember() {
  if (scroller.value) state.scrollTop = scroller.value.scrollTop
  saveContactState(storage, scope, 'list', state)
}
function resetPage() {
  state.cursor = null
  state.cursorStack = []
  state.scrollTop = 0
}
function selectSegment(value) {
  const selected = segments.value.find((segment) => segment.name === value)
  let scope = { q: '', filters: {} }
  try {
    if (!names[value] && selected) scope = segmentScope(selected.filters)
  } catch (e) {
    error.value = e
    return
  }
  state.segment = value
  state.filters = scope.filters
  state.q = scope.q
  hydratedSegment.value = names[value] || selected ? value : null
  if (names[value] || selected) {
    legacyBlocked.value = false
    legacyReview.value = false
  }
  filtersOpen.value = false
  segmentOpen.value = false
  mobileActions.value = false
  resetPage()
}
// Template handlers stay single calls: Vue only splits inline statements on ';',
// which Prettier (semi: false) removes.
function openFromMobileMenu(dialog) {
  if (dialog === 'segment') segmentOpen.value = true
  else customize.value = true
  mobileActions.value = false
}
function clearSearch() {
  state.q = ''
  clearFilters()
}
function clearFilters() {
  state.filters = {}
  resetPage()
}
function reviewLegacy() {
  filtersOpen.value = true
  legacyReview.value = true
  state.filters = { source: legacySource }
}
function applyLegacyReview() {
  legacyReview.value = false
  legacyBlocked.value = false
  resetPage()
  router.replace({ name: 'Contactos', query: { segment: state.segment } })
  fetchRows()
}
function discardLegacy() {
  legacyBlocked.value = false
  state.filters = {}
  state.q = ''
  state.segment = 'all'
  resetPage()
  router.replace({ name: 'Contactos' })
  fetchRows()
}
// Desktop only: resting on a row for 150 ms loads its record ahead of the click.
let hoverTimer
function hoverRow(row, event) {
  clearTimeout(hoverTimer)
  if (!row || event?.pointerType !== 'mouse') return
  hoverTimer = setTimeout(() => prefetchRecord(row), 150)
}
function openRow(row) {
  state.selected = row.source + ':' + row.name
  remember()
  router.push(contactoRoute(row))
}
function openTask(task) {
  router.push(
    contactoRoute({
      source: sourceSlug(task.reference_type),
      name: task.reference_name,
    }),
  )
}
function nextPage() {
  state.cursorStack.push(state.cursor)
  state.cursor = nextCursor.value
  fetchRows()
}
function previousPage() {
  state.cursor = state.cursorStack.pop() || null
  fetchRows()
}
async function retry() {
  await reloadBoot()
  await fetchRows(true)
}
async function created(result) {
  // Created for another screen: back there, which checks again with the new record.
  if (returnTo.value) {
    goToReturn(router, returnTo.value)
    return
  }
  await fetchRows()
  if (result.source && result.name) router.push(contactoRoute(result))
  else if (result.refs?.[0]) router.push(contactoRoute(result.refs[0]))
}
async function saveSegment() {
  if (state.segment === 'followups') return
  try {
    const payload = {
      title: segmentTitle.value,
      filters: saveSegmentScope(state.q, filters()),
      visibility: segmentVisibility.value,
    }
    await contactosApi('save_segment', { payload, request_id: id(payload) })
    segmentOpen.value = false
    await reloadBoot()
  } catch (e) {
    segmentError.value = e
  }
}
function moveSection(index, delta) {
  const value = sectionOrder.value.splice(index, 1)[0]
  sectionOrder.value.splice(index + delta, 0, value)
}
async function saveConfiguration() {
  try {
    const payload = {
      modified: boot.value?.configuration_modified,
      configuration: {
        ...boot.value?.configuration,
        section_order: sectionOrder.value,
        country: configurationCountry.value,
      },
    }
    await contactosApi('save_configuration', {
      payload,
      request_id: id(payload),
    })
    await reloadBoot()
    customize.value = false
  } catch (e) {
    configError.value = e
  }
}
async function completeTask(task) {
  try {
    const payload = {
      name: task.name,
      modified: task.modified,
      status: 'Closed',
    }
    await contactosApi('update_followup', { payload, request_id: id(payload) })
    await fetchRows()
    if (rows.value[0]) openTask(rows.value[0])
  } catch (e) {
    error.value = e
  }
}
function tags(row) {
  return (
    row.tags ||
    String(row.fields?._user_tags || '')
      .split(',')
      .filter(Boolean)
  )
}
function roleLabel(row) {
  return [
    ...new Set(
      (row.refs || [])
        .map(
          (r) =>
            ({
              Customer: 'Cliente',
              Supplier: 'Proveedor',
              'CRM Organization': 'Empresa',
              Lead: 'Prospecto',
              'CRM Lead': 'Prospecto',
            })[r.doctype],
        )
        .filter(Boolean),
    ),
  ].join(', ')
}
function plainText(value) {
  return String(value || '').replace(/<[^>]*>/g, '')
}
function shortcut(event) {
  if (
    event.key === '/' &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.target.closest(
      'input,textarea,select,[contenteditable],[role="dialog"]',
    )
  ) {
    event.preventDefault()
    searchControl.value?.$el?.querySelector('input')?.focus()
  }
}
// Typing waits for a pause; a segment, filter or status choice loads at once
// (a page seen before then renders from memory without any wait).
watch(
  () => [
    state.q,
    JSON.stringify(state.filters),
    state.segment,
    state.taskStatus,
  ],
  ([q], [previousQ]) => {
    resetPage()
    clearTimeout(debounce)
    generation++
    if (q !== previousQ) debounce = setTimeout(() => fetchRows(), 200)
    else fetchRows()
  },
)
watch(() => [state.columns, state.density], remember, { deep: true })
onMounted(async () => {
  document.addEventListener('keydown', shortcut)
  // A built-in segment needs nothing from the boot: its rows load meanwhile.
  const early =
    names[state.segment] && !route.query.view && !legacyBlocked.value
      ? JSON.stringify(listRequest())
      : null
  if (early) fetchRows(true)
  await ensureBoot()
  if (route.query.view && route.query.legacy_view) {
    try {
      const legacy = await call('crm.api.contactos.get_legacy_view', {
        source: legacySource,
        view: String(route.query.view),
      })
      if (legacy.supported) {
        state.filters = legacy.filters
        legacyBlocked.value = false
        segmentTitle.value = legacy.title || ''
      }
    } catch (e) {
      error.value = e
      legacyBlocked.value = true
    }
  }
  if (
    !saved &&
    !route.query.segment &&
    !route.query.legacy_view &&
    !legacyBlocked.value
  )
    state.segment = boot.value?.default_segment || 'all'
  if (!names[state.segment]) {
    const selected = segments.value.find(
      (segment) => segment.name === state.segment,
    )
    if (selected) {
      try {
        const scope = segmentScope(selected.filters)
        if (!saved || route.query.segment) {
          state.filters = scope.filters
          state.q =
            route.query.q !== undefined ? String(route.query.q) : scope.q
        }
        hydratedSegment.value = state.segment
      } catch (e) {
        error.value = e
        legacyBlocked.value = true
      }
    }
  }
  configurationCountry.value = boot.value?.configuration?.country || ''
  sectionOrder.value = [
    ...(boot.value?.configuration?.section_order || [
      'identity',
      'followups',
      'notes',
      'addresses',
      'relations',
    ]),
  ]
  // An order saved before «Más datos» existed shows it last, ready to move.
  if (!sectionOrder.value.includes('extra')) sectionOrder.value.push('extra')
  // «Ver campos» from a cliente opens Personalizar on its client fields.
  if (route.query.customize === 'fields') customize.value = true
  if (early !== JSON.stringify(listRequest())) await fetchRows(true)
})
onBeforeUnmount(() => {
  clearTimeout(debounce)
  clearTimeout(hoverTimer)
  generation++
  remember()
  document.removeEventListener('keydown', shortcut)
})
</script>
