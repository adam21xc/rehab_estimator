import { foreclosureEvidence } from './foreclosure-matching';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

type Data = Record<string, any>;
export const DM_FIELDS = ['owner_1_full_name','owner_2_full_name','ownership_entity_type','parcel_number_raw',
 'property_type','property_class','year_built','num_bedrooms','num_bathrooms','living_area_sqft','lot_size_sqft',
 'num_units','estimated_value','estimated_equity_amount','estimated_equity_percentage','estimated_repair_cost',
 'building_condition','last_sale_date','last_sale_price','is_owner_occupied','has_absentee_owners',
 'has_out_of_state_owners','is_corporate_owned','is_vacant_home','is_preforeclosure','foreclosure_status',
 'foreclosure_auction_date','is_tax_delinquent','tax_delinquent_year','tax_amount','tax_year',
 'assessed_total_value','tax_assessment_year','num_mortgages','total_estimated_loan_balance',
 'is_free_and_clear','is_mls_active','market_status','zoning'];
export function addressKey(address: string) {
 return address.toUpperCase().replace(/[.,]/g,' ').replace(/\bNORTH\b/g,'N').replace(/\bSOUTH\b/g,'S')
 .replace(/\bEAST\b/g,'E').replace(/\bWEST\b/g,'W').replace(/\bSTREET\b/g,'ST')
 .replace(/\bAVENUE\b/g,'AVE').replace(/\bBOULEVARD\b/g,'BLVD').replace(/\bDRIVE\b/g,'DR')
 .replace(/\bROAD\b/g,'RD').replace(/\s+/g,' ').trim();
}
export const cacheKey = (address: string) => 'address-v1:' + createHash('sha256').update(addressKey(address)).digest('hex');
export function normalizeValue(value: unknown): unknown {
 if (value === 'Yes') return true;
 if (value === 'No') return false;
 if (typeof value === 'string' && /^\$[\d,]+(?:\.\d+)?$/.test(value)) return Number(value.replace(/[$,]/g,''));
 return value;
}
const nameKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9 ]/g,' ').split(/\s+/).filter(x=>x.length>1).sort().join(' ');
export const isEviction = (source: Data) => source.source === 'mycase' && ['EV','EVSC','EVCD'].includes(source.record_type);
export function evictionEvidence(source: Data, result: Data = {}) {
 if (!isEviction(source)) return null;
 const record = source.source_record || {};
 const names = (role: string, primary: string) => [...new Set([
  ...(record.parties || []).filter((p: Data) => p.role_code === role || p.role === (role === 'PL' ? 'Plaintiff' : 'Defendant')).map((p: Data) => p.name),
  record[primary]
 ].filter((n): n is string => typeof n === 'string' && !!n.trim()))];
 const plaintiffs = names('PL','primary_plaintiff_name');
 const defendants = names('DF','primary_defendant_name');
 const owners = [result.owner_1_full_name,result.owner_2_full_name].filter((n): n is string => typeof n === 'string' && !!n.trim());
 const plaintiffMatchesOwner = owners.length && plaintiffs.length ? plaintiffs.some(n => owners.some(o => nameKey(n) === nameKey(o))) : null;
 return {plaintiffs, defendants, owners, plaintiffMatchesOwner,
  note: !owners.length ? 'Confirm the rental address to look up its owner and owner contact candidates.' : plaintiffMatchesOwner ? 'The plaintiff name supports the provider owner match.' : 'The plaintiff may be a manager or another landlord-side entity. A different name does not by itself invalidate the property match.',
  contactNote: 'Contact candidates come from property-owner enrichment, not the tenant list. LLC-associated individuals still need their relationship verified.'};
}
export function reviewReasons(source: Data, result: Data): string[] {
 const reasons: string[] = [];
 if (!['subject_property','reviewed_subject_property'].includes(source.address_role)) reasons.push('Court party address is not a verified subject property.');
 if (addressKey(source.candidate_address || '') !== addressKey(result.full_address || '')) reasons.push('Returned address differs from the submitted address; verify units and parcel.');
 const sourceNames: string[] = source.source_record.source_names || [];
 const owners = [result.owner_1_full_name,result.owner_2_full_name].filter(Boolean).map(nameKey);
 if (isEviction(source)) {
  if (!owners.length) reasons.push('Provider did not identify a property owner; review before using contact candidates.');
 } else if (source.source === 'mycase' && source.record_type === 'MF') {
  const evidence = foreclosureEvidence(source,result)!;
  if (!evidence.owners.length || !evidence.matches.length) reasons.push('No provider owner matches a named foreclosure defendant; review ownership and the subject property.');
  else {
   reasons.push('Likely match—owner name agrees with a foreclosure defendant; confirm the subject property.');
   if (evidence.unmatchedOwners.length) reasons.push('Additional provider owners do not match named defendants; review co-ownership.');
  }
 } else if (!sourceNames.length || !owners.length || sourceNames.some(n=>!owners.includes(nameKey(n)))) reasons.push('Source owner or party names differ from provider ownership; review the relationship.');
 if (result.match_warning) reasons.push('Provider returned an address-match warning.');
 if (result.estimated_value > 0 && result.estimated_equity_amount != null && result.estimated_equity_percentage != null &&
  Math.abs(100*result.estimated_equity_amount/result.estimated_value-result.estimated_equity_percentage)>2) reasons.push('Provider equity percentage conflicts with its dollar estimates.');
 if (result.foreclosure_auction_date && result.is_preforeclosure === 'No') reasons.push('Auction date exists alongside a No preforeclosure flag.');
 if (source.source === 'mycase' && source.record_type === 'MF' && result.is_preforeclosure === 'No') reasons.push('Provider foreclosure flag differs from the court source; preserve both.');
 return reasons;
}
export function projectProperty(result: Data) {
 const identity = ['full_address','address','city','state','zip','latitude','longitude','apn','owner_1_full_name','owner_2_full_name','ownership_entity_type','property_type','property_class','year_built','num_bedrooms','num_bathrooms','living_area_sqft','lot_size_sqft','num_units'];
 const facts: Data = {}, estimates: Data = {};
 for (const [k,v] of Object.entries(result)) {
  if (['input','matched','dm_property_id','contacts','images','match_warning'].includes(k)) continue;
  (identity.includes(k)?facts:estimates)[k] = normalizeValue(v);
 }
 return { facts, estimates };
}
function checked<T extends {error: any; data?: any}>(r:T) { if(r.error) throw new Error(r.error.message); return r.data; }
export async function projectResult(db: SupabaseClient, source: Data, result: Data, requestKey: string, observedAt: string) {
 const updateSource = (values: Data) => {
  let query = db.from('dm_source_links').update(values).eq('id', source.id);
  if (source.updated_at) query = query.eq('updated_at', source.updated_at);
  return query;
 };
 if (!result.matched || !result.dm_property_id) {
  checked(await updateSource({status:'no_match',request_key:requestKey,review_reasons:[result.match_failure?.reason || 'No property match'],updated_at:new Date().toISOString()})); return;
 }
 const projected = projectProperty(result);
 const existing = checked(await db.from('dm_properties').select('*').eq('id',result.dm_property_id).maybeSingle());
 // Keep existing non-null facts; only fill holes. Provider estimates have their own dated projection.
 const facts = {...projected.facts};
 for (const [key,value] of Object.entries(existing?.facts || {})) if(value != null) facts[key]=value;
 if (!existing || Date.parse(observedAt) >= Date.parse(existing.observed_at)) checked(await db.from('dm_properties').upsert({id:result.dm_property_id,facts,estimates:projected.estimates,raw_data:result,observed_at:observedAt,request_key:requestKey}));
 for (const c of result.contacts || []) {
  if (!c.dm_person_id) continue;
  // Do not promote incidental demographic fields into the contact model.
  const contact = Object.fromEntries(['dm_person_id','full_name','first_name','last_name','phones','emails'].filter(k=>k in c).map(k=>[k,c[k]]));
  const prior = checked(await db.from('dm_contacts').select('observed_at').eq('id',c.dm_person_id).maybeSingle());
  if (!prior || Date.parse(observedAt) >= Date.parse(prior.observed_at)) checked(await db.from('dm_contacts').upsert({id:c.dm_person_id,data:contact,observed_at:observedAt,request_key:requestKey}));
  checked(await db.from('dm_property_contacts').upsert({property_id:result.dm_property_id,contact_id:c.dm_person_id,role:'provider_owner_candidate'}));
 }
 const reasons = reviewReasons(source,result);
 // Preserve human decisions when reprojecting the same cached result.
 const preserve = source.request_key === requestKey && source.reviewed_at && ['accepted','rejected'].includes(source.status);
 checked(await updateSource({property_id:result.dm_property_id,request_key:requestKey,
  status:preserve?source.status:(reasons.length?'review':'accepted'),review_reasons:reasons,updated_at:new Date().toISOString()}));
}
export async function enrichReady(db:SupabaseClient,key:string,limit=5,request: typeof fetch=fetch) {
 const rows = checked(await db.from('dm_source_links').select('*').eq('status','ready').order('created_at').limit(Math.min(limit,100)));
 const stats={processed:0,cache_hits:0,api_requests:0,credits:0,pending:0};
 for (const source of rows) {
  if(!source.candidate_address) continue;
  if(isEviction(source) && !['subject_property','reviewed_subject_property'].includes(source.address_role)) continue;
  const ck=cacheKey(source.candidate_address);
  let cached=checked(await db.from('dm_requests').select('*').eq('cache_key',ck).maybeSingle());
  if (!cached) {
   if(!key) throw new Error('DealMachine API key is not configured on this server.');
   const payload={data:[{full_address:source.candidate_address}],contact_audience:'owners',fields:DM_FIELDS};
   const claimed=checked(await db.rpc('dm_claim_request',{p_key:ck,p_request:payload}));
   if(!claimed){stats.pending++;continue;}
   // Deliberately no automatic retry: an ambiguous request remains reserved until reconciled.
   const res=await request('https://api.v2.dealmachine.com/v1/enrichment/address',{
    method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(120000)});
   const response=await res.json();
   if(!res.ok) {
    checked(await db.from('dm_requests').update({error:`HTTP ${res.status}: ${response.error?.code || 'request_failed'}`}).eq('cache_key',ck));
    throw new Error('Enrichment stopped. The request is saved for reconciliation; it will not be retried automatically.');
   }
   // Persist the entire successful response BEFORE projecting any property/contact rows.
   const completed_at=new Date().toISOString();
   checked(await db.from('dm_requests').update({response,status:'complete',credits:response.credits?.used || 0,completed_at}).eq('cache_key',ck));
   cached={response,status:'complete',completed_at};stats.api_requests++;stats.credits+=response.credits?.used || 0;
  } else if(cached.status==='complete') stats.cache_hits++;
  if(cached.status!=='complete'){stats.pending++;continue;}
  const result=cached.response?.data?.find((r:Data)=>addressKey(r.input?.full_address || '')===addressKey(source.candidate_address));
  if(!result) throw new Error('Saved response is partial or has no matching input; manual reconciliation required.');
  await projectResult(db,source,result,ck,cached.completed_at);stats.processed++;
 }
 return stats;
}
