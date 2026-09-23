// StageStepper's pure model (utils/stagePartition.js). @vue/test-utils is not a
// dependency of this frontend, so the component itself is not mounted here — the
// whole decision surface lives in these functions and StageStepper.vue only paints
// what they return.
//
// The contract under test: NOTHING keys off a status NAME. taller seeds the stage
// taxonomy in two languages, so «Approved» and «Aprobado» are one stage and a
// clinic tenant has neither; type + position are the only inputs.
import { describe, it, expect } from 'vitest'
import {
  FLOW_TYPES,
  orderByPosition,
  outcomeOf,
  paletteOf,
  partitionStages,
  stageInk,
  stageSurface,
  stepperModel,
} from '@/utils/stagePartition'

// Shaped like the taller seed (taller/repair/seed/deal_statuses.py), shuffled to
// prove the helper orders rather than trusting the caller.
const SEED = [
  {
    name: 'Completado',
    type: 'Won',
    position: 6,
    probability: 100,
    color: 'green',
  },
  {
    name: 'En Cotización',
    type: 'Open',
    position: 3,
    probability: 50,
    color: 'orange',
  },
  {
    name: 'Por Contactar',
    type: 'Open',
    position: 1,
    probability: 10,
    color: 'blue',
  },
  {
    name: 'Cancelado',
    type: 'Lost',
    position: 7,
    probability: 0,
    color: 'red',
  },
  {
    name: 'Aprobado',
    type: 'Open',
    position: 4,
    probability: 75,
    color: 'purple',
  },
  {
    name: 'Esperando Recepción',
    type: 'Open',
    position: 2,
    probability: 30,
    color: 'yellow',
  },
  {
    name: 'Por Entregar',
    type: 'Open',
    position: 5,
    probability: 90,
    color: 'green',
  },
  {
    name: 'Abandonado',
    type: 'Lost',
    position: 8,
    probability: 0,
    color: 'gray',
  },
]
const names = (list) => list.map((s) => s.name)

describe('stagePartition: ordering', () => {
  it('orders by position regardless of the input order', () => {
    expect(names(orderByPosition(SEED))).toEqual([
      'Por Contactar',
      'Esperando Recepción',
      'En Cotización',
      'Aprobado',
      'Por Entregar',
      'Completado',
      'Cancelado',
      'Abandonado',
    ])
  })

  it('keeps the caller order for equal positions (stable)', () => {
    const tied = [
      { name: 'B', type: 'Open', position: 2 },
      { name: 'A', type: 'Open', position: 2 },
      { name: 'C', type: 'Open', position: 1 },
    ]
    expect(names(orderByPosition(tied))).toEqual(['C', 'B', 'A'])
  })

  it('does not mutate the array it was given', () => {
    const input = [...SEED]
    orderByPosition(input)
    expect(names(input)).toEqual(names(SEED))
  })
})

describe('stagePartition: partition by type, never by name', () => {
  it('splits flow stages from the won and lost outcomes', () => {
    const { steps, won, lost } = partitionStages(SEED)
    expect(names(steps)).toEqual([
      'Por Contactar',
      'Esperando Recepción',
      'En Cotización',
      'Aprobado',
      'Por Entregar',
    ])
    expect(names(won)).toEqual(['Completado'])
    expect(names(lost)).toEqual(['Cancelado', 'Abandonado'])
  })

  it('treats Ongoing and On Hold as flow stages', () => {
    expect(FLOW_TYPES).toEqual(['Open', 'Ongoing', 'On Hold'])
    const mixed = [
      { name: 'Working', type: 'Ongoing', position: 1 },
      { name: 'Paused', type: 'On Hold', position: 2 },
      { name: 'Sold', type: 'Won', position: 3 },
    ]
    expect(names(partitionStages(mixed).steps)).toEqual(['Working', 'Paused'])
  })

  it('partitions an English twin set identically — no name lookup anywhere', () => {
    const english = SEED.map((s, i) => ({ ...s, name: `EN-${i}` }))
    const es = partitionStages(SEED)
    const en = partitionStages(english)
    expect(en.steps.map((s) => s.position)).toEqual(
      es.steps.map((s) => s.position),
    )
    expect(en.won.map((s) => s.position)).toEqual(es.won.map((s) => s.position))
    expect(en.lost.map((s) => s.position)).toEqual(
      es.lost.map((s) => s.position),
    )
  })

  it('survives an empty or junk status list', () => {
    expect(partitionStages()).toEqual({ steps: [], won: [], lost: [] })
    expect(partitionStages([{ name: 'X' }]).steps).toEqual([])
  })
})

