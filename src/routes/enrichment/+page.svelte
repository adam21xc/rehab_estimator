<script lang="ts">
 import {onMount} from 'svelte';
 import EmailSignIn from '$lib/components/EmailSignIn.svelte';
 type RecordRow={id:string;source:string;source_id:string;record_type:string;county:string;candidate_address:string|null;address_role:string;status:string;review_reasons:string[];source_names:string[];property:{id:string;facts:Record<string,unknown>;estimates:Record<string,unknown>;observed_at:string}|null};
 let rows=$state<RecordRow[]>([]),signedIn=$state(true),busy=$state(false),problem=$state(''),message=$state('');
 let credits=$state(0),pending=$state(0),filter=$state('all'),selected=$state<RecordRow|null>(null),address=$state(''),detail=$state('');
 const visible=$derived(rows.filter(r=>filter==='all'||r.status===filter));
 const ready=$derived(rows.filter(r=>r.status==='ready').length);
 const enriched=$derived(rows.filter(r=>r.property).length);
 const waiting=$derived(rows.filter(r=>r.status==='needs_match').length);
 const findings=$derived(rows.filter(r=>r.status==='review').length);
 const recordLabels:Record<string,string>={MF:'Foreclosure',EU:'Unsupervised estate',EVSC:'Eviction',EVCD:'Eviction'};
 const displayAddress=(row:RecordRow)=>!row.candidate_address||/^(DECEASED|Confidential Address)$/i.test(row.candidate_address.trim())?'Property address needs research':row.candidate_address;
 const labels:Record<string,string>={needs_match:'Match property',ready:'Ready to enrich',review:'Enriched · review findings',accepted:'Enriched · accepted',rejected:'Excluded',no_match:'No match'};
 async function request(options?:RequestInit,suffix=''){
  const r=await fetch('/api/rehab/enrichment'+suffix,options);const data=await r.json();
  if(r.status===401){signedIn=false;rows=[];selected=null;detail='';}
  if(!r.ok)throw new Error(data.message||'Unable to load enrichment.');return data;
 }
 async function load(){busy=true;problem='';try{const d=await request();rows=d.records;credits=d.credits;pending=d.pendingRequests;signedIn=true;}catch(e){problem=(e as Error).message;}finally{busy=false;}}
 async function choose(row:RecordRow){selected=row;address=row.candidate_address||'';detail='';try{const d=await request(undefined,'?id='+encodeURIComponent(row.id));if(selected?.id===row.id)detail=JSON.stringify(d,null,2);}catch(e){problem=(e as Error).message;}}
 async function act(action:string){busy=true;problem='';message='';try{
  const d=await request({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,id:selected?.id,address})});
  message=action==='process'?`${d.processed} processed · ${d.cache_hits} reused from database · ${d.credits} new credits`:'Review decision saved.';
  selected=null;detail='';await load();
 }catch(e){problem=(e as Error).message;}finally{busy=false;}}
 onMount(load);
