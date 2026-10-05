<template>
  <ContactosLayout :segments="segments" @select="goList">
    <header class="c-record-heading">
      <Button
        label="Volver a la lista"
        icon-left="arrow-left"
        variant="ghost"
        @click="back"
      /><span v-if="record" class="c-origin">{{
        sourceLabel(selectedSource?.doctype || record.doctype || record.source)
      }}</span>
    </header>
    <RecoveryMessage
      :error="error || bootError"
      action="ver y editar este registro"
      @retry="reload"
      @compare="reload"
      @reload="reload"
    />
    <div v-if="loading && !record" class="c-loading" role="status">
      Abriendo ficha…
    </div>
    <template v-if="record">
      <div class="c-record-title">
        <div
          class="c-avatar c-avatar-large"
          :class="{ company: record.kind === 'company' }"
        >
          <FeatherIcon
            :name="
              record.source === 'address'
                ? 'map-pin'
                : record.kind === 'company'
                  ? 'briefcase'
                  : 'user'
            "
            class="h-6 w-6"
          />
        </div>
        <div>
          <h1>{{ record.title || record.name }}</h1>
          <p>
            {{ identityTypeLabel(record)
            }}<span v-if="record.fields?.designation">
              · {{ record.fields.designation }}</span
            >
          </p>
        </div>
        <Button
          v-if="record.capabilities?.write"
          :label="
            record.source === 'address' ? 'Editar dirección' : 'Editar datos'
          "
          icon-left="edit-2"
          @click="editIdentity"
        />
      </div>
      <div class="c-record-actions">
        <Button
          v-if="canFollowup"
          :label="
            nextTask
              ? `Seguimiento ${dueLabel(nextTask, boot?.today).toLowerCase()}`
              : 'Añadir seguimiento'
          "
          variant="solid"
          icon-left="check-circle"
          @click="editFollowup(nextTask)"
        />
        <a
          v-if="phone"
          :href="`tel:${phone.replace(/[^+\d]/g, '')}`"
          class="c-action-link"
          ><FeatherIcon name="phone" class="h-4 w-4" />Llamar</a
        >
        <a
          v-if="email"
          :href="`mailto:${encodeURIComponent(email)}`"
          class="c-action-link"
          ><FeatherIcon name="mail" class="h-4 w-4" />Correo</a
        >
      </div>
      <div v-if="refs.length > 1" class="c-source-chooser">
        <FormControl
          :model-value="selectedKey"
          type="select"
          label="Registro que estás viendo"
          :options="
            refs.map((r) => ({
              value: r.doctype + ':' + r.name,
              label: `${r.title || r.name} (${sourceLabel(r.doctype)})`,
            }))
          "
          @update:model-value="selectSource"
        />
        <p>
          Esta persona o empresa tiene varios registros. Cada cambio se guarda
          en el registro que elijas.
        </p>
      </div>
      <p
        v-if="record.source === 'address' && addressTargets.length === 1"
        class="c-chooser-single"
      >
        Dirección de
        <strong>{{ addressTargets[0].title || addressTargets[0].name }}</strong>
      </p>
      <div v-else-if="record.source === 'address'" class="c-source-chooser">
        <FormControl
          v-model="addressTargetKey"
          type="select"
          label="Registro vinculado para editar o crear otra dirección"
          :options="[
            { value: '', label: 'Selecciona el registro de destino' },
            ...addressTargets.map((r) => ({
              value: `${r.doctype}:${r.name}`,
              label: `${r.title || r.name} (${sourceLabel(r.doctype)})`,
            })),
          ]"
        />
        <p>
          Selecciona el registro al que pertenece el cambio. Si el alcance
          compartido no puede revisarse, crea otra dirección para este destino.
        </p>
      </div>
      <p v-if="customers.length === 1" class="c-chooser-single">
        Cuenta de cliente
        <strong>{{ customers[0].title || customers[0].name }}</strong>
      </p>
      <div v-else-if="customers.length > 1" class="c-source-chooser">
        <FormControl
          v-model="selectedCustomer"
          type="select"
          label="Cuenta de cliente para las secciones comerciales"
          :options="[
            { value: '', label: 'Selecciona una cuenta' },
            ...customers.map((r) => ({
              value: r.name,
              label: r.title || r.name,
            })),
          ]"
        />
        <p>
          La persona representante y la cuenta que recibe facturas pueden ser
          distintas.
        </p>
      </div>
      <div v-if="panelContacts.length > 1" class="c-source-chooser">
        <FormControl
          v-model="selectedPanelContact"
          type="select"
          label="Persona para revisar el historial"
          :options="[
            { value: '', label: 'Selecciona la persona' },
            ...panelContacts.map((r) => ({
              value: r.name,
              label: r.title || r.name,
            })),
          ]"
        />
      </div>
      <div class="c-record-grid">
        <section
          class="c-record-section c-identity-section"
          :style="sectionStyle('identity')"
        >
          <div class="c-section-heading">
            <h2>Datos</h2>
            <Button
              v-if="record.capabilities?.write"
              label="Editar"
              variant="ghost"
              @click="editIdentity"
            />
          </div>
          <dl class="c-values">
            <template v-for="field in displayFields" :key="field.fieldname"
              ><dt>{{ field.label || field.fieldname }}</dt>
              <dd>
                {{ formatted(field, record.fields?.[field.fieldname]) }}
              </dd></template
            >
          </dl>
          <div v-if="phoneRows.length" class="c-detail-channels">
            <h3>Teléfonos</h3>
            <a
              v-for="(row, index) in phoneRows"
              :key="index"
              :href="`tel:${String(row.phone).replace(/[^+\d]/g, '')}`"
              >{{ row.phone }}
              <small v-if="row.is_primary_phone || row.is_primary_mobile_no"
                >Principal</small
              ></a
            >
          </div>
          <div v-if="emailRows.length" class="c-detail-channels">
            <h3>Correos</h3>
            <a
              v-for="(row, index) in emailRows"
              :key="index"
              :href="`mailto:${encodeURIComponent(row.email_id)}`"
              >{{ row.email_id }}
              <small v-if="row.is_primary">Principal</small></a
            >
          </div>
          <p v-if="record.conflicts?.length" class="c-hint">
            Hay datos distintos entre los orígenes. Selecciona cada origen para
            revisar sus valores.
          </p>
          <div class="c-section-heading">
            <h3>Etiquetas</h3>
            <Button
              v-if="record.capabilities?.write"
              label="Editar etiquetas"
              variant="ghost"
              @click="tagsOpen = true"
            />
          </div>
          <div class="c-tags">
            <span v-for="tag in record.tags || []" :key="tag">{{ tag }}</span>
          </div>
          <Button
            v-if="
              record.source === 'contact' &&
              (capabilities.sources?.customer?.create ||
                capabilities.sources?.supplier?.create)
            "
            label="Añadir rol comercial"
            variant="ghost"
            @click="roleOpen = true"
          />
        </section>
        <section
          class="c-record-section c-followup-section"
          :style="sectionStyle('followups')"
        >
          <div class="c-section-heading">
            <h2>Seguimientos</h2>
            <Button
              v-if="canFollowup"
              label="Añadir"
              icon-left="plus"
              variant="ghost"
              @click="editFollowup()"
            />
          </div>
          <div class="c-queue-tabs">
            <Button
              label="Pendientes"
              :variant="taskStatus === 'Open' ? 'solid' : 'ghost'"
              @click="showTasks('Open')"
            /><Button
              label="Hechos"
              :variant="taskStatus === 'Closed' ? 'solid' : 'ghost'"
              @click="showTasks('Closed')"
            /><Button
              label="Cancelados"
              :variant="taskStatus === 'Cancelled' ? 'solid' : 'ghost'"
              @click="showTasks('Cancelled')"
            />
          </div>
          <RecoveryMessage
            :error="taskError"
            action="editar mi seguimiento"
            @retry="refreshFollowups"
            @compare="refreshFollowups"
            @reload="refreshFollowups"
          />
          <article
            v-for="task in followups"
            :key="task.name"
            class="c-followup"
          >
            <span
              class="c-due"
              :class="{ overdue: dueLabel(task, boot?.today) === 'Vencido' }"
              >{{ dueLabel(task, boot?.today) }}</span
            >
            <h3>{{ plainText(task.description) }}</h3>
            <p>
              {{ formatDay(task.date || task.due_date) || 'Sin fecha' }} ·
              {{ task.allocated_to || 'Mi seguimiento' }}
            </p>
            <div v-if="task.status === 'Open'" class="c-actions">
              <Button label="Reprogramar" @click="editFollowup(task)" /><Button
                label="Hecho"
                @click="complete(task)"
              /><Button
                label="Hecho y siguiente"
                @click="complete(task, true)"
              />
            </div>
            <div
              v-if="dueLabel(task, boot?.today) === 'Cancelado'"
              class="c-actions"
            >
              <p>Está cancelado. Reabrir conserva esta misma tarea.</p>
              <Button label="Reabrir seguimiento" @click="reopen(task)" />
            </div>
          </article>
          <p v-if="!followups.length" class="c-muted">
            {{
              taskStatus === 'Open'
                ? 'No tienes seguimientos pendientes para este registro.'
                : 'No hay seguimientos completados en esta página.'
            }}
          </p>
          <Button
            v-if="taskMore"
            label="Cargar más seguimientos"
            @click="loadTasks(true)"
          />
        </section>
        <section
          class="c-record-section c-notes-section"
          :style="sectionStyle('notes')"
        >
          <div class="c-section-heading">
            <h2>Notas</h2>
            <span class="c-muted">{{
              sourceLabel(selectedSource?.doctype || record.doctype)
            }}</span>
          </div>
          <RecoveryMessage
            :error="noteError"
            action="añadir una nota al origen seleccionado"
            @retry="saveNote"
          />
          <template v-if="capabilities.notes?.create"
            ><FormControl
              v-model="noteDraft.text"
              type="textarea"
              label="Añadir nota"
              placeholder="Contexto útil para el próximo contacto" /><Button
              label="Guardar nota"
              :disabled="!noteDraft.text.trim()"
              :loading="noteSaving"
              @click="saveNote"
          /></template>
          <article
            v-for="note in record.notes?.rows || []"
            :key="note.name"
            class="c-note"
          >
            <p>{{ plainText(note.content || note.comment || note.text) }}</p>
            <small
              >{{ note.comment_by || note.owner }} ·
              {{ formatMoment(note.creation) }}</small
            >
          </article>
          <p v-if="!(record.notes?.rows || []).length" class="c-muted">
            {{
              record.notes?.available === false
                ? 'No tienes permiso para consultar las notas de este registro.'
                : 'Aún no hay notas en este registro.'
            }}
          </p>
        </section>
        <section
          class="c-record-section c-address-section"
          :style="sectionStyle('addresses')"
        >
          <div class="c-section-heading">
            <h2>Direcciones</h2>
            <Button
              v-if="capabilities.sources?.address?.create"
              label="Añadir"
              icon-left="plus"
              variant="ghost"
              @click="editAddress()"
            />
          </div>
          <article
            v-for="address in record.addresses || []"
            :key="address.name"
            class="c-address"
          >
            <h3>{{ address.fields?.address_title || address.name }}</h3>
            <p>
              {{ address.fields?.address_line1
              }}<br v-if="address.fields?.address_line2" />{{
                address.fields?.address_line2
              }}
            </p>
            <p>
              {{
                [
                  address.fields?.city,
                  address.fields?.state,
                  address.fields?.pincode,
                  address.fields?.country,
                ]
                  .filter(Boolean)
                  .join(', ')
              }}
            </p>
            <span v-if="address.shared" class="c-type">Compartida</span
            ><Button
              v-if="address.capabilities?.write"
              label="Editar dirección"
              variant="ghost"
              @click="editAddress(address)"
            />
          </article>
          <div v-if="record.addresses_guard" class="c-recovery" role="status">
            <p>{{ record.addresses_guard.message }}</p>
            <div class="c-actions">
              <Button
                v-for="action in record.addresses_guard.actions || []"
                :key="action.kind + action.label"
                :label="action.label"
                @click="runAddressGuard(action)"
              />
            </div>
            <p v-if="addressGuardNote">{{ addressGuardNote }}</p>
          </div>
          <p v-else-if="!(record.addresses || []).length" class="c-muted">
            No hay direcciones vinculadas.
          </p>
        </section>
        <section
          class="c-record-section c-relations-section"
          :style="sectionStyle('relations')"
        >
          <div class="c-section-heading">
            <h2>Relaciones</h2>
            <Button
              v-if="record.capabilities?.write"
              label="Revisar vínculo"
              icon-left="link"
              variant="ghost"
              @click="relationOpen = true"
            />
          </div>
          <article
            v-for="relation in record.relations || []"
            :key="
              relation.name ||
              `${relation.kind}:${relation.left?.name}:${relation.right?.name}`
            "
            class="c-relation"
          >
            <span class="c-type">{{
              relationLabels[relation.kind] || relation.kind
            }}</span>
            <div class="c-relation-endpoints">
              <button class="c-link" @click="openRelated(relation.left)">
                {{ relation.left?.title || relation.left?.name }}</button
              ><span aria-hidden="true">→</span
              ><button class="c-link" @click="openRelated(relation.right)">
                {{ relation.right?.title || relation.right?.name }}
              </button>
            </div>
            <Button
              v-if="record.capabilities?.write && !relation.native"
              label="Desvincular"
              variant="ghost"
              @click="unlinkTarget = relation"
            /><Button
              v-if="relation.native"
              label="Revisar origen"
              variant="ghost"
              @click="openRelated(relation.left)"
            />
          </article>
          <p v-if="!(record.relations || []).length" class="c-muted">
            Sin relaciones confirmadas. Compartir nombre o teléfono no une
            registros.
          </p>
        </section>
      </div>
      <section
        v-if="contactName && contactTabs.length"
        class="c-provider-section"
      >
        <div
          class="c-provider-tabs"
          role="tablist"
          aria-label="Secciones del registro"
        >
          <button
            v-for="tab in contactTabs"
            :key="tab.name"
            role="tab"
            :aria-selected="activeTab === tab.name"
            :class="{ active: activeTab === tab.name }"
            @click="activeTab = tab.name"
          >
            {{ tab.label }}
          </button>
        </div>
        <ContactTabPanel
          v-if="activePanel"
          :key="contactName + ':' + activePanel.name + ':' + selectedCustomer"
          :component="activePanel.component"
          :docname="contactName"
          :selected-customer="selectedCustomer"
        />
      </section>
      <RecoveryMessage
        v-if="sections.error"
        :error="sections.error"
        action="ver las secciones opcionales"
        @retry="sections.reload"
      />
      <div
        v-if="boot?.optional_sections?.contact360?.available === false"
        class="c-provider-recovery"
      >
        <p>
          {{
            boot.optional_sections.contact360.reason ||
            'Las secciones comerciales requieren Doco Marketing.'
          }}
          Los datos, notas y seguimientos siguen disponibles.
        </p>
        <Button
          label="Copiar solicitud de configuración"
          variant="ghost"
          @click="copyConfiguration"
        />
        <p v-if="configurationCopied" role="status">
          Solicitud copiada para el responsable de la tienda.
        </p>
      </div>
      <p
        v-else-if="
          !contactName && (record.kind === 'company' || refs.length > 0)
        "
        class="c-provider-recovery"
      >
        Las secciones del historial necesitan una persona vinculada autorizada.
        Revisa Relaciones para abrir su ficha; los datos de esta cuenta siguen
        disponibles aquí.
      </p>
      <IdentityEditor
        v-if="identityOpen"
        v-model="identityOpen"
        :source="selectedSource || record"
        @saved="reload"
      />
      <IdentityEditor
        v-if="roleOpen"
        v-model="roleOpen"
        :defaults="{
          source: 'contact',
          fields: record.fields,
          phones: phoneRows,
          emails: emailRows,
          party_source: capabilities.sources?.customer?.create
            ? 'customer'
            : 'supplier',
          candidate_decision: 'link_role',
          existing_key: `contact:${record.name}`,
        }"
        @saved="reload"
      />
      <TagEditor
        v-if="tagsOpen"
        v-model="tagsOpen"
        :source="record"
        :tags="record.tags || []"
        @saved="reload"
      />
      <AddressEditor
        v-if="addressOpen"
        v-model="addressOpen"
        :source="addressSource || selectedSource || record"
        :address="selectedAddress"
        @saved="reload"
      />
      <FollowupEditor
        v-if="followupOpen"
        v-model="followupOpen"
        :source="selectedSource || record"
        :followup="selectedFollowup"
        @saved="refreshFollowups"
      />
      <RelationEditor
        v-if="relationOpen"
        v-model="relationOpen"
        :source="selectedSource || record"
        :kind="record.kind"
        @saved="reload"
      />
      <Dialog
        :model-value="!!unlinkTarget"
        :options="{ title: 'Revisar desvinculación' }"
        @update:model-value="
          (v) => {
            if (!v) unlinkTarget = null
          }
        "
        ><template #body-content
          ><div class="c-editor">
            <p>
              {{
                unlinkTarget?.kind?.startsWith('same_')
                  ? 'Los registros dejarán de agruparse por este vínculo. Otras relaciones confirmadas pueden mantener la agrupación.'
                  : 'El vínculo dejará de aparecer entre los dos registros.'
              }}
              Los registros nativos y sus datos se conservan.
            </p>
            <RecoveryMessage
              :error="relationError"
              @retry="unlink"
              @compare="reload"
              @reload="reload"
            /><Button
              label="Confirmar desvinculación"
              @click="unlink"
            /></div></template
      ></Dialog>
      <div v-if="doneMessage" class="c-success" role="status">
        {{ doneMessage
        }}<Button label="Volver a la lista" variant="ghost" @click="back" />
      </div>
    </template>
  </ContactosLayout>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ContactosLayout from '@/components/contactos/ContactosLayout.vue'
