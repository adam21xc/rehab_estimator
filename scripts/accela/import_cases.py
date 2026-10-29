"""Hosted-safe Accela importer. Run from any working directory with server env vars."""
import argparse
import csv
import io
import json
import os
import re
import time
import uuid
from datetime import datetime, timedelta, date
from zoneinfo import ZoneInfo
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from http_client import AccelaHTTP, SEARCH_URL, postback
from parser import Page, extract

class Database:
    def __init__(self):
        self.url=os.environ.get('SUPABASE_URL') or os.environ['PUBLIC_SUPABASE_URL']
        self.key=os.environ['SUPABASE_SERVICE_ROLE_KEY']
        self.run_id=str(uuid.uuid4())
    def rpc(self, action, payload=None):
        body=json.dumps({'p_action':action,'p_run_id':self.run_id,'p_payload':payload or {}}).encode()
        req=Request(self.url+'/rest/v1/rpc/accela_ingest',data=body,headers={
            'apikey':self.key,'Authorization':'Bearer '+self.key,'Content-Type':'application/json'})
        # Do not retry uncertain writes blindly. Next run reconciles idempotently.
        with urlopen(req,timeout=60) as r: return json.load(r)

    def table(self, table, query, payload=None):
        req=Request(self.url+'/rest/v1/'+table+'?'+urlencode(query),
            data=json.dumps(payload).encode() if payload is not None else None,
            method='PATCH' if payload is not None else 'GET', headers={
                'apikey':self.key,'Authorization':'Bearer '+self.key,'Content-Type':'application/json'})
        with urlopen(req,timeout=60) as r:
            body=r.read()
            return json.loads(body) if body else None


def page_links(html):
    p=Page();p.feed(html)
    links={}
    for a in p.anchors:
        href=a['attrs'].get('href','')
        if 'CapDetail.aspx?' in href:
            name=' '.join(a['text']).strip()
            if name: links[name]='https://aca-prod.accela.com'+href if href.startswith('/') else href
    next_link=next((a for a in p.anchors if ' '.join(a['text'])=='Next >'),None)
    target=None
    if next_link:
        match=re.search(r"__doPostBack\('([^']+)'",next_link['attrs'].get('href',''))
        if not match: raise ValueError('Unrecognized pagination action')
        target=match[1]
    return links,target,p.lines


def discover(client, start, end):
    html=client.get(SEARCH_URL)
    fields=postback(html,'ctl00$PlaceHolderMain$btnNewSearch')
    fields['ctl00$PlaceHolderMain$generalSearchForm$txtGSStartDate']=start.strftime('%m/%d/%Y')
    fields['ctl00$PlaceHolderMain$generalSearchForm$txtGSEndDate']=end.strftime('%m/%d/%Y')
    html=client.get(SEARCH_URL,fields)
    links,target,lines=page_links(html)
    if not links:
        if any('No records found' in x or 'No records matched' in x for x in lines): return []
        raise ValueError('No case links and no recognized empty-result message')
    # Export is a two-step operation. Handler uses the cookie-backed search session.
    client.get(SEARCH_URL,postback(html,'ctl00$PlaceHolderMain$dgvPermitList$gdvPermitList$gdvPermitListtop4btnExport'))
    text=client.get('https://aca-prod.accela.com/INDY/Export2CSV.ashx?flag=5152')
    reader=csv.DictReader(io.StringIO(text))
    expected={'Date','Case Number','Address','Case Type','Status'}
    if not expected.issubset(reader.fieldnames or []): raise ValueError('Invalid CSV headers')
    rows=list(reader)
    ids=[r['Case Number'] for r in rows]
    if not ids or len(ids)!=len(set(ids)): raise ValueError('Empty/duplicate CSV records')
    seen=set(links)
    pages=1
    while target:
        html=client.get(SEARCH_URL,postback(html,target))
        more,target,_=page_links(html)
        if not more or set(more)&seen: raise ValueError('Pagination repeated or returned an empty page')
        links.update(more);seen.update(more);pages+=1
        if pages>2000: raise ValueError('Pagination limit reached; narrow date window')
    if set(ids)!=set(links): raise ValueError('CSV and paginated detail links disagree; retry next run')
    result=[]
    for row in rows:
        filed=datetime.strptime(row['Date'],'%m/%d/%Y').date()
        if not start<=filed<=end: raise ValueError('Result outside requested window')
        result.append({'case_number':row['Case Number'],'source_url':links[row['Case Number']],
            'filed_date':filed.isoformat(),'address':row['Address'],'case_type':row['Case Type'],
            'record_status':row['Status'],'short_notes':row.get('Short Notes','')})
    return result


