<template>
  <ContactosLayout segment="duplicates" @select="selectSegment">
    <!-- A sub-page of Contactos: up to the list in the one bar (Shell S4.2). -->
    <AppBar
      v-if="isPhone"
      :back="{ name: 'Contactos' }"
      back-label="Contactos"
      context="Contactos"
      title="Posibles duplicados"
      :loading="loading"
    />
    <div class="c-dup">
      <header v-if="!isPhone" class="c-dup-head">
        <div>
          <h1>Posibles duplicados</h1>
          <p>
            Contactos con el mismo teléfono o correo. Compara y decide: nada se
            fusiona sin tu confirmación, y al fusionar se conservan sus tratos,
            órdenes, facturas, conversaciones y archivos.
          </p>
        </div>
        <Button
          label="Actualizar"
          icon-left="refresh-cw"
          :loading="loading"
          @click="load(0)"
        />
      </header>

      <RecoveryMessage
        :error="error"
        action="revisar duplicados"
        @retry="load(cursor)"
      />

      <div v-if="loading && !groups.length" class="c-empty" role="status">
        <h2>Buscando contactos repetidos…</h2>
      </div>
      <div
        v-else-if="!error && !groups.length"
        class="c-empty"
        data-testid="dup-empty"
      >
        <h2>No hay duplicados por revisar</h2>
        <p>
          Cuando dos contactos compartan teléfono o correo aparecerán aquí.
          <RouterLink to="/contactos">Volver a Contactos</RouterLink>
        </p>
      </div>

      <p v-if="total" class="c-dup-count" role="status">
        {{ total === 1 ? '1 grupo' : `${total} grupos` }} por revisar
        <span v-if="partial"> (lista parcial)</span>
        <span v-if="isPhone" class="block text-ink-gray-6"
          >Nada se fusiona sin tu confirmación.</span
        >
      </p>

      <ul class="c-dup-list">
        <li
          v-for="group in groups"
          :key="group.key"
          class="c-dup-group"
          data-testid="dup-group"
        >
          <div class="c-dup-meta">
            <Badge
              :label="strength(group).label"
              :theme="strength(group).theme"
              variant="subtle"
            />
            <span
              v-for="reason in group.reasons"
              :key="reason.kind + reason.key"
            >
              {{ reasonLabel(reason) }}
            </span>
          </div>
          <div class="c-dup-members">
            <label
              v-for="member in group.members"
              :key="member.name"
              class="c-dup-member"
            >
              <input
                v-if="group.members.length > 2"
                v-model="picked[group.key]"
                type="checkbox"
                :value="member.name"
                :aria-label="`Comparar ${member.title}`"
              />
              <span>
                <RouterLink
                  :to="`/contactos/contact/${encodeURIComponent(member.name)}`"
                  ><strong>{{ member.title }}</strong></RouterLink
                >
                <small>{{
                  [member.mobile_no, member.email_id]
                    .filter(Boolean)
                    .join(' · ') || 'Sin teléfono principal'
                }}</small>
                <small>{{ linkSummary(member.links) }}</small>
              </span>
            </label>
          </div>
          <div class="c-actions">
            <Button
              :variant="isPhone ? 'subtle' : 'solid'"
              label="Comparar y fusionar"
              :disabled="pair(group).length !== 2"
              @click="openCompare(group)"
            />
            <Button
              :variant="isPhone ? 'ghost' : 'subtle'"
              label="No son la misma persona"
              :disabled="pair(group).length !== 2"
              :loading="dismissing === group.key"
              @click="markDifferent(group)"
            />
            <small v-if="group.members.length > 2 && pair(group).length !== 2">
              Elige dos contactos para compararlos.
            </small>
          </div>
        </li>
      </ul>

      <div v-if="nextCursor !== null || cursor > 0" class="c-actions">
        <Button
          v-if="cursor > 0"
          label="Anteriores"
          @click="load(Math.max(cursor - PAGE, 0))"
        />
        <Button
          v-if="nextCursor !== null"
          label="Siguientes"
          @click="load(nextCursor)"
        />
      </div>
    </div>

    <Dialog
      v-model="compareOpen"
      :options="{ title: 'Comparar y fusionar', size: '4xl' }"
    >
      <template #body-content>
        <div v-if="previewLoading" role="status">Cargando ambos registros…</div>
        <RecoveryMessage
          :error="previewError"
          action="comparar contactos"
          @retry="loadPreview"
        />
        <div v-if="preview" class="c-dup-compare" data-testid="dup-compare">
          <p class="c-dup-shared">
            {{
              preview.shared.length
                ? 'Comparten: ' +
                  preview.shared
                    .map((item) =>
                      item.kind === 'email'
                        ? `correo ${item.label}`
                        : `teléfono ${item.label}`,
                    )
                    .join(', ')
                : 'No comparten teléfono ni correo.'
            }}
            <template v-if="!preview.names_agree">
              Los nombres no coinciden: confirma que es la misma persona.
            </template>
            <template v-if="preview.marked_different">
              Alguien los marcó como personas distintas; fusionar quita esa
              marca.
            </template>
          </p>
          <div class="c-dup-sides">
            <section
              v-for="side in sides"
              :key="side.name"
              :class="['c-dup-side', { keep: side.name === keepName }]"
            >
              <label class="c-dup-keep">
                <input
                  v-model="keepName"
                  type="radio"
                  name="dup-keep"
                  :value="side.name"
                  @change="loadPreview"
                />
                {{
                  side.name === keepName
                    ? 'Se conserva este registro'
                    : 'Este registro se borrará'
                }}
              </label>
              <h3>{{ side.title }}</h3>
              <dl>
                <dt>Teléfonos</dt>
                <dd>{{ phones(side) || '—' }}</dd>
                <dt>Correos</dt>
                <dd>{{ emails(side) || '—' }}</dd>
                <dt>Vinculado a</dt>
                <dd>{{ linkSummary(side.links, 8) }}</dd>
                <dt>Actualizado</dt>
                <dd>{{ side.modified?.slice(0, 16) }}</dd>
              </dl>
            </section>
          </div>
          <fieldset v-if="choices.length" class="c-dup-choices">
            <legend>Datos diferentes: ¿cuál conservar?</legend>
            <div v-for="field in choices" :key="field" class="c-dup-choice">
              <span>{{ FIELD_LABELS[field] || field }}</span>
              <label
                ><input
                  v-model="fieldChoice[field]"
                  type="radio"
                  :name="`dup-${field}`"
                  value="target"
                />{{
                  keepSide?.fields?.[field]
                    ? shown(field, keepSide.fields[field])
                    : '(vacío)'
                }}</label
              >
              <label
                ><input
                  v-model="fieldChoice[field]"
                  type="radio"
                  :name="`dup-${field}`"
                  value="source"
                />{{ shown(field, dropSide?.fields?.[field]) }}</label
              >
            </div>
          </fieldset>
          <p class="c-dup-warning">
            «{{ dropSide?.title }}» se borrará. Sus teléfonos, correos, tratos,
            órdenes, facturas, conversaciones y archivos pasarán a «{{
              keepSide?.title
            }}». Queda una copia en Documentos borrados.
          </p>
          <p v-if="!preview.can_merge" class="c-dup-warning" role="alert">
            {{ preview.reason }}
          </p>
          <RecoveryMessage
            :error="mergeError"
            action="fusionar contactos"
            :on-reload="loadPreview"
            @retry="merge"
          />
        </div>
      </template>
      <template #actions>
        <div class="c-actions">
          <Button
            variant="solid"
            theme="red"
            label="Fusionar"
            :disabled="!preview || !preview.can_merge"
            :loading="merging"
            @click="merge"
          />
          <Button label="Cancelar" @click="compareOpen = false" />
        </div>
      </template>
    </Dialog>
  </ContactosLayout>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { Badge, Button, Dialog, toast } from 'frappe-ui'
