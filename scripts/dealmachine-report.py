"""Build a local, private review report from saved pilot responses; no network calls."""
import csv
import html
import json
import os
from pathlib import Path

root = Path(__file__).resolve().parents[1] / '.dealmachine-data'
read = lambda p: json.loads(p.read_text())
esc = lambda x: html.escape(str(x))
runs = sorted(root.glob('pilot-*/summary.json'))
records = []
catalog = {}
for summary in runs:
    folder = summary.parent
    inputs = {r['address']: r for r in read(folder / 'input.json')}
    requested = read(folder / 'request.json')['fields']
    for field in read(folder / 'field-catalog.json'):
        catalog[field['field_id']] = field
    for result in read(folder / 'response.json')['data']:
        source = inputs[result['input']['full_address']]
        records.append({'source': source, 'result': result, 'requested': requested})

phones = [p for r in records for c in r['result'].get('contacts', []) for p in c.get('phones', [])]
emails = [e for r in records for c in r['result'].get('contacts', []) for e in c.get('emails', [])]
usage = read(root / 'usage-final.json')['credits']
statuses = {r['case_number']: r for r in read(root / 'case-status.json')}
money = lambda v: 'Missing' if v is None else '${:,.0f}'.format(v)

def warnings(source, result):
    notes = []
    if source['source'] == 'mycase':
        notes.append('Party address only: subject-property link remains unverified.')
    if source['source_id'] == '49D33-2602-MF-006567':
        notes.append('Source names Isaac Watson; provider names Elizabeth Lang. Source case filed February 6, 2026; provider sale date June 4, 2026. Review ownership and case status before outreach.')
    if source['source_id'] == 'VIO26-008008':
        notes.append('Accela names two owners; provider returned one. Preserve both source-owner claims.')
    v, equity, pct = (result.get(k) for k in ['estimated_value', 'estimated_equity_amount', 'estimated_equity_percentage'])
    if v and equity is not None and pct is not None:
        implied = 100 * equity / v
        if abs(implied - pct) > 2:
            notes.append(f'Provider equity is {pct}%, but its dollar equity ÷ value implies {implied:.1f}%. Keep both raw values and flag the discrepancy.')
    if result.get('foreclosure_auction_date') and result.get('is_preforeclosure') == 'No':
        notes.append('Historical auction date alongside a current No preforeclosure flag. Do not schedule outreach from this date.')
    if result.get('living_area_sqft') == 0:
        notes.append('Zero living area and a low reported value: review land/property classification; do not apply a house rehab estimate.')
    if not result.get('contacts') or not any(c.get('phones') or c.get('emails') for c in result.get('contacts', [])):
        notes.append('Matched owner has no phone or email in this response.')
    if source.get('source_owner_lines'):
        notes.append('Accela supplies a separate owner address. Enrichment did not return a dedicated owner mailing address; person lookup did not return residence either.')
    return notes

cards = []
csv_rows = []
for record in records:
    s, r = record['source'], record['result']
    contacts = r.get('contacts', [])
    ps = sum(len(c.get('phones', [])) for c in contacts)
    es = sum(len(c.get('emails', [])) for c in contacts)
    rows = [('Source', s['source'].upper() + ' · ' + s['source_type']),
            ('Source record', s['source_id']), ('Source owner or party', '; '.join(s['source_names'])),
            ('Returned owner', r.get('owner_1_full_name')), ('Property ID', r.get('dm_property_id')),
            ('Property type', r.get('property_type')), ('Parcel', r.get('apn')),
            ('Value estimate', money(r.get('estimated_value'))), ('Living area', r.get('living_area_sqft')),
            ('Year built', r.get('year_built')), ('Last sale', r.get('last_sale_date')),
            ('Owner occupied', r.get('is_owner_occupied')), ('Absentee owner', r.get('has_absentee_owners')),
            ('Phones / emails', f'{ps} / {es}')]
    if s['source_id'] in statuses:
        rows.append(('MyCase status at retrieval', statuses[s['source_id']]['status']))
    if s.get('source_owner_lines'):
        rows.append(('Accela owner address as recorded', ' | '.join(s['source_owner_lines'][0])))
    dl = ''.join(f'<dt>{esc(k)}</dt><dd>{esc(v if v is not None else "Missing")}</dd>' for k, v in rows)
    notes = ''.join(f'<li>{esc(n)}</li>' for n in warnings(s, r))
    raw = {k: v for k, v in r.items() if k != 'images'}
    cards.append(f'<article><h3>{esc(r.get("full_address", s["address"]))}</h3><dl>{dl}</dl><ul class="notes">{notes}</ul><details><summary>Returned fields and contact details</summary><pre>{esc(json.dumps(raw, indent=2))}</pre></details></article>')
    csv_rows.append({'source': s['source'], 'source_id': s['source_id'], 'input_address': s['address'],
                     'address_role': s['address_role'], 'matched': r.get('matched'),
                     'property_id': r.get('dm_property_id'), 'returned_address': r.get('full_address'),
                     'source_names': '; '.join(s['source_names']), 'returned_owner': r.get('owner_1_full_name'),
                     'phones': ps, 'emails': es, 'review_notes': ' | '.join(warnings(s, r))})

