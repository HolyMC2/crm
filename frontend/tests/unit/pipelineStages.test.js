import { describe, expect, it } from 'vitest'
import { boardStages, pipelineStages, stageMove } from '@/utils/pipelineStages'

const pipelines = [
  {
    name: 'shop-sales',
    is_default: 1,
    archived: 0,
    stages: [
      { name: 'Nuevo', type: 'Open', probability: 10 },
      { name: 'Cotizado', type: 'Ongoing', probability: 50 },
      { name: 'Viejo', type: 'Ongoing', archived: 1 },
      { name: 'Ganado', type: 'Won', probability: 100 },
      { name: 'Perdido', type: 'Lost', probability: 0 },
    ],
  },
  {
    name: 'legacy-sales',
    is_default: 0,
    stages: [{ name: 'Approved', type: 'Open' }],
  },
]
const option = (value, type) => ({ value, label: value, type })

describe('a deal moves through its pipeline stages', () => {
  it('lists the live stages of the deal pipeline', () => {
    expect(pipelineStages(pipelines, 'shop-sales').map((s) => s.name)).toEqual([
      'Nuevo',
      'Cotizado',
      'Ganado',
      'Perdido',
    ])
  })
  it('falls back (null) without a pipeline or for one the user cannot see', () => {
    expect(pipelineStages(pipelines, '')).toBeNull()
    expect(pipelineStages(pipelines, 'secret')).toBeNull()
  })
})

describe('board drops', () => {
  const columns = [
    option('Nuevo', 'Open'),
    option('Ganado', 'Won'),
    option('Perdido', 'Lost'),
  ]
  it('asks for a reason on a Lost column and treats Won as an outcome', () => {
    expect(stageMove(columns, 'Perdido')).toBe('lost')
    expect(stageMove(columns, 'Ganado')).toBe('outcome')
    expect(stageMove(columns, 'Nuevo')).toBe('flow')
  })
  it('shows the default pipeline first and only other stages that hold deals', () => {
    const options = [
      option('Approved', 'Open'),
      option('Ready for Pickup', 'Open'),
      option('Nuevo', 'Open'),
      option('Cotizado', 'Ongoing'),
      option('Ganado', 'Won'),
      option('Perdido', 'Lost'),
    ]
    const counts = { Approved: { count: 3 }, 'Ready for Pickup': { count: 0 } }
    expect(
      boardStages(options, pipelines, '', counts).map((o) => o.value),
    ).toEqual(['Nuevo', 'Cotizado', 'Ganado', 'Perdido', 'Approved'])
  })
  it('keeps a chosen pipeline exactly as configured', () => {
    const options = [option('Approved', 'Open')]
    expect(boardStages(options, pipelines, 'legacy-sales', {})).toEqual(options)
  })
})
