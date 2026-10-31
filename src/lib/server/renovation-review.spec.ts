import { describe, it, expect } from 'vitest';
import { reviewPair } from './renovation-review';
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
