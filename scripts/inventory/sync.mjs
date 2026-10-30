// Database-only queue sync: no DealMachine, model, mail, or contact API calls.
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';

// Inclusive filing window for new MyCase document tasks. Override with
// MYCASE_ENRICHMENT_WINDOW_DAYS (non-negative integer). The default is 90.
export const MYCASE_ENRICHMENT_WINDOW_DAYS = 90;
const FILING_ZONE = 'America/Indiana/Indianapolis';

export function enrichmentWindowDays(env = process.env) {
 const raw = env.MYCASE_ENRICHMENT_WINDOW_DAYS;
 if (raw == null || raw === '') return MYCASE_ENRICHMENT_WINDOW_DAYS;
 if (!/^\d+$/.test(String(raw).trim())) throw Error('MYCASE_ENRICHMENT_WINDOW_DAYS must be a non-negative integer');
 return Number(String(raw).trim());
}

// indiana_cases.file_date is text in MM/DD/YYYY. Missing, blank, non-padded,
// and impossible dates (02/31/2026) are not queued: a bad value is not evidence
// the filing is recent, and guessing would reopen old cases. Future dates are
// outside "the last N days", so they are not queued either. The case can still
// be tracked and receive a status refresh; only the enrichment task is withheld.
// The cutoff uses the America/Indiana/Indianapolis calendar, matching the hourly
// import, so the window does not flip at UTC midnight.
export function parseFileDate(value) {
 const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(typeof value === 'string' ? value.trim() : '');
 if (!match) return null;
 const month = Number(match[1]), day = Number(match[2]), year = Number(match[3]);
 const utc = new Date(Date.UTC(year, month - 1, day));
 if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;
 return utc.toISOString().slice(0, 10);
}

