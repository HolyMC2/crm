<template>
  <Dialog
    v-model="open"
    :options="{ title: 'Revisar y vincular registros', size: 'lg' }"
    ><template #body-content
      ><div class="c-editor">
        <p>
          Confirma el tipo de relación. Representar a una empresa o pagar por
          otra persona conserva ambas identidades separadas.
        </p>
        <RecoveryMessage
          :error="error"
          action="vincular registros de origen"
          @retry="search"
        />
        <FormControl
          v-model="query"
          label="Buscar el otro registro"
          placeholder="Nombre, teléfono o correo"
          @update:model-value="search"
        />
        <div class="c-candidates">
          <label
            v-for="row in rows"
            :key="row.source + row.name"
            class="c-candidate"
            ><input
              v-model="chosen"
              type="radio"
              name="relation-choice"
              :value="row.source + ':' + row.name"
            /><span
              >{{ row.title
              }}<small
                >{{ identityTypeLabel(row) }} ·
                {{ sourceLabel(row.source) }}</small
              ></span
            ></label
          >
          <p v-if="query && !rows.length && !loading">
            No encontramos coincidencias. Cambia la búsqueda.
          </p>
        </div>
        <FormControl
          v-model="kind"
          type="select"
          label="Relación"
          :options="kinds"
        />
        <div v-if="chosen" class="c-inset">
          <h3>Qué cambiará</h3>
          <p>
            {{
              kind.startsWith('same_')
                ? 'Ambos registros se mostrarán como una identidad confirmada. Sus datos nativos conservarán su origen.'
                : 'Se mostrará un vínculo entre los dos registros. Cada identidad conserva su propia ficha.'
            }}
          </p>
          <FormControl
            v-model="confirmed"
            type="checkbox"
            label="Revisé los registros y confirmo esta relación"
          />
        </div>
        <div class="c-actions c-editor-footer">
          <Button label="Cancelar" @click="open = false" /><Button
            label="Guardar vínculo"
            variant="solid"
            :loading="saving"
            :disabled="!chosen || !confirmed"
            @click="save"
          />
        </div></div></template
  ></Dialog>
</template>
<script setup>
import { computed, ref } from 'vue'
import { contactosApi, useContactosDraft } from '@/composables/useContactos'
import {
  SOURCE_TYPES,
  sourceRef,
  sourceLabel,
  identityTypeLabel,
} from '@/utils/contactos'
import RecoveryMessage from './RecoveryMessage.vue'
const props = defineProps({
  modelValue: Boolean,
  source: { type: Object, required: true },
  kind: String,
})
const emit = defineEmits(['update:modelValue', 'saved'])
const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})
const query = ref(''),
  rows = ref([]),
  chosen = ref(''),
  kind = ref(props.kind === 'company' ? 'same_company' : 'same_person'),
  confirmed = ref(false),
  loading = ref(false),
  saving = ref(false),
  error = ref(null)
const { id, clear } = useContactosDraft(`relation:${props.source.name}`)
let generation = 0
const kinds = [
  { value: 'same_person', label: 'Es la misma persona' },
  { value: 'same_company', label: 'Es la misma empresa' },
  { value: 'represents', label: 'Este registro representa al seleccionado' },
  { value: 'payer_for', label: 'Este registro paga por el seleccionado' },
]
async function search() {
  const own = ++generation
  if (query.value.trim().length < 2) {
    rows.value = []
    return
  }
  loading.value = true
  try {
    const result = await contactosApi('search', { q: query.value.trim() })
    if (own === generation)
      rows.value = (result.rows || []).filter(
        (row) =>
          row.source !== sourceRef(props.source).source ||
          row.name !== props.source.name,
      )
  } catch (e) {
    if (own === generation) error.value = e
  } finally {
    if (own === generation) loading.value = false
  }
}
async function save() {
  saving.value = true
  try {
    const row = rows.value.find((r) => r.source + ':' + r.name === chosen.value)
    const other = await contactosApi('get_record', sourceRef(row))
    const current = await contactosApi('get_record', sourceRef(props.source))
    const endpoint = (record) => ({
      doctype: record.doctype || SOURCE_TYPES[record.source],
      name: record.name,
      modified:
        record.modified ||
        record.versions?.[
          `${record.doctype || SOURCE_TYPES[record.source]}:${record.name}`
        ],
    })
    const payload = {
      left: endpoint(current),
      right: endpoint(other),
      kind: kind.value,
      confirmed: confirmed.value,
    }
    const result = await contactosApi('save_relation', {
      payload,
      request_id: id(payload),
    })
    clear()
    emit('saved', result)
    open.value = false
  } catch (e) {
    error.value = e
  } finally {
    saving.value = false
  }
}
</script>
