import { describe, expect, it } from 'vitest'
import { repairReadyStage } from '../../src/utils/repairReadyStage'
const stage = (name, hidden = 0, type = 'Open') => ({ name, hidden, type })
describe('repair ready quick action', () => {
  it('uses Listo para Entregar when the canonical stage exists', () => {
    expect(
      repairReadyStage([stage('Por Entregar'), stage('Listo para Entregar')])
        .name,
    ).toBe('Listo para Entregar')
  })
  it('still works before the site rename', () => {
    expect(repairReadyStage([stage('Por Entregar')]).name).toBe('Por Entregar')
  })
  it('respects the visible tenant language and excludes legacy aliases', () => {
    expect(
      repairReadyStage([
        stage('Listo para Entregar', 1),
        stage('Por Entregar', 1),
        stage('Ready for Pickup', '0'),
      ]).name,
    ).toBe('Ready for Pickup')
  })
  it('supports mail-in workshops', () => {
    expect(repairReadyStage([stage('Ready to Ship')]).name).toBe(
      'Ready to Ship',
    )
  })
  it('does not select a missing, hidden or terminal stage', () => {
    expect(
      repairReadyStage([
        stage('Por Entregar', 1),
        stage('Listo para Entregar', 0, 'Won'),
      ]),
    ).toBeNull()
    expect(repairReadyStage()).toBeNull()
  })
})
