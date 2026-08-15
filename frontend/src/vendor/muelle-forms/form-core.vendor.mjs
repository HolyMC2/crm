// @muelle/form-core vendored build — DO NOT EDIT. Source: muelle/workspace/packages/form-core. Synced by boat/scripts/sync-forms-contract.sh; CI drift gate compares bytes.

// src/dsl.ts
var OPS = ["==", "!=", "in", "!in", ">", ">=", "<", "<=", "and", "or", "not", "truthy", "empty"];
function isExpression(v) {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const keys = Object.keys(v);
  return keys.length === 1 && OPS.includes(keys[0]);
}
function resolveOperand(op, doc) {
  if (op !== null && typeof op === "object" && !Array.isArray(op)) {
    if ("var" in op && Object.keys(op).length === 1) {
      const path = op.var;
      return doc[path] ?? null;
    }
    if (isExpression(op)) return evaluate(op, doc);
  }
  return op;
}
function truthy(v) {
  if (v === null || v === void 0 || v === false) return false;
  if (v === 0 || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}
function isEmpty(v) {
  if (v === null || v === void 0 || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}
function cmp(a, b) {
  if (typeof a === "number" && typeof b === "number") return a === b ? 0 : a < b ? -1 : 1;
  if (typeof a === "string" && typeof b === "string") return a === b ? 0 : a < b ? -1 : 1;
  return null;
}
function looseEq(a, b) {
  if (a === null || a === void 0) return b === null || b === void 0;
  if (b === null || b === void 0) return false;
  if (typeof a === "boolean" || typeof b === "boolean") return truthy(a) === truthy(b);
  return a === b;
}
function evaluate(expr, doc) {
  if (expr === null || expr === void 0) return true;
  const key = Object.keys(expr)[0];
  const body = expr[key];
  switch (key) {
    case "and":
      return body.every((e) => evaluate(e, doc));
    case "or":
      return body.some((e) => evaluate(e, doc));
    case "not":
      return !evaluate(body[0], doc);
    case "truthy":
      return truthy(resolveOperand(body[0], doc));
    case "empty":
      return isEmpty(resolveOperand(body[0], doc));
    default: {
      const [ra, rb] = body;
      const a = resolveOperand(ra, doc);
      const b = resolveOperand(rb, doc);
      switch (key) {
        case "==":
          return looseEq(a, b);
        case "!=":
          return !looseEq(a, b);
        case "in":
          return Array.isArray(b) ? b.some((x) => looseEq(a, x)) : false;
        case "!in":
          return Array.isArray(b) ? !b.some((x) => looseEq(a, x)) : true;
        case ">": {
          const c = cmp(a, b);
          return c !== null && c > 0;
        }
        case ">=": {
          const c = cmp(a, b);
          return c !== null && c >= 0;
        }
        case "<": {
          const c = cmp(a, b);
          return c !== null && c < 0;
        }
        case "<=": {
          const c = cmp(a, b);
          return c !== null && c <= 0;
        }
      }
    }
  }
  return false;
}

// src/phone.ts
var fail = (reason) => ({ ok: false, e164: null, digits: null, display: null, reason });
function mxDisplay(national) {
  return `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
}
function normalizePhone(input) {
  if (input === null || input === void 0) return fail("empty");
  const hadPlus = input.trim().startsWith("+");
  const digits = input.replace(/\D/g, "");
  if (digits.length === 0) return fail("empty");
  if (!hadPlus && digits.length === 10) return ok("52" + digits);
  if (digits.length === 12 && digits.startsWith("52")) return ok(digits);
  if (digits.length === 13 && digits.startsWith("521")) return ok("52" + digits.slice(3));
  if (hadPlus) {
    if (digits.length < 8) return fail("too_short");
    if (digits.length > 15) return fail("too_long");
    return ok(digits);
  }
  if (digits.length < 10) return fail("too_short");
  if (digits.length > 15) return fail("too_long");
  return fail("invalid");
  function ok(full) {
    const isMx = full.startsWith("52") && full.length === 12;
    return {
      ok: true,
      e164: "+" + full,
      digits: full,
      display: isMx ? mxDisplay(full.slice(2)) : "+" + full
    };
  }
}

// src/money.ts
function parseMxn(input) {
  if (input === null || input === void 0 || input === "") return null;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    return Math.round(input * 100);
  }
  const cleaned = input.replace(/[$\s,]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const neg = cleaned.startsWith("-");
  const [intPart, decPart = ""] = cleaned.replace("-", "").split(".");
  const centavos = parseInt(intPart || "0", 10) * 100 + parseInt((decPart + "00").slice(0, 2), 10);
  return neg ? -centavos : centavos;
}
function formatMxn(centavos, opts) {
  if (centavos === null || centavos === void 0 || !Number.isFinite(centavos)) return "";
  const neg = centavos < 0;
  const abs = Math.abs(Math.round(centavos));
  const intPart = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const dec = (abs % 100).toString().padStart(2, "0");
  const body = `${intPart}.${dec}`;
  return `${neg ? "-" : ""}${opts?.symbol === false ? "" : "$"}${body}`;
}
function coerceServerNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

// src/dates.ts
function formatDateMx(iso) {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
function parseDateMx(input) {
  if (!input) return null;
  const t = input.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return t;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dd = d.padStart(2, "0");
  const mm = mo.padStart(2, "0");
  const date = /* @__PURE__ */ new Date(`${y}-${mm}-${dd}T00:00:00`);
  if (Number.isNaN(date.getTime()) || date.getDate() !== parseInt(d, 10)) return null;
  return `${y}-${mm}-${dd}`;
}

// src/rules.ts
var RFC_RE = /^([A-ZÑ&]{3,4})\d{6}[A-Z0-9]{3}$/;
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var CP_RE = /^\d{5}$/;
function checkRule(rule, value) {
  if (isEmpty(value)) return true;
  switch (rule.kind) {
    case "regex":
      return typeof value === "string" && new RegExp(String(rule.value)).test(value);
    case "min":
      return typeof value === "number" && value >= Number(rule.value);
    case "max":
      return typeof value === "number" && value <= Number(rule.value);
    case "min_len":
      return typeof value === "string" && value.length >= Number(rule.value);
    case "max_len":
      return typeof value === "string" && value.length <= Number(rule.value);
    case "precision": {
      if (typeof value !== "number") return false;
      const p = Number(rule.value);
      return Number.isInteger(value * 10 ** p + 0) || Math.abs(value * 10 ** p - Math.round(value * 10 ** p)) < 1e-9;
    }
    case "options":
      return Array.isArray(rule.value) && rule.value.some((o) => o === value);
    case "phone_mx":
      return typeof value === "string" && normalizePhone(value).ok;
    case "rfc":
      return typeof value === "string" && RFC_RE.test(value.toUpperCase());
    case "email":
      return typeof value === "string" && EMAIL_RE.test(value);
    case "url":
      return typeof value === "string" && /^https?:\/\/\S+$/.test(value);
    case "cp_mx":
      return typeof value === "string" && CP_RE.test(value);
    default:
      return true;
  }
}
function validateField(field, doc) {
  const errors = [];
  const value = doc[field.fieldname];
  const required = field.reqd === true || field.reqd_when != null && evaluate(field.reqd_when, doc);
  const visible = field.visible_when == null || evaluate(field.visible_when, doc);
  if (!visible) return errors;
  if (required && isEmpty(value)) {
    errors.push({ fieldname: field.fieldname, kind: "reqd", message: field.label ? `${field.label}: requerido` : "Requerido" });
    return errors;
  }
  for (const rule of field.rules ?? []) {
    if (!checkRule(rule, value)) {
      errors.push({ fieldname: field.fieldname, kind: rule.kind, message: rule.message ?? "Valor inv\xE1lido" });
    }
  }
  return errors;
}
function validateForm(descriptor, doc) {
  const errors = [];
  for (const section of descriptor.sections) {
    if (section.visible_when != null && !evaluate(section.visible_when, doc)) continue;
    for (const field of section.fields) errors.push(...validateField(field, doc));
  }
  return errors;
}

// src/canonical.ts
function canonicalJson(value) {
  return encode(value);
}
function encode(v) {
  if (v === null || v === void 0) return "null";
  switch (typeof v) {
    case "boolean":
      return v ? "true" : "false";
    case "number":
      if (!Number.isInteger(v)) throw new Error(`canonicalJson: non-integer number ${v} (use centavos/strings)`);
      return String(v);
    case "string":
      return JSON.stringify(v);
    case "object": {
      if (Array.isArray(v)) return `[${v.map(encode).join(",")}]`;
      const keys = Object.keys(v).sort();
      const body = keys.filter((k) => v[k] !== void 0).map((k) => `${JSON.stringify(k)}:${encode(v[k])}`).join(",");
      return `{${body}}`;
    }
    default:
      throw new Error(`canonicalJson: unsupported type ${typeof v}`);
  }
}

// src/payload.ts
function writableFieldnames(descriptor, doc) {
  const out = [];
  for (const section of descriptor.sections) {
    if (section.visible_when != null && !evaluate(section.visible_when, doc)) continue;
    for (const f of section.fields) {
      if (f.writable === false || f.readonly === true) continue;
      if (f.readonly_when != null && evaluate(f.readonly_when, doc)) continue;
      if (f.visible_when != null && !evaluate(f.visible_when, doc)) continue;
      out.push(f.fieldname);
    }
  }
  return out;
}
function buildWritePayload(descriptor, doc, childRows = {}, opts = {}) {
  const docOut = {};
  for (const fieldname of writableFieldnames(descriptor, doc)) {
    const v = doc[fieldname];
    if (v !== void 0) docOut[fieldname] = v;
  }
  const childOut = {};
  for (const ct of descriptor.child_tables ?? []) {
    const rows = childRows[ct.fieldname];
    if (!rows) continue;
    const cols = new Set(ct.columns.filter((c) => c.writable !== false && c.readonly !== true).map((c) => c.fieldname));
    childOut[ct.fieldname] = rows.map((row) => {
      const values = {};
      for (const [k, v] of Object.entries(row.values)) if (cols.has(k) && v !== void 0) values[k] = v;
      return { name: row.name ?? null, values };
    });
  }
  const payload = {
    descriptor_hash: descriptor.hash,
    variant: descriptor.variant,
    doc: docOut
  };
  if (opts.name != null) payload.name = opts.name;
  if (opts.modified != null) payload.modified = opts.modified;
  if (opts.clientRequestId != null) payload.client_request_id = opts.clientRequestId;
  if (Object.keys(childOut).length > 0) payload.child = childOut;
  return payload;
}
function serializePayload(payload) {
  return canonicalJson(payload);
}

// src/resolve.ts
function resolveFieldState(field, sectionVisible, doc) {
  const visible = sectionVisible && field.hidden !== true && (field.visible_when == null || evaluate(field.visible_when, doc));
  const required = field.reqd === true || field.reqd_when != null && evaluate(field.reqd_when, doc);
  const readonly = field.readonly === true || field.writable === false || field.readonly_when != null && evaluate(field.readonly_when, doc);
  return { visible, required, readonly };
}
function resolveFormState(descriptor, doc) {
  const out = {};
  for (const section of descriptor.sections) {
    const sectionVisible = section.visible_when == null || evaluate(section.visible_when, doc);
    for (const field of section.fields) {
      out[field.fieldname] = resolveFieldState(field, sectionVisible, doc);
    }
  }
  return out;
}
function resolveDefaults(descriptor, now, session = {}) {
  const doc = {};
  for (const section of descriptor.sections) {
    for (const field of section.fields) {
      const d = field.default;
      if (d === void 0 || d === null) continue;
      if (typeof d === "object" && "token" in d) {
        const v = d.token === "today" ? now.today : d.token === "now" ? now.now : d.token === "user" ? session.user : d.token === "company" ? session.company : d.token === "pos_profile" ? session.pos_profile : void 0;
        if (v !== void 0) doc[field.fieldname] = v;
      } else {
        doc[field.fieldname] = d;
      }
    }
  }
  return doc;
}

// src/index.ts
var CONTRACT = "muelle-forms/1";
export {
  CONTRACT,
  buildWritePayload,
  canonicalJson,
  coerceServerNumber,
  evaluate,
  formatDateMx,
  formatMxn,
  isEmpty,
  isExpression,
  normalizePhone,
  parseDateMx,
  parseMxn,
  resolveDefaults,
  resolveFieldState,
  resolveFormState,
  serializePayload,
  truthy,
  validateField,
  validateForm
};
