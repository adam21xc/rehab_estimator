import { createHash } from 'node:crypto';

type Facts = Record<string, unknown>;

function record(value: unknown): Facts | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	return value as Facts;
}

function text(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

export function reviewPair(id: string, facts: Facts) {
	const saved = record(facts.renovation_image_pair);
	const trial = [facts.renovation_dashboard_trial, facts.renovation_pilot]
		.map(record)
		.find((row) => text(row?.output_path));
	const before = text(saved?.before_path) || text(trial?.source_path);
	const after = text(saved?.renovated_path) || text(trial?.output_path);
	if (
		!before ||
		!after ||
		![before, after].every(
			(p) => typeof p === 'string' && p.startsWith(`renovation/${id}/`) && !p.includes('..')
		)
	)
		return null;
	const version = createHash('sha256')
		.update(JSON.stringify([before, after]))
		.digest('hex');
	const review = record(facts.renovation_image_review);
	// Archiving is a deliberate queue decision; replacing images must not silently restore it.
	const current =
		text(review?.status) === 'archived' || text(review?.version) === version ? review : null;
	const batch = record(facts.renovation_batch);
	const hold = text(batch?.status) === 'needs_review' ? (text(batch?.reason) ?? null) : null;
	return {
		id,
		address: text(facts.full_address) || id,
		before,
		after,
		version,
		status: text(current?.status) || 'pending',
		note: text(current?.note) || '',
		reviewedAt: text(current?.reviewed_at) || null,
		hold
	};
}

const NOT_USABLE = /^\s*NOT USABLE\b/i;
const GENERATION_WAIT = new Set(['generating', 'processing', 'queued', 'pending']);

export type ManualReview = {
	id: string;
	address: string;
	reasons: string[];
	kind: 'not_usable' | 'flagged' | 'pending' | 'held';
	status: string;
	note: string;
	hold: string | null;
	reviewedAt: string | null;
	version: string | null;
	hasImages: boolean;
};

/**
 * A rehab image that has not been generated yet.
 * `renovation_dashboard_trial.status === 'needs_review'` is not this state:
 * that value is set once a rendering exists and is waiting on the image-review record.
 */
export function imageGenerationPending(facts: Facts): boolean {
	const rows = [facts.renovation_dashboard_trial, facts.renovation_pilot, facts.rehab_rendering];
	for (const value of rows) {
		const row = record(value);
		if (!row) continue;
		const status = text(row.status) || '';
		if (GENERATION_WAIT.has(status) && !text(row.output_path)) return true;
	}
	const batch = record(facts.renovation_batch);
	if (!batch) return false;
	const status = text(batch.status) || '';
	return (
		GENERATION_WAIT.has(status) &&
		!text(batch.renovatedPath) &&
		!text(batch.beforePath) &&
		!text(batch.output_path)
	);
}

function noteText(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function reviewKind(status: string, reasons: string[]): ManualReview['kind'] {
	if (reasons.some((reason) => NOT_USABLE.test(reason))) return 'not_usable';
	if (status === 'flagged') return 'flagged';
	if (status === 'pending') return 'pending';
	return 'held';
}

/**
 * Properties Adam still has to decide on.
 * Included: flagged or pending before/after pairs (including notes that start with
 * "NOT USABLE"), and a renovation_batch hold (`needs_review`), even when generation failed
 * and was held. Excluded: approved pairs, archived pairs, and properties whose only
 * outstanding item is that image generation has not finished. `renovation_source_review`
 * is not a queue of its own; an approved image review closes the property.
 */
export function manualReview(id: string, facts: Facts): ManualReview | null {
	const pair = reviewPair(id, facts);
	if (pair?.status === 'archived') return null;
	const reasons: string[] = [];
	if (pair?.status === 'flagged') reasons.push(noteText(pair.note) || 'Flagged for review.');
	else if (pair?.status === 'pending') {
		reasons.push('Before and after images are awaiting review.');
		const note = noteText(pair.note);
		if (note) reasons.push(note);
	}
	const batch = record(facts.renovation_batch);
	const batchHold =
		text(batch?.status) === 'needs_review'
			? noteText(batch?.reason) || 'Needs review before this property can move on.'
			: '';
	if (batchHold && !reasons.includes(batchHold)) reasons.push(batchHold);
	// No flag, pending pair, or hold. imageGenerationPending is that case, and it is not listed.
	if (!reasons.length) return null;
	const status = pair?.status || 'held';
	return {
		id,
		address: noteText(facts.full_address) || pair?.address || id,
		reasons,
		kind: reviewKind(status, reasons),
		status,
		note: pair?.note || '',
		hold: noteText(pair?.hold) || batchHold || null,
		reviewedAt: pair?.reviewedAt || null,
		version: pair?.version || null,
		hasImages: !!pair
	};
}