export function calendarDate(now, timeZone = FILING_ZONE) {
 const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
 const pick = type => parts.find(part => part.type === type).value;
 return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

function shiftIsoDate(iso, days) {
 const [year, month, day] = iso.split('-').map(Number);
 return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function mycaseFilingInWindow(fileDate, now = new Date(), windowDays = enrichmentWindowDays()) {
 const iso = parseFileDate(fileDate);
 if (!iso) return false;
 const today = calendarDate(now);
 return iso <= today && iso >= shiftIsoDate(today, -windowDays);
}

function courtText(value) {
 if (value == null) return null;
 const text = String(value).trim();
 return text || null;
}

function savedCourtOutcome(row) {
 const record = row.source_record || {};
 const pick = (column, key) => (row[column] !== undefined ? courtText(row[column]) : courtText(record[key]));
 return {
  status: pick('court_status', 'status'),
  disposition: pick('court_disposition', 'disposition'),
  case_status_date: pick('court_case_status_date', 'case_status_date')
 };
}

// Court outcome lives in dm_source_links.source_record (jsonb): indiana_cases.status
// (Pending, Decided, Dismissed, …) plus case_status_date, and disposition when the
// case row carries one (for example "sheriff sale"). There is no disposition column,
// so this does not need a migration. Workflow status on the link is left alone.
// case_status_date is written when status or disposition changes, or when a date
// already stored on the link changes. Unchanged cases are not backfilled.
export function planStatusRefreshes(sources, links) {
 const saved = new Map(links.map(row => [row.id, row]));
 const refreshes = [];
 for (const current of sources) {
  if (current.source !== 'mycase' || !saved.has(current.id)) continue;
  const row = saved.get(current.id);
  const previous = savedCourtOutcome(row);
  const record = current.source_record;
  const next = {
   status: courtText(record.status),
   disposition: Object.prototype.hasOwnProperty.call(record, 'disposition') ? courtText(record.disposition) : previous.disposition,
   case_status_date: courtText(record.case_status_date)
  };
  const outcomeChanged = next.status !== previous.status || next.disposition !== previous.disposition;
  const dateChanged = previous.case_status_date != null && next.case_status_date !== previous.case_status_date;
  if (!outcomeChanged && !dateChanged) continue;
  const patch = {};
  if (next.status !== previous.status) patch.status = next.status;
  if (next.disposition !== previous.disposition) patch.disposition = next.disposition;
  if ((outcomeChanged || dateChanged) && next.case_status_date !== previous.case_status_date) patch.case_status_date = next.case_status_date;
  refreshes.push({ id: current.id, updated_at: row.updated_at ?? null, patch });
 }
 return refreshes;
}

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
export function planSync(accela,mycase,links,options={}){
 const now=options.now??new Date();
 const windowDays=options.windowDays??enrichmentWindowDays();
 const archived=new Set(options.archivedIds||[]);
 const existing=new Map(links.map(r=>[r.id,r]));
 const sources=[...accela.map(r=>sourceLink('accela',r)),...mycase.map(r=>sourceLink('mycase',r))];
 const additions=sources.filter(r=>!existing.has(r.id));
 const tasks=[];
 // trg_skip_archived_task already drops inserts whose id is archived. Skip them
 // here too so an owner archive is never sent back to the queue.
 const queue=task=>{if(!archived.has(task.id))tasks.push(task);};
 for(const r of accela.filter(r=>!r.detail_checked_at)) {const id=`accela:${r.agency}:${r.case_number}`;queue({id,source_link_id:id,kind:'source_details',status:'queued',reason:'Fetch the missing Accela detail page.'});}
 for(const r of sources.filter(r=>r.source==='mycase')) {const saved=existing.get(r.id);if(saved?.reviewed_at||saved?.property_id||saved?.status==='rejected'||saved?.address_role==='reviewed_subject_property')continue;if(!mycaseFilingInWindow(r.source_record.file_date,now,windowDays))continue;queue({id:r.id,source_link_id:r.id,kind:'case_documents',status:'queued',reason:'Establish subject property from complaint, mortgage or exhibits; never assume a party address is the property.'});}
 return {sources,additions,tasks};
}
export function canRefreshSource(saved, current) {
 return saved && !saved.property_id && !saved.reviewed_at && ['ready','needs_match'].includes(saved.status)
  && saved.address_role==='subject_property' && current.source==='accela'
  && current.source_record.detail_checked_at && current.source_record.detail_checked_at!==saved.source_detail_checked_at;
}
async function refreshCourtStatus(db, item) {
 const original=check(await db.from('dm_source_links').select('source_record').eq('id',item.id).single());
 const record={...original.source_record,...item.patch};
 let query=db.from('dm_source_links').update({source_record:record,updated_at:new Date().toISOString()}).eq('id',item.id);
 if(item.updated_at) query=query.eq('updated_at',item.updated_at);
 return check(await query.select('id')).length;
}
export async function syncInventory(db, options={}){
 const now=options.now??new Date();
 const windowDays=options.windowDays??enrichmentWindowDays();
 const [accela,mycase,links,archived]=await Promise.all([
 all(db,'accela_cases','agency,case_number,address,case_type,record_status,filed_date,owners,parcel_information,detail_checked_at,source_url','case_number'),
 all(db,'indiana_cases','case_number,case_type_code,county_code,file_date,status,case_status_date,primary_plaintiff_name,primary_defendant_name,primary_defendant_address,parties,court,style','case_number'),
 all(db,'dm_source_links','id,status,property_id,address_role,reviewed_at,updated_at,source_detail_checked_at:source_record->>detail_checked_at,court_status:source_record->>status,court_disposition:source_record->>disposition,court_case_status_date:source_record->>case_status_date','id'),
 all(db,'enrichment_tasks_archived','id','id')]);
 const {sources,additions,tasks}=planSync(accela,mycase,links,{now,windowDays,archivedIds:archived.map(r=>r.id)});
 let added=0;
 for(let n=0;n<additions.length;n+=100)added+=check(await db.from('dm_source_links').upsert(additions.slice(n,n+100),{onConflict:'id',ignoreDuplicates:true}).select('id')).length;
 // Refresh newly fetched source facts only on untouched, unenriched Accela links.
 // Existing provider matches and human decisions are never reclassified here.
 let refreshed=0;
 const savedById=new Map(links.map(r=>[r.id,r]));
 for(const current of sources){
  const saved=savedById.get(current.id);if(!canRefreshSource(saved,current))continue;
  const original=check(await db.from('dm_source_links').select('source_record').eq('id',current.id).single());
  const record={...original.source_record,...current.source_record,initial_source_snapshot:original.source_record.initial_source_snapshot||original.source_record};
  const updated=check(await db.from('dm_source_links').update({source_record:record,candidate_address:current.candidate_address,status:current.status,review_reasons:current.review_reasons,updated_at:new Date().toISOString()})
    .eq('id',current.id).eq('updated_at',saved.updated_at).is('property_id',null).is('reviewed_at',null).select('id'));
  refreshed+=updated.length;
 }
 let statusesRefreshed=0;
 for(const item of planStatusRefreshes(sources,links)) statusesRefreshed+=await refreshCourtStatus(db,item);
 let tasksAdded=0;
 for(let n=0;n<tasks.length;n+=100)tasksAdded+=check(await db.from('enrichment_tasks').upsert(tasks.slice(n,n+100),{onConflict:'id',ignoreDuplicates:true}).select('id')).length;
 const finalLinks=await all(db,'dm_source_links','id','id');const ids=new Set(finalLinks.map(r=>r.id));
 const missing=sources.filter(r=>!ids.has(r.id)).length;
 if(missing)throw Error(`${missing} source records remain outside the queue`);
 return {accela:accela.length,mycase:mycase.length,total:sources.length,added,refreshed,statusesRefreshed,tasksAdded,missingFromQueue:missing,externalEnrichmentRequests:0};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 const url=process.env.PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw Error('Server database credentials are required');
 console.log(JSON.stringify(await syncInventory(createClient(url,key,{auth:{persistSession:false}}))));
}
