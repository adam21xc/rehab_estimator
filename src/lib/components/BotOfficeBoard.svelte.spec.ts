import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Board from './BotOfficeBoard.svelte';
import type { BotRow } from '$lib/office/bots';

const updated_at = '2026-10-30T14:55:00.000Z';
const now = Date.parse('2026-10-30T15:00:00.000Z');

const seeded: BotRow[] = [
	{
		bot_id: 'jarvis',
		name: 'Jarvis',
		color: '#111111',
		status: 'active',
		doing: null,
		talking_to: null,
		message: null,
		updated_at
	},
	{
		bot_id: 'lead-scout',
		name: 'Lead Scout',
		color: null,
		status: 'idle',
		doing: null,
		talking_to: null,
		message: null,
		updated_at
	},
	{
		bot_id: 'seller-followup',
		name: 'Seller Follow-up',
		color: null,
		status: 'blocked',
		doing: 'Needs Full Disk Access on Mac mini',
		talking_to: null,
		message: null,
		updated_at
	},
	{
		bot_id: 'deal-analyzer',
		name: 'Deal Analyzer',
		color: null,
		status: 'idle',
		doing: null,
		talking_to: null,
		message: null,
		updated_at
	},
	{
		bot_id: 'research-assistant',
		name: 'Research Assistant',
		color: '#22C55E',
		status: 'idle',
		doing: null,
		talking_to: null,
		message: null,
		updated_at
	}
];

describe('bot office board', () => {
	it('shows the seeded roster, couch and desks, and who is waiting', async () => {
		const screen = await render(Board, { bots: seeded, phase: 'ready', link: 'live', now });
		const wide = screen.container.querySelector('.floor-wide');
		const pose = (id: string) =>
			wide?.querySelector(`[data-bot="${id}"]`)?.getAttribute('data-pose');
		expect(pose('jarvis')).toBe('sit');
		expect(pose('lead-scout')).toBe('lie');
		expect(pose('seller-followup')).toBe('sit');
		expect(wide?.textContent).toContain('Not hired yet');
		await expect.element(page.getByRole('heading', { name: 'Waiting on Adam' })).toBeVisible();
		await expect
			.element(page.getByText('Needs Full Disk Access on Mac mini').first())
			.toBeVisible();
		await expect.element(page.getByText('5 minutes ago').first()).toBeVisible();
	});
});
