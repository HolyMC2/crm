// What a stage (CRM Deal Status / CRM Lead Status) reads as on screen.
//
// A stage name is DATA: it is the record's ID, it is written on every deal and
// lead, and a tenant may rename a stage or add its own. The standard names that
// ship with the apps (CRM's «Qualification», «Won»…, taller's English set) carry
// a catalog entry, so they show in the worker's language; a renamed or custom
// stage has none and __() hands it back unchanged. Only the drawn label changes:
// filters, writes, colours and comparisons keep the stored name.
//
// Both doctypes are translated doctypes (translated_doctype = 1), the switch
// Frappe and the upstream pages honour (utils/index.js isTranslatable): a site
// that turns it off sees its stored names.
export const DEAL_STATUS = 'CRM Deal Status'
export const LEAD_STATUS = 'CRM Lead Status'

export function stageLabel(name, doctype = DEAL_STATUS) {
  if (!name) return ''
  const translated = globalThis.window?.translated_doctypes || []
  if (!translated.includes(doctype)) return name
  return typeof globalThis.__ === 'function' ? globalThis.__(name) : name
}

// The stage of a record in a list that mixes leads and deals.
export function recordStageLabel(name, referenceDoctype) {
  return stageLabel(
    name,
    referenceDoctype === 'CRM Lead' ? LEAD_STATUS : DEAL_STATUS,
  )
}

// What a pipeline (CRM Pipeline) reads as on screen.
//
// Its name is DATA as well: pipeline_name is a field a manager edits. CRM's
// pipeline migration creates one pipeline with an English name (server twin:
// crm/pipeline/labels.py); that exact name carries a catalog entry and is drawn
// in the worker's language. Any other name, including the migrated pipeline
// once a manager renames it, reads exactly as typed. The record keeps its
// stored name for filters, writes and the settings form.
export const STANDARD_PIPELINES = ['Existing sales (compatibility)']

export function pipelineLabel(pipeline) {
  const name =
    typeof pipeline === 'string'
      ? pipeline
      : pipeline?.pipeline_name || pipeline?.name || ''
  if (!name || !STANDARD_PIPELINES.includes(name)) return name
  return typeof globalThis.__ === 'function' ? globalThis.__(name) : name
}
