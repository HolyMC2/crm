// The palette's calculator, as the Desk awesomebar's: «1250*1.16» answers
// «= 1,450» and ↵ copies it. A shop's sums too: «1250 + 16%» is 1,450.
// No eval: a small parser of + - * / ^ %, and parentheses.
import { formatQty } from '@/utils/display'

const ALLOWED = /^[\d\s.,+\-*/%^()x×÷]+$/i
// «2026-11-10», «10/11/2026»: a date, not a subtraction.
const DATE = /^\d{1,4}([/-])\d{1,2}\1\d{1,4}$/

/** The expression as tokens (numbers and operators), or null when it is not one. */
function tokenize(text) {
  const tokens = []
  let rest = text.replace(/\s+/g, '').replace(/[x×]/gi, '*').replace(/÷/g, '/')
  while (rest) {
    // «1,250.50»: commas only as thousands separators.
    const number = /^(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?/.exec(rest)?.[0]
    if (number) {
      tokens.push(Number(number.replace(/,/g, '')))
      rest = rest.slice(number.length)
    } else if ('+-*/%^()'.includes(rest[0])) {
      tokens.push(rest[0])
      rest = rest.slice(1)
    } else return null
  }
  return tokens
}

function parse(tokens) {
  let at = 0
  const peek = () => tokens[at]
  const take = () => tokens[at++]

  function primary() {
    const token = take()
    if (typeof token === 'number') return token
    if (token === '(') {
      const value = sum()
      if (take() !== ')') throw new Error('unclosed')
      return value
    }
    throw new Error('value expected')
  }
  function signed() {
    if (peek() === '-') {
      take()
      return -signed()
    }
    if (peek() === '+') {
      take()
      return signed()
    }
    const base = primary()
    if (peek() !== '^') return base
    take()
    return base ** signed()
  }
  function product() {
    let value = signed()
    for (;;) {
      const operator = peek()
      if (operator === '%') {
        take()
        value /= 100
      } else if (operator === '*') {
        take()
        value *= signed()
      } else if (operator === '/') {
        take()
        value /= signed()
      } else return value
    }
  }
  function sum() {
    let value = product()
    while (peek() === '+' || peek() === '-') {
      const sign = take() === '+' ? 1 : -1
      const from = at
      const next = product()
      // «1250 + 16%»: a percentage of what came before, as a calculator adds it.
      const share =
        at - from === 2 &&
        typeof tokens[from] === 'number' &&
        tokens[from + 1] === '%'
      value += sign * (share ? value * next : next)
    }
    return value
  }
  const value = sum()
  if (at !== tokens.length) throw new Error('left over')
  return value
}

/**
 * The result of an arithmetic expression, or null when the text is not one:
 * a bare number, a phone, a date or a document number are not sums. A
 * leading «=» says it is one, as in Desk.
 */
export function calculate(text) {
  const raw = String(text || '').trim()
  const forced = raw.startsWith('=')
  const expression = (forced ? raw.slice(1) : raw).trim()
  if (!expression || expression.length > 80 || !ALLOWED.test(expression))
    return null
  if (!forced && DATE.test(expression)) return null
  const tokens = tokenize(expression)
  if (!tokens || !tokens.some((token) => typeof token === 'number')) return null
  // Something to work out: an operator between or beside the numbers.
  if (!forced && !tokens.some((token) => '+-*/%^'.includes(token))) return null
  try {
    const value = parse(tokens)
    return Number.isFinite(value) ? Number(value.toPrecision(12)) : null
  } catch {
    return null
  }
}

export function createCalculatorProvider() {
  return {
    key: 'calculadora',
    label: 'Calculator',
    scopes: ['actions'],
    local: true,
    async search(query) {
      if (query.kind === 'empty') return []
      const text = String(query.text || '').trim()
      // «669 123 4567» and «2026-11-10» are a phone and a date unless «=» says otherwise.
      if (query.kind === 'phone' && !text.startsWith('=')) return []
      const value = calculate(text)
      if (value === null) return []
      return [
        {
          id: 'calculadora',
          group: 'acciones',
          title: `${text.replace(/^=\s*/, '')} = ${formatQty(value)}`,
          subtitle: __('Copy the result'),
          icon: 'lucide-calculator',
          action: 'copy',
          args: { text: String(value) },
          // A sum asks for its result: the row leads the palette (orderPaletteSections).
          lead: true,
        },
      ]
    },
  }
}
