"""Private candidate server for one fictional core-only test site.

Maintenance stays enabled in stored site config. This isolated process overrides
it in its own copied request configuration so browser tests can exercise real
HTTP transactions without publishing the candidate through the shared backend.
"""
import os
import sys
sys.path.insert(0, '/tmp/crm-inquiry-candidate')
os.chdir('/home/frappe/frappe-bench/sites')
import frappe
import frappe.app
import requests
import smtplib
from werkzeug.serving import run_simple

SITE = 'crm-inquiry-test-20260909.lab.xoloitzcuintles.com'
original_init = frappe.init

def test_init(site=None, *args, **kwargs):
    if site != SITE:
        raise RuntimeError('Candidate server is restricted to its fictional test site')
    result = original_init(site, *args, **kwargs)
    frappe.local.conf = frappe._dict(frappe.local.conf)
    frappe.local.conf.maintenance_mode = 0
    frappe.local.conf.mute_emails = 1
    frappe.local.conf.developer_mode = 1
    return result

def block_transport(*args, **kwargs):
    raise RuntimeError('External transport blocked in candidate browser acceptance')

frappe.init = test_init
frappe.app._site = SITE
requests.sessions.Session.request = block_transport
smtplib.SMTP.sendmail = block_transport
run_simple('0.0.0.0', 18131, frappe.app.application, use_reloader=False, use_debugger=False, threaded=True)
