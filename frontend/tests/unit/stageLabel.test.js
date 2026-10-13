// Stage names are data (CRM Deal Status / CRM Lead Status IDs a tenant may
// rename); the standard ones are translated where they are drawn.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEAL_STATUS,
  LEAD_STATUS,
  STANDARD_PIPELINES,
  pipelineLabel,
  recordStageLabel,
  stageLabel,
} from '@/utils/stageLabel'

const here = dirname(fileURLToPath(import.meta.url))
const CATALOG = {
  Qualification: 'Calificación',
  New: 'Nuevo',
  Won: 'Ganado',
  'Existing sales (compatibility)': 'Ventas generales',
  Repairs: 'Reparaciones',
}
const identity = globalThis.__

beforeEach(() => {
  globalThis.__ = (text) => CATALOG[text] || text
  window.translated_doctypes = [DEAL_STATUS, LEAD_STATUS]
})
afterEach(() => {
  globalThis.__ = identity
  delete window.translated_doctypes
})

describe('stageLabel', () => {
  it('shows a standard stage in the worker language', () => {
    expect(stageLabel('Qualification')).toBe('Calificación')
    expect(stageLabel('New', LEAD_STATUS)).toBe('Nuevo')
  })
  it('passes a renamed or custom stage through unchanged', () => {
    expect(stageLabel('Esperando Recepción')).toBe('Esperando Recepción')
    expect(stageLabel('')).toBe('')
    expect(stageLabel(null)).toBe('')
  })
  it('keeps the stored name where the site does not translate the doctype', () => {
    window.translated_doctypes = [LEAD_STATUS]
    expect(stageLabel('Qualification')).toBe('Qualification')
    expect(stageLabel('New', LEAD_STATUS)).toBe('Nuevo')
  })
  it('reads the stage of a lead or a deal row', () => {
    window.translated_doctypes = [LEAD_STATUS]
    expect(recordStageLabel('New', 'CRM Lead')).toBe('Nuevo')
    expect(recordStageLabel('Won', 'CRM Deal')).toBe('Won')
    expect(recordStageLabel('Won')).toBe('Won')
  })
})

// A pipeline name is data too (CRM Pipeline.pipeline_name, editable). Only the
// name CRM itself creates (the pipeline migration's «Existing sales
// (compatibility)») is drawn through the catalog; what a manager typed reads
// exactly as typed, even when it matches a catalog word.
describe('pipelineLabel', () => {
  it('shows the pipeline CRM creates in the worker language', () => {
    expect(
      pipelineLabel({
        name: 'legacy-sales',
        pipeline_name: 'Existing sales (compatibility)',
      }),
    ).toBe('Ventas generales')
    expect(pipelineLabel('Existing sales (compatibility)')).toBe(
      'Ventas generales',
    )
  })
  it('keeps a renamed or custom pipeline as typed', () => {
    expect(
      pipelineLabel({ name: 'legacy-sales', pipeline_name: 'Mostrador' }),
    ).toBe('Mostrador')
    expect(pipelineLabel({ name: 'p1', pipeline_name: 'Repairs' })).toBe(
      'Repairs',
    )
  })
  it('falls back to the record name, and to nothing', () => {
    expect(pipelineLabel({ name: 'p-123' })).toBe('p-123')
    expect(pipelineLabel(null)).toBe('')
    expect(pipelineLabel('')).toBe('')
  })
  it('has a Spanish name for every pipeline CRM creates', () => {
    const migration = readFileSync(
      resolve(here, '../../../crm/pipeline/services/configuration.py'),
      'utf8',
    )
    const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
    for (const name of STANDARD_PIPELINES) {
      expect(migration, name).toContain(`"${name}"`)
      expect(po, name).toMatch(
        new RegExp(
          `\\nmsgid "${name.replace(/[()]/g, '\\$&')}"\\nmsgstr "[^"]+"`,
        ),
      )
    }
  })
})

describe('standard stage catalog', () => {
  // crm/install.py add_default_deal_statuses / add_default_lead_statuses
  const STANDARD = [
    'Qualification',
    'Demo/Making',
    'Proposal/Quotation',
    'Negotiation',
    'Ready to Close',
    'Won',
    'Lost',
    'New',
    'Contacted',
    'Nurture',
    'Qualified',
    'Converted',
    'Unqualified',
    'Junk',
  ]
  it('gives every stage CRM installs a Spanish name', () => {
    const install = readFileSync(
      resolve(here, '../../../crm/install.py'),
      'utf8',
    )
    const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
    // context-free entries only: a stage label is looked up without context
    const catalog = new Map()
    for (const m of po.matchAll(
      /^(msgctxt .*\n)?msgid "((?:[^"\\]|\\.)*)"\nmsgstr "((?:[^"\\]|\\.)*)"/gm,
    ))
      if (!m[1]) catalog.set(m[2], m[3])
    for (const name of STANDARD) {
      expect(install, name).toContain(`"${name}": {`)
      expect(catalog.get(name), name).toBeTruthy()
    }
  })
})