field_rows = []
requested = sorted(set(f for r in records for f in r['requested']))
for field in requested:
    present = sum(field in r['result'] for r in records)
    populated = sum(r['result'].get(field) is not None for r in records)
    values = [r['result'][field] for r in records if r['result'].get(field) is not None]
    example = 'Missing' if not values else json.dumps(values[0])
    field_rows.append(f'<tr><td>{esc(field)}</td><td>{populated}/{len(records)}</td><td>{present}/{len(records)}</td><td>{esc(example)}</td></tr>')

report = '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DealMachine pilot review</title>
<style>body{font-family:system-ui,sans-serif;max-width:1100px;margin:36px auto;padding:0 24px;color:#18212b;background:#f8fafb;line-height:1.55}h1{font-size:30px}h2{margin-top:38px}h3{margin:0 0 18px}p{max-width:880px}article{background:white;border:1px solid #dce3e7;border-radius:12px;padding:22px;margin:20px 0}dl{display:grid;grid-template-columns:minmax(160px,1fr) 3fr;gap:8px 22px}dt{color:#53616e}dd{margin:0;overflow-wrap:anywhere}.notes{background:#fff3d5;padding:16px 16px 16px 34px;border-radius:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f1f4f6;padding:18px;font-size:13px}summary{cursor:pointer;font-weight:600;padding:10px 0}.metrics{display:flex;flex-wrap:wrap;gap:14px}.metric{background:#e8f1ed;padding:14px 20px;border-radius:8px}.metric strong{display:block;font-size:24px}table{border-collapse:collapse;width:100%;background:white}td,th{padding:10px;text-align:left;border-bottom:1px solid #dde4e8;overflow-wrap:anywhere}th{background:#e8eef2}.table-wrap{overflow:auto}a{color:#185b70}.muted{color:#53616e}@media(max-width:600px){body{padding:0 14px}dl{grid-template-columns:1fr}dd{margin-bottom:10px}}</style></head><body>
<p class="muted">Adam Buys Houses · October 4, 2026 · Private local review</p><h1>DealMachine enrichment pilot</h1>
<p>Seven address matches from five Accela records and two MyCase party addresses. These are provider matches, not verified ownership or campaign approvals. Raw responses are preserved locally; source tables were not updated.</p>
'''
report += f'<div class="metrics"><div class="metric"><strong>{len(records)}/{len(records)}</strong>Addresses matched</div><div class="metric"><strong>{usage["used"]}</strong>Account credits used</div><div class="metric"><strong>{usage["total_available"]:,}</strong>Credits remaining</div><div class="metric"><strong>{len(phones)} / {len(emails)}</strong>Phone / email entries</div></div>'
report += f'<p>{sum(p.get("do_not_call") is True for p in phones)} of {len(phones)} phone entries carry a provider do-not-call flag. These are entry counts, not deduplicated contacts; an unflagged number is not an outreach approval.</p>'
report += '''<h2>What the sample tells us</h2><ul>
<li>Keep source owner/party names alongside provider owner claims. A property match must not replace court-party identity.</li>
<li>MyCase foreclosure records are Pending locally, while DealMachine returns No for preforeclosure. Preserve separate source statuses and observation dates.</li>
<li>Several equity percentages conflict with the returned dollar values. Do not rank leads on these percentages without reconciliation.</li>
<li>All six non-null repair estimates in the initial batch equal $35 per square foot. Treat these as a rough provider estimate, separate from our itemized rehab estimator.</li>
<li>Accela local parcel identifiers differ from the formatted APNs returned here. Keep both identifiers and jurisdiction; do not overwrite one with the other.</li>
<li>The absentee example did not yield a dedicated mailing address. Preserve its Accela owner address and verify the intended recipient before mail.</li>
</ul><h2>Suggested field decisions</h2><div class="table-wrap"><table><tr><th>Decision</th><th>Fields</th><th>Reason</th></tr>
<tr><td>Keep as core</td><td>Local/source IDs, DealMachine IDs, input and standardized addresses, jurisdiction/parcel IDs, source party roles, provider owner claims, observation dates, match status</td><td>Traceability, matching, and reconciliation</td></tr>
<tr><td>Keep separately</td><td>Phones, emails, provider DNC flags, verified mailing addresses, ownership relationships</td><td>People can own multiple properties and have multiple contact points</td></tr>
<tr><td>Keep as dated estimates</td><td>Value, equity, mortgage balances, repair estimate, market status, foreclosure flags</td><td>Useful context with conflicts and freshness limits</td></tr>
<tr><td>Evaluate by usefulness</td><td>Construction, zoning, unit count, dimensions, building condition, assessment/tax years</td><td>Prioritize fields that support actual acquisition decisions</td></tr>
<tr><td>Exclude from canonical model initially</td><td>Unneeded person demographics and lifestyle fields; duplicate field aliases</td><td>The default person endpoint returned demographics that this workflow does not need</td></tr>
</table></div><h2>Seven records to review</h2>'''
report += ''.join(cards)
report += '<h2>Requested field coverage</h2><p>Populated counts include false, zero, and No. Present counts distinguish explicit null from absent keys. Some requested fields have aliases in the raw response.</p><div class="table-wrap"><table><tr><th>Requested field</th><th>Populated</th><th>Present</th><th>Example</th></tr>' + ''.join(field_rows) + '</table></div>'
report += '''<h2>Mail API findings</h2><p>Live account rates: 4×6 $0.70, 6×9 $0.80, 6×11 $0.87 per piece. Available mail funds: $5.00; auto-reload disabled. Seven 4×6 pieces would total $4.90 at the quoted piece price, subject to the actual campaign cost estimate.</p>
<p>The account-specific API schema accepts custom front and back HTML and draft designs. It currently allows landscape orientation only, despite the public guide also mentioning portrait. Arbitrary PDF/PNG upload is not established by this endpoint; existing artwork needs a separately tested design workflow. No design, campaign, mailing, or payment was created.</p>
<p><a href="https://api.docs.dealmachine.com/mail/designs/create-design">Custom design documentation</a> · <a href="https://api.docs.dealmachine.com/mail/campaigns/cost-estimate">Campaign cost estimates</a></p>
<h2>Next integration step</h2><p>Review these matches and choose canonical fields. Then add a staged enrichment table with raw response, source links, proposed normalized values, reviewer decision, and timestamps. Apply accepted changes to shared property/contact records while preserving MyCase and Accela facts. Resolve mailing-address retrieval before enabling campaigns.</p></body></html>'''
(root / 'pilot-review.html').write_text(report)
with (root / 'pilot-review.csv').open('w', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=list(csv_rows[0])); writer.writeheader(); writer.writerows(csv_rows)
for p in root.rglob('*'):
    if p.is_file(): os.chmod(p, 0o600)
print(f'Review generated for {len(records)} records, {len(phones)} phone entries, {len(emails)} email entries.')