import IdentityEditor from '@/components/contactos/IdentityEditor.vue'
import AddressEditor from '@/components/contactos/AddressEditor.vue'
import FollowupEditor from '@/components/contactos/FollowupEditor.vue'
import RelationEditor from '@/components/contactos/RelationEditor.vue'
import TagEditor from '@/components/contactos/TagEditor.vue'
import RecoveryMessage from '@/components/contactos/RecoveryMessage.vue'
import ContactTabPanel from '@/components/doco/contact/ContactTabPanel.vue'
import { useContact360Tabs } from '@/components/doco/contact/useContact360Tabs'
import {
  contactosApi,
  useContactosBootstrap,
  useContactosDraft,
} from '@/composables/useContactos'
import {
  contactoRoute,
  dueLabel,
  accessLost,
  formatDay,
  formatMoment,
  mergeTaskPage,
  optionLabel,
  nextFollowup,
  sourceRef,
  sourceLabel,
  identityTypeLabel,
} from '@/utils/contactos'
const route = useRoute(),
  router = useRouter()
const record = ref(null),
  error = ref(null),
  loading = ref(false),
  selectedKey = ref(''),
  selectedCustomer = ref(''),
  identityOpen = ref(false),
  addressOpen = ref(false),
  followupOpen = ref(false),
  relationOpen = ref(false),
  selectedAddress = ref(null),
  selectedFollowup = ref(null),
  unlinkTarget = ref(null),
  relationError = ref(null),
  doneMessage = ref('')
