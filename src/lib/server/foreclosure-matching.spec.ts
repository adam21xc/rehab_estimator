import {it,expect} from 'vitest';
import {ownerNameMatch,foreclosureEvidence} from './foreclosure-matching';
import {reviewReasons} from './dealmachine';
it.each([
 ['Smith, John A.','John Andrew Smith','close'],
 ['John Smith','John A Smith','close'],
 ['John Adam Smith','John Andrew Smith',null],
 ['John Smith','Jane Smith',null],
 ['J Smith','John Smith',null],
 ['RET Holdings, L.L.C.','RET Holdings LLC','exact'],
 ['RET Holdings LLC','RET Holdings Inc','close'],
 ['First Merchants Bank','First Merchants Bank','exact'],
 ['John Smith Jr','John Smith Sr',null],
 ['John Smith pro se','John Smith','exact']
])('compares %s with %s conservatively',(a,b,expected)=>expect(ownerNameMatch(a,b)).toBe(expected));
const source={source:'mycase',record_type:'MF',candidate_address:'123 Main St',address_role:'reviewed_subject_property',source_record:{source_names:['First Merchants Bank'],primary_plaintiff_name:'First Merchants Bank',primary_defendant_name:'Other Lienholder',parties:[{name:'Other Lienholder',role_code:'DF'},{name:'Smith, John A.',role_code:'DF'}]}};
it('uses secondary defendants and never the plaintiff as an owner shortcut',()=>{
 const evidence=foreclosureEvidence(source,{owner_1_full_name:'John Andrew Smith'})!;
 expect(evidence.matches).toEqual([{owner:'John Andrew Smith',defendant:'Smith, John A.',strength:'close'}]);
 expect(foreclosureEvidence(source,{owner_1_full_name:'First Merchants Bank'})?.matches).toEqual([]);
});
it('retains a likely match for review and independently flags address differences',()=>{
 const reasons=reviewReasons(source,{full_address:'125 Main St',owner_1_full_name:'John Smith'});
 expect(reasons).toContain('Returned address differs from the submitted address; verify units and parcel.');
 expect(reasons).toContain('Likely match—owner name agrees with a foreclosure defendant; confirm the subject property.');
});
it('does not exclude bank defendants and flags unmatched co-owners',()=>{
 const bank={...source,source_record:{parties:[{name:'First Merchants Bank',role_code:'DF'}]}};
 expect(foreclosureEvidence(bank,{owner_1_full_name:'First Merchants Bank'})?.matches).toHaveLength(1);
 expect(reviewReasons(bank,{full_address:'123 Main St',owner_1_full_name:'First Merchants Bank',owner_2_full_name:'Jane Doe'})).toContain('Additional provider owners do not match named defendants; review co-ownership.');
});
