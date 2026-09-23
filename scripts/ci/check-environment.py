"""Refuse a native CI image that cannot satisfy this CRM revision's dependencies."""

import sys
from importlib.metadata import version
from pathlib import Path

import tomllib
from packaging.requirements import Requirement
from packaging.specifiers import SpecifierSet
from packaging.version import Version

config = tomllib.loads(Path(sys.argv[1]).read_text())
frappe_version = Version(version("frappe"))
constraint = config["tool"]["bench"]["frappe-dependencies"]["frappe"]
if frappe_version.major != 16 or frappe_version not in SpecifierSet(constraint):
	raise RuntimeError(
		f"CI image Frappe {frappe_version} does not satisfy supported Frappe 16 / {constraint}"
	)
for value in config["project"]["dependencies"]:
	requirement = Requirement(value)
	if requirement.marker is not None and not requirement.marker.evaluate():
		continue
	installed = version(requirement.name)
	if installed not in requirement.specifier:
		raise RuntimeError(f"CI image has {requirement.name} {installed}, but CRM requires {value}")
print(f"Native image satisfies CRM dependencies on Frappe {frappe_version}")
