// The phone ⋯ sheet on the Forms list (pages/Forms.vue). Shell D3: the builder
// (/forms/:formId, route «Form») is desk-only, so no action here may route there.
// «Editar» and «Envíos» stay on the desktop row menu; the QR opens in a sheet on
// the list instead of the builder's Share tab. `to` is set only for an action that
// navigates; tests/unit/formPhoneActions.test.js checks none of them is desk-only.
export function formPhoneActions(f, { confirmingDelete = false } = {}) {
  if (!f) return []
  return [
    { key: 'copy', icon: 'lucide-link', label: __('Copiar enlace') },
    { key: 'qr', icon: 'lucide-qr-code', label: __('Código QR') },
    {
      key: 'public',
      icon: 'lucide-external-link',
      label: __('Abrir la página pública'),
    },
    {
      key: 'publish',
      icon: f.published ? 'lucide-eye-off' : 'lucide-eye',
      label: f.published ? __('Despublicar') : __('Publicar'),
    },
    {
      key: 'duplicate',
      icon: 'lucide-copy',
      label: f.incompatible_fields
        ? __('Duplicar como formulario limpio')
        : __('Duplicar'),
    },
    confirmingDelete
      ? {
          key: 'delete',
          icon: 'lucide-trash-2',
          label: __('Confirmar: eliminar'),
          hint: __('No se puede deshacer'),
          danger: true,
        }
      : { key: 'delete', icon: 'lucide-trash-2', label: __('Eliminar') },
  ]
}
