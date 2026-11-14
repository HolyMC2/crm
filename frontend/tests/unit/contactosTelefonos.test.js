import { describe, expect, it } from 'vitest'
import {
  availableKinds,
  chosenCount,
  currentDevice,
  namePreview,
  phoneStatus,
  platformLabel,
} from '@/utils/contactosTelefonos'

const state = {
  kinds: [
    { key: 'clientes', available: true, included: true, count: 1103 },
    { key: 'proveedores', available: true, included: false, count: 40 },
    { key: 'otros', available: true, included: true, count: 7 },
    { key: 'equipo', available: true, included: false, count: 5 },
    { key: 'pacientes', available: false, included: false, count: 0 },
  ],
}

describe('Contactos en los teléfonos', () => {
  it('offers only the kinds this shop has, with their words', () => {
    const kinds = availableKinds(state)
    expect(kinds.map((k) => k.label)).toEqual([
      'Clientes',
      'Proveedores',
      'Otros contactos',
      'Tu equipo',
    ])
  })

  it('counts what the chosen kinds send', () => {
    expect(chosenCount(state)).toBe(1110)
    expect(chosenCount(null)).toBe(0)
  })

  it('previews the name as the phone shows it', () => {
    expect(namePreview('', 'Doco')).toBe('Ana López')
    expect(namePreview('kind', 'Doco')).toBe('Ana López · Cliente')
    expect(namePreview('shop', 'Mumu')).toBe('Ana López · Mumu')
    expect(namePreview('shop', '')).toBe('Ana López')
  })

  it('says whether each phone is set up and when it last synced', () => {
    const now = new Date('2026-11-14T12:00:00')
    expect(phoneStatus({ ready: false }, now)).toBe(
      'Falta instalar el perfil en el iPhone',
    )
    expect(phoneStatus({ ready: true, last_seen: null }, now)).toBe(
      'Todavía no se conecta',
    )
    expect(
      phoneStatus({ ready: true, last_seen: '2026-11-14 11:55:00' }, now),
    ).toBe('Se actualizó hace 5 min')
  })

  it('names platforms and recognises the phone in hand', () => {
    expect(platformLabel('iphone')).toBe('iPhone')
    expect(platformLabel('nada')).toBe('Otro')
    expect(currentDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)')).toBe(
      'iphone',
    )
    expect(currentDevice('Mozilla/5.0 (Linux; Android 14; SM-A155M)')).toBe(
      'android',
    )
    expect(currentDevice('Mozilla/5.0 (X11; Linux x86_64)')).toBe('')
  })
})
