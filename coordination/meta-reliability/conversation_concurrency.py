"""Actual committed multi-process ownership/fence proof; dedicated fictional lab.

No HTTP/provider attempts. Immutable conversation/control evidence is retained;
exact temporary accounts, users and shop are deleted after closing the conversation.
"""
from contextlib import ExitStack, contextmanager
import json
from pathlib import Path
import selectors
import subprocess
import sys
import time
import traceback
from uuid import uuid4

CANDIDATE = Path('/tmp/meta-wa-20260910')
SITE = 'meta-reliability-test-20260910.lab.xoloitzcuintles.com'
sys.path.insert(0, str(CANDIDATE))
import frappe
from crm.api import conversations as api


def emit(event, **values):
    print(json.dumps({'event': event, **values}, default=str, sort_keys=True), flush=True)


def initialize(user='Administrator'):
    frappe.init(site=SITE); frappe.connect(); frappe.set_user(user)
    frappe.local.conf.developer_mode = 1
    assert frappe.local.site == SITE
    assert frappe.conf.get('pause_scheduler') or frappe.conf.get('disable_scheduler')
    assert Path(api.__file__).resolve().is_relative_to(CANDIDATE)


@contextmanager
def blocked():
    def deny(*args, **kwargs):
        raise AssertionError('External effects prohibited in conversation race proof')
    def queue(method, *args, **kwargs):
        if method in {'frappe.core.doctype.user.user.create_contact', 'frappe.model.delete_doc.delete_dynamic_links'}:
            emit('fixture_enqueue_suppressed', method=method)
            return None
        return deny()
    with ExitStack() as stack:
        for name in ('requests.sessions.Session.request', 'smtplib.SMTP.sendmail'):
            stack.enter_context(__import__('unittest.mock', fromlist=['patch']).patch(name, side_effect=deny))
        stack.enter_context(__import__('unittest.mock', fromlist=['patch']).patch('frappe.enqueue', side_effect=queue))
        for name in ('frappe.sendmail', 'frappe.publish_realtime'):
            stack.enter_context(__import__('unittest.mock', fromlist=['patch']).patch(name))
        yield


def child(mode, cfg):
    initialize(cfg['actor'])
    try:
        with blocked():
            emit('ready', mode=mode, pid=__import__('os').getpid())
            if mode == 'race':
                assert sys.stdin.readline().strip() == 'go'
            if mode in {'race', 'take'}:
                try:
                    result = api.apply_control(cfg['name'], 'take', cfg['generation'], cfg['command'], reason=cfg.get('reason'))
                    frappe.db.commit()
                    emit('control', result=result)
                except frappe.TimestampMismatchError as error:
                    frappe.db.rollback()
                    emit('conflict', kind=type(error).__name__)
            elif mode == 'hold':
                with api.conversation_fence(cfg['name']):
                    doc = api.assert_current_generation(cfg['name'], cfg['generation'], actor_user=cfg['actor'])
                    # Durable checkpoint only: mirrors P5 Submitting commit but never sends.
                    key = api._digest([cfg['name'], 'proof_dispatch_submitting'])
                    api._persist_transition(doc, api._snapshot(doc), key=key, fingerprint=key,
                        origin='System', actor=cfg['actor'], action='proof_dispatch_submitting',
                        reason='Fictional dispatch checkpoint; no provider request')
                    frappe.db.commit()
                    api._assert_fence(cfg['name'])
                    emit('submitting_committed_fence_held', generation=doc.generation)
                    assert sys.stdin.readline().strip() == 'release'
                emit('fence_released')
            elif mode == 'stale':
                try:
                    with api.conversation_fence(cfg['name'], timeout=0):
                        api.assert_current_generation(cfg['name'], cfg['generation'], actor_user=cfg['actor'])
                    raise AssertionError('Stale/overlapping dispatch unexpectedly authorized')
                except frappe.TimestampMismatchError as error:
                    frappe.db.rollback()
                    emit('dispatch_denied', kind=type(error).__name__)
            else:
                raise AssertionError(mode)
    except Exception:
        frappe.db.rollback()
        emit('child_error', traceback=traceback.format_exc())
        raise
    finally:
        frappe.db.rollback(); frappe.destroy()


