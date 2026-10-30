import { describe, expect, it } from 'vitest';
import type { BotRow } from './bots';
import {
	actorsAtGoals,
	arrive,
	goalFor,
	hitsWall,
	officePlan,
	route,
	samplePath,
	stepActors
} from './floor';

const updated_at = '2026-10-30T15:00:00.000Z';

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

function pose(bots: BotRow[], id: string, mode: 'wide' | 'narrow' = 'wide') {
	return actorsAtGoals(bots, officePlan(mode)).find((actor) => actor.id === id);
}

describe('office floor', () => {
	it('seats active and blocked bots and lays idle bots on separate couch slots', () => {
		for (const mode of ['wide', 'narrow'] as const) {
			expect(pose(seeded, 'jarvis', mode)?.pose).toBe('sit');
			expect(pose(seeded, 'seller-followup', mode)?.pose).toBe('sit');
			expect(pose(seeded, 'lead-scout', mode)?.pose).toBe('lie');
			const idle = ['lead-scout', 'deal-analyzer', 'research-assistant'].map(
				(id) => pose(seeded, id, mode)!
			);
			const slots = new Set(idle.map((actor) => `${Math.round(actor.x)}:${Math.round(actor.y)}`));
			expect(slots.size).toBe(3);
		}
	});

	it('walks an idle bot back to their desk when they wake up', () => {
		const plan = officePlan('wide');
		const start = actorsAtGoals(seeded, plan);
		const woken = seeded.map((bot) =>
			bot.bot_id === 'lead-scout' ? { ...bot, status: 'active' as const } : bot
		);
		const moving = stepActors(start, woken, plan, 0.25, false).find(
			(actor) => actor.id === 'lead-scout'
		)!;
		expect(moving.pose).toBe('walk');
		expect(moving.path.length).toBeGreaterThan(0);
		const seated = arrive(start, woken, plan).find((actor) => actor.id === 'lead-scout')!;
		const desk = plan.stations.find((station) => station.id === 'lead-scout')!;
		expect(seated.pose).toBe('sit');
		expect(Math.hypot(seated.x - desk.seat.x, seated.y - desk.seat.y)).toBeLessThan(2);
	});

	it('walks a bot to Jarvis and back along the hallway without crossing walls', () => {
		for (const mode of ['wide', 'narrow'] as const) {
			const plan = officePlan(mode);
			const talking = seeded.map((bot) =>
				bot.bot_id === 'seller-followup'
					? { ...bot, status: 'active' as const, talking_to: 'jarvis', message: 'Need a decision.' }
					: bot
			);
			const start = actorsAtGoals(seeded, plan);
			const visiting = arrive(start, talking, plan).find(
				(actor) => actor.id === 'seller-followup'
			)!;
			const spot = goalFor(talking.find((bot) => bot.bot_id === 'seller-followup')!, talking, plan);
			expect(visiting.pose).toBe('stand');
			expect(Math.hypot(visiting.x - spot.x, visiting.y - spot.y)).toBeLessThan(2);
			expect(spot.y).toBeLessThan(plan.door.wallY);
			const home = arrive(arrive(start, talking, plan), seeded, plan).find(
				(actor) => actor.id === 'seller-followup'
			)!;
			const desk = plan.stations.find((station) => station.id === 'seller-followup')!;
			expect(home.pose).toBe('sit');
			expect(Math.hypot(home.x - desk.seat.x, home.y - desk.seat.y)).toBeLessThan(2);
			assertClear(plan, talking);
		}
	});
});

function assertClear(plan: ReturnType<typeof officePlan>, bots: BotRow[]) {
	const goals = bots.map((bot) => goalFor(bot, bots, plan));
	for (let i = 0; i < goals.length; i += 1) {
		for (let j = 0; j < goals.length; j += 1) {
			const path = route(plan, goals[i], goals[j]);
			const hit = samplePath(path).find((point) => hitsWall(plan, point));
			expect(hit, `${plan.id} ${bots[i].bot_id} -> ${bots[j].bot_id}`).toBeUndefined();
		}
	}
}