def prioritized_queue(db, limit):
    # Missing pages first; respect retry backoff, then use remaining capacity for refreshes.
    missing=db.table('accela_cases',{'select':'case_number,source_url','agency':'eq.INDY',
        'detail_checked_at':'is.null','next_detail_at':'lte.'+datetime.now().astimezone().isoformat(),
        'order':'next_detail_at,case_number','limit':str(limit)})
    if len(missing)>=limit: return missing
    seen={r['case_number'] for r in missing}
    refresh=db.rpc('queue',{'limit':limit})
    return (missing+[r for r in refresh if r['case_number'] not in seen])[:limit]


def run(args):
    db=Database();state=db.rpc('start')
    if not state['acquired']:
        print(json.dumps({'status':'skipped','reason':'another import holds the lease'}));return
    today=datetime.now(ZoneInfo('America/Indiana/Indianapolis')).date()
    end=date.fromisoformat(args.end) if args.end else today
    last=date.fromisoformat(state['last_discovery_end']) if state.get('last_discovery_end') else today
    start=date.fromisoformat(args.start) if args.start else min(last,today)-timedelta(days=2)
    # Recover outages in bounded windows rather than silently dropping old dates.
    end=min(end,start+timedelta(days=6))
    metrics={'discovered':0,'details_checked':0,'details_changed':0,'detail_errors':0}
    complete=False;status='failed';error=None
    started=time.monotonic()
    def heartbeat():
        if time.monotonic()-started>args.max_seconds: raise TimeoutError('Run time budget reached; queue retained')
        db.rpc('heartbeat')
    client=AccelaHTTP(heartbeat)
    try:
        if end<start: raise ValueError('End date precedes start date')
        records=[] if args.details_only else discover(client,start,end)
        for offset in range(0,len(records),100): db.rpc('discover',{'records':records[offset:offset+100]})
        metrics['discovered']=len(records);complete=not args.details_only
        if args.case_number or args.missing_only:
            query={'select':'case_number,source_url','agency':'eq.INDY','order':'next_detail_at,case_number','limit':str(args.max_details)}
            if args.case_number: query['case_number']='eq.'+args.case_number
            else:
                query['detail_checked_at']='is.null'
                query['next_detail_at']='lte.'+datetime.now().astimezone().isoformat()
            queue=db.table('accela_cases',query)
        else: queue=prioritized_queue(db,args.max_details)
        def fetch_detail(item):
            try:
                detail_client=client if args.workers==1 else AccelaHTTP(heartbeat)
                detail=extract(detail_client.get(item['source_url']),item['source_url'])
                if detail['case_number']!=item['case_number']: raise ValueError('Detail page case number mismatch')
                return item,detail,None
            except Exception as exc:
                return item,None,type(exc).__name__+': '+str(exc)[:200]
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for offset in range(0,len(queue),args.workers):
                heartbeat()
                for item,detail,fetch_error in pool.map(fetch_detail,queue[offset:offset+args.workers]):
                    if fetch_error:
                        db.rpc('error',{'case_number':item['case_number'],'error':fetch_error})
                        metrics['detail_errors']+=1
                        if fetch_error.startswith('PermissionError:'):
                            db.table('enrichment_tasks',{'id':'eq.accela:INDY:'+item['case_number']},{
                                'status':'blocked','reason':'Accela returned a login page; authenticated access needed to inspect this record',
                                'last_error':fetch_error,'updated_at':datetime.now().astimezone().isoformat()})
                        continue
                    result=db.rpc('detail',{'detail':detail})
                    metrics['details_checked']+=1;metrics['details_changed']+=int(result['changed'])
                    # Mark missing-detail work separately from owner research. Empty owner sections
                    # are a review outcome, not a reason to refetch the same document indefinitely.
                    task_id='accela:INDY:'+item['case_number']
                    db.table('enrichment_tasks',{'id':'eq.'+task_id},{
                        'status':'complete' if detail.get('owners') else 'review',
                        'reason':'Source details saved' if detail.get('owners') else 'Source fetched; no owner in returned detail',
                        'last_error':None,'updated_at':datetime.now().astimezone().isoformat()})
        status='partial' if metrics['detail_errors'] else 'success'
    except Exception as exc:
        error=type(exc).__name__+': '+str(exc)[:200]
    finally:
        result=db.rpc('finish',{'status':status,'window_start':start.isoformat(),'window_end':end.isoformat(),
            'metrics':metrics,'discovery_complete':complete,'error':error})
        print(json.dumps({'run_id':db.run_id,'status':status,**metrics,**result,'error':error}))
    if status!='success': raise SystemExit(1)

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--start');parser.add_argument('--end')
    parser.add_argument('--details-only',action='store_true')
    parser.add_argument('--missing-only',action='store_true')
    parser.add_argument('--case-number')
    parser.add_argument('--workers',type=int,choices=range(1,5),default=1)
    parser.add_argument('--max-details',type=int,default=150)
    parser.add_argument('--max-seconds',type=int,default=2700)
    run(parser.parse_args())