import ContactosLayout from '@/components/contactos/ContactosLayout.vue'
import { AppBar } from '@/components/ui'
import { isMobile as isPhone } from '@/composables/breakpoint'
import RecoveryMessage from '@/components/contactos/RecoveryMessage.vue'
import { contactosApi, useContactosDraft } from '@/composables/useContactos'
import {
  FIELD_LABELS,
  STRENGTH,
  defaultSurvivor,
  differingFields,
  linkSummary,
  mergePayload,
  reasonLabel,
} from '@/utils/duplicateReview'

const PAGE = 20
const router = useRouter()
const { id } = useContactosDraft('duplicate-review')
const groups = ref([])
const total = ref(0)
const partial = ref(false)
const cursor = ref(0)
const nextCursor = ref(null)
const loading = ref(false)
const error = ref(null)
const picked = reactive({})
const dismissing = ref(null)

const strength = (group) => STRENGTH[group.strength] || STRENGTH.shared_phone

function pair(group) {
  if (group.members.length === 2) return group.members.map((m) => m.name)
  return picked[group.key] || []
}

async function load(at = 0) {
  loading.value = true
  error.value = null
  try {
    const page = await contactosApi('duplicates', { cursor: at, page: PAGE })
    groups.value = page.groups || []
    total.value = page.total || 0
    partial.value = !!page.partial
    cursor.value = at
    nextCursor.value = page.next_cursor ?? null
    for (const group of groups.value)
      if (group.members.length > 2 && !picked[group.key])
        picked[group.key] = group.members.slice(0, 2).map((m) => m.name)
  } catch (e) {
    error.value = e
  } finally {
    loading.value = false
  }
}

function selectSegment(value) {
  if (value !== 'duplicates')
    router.push({ path: '/contactos', query: { segment: value } })
}

