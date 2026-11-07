import { ref } from 'vue'
import { toast } from 'frappe-ui'
import { errorText } from './bancos'
import { QUE_CONECTAS, syncfy } from './conectados'

const TYPES_BY_KIND = {
  Bank: QUE_CONECTAS[0].types,
  Tax: QUE_CONECTAS[1].types,
  Wallet: QUE_CONECTAS[2].types,
}
const WIDGET_FAILED =
  'No se pudo abrir la ventana de Syncfy. Revisa tu conexión e inténtalo de nuevo.'

/**
 * The step that settles a bank login, wherever its button sits (the login's
 * page, the account it feeds): «Sincronizar ahora» asks Syncfy for a pull, or
 * opens Syncfy's window when the bank wants a one-time code; «Reconectar» and
 * «Escribir el código» open it on the login; «Conectar de nuevo» starts over.
 * `onDone` reads the screen again afterwards.
 */
export function useConexionStep(onDone) {
  const busy = ref(false)
  const problem = ref('')

  async function widget(conexion, options) {
    let openSyncfy
    try {
      ;({ openSyncfy } = await import('./syncfyWidget'))
    } catch {
      throw new Error(WIDGET_FAILED)
    }
    const result = await openSyncfy({
      company: conexion.company,
      ...options,
    }).catch((error) => {
      throw error?.message === 'widget' ? new Error(WIDGET_FAILED) : error
    })
    if (result?.error) toast.warning(result.error)
    else if (result?.connection)
      toast.success('Listo. Syncfy está trayendo los movimientos.')
    return result
  }

  async function run(conexion, step = conexion?.step) {
    if (busy.value || !conexion || !step) return null
    busy.value = true
    problem.value = ''
    try {
      let result = null
      if (step === 'sync') {
        const answer = await syncfy.syncNow(conexion.name)
        if (answer?.widget)
          result = await widget(conexion, {
            credential: answer.credential || conexion.credential,
          })
        else
          toast.success(
            'Sincronizando. Los movimientos nuevos llegan en unos minutos.',
          )
      } else if (step === 'code' || step === 'reconnect') {
        result = await widget(conexion, { credential: conexion.credential })
      } else if (step === 'update') {
        result = await widget(conexion, { update: conexion.credential })
      } else if (step === 'connect') {
        result = await widget(conexion, {
          types: TYPES_BY_KIND[conexion.kind] || [],
        })
      }
      onDone?.(result)
      return result
    } catch (error) {
      problem.value = errorText(error)
      return null
    } finally {
      busy.value = false
    }
  }

  return { busy, problem, run }
}
