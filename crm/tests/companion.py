"""Fixtures owned by companion apps that may not be deployed on this bench.

A missing companion module skips the dependent suite with its name instead of
aborting discovery of every CRM test.
"""

import importlib
import unittest


def fixture(module, name):
	"""Return (attribute, missing_module); the placeholder keeps the class definable."""
	try:
		return getattr(importlib.import_module(module), name), None
	except ImportError:
		return object, module


def skip_if_missing(*missing):
	absent = [module for module in missing if module]
	return unittest.skipIf(bool(absent), "companion module not installed: " + ", ".join(absent))
