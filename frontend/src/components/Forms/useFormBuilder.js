// State + actions for one form in the builder. Extracted from the old
// FormBuilderPanel so the canvas, the side panels and the live preview share a
// single model: `form.fields` (flat Web Form rows) is the source of truth, derived
// into draggable sections → columns → fields for the canvas and re-flattened
// after every structural change.
import { call, createResource, toast } from 'frappe-ui'
import { globalStore } from '@/stores/global'
import { useTelemetry } from 'frappe-ui/frappe'
import { reactive, ref, computed } from 'vue'
import { BREAK_TYPES, readiness, isPublishable } from './formModel'

// provide/inject key: the page owns the model, panels read and change it
export const FORM_BUILDER = Symbol('form-builder')

// a section can hold this many columns before it gets too cramped to build/fill
export const MAX_COLUMNS = 4

export const targetOptions = () => [
  { label: __('Lead'), value: 'CRM Lead' },
  { label: __('Deal'), value: 'CRM Deal' },
]
export const docLabel = (dt) =>
  targetOptions().find((o) => o.value === dt)?.label || dt

function uid(fieldtype) {
  const p = fieldtype === 'Section Break' ? 'section_break_' : 'column_break_'
  return p + Math.random().toString(36).slice(2, 8)
}
export function makeMarker(fieldtype) {
  return {
    fieldname: uid(fieldtype),
    label: '',
    fieldtype,
    options: '',
    reqd: false,
    placeholder: '',
    field_description: '',
  }
}

const SETTINGS_DEFAULTS = {
  language: '',
  template: '',
  assign_mode: 'rules',
  assign_to: '',
  notify_users: [],
  notify_mode: 'instant',
  campaign: '',
  consent_enabled: 0,
  consent_text: '',
}

