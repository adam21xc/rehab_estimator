// Database-only queue sync: no DealMachine, model, mail, or contact API calls.
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
export function sourceLink(source, r) {
 const accela=source==='accela';
 const {raw_json,token,...facts}=r;
 const usable=accela && /^\d+\s+/.test(r.address||'') && /\bIN\s+\d{5}(?:-\d{4})?\s*$/i.test(r.address||'');
 return {id:`${source}:${accela?(r.agency||'INDY')+':':''}${r.case_number}`,rollout_id:'inventory-2026-10',source,source_id:r.case_number,
 record_type:(accela?r.case_type:r.case_type_code)||'Unknown',county:accela?'49':r.county_code,
 source_record:{...facts,source_names:accela?(r.owners||[]).map(o=>o.display_name).filter(Boolean):[r.primary_defendant_name].filter(Boolean)},
 candidate_address:accela?r.address:r.primary_defendant_address,address_role:accela?'subject_property':'party_address_unverified_subject_property',
 status:usable?'ready':'needs_match',review_reasons:usable?[]:[accela?'Complete the source property address before enrichment.':'Read case documents to establish the subject property; party addresses are not ownership evidence.']};
}
const check=r=>{if(r.error)throw Error(r.error.message);return r.data;};
async function all(db,table,columns,order){let rows=[];for(let n=0;;n+=250){const page=check(await db.from(table).select(columns).order(order).range(n,n+249));rows.push(...page);if(page.length<250)return rows;}}
export function planSync(accela,mycase,links){
 const existing=new Map(links.map(r=>[r.id,r]));
 const sources=[...accela.map(r=>sourceLink('accela',r)),...mycase.map(r=>sourceLink('mycase',r))];
 const additions=sources.filter(r=>!existing.has(r.id));
 const tasks=[];
 for(const r of accela.filter(r=>!r.detail_checked_at)) {const id=`accela:${r.agency}:${r.case_number}`;tasks.push({id,source_link_id:id,kind:'source_details',status:'queued',reason:'Fetch the missing Accela detail page.'});}
 for(const r of sources.filter(r=>r.source==='mycase')) {const saved=existing.get(r.id);if(saved?.reviewed_at||saved?.property_id||saved?.status==='rejected'||saved?.address_role==='reviewed_subject_property')continue;tasks.push({id:r.id,source_link_id:r.id,kind:'case_documents',status:'queued',reason:'Establish subject property from complaint, mortgage or exhibits; never assume a party address is the property.'});}
 return {sources,additions,tasks};
}
export async function syncInventory(db){
 const [accela,mycase,links]=await Promise.all([
 all(db,'accela_cases','agency,case_number,address,case_type,record_status,filed_date,owners,parcel_information,detail_checked_at,source_url','case_number'),
 all(db,'indiana_cases','case_number,case_type_code,county_code,file_date,status,primary_plaintiff_name,primary_defendant_name,primary_defendant_address,parties,court,style','case_number'),
 all(db,'dm_source_links','id,status,property_id,address_role,reviewed_at','id')]);
 const {sources,additions,tasks}=planSync(accela,mycase,links);
 let added=0;
 for(let n=0;n<additions.length;n+=100)added+=check(await db.from('dm_source_links').upsert(additions.slice(n,n+100),{onConflict:'id',ignoreDuplicates:true}).select('id')).length;
 let tasksAdded=0;
 for(let n=0;n<tasks.length;n+=100)tasksAdded+=check(await db.from('enrichment_tasks').upsert(tasks.slice(n,n+100),{onConflict:'id',ignoreDuplicates:true}).select('id')).length;
 const finalLinks=await all(db,'dm_source_links','id','id');const ids=new Set(finalLinks.map(r=>r.id));
 const missing=sources.filter(r=>!ids.has(r.id)).length;
 if(missing)throw Error(`${missing} source records remain outside the queue`);
 return {accela:accela.length,mycase:mycase.length,total:sources.length,added,tasksAdded,missingFromQueue:missing,externalEnrichmentRequests:0};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 const url=process.env.PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw Error('Server database credentials are required');
 console.log(JSON.stringify(await syncInventory(createClient(url,key,{auth:{persistSession:false}}))));
}
