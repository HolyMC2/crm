import os,sys,unittest,importlib.util
from unittest.mock import patch
sys.path.insert(0,'/tmp/crm-inquiry-candidate')
os.chdir('/home/frappe/frappe-bench/sites')
import frappe,doco,clinica,taller
for module in [doco,clinica,taller]:module.__path__.insert(0,'/tmp/crm-provider-candidate/'+module.__name__)
frappe.init(site='crm-inquiry-test-20260909.lab.xoloitzcuintles.com');frappe.connect()
frappe.db.sql('SET SESSION TRANSACTION READ ONLY');frappe.db.rollback()
try:
 loader=unittest.TestLoader()
 suite=unittest.TestSuite([loader.loadTestsFromName(name) for name in ['doco.crm.test_discovery','crm.tests.test_vertical_capabilities','crm.tests.test_audit_boundaries']])
 for app in ['clinica','taller']:
  spec=importlib.util.spec_from_file_location(app+'_crm_provider_tests','/tmp/crm-provider-candidate/'+app+'/test_crm_provider.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);suite.addTests(loader.loadTestsFromModule(module))
 with patch('requests.sessions.Session.request',side_effect=AssertionError('External requests prohibited')), patch('smtplib.SMTP.sendmail',side_effect=AssertionError('Mail prohibited')):
  result=unittest.TextTestRunner(verbosity=2).run(suite)
finally:frappe.db.rollback();frappe.destroy()
sys.exit(not result.wasSuccessful())
