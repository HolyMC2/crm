import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, render } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    Button: {
      props: ['label'],
      setup: (props) => () => h('button', props.label),
    },
  }
})

import { call, toast } from 'frappe-ui'
import FichaView from '@/components/inmobiliaria/FichaView.vue'

// What the inmobiliaria writers warn about, in their words: a row the batch
// left out and a row in another currency (patrimonial.traer_movimientos), a
// late correction (cumplimiento.corregir_aviso) and an email that did not go
// out (patrimonial.enviar_estado_cuenta).
const TOMADA =
  'ACC-SINV-2026-00007 ya está en la liquidación LIQ-0003 (borrador).'
const MONEDA =
  'ACC-PINV-2026-00009 está en USD y la propiedad en MXN; agrégala a mano con el monto convertido.'
const TARDIA =
  'Pasaron 45 días desde la presentación del 03-09-2026. El portal admite la corrección dentro de los 30 días siguientes al acuse; confirma con el portal antes de presentarla.'
const CORREO =
  'No se pudo enviar el correo: revisa la cuenta de correo de salida.'

// An action as inmobiliaria.api.fichas_admin builds it, pressed straight from
// the ficha (a sheet's answer reaches the same done()).
const accion = (overrides = {}) => ({
  id: 'traer',
  etiqueta: 'Traer movimientos',
  tipo: 'default',
  habilitada: true,
  metodo: 'inmobiliaria.api.fichas_admin.traer_movimientos_liquidacion',
  args: { liquidacion: 'LIQ-1' },
  exito: 'Movimientos del periodo traídos.',
  ...overrides,
})

// The lines of the advisory notice, as the worker reads them.
function lineas(message) {
  const el = document.createElement('div')
  render(h(message), el)
  const textos = [...el.querySelectorAll('p')].map((p) => p.textContent)
  render(null, el)
  return textos
}

