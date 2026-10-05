// Persist the existing pilot, select a bounded mixed cohort, and enrich confirmed addresses.
import { loadEnv, createServer } from 'vite';
import { createClient } from '@supabase/supabase-js';
import { readFile, readdir, writeFile } from 'node:fs/promises';
const env=loadEnv('development',process.cwd(),'');
const db=createClient(env.PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const vite=await createServer({server:{middlewareMode:true},appType:'custom'});
const core=await vite.ssrLoadModule('/src/lib/server/dealmachine.ts');
const check=r=>{if(r.error)throw new Error(r.error.message);return r.data;};
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const id=(source,number)=>`${source}:${source==='accela'?'INDY:':''}${number}`;
const category=r=>r.source==='accela'?'accela':r.record_type==='EU'?'estate':r.record_type==='MF'?'foreclosure':'eviction';
function accela(r){return {id:id('accela',r.case_number),rollout_id:'initial-100',source:'accela',source_id:r.case_number,
 record_type:r.case_type,county:'49',source_record:{...r,source_names:(r.owners||[]).map(p=>p.display_name).filter(Boolean)},
 candidate_address:r.address,address_role:'subject_property',status:r.address?'ready':'needs_match'};}
function mycase(r){return {id:id('mycase',r.case_number),rollout_id:'initial-100',source:'mycase',source_id:r.case_number,
 record_type:r.case_type_code,county:r.county_code,source_record:{...r,source_names:[r.primary_defendant_name].filter(Boolean)},
 candidate_address:r.primary_defendant_address,address_role:'party_address_unverified_subject_property',status:'needs_match',
 review_reasons:[r.case_type_code.startsWith('EV')?'Identify the rental property and landlord; the defendant may be a tenant.':r.case_type_code==='EU'?'Identify estate property and authorized representative; party address is not proof of estate ownership.':'Confirm the foreclosure subject property before enrichment.']};}
async function all(table,columns){let rows=[];for(let n=0;;n+=1000){const page=check(await db.from(table).select(columns).order('case_number').range(n,n+999));rows.push(...page);if(page.length<1000)return rows;}}
try {
 const sources=await Promise.all([
  all('accela_cases','agency,case_number,address,case_type,record_status,filed_date,owners,parcel_information,detail_checked_at'),
  all('indiana_cases','case_number,case_type_code,county_code,file_date,status,primary_plaintiff_name,primary_defendant_name,primary_defendant_address,parties')
 ]);
 const lookup=new Map([...sources[0].map(accela),...sources[1].filter(r=>['MF','EU','EVSC','EVCD'].includes(r.case_type_code)).map(mycase)].map(r=>[r.id,r]));
 let existing=check(await db.from('dm_source_links').select('*').eq('rollout_id','initial-100'));
 const seen=new Set(existing.map(r=>r.id));
 // Import paid pilot snapshots once; no DealMachine request is made here.
 for(const folder of (await readdir('.dealmachine-data')).filter(x=>/^pilot-\d+$/.test(x)).sort()){
  const base='.dealmachine-data/'+folder;
  const [inputs,response,summary,request]=await Promise.all(['input','response','summary','request'].map(f=>read(`${base}/${f}.json`)));
  const batchKey='import:'+folder;
  check(await db.from('dm_requests').upsert({cache_key:batchKey,status:'complete',request,response,credits:response.credits.used,completed_at:summary.completed_at},{onConflict:'cache_key',ignoreDuplicates:true}));
  for(const input of inputs){
   const source=lookup.get(id(input.source,input.source_id));if(!source)throw new Error('Pilot source record missing');
   if(!seen.has(source.id)){check(await db.from('dm_source_links').insert(source));seen.add(source.id);}
   const result=response.data.find(r=>core.addressKey(r.input.full_address)===core.addressKey(input.address));if(!result)throw new Error('Pilot response missing input');
   const ck=core.cacheKey(input.address);
   check(await db.from('dm_requests').upsert({cache_key:ck,status:'complete',request:{...request,data:[result.input]},response:{data:[result],import_batch:batchKey},credits:0,completed_at:summary.completed_at},{onConflict:'cache_key',ignoreDuplicates:true}));
   const current=check(await db.from('dm_source_links').select('*').eq('id',source.id).single());
   if(!current.request_key) await core.projectResult(db,current,result,ck,summary.completed_at);
  }
 }
 existing=check(await db.from('dm_source_links').select('*').eq('rollout_id','initial-100'));
 const counts={accela:0,foreclosure:0,estate:0,eviction:0};existing.forEach(r=>counts[category(r)]++);
 const candidates=[...lookup.values()].filter(r=>!seen.has(r.id)&&(
  r.source==='accela'?(/violation|enforcement/i.test(r.record_type)&&r.source_record.detail_checked_at&&!/closed|void|cancel/i.test(r.source_record.record_status||'')):
  ['MF','EU','EVSC','EVCD'].includes(r.record_type)));
 const date=r=>{const v=r.source_record.filed_date||r.source_record.file_date||'';const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);return m?`${m[3]}-${m[1]}-${m[2]}`:v;};
 candidates.sort((a,b)=>date(b).localeCompare(date(a))||a.id.localeCompare(b.id));
 for(const group of Object.keys(counts)){
  const byCounty=new Map();
  for(const r of candidates.filter(r=>category(r)===group)){const key=r.county||'unknown';if(!byCounty.has(key))byCounty.set(key,[]);byCounty.get(key).push(r);}
  while(counts[group]<25&&[...byCounty.values()].some(a=>a.length)){
   for(const countyRows of byCounty.values()){
    if(counts[group]>=25)break;const row=countyRows.shift();if(!row)continue;
    check(await db.from('dm_source_links').insert(row));counts[group]++;
   }
  }
 }
 console.log('Database cohort:',JSON.stringify(counts));
 if(process.argv.includes('--run')){
  const account=await fetch('https://api.v2.dealmachine.com/v1/account',{headers:{Authorization:`Bearer ${env.DEALMACHINE_API_KEY}`}});
  const info=await account.json();if(!account.ok||String(info.data?.organization?.id)!==env.DEALMACHINE_ORGANIZATION_ID)throw new Error('DealMachine organization does not match configured workspace');
  const stats=await core.enrichReady(db,env.DEALMACHINE_API_KEY,100);console.log('Enrichment:',JSON.stringify(stats));
  await writeFile('.dealmachine-data/rollout-result.json',JSON.stringify(stats,null,2),{mode:0o600});
 }
 const links=check(await db.from('dm_source_links').select('source,record_type,county,status,property_id'));
 const statuses={};links.forEach(r=>statuses[r.status]=(statuses[r.status]||0)+1);
 console.log('Saved:',links.length,'records;',JSON.stringify(statuses));
}finally{await vite.close();}
