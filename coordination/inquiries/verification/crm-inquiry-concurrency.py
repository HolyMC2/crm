"""Committed fictional fixtures on a dedicated core-only site; exact cleanup."""
import os
import sys
import threading
import uuid
from unittest.mock import patch

sys.path.insert(0, '/tmp/crm-inquiry-candidate')
os.chdir('/home/frappe/frappe-bench/sites')
import frappe
from crm.api import inquiries as api

SITE = 'crm-inquiry-test-20260909.lab.xoloitzcuintles.com'
KEY = 'INQUIRY-RACE-' + uuid.uuid4().hex[:12]
USER = KEY.lower() + '@example.invalid'
created_inquiries = set()
created_leads = set()


def connect(user='Administrator'):
    frappe.init(site=SITE)
    frappe.connect()
    frappe.local.conf = frappe._dict(frappe.local.conf)
    frappe.local.conf.developer_mode = 1
    assert frappe.get_hooks("has_permission")["CRM Inquiry"] == ["crm.fcrm.doctype.crm_inquiry.crm_inquiry.has_permission"]
    assert set(frappe.get_installed_apps()) == {'frappe', 'crm'}
    frappe.set_user(user)


def blocked(*a, **kw):
    raise AssertionError('External effects prohibited')


def race(action):
    barrier = threading.Barrier(2, timeout=10)
    results, errors = [], []
    def work():
        try:
            connect()
            api._require_member()  # Establish the same pre-action MVCC snapshot.
            barrier.wait()
            results.append(action())
            frappe.db.commit()
        except Exception as e:
            errors.append((type(e).__name__, type(e.__context__).__name__))
            frappe.db.rollback()
        finally:
            frappe.destroy()
    threads = [threading.Thread(target=work, daemon=True) for _ in range(2)]
    for t in threads: t.start()
    for t in threads: t.join(timeout=20)
    assert all(not t.is_alive() for t in threads), 'Worker did not finish'
    assert results, errors
    assert all(e[0] == 'QueryDeadlockError' or e == ('ValidationError', 'QueryDeadlockError') for e in errors), errors
    return results, errors


