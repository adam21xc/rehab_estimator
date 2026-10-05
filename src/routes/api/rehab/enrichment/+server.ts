import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { requireUser, authClient, readJson, sameOrigin } from '$lib/server/rehab-auth';
import { enrichReady } from '$lib/server/dealmachine';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
 await requireUser(event);
 const db=authClient(), id=event.url.searchParams.get('id');
 if(id){
  const r=await db.from('dm_source_links').select('*,property:dm_properties(*)').eq('id',id).maybeSingle();
  if(r.error) error(503,'Enrichment details are unavailable.');
  if(!r.data) error(404,'Record not found.');
  const contacts=r.data.property_id?await db.from('dm_property_contacts').select('role,contact:dm_contacts(id,data,observed_at)').eq('property_id',r.data.property_id):{data:[],error:null};
  if(contacts.error) error(503,'Contact details are unavailable.');
  return json({record:r.data,contacts:contacts.data});
 }
 const [links,requests]=await Promise.all([
  db.from('dm_source_links').select('id,source,source_id,record_type,county,candidate_address,address_role,status,review_reasons,reviewed_at,source_record,property:dm_properties(id,facts,estimates,observed_at)').eq('rollout_id','initial-100').order('created_at').limit(100),
  db.from('dm_requests').select('status,credits')
 ]);
 if(links.error||requests.error) error(503,'Enrichment records are unavailable.');
 const records=(links.data||[]).map(({source_record,...r})=>({...r,source_names:source_record.source_names?.length ? source_record.source_names : [source_record.primary_plaintiff_name].filter(Boolean)}));
 return json({records,leadLimit:100,credits:(requests.data||[]).reduce((n,r)=>n+r.credits,0),pendingRequests:(requests.data||[]).filter(r=>r.status==='pending').length});
};
export const POST: RequestHandler = async(event)=>{
 sameOrigin(event);const {user}=await requireUser(event);
 const body=await readJson(event,4096),db=authClient();
 if(body.action==='process'){
  if(!env.DEALMACHINE_API_KEY||!env.DEALMACHINE_ORGANIZATION_ID) error(503,'DealMachine is not configured on this server.');
  const res=await fetch('https://api.v2.dealmachine.com/v1/account',{headers:{Authorization:`Bearer ${env.DEALMACHINE_API_KEY}`},signal:AbortSignal.timeout(15000)});
  const account=await res.json();
  if(!res.ok||String(account.data?.organization?.id)!==env.DEALMACHINE_ORGANIZATION_ID) error(503,'DealMachine workspace could not be verified.');
  try{return json(await enrichReady(db,env.DEALMACHINE_API_KEY,3));}
  catch {error(503,'Processing stopped. Saved requests will be reused; unresolved requests require reconciliation.');}
 }
 if(!['accept','reject','confirm_address'].includes(body.action)||typeof body.id!=='string'||body.id.length>200) error(400,'Invalid review action.');
 if(body.action==='confirm_address'&&(typeof body.address!=='string'||body.address.trim().length<8||body.address.length>300)) error(400,'Enter a complete subject-property address.');
 const r=await db.rpc('dm_review',{p_id:body.id,p_actor:user.id,p_action:body.action,p_address:body.address||null});
 if(r.error) error(400,'Unable to apply this review decision. Check the record and try again.');
 return json({saved:true});
};
