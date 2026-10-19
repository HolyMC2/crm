// The documentos engine's shared record parts for the richer purchase pages
// (Compra orden, Compra solicitud, Gasto factura; Shell SPEC §6 DD2/DD5/DD6/DD7):
// the «⋯» tools sheet, the stepper, «Creado desde», Conexiones and Actividad.
// Those pages keep their own payload and layout; the kit loads the engine's
// record bundle after the page has painted (A2) and runs the same tools as
// DocumentoRecord. One composable, two small components (head and body).
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'frappe-ui'
import { isWide } from '@/composables/breakpoint'
import { docApi, errorText } from '@/documentos/api'
import { loadProfile } from '@/documentos/profiles'
import {
  documentRoute,
  floorRoute,
  listRoute,
  profileFor,
} from '@/documentos/registry'
import {
  confirmCopy,
  copyText,
  deskUrl,
  shareDocument,
  shellUrl,
  toolsFor,
  uploadAttachment,
} from '@/documentos/tools'
import { feminineNoun, kindLabel } from '@/utils/display'

// Packages that land on their own (same discovery as DocumentoRecord).
const AVISAME = import.meta.glob('../avisame.js')
const AJUSTES = import.meta.glob('../../ajustes/ajustes.js')
const PENDIENTES = import.meta.glob('../../pendientes/RecordPendientes.vue')
const ASSISTANT = import.meta.glob('../../assistant/useAssistant.js')

/**
 * `doctype`: the record's doctype; `name`: a getter of its name; `title`: a
 * getter of the party or name the worker reads; `changed`: what to run after a
 * tool changed the document (the page reloads its own payload); `modified`: a
 * getter of the page's own `modified`, so the kit follows the page's saves.
 */
