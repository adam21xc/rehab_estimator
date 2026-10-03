import { filingDate } from './records';
export type TimelineEvent = {
	id: string;
	date: string | null;
	time: string | null;
	title: string;
	details: { label: string; value: string }[];
	documents: string[];
};
const object = (v: unknown): Record<string, unknown> =>
	v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const array = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export function caseTimeline(raw: unknown): { available: boolean; events: TimelineEvent[] } {
	const source = object(raw).Events;
	if (!Array.isArray(source)) return { available: false, events: [] };
	const events = source.map((value, index) => {
		const e = object(value),
			details: TimelineEvent['details'] = [];
		const add = (label: string, value: unknown) => {
			const s = text(value);
			if (s && !details.some((d) => d.label === label && d.value === s))
				details.push({ label, value: s });
		};
		for (const key of [
			'CaseEvent',
			'HearingEvent',
			'DispEvent',
			'AEvent',
			'JEvent',
			'SEvent',
			'VEvent'
		]) {
			const section = object(e[key]);
			add('Details', section.Comment);
			add('Result', section.Result);
			add('Cancellation reason', section.CanceledReason);
			add(text(section.Date2Label) || 'Additional date', section.Date2);
			for (const party of array(section.Parties)) {
				const p = object(party);
				add(text(p.PartyLabel) || 'Party', p.Name);
			}
			for (const session of array(section.Sessions)) {
				const s = object(session);
				add(
					'Session',
					s.DisplayText || [text(s.SessionDate), text(s.SessionTime)].filter(Boolean).join(' ')
				);
			}
		}
		return {
			id: `${text(e.EventKey) || 'event'}:${index}`,
			date: text(e.EventDate),
			time: text(e.EventTime),
			title: text(e.Description) || 'Court event',
			details,
			documents: array(e.EventDocuments)
				.map((d) => text(object(d).Name))
				.filter((v): v is string => !!v)
		};
	});
	// Stable sorting preserves source order for same-day entries; dates can include future hearings.
	events.sort((a, b) => {
		const x = filingDate(a.date),
			y = filingDate(b.date);
		return x && y ? x.localeCompare(y) : x ? -1 : y ? 1 : 0;
	});
	return { available: true, events };
}
