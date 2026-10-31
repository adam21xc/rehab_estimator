import { createHash } from 'node:crypto';
export function reviewPair(id: string, facts: Record<string, any>) {
	const saved = facts.renovation_image_pair;
	const trial = [facts.renovation_dashboard_trial, facts.renovation_pilot].find(
		(x) => x?.output_path
	);
	const before = saved?.before_path || trial?.source_path;
	const after = saved?.renovated_path || trial?.output_path;
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
	const review = facts.renovation_image_review;
	// Archiving is a deliberate queue decision; replacing images must not silently restore it.
	const current = review?.status === 'archived' || review?.version === version ? review : null;
	const hold =
		facts.renovation_batch?.status === 'needs_review' ? facts.renovation_batch.reason : null;
	return {
		id,
		address: facts.full_address || id,
		before,
		after,
		version,
		status: current?.status || 'pending',
		note: current?.note || '',
		reviewedAt: current?.reviewed_at || null,
		hold
	};
}