const selectedPanelContact = ref(''),
  tagsOpen = ref(false),
  roleOpen = ref(false)
const configurationCopied = ref(false)
const addressTargetKey = ref(''),
  addressSource = ref(null)
const {
  boot,
  error: bootError,
  capabilities,
  reload: reloadBoot,
} = useContactosBootstrap()
const { contactTabs, sections } = useContact360Tabs()
const activeTab = ref('')
watch(contactTabs, (tabs) => {
  if (!tabs.some((t) => t.name === activeTab.value))
    activeTab.value = tabs[0]?.name || ''
})
const activePanel = computed(() =>
  contactTabs.value.find((t) => t.name === activeTab.value),
)
const segments = computed(
  () => boot.value?.segments?.rows || boot.value?.segments || [],
)
const refs = computed(() => record.value?.refs || [])
const selectedSource = computed(
  () =>
    refs.value.find((r) => `${r.doctype}:${r.name}` === selectedKey.value) ||
    record.value,
)
const relatedRefs = computed(() => [
  ...refs.value,
  ...(record.value?.relations || [])
    .flatMap((r) => [r.left, r.right])
    .filter(Boolean),
])
const uniqueRefs = (doctype) => [
  ...new Map(
    relatedRefs.value
      .filter((r) => r.doctype === doctype)
      .map((r) => [r.name, r]),
  ).values(),
]
const customers = computed(() => uniqueRefs('Customer'))
const panelContacts = computed(() => uniqueRefs('Contact'))
const addressTargets = computed(() => [
  ...new Map(
    (record.value?.relations || [])
      .filter((r) => r.kind === 'address_for')
      .flatMap((r) => [r.left, r.right])
      .filter((r) => r && r.doctype !== 'Address')
      .map((r) => [`${r.doctype}:${r.name}`, r]),
  ).values(),
])
// A single possible account, person or address owner needs no choice: select it
// and show it as text, so the record opens ready to use.
watch(
  [customers, panelContacts, addressTargets],
  () => {
    if (!selectedCustomer.value && customers.value.length === 1)
      selectedCustomer.value = customers.value[0].name
    if (
      !selectedPanelContact.value &&
      record.value?.source !== 'contact' &&
      panelContacts.value.length === 1
    )
      selectedPanelContact.value = panelContacts.value[0].name
    if (!addressTargetKey.value && addressTargets.value.length === 1) {
      const [target] = addressTargets.value
      addressTargetKey.value = `${target.doctype}:${target.name}`
    }
  },
  { immediate: true },
)
const contactName = computed(() =>
  selectedPanelContact.value &&
  panelContacts.value.some((r) => r.name === selectedPanelContact.value)
    ? selectedPanelContact.value
    : record.value?.source === 'contact'
      ? record.value.name
      : '',
)
const displayFields = computed(() =>
  (record.value?.editor_meta?.fields || []).filter(
    (f) =>
      ![
        'Table',
        'Table MultiSelect',
        'Section Break',
        'Column Break',
        'Tab Break',
        'HTML',
        'Button',
        'Image',
      ].includes(f.fieldtype) &&
      record.value?.fields?.[f.fieldname] !== undefined,
  ),
)
const phoneRows = computed(() => record.value?.fields?.phone_nos || []),
  emailRows = computed(() => record.value?.fields?.email_ids || [])
