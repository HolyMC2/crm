// utils/display.js: what a worker reads instead of what the database stores
// (Shell SPEC §2.2.7): names not IDs, es-MX dates, units, money, statuses.
import { describe, expect, it } from 'vitest'
import {
  dayDiff,
  displayName,
  formatDate,
  formatDateTime,
  formatDue,
  formatMoney,
  formatMoneyCompact,
  formatQty,
  formatTime,
  initials,
  kindLabel,
  looksLikeId,
  parseServerDate,
  personName,
  relativeTime,
  statusLabel,
  statusTone,
  unitLabel,
} from '@/utils/display'

const NOW = new Date(2026, 9, 17, 12, 30) // sáb 17 oct 2026, 12:30 local

describe('looksLikeId', () => {
  it.each([
    'PUR-ORD-2026-00025',
    'ACC-PINV-2025-00016',
    'CRM-DEAL-2025-00086',
    'MAT-MR-2026-00005',
    'RO-00157',
    'MKCAMP-000003',
    'SINV-1',
    '8e5fb043-9d66-4f2a-9c1e-0123456789ab',
    'a1b2c3d4e5',
  ])('%s is an ID', (value) => expect(looksLikeId(value)).toBe(true))
  it.each([
    'XMovil',
    'AARON ENRIQUE TELEZ CHAVEZ',
    'Refacciones Ficticias S26',
    'Honor X6',
    'Pantalla',
    '',
  ])('%s is a name', (value) => expect(looksLikeId(value)).toBe(false))
})

describe('displayName', () => {
  it('uses the doctype name field before the ID', () => {
    expect(
      displayName(
        { name: 'PUR-ORD-2026-00025', supplier_name: 'CellCity' },
        'Purchase Order',
      ),
    ).toBe('CellCity')
    expect(
      displayName(
        { name: 'CRM-DEAL-2025-00086', organization: 'Taller Luna' },
        'CRM Deal',
      ),
    ).toBe('Taller Luna')
  })
  it('falls back to the kind word, never the ID or an email', () => {
    expect(displayName({ name: 'CRM-DEAL-2025-00086' }, 'CRM Deal')).toBe(
      'Trato',
    )
    expect(displayName({ name: 'x', title: 'jeydi@gmail.com' }, 'ToDo')).toBe(
      'x',
    )
    expect(displayName({ name: 'a1b2c3d4e5' })).toBe('Sin nombre')
    expect(displayName('RO-00157', 'Repair Order')).toBe('Reparación')
    expect(displayName('XMovil')).toBe('XMovil')
  })
  it('strips HTML from server text', () => {
    expect(
      displayName({ description: '<p>Llamar a  <b>Ana</b></p>' }, 'ToDo'),
    ).toBe('Llamar a Ana')
  })
  it('kindLabel names the doctype', () => {
    expect(kindLabel('Purchase Invoice')).toBe('Factura de proveedor')
    expect(kindLabel('Unknown')).toBe('')
  })
})

describe('personName', () => {
  it('prefers the known full name, never the email', () => {
    expect(
      personName('jeydici01@gmail.com', {
        'jeydici01@gmail.com': 'Jeydi Cruz',
      }),
    ).toBe('Jeydi Cruz')
    expect(personName('karla.martinez@doco.mx')).toBe('Karla Martinez')
    expect(personName('jeydici01@gmail.com')).toBe('Jeydici')
    expect(personName('Administrator')).toBe('Administrador')
  })
  it('initials', () => {
    expect(initials('Karla Martínez López')).toBe('KL')
    expect(initials('Aarón')).toBe('A')
    expect(initials('')).toBe('')
  })
})

