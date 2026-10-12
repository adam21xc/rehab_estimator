import { it, expect, vi } from 'vitest';
import { geocodeNextBatch } from './map-geocoding';
it('blocks paid lookups before any network request, even for legacy batch callers', async () => {
	const request = vi.spyOn(globalThis, 'fetch');
	try {
		await expect(geocodeNextBatch(250)).rejects.toMatchObject({ status: 410 });
		expect(request).not.toHaveBeenCalled();
	} finally {
		request.mockRestore();
	}
});