async function markDifferent(group) {
  const [left, right] = pair(group)
  dismissing.value = group.key
  error.value = null
  try {
    const payload = { left, right, confirmed: true }
    await contactosApi('mark_different', { payload, request_id: id(payload) })
    toast.success('Listo: no se volverán a sugerir juntos.')
    await load(cursor.value)
  } catch (e) {
    error.value = e
  } finally {
    dismissing.value = null
  }
}

// Side-by-side review
const compareOpen = ref(false)
const compareGroup = ref(null)
const preview = ref(null)
const previewLoading = ref(false)
const previewError = ref(null)
const keepName = ref(null)
const fieldChoice = reactive({})
const merging = ref(false)
const mergeError = ref(null)

const sides = computed(() =>
  preview.value ? [preview.value.target, preview.value.source] : [],
)
const keepSide = computed(() =>
  sides.value.find((side) => side.name === keepName.value),
)
const dropSide = computed(() =>
  sides.value.find((side) => side.name !== keepName.value),
)
const choices = computed(() =>
  differingFields(preview.value?.choosable, keepSide.value, dropSide.value),
)
// Every differing field starts on the kept record's value; the person moves what they want.
watch(choices, (fields) => {
  for (const field of fields)
    if (!fieldChoice[field]) fieldChoice[field] = 'target'
})
// Option values such as gender are stored in English.
const shown = (field, value) =>
  field === 'gender' || field === 'salutation' ? __(value) : value

function openCompare(group) {
  compareGroup.value = group
  const [a, b] = pair(group)
  const members = group.members.filter((m) => [a, b].includes(m.name))
  keepName.value = defaultSurvivor(members).name
  compareOpen.value = true
  loadPreview()
}

async function loadPreview() {
  const [a, b] = pair(compareGroup.value)
  const target = keepName.value
  const source = target === a ? b : a
  previewLoading.value = true
  previewError.value = null
  mergeError.value = null
  preview.value = null
  for (const key of Object.keys(fieldChoice)) delete fieldChoice[key]
  try {
    preview.value = await contactosApi('duplicate_preview', { source, target })
  } catch (e) {
    previewError.value = e
  } finally {
    previewLoading.value = false
  }
}

const channel = (side, table, field) =>
  (side.fields?.[table] || [])
    .map((row) => row[field])
    .filter(Boolean)
    .join(', ')
const phones = (side) =>
  channel(side, 'phone_nos', 'phone') || side.fields?.mobile_no
const emails = (side) =>
  channel(side, 'email_ids', 'email_id') || side.fields?.email_id

async function merge() {
  if (!preview.value?.can_merge) return
  merging.value = true
  mergeError.value = null
  try {
    const payload = mergePayload(keepSide.value, dropSide.value, fieldChoice)
    const result = await contactosApi('merge_contacts', {
      payload,
      request_id: id(payload),
    })
    compareOpen.value = false
    const survivor = result?.merged_into?.name || keepSide.value.name
    toast.success(`Contactos fusionados en «${keepSide.value.title}».`)
    groups.value = groups.value.filter(
      (group) => group.key !== compareGroup.value.key,
    )
    total.value = Math.max(total.value - 1, 0)
    router.push(`/contactos/contact/${encodeURIComponent(survivor)}`)
  } catch (e) {
    mergeError.value = e
  } finally {
    merging.value = false
  }
}

load(0)
</script>
<style scoped>
.c-dup {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  max-width: 960px;
}
.c-dup-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.c-dup-head h1 {
  font-size: 18px;
  font-weight: 600;
}
.c-dup-head p,
.c-dup-count {
  color: var(--ink-gray-6, #555);
  font-size: 13px;
}
.c-dup-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.c-dup-group {
  border: 1px solid var(--outline-gray-2, #e5e5e5);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.c-dup-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  font-size: 12px;
}
.c-dup-members {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px;
}
.c-dup-member {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.c-dup-member > span {
  display: flex;
  flex-direction: column;
}
.c-dup-member small,
.c-actions small {
  color: var(--ink-gray-6, #555);
}
.c-dup-sides {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}
.c-dup-side {
  border: 1px solid var(--outline-gray-2, #e5e5e5);
  border-radius: 8px;
  padding: 12px;
}
.c-dup-side.keep {
  border-color: var(--outline-green-3, #3a9b5c);
}
.c-dup-side dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 12px;
  font-size: 13px;
}
.c-dup-side dt {
  color: var(--ink-gray-6, #555);
}
.c-dup-keep {
  display: flex;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
}
.c-dup-choices {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}
.c-dup-choice {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.c-dup-choice > span {
  min-width: 110px;
  color: var(--ink-gray-6, #555);
}
.c-dup-shared,
.c-dup-warning {
  font-size: 13px;
  margin: 8px 0;
}
.c-dup-warning {
  color: var(--ink-red-4, #b42318);
}
</style>
