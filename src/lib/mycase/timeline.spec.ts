import { it, expect } from 'vitest';
import { caseTimeline } from './timeline';
it('retains source order on a date, displays scheduled sessions, and omits document tokens', () => {
	const result = caseTimeline({
		Events: [
			{
				EventKey: 'h',
				EventDate: '10/26/2026',
				Description: 'Eviction Hearing',
				HearingEvent: {
					Sessions: [{ DisplayText: '10/26/2026 11:00 AM, Judicial Officer: Example' }]
				}
			},
			{
				EventKey: 'a',
				EventDate: '10/02/2026',
				Description: 'Appearance Filed',
				CaseEvent: {
					Date2: '10/02/2026',
					Date2Label: 'File Stamp',
					Parties: [{ PartyLabel: 'For Party', Name: 'Example' }]
				}
			},
			{
				EventKey: 'b',
				EventDate: '10/02/2026',
				Description: 'Order Issued',
				CaseEvent: { Comment: 'Example order' },
				EventDocuments: [{ Name: 'Order', CanDown: false, DownUrl: 'secret-token-url' }]
			}
		]
	});
	expect(result.events.map((e) => e.title)).toEqual([
		'Appearance Filed',
		'Order Issued',
		'Eviction Hearing'
	]);
	expect(result.events[0].details).toContainEqual({ label: 'For Party', value: 'Example' });
	expect(result.events[2].details[0].value).toContain('11:00 AM');
	expect(JSON.stringify(result)).not.toContain('secret-token-url');
});
it('distinguishes an unavailable summary from a captured empty timeline', () => {
	expect(caseTimeline(null)).toEqual({ available: false, events: [] });
	expect(caseTimeline({ Events: [] })).toEqual({ available: true, events: [] });
	expect(caseTimeline({ Events: [null] }).events[0].title).toBe('Court event');
});
