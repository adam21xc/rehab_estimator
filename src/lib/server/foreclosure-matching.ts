type Party = {name?: string; role?: string; role_code?: string};
type Source = {source?: string;record_type?: string;candidate_address?: string;source_record?: {parties?: Party[];primary_defendant_name?: string;primary_plaintiff_name?: string}};
function tokens(name: string) {
 return name.toUpperCase().replace(/\bPRO\s+SE\b/g,'').replace(/\bL\.?\s*L\.?\s*C\.?\b/g,'LLC').replace(/[^A-Z0-9, ]/g,' ').replace(/\s+/g,' ').trim();
}
const entity = /\b(LLC|INC|INCORPORATED|CORP|CORPORATION|BANK|TRUST|ASSOCIATION|LP|LLP|LTD|LIMITED|HOLDINGS|COMPANY)\b/;
export function ownerNameMatch(a: string,b: string): 'exact'|'close'|null {
 const x=tokens(a),y=tokens(b);
 if(!x||!y) return null;
 if(x.replace(/,/g,'')===y.replace(/,/g,'')) return 'exact';
 if(entity.test(x)||entity.test(y)) {
  if(!entity.test(x)||!entity.test(y)) return null;
  const base=(s:string)=>s.replace(/\b(INCORPORATED|INC|CORPORATION|CORP|LLC|LLP|LP|LTD|LIMITED)\b/g,'').replace(/,/g,'').replace(/\s+/g,' ').trim();
  return base(x) && base(x)===base(y) ? 'close':null;
 }
 const person=(s:string)=>{
  const parts=s.split(',');
  return (parts.length===2?parts[1]+' '+parts[0]:s).trim().split(/\s+/);
 };
 const p=person(x),q=person(y);
 if(p.length<2||q.length<2||p[0]!==q[0]||p.at(-1)!==q.at(-1))return null;
 const pm=p.slice(1,-1),qm=q.slice(1,-1);
 // Missing middles are allowed; conflicting spelled-out middles and suffixes are not.
 if(pm.length&&qm.length && (pm.length!==qm.length || pm.some((v,i)=>v!==qm[i] && !(v[0]===qm[i][0]&&(v.length===1||qm[i].length===1)))))return null;
 return 'close';
}
export function foreclosureEvidence(source:Source,result:Record<string,unknown>={}) {
 if(source.source!=='mycase'||source.record_type!=='MF')return null;
 const record=source.source_record||{};
 const names=(role:string,primary?:string)=>[...new Set([...(record.parties||[]).filter(p=>p.role_code===role||p.role===(role==='DF'?'Defendant':'Plaintiff')).map(p=>p.name),primary].filter((n):n is string=>typeof n==='string'&&!!n.trim()))];
 const defendants=names('DF',record.primary_defendant_name),plaintiffs=names('PL',record.primary_plaintiff_name);
 const owners=[result.owner_1_full_name,result.owner_2_full_name].filter((n):n is string=>typeof n==='string'&&!!n.trim());
 const matches=owners.flatMap(owner=>defendants.flatMap(defendant=>{const strength=ownerNameMatch(owner,defendant);return strength?[{owner,defendant,strength}]:[];}));
 return {defendants,plaintiffs,owners,matches,unmatchedOwners:owners.filter(o=>!matches.some(m=>m.owner===o)),
  note:matches.length?'Owner name agrees with a defendant. This supports a likely match only when the property address also agrees; confirm the subject property.':'No defendant–owner name match established. Review the property and parties; do not assume a bank cannot own it.'};
}