describe('dates', () => {
  it('reads a date-only value as a local day, not UTC midnight', () => {
    const d = parseServerDate('2026-10-17')
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 17])
  })
  it('reads a naive server timestamp, microseconds included', () => {
    const d = parseServerDate('2026-10-17 12:11:24.941958')
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([12, 11, 24])
  })
  it('converts from the site zone when given', () => {
    const d = parseServerDate('2026-10-17 12:00:00', {
      timeZone: 'America/Mazatlan',
    })
    expect(d.toISOString()).toBe('2026-10-17T19:00:00.000Z')
  })
  it('formats days relative when close, short es-MX otherwise', () => {
    expect(formatDate('2026-10-17', { now: NOW })).toBe('hoy')
    expect(formatDate('2026-10-16', { now: NOW })).toBe('ayer')
    expect(formatDate('2026-10-18', { now: NOW })).toBe('mañana')
    expect(formatDate('2026-10-24', { now: NOW })).toBe('24 oct')
    expect(formatDate('2025-10-17', { now: NOW })).toBe('17 oct 2025')
    expect(formatDate('', { now: NOW })).toBe('')
  })
  it('never shows ISO or seconds', () => {
    expect(formatTime('2026-10-17 09:05:59')).toBe('09:05')
    expect(formatDateTime('2026-10-17 12:11:24.941958', { now: NOW })).toBe(
      'hoy 12:11',
    )
    expect(formatDateTime('2026-10-10 08:00:00', { now: NOW })).toMatch(
      /^10 oct 08:00$/,
    )
  })
  it('relativeTime', () => {
    const ago = (min) => new Date(NOW.getTime() - min * 60000)
    expect(relativeTime(ago(0), { now: NOW })).toBe('ahora')
    expect(relativeTime(ago(17), { now: NOW })).toBe('hace 17 min')
    expect(relativeTime(ago(180), { now: NOW })).toBe('hace 3 h')
    expect(relativeTime('2026-10-16 09:00:00', { now: NOW })).toBe('ayer')
    expect(relativeTime('2026-10-13', { now: NOW })).toBe('hace 4 días')
    expect(relativeTime('2026-10-20', { now: NOW })).toBe('en 3 días')
    expect(relativeTime('2026-08-01', { now: NOW })).toBe('1 ago')
  })
  it('formatDue marks overdue on the item', () => {
    expect(formatDue('2026-10-17', { now: NOW })).toEqual({
      label: 'Vence hoy',
      overdue: false,
      today: true,
    })
    expect(formatDue('2026-10-14', { now: NOW }).label).toBe(
      'Venció hace 3 días',
    )
    expect(formatDue('2026-10-14', { now: NOW }).overdue).toBe(true)
    expect(formatDue('2026-10-16', { now: NOW }).label).toBe('Venció ayer')
    expect(formatDue('2026-10-30', { now: NOW }).label).toBe('Vence 30 oct')
    expect(formatDue(null).label).toBe('')
    expect(dayDiff(new Date(2026, 9, 18, 0, 5), NOW)).toBe(1)
  })
})

describe('units and money', () => {
  it('never shows «Nos»', () => {
    expect(unitLabel('Nos')).toBe('pza')
    expect(unitLabel('Nos', 3)).toBe('pzas')
    expect(unitLabel('Unit', 1)).toBe('pza')
    expect(unitLabel('Box', 2)).toBe('cajas')
    expect(unitLabel('Kg', 2)).toBe('kg')
    expect(unitLabel('Rollo')).toBe('Rollo')
    expect(formatQty(3, 'Nos')).toBe('3 pzas')
    expect(formatQty(1.5, 'Kg')).toBe('1.5 kg')
  })
  it('money in es-MX', () => {
    expect(formatMoney(1400)).toBe('$1,400.00')
    expect(formatMoney(-743.8)).toBe('-$743.80')
    expect(formatMoney(1400, 'MXN', { decimals: 0 })).toBe('$1,400')
    expect(formatMoney(12, 'USD')).toBe('USD 12.00')
    expect(formatMoney(null)).toBe('—')
    expect(formatMoney('')).toBe('—')
    expect(formatMoneyCompact(1500)).toBe('$1,500')
    expect(formatMoneyCompact(69800)).toBe('$69.8 mil')
    expect(formatMoneyCompact(2300000)).toBe('$2.3 M')
  })
})

describe('status labels', () => {
  it('es-MX words with a tone', () => {
    expect(statusLabel('Completed')).toBe('Completada')
    expect(statusLabel('Overdue')).toBe('Vencida')
    expect(statusTone('Overdue')).toBe('danger')
    expect(statusLabel('Draft')).toBe('Borrador')
    expect(statusLabel('Paid')).toBe('Pagada')
    expect(statusLabel('To Receive and Bill')).toBe('Por recibir y facturar')
    expect(statusLabel('Partial Success')).toBe('Lista en parte')
  })
  it('depends on what it describes', () => {
    expect(statusLabel('Completed', 'call')).toBe('Contestada')
    expect(statusLabel('No Answer', 'call')).toBe('Sin respuesta')
    expect(statusLabel('Busy', 'call')).toBe('Ocupado')
    expect(statusLabel('Completed', 'campaign')).toBe('Terminada')
    expect(statusLabel('Draft', 'campaign')).toBe('Borrador')
  })
  it('passes unknown or Spanish values through', () => {
    expect(statusLabel('Negociación')).toBe('Negociación')
    expect(statusTone('Negociación')).toBe('neutral')
    expect(statusLabel('')).toBe('')
  })
})
