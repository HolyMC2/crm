import { accentCss, appearanceFrom } from '@/vendor/muelle-shell/tokens'

// Site palette (Doco Business Settings, default «Gris») → --muelle-accent*.
// tokens.css carries the default; this overrides it for the site's preset.
export function applyShellAppearance(palette) {
  if (typeof document === 'undefined') return
  let style = document.getElementById('muelle-accent')
  if (!style) {
    style = document.createElement('style')
    style.id = 'muelle-accent'
    document.head.appendChild(style)
  }
  style.textContent = accentCss(appearanceFrom(palette || undefined))
}