connect()
try:
    with patch('requests.sessions.Session.request', side_effect=blocked), \
            patch('smtplib.SMTP.sendmail', side_effect=blocked), \
            patch('frappe.sendmail'), patch('frappe.publish_realtime'), \
            patch('crm.fcrm.doctype.crm_lead.crm_lead.CRMLead.assign_agent'):
        payload = {'title': KEY, 'client_request_id': KEY,
                   'people': [{'display_name': KEY, 'role': 'Requester'}]}
        results, conflicts = race(lambda: api.create_inquiry(payload))
        frappe.db.rollback()
        inquiry = api.create_inquiry(payload)
        created_inquiries.add(inquiry['name'])
        assert frappe.db.count('CRM Inquiry', {'capture_key': api._capture_key(KEY)}) == 1
        assert {r['name'] for r in results} == {inquiry['name']}
        frappe.db.commit()
        print('PASS concurrent capture: one inquiry, stable retry; safe conflicts=' + str(conflicts))

        person = inquiry['people'][0]['person_key']
        results, conflicts = race(lambda: api.convert_person(inquiry['name'], person))
        frappe.db.rollback()
        retry = api.convert_person(inquiry['name'], person)
        created_leads.add(retry['lead'])
        assert frappe.db.count('CRM Lead', {'first_name': KEY}) == 1
        assert not retry['created']
        assert {r['lead'] for r in results} == {retry['lead']}
        frappe.db.commit()
        print('PASS concurrent conversion: one lead, stable retry; safe conflicts=' + str(conflicts))

        source_key = 'fictional-provider:' + KEY
        source_payload = {'title': KEY + '-source', 'source_type': 'Facebook'}
        results, conflicts = race(lambda: api.capture_source_inquiry(source_key, source_payload))
        frappe.db.rollback()
        source = api.capture_source_inquiry(source_key, {'title': 'Later enrichment must not overwrite'})
        assert frappe.db.count('CRM Inquiry', {'title': KEY + '-source'}) == 1
        assert source['title'] == KEY + '-source'
        assert {r['name'] for r in results} == {source['name']}
        frappe.db.commit()
        print('PASS concurrent known-source capture: one snapshot across retries; safe conflicts=' + str(conflicts))

        frappe.get_doc({'doctype': 'User', 'email': USER, 'first_name': 'Fictional revoked agent',
                        'send_welcome_email': 0, 'roles': [{'role': 'Sales User'}]}).insert()
        revoked = api.create_inquiry({'title': KEY + '-revoked', 'client_request_id': KEY + '-revoked',
                         'people': [{'display_name': KEY + '-revoked', 'role': 'Requester'}]})
        created_inquiries.add(revoked['name'])
        revoked = api.update_inquiry(revoked['name'], str(revoked['modified']), {'assigned_to': USER})
        frappe.db.commit()
        snapshot_ready, reassigned = threading.Event(), threading.Event()
        outcomes = []
        def stale_worker():
            try:
                connect(USER)
                api._require_member()
                # Read old persisted ownership into the REPEATABLE READ snapshot.
                assert frappe.db.get_value('CRM Inquiry', revoked['name'], 'assigned_to') == USER
                snapshot_ready.set()
                assert reassigned.wait(10)
                api.convert_person(revoked['name'], revoked['people'][0]['person_key'])
                frappe.db.commit()
                outcomes.append('UNAUTHORIZED_SUCCESS')
            except frappe.PermissionError:
                frappe.db.rollback()
                outcomes.append('permission_denied')
            except Exception as e:
                frappe.db.rollback()
                outcomes.append((type(e).__name__, type(e.__context__).__name__))
            finally:
                frappe.destroy()
        worker = threading.Thread(target=stale_worker, daemon=True)
        worker.start()
        assert snapshot_ready.wait(10)
        api.update_inquiry(revoked['name'], str(revoked['modified']), {'assigned_to': 'Administrator'})
        frappe.db.commit()
        reassigned.set()
        worker.join(20)
        assert not worker.is_alive(), 'Revocation worker stuck'
        assert outcomes == ['permission_denied'] or outcomes == [('ValidationError', 'QueryDeadlockError')], outcomes
        frappe.set_user(USER)
        try:
            api.convert_person(revoked['name'], revoked['people'][0]['person_key'])
            raise AssertionError('Fresh revoked-assignee retry unexpectedly succeeded')
        except frappe.PermissionError:
            pass
        finally:
            frappe.db.rollback()
            frappe.set_user('Administrator')
        frappe.db.rollback()
        assert frappe.db.count('CRM Lead', {'first_name': KEY + '-revoked'}) == 0
        print('PASS revoked assignee: stale snapshot cannot convert, fresh retry denied; outcomes=' + str(outcomes))
finally:
    frappe.set_user('Administrator')
    frappe.db.rollback()
    # Find only our exact fictional title/name scope, including partial failures.
    names = frappe.get_all('CRM Inquiry', filters={'title': ['in', [KEY, KEY + '-revoked', KEY + '-source']]}, pluck='name')
    leads = frappe.get_all('CRM Lead', filters={'first_name': ['in', [KEY, KEY + '-revoked', KEY + '-source']]}, pluck='name')
    for name in names:
        frappe.db.delete('CRM Inquiry Person', {'parent': name, 'parenttype': 'CRM Inquiry'})
        frappe.db.delete('Version', {'ref_doctype': 'CRM Inquiry', 'docname': name})
        frappe.db.delete('CRM Inquiry', {'name': name})
    for name in leads:
        frappe.db.delete('CRM Status Change Log', {'parent': name, 'parenttype': 'CRM Lead'})
        frappe.db.delete('CRM Lead', {'name': name})
    for dt in ['Has Role', 'Block Module', 'User Email', 'User Social Login']:
        if frappe.db.exists('DocType', dt):
            frappe.db.delete(dt, {'parent': USER, 'parenttype': 'User'})
    frappe.db.delete('User', {'name': USER})
    frappe.db.commit()
    frappe.destroy()
