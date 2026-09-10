"""Metadata-only Meta coverage audit. No mutation or customer-message access."""
import os,json,re,hashlib,ast
from datetime import datetime,timezone
from urllib.parse import urlsplit
os.chdir('/home/frappe/frappe-bench/sites')
import frappe,requests
frappe.init(site='ventas.docomexico.com');frappe.connect()
frappe.db.sql('SET SESSION TRANSACTION READ ONLY');frappe.db.rollback()

def password(doc,key):
    try:return doc.get_password(key,raise_exception=False) or ''
    except Exception:return ''

def version(value):
    value=value or 'v25.0'
    return value if re.fullmatch(r'v\d+\.\d+',str(value)) else None

def inspect(node,edge,token,ver,fields=None):
    if not token or not ver or not re.fullmatch(r'\d+',str(node or '')):
        return {'state':'missing_or_invalid_configuration'}
    try:
        r=requests.get(f'https://graph.facebook.com/{ver}/{node}/{edge}',headers={'Authorization':'Bearer '+token},params={'fields':fields} if fields else {},timeout=(5,15),allow_redirects=False)
        body=r.json();err=body.get('error') or {}
        result={'http':r.status_code,'error_code':err.get('code'),'error_subcode':err.get('error_subcode')}
        if r.ok:
            rows=[]
            for row in body.get('data',[]):
                safe={key:row.get(key) for key in ('id','object','active','subscribed_fields') if key in row}
                if 'fields' in row:safe['fields']=[{'name':f.get('name'),'version':f.get('version')} for f in row['fields']]
                if 'callback_url' in row:
                    u=urlsplit(row['callback_url']);safe['callback']={'host':u.hostname,'path':u.path,'has_query':bool(u.query)}
                if 'whatsapp_business_api_data' in row:safe['app_id']=row['whatsapp_business_api_data'].get('id')
                rows.append(safe)
            result['data']=rows;result['more_pages']=bool((body.get('paging') or {}).get('next'))
        return result
    except Exception as e:return {'error_class':type(e).__name__}

out={'observed_utc':datetime.now(timezone.utc).isoformat(),'site':'ventas.docomexico.com'}
try:
    social=frappe.get_doc('Social Settings');ms=frappe.get_doc('Messenger Settings');marketing=frappe.get_doc('Marketing Settings')
    out['settings']={'social_enabled':social.get('enabled'),'feed_enabled':ms.get('feed_enabled'),'auto_lead_from_comment':ms.get('auto_lead_from_comment'),'leadgen_enabled':ms.get('leadgen_enabled'),'enable_messenger':marketing.get('enable_messenger'),'enable_instagram':marketing.get('enable_instagram')}
    pages=frappe.get_all('Messenger Page',fields=['name','page_id','ig_account_id','enabled','shop'],limit_page_length=30)
    out['pages']=[];apps={}
    for row in pages:
        doc=frappe.get_doc('Messenger Page',row.name);tok=password(doc,'page_access_token');ver=version(ms.get('graph_api_version'))
        record={'page_id':row.page_id,'enabled':row.enabled,'has_shop':bool(row.shop),'ig_account_id':row.ig_account_id or None}
        record['page_subscription']=inspect(row.page_id,'subscribed_apps',tok,ver,'id,subscribed_fields')
        for app in record['page_subscription'].get('data',[]):
            if app.get('id'):apps[app['id']]=password(ms,'app_secret')
        if row.ig_account_id:record['instagram_subscription']=inspect(row.ig_account_id,'subscribed_apps',tok,ver,'id,subscribed_fields')
        out['pages'].append(record)
    out['whatsapp']=[]
    if frappe.db.exists('DocType','WhatsApp Account'):
        for row in frappe.get_all('WhatsApp Account',fields=['name'],limit_page_length=20):
            doc=frappe.get_doc('WhatsApp Account',row.name)
            record={'app_id':doc.get('app_id'),'status':doc.get('status'),'business_id':doc.get('business_id'),'phone_id':doc.get('phone_id'),'app_secret_present':bool(password(doc,'app_secret'))}
            record['waba_subscription']=inspect(doc.get('business_id'),'subscribed_apps',password(doc,'token'),version(doc.get('version')))
            if doc.get('app_id') and password(doc,'app_secret'):apps[doc.app_id]=password(doc,'app_secret')
            out['whatsapp'].append(record)
    out['app_subscriptions']={app:inspect(app,'subscriptions',app+'|'+secret if secret else '',version(ms.get('graph_api_version'))) for app,secret in apps.items()}
    import doco_marketing,frappe_whatsapp
    paths={
        'messenger_webhook':os.path.join(os.path.dirname(doco_marketing.__file__),'api/messenger_webhook.py'),
        'leadgen':os.path.join(os.path.dirname(doco_marketing.__file__),'services/social/leadgen.py'),
        'mentions':os.path.join(os.path.dirname(doco_marketing.__file__),'services/social/mentions.py'),
        'whatsapp_webhook':os.path.join(os.path.dirname(frappe_whatsapp.__file__),'utils/webhook.py'),
    }
    out['deployed_source']={}
    for name,path in paths.items():
        raw=open(path,'rb').read();tree=ast.parse(raw)
        strings={n.value for n in ast.walk(tree) if isinstance(n,ast.Constant) and isinstance(n.value,str)}
        candidate_fields={'messages','feed','leadgen','mention','ratings','mentions','comments','live_comments','standby','pass_thread_control','take_thread_control','request_thread_control','message_template_status_update','message_template_quality_update','phone_number_quality_update','account_alerts','account_update','smb_message_echoes','history'}
        out['deployed_source'][name]={'sha256':hashlib.sha256(raw).hexdigest(),'event_literals':sorted(strings & candidate_fields)}
    print(json.dumps(out,ensure_ascii=False))
finally:frappe.db.rollback();frappe.destroy()
