// Phone-normalization contract — MUST stay in lockstep with the backend
// doco_marketing/services/dedupe.py :: normalize_phone().
//
// Rule: strip every non-digit, then keep the LAST 10 digits (Mexican local
// length). 52 / 521 country prefixes and E.164 "+" are discarded, so
// 5215512345678, 525512345678, "+52 55 1234 5678" and "55-1234-5678" all key to
// the same "5512345678". Fewer than 10 digits is too weak a key to dedup on and is
// returned unchanged.
const LOCAL_LEN = 10

export function normalizePhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length >= LOCAL_LEN ? digits.slice(-LOCAL_LEN) : digits
}
