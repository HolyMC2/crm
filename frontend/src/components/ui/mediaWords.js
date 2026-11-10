// Vendored from muelle/workspace/packages/ui@0.1.0 (c0d7e059548a). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory.
// The words of MediaViewer and PhotoEditor. They go through the app's
// translation like every kit string; where the app has none for one of them
// and the page is in Spanish, the kit's own es-MX word shows. Kept here and
// not in host.js: host.js is in every page's first load, these two are not.
import { t as translate } from './host'

const ES = {
  Brightness: 'Luz',
  Cancel: 'Cancelar',
  Close: 'Cerrar',
  'Crop area': 'Área del recorte',
  'Crop shape': 'Forma del recorte',
  'Drag the corners to crop.': 'Arrastra las esquinas para recortar.',
  'Edit photo': 'Editar foto',
  'Free crop': 'Libre',
  'Mirror photo': 'Voltear',
  'Next photo': 'Foto siguiente',
  'Opening the photo…': 'Abriendo la foto…',
  'Photo {0}': 'Foto {0}',
  'Photos and videos': 'Fotos y videos',
  'Previous photo': 'Foto anterior',
  'Save photo': 'Guardar foto',
  'Square crop': 'Cuadrada',
  'This photo could not be opened for editing.':
    'No se pudo abrir esta foto para editarla.',
  'Turn left': 'Girar a la izquierda',
  'Turn right': 'Girar a la derecha',
  'Undo changes': 'Deshacer cambios',
  'Video {0}': 'Video {0}',
  'Zoom in': 'Acercar',
  'Zoom out': 'Alejar',
  '{0} of {1}': '{0} de {1}',
}

const fill = (message, args) =>
  message.replace(/{(\d+)}/g, (match, i) =>
    args?.[i] !== undefined ? args[i] : match,
  )

export function t(message, args) {
  const said = translate(message, args)
  if (said !== fill(message, args) || !ES[message]) return said
  const spanish = (
    (typeof document !== 'undefined' && document.documentElement.lang) ||
    (typeof navigator !== 'undefined' && navigator.language) ||
    ''
  ).startsWith('es')
  return spanish ? fill(ES[message], args) : said
}
