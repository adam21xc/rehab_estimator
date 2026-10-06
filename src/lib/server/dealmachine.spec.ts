import { describe,it,expect,vi } from 'vitest';
import { addressKey,cacheKey,normalizeValue,reviewReasons,enrichReady,evictionEvidence } from './dealmachine';
import type { SupabaseClient } from '@supabase/supabase-js';

const source={id:'accela:INDY:test',candidate_address:'123 N Main St, Indianapolis IN 46220',address_role:'subject_property',source:'accela',record_type:'Violation',source_record:{source_names:['Smith, Jane']},status:'ready'};
const result={input:{full_address:source.candidate_address},matched:true,dm_property_id:'prop_test',full_address:'123 North Main Street Indianapolis, IN 46220',owner_1_full_name:'JANE SMITH',contacts:[]};
describe('matching and normalization',()=>{
 it('normalizes common street spellings without merging units',()=>{
  expect(addressKey(source.candidate_address)).toBe(addressKey(result.full_address));
  expect(cacheKey('123 Main St Apt 1 Indianapolis IN 46220')).not.toBe(cacheKey('123 Main St Apt 2 Indianapolis IN 46220'));
 });
 it('preserves null and zero, and converts explicit booleans and currency',()=>{
  expect([null,0,'No','Yes','$1,200.50'].map(normalizeValue)).toEqual([null,0,false,true,1200.5]);
 });
 it('requires review for court-party addresses and ownership conflicts',()=>{
  expect(reviewReasons(source,result)).toEqual([]);
  expect(reviewReasons({...source,source:'mycase',address_role:'party_address_unverified_subject_property'},result)).toContain('Court party address is not a verified subject property.');
  expect(reviewReasons(source,{...result,owner_1_full_name:'JANE JONES'}).some(s=>s.includes('ownership'))).toBe(true);
 });
 it('flags contradictory provider estimates instead of silently fixing them',()=>{
  expect(reviewReasons(source,{...result,estimated_value:100000,estimated_equity_amount:50000,estimated_equity_percentage:80})).toContain('Provider equity percentage conflicts with its dollar estimates.');
 });
});

// A minimal data-store double exercises the real cache/claim/response ordering.
function database(requestRows:Record<string,unknown>[]=[]){
 const tables:Record<string,Record<string,any>[]>= {dm_source_links:[{...source}],dm_requests:requestRows,dm_properties:[],dm_contacts:[],dm_property_contacts:[]};
 const db={from(table:string){let op='select',payload:any,filters:[string,unknown][]=[];
  const q:any={select(){return q;},eq(k:string,v:unknown){filters.push([k,v]);return q;},order(){return q;},limit(){return q;},maybeSingle(){return q.then((r:any)=>({...r,data:r.data[0]||null}));},upsert(v:any){op='upsert';payload=v;return q;},update(v:any){op='update';payload=v;return q;},then(resolve:any){
   const selected=tables[table].filter(r=>filters.every(([k,v])=>r[k]===v));
   if(op==='update')selected.forEach(r=>Object.assign(r,payload));
   if(op==='upsert'){const prior=tables[table].find(r=>r.id===payload.id);if(prior)Object.assign(prior,payload);else tables[table].push(payload);}
   return Promise.resolve({data:op==='select'?selected:null,error:null}).then(resolve);
  }};return q;},async rpc(_name:string,args:any){if(tables.dm_requests.some(r=>r.cache_key===args.p_key))return{data:false,error:null};tables.dm_requests.push({cache_key:args.p_key,status:'pending',request:args.p_request});return{data:true,error:null};}};
 return {db:db as unknown as SupabaseClient,tables};
}
it('serves complete cached enrichment without any vendor call',async()=>{
 const {db,tables}=database([{cache_key:cacheKey(source.candidate_address),status:'complete',response:{data:[result]},completed_at:'2026-10-04T12:00:00Z'}]);
 const fetcher=vi.fn();const stats=await enrichReady(db,'',3,fetcher);
 expect(fetcher).not.toHaveBeenCalled();expect(stats.cache_hits).toBe(1);expect(tables.dm_properties).toHaveLength(1);expect(tables.dm_source_links[0].status).toBe('accepted');
});
it('does not repeat a request with an uncertain prior outcome',async()=>{
 const {db}=database([{cache_key:cacheKey(source.candidate_address),status:'pending'}]);const fetcher=vi.fn();
 const stats=await enrichReady(db,'secret',3,fetcher);expect(fetcher).not.toHaveBeenCalled();expect(stats.pending).toBe(1);
});
it('durably saves successful responses and prevents later duplicate calls',async()=>{
 const {db,tables}=database();const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({data:[result],credits:{used:2}})));
 await enrichReady(db,'secret',3,fetcher);
 expect(tables.dm_requests[0].status).toBe('complete');expect(tables.dm_requests[0].credits).toBe(2);
 tables.dm_source_links[0].status='ready';await enrichReady(db,'secret',3,fetcher);
 expect(fetcher).toHaveBeenCalledTimes(1);
});
it('holds a timed-out request so another run cannot spend again',async()=>{
 const {db,tables}=database();const fetcher=vi.fn().mockRejectedValue(new Error('timeout'));
 await expect(enrichReady(db,'secret',3,fetcher)).rejects.toThrow('timeout');
 expect(tables.dm_requests[0].status).toBe('pending');
 await enrichReady(db,'secret',3,fetcher);expect(fetcher).toHaveBeenCalledTimes(1);
});