</script>
<svelte:head><title>Lead enrichment · Workspace</title></svelte:head>
<main>
 <p class="eyebrow">DATA REVIEW</p><h1>Lead enrichment</h1>
 <p class="muted">Saved property and contact data from DealMachine, linked to the original source records.</p>
 {#if !signedIn}<EmailSignIn onSignedIn={load}/>{:else}
 <section class="stats"><div><strong>{rows.length}/100</strong><span>Rollout records</span></div><div><strong>{enriched}</strong><span>Enriched · {findings} need review</span></div><div><strong>{waiting}</strong><span>Awaiting property match</span></div><div><strong>{credits}</strong><span>Credits recorded</span></div></section>
 <div class="toolbar"><label>Show <select bind:value={filter}><option value="all">All records</option>{#each Object.entries(labels) as [value,label]}<option {value}>{label}</option>{/each}</select></label><button disabled={busy} onclick={load}>Refresh saved data</button><button class="primary" disabled={busy||!ready} onclick={()=>act('process')} aria-describedby="enrichment-help">{busy ? 'Working…' : ready ? `Enrich next ${Math.min(ready,3)} ready records` : 'No confirmed records ready'}</button></div>
 <section class="guidance" id="enrichment-help" aria-label="How to enrich leads">
 <h2>How to enrich a lead</h2>
 <p>Choose <strong>Match property</strong> under Show, then open <strong>Review</strong>. Check the case and enter its actual property address. Click <strong>Confirm address for enrichment</strong>, then use the enrichment button above.</p>
 <p>{ready} confirmed records are ready. {waiting} need a property match first. Court party addresses may belong to tenants, representatives or offices. Rows marked <strong>Enriched</strong> already have saved results; review their findings without another lookup.</p>
 <p>Refresh saved data reloads your database records; it does not request new enrichment.</p>
 </section>
 {#if pending}<p class="notice">{pending} request(s) await reconciliation. They will not be submitted again automatically.</p>{/if}
 {#if message}<p role="status">{message}</p>{/if}
 {#if problem}<p role="alert">{problem}</p>{/if}
 {#if selected}<section class="review surface"><button onclick={()=>{selected=null;detail='';}}>Close review</button><h2>{displayAddress(selected)}</h2>
 <p>{selected.source.toUpperCase()} · {selected.source_id} · {selected.record_type}</p><p>Source names: {selected.source_names.join('; ')||'Not listed'}</p>
 <p>Provider owner: {String(selected.property?.facts.owner_1_full_name||'Not yet enriched')}</p>
 <ul>{#each selected.review_reasons as reason}<li>{reason}</li>{/each}</ul>
 <label>Confirmed subject-property address<input bind:value={address} placeholder="Street, unit, city, state and ZIP"/></label>
 <p class="muted">Confirm only after checking that this is the actual property involved. For evictions, identify the landlord separately from the tenant. An estate party’s address is not necessarily estate property.</p>
 <div class="toolbar"><button disabled={busy||address.trim().length<8} onclick={()=>act('confirm_address')}>Confirm address for enrichment</button><button disabled={busy||!selected.property} onclick={()=>act('accept')}>Accept property link</button><button disabled={busy} onclick={()=>act('reject')}>Exclude this lead</button></div>
 <p class="muted">Accepting a property link does not approve outreach or verify a mailing address.</p>
 <details><summary>Saved source, property and contact details</summary><pre>{detail||'Loading saved details…'}</pre></details></section>{/if}
 <div class="table-wrap"><table><thead><tr><th>Property or party address</th><th>Source</th><th>County</th><th>Status</th><th></th></tr></thead><tbody>{#each visible as row}<tr><td>{displayAddress(row)}<small>{row.source_names.join('; ')}</small></td><td>{row.source.toUpperCase()}<small>{recordLabels[row.record_type]||row.record_type}</small></td><td>{{'49':'Marion','32':'Hendricks','79':'Tippecanoe'}[row.county as '49'|'32'|'79']||row.county||'Unknown'}</td><td>{labels[row.status]||row.status}</td><td><button onclick={()=>choose(row)}>Review</button></td></tr>{/each}</tbody></table></div>
 {#if !busy&&!visible.length}<p>No records in this view.</p>{/if}
 {/if}
</main>
<style>
 main{color:#20283b;max-width:1250px;margin:auto;padding:30px}h1{margin:8px 0}.stats{display:flex;gap:40px;margin:28px 0;flex-wrap:wrap}.stats strong{display:block;font-size:26px}.stats span,small{display:block;color:#536076}.toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:18px 0}button,select,input{font:inherit;padding:10px 14px;border:1px solid #94a3b8;border-radius:8px;background:#fff;color:#20283b;color-scheme:light}button{cursor:pointer}button:hover:not(:disabled){background:#e8eef6}button:focus-visible,select:focus-visible,input:focus-visible{outline:3px solid #2563eb;outline-offset:3px}button:disabled{opacity:1;background:#e2e8f0;color:#475569;border-color:#94a3b8;cursor:not-allowed}.primary{background:#19635f;color:#fff;border-color:#19635f}.primary:hover:not(:disabled){background:#124e4b}.guidance{background:#edf5fa;border:1px solid #b8ccdb;border-radius:10px;padding:16px;margin:18px 0;color:#24364b}.guidance h2{font-size:16px;font-weight:700;margin:0 0 8px}.guidance p{font-size:14px;line-height:1.6;margin:8px 0}.review{padding:24px;margin:24px 0;border:1px solid var(--border,#384453);border-radius:12px}.review input{display:block;width:100%;box-sizing:border-box;margin-top:8px}.notice{padding:14px;background:#684a1533}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;table-layout:fixed}td{overflow-wrap:anywhere}th:first-child{width:32%}th:nth-child(2){width:20%}th:nth-child(3){width:14%}th:nth-child(4){width:20%}th:last-child{width:14%}td button{padding:8px;font-size:13px}th,td{text-align:left;padding:14px;border-bottom:1px solid var(--border,#384453)}th{white-space:normal}th,td{font-size:14px;padding:12px 8px}.muted{color:#536076}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}summary{cursor:pointer;padding:14px 0}@media(max-width:600px){main{padding:18px}.stats{gap:20px}.review{padding:16px}}
</style>