def spawn(mode, cfg):
    proc = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), mode, json.dumps(cfg)],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0,
        cwd='/home/frappe/frappe-bench/sites')
    return proc


def line(proc, timeout=15):
    pending = getattr(proc, '_proof_pending', b'')
    while b'\n' not in pending:
        with selectors.DefaultSelector() as selector:
            selector.register(proc.stdout, selectors.EVENT_READ)
            assert selector.select(timeout), f'Child {proc.pid} timed out'
        raw = __import__('os').read(proc.stdout.fileno(), 4096)
        assert raw, (proc.pid, proc.poll(), proc.stderr.read() if proc.poll() is not None else '')
        pending += raw
    raw, proc._proof_pending = pending.split(b'\n', 1)
    result = json.loads(raw)
    emit('process_output', pid=proc.pid, value=result)
    return result


def finish(proc):
    stdout, stderr = proc.communicate(timeout=15)
    stdout = getattr(proc, '_proof_pending', b'') + stdout
    emit('process_result', pid=proc.pid, returncode=proc.returncode, stdout=stdout.decode(), stderr=stderr.decode())
    assert proc.returncode == 0, (stdout, stderr)


def fixture():
    prefix = 'control-proof-' + uuid4().hex[:10]
    users = []
    shop = None
    if frappe.db.has_column('WhatsApp Account', 'doco_shop'):
        shop = frappe.get_doc({'doctype': 'Social Shop', 'shop_name': prefix, 'enabled': 1}).insert().name
    for index in (1, 2):
        user = f'{prefix}-{index}@example.invalid'
        frappe.get_doc({'doctype': 'User', 'email': user, 'first_name': 'Fictional control proof',
                        'enabled': 1, 'send_welcome_email': 0, 'roles': [{'role': 'Sales User'}]}).insert()
        users.append(user)
        if shop:
            frappe.get_doc({'doctype': 'User Permission', 'user': user, 'allow': 'Social Shop', 'for_value': shop}).insert()
    account_id = '97' + str(int(uuid4().hex[:12], 16))
    account = frappe.get_doc({'doctype': 'WhatsApp Account', 'account_name': prefix, 'phone_id': account_id,
                             'status': 'Active', 'mode': 'Demo', 'doco_shop': shop,
                             'is_default_incoming': 0, 'is_default_outgoing': 0}).insert()
    doc = api.get_or_create('WhatsApp', account_id, '5215550100666')
    frappe.db.commit()
    cfg = {'prefix': prefix, 'name': doc.name, 'users': users, 'shop': shop, 'account': account.name}
    emit('fixtures_committed', **cfg)
    return cfg


def cleanup(cfg):
    frappe.db.rollback(); frappe.set_user('Administrator')
    doc = frappe.get_doc(api.DOCTYPE, cfg['name'])
    if doc.control_state != 'Closed':
        api.apply_control(doc.name, 'close', doc.generation, cfg['prefix'] + '-close', reason='Fictional proof completed')
    # Retain immutable evidence including actor identifiers; User deletion with
    # force preserves those historical Link values rather than deleting events.
    frappe.delete_doc('WhatsApp Account', cfg['account'], force=True, ignore_permissions=True)
    for user in cfg['users']:
        frappe.db.delete('User Permission', {'user': user})
        frappe.delete_doc('User', user, force=True, ignore_permissions=True)
    if cfg['shop']:
        frappe.delete_doc('Social Shop', cfg['shop'], force=True, ignore_permissions=True)
    frappe.db.commit()
    remaining = {'accounts': frappe.db.count('WhatsApp Account', {'name': cfg['account']}),
                 'users': sum(frappe.db.count('User', {'name': user}) for user in cfg['users']),
                 'shop': frappe.db.count('Social Shop', {'name': cfg['shop']}) if cfg['shop'] else 0,
                 'conversation': frappe.db.count(api.DOCTYPE, {'name': cfg['name']}),
                 'audit_events': frappe.db.count(api.EVENT, {'conversation': cfg['name']})}
    assert remaining['accounts'] == remaining['users'] == remaining['shop'] == 0, remaining
    assert remaining['conversation'] == 1 and remaining['audit_events'] >= 1, remaining
    emit('cleanup', retained='One closed private fictional conversation plus immutable control events; no account/users/shop remain', **remaining)