export function useFormBuilder(name) {
  const { $dialog } = globalStore()
  const { capture } = useTelemetry()

  const loaded = ref(false)
  const saving = ref(false)
  const dirty = ref(false)
  const savedPublished = ref(false)

  const form = reactive({
    name,
    title: '',
    route: '',
    document_type: 'CRM Lead',
    description: '',
    submit_button_label: 'Submit',
    success_message: '',
    redirect_url: '',
    allowed_embedding_domains: '',
    published: 0,
    fields: [],
  })
  const settings = reactive({ ...SETTINGS_DEFAULTS })
  // doctype-mandatory fields kept off the visible form; each carries the value
  // applied on submission so the record can still be created
  const hiddenFields = ref([])
  // rows a CRM form can't collect (a Web Form built in Desk): read-only until copied clean
  const incompatible = ref([])
  const sections = ref([])
  const expanded = ref(null)

  function markDirty() {
    dirty.value = true
  }

  // extra settings owned by other modules (e.g. the channel settings of the
  // doco_marketing addon) save together with the form, after it
  const savers = []
  function registerSaver(fn) {
    savers.push(fn)
  }

  // ── field catalog ─────────────────────────────────────────────────────────
  const availableFields = createResource({
    url: 'crm.api.form.get_form_fields',
    makeParams: () => ({ document_type: form.document_type }),
  })
  const options = createResource({
    url: 'crm.api.form.get_form_options',
    makeParams: () => ({ document_type: form.document_type }),
  })
  const mandatorySet = computed(
    () =>
      new Set(
        (availableFields.data || [])
          .filter((f) => f.reqd)
          .map((f) => f.fieldname),
      ),
  )
  const isMandatory = (fieldname) => mandatorySet.value.has(fieldname)
  const catalogDefault = (fieldname) =>
    (availableFields.data || []).find((f) => f.fieldname === fieldname)
      ?.default || ''

  // unused target fields for the picker; system fields grouped under "More"
  const availableFieldOptions = computed(() => {
    const used = new Set(form.fields.map((f) => f.fieldname))
    const unused = (availableFields.data || []).filter(
      (f) => !used.has(f.fieldname),
    )
    const toOption = (af) => ({ label: __(af.label), value: af.fieldname, af })
    const everyday = unused.filter((f) => !f.advanced).map(toOption)
    const advanced = unused.filter((f) => f.advanced).map(toOption)
    return [
      { group: __('Fields'), options: everyday },
      ...(advanced.length
        ? [{ group: __('More fields'), options: advanced }]
        : []),
    ]
  })

  // ── Link fields: preview options + guest access ─────────────────────────
  const linkOptions = reactive({})
  async function ensureLinkOptions(doctype) {
    if (!doctype || linkOptions[doctype]) return
    linkOptions[doctype] = []
    try {
      const rows = await call('frappe.client.get_list', {
        doctype,
        fields: ['name'],
        limit_page_length: 0,
        order_by: 'name asc',
      })
      linkOptions[doctype] = (rows || []).map((r) => r.name)
    } catch {
      linkOptions[doctype] = []
    }
  }
  const guestSelect = reactive({})
  const grantingSelect = reactive({})
  async function ensureGuestSelect(doctype) {
    if (!doctype || doctype in guestSelect) return
    guestSelect[doctype] = true
    try {
      const res = await call('crm.api.form.link_field_guest_access', {
        doctype,
      })
      guestSelect[doctype] = !!res?.guest_can_select
    } catch {
      guestSelect[doctype] = true
    }
  }
  async function grantGuestSelect(doctype) {
    if (!doctype || grantingSelect[doctype]) return
    grantingSelect[doctype] = true
    try {
      const res = await call('crm.api.form.grant_guest_link_access', {
        doctype,
      })
      guestSelect[doctype] = !!res?.guest_can_select
      if (guestSelect[doctype]) {
        delete linkOptions[doctype]
        ensureLinkOptions(doctype)
        toast.success(__('Guests can now select {0} records.', [doctype]))
      }
    } catch (e) {
      toast.error(e?.messages?.[0] || __('Could not grant guest access.'))
    } finally {
      grantingSelect[doctype] = false
    }
  }
  function ensureLinkMeta(doctype) {
    ensureLinkOptions(doctype)
    ensureGuestSelect(doctype)
  }

  // ── sections model ────────────────────────────────────────────────────────
  const newColumn = (colField = null) => ({ colField, items: [] })
  const newSection = (secField = null) => ({
    secField: secField || makeMarker('Section Break'),
    columns: [newColumn()],
    editingLabel: false,
  })

  function rebuildModel() {
    const secs = []
    let cur = null
    const ensureSection = () => {
      if (!cur) {
        cur = newSection()
        secs.push(cur)
      }
      return cur
    }
    for (const f of form.fields || []) {
      if (f.fieldtype === 'Section Break') {
        cur = newSection(f)
        secs.push(cur)
      } else if (f.fieldtype === 'Column Break') {
        ensureSection().columns.push(newColumn(f))
      } else {
        const sec = ensureSection()
        sec.columns[sec.columns.length - 1].items.push(f)
      }
    }
    if (!secs.length) secs.push(newSection())
    sections.value = secs
  }

  function flattenModel() {
    const out = []
    for (const sec of sections.value) {
      out.push(sec.secField)
      sec.columns.forEach((col, i) => {
        if (i === 0) col.colField = null
        else if (!col.colField) col.colField = makeMarker('Column Break')
        if (col.colField) out.push(col.colField)
        for (const f of col.items) out.push(f)
      })
    }
    return out
  }

  function syncFromModel() {
    form.fields = flattenModel()
    markDirty()
  }

  function addFieldToColumn(col, option) {
    const af = option?.af || option
    if (!af?.fieldname) return
    expanded.value = null
    hiddenFields.value = hiddenFields.value.filter(
      (h) => h.fieldname !== af.fieldname,
    )
    col.items.push({
      fieldname: af.fieldname,
      label: __(af.label),
      fieldtype: af.fieldtype,
      options: af.options,
      reqd: !!af.reqd,
      placeholder: '',
      field_description: '',
      depends_on: '',
      mandatory_depends_on: '',
      read_only_depends_on: '',
    })
    if (af.fieldtype === 'Link') ensureLinkMeta(af.options)
    capture('form_field_added', { field_type: af.fieldtype })
    syncFromModel()
  }

  function addSection() {
    form.fields.push(makeMarker('Section Break'))
    rebuildModel()
    markDirty()
  }

  function addColumn(cols) {
    if (cols.length >= MAX_COLUMNS) {
      toast.info(__('A section can have up to {0} columns', [MAX_COLUMNS]))
      return
    }
    cols.push(newColumn())
    syncFromModel()
  }

  function removeLastColumn(cols) {
    if (cols.length <= 1) return
    const last = cols[cols.length - 1]
    const prev = cols[cols.length - 2]
    if (last.items.length) prev.items.push(...last.items)
    cols.pop()
    syncFromModel()
  }

  function removeBreak(marker) {
    form.fields = form.fields.filter((x) => x !== marker)
    rebuildModel()
    markDirty()
  }

  function updateField(f, patch) {
    Object.assign(f, patch)
    markDirty()
  }

  function removeField(f) {
    form.fields = form.fields.filter((x) => x !== f)
    if (expanded.value === f.fieldname) expanded.value = null
    // a mandatory field isn't deleted — it moves to the hidden fields so its
    // value can still be supplied on submission
    if (
      isMandatory(f.fieldname) &&
      !BREAK_TYPES.includes(f.fieldtype) &&
      !hiddenFields.value.some((h) => h.fieldname === f.fieldname)
    ) {
      hiddenFields.value.push({
        fieldname: f.fieldname,
        label: f.label,
        fieldtype: f.fieldtype,
        options: f.options || '',
        default: catalogDefault(f.fieldname),
      })
      toast.info(
        __('{0} is now hidden. Set the value it should get.', [
          f.label || f.fieldname,
        ]),
      )
    }
    rebuildModel()
    markDirty()
  }

  function setHiddenDefault(h, value) {
    h.default = value
    markDirty()
  }

  // ── doctype switch (Creates: Lead | Deal) ────────────────────────────────
  async function requestDoctypeChange(newDt) {
    if (!newDt || newDt === form.document_type) return
    const fields = await call('crm.api.form.get_form_fields', {
      document_type: newDt,
    })
    const valid = new Set((fields || []).map((f) => f.fieldname))
    const wouldDrop = form.fields.filter(
      (f) => !BREAK_TYPES.includes(f.fieldtype) && !valid.has(f.fieldname),
    ).length
    if (!wouldDrop) return commitDoctype(newDt, valid)
    $dialog({
      title: __('Change what this form creates?'),
      message: __(
        "Switching to {0} will remove {1} field(s) that don't exist on {0}.",
        [docLabel(newDt), wouldDrop],
      ),
      variant: 'danger',
      actions: [
        {
          label: __('Switch and remove fields'),
          variant: 'solid',
          theme: 'red',
          onClick: (close) => {
            commitDoctype(newDt, valid)
            close()
          },
        },
      ],
    })
  }

  async function commitDoctype(newDt, valid) {
    form.document_type = newDt
    expanded.value = null
    await availableFields.reload()
    options.reload()
    const before = form.fields.length
    form.fields = form.fields.filter(
      (f) => BREAK_TYPES.includes(f.fieldtype) || valid.has(f.fieldname),
    )
    const dropped = before - form.fields.length
    const catalog = new Map(
      (availableFields.data || []).map((f) => [f.fieldname, f]),
    )
    form.fields.forEach((f) => {
      const c = catalog.get(f.fieldname)
      if (!c) return
      f.options = c.options
      if (c.reqd) f.reqd = true
      if (f.fieldtype === 'Link') ensureLinkMeta(f.options)
    })
    const newHidden = await call('crm.api.form.get_hidden_seed', {
      document_type: newDt,
    })
    const stillMandatory = hiddenFields.value.filter(
      (h) => catalog.has(h.fieldname) && mandatorySet.value.has(h.fieldname),
    )
    hiddenFields.value = [
      ...(newHidden || []).map((h) => ({
        fieldname: h.fieldname,
        label: h.label,
        fieldtype: h.fieldtype,
        options: h.options || '',
        default: h.default ?? '',
      })),
      ...stillMandatory,
    ]
    hiddenFields.value.forEach((h) => {
      if (h.fieldtype === 'Link') ensureLinkOptions(h.options)
    })
    // follow-up campaigns only enroll leads
    if (newDt !== 'CRM Lead') settings.campaign = ''
    rebuildModel()
    markDirty()
    if (dropped) {
      toast.info(
        __('{0} field(s) removed. Not available on {1}.', [
          dropped,
          docLabel(newDt),
        ]),
      )
    }
  }

  // ── readiness ─────────────────────────────────────────────────────────────
  const checklist = computed(() =>
    readiness({ form, hiddenFields: hiddenFields.value, settings }),
  )
  const publishable = computed(() => isPublishable(checklist.value))

  // ── load / save ───────────────────────────────────────────────────────────
  const config = createResource({
    url: 'crm.api.form.get_form_config',
    params: { name },
    auto: true,
    onSuccess: (doc) => {
      Object.assign(form, {
        title: doc.title || '',
        route: doc.route || '',
        document_type: doc.document_type || 'CRM Lead',
        description: doc.description || '',
        submit_button_label: doc.submit_button_label || 'Submit',
        success_message: doc.success_message || '',
        redirect_url: doc.redirect_url || '',
        allowed_embedding_domains: doc.allowed_embedding_domains || '',
        published: doc.published || 0,
      })
      savedPublished.value = !!form.published
      incompatible.value = doc.incompatible_fields || []
      form.fields = (doc.fields || []).map((f) => ({
        name: f.name,
        fieldname: f.fieldname,
        label: f.label,
        fieldtype: f.fieldtype,
        options: f.options,
        reqd: !!f.reqd,
        placeholder: f.placeholder,
        field_description: f.field_description,
        depends_on: f.depends_on || '',
        mandatory_depends_on: f.mandatory_depends_on || '',
        read_only_depends_on: f.read_only_depends_on || '',
      }))
      hiddenFields.value = (doc.hidden_fields || []).map((h) => ({
        fieldname: h.fieldname,
        label: h.label,
        fieldtype: h.fieldtype,
        options: h.options || '',
        default: h.default ?? '',
      }))
      Object.assign(settings, SETTINGS_DEFAULTS, doc.settings || {})
      settings.notify_users = [...(doc.settings?.notify_users || [])]
      hiddenFields.value.forEach((h) => {
        if (h.fieldtype === 'Link') ensureLinkOptions(h.options)
      })
      form.fields.forEach((f) => {
        if (f.fieldtype === 'Link') ensureLinkMeta(f.options)
      })
      rebuildModel()
      loaded.value = true
      dirty.value = false
      availableFields.reload()
      options.reload()
    },
  })

  function payload() {
    return {
      title: form.title,
      route: form.route,
      document_type: form.document_type,
      description: form.description,
      submit_button_label: form.submit_button_label,
      success_message: form.success_message,
      redirect_url: form.redirect_url,
      allowed_embedding_domains: form.allowed_embedding_domains,
      published: form.published ? 1 : 0,
      fields: form.fields.map((f) => ({
        fieldname: f.fieldname,
        label: f.label,
        fieldtype: f.fieldtype,
        options: f.options,
        reqd: f.reqd ? 1 : 0,
        placeholder: f.placeholder,
        field_description: f.field_description,
        depends_on: f.depends_on || '',
        mandatory_depends_on: f.mandatory_depends_on || '',
        read_only_depends_on: f.read_only_depends_on || '',
      })),
      hidden_fields: hiddenFields.value.map((h) => ({
        fieldname: h.fieldname,
        label: h.label,
        fieldtype: h.fieldtype,
        options: h.options,
        default: h.default,
      })),
      settings: { ...settings, notify_users: [...settings.notify_users] },
    }
  }

  async function save() {
    if (saving.value) return false
    if (incompatible.value.length) {
      toast.error(
        __(
          'This form was made outside the builder. Duplicate it as a clean form to edit it.',
        ),
      )
      return false
    }
    if (form.published && !publishable.value) {
      toast.error(__('Finish the checklist before this form can stay live.'))
      return false
    }
    saving.value = true
    form.fields = flattenModel()
    try {
      const doc = await call('crm.api.form.save_form', {
        name: form.name,
        form: payload(),
      })
      form.route = doc.route
      for (const saver of savers) await saver()
      if (form.published && !savedPublished.value) {
        capture('form_published', { source: 'builder' })
      }
      savedPublished.value = !!form.published
      dirty.value = false
      return true
    } catch (e) {
      toast.error(e?.messages?.[0] || e?.message || __('Could not save'))
      return false
    } finally {
      saving.value = false
    }
  }

  // Publish / unpublish saves right away: going live is a decision, not a draft edit
  async function setPublished(value) {
    const previous = form.published
    form.published = value ? 1 : 0
    const ok = await save()
    if (!ok) form.published = previous
    else toast.success(value ? __('Form published') : __('Form unpublished'))
    return ok
  }

  return {
    loaded,
    saving,
    dirty,
    savedPublished,
    form,
    settings,
    hiddenFields,
    incompatible,
    sections,
    expanded,
    config,
    availableFields,
    availableFieldOptions,
    options,
    linkOptions,
    guestSelect,
    grantingSelect,
    checklist,
    publishable,
    markDirty,
    registerSaver,
    isMandatory,
    ensureLinkMeta,
    grantGuestSelect,
    syncFromModel,
    rebuildModel,
    addFieldToColumn,
    addSection,
    addColumn,
    removeLastColumn,
    removeBreak,
    updateField,
    removeField,
    setHiddenDefault,
    requestDoctypeChange,
    save,
    setPublished,
  }
}
