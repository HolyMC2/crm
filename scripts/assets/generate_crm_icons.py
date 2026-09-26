"""Export CRM's vector mark with librsvg (rsvg-convert); no generated artwork.

Run from any directory: python3 scripts/assets/generate_crm_icons.py
PWA icons have an opaque field and inset artwork for the maskable safe zone.
Existing splash JPEGs are unreferenced; iOS generates its launch screen from the icon.
"""

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "crm/public/images/logo.svg"


def export(svg: str, size: int, target: str) -> None:
	subprocess.run(
		["rsvg-convert", "-w", str(size), "-h", str(size), "-o", str(ROOT / target)],
		input=svg.encode(),
		check=True,
	)


def main() -> None:
	source = SOURCE.read_text()
	export(source, 512, "crm/public/images/logo.png")
	export(source, 32, "frontend/public/favicon.png")
	content = source[source.index("  <path") : source.index("</svg>")]
	maskable = (
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">'
		'<rect width="32" height="32" fill="#0f6b78"/>'
		'<g transform="translate(3.2 3.2) scale(.8)">' + content + "</g></svg>"
	)
	for size, filename in [
		(180, "apple-icon-180.png"),
		(192, "manifest-icon-192.maskable.png"),
		(512, "manifest-icon-512.maskable.png"),
	]:
		export(maskable, size, f"crm/public/manifest/{filename}")


if __name__ == "__main__":
	main()
