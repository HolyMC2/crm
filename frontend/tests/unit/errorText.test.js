import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { errorText } from '@/utils/errorText'

// What frappe-ui rejects with: `message` is the request, `messages` is what the server said.
function callFailure(excType, messages) {
  return Object.assign(new Error(`crm.api.doc.set_lost ${excType}`), {
    exc_type: excType,
    messages,
  })
}

describe('errorText', () => {
  it('shows the server sentence', () => {
    expect(
      errorText(
        callFailure('ValidationError', ['Falta el motivo.']),
        'No se pudo guardar.',
      ),
    ).toBe('Falta el motivo.')
  })

  it('joins every distinct sentence the server sent', () => {
    const failure = callFailure('ValidationError', ['Uno.', 'Dos.', 'Uno.'])
    expect(errorText(failure, 'x')).toBe('Uno. Dos.')
    expect(errorText(failure, 'x', '\n')).toBe('Uno.\nDos.')
  })

  it('shows the fallback when the server gave no sentence, never the request', () => {
    expect(
      errorText(
        callFailure('TypeError', ['Internal Server Error']),
        'Otra vez.',
      ),
    ).toBe('Otra vez.')
    expect(errorText(callFailure('TypeError', []), 'Otra vez.')).toBe(
      'Otra vez.',
    )
    expect(
      errorText(
        {
          exc_type: 'PermissionError',
          message: '/api/method/x PermissionError',
        },
        'Sin permiso.',
      ),
    ).toBe('Sin permiso.')
  })

  it('prints markup in a server sentence as text', () => {
    expect(
      errorText(
        callFailure('ValidationError', [
          '<strong>Precio</strong> inválido<br>Revisa &amp; reintenta',
        ]),
        'x',
      ),
    ).toBe('Precio inválido Revisa & reintenta')
  })

  it('keeps a sentence our own code raised', () => {
    expect(
      errorText(
        Object.assign(new Error('Solo tus propios pendientes.'), {
          exc_type: 'PermissionError',
        }),
        'x',
      ),
    ).toBe('Solo tus propios pendientes.')
    expect(errorText(new Error('La foto pesa demasiado'), 'x')).toBe(
      'La foto pesa demasiado',
    )
    expect(errorText('Sin cámara', 'x')).toBe('Sin cámara')
  })

  it('never reads out an exception class or a traceback', () => {
    expect(errorText({ message: 'ValidationError' }, 'Otra vez.')).toBe(
      'Otra vez.',
    )
    expect(
      errorText({ messages: ['Traceback (most recent call last): …'] }, 'x'),
    ).toBe('x')
  })

  it('shows the fallback for a request that never left the browser', () => {
    expect(errorText(new TypeError('Failed to fetch'), 'Sin conexión.')).toBe(
      'Sin conexión.',
    )
    expect(errorText(new Error('NetworkError when fetching'), 'x')).toBe('x')
    expect(errorText(new SyntaxError('Unexpected token < in JSON'), 'x')).toBe(
      'x',
    )
    expect(errorText(null, 'x')).toBe('x')
    expect(errorText(undefined)).toBe('')
  })
})

// The error's own `message` is the request text. These files read it to
// classify a failure or to wrap a library that is not Frappe; none prints it.
const READS_MESSAGE = new Set([
  'utils/errorText.js',
  'components/Reports/MarketingData.js', // classifies
  'utils/inquiries.js', // classifies
  'utils/contactos.js', // classifies
  'components/assistant/assistantAgenda.js', // classifies
  'components/Telephony/TwilioCallUI.vue', // the Twilio SDK's errors
  'components/bancos/syncfyWidget.js', // the bank widget's error
  'components/productos/LabelDialog.vue', // an Error the file raises itself
  'composables/telemetry.js', // window error events
  // Objects our own code builds, with a sentence in `message`:
  'components/Inquiries/InquiryDetail.vue',
  'components/impresion/PrintPreview.vue',
  'components/Settings/AssignmentRules/AssignmentRuleView.vue',
  'components/Forms/channels/WhatsAppFlowCard.vue',
  'components/doco/forms/DocoFormRenderer.vue',
])
const RAW_READ = /\b(?:e|err|error|ex)\??\.message\b/
// A line that tests the message or compares it is classifying, not printing.
const CLASSIFIES = /\.test\(|===|!==/
const root = path.resolve(__dirname, '../../src')

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(p, out)
    else if (
      /\.(vue|js|ts)$/.test(entry.name) &&
      !/\.(test|spec)\./.test(entry.name)
    )
      out.push(p)
  }
  return out
}

describe('a failed call on screen', () => {
  it('goes through errorText, never the raw error message', () => {
    const offenders = []
    for (const file of sourceFiles(root)) {
      const rel = path.relative(root, file)
      if (
        rel.startsWith('vendor/') ||
        rel.startsWith('components/ui/') ||
        READS_MESSAGE.has(rel)
      )
        continue
      const lines = fs.readFileSync(file, 'utf8').split('\n')
      for (const [i, line] of lines.entries()) {
        if (
          RAW_READ.test(line) &&
          !CLASSIFIES.test(line) &&
          !/console\.(error|warn|log)/.test(line)
        )
          offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`)
      }
    }
    // Print with errorText(e, fallback) from '@/utils/errorText'.
    expect(offenders).toEqual([])
  })
})
