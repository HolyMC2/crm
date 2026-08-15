// Type surface of the vendored form-core bundle (muelle-forms/1).
// Synced NEXT TO form-core.vendor.mjs by sync-forms-contract.sh so TS
// associates it automatically. Part of the contract: additions are additive;
// removals bump the contract major.

export type Scalar = string | number | boolean | null

export interface Rule {
  kind: string
  value?: unknown
  message?: string
}

export interface FieldDescriptor {
  fieldname: string
  label: string
  type: string
  widget?: string
  reqd?: boolean
  readonly?: boolean
  hidden?: boolean
  default?: unknown
  placeholder?: string | null
  description?: string | null
  options?: string[] | null
  link?: Record<string, unknown> | null
  fetch?: Record<string, unknown> | null
  rules?: Rule[]
  visible_when?: unknown
  reqd_when?: unknown
  readonly_when?: unknown
  writable?: boolean
  actions?: string[]
}

export interface SectionDescriptor {
  key: string
  label?: string
  columns?: number
  collapsible?: boolean
  visible_when?: unknown
  fields: FieldDescriptor[]
}

export interface FormDescriptor {
  contract: 'muelle-forms/1'
  kind: string
  doctype: string
  surface: string
  variant: string
  mode?: string
  hash: string
  lang: string
  title?: string
  sections: SectionDescriptor[]
  child_tables?: unknown[]
  actions?: unknown[]
  meta?: Record<string, unknown>
  [k: string]: unknown
}

export interface RuleError {
  fieldname: string
  kind: string
  message: string
}

export interface FieldState {
  visible: boolean
  required: boolean
  readonly: boolean
}

export interface PhoneResult {
  ok: boolean
  e164: string | null
  digits: string | null
  display: string | null
  reason?: 'empty' | 'too_short' | 'too_long' | 'invalid'
}

export interface WritePayload {
  descriptor_hash: string
  variant: string
  name?: string | null
  modified?: string | null
  client_request_id?: string | null
  doc: Record<string, unknown>
  child?: Record<string, Array<{ name?: string | null; values: Record<string, unknown> }>>
}

export declare function evaluate(expr: unknown, doc: Record<string, unknown>): boolean
export declare function truthy(v: unknown): boolean
export declare function isEmpty(v: unknown): boolean
export declare function normalizePhone(input: string | null | undefined): PhoneResult
export declare function parseMxn(input: string | number | null | undefined): number | null
export declare function formatMxn(centavos: number | null | undefined, opts?: { symbol?: boolean }): string
export declare function coerceServerNumber(v: unknown): number | null
export declare function formatDateMx(iso: string | null | undefined): string
export declare function parseDateMx(input: string | null | undefined): string | null
export declare function validateField(field: FieldDescriptor, doc: Record<string, unknown>): RuleError[]
export declare function validateForm(descriptor: FormDescriptor, doc: Record<string, unknown>): RuleError[]
export declare function canonicalJson(value: unknown): string
export declare function buildWritePayload(
  descriptor: FormDescriptor,
  doc: Record<string, unknown>,
  childRows?: Record<string, Array<{ name?: string | null; idx?: number; values: Record<string, unknown> }>>,
  opts?: { name?: string | null; modified?: string | null; clientRequestId?: string | null },
): WritePayload
export declare function serializePayload(payload: WritePayload): string
export declare function resolveFieldState(
  field: FieldDescriptor,
  sectionVisible: boolean,
  doc: Record<string, unknown>,
): FieldState
export declare function resolveFormState(
  descriptor: FormDescriptor,
  doc: Record<string, unknown>,
): Record<string, FieldState>
export declare function resolveDefaults(
  descriptor: FormDescriptor,
  now: { today: string; now: string },
  session?: { user?: string; company?: string; pos_profile?: string },
): Record<string, unknown>
export declare const CONTRACT: 'muelle-forms/1'