export function useRecordKit(doctype, { name, title, changed, modified } = {}) {
  const route = useRoute()
  const router = useRouter()
  const record = ref(null)
  const profile = shallowRef(null)
  const busy = ref(false)
  const open = ref('') // tools · comment · assign · print · confirm · avisame
  const confirmKind = ref('')
  const confirmError = ref('')
  const avisame = ref(false)
  const ajustes = shallowRef(null)
  const assistant = shallowRef(null)

  const recordName = computed(() => String(name?.() || ''))
  const entry = computed(() => profileFor(doctype))
  const kind = kindLabel(doctype) || doctype
  const noun = feminineNoun(kind)
    ? `la ${kind.toLowerCase()}`
    : `el ${kind.toLowerCase()}`
  const who = computed(() => title?.() || record.value?.header?.title || '')
  const scopeLabel = computed(() =>
    who.value ? `${noun} de ${who.value}` : noun,
  )
  const scopeTitle = computed(() =>
    who.value ? `${kind} de ${who.value}` : kind,
  )
  const link = computed(() => shellUrl(route.path))

  const stages = computed(() =>
    record.value && profile.value?.stages
      ? profile.value.stages(record.value) || null
      : null,
  )

  const extra = computed(() => {
    const out = []
    if (ajustes.value)
      out.push({
        key: 'ajustes',
        label: 'Todos los ajustes',
        icon: 'lucide-sliders-horizontal',
        allowed: true,
        hint: 'Cada campo con lo que hace',
      })
    if (Object.keys(PENDIENTES).length)
      out.push({
        key: 'pendiente',
        label: 'Nuevo pendiente',
        icon: 'lucide-circle-check',
        allowed: true,
        hint: 'Queda ligado a este documento',
      })
    if (assistant.value?.assistantEnabled?.value)
      out.push({
        key: 'preguntar',
        label: 'Pregúntale a Muelle sobre esta ficha',
        icon: 'lucide-sparkles',
        allowed: true,
      })
    return out
  })
  const tools = computed(() =>
    record.value
      ? toolsFor(record.value, {
          wide: isWide.value,
          avisame: avisame.value,
          extra: extra.value,
        })
      : [],
  )
  const confirmCopyFor = computed(() =>
    confirmCopy(confirmKind.value, { noun, title: who.value }),
  )

  let seq = 0
  async function load() {
    if (!recordName.value || recordName.value === 'nuevo') return
    const mine = ++seq
    try {
      const [loaded, own] = await Promise.all([
        docApi('record', { doctype, name: recordName.value }),
        profile.value
          ? profile.value
          : loadProfile({ doctype, entry: entry.value }),
      ])
      if (mine !== seq) return
      profile.value = own
      record.value = loaded
      loadExtras()
    } catch {
      // The page shows its own errors; the kit only stays out of the way.
      if (mine === seq) record.value = null
    }
  }

  async function loadExtras() {
    const [av] = Object.values(AVISAME)
    if (av && !avisame.value) {
      try {
        avisame.value = ((await av()).AVISAME_DOCTYPES || []).includes(doctype)
      } catch {
        avisame.value = false
      }
    }
    const [aj] = Object.values(AJUSTES)
    if (aj && !ajustes.value) {
      try {
        ajustes.value = (await aj()).ajustesRoute || null
      } catch {
        ajustes.value = null
      }
    }
    const [as] = Object.values(ASSISTANT)
    if (as && !assistant.value) {
      try {
        assistant.value = await as()
      } catch {
        assistant.value = null
      }
    }
  }

  function setActivity(activity) {
    if (record.value && activity) record.value = { ...record.value, activity }
  }

  async function after(message) {
    if (message) toast.success(message)
    await load()
    await changed?.()
  }

  function ask(kindKey) {
    confirmKind.value = kindKey
    confirmError.value = ''
    open.value = 'confirm'
  }

  async function doConfirm() {
    const action = confirmKind.value
    busy.value = true
    confirmError.value = ''
    try {
      await docApi('act', { doctype, name: recordName.value, action })
      open.value = ''
      if (action === 'delete') {
        toast.success('Borrador eliminado')
        return router.replace(
          entry.value ? listRoute(entry.value) : floorRoute(doctype),
        )
      }
      await after(action === 'submit' ? 'Confirmado' : 'Cancelado')
    } catch (e) {
      confirmError.value = errorText(e)
    } finally {
      busy.value = false
    }
  }

  const fileInput = ref(null)
  async function onFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    busy.value = true
    try {
      await uploadAttachment({ doctype, name: recordName.value, file })
      await after('Archivo adjuntado')
    } catch (e) {
      toast.error(e?.message || 'No se pudo subir el archivo.')
    } finally {
      busy.value = false
    }
  }

  function onShared(result) {
    if (result === 'copied') toast.success('Enlace copiado')
    else if (result === 'failed') toast.error('No se pudo compartir.')
  }

  async function onTool(key) {
    const nuevo = (query) => {
      const to = documentRoute(doctype, 'nuevo', { hint: record.value?.doc })
      router.push({
        path: to?.path || floorRoute(doctype, 'nuevo').path,
        query,
      })
    }
    switch (key) {
      case 'assign':
      case 'comment':
      case 'print':
      case 'avisame':
        open.value = key
        break
      case 'attach':
        fileInput.value?.click()
        break
      case 'share':
        onShared(
          await shareDocument({
            doctype,
            name: recordName.value,
            title: `${kind} ${recordName.value}`,
            url: link.value,
          }),
        )
        break
      case 'duplicate':
        nuevo({ duplicar: recordName.value })
        break
      case 'amend':
        nuevo({ modificar: recordName.value })
        break
      case 'link':
        if (await copyText(link.value)) toast.success('Enlace copiado')
        else toast.error('No se pudo copiar el enlace')
        break
      case 'cancel':
      case 'delete':
        ask(key)
        break
      case 'ajustes':
        router.push(ajustes.value(doctype, recordName.value))
        break
      case 'pendiente':
        router.push({
          path: '/pendientes',
          query: {
            create: 1,
            reference_type: doctype,
            reference_name: recordName.value,
            reference_label: scopeTitle.value,
            return_to: `/crm${route.fullPath}`,
          },
        })
        break
      case 'preguntar':
        assistant.value?.openAssistant?.({ text: '' })
        break
      case 'desk':
        window.open(deskUrl(doctype, recordName.value), '_blank', 'noopener')
        break
    }
  }

  // After the page painted: the bundle carries Conexiones (get_open_count), so
  // it must never hold up the page's own first paint (SPEC §6.4 A2).
  onMounted(() => {
    const later =
      globalThis.requestIdleCallback || ((fn) => setTimeout(fn, 200))
    later(() => load())
  })
  watch(
    () => modified?.(),
    (now, before) => {
      if (now && before && now !== before && record.value) load()
    },
  )
  // A new order gets its name on save (no name → a name): load then too.
  watch(recordName, (now, before) => {
    if (now && now !== before && now !== 'nuevo') {
      record.value = null
      load()
    }
  })

  return {
    doctype,
    kind,
    record,
    stages,
    printFormats: computed(() => profile.value?.printFormats || null),
    tools,
    busy,
    open,
    confirmCopyFor,
    confirmError,
    scopeLabel,
    scopeTitle,
    noun,
    link,
    recordName,
    fileInput,
    avisame,
    load,
    onTool,
    onFile,
    onShared,
    doConfirm,
    setActivity,
    after,
    openTools: () => {
      if (record.value) open.value = 'tools'
    },
  }
}
