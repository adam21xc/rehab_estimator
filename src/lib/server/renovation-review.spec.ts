import { describe, it, expect } from 'vitest';
import { imageGenerationPending, manualReview, reviewPair } from './renovation-review';
const id = 'prop_12';
const facts = {
	full_address: '12 Main St',
	renovation_image_pair: {
		before_path: 'renovation/prop_12/before.jpg',
		renovated_path: 'renovation/prop_12/after.jpg'
	}
};
describe('property image reviews', () => {
	it('binds approval to an exact pair and resets after replacement', () => {
		const first = reviewPair(id, facts)!;
		const reviewed = {
			...facts,
			renovation_image_review: { version: first.version, status: 'approved', note: 'Looks right' }
		};
		expect(reviewPair(id, reviewed)?.status).toBe('approved');
		expect(
			reviewPair(id, {
				...reviewed,
				renovation_image_pair: {
					...facts.renovation_image_pair,
					renovated_path: 'renovation/prop_12/new.jpg'
				}
			})?.status
		).toBe('pending');
	});
	it('rejects another property image or a path traversal', () => {
		expect(
			reviewPair(id, {
				renovation_image_pair: {
					...facts.renovation_image_pair,
					before_path: 'renovation/prop_13/before.jpg'
				}
			})
		).toBeNull();
		expect(
			reviewPair(id, {
				renovation_image_pair: {
					...facts.renovation_image_pair,
					before_path: 'renovation/prop_12/../secret.jpg'
				}
			})
		).toBeNull();
	});
	it('includes saved pilot images and unresolved identity holds', () => {
		const pair = reviewPair(id, {
			renovation_pilot: {
				source_path: facts.renovation_image_pair.before_path,
				output_path: facts.renovation_image_pair.renovated_path
			},
			renovation_batch: { status: 'needs_review', reason: 'Wrong house number' }
		});
		expect(pair?.status).toBe('pending');
		expect(pair?.hold).toBe('Wrong house number');
	});
});

describe('properties that need Adam’s review', () => {
	const id = 'prop_12';
	const pair = {
		before_path: 'renovation/prop_12/before.jpg',
		renovated_path: 'renovation/prop_12/after.jpg'
	};
	function reviewed(
		status: string,
		note: string,
		extra: Record<string, unknown> = {}
	): Record<string, unknown> {
		const facts = { full_address: '12 Main St', renovation_image_pair: pair, ...extra };
		return {
			...facts,
			renovation_image_review: { version: reviewPair(id, facts)!.version, status, note }
		};
	}
	it('keeps flagged renderings, including NOT USABLE notes', () => {
		const flagged = manualReview(id, reviewed('flagged', 'Truck blocks the front door.'));
		expect(flagged?.kind).toBe('flagged');
		expect(flagged?.reasons).toEqual(['Truck blocks the front door.']);
		const unusable = manualReview(
			id,
			reviewed('flagged', 'NOT USABLE: No usable front photo after an extensive search.')
		);
		expect(unusable?.kind).toBe('not_usable');
		expect(unusable?.hasImages).toBe(true);
	});
	it('includes a pending pair and a batch hold that has no rendering yet', () => {
		expect(
			manualReview(id, { full_address: '12 Main St', renovation_image_pair: pair })?.kind
		).toBe('pending');
		const held = manualReview('prop_4', {
			full_address: '4 Held Ave',
			renovation_batch: { status: 'needs_review', reason: 'Source unavailable or invalid JPEG' }
		});
		expect(held).toMatchObject({
			kind: 'held',
			hasImages: false,
			reasons: ['Source unavailable or invalid JPEG']
		});
	});
	it('does not treat a finished rendering as still waiting on image generation', () => {
		expect(
			imageGenerationPending({
				renovation_dashboard_trial: {
					status: 'needs_review',
					output_path: 'renovation/prop_12/after.jpg'
				}
			})
		).toBe(false);
	});
	it('keeps a failed generation that was held, and hides a property only waiting on an image', () => {
		const failed = {
			full_address: '5 Maren Dr',
			renovation_dashboard_trial: { status: 'generating' },
			renovation_batch: {
				status: 'needs_review',
				reason:
					'Provider processing error; no output file found. Held to avoid automatic regeneration.'
			}
		};
		expect(imageGenerationPending(failed)).toBe(true);
		expect(manualReview('prop_5', failed)?.reasons[0]).toMatch(
			/Held to avoid automatic regeneration/
		);
		const waiting = {
			full_address: '9 Queue St',
			renovation_dashboard_trial: {
				status: 'generating',
				source_path: 'renovation/prop_9/before.jpg'
			},
			renovation_batch: { status: 'queued' }
		};
		expect(imageGenerationPending(waiting)).toBe(true);
		expect(manualReview('prop_9', waiting)).toBeNull();
	});
	it('does not drop an existing flag just because another image is still generating', () => {
		const facts = reviewed('flagged', 'Cars block the house.', {
			renovation_dashboard_trial: { status: 'generating' }
		});
		expect(manualReview(id, facts)?.status).toBe('flagged');
	});
	it('leaves out approved pairs, archived pairs, and source notes already covered by an approval', () => {
		expect(manualReview(id, reviewed('approved', 'Looks right'))).toBeNull();
		expect(
			manualReview(
				id,
				reviewed('approved', 'Looks right', {
					renovation_source_review: {
						status: 'needs_review',
						note: 'Hold: trees conceal most of the facade.'
					}
				})
			)
		).toBeNull();
		expect(
			manualReview(
				id,
				reviewed('archived', 'NOT USABLE: No usable front photo after an extensive search.', {
					renovation_batch: { status: 'needs_review', reason: 'No better source' }
				})
			)
		).toBeNull();
	});
	it('still lists an approved pair when the property hold is unresolved', () => {
		const item = manualReview(
			id,
			reviewed('approved', 'Images look right', {
				renovation_batch: { status: 'needs_review', reason: 'Wrong house number' }
			})
		);
		expect(item?.reasons).toContain('Wrong house number');
		expect(item?.hasImages).toBe(true);
	});
});

it('keeps an archive out of the queue after replacement until explicitly restored', () => {
	const version = reviewPair(id, facts)!.version;
	const archived = {
		...facts,
		renovation_image_review: { version, status: 'archived', note: 'No usable photo' }
	};
	const replacement = {
		...archived,
		renovation_image_pair: {
			...facts.renovation_image_pair,
			renovated_path: 'renovation/prop_12/new.jpg'
		}
	};
	expect(reviewPair(id, replacement)?.status).toBe('archived');
	expect(reviewPair(id, replacement)?.note).toBe('No usable photo');
	expect(
		reviewPair(id, {
			...replacement,
			renovation_image_review: { version: reviewPair(id, replacement)!.version, status: 'pending' }
		})?.status
	).toBe('pending');
});