describe('stagePartition: outcome', () => {
  it('reads the outcome off the type of the current status', () => {
    expect(outcomeOf(SEED, 'Completado')).toBe('won')
    expect(outcomeOf(SEED, 'Abandonado')).toBe('lost')
    expect(outcomeOf(SEED, 'Aprobado')).toBe('')
    expect(outcomeOf(SEED, 'Approved')).toBe('')
    expect(outcomeOf(SEED, '')).toBe('')
  })
})

describe('stagePartition: stepperModel', () => {
  const stateOf = (model) => model.steps.map((s) => s.state)

  it('marks earlier stages past, the current one current, later ones future', () => {
    const m = stepperModel(SEED, 'En Cotización')
    expect(stateOf(m)).toEqual(['past', 'past', 'current', 'future', 'future'])
    expect(m.outcome).toBe('')
    expect(m.unknown).toBe(false)
  })

  it('fills every flow stage once the deal is won', () => {
    const m = stepperModel(SEED, 'Completado')
    expect(stateOf(m)).toEqual(['past', 'past', 'past', 'past', 'past'])
    expect(m.outcome).toBe('won')
  })

  it('leaves the flow unfilled on a lost deal — we cannot know how far it got', () => {
    const m = stepperModel(SEED, 'Cancelado')
    expect(stateOf(m)).toEqual([
      'future',
      'future',
      'future',
      'future',
      'future',
    ])
    expect(m.outcome).toBe('lost')
  })

  it('flags a deal parked on a status outside the visible set', () => {
    // A hidden English twin, or a stage retired after the deal was created.
    const m = stepperModel(SEED, 'Approved')
    expect(m.unknown).toBe(true)
    expect(stateOf(m)).toEqual([
      'future',
      'future',
      'future',
      'future',
      'future',
    ])
  })

  it('is not unknown when the deal has no status at all', () => {
    expect(stepperModel(SEED, '').unknown).toBe(false)
  })

  it('offers the first Won status as the Ganado action and every Lost one', () => {
    const m = stepperModel(SEED, 'Aprobado')
    expect(m.won[0].name).toBe('Completado')
    expect(names(m.lost)).toEqual(['Cancelado', 'Abandonado'])
  })

  it('carries probability through for the tooltip', () => {
    const m = stepperModel(SEED, 'Aprobado')
    expect(m.steps.find((s) => s.name === 'Aprobado').probability).toBe(75)
  })
})

describe('stagePartition: colour tokens', () => {
  it('recovers the palette from the raw Desk value', () => {
    expect(paletteOf('green')).toBe('green')
    expect(paletteOf('violet')).toBe('violet')
  })

  it('recovers it from the tailwind class the statuses store builds', () => {
    // statusesStore runs parseColor() over every row: 'green' → '!text-green-700'.
    expect(paletteOf('!text-green-700')).toBe('green')
    expect(paletteOf('!text-ink-gray-9')).toBe('gray')
  })

  it('folds anything unmapped (black, empty, a custom seed) to gray', () => {
    expect(paletteOf('black')).toBe('gray')
    expect(paletteOf('')).toBe('gray')
    expect(paletteOf(undefined)).toBe('gray')
  })

  it('emits design tokens so the stepper works in dark mode too', () => {
    expect(stageInk('green', 8)).toBe('var(--ink-green-8)')
    expect(stageSurface('green', 3)).toBe('var(--surface-green-3)')
  })

  it('tints a hex colour instead of pretending it is a token ramp', () => {
    expect(stageInk('#1c2230')).toBe('#1c2230')
    expect(stageSurface('#1c2230')).toBe('#1c22301a')
    expect(stageSurface('#abc')).toBe('#aabbcc1a')
  })
})
