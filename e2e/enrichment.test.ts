import {test,expect} from '@playwright/test';
test('filters filing dates and case types and expands review beside the selected case',async({page})=>{
 const records=Array.from({length:25},(_,i)=>({id:`case-${i}`,source:'mycase',source_id:`TEST-${i}`,record_type:i===24?'EVSC':'MF',file_date:i===0?null:i===24?'2026-10-05':'2026-10-01',county:'49',candidate_address:`${100+i} Test St`,address_role:'party_address_unverified_subject_property',status:'needs_match',review_reasons:[],source_names:['Example'],property:null,eviction:null,foreclosure:null}));
 await page.route('**/api/rehab/enrichment**',async route=>{
  const id=new URL(route.request().url()).searchParams.get('id');
  await route.fulfill({json:id?{record:records.find(r=>r.id===id),contacts:[]}:{records,credits:0,pendingRequests:0}});
 });
 await page.goto('/enrichment');
 await expect(page.getByRole('button',{name:'Review',exact:true})).toHaveCount(25);
 const last=page.getByRole('row').filter({hasText:'124 Test St'});
 await last.getByRole('button',{name:'Review',exact:true}).click();
 const panel=page.getByRole('region',{name:'Review TEST-24',exact:true});
 await expect(panel).toBeVisible();
 expect(await panel.evaluate(el=>el.closest('tr')?.previousElementSibling?.textContent)).toContain('124 Test St');
 await panel.getByRole('button',{name:'Close review',exact:true}).click();
 await expect(panel).toHaveCount(0);
 await page.getByRole('combobox',{name:'Case type',exact:true}).selectOption('EVSC');
 await expect(page.getByRole('button',{name:'Review',exact:true})).toHaveCount(1);
 await page.getByLabel('Filed from',{exact:true}).fill('2026-10-05');
 await page.getByLabel('Filed through',{exact:true}).fill('2026-10-05');
 await expect(page.getByRole('button',{name:'Review',exact:true})).toHaveCount(1);
 await page.getByLabel('Filed from',{exact:true}).fill('2026-10-06');
 await expect(page.getByText('The start date must be on or before the end date.')).toBeVisible();
 await expect(page.getByRole('button',{name:'Review',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();
 await page.getByLabel('Filed from',{exact:true}).fill('2026-10-01');
 await expect(page.getByRole('button',{name:'Review',exact:true})).toHaveCount(24);
});
