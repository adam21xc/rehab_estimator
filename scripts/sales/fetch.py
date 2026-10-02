"""Fetch the observed public Gateway JSON search, sequentially, with completeness checks."""
import argparse, json, time, urllib.request, urllib.parse
from pathlib import Path
from datetime import datetime, timezone
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--resume',action='store_true',help='Resume only an unfinished download; default fetches fresh pages')
args=parser.parse_args()
out=Path('.sales-data/marion-2026.json')
cache_dir=Path('.sales-data/gateway-run')
state_path=cache_dir/'state.json'
cache_dir.mkdir(parents=True,exist_ok=True)
if args.resume:
    if not state_path.exists(): raise SystemExit('No resumable download. Run without --resume.')
    state=json.loads(state_path.read_text())
    if state.get('complete'): raise SystemExit('Download already complete. Run without --resume to refresh.')
else:
    for page in cache_dir.glob('page-*.json'): page.unlink()
    state={'capturedAt':datetime.now(timezone.utc).isoformat(),'complete':False}
    state_path.write_text(json.dumps(state))
rows=[]; total=None; start=0
while total is None or start<total:
    body=urllib.parse.urlencode({'draw':str(start+1),'start':str(start),'length':'500','searchProperty':json.dumps({'Year':'2026','County':'49','ValidforTrending':'Selected','PropertyClass':'Selected'})}).encode()
    req=urllib.request.Request('https://gatewaysdf.ifionline.org/api/fileApi/SearchList',data=body,headers={'Content-Type':'application/x-www-form-urlencoded','Referer':'https://gatewaysdf.ifionline.org/search'})
    cached=(cache_dir/f'page-{start}.json')
    if cached.exists(): data=json.loads(cached.read_text())
    else:
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req,timeout=90) as response: data=json.load(response)
                break
            except (OSError,ValueError):
                if attempt==2: raise
                time.sleep(3*(attempt+1))
    if total is None: total=int(data['recordsFiltered'])
    if int(data['recordsFiltered']) != total: raise RuntimeError('Source count changed during import; retry')
    chunk=data['data']
    if not chunk: raise RuntimeError('Unexpected empty page')
    Path('.sales-data').mkdir(exist_ok=True)
    (cache_dir/f'page-{start}.json').write_text(json.dumps(data))
    rows.extend(chunk); start+=len(chunk)
    print(json.dumps({'loaded':start,'expected':total}),flush=True)
    time.sleep(1)
assert len(rows)==total
keys=[(r['sdF_ID'],r['parcelNumber']) for r in rows]
print(json.dumps({'duplicateKeys':len(keys)-len(set(keys))}),flush=True)
out.parent.mkdir(exist_ok=True)
temp=out.with_suffix('.tmp');temp.write_text(json.dumps({'data':rows,'recordsFiltered':total,'year':2026,'county':'49','capturedAt':state['capturedAt']}));temp.replace(out)

state['complete']=True
state_path.write_text(json.dumps(state))