const phone = computed(
  () =>
    record.value?.fields?.mobile_no ||
    record.value?.fields?.phone ||
    phoneRows.value[0]?.phone ||
    '',
)
const email = computed(
  () => record.value?.fields?.email_id || emailRows.value[0]?.email_id || '',
)
const followups = ref([]),
  openTasks = ref([]),
  taskStatus = ref('Open'),
  taskError = ref(null),
  taskMore = ref(false),
  taskCursor = ref(null)
const nextTask = computed(() => nextFollowup(openTasks.value))
const canFollowup = computed(() => capabilities.value.followups?.create)
const noteError = ref(null),
  noteSaving = ref(false)
const nativeRoute = computed(() => ({
  source: String(route.params.source || route.query.source || 'contact'),
  name: String(
    route.params.name || route.query.name || route.params.contactId || '',
  ),
}))
const {
  draft: noteDraft,
  id: noteId,
  clear: clearNote,
} = useContactosDraft(
  () => `note:${nativeRoute.value.source}:${nativeRoute.value.name}`,
  { text: '' },
)
const { id } = useContactosDraft(
  () => `record-actions:${nativeRoute.value.source}:${nativeRoute.value.name}`,
)
const relationLabels = {
  same_person: 'Misma persona',
  same_company: 'Misma empresa',
  represents: 'Representa a',
  payer_for: 'Paga por',
  native_role: 'Rol nativo vinculado',
  primary_contact: 'Contacto principal',
  representative: 'Representante',
  crm_deal: 'Oportunidad comercial',
}
const sectionStyle = (key) => ({
  order: Math.max(
    0,
    (boot.value?.configuration?.section_order || []).indexOf(key),
  ),
})
let generation = 0,
  taskGeneration = 0
