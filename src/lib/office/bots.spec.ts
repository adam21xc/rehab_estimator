import { describe, expect, it } from 'vitest';
import {
	NEUTRAL_BOT_COLOR,
	applyBotEvent,
	botColor,
	explainOfficeError,
	officeSummary,
	parseBotRow,
	relativeTime,
	waitingOnAdam,
	wrapMessage,
	type BotRow
} from './bots';

const now = Date.parse('2026-10-30T15:00:00.000Z');

function bot(partial: Partial<BotRow> & Pick<BotRow, 'bot_id' | 'name' | 'status'>): BotRow {
	return {
		color: null,
		doing: null,
		talking_to: null,
		message: null,
		updated_at: '2026-10-30T14:55:00.000Z',
		...partial
	};
}

describe('bot status rows', () => {
	it('parses a realtime or select row and drops invalid status', () => {
		expect(
			parseBotRow({
				bot_id: 'jarvis',
				name: 'Jarvis',
				color: '#111111',
				status: 'active',
				doing: '  ',
				talking_to: null,
				message: null,
				updated_at: '2026-10-30T15:00:00.000Z'
			})
		).toMatchObject({ bot_id: 'jarvis', doing: null, color: '#111111' });
		expect(
			parseBotRow({
				bot_id: 'x',
				name: 'X',
				status: 'asleep',
				updated_at: '2026-10-30T15:00:00.000Z'
			})
		).toBeNull();
	});

	it('falls back to neutral gray for a missing or unsafe color', () => {
		expect(botColor(null)).toBe(NEUTRAL_BOT_COLOR);
		expect(botColor('red; background: url(evil)')).toBe(NEUTRAL_BOT_COLOR);
		expect(botColor('#22C55E')).toBe('#22C55E');
	});

	it('applies insert, update, and delete events', () => {
		const seed = [bot({ bot_id: 'jarvis', name: 'Jarvis', status: 'active' })];
		const inserted = applyBotEvent(seed, {
			eventType: 'INSERT',
			new: {
				bot_id: 'lead-scout',
				name: 'Lead Scout',
				color: null,
				status: 'idle',
				doing: null,
				talking_to: null,
				message: null,
				updated_at: '2026-10-30T15:00:00.000Z'
			}
		});
		expect(inserted.map((row) => row.bot_id)).toEqual(['jarvis', 'lead-scout']);
		const updated = applyBotEvent(inserted, {
			eventType: 'UPDATE',
			new: { ...inserted[1], status: 'active', doing: 'Scanning leads' },
			old: { bot_id: 'lead-scout' }
		});
		expect(updated.find((row) => row.bot_id === 'lead-scout')?.status).toBe('active');
		const removed = applyBotEvent(updated, {
			eventType: 'DELETE',
			old: { bot_id: 'lead-scout' },
			new: {}
		});
		expect(removed.map((row) => row.bot_id)).toEqual(['jarvis']);
	});

	it('lists blocked and waiting bots for Adam', () => {
		const rows = [
			bot({ bot_id: 'jarvis', name: 'Jarvis', status: 'active' }),
			bot({
				bot_id: 'seller-followup',
				name: 'Seller Follow-up',
				status: 'blocked',
				doing: 'Needs access'
			}),
			bot({ bot_id: 'lead-scout', name: 'Lead Scout', status: 'waiting' })
		];
		expect(waitingOnAdam(rows).map((row) => row.bot_id)).toEqual(['lead-scout', 'seller-followup']);
	});

	it('formats relative update times', () => {
		expect(relativeTime('2026-10-30T14:55:00.000Z', now)).toBe('5 minutes ago');
		expect(relativeTime('2026-10-30T14:59:56.000Z', now)).toBe('just now');
		expect(relativeTime('not-a-date', now)).toBe('unknown time');
	});

	it('wraps speech and describes the room', () => {
		expect(wrapMessage('Bringing Jarvis a short note', 16, 2).length).toBeGreaterThan(0);
		const summary = officeSummary([
			bot({ bot_id: 'jarvis', name: 'Jarvis', status: 'active' }),
			bot({ bot_id: 'dispo', name: 'Dispo', status: 'idle' })
		]);
		expect(summary).toContain('Jarvis is active');
		expect(summary).toContain('Closing is not hired yet');
		expect(summary).not.toContain('Dispo and Closing');
	});

	it('points a missing-table error at the migration', () => {
		expect(
			explainOfficeError("Could not find the table 'public.bot_status' in the schema cache")
		).toContain('20261030160500_bot_status.sql');
	});
});