describe('Inmobiliaria actions: what the app warns about in its answer reaches the worker', () => {
  let app, root, router, changed
  beforeEach(() => {
    vi.clearAllMocks()
    call.mockReset()
  })
  afterEach(() => {
    app?.unmount()
    root?.remove()
    app = root = router = changed = null
    vi.restoreAllMocks()
  })
  async function mountFicha(acciones) {
    router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:rest(.*)*', component: { render: () => null } }],
    })
    await router.push('/inmobiliaria/liquidacion/LIQ-1')
    await router.isReady()
    changed = vi.fn()
    const ficha = {
      tipo_label: 'Liquidación a propietarios',
      titulo: 'Liquidación LIQ-1',
      doctype: 'Liquidacion a Propietarios',
      name: 'LIQ-1',
      secciones: [],
      acciones,
    }
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      render: () => h(FichaView, { ficha, onChanged: changed }),
    })
    app.config.globalProperties.__ = (text) => text
    app.use(router)
    app.mount(root)
  }
  // The worker presses the action and the app answers.
  async function press(id, answer) {
    call.mockResolvedValueOnce(answer)
    root.querySelector(`[data-accion="${id}"]`).click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  it('after «exito» every advisory of the answer shows, each entry of `avisos` and the `advertencia` on its own line, until the worker closes it', async () => {
    await mountFicha([accion()])
    await press('traer', {
      ingresos: 3,
      gastos: 1,
      avisos: [TOMADA, MONEDA],
      advertencia: TARDIA,
    })
    expect(call).toHaveBeenCalledWith(
      'inmobiliaria.api.fichas_admin.traer_movimientos_liquidacion',
      { liquidacion: 'LIQ-1' },
    )
    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith(
      'Movimientos del periodo traídos.',
    )
    expect(toast.warning).toHaveBeenCalledTimes(1)
    const [message, options] = toast.warning.mock.calls[0]
    expect(lineas(message)).toEqual([TOMADA, MONEDA, TARDIA])
    expect(toast.warning.mock.invocationCallOrder[0]).toBeGreaterThan(
      toast.success.mock.invocationCallOrder[0],
    )
    // «exito» keeps the toaster's time; the advisories wait for the worker.
    expect(options).toEqual({ duration: Infinity })
    expect(changed).toHaveBeenCalledTimes(1)
  })

  it('an answer without advisories shows only «exito»', async () => {
    await mountFicha([accion()])
    // The keys the app sends empty are no advisory either.
    await press('traer', {
      ingresos: 2,
      gastos: 0,
      avisos: [],
      advertencia: null,
      aviso_correo: null,
    })
    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith(
      'Movimientos del periodo traídos.',
    )
    expect(toast.warning).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
    expect(changed).toHaveBeenCalledTimes(1)
  })

  it('a blocked action does nothing: no call, no notice, no reload', async () => {
    await mountFicha([
      accion({
        habilitada: false,
        motivo: 'Tu usuario no puede preparar liquidaciones.',
        solucion: 'Pide a un administrador inmobiliario que lo haga.',
      }),
    ])
    await press('traer', { avisos: [TOMADA], advertencia: TARDIA })
    expect(call).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.warning).not.toHaveBeenCalled()
    expect(changed).not.toHaveBeenCalled()
  })

  it('a late correction: after «Corrección preparada.» the warning shows and the new aviso opens', async () => {
    await mountFicha([
      accion({
        id: 'corregir',
        etiqueta: 'Corregir aviso presentado',
        metodo: 'inmobiliaria.api.fichas_admin.corregir_aviso',
        args: { aviso: 'AV-1' },
        exito: 'Corrección preparada.',
        abrir: 'url',
      }),
    ])
    await press('corregir', {
      aviso: 'AV-2',
      url: '/crm/inmobiliaria/aviso/AV-2',
      advertencia: TARDIA,
    })
    expect(toast.success).toHaveBeenCalledWith('Corrección preparada.')
    expect(toast.warning).toHaveBeenCalledTimes(1)
    expect(lineas(toast.warning.mock.calls[0][0])).toEqual([TARDIA])
    expect(router.currentRoute.value.fullPath).toBe('/inmobiliaria/aviso/AV-2')
    expect(changed).not.toHaveBeenCalled()
  })

  it('a statement sent by WhatsApp: the chat opens, the email that did not go out shows and the ficha reloads', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    await mountFicha([
      accion({
        id: 'estado-R1',
        etiqueta: 'Enviar estado de cuenta a Ana López',
        metodo: 'inmobiliaria.api.patrimonial.enviar_estado_cuenta',
        args: { liquidacion: 'LIQ-1', row_name: 'R1' },
        externo: 'whatsapp_url',
        exito: 'Estado de cuenta enviado.',
      }),
    ])
    const chat = 'https://wa.me/5215512345678?text=Estado%20de%20cuenta'
    await press('estado-R1', {
      propietario: 'Ana López',
      whatsapp_url: chat,
      email_enviado: false,
      enlace: 'https://inmo.test/estado-de-cuenta/abc',
      aviso: null,
      aviso_correo: CORREO,
    })
    expect(open).toHaveBeenCalledWith(chat, '_blank', 'noopener')
    expect(toast.warning).toHaveBeenCalledTimes(1)
    expect(lineas(toast.warning.mock.calls[0][0])).toEqual([CORREO])
    // An outside step still shows no «exito».
    expect(toast.success).not.toHaveBeenCalled()
    expect(changed).toHaveBeenCalledTimes(1)
  })

  it('the SAT file opens and the ficha reloads; the notices the file carries (`avisos`) are no warning', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    await mountFicha([
      accion({
        id: 'archivo-mes',
        etiqueta: 'Preparar archivo de todo el mes',
        metodo: 'inmobiliaria.api.fichas_admin.preparar_archivo_aviso',
        args: { aviso: 'AV-1', mes_completo: 1 },
        externo: 'archivo',
        exito: 'Archivo del mes listo para subirlo al portal del SAT.',
      }),
    ])
    const archivo = '/private/files/Aviso-PLD-2026-09-mes-completo.xml'
    await press('archivo-mes', {
      archivo,
      nombre: 'Aviso-PLD-2026-09-mes-completo.xml',
      avisos: ['AV-1', 'AV-3'],
    })
    expect(open).toHaveBeenCalledWith(archivo, '_blank', 'noopener')
    expect(toast.warning).not.toHaveBeenCalled()
    expect(changed).toHaveBeenCalledTimes(1)
  })
})