async function reload() {
  const own = ++generation
  loading.value = true
  error.value = null
  try {
    await reloadBoot()
    const result = await contactosApi('get_record', nativeRoute.value)
    if (own !== generation) return
    record.value = result
    openTasks.value = result.followups?.rows || []
    selectedKey.value = `${result.doctype || result.refs?.find((r) => r.name === result.name)?.doctype}:${result.name}`
    if (
      selectedCustomer.value &&
      !customers.value.some((c) => c.name === selectedCustomer.value)
    )
      selectedCustomer.value = ''
    await loadTasks()
  } catch (e) {
    if (own === generation) {
      error.value = e
      record.value = null
      followups.value = []
    }
  } finally {
    if (own === generation) loading.value = false
  }
}
async function selectSource(value) {
  const ref = refs.value.find((r) => `${r.doctype}:${r.name}` === value)
  if (!ref) return
  router.push(contactoRoute(ref))
}
async function loadTasks(more = false) {
  const own = ++taskGeneration
  try {
    const result = await contactosApi('list_followups', {
      ...sourceRef(selectedSource.value || nativeRoute.value),
      status: taskStatus.value,
      cursor: more ? taskCursor.value : null,
    })
    if (own !== taskGeneration) return
    if (result.available === false)
      throw Object.assign(
        new Error(
          result.reason ||
            'No tienes permiso para leer tus seguimientos. Pide acceso al responsable.',
        ),
        { unavailable: true },
      )
    followups.value = mergeTaskPage(followups.value, result.rows || [], more)
    taskCursor.value = result.next_cursor
    taskMore.value = !!result.has_more
    taskError.value = null
    if (taskStatus.value === 'Open') openTasks.value = followups.value
  } catch (e) {
    if (own === taskGeneration) {
      taskError.value = e
      followups.value = []
      // Lost access must not leave a protected task on the next-action card.
      if (accessLost(e)) openTasks.value = []
    }
  }
}
// After a follow-up is created, reprogrammed or completed the current list and
// the next-action card are replaced, never appended (an event payload is not a
// «load more» request).
async function refreshFollowups() {
  await loadTasks(false)
  if (taskStatus.value === 'Open') return
  try {
    const open = await contactosApi('list_followups', {
      ...sourceRef(selectedSource.value || nativeRoute.value),
      status: 'Open',
    })
    openTasks.value = open.available === false ? [] : open.rows || []
  } catch (e) {
    taskError.value = e
    if (accessLost(e)) openTasks.value = []
  }
}

