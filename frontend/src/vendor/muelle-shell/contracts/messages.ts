// Vendored from muelle/workspace/packages/shell-contracts@0.4.0 (72b40436d0d0). DO NOT EDIT:
// change the package, then run its scripts/vendor.mjs against this directory.
// Source strings are English (spec §4.8); workers see the reviewed es-MX
// catalog. Apps pass their own `__` so their catalogs stay authoritative, and
// merge SHELL_MESSAGES_ES_MX into them so no shared string is missing.

/** Frappe's `__(text, replace)` shape: `{0}`, `{1}` … placeholders. */
export type Translate = (source: string, replace?: ReadonlyArray<string | number>) => string

export const format: Translate = (source, replace = []) =>
  source.replace(/\{(\d+)\}/g, (match, index: string) => {
    const value = replace[Number(index)]
    return value === undefined ? match : String(value)
  })

export const SHELL_MESSAGES_ES_MX: Readonly<Record<string, string>> = Object.freeze({
  'Back to {0}': 'Volver a {0}',
  'Go back': 'Volver',
  'Try again': 'Reintentar',
  'Request access': 'Pedir acceso',
  'Copy request': 'Copiar solicitud',
  'Copy details for support': 'Copiar detalles para soporte',
  'Recheck permissions': 'Reintentar permisos',
  "We couldn't complete this.": 'No pudimos completar esto.',
  'Try again. If it keeps happening, copy the details for support.':
    'Reintenta. Si sigue pasando, copia los detalles para soporte.',
  '{0} is not available for your role.': '{0} no está disponible para tu puesto.',
  'Ask a manager for access, or go back to Hoy.': 'Pide acceso a un encargado o vuelve a Hoy.',
  'Not available for your role': 'No disponible para tu puesto',
  'Go to Hoy': 'Ir a Hoy',
  Actions: 'Acciones',
  Records: 'Registros',
  'Go to': 'Ir a',
  Recent: 'Recientes',
  'Searching…': 'Buscando…',
  'See all in {0}': 'Ver todos en {0}',
  'Open the command palette': 'Abrir la paleta de comandos',
  'Focus the list search': 'Buscar en la lista',
  'Go to {0}': 'Ir a {0}',
  Create: 'Crear',
  'Next row': 'Siguiente fila',
  'Previous row': 'Fila anterior',
  'Open record': 'Abrir ficha',
  'Open beside the list': 'Abrir al lado',
  'Toggle selection': 'Seleccionar o quitar',
  'Extend selection': 'Extender selección',
  'Select the visible page': 'Seleccionar la página visible',
  Edit: 'Editar',
  Save: 'Guardar',
  'Close the top layer': 'Cerrar la capa superior',
  'Show or hide the sidebar': 'Mostrar u ocultar la barra lateral',
  'Keyboard shortcuts': 'Atajos de teclado',
  // Keyboard standard (0.4.0): universal rows, search dialog modes, cheat sheet.
  'Show keyboard shortcuts': 'Ver los atajos de teclado',
  'View keyboard shortcuts': 'Ver atajos de teclado',
  'Search or go to…': 'Buscar o ir a…',
  'Search records': 'Buscar registros',
  'Search records…': 'Buscar registros…',
  'Save or submit the form': 'Guardar o enviar el formulario',
  All: 'Todo',
  '↑↓ to move · ↵ to open · Esc to close': '↑↓ moverse · ↵ abrir · Esc cerrar',
  'Quick shortcuts': 'Atajos rápidos',
  'On this page': 'En esta página',
  'Across {0}': 'En todo {0}',
})

/** es-MX lookup with English fallback, for tests and for apps without a catalog. */
export const esMx: Translate = (source, replace) => format(SHELL_MESSAGES_ES_MX[source] ?? source, replace)