const eviction={...source,source:'mycase',record_type:'EVSC',address_role:'reviewed_subject_property',source_record:{source_names:['Tenant Person'],primary_defendant_name:'Tenant Person',primary_plaintiff_name:'Property Manager LLC',parties:[{role_code:'PL',name:'Jane Smith'}]}};
it('keeps all eviction plaintiffs and tenants separate from provider owners',()=>{
 const evidence=evictionEvidence(eviction,result)!;
 expect(evidence.plaintiffs).toEqual(['Jane Smith','Property Manager LLC']);
 expect(evidence.defendants).toEqual(['Tenant Person']);
 expect(evidence.owners).toEqual(['JANE SMITH']);
 expect(evidence.plaintiffMatchesOwner).toBe(true);
 expect(reviewReasons(eviction,result)).toEqual([]);
});
it('does not block a confirmed property just because the plaintiff is a manager',()=>{
 const landlord={...eviction,source_record:{...eviction.source_record,parties:[]}};
 expect(evictionEvidence(landlord,result)?.plaintiffMatchesOwner).toBe(false);
 expect(reviewReasons(landlord,result)).toEqual([]);
 expect(reviewReasons(landlord,{...result,owner_1_full_name:null})).toContain('Provider did not identify a property owner; review before using contact candidates.');
});
it('still flags a different unit and never merges its cache key',()=>{
 expect(reviewReasons(eviction,{...result,full_address:result.full_address+' Apt 2'})).toContain('Returned address differs from the submitted address; verify units and parcel.');
});
it('does not enrich an unverified tenant address even if marked ready',async()=>{
 const {db,tables}=database();tables.dm_source_links[0]={...eviction,status:'ready',address_role:'party_address_unverified_subject_property'};
 const fetcher=vi.fn();await enrichReady(db,'secret',3,fetcher);expect(fetcher).not.toHaveBeenCalled();expect(tables.dm_requests).toHaveLength(0);
});
it('requests owner contacts for a confirmed eviction property and saves them separately',async()=>{
 const {db,tables}=database();tables.dm_source_links[0]={...eviction,status:'ready'};
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({data:[{...result,contacts:[{dm_person_id:'owner-contact',full_name:'JANE SMITH',phones:[],emails:[]}]}],credits:{used:2}})));
 await enrichReady(db,'secret',3,fetcher);
 expect(JSON.parse(fetcher.mock.calls[0][1].body).contact_audience).toBe('owners');
 expect(tables.dm_contacts[0].data.full_name).toBe('JANE SMITH');
 expect(tables.dm_source_links[0].source_record.primary_defendant_name).toBe('Tenant Person');
 expect(tables.dm_source_links[0].status).toBe('accepted');
});