function editFollowup(task = null) {
  selectedFollowup.value = task
  followupOpen.value = true
}
const addressGuardNote = ref('')
// Protected address links: the server's guard offers a new address (when
// native create is allowed) or an access request; nothing is left blocked.
async function runAddressGuard(action) {
  if (action.kind === 'call' && action.target?.endsWith('.get_editor_meta'))
    return editAddress()
  if (action.kind === 'retry') return reload()
  const text = `Solicito acceso para consultar las direcciones vinculadas de ${record.value?.title || record.value?.name} en Contactos.`
  try {
    await navigator.clipboard.writeText(text)
    addressGuardNote.value =
      'Solicitud copiada. Compártela con tu encargado y después recarga la ficha.'
  } catch {
    addressGuardNote.value = text
  }
}
function editAddress(address = null) {
  addressSource.value = null
  selectedAddress.value = address
  addressOpen.value = true
}
async function editIdentity() {
  if (record.value.source !== 'address') {
    identityOpen.value = true
    return
  }
  if (!addressTargets.value.length && record.value.address_info?.shared_safe) {
    identityOpen.value = true
    return
  }
  const target = addressTargets.value.find(
    (r) => `${r.doctype}:${r.name}` === addressTargetKey.value,
  )
  if (!target) {
    error.value = new Error(
      'Selecciona el registro vinculado al que quieres aplicar esta dirección.',
    )
    return
  }
  try {
    addressSource.value = await contactosApi('get_record', sourceRef(target))
    selectedAddress.value = record.value.address_info || {
      ...record.value,
      shared_safe: false,
      impact_editable: false,
      visible_links: addressTargets.value,
    }
    addressOpen.value = true
  } catch (e) {
    error.value = e
  }
}
// Template handlers stay single calls: Vue only splits inline statements on ';',
// which Prettier (semi: false) removes.
function showTasks(status) {
  taskStatus.value = status
  loadTasks()
}
async function complete(task, scheduleNext = false) {
  try {
    const payload = {
      name: task.name,
      modified: task.modified,
      status: 'Closed',
    }
    await contactosApi('update_followup', { payload, request_id: id(payload) })
    await refreshFollowups()
    doneMessage.value = 'Seguimiento completado.'
    if (scheduleNext) editFollowup(nextTask.value)
  } catch (e) {
    taskError.value = e
  }
}
async function reopen(task) {
  try {
    const payload = { name: task.name, modified: task.modified, status: 'Open' }
    await contactosApi('update_followup', { payload, request_id: id(payload) })
    taskStatus.value = 'Open'
    await refreshFollowups()
    doneMessage.value = 'Seguimiento reabierto.'
  } catch (e) {
    taskError.value = e
  }
}
async function saveNote() {
  noteSaving.value = true
  try {
    const payload = {
      ...sourceRef(selectedSource.value || record.value),
      content: noteDraft.value.text,
    }
    await contactosApi('add_note', { payload, request_id: noteId(payload) })
    clearNote()
    noteDraft.value.text = ''
    await reload()
    noteError.value = null
  } catch (e) {
    noteError.value = e
  } finally {
    noteSaving.value = false
  }
}
async function unlink() {
  try {
    const payload = {
      name: unlinkTarget.value.name,
      modified: unlinkTarget.value.modified,
      confirmed: true,
    }
    await contactosApi('unlink_relation', { payload, request_id: id(payload) })
    unlinkTarget.value = null
    await reload()
  } catch (e) {
    relationError.value = e
  }
}
function openRelated(ref) {
  if (!ref) return
  if (ref.doctype === 'CRM Deal') {
    router.push({
      name: 'Deal',
      params: { dealId: ref.name },
      query: {
        return_to: `/crm/contactos/${encodeURIComponent(nativeRoute.value.source)}/${encodeURIComponent(nativeRoute.value.name)}`,
      },
    })
    return
  }
  router.push(contactoRoute(ref))
}
function goList(segment) {
  router.push({ name: 'Contactos', query: { segment } })
}
function back() {
  router.push({ name: 'Contactos' })
}
function plainText(value) {
  return String(value || '').replace(/<[^>]*>/g, '')
}
async function copyConfiguration() {
  try {
    await navigator.clipboard.writeText(
      'Solicito revisar la instalación y permisos de Doco Marketing para las secciones comerciales de Contactos. No necesito cambiar los permisos de los registros nativos.',
    )
    configurationCopied.value = true
  } catch (e) {
    error.value = new Error(
      'No pudimos copiar la solicitud. Pide al responsable revisar la instalación de Doco Marketing para Contactos.',
    )
  }
}
function formatted(field, value) {
  if (field.fieldtype === 'Check') return value ? 'Sí' : 'No'
  if (value && typeof value === 'object') return 'Revisar registro'
  if (value === '' || value == null) return 'Sin dato'
  return field.fieldtype === 'Select' ? optionLabel(value) : String(value)
}
watch(
  nativeRoute,
  () => {
    record.value = null
    selectedCustomer.value = ''
    selectedPanelContact.value = ''
    addressTargetKey.value = ''
    followups.value = []
    taskGeneration++
    identityOpen.value = false
    addressOpen.value = false
    followupOpen.value = false
    relationOpen.value = false
    tagsOpen.value = false
    roleOpen.value = false
    reload()
  },
  { immediate: true },
)
</script>
