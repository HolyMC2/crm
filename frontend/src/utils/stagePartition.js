// Pipeline stage partition for the Deal 360 stepper.
//
// The stage taxonomy is tenant-seeded and bilingual (taller owns it), so NOTHING
// here may key off a status NAME — «Aprobado» and «Approved» are the same stage
// and a clinic tenant has neither. Every decision is made on `type`
// (Open / Ongoing / On Hold / Won / Lost) and `position`.
//
// Pure functions only: no store, no network, no Vue. StageStepper.vue renders
// what `stepperModel` returns.

// The stages a deal walks THROUGH. Won and Lost are outcomes, not steps.
export const FLOW_TYPES = Object.freeze(['Open', 'Ongoing', 'On Hold'])

// CRM Deal Status.color options, minus `black` (no --ink-black-* token: folds to
// gray). Used to recover a palette name from whatever colour shape arrives.
const PALETTE = Object.freeze([
  'amber',
  'blue',
  'cyan',
  'gray',
  'green',
  'orange',
  'pink',
  'purple',
  'red',
  'teal',
  'violet',
  'yellow',
])

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

const position = (s) => Number(s?.position ?? 0) || 0

// Stable sort by position; equal positions keep the order the caller supplied
// (the store already fetches `orderBy: position asc`).
export function orderByPosition(statuses = []) {
  return statuses
    .map((s, i) => [s, i])
    .sort((a, b) => position(a[0]) - position(b[0]) || a[1] - b[1])
    .map(([s]) => s)
}

// { steps, won, lost } — steps in position order, outcomes in position order.
export function partitionStages(statuses = []) {
  const ordered = orderByPosition(statuses)
  return {
    steps: ordered.filter((s) => FLOW_TYPES.includes(s?.type)),
    won: ordered.filter((s) => s?.type === 'Won'),
    lost: ordered.filter((s) => s?.type === 'Lost'),
  }
}

// 'won' | 'lost' | '' for the status the deal currently sits on.
export function outcomeOf(statuses = [], current = '') {
  const s = statuses.find((x) => x?.name === current)
  if (s?.type === 'Won') return 'won'
  if (s?.type === 'Lost') return 'lost'
  return ''
}

// `CRM Deal Status.color` reaches the UI in three shapes: the raw Desk select
// value ('green'), the tailwind text class statusesStore's parseColor builds
// ('!text-green-700'), or a hex from a custom seed. Reduce all three to a design
// token pair so the stepper paints correctly in light AND dark.
export function stageInk(color, step = 7) {
  const raw = String(color || '')
  if (HEX.test(raw)) return raw
  return `var(--ink-${paletteOf(raw)}-${step})`
}

export function stageSurface(color, step = 2) {
  const raw = String(color || '')
  // A hex has no token ramp: tint it with an alpha suffix (#rrggbb + 1a ≈ 10%).
  // #abc has to grow to #aabbcc first, or #abc1a is not a colour at all.
  if (HEX.test(raw)) {
    const six =
      raw.length === 4
        ? `#${raw
            .slice(1)
            .split('')
            .map((c) => c + c)
            .join('')}`
        : raw
    return `${six}1a`
  }
  return `var(--surface-${paletteOf(raw)}-${step})`
}

export function paletteOf(color) {
  const raw = String(color || '').toLowerCase()
  return PALETTE.find((p) => raw.includes(p)) || 'gray'
}

// Everything StageStepper.vue needs, in one pure call.
//
//   steps   — flow stages in position order, each tagged 'past' | 'current' | 'future'
//   won     — Won-type statuses; the first is the «Ganado» button
//   lost    — Lost-type statuses; the «Perdido» dropdown
//   outcome — 'won' | 'lost' | '' for the status the deal is on now
//   unknown — the deal sits on a status that is not in `statuses` at all (hidden
//             twin, legacy stage): the caller shows its raw name so the header
//             never lies about where the deal is.
export function stepperModel(statuses = [], current = '') {
  const { steps, won, lost } = partitionStages(statuses)
  const outcome = outcomeOf(statuses, current)
  const at = steps.findIndex((s) => s?.name === current)
  return {
    // A won deal has cleared every flow stage, whatever its recorded path. A lost
    // one stopped somewhere we cannot know, so its steps stay unfilled.
    steps: steps.map((s, i) => ({
      ...s,
      state:
        outcome === 'won'
          ? 'past'
          : at === -1
            ? 'future'
            : i < at
              ? 'past'
              : i === at
                ? 'current'
                : 'future',
    })),
    won,
    lost,
    outcome,
    unknown: !!current && at === -1 && !outcome,
  }
}