def proof():
    initialize()
    cfg, children, cleaned = None, [], False
    try:
        with blocked():
            cfg = fixture()
            commands = [dict(name=cfg['name'], actor=user, generation=1, command=cfg['prefix'] + '-' + str(i))
                        for i, user in enumerate(cfg['users'])]
            racers = [spawn('race', command) for command in commands]; children.extend(racers)
            for proc in racers:
                assert line(proc)['event'] == 'ready'
            for proc in racers:
                proc.stdin.write(b'go\n'); proc.stdin.flush()
            results = [line(proc) for proc in racers]
            assert sorted(result['event'] for result in results) == ['conflict', 'control'], results
            for proc in racers:
                finish(proc)
            winner = next(i for i, result in enumerate(results) if result['event'] == 'control')
            winning = commands[winner]
            frappe.db.rollback()
            assert frappe.db.count(api.EVENT, {'conversation': cfg['name']}) == 1
            assert frappe.db.get_value(api.DOCTYPE, cfg['name'], 'generation') == 2
            emit('race_verified', winner=winner, generation=2, events=1)

            # Treat the first response as lost; a fresh process sends the SAME ID.
            replay = spawn('take', winning); children.append(replay)
            assert line(replay)['event'] == 'ready'
            replayed = line(replay)
            assert replayed['event'] == 'control' and replayed['result']['replayed']
            finish(replay)
            frappe.db.rollback()
            assert frappe.db.count(api.EVENT, {'conversation': cfg['name']}) == 1
            emit('lost_response_replay_verified', events=1)

            hold_cfg = dict(winning, generation=2)
            holder = spawn('hold', hold_cfg); children.append(holder)
            assert line(holder)['event'] == 'ready'
            assert line(holder)['event'] == 'submitting_committed_fence_held'
            denied = spawn('stale', hold_cfg); children.append(denied)
            assert line(denied)['event'] == 'ready'
            assert line(denied)['event'] == 'dispatch_denied'; finish(denied)
            takeover_cfg = dict(name=cfg['name'], generation=2, actor='Administrator',
                                command=cfg['prefix'] + '-takeover', reason='Fictional fence takeover')
            takeover = spawn('take', takeover_cfg); children.append(takeover)
            assert line(takeover)['event'] == 'ready'
            with selectors.DefaultSelector() as selector:
                selector.register(takeover.stdout, selectors.EVENT_READ)
                assert not selector.select(0.4), 'Takeover passed a held fence'
            emit('takeover_waited_on_submitting_fence')
            holder.stdin.write(b'release\n'); holder.stdin.flush()
            assert line(holder)['event'] == 'fence_released'; finish(holder)
            taken = line(takeover)
            assert taken['event'] == 'control' and taken['result']['generation'] == 3
            finish(takeover)
            stale = spawn('stale', hold_cfg); children.append(stale)
            assert line(stale)['event'] == 'ready'
            assert line(stale)['event'] == 'dispatch_denied'; finish(stale)
            emit('fence_verified', generation=3, provider_attempts=0, dispatched=0,
                 note='Real Submitting-like checkpoint commit retained fence; prior in-flight attempt is never claimed recalled')
            cleanup(cfg)
            cleaned = True
            emit('PASS', scenarios=3, child_processes=len(children), provider_attempts=0)
    finally:
        for proc in children:
            if proc.poll() is None:
                proc.kill(); proc.communicate()
        if cfg and not cleaned:
            with blocked():
                cleanup(cfg)
        frappe.db.rollback(); frappe.destroy()


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'cleanup':
        initialize()
        try:
            with blocked():
                cleanup(json.loads(sys.argv[2]))
        finally:
            frappe.db.rollback(); frappe.destroy()
    elif len(sys.argv) > 1:
        child(sys.argv[1], json.loads(sys.argv[2]))
    else:
        proof()
