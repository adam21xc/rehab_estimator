import { paintBot, type BotRow } from './bots';

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

export type Station = {
	id: string;
	label: string;
	placeholder: boolean;
	seat: Point;
	desk: Rect;
};

export type Node = { id: string; x: number; y: number };

export type OfficePlan = {
	id: 'wide' | 'narrow';
	width: number;
	height: number;
	building: Rect;
	jarvisRoom: Rect;
	door: { x: number; w: number; wallY: number };
	lounge: Rect;
	hall: Rect;
	couch: Rect;
	couchSlots: Point[];
	coffee: Rect;
	plant: Point;
	cabinet: Rect | null;
	cooler: Rect | null;
	stations: Station[];
	jarvisVisitors: Point[];
	nodes: Node[];
	neighbors: Record<string, string[]>;
};

export type Pose = 'sit' | 'lie' | 'stand' | 'walk';

export type Actor = {
	id: string;
	x: number;
	y: number;
	path: Point[];
	pose: Pose;
	face: 1 | -1;
	goalKey: string;
};

export type Goal = {
	x: number;
	y: number;
	pose: 'sit' | 'lie' | 'stand';
	face: 1 | -1;
};

export const WALK_SPEED = 165;

const WIDE = buildWide();
const NARROW = buildNarrow();

export function officePlan(mode: 'wide' | 'narrow'): OfficePlan {
	return mode === 'narrow' ? NARROW : WIDE;
}

export function goalFor(bot: BotRow, bots: BotRow[], plan: OfficePlan): Goal {
	if (bot.talking_to) {
		const spot = visitorSpot(plan, bot, bots);
		return { x: spot.x, y: spot.y, pose: 'stand', face: spot.face };
	}
	if (bot.status === 'idle') {
		const slot = couchSlot(plan, bot, bots);
		return { x: slot.x, y: slot.y, pose: 'lie', face: 1 };
	}
	const station = plan.stations.find((item) => item.id === bot.bot_id);
	if (!station) {
		const extra = extraIndex(plan, bot, bots);
		return {
			x: plan.hall.x + 48 + extra * 36,
			y: plan.hall.y + plan.hall.h / 2,
			pose: 'stand',
			face: 1
		};
	}
	return { x: station.seat.x, y: station.seat.y, pose: 'sit', face: 1 };
}

export function actorsAtGoals(bots: BotRow[], plan: OfficePlan): Actor[] {
	return stepActors([], bots, plan, 0, true);
}

export function stepActors(
	actors: Actor[],
	bots: BotRow[],
	plan: OfficePlan,
	dt: number,
	snap: boolean
): Actor[] {
	const byId = new Map(actors.map((actor) => [actor.id, actor]));
	return bots.map((bot) => {
		const goal = goalFor(bot, bots, plan);
		const goalKey = `${goal.pose}:${Math.round(goal.x)}:${Math.round(goal.y)}`;
		const prev = byId.get(bot.bot_id);
		if (!prev || snap) {
			return {
				id: bot.bot_id,
				x: goal.x,
				y: goal.y,
				path: [],
				pose: goal.pose,
				face: goal.face,
				goalKey
			};
		}
		let path = prev.path;
		if (prev.goalKey !== goalKey) path = route(plan, { x: prev.x, y: prev.y }, goal).slice(1);
		const moved = advance({ x: prev.x, y: prev.y, path }, dt);
		const walking = moved.path.length > 0;
		return {
			id: bot.bot_id,
			x: walking ? moved.x : goal.x,
			y: walking ? moved.y : goal.y,
			path: moved.path,
			pose: walking ? 'walk' : goal.pose,
			face: walking ? facing(moved, prev.face) : goal.face,
			goalKey
		};
	});
}

export function arrive(
	actors: Actor[],
	bots: BotRow[],
	plan: OfficePlan,
	maxSeconds = 30
): Actor[] {
	let current = actors;
	const steps = Math.ceil(maxSeconds / 0.05);
	for (let i = 0; i < steps; i += 1) {
		current = stepActors(current, bots, plan, 0.05, false);
		if (current.every((actor) => actor.path.length === 0)) break;
	}
	return current;
}

export function route(plan: OfficePlan, from: Point, to: Point): Point[] {
	const start = nearest(plan.nodes, from);
	const end = nearest(plan.nodes, to);
	const chain = bfs(plan, start.id, end.id);
	return dedupe([from, ...chain.map((node) => ({ x: node.x, y: node.y })), to]);
}

export function hitsWall(plan: OfficePlan, point: Point): boolean {
	const pad = 5;
	const room = plan.jarvisRoom;
	const right = room.x + room.w;
	const onEast =
		Math.abs(point.x - right) <= pad && point.y >= room.y - pad && point.y <= plan.door.wallY + pad;
	const onSouth =
		Math.abs(point.y - plan.door.wallY) <= pad && point.x >= room.x - pad && point.x <= right + pad;
	const inDoor = point.x >= plan.door.x + 2 && point.x <= plan.door.x + plan.door.w - 2;
	return onEast || (onSouth && !inDoor);
}

export function samplePath(path: Point[], step = 4): Point[] {
	const points: Point[] = [];
	for (let i = 0; i < path.length - 1; i += 1) {
		const a = path[i];
		const b = path[i + 1];
		const dist = Math.hypot(b.x - a.x, b.y - a.y);
		const n = Math.max(1, Math.ceil(dist / step));
		for (let s = 0; s <= n; s += 1) {
			const t = s / n;
			points.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
		}
	}
	if (!path.length) return points;
	return points.length ? points : [path[0]];
}

export type Bubble = 'zzz' | 'hourglass' | 'ellipsis' | 'speech' | null;

export type Zzz = { x: number; y: number; opacity: number; size: number };

export type Sprite = {
	id: string;
	x: number;
	y: number;
	rotation: number;
	face: 1 | -1;
	breath: number;
	fill: string;
	plate: string;
	eye: string;
	stroke: string;
	eyeScale: number;
	pose: Pose;
	bubble: Bubble;
	typing: boolean;
	hand: number;
	step: number;
	zzz: Zzz[];
	hourglass: number;
	dots: number;
};

export function spriteFor(actor: Actor, bot: BotRow, now: number, reduced: boolean): Sprite {
	const paint = paintBot(bot.color);
	const lying = actor.pose === 'lie';
	const typing = actor.pose === 'sit' && bot.status === 'active' && !bot.talking_to;
	const bob = reduced
		? 0
		: typing
			? Math.sin(now / 140) * 1.7
			: actor.pose === 'walk'
				? Math.sin(now / 80) * 1.3
				: 0;
	const phase = (now + hash(bot.bot_id) * 400) % 3600;
	const bubble: Bubble = speech(bot)
		? 'speech'
		: actor.pose === 'walk'
			? null
			: lying
				? 'zzz'
				: bot.status === 'blocked'
					? 'hourglass'
					: bot.status === 'waiting'
						? 'ellipsis'
						: null;
	const cycle = reduced ? 0 : (now % 1800) / 1800;
	return {
		id: bot.bot_id,
		x: actor.x,
		y: actor.y + bob,
		rotation: lying ? -76 : 0,
		face: lying ? 1 : actor.face,
		breath: lying && !reduced ? 1 + Math.sin(now / 560) * 0.035 : 1,
		fill: paint.fill,
		plate: paint.plate,
		eye: paint.eye,
		stroke: paint.stroke,
		eyeScale: !reduced && phase < 140 ? 0.12 : 1,
		pose: actor.pose,
		bubble,
		typing,
		hand: typing && !reduced ? Math.sin(now / 90) * 2.2 : 0,
		step: actor.pose === 'walk' && !reduced ? Math.sin(now / 80) * 3 : 0,
		zzz: zzzMarks(now, reduced),
		hourglass: cycle < 0.82 ? 0 : ((cycle - 0.82) / 0.18) * 180,
		dots: Math.floor(now / 320) % 4
	};
}

function speech(bot: BotRow): boolean {
	return !!bot.talking_to && !!bot.message?.trim();
}

function zzzMarks(now: number, reduced: boolean): Zzz[] {
	return [0, 1, 2].map((i) => {
		const t = ((now / 1000 + i * 0.45) % 1.8) / 1.8;
		return {
			x: 10 + i * 8,
			y: reduced ? -8 - i * 6 : -t * 20,
			opacity: reduced ? 0.75 : Math.sin(Math.PI * t),
			size: 12 + i * 3
		};
	});
}

function visitorSpot(plan: OfficePlan, bot: BotRow, bots: BotRow[]): Point & { face: 1 | -1 } {
	const target = bot.talking_to ?? '';
	const visitors = bots
		.filter((row) => row.talking_to === target)
		.map((row) => row.bot_id)
		.sort();
	const index = Math.max(0, visitors.indexOf(bot.bot_id));
	if (target === 'jarvis') {
		const spot = plan.jarvisVisitors[Math.min(index, plan.jarvisVisitors.length - 1)];
		const extra = Math.max(0, index - (plan.jarvisVisitors.length - 1));
		return { x: spot.x, y: spot.y + extra * 24, face: -1 };
	}
	const station = plan.stations.find((item) => item.id === target);
	if (!station) {
		return { x: plan.hall.x + plan.hall.w / 2, y: plan.hall.y + plan.hall.h / 2, face: 1 };
	}
	const face: 1 | -1 = station.seat.x > plan.width * 0.72 ? -1 : 1;
	return {
		x: station.seat.x + face * (34 + (index % 2) * 16),
		y: station.seat.y + Math.floor(index / 2) * 18,
		face: (face * -1) as 1 | -1
	};
}

function couchSlot(plan: OfficePlan, bot: BotRow, bots: BotRow[]): Point {
	const resting = bots
		.filter((row) => row.status === 'idle' && !row.talking_to)
		.map((row) => row.bot_id)
		.sort();
	const index = Math.max(0, resting.indexOf(bot.bot_id));
	const slot = plan.couchSlots[index];
	if (slot) return slot;
	const last = plan.couchSlots[plan.couchSlots.length - 1];
	return { x: last.x, y: last.y + (index - plan.couchSlots.length + 1) * 30 };
}

function extraIndex(plan: OfficePlan, bot: BotRow, bots: BotRow[]): number {
	return bots
		.filter((row) => !plan.stations.some((station) => station.id === row.bot_id))
		.map((row) => row.bot_id)
		.sort()
		.indexOf(bot.bot_id);
}

function advance(
	actor: { x: number; y: number; path: Point[] },
	dt: number
): {
	x: number;
	y: number;
	path: Point[];
} {
	let x = actor.x;
	let y = actor.y;
	const path = [...actor.path];
	let left = WALK_SPEED * Math.max(0, dt);
	while (left > 0 && path.length) {
		const next = path[0];
		const dx = next.x - x;
		const dy = next.y - y;
		const dist = Math.hypot(dx, dy);
		if (dist < 0.6) {
			x = next.x;
			y = next.y;
			path.shift();
			continue;
		}
		if (dist <= left) {
			x = next.x;
			y = next.y;
			left -= dist;
			path.shift();
		} else {
			x += (dx / dist) * left;
			y += (dy / dist) * left;
			left = 0;
		}
	}
	return { x, y, path };
}

function facing(moved: { x: number; y: number; path: Point[] }, prev: 1 | -1): 1 | -1 {
	const next = moved.path[0];
	if (!next || Math.abs(next.x - moved.x) < 2) return prev;
	return next.x >= moved.x ? 1 : -1;
}

function nearest(nodes: Node[], point: Point): Node {
	let best = nodes[0];
	let bestD = Infinity;
	for (const node of nodes) {
		const d = (node.x - point.x) ** 2 + (node.y - point.y) ** 2;
		if (d < bestD) {
			best = node;
			bestD = d;
		}
	}
	return best;
}

function bfs(plan: OfficePlan, start: string, end: string): Node[] {
	const byId = new Map(plan.nodes.map((node) => [node.id, node]));
	if (start === end) return [byId.get(start)!];
	const prev = new Map<string, string | null>();
	const queue = [start];
	prev.set(start, null);
	while (queue.length) {
		const current = queue.shift()!;
		if (current === end) break;
		for (const next of plan.neighbors[current] ?? []) {
			if (!prev.has(next)) {
				prev.set(next, current);
				queue.push(next);
			}
		}
	}
	if (!prev.has(end)) return [byId.get(start)!, byId.get(end)!];
	const chain: string[] = [];
	let cursor: string | null = end;
	while (cursor) {
		chain.push(cursor);
		cursor = prev.get(cursor) ?? null;
	}
	chain.reverse();
	return chain.map((id) => byId.get(id)!);
}

function dedupe(points: Point[]): Point[] {
	const out: Point[] = [];
	for (const point of points) {
		const prev = out[out.length - 1];
		if (!prev || Math.hypot(point.x - prev.x, point.y - prev.y) > 0.5) out.push(point);
	}
	return out;
}

function hash(id: string): number {
	return [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function buildWide(): OfficePlan {
	const g = graph();
	const hallY = 300;
	const aisleX = 30;
	const lowerY = 526;
	const couchY = 86;
	const couchXs = [400, 472, 544, 616, 688];
	const front = [
		['lead-scout', 132],
		['seller-followup', 340],
		['deal-analyzer', 548],
		['research-assistant', 756]
	] as const;
	g.add('door-in', 156, 226);
	g.add('jarvis-seat', 128, 178);
	g.add('visit-0', 236, 148);
	g.add('visit-1', 250, 196);
	g.link('jarvis-seat', 'door-in');
	g.link('visit-0', 'door-in');
	g.link('visit-1', 'door-in');
	const hallXs = [aisleX, 156, ...front.map(([, x]) => x), ...couchXs];
	chain(
		g,
		[...new Set(hallXs)].sort((a, b) => a - b).map((x) => [`hall-${x}`, x, hallY])
	);
	g.link('door-in', 'hall-156');
	for (const [id, x] of front) g.add(`seat-${id}`, x, 346);
	for (const [id, x] of front) g.link(`seat-${id}`, `hall-${x}`);
	g.add('aisle-lower', aisleX, lowerY);
	g.add('aisle-front', aisleX, 346);
	g.link('aisle-lower', 'aisle-front');
	g.link('aisle-front', `hall-${aisleX}`);
	g.add('seat-dispo', 340, lowerY);
	g.add('seat-closing', 548, lowerY);
	g.link('seat-dispo', 'aisle-lower');
	g.link('seat-closing', 'seat-dispo');
	couchXs.forEach((x, i) => {
		g.add(`couch-${i}`, x, couchY);
		g.link(`couch-${i}`, `hall-${x}`);
	});
	return {
		id: 'wide',
		width: 1000,
		height: 640,
		building: { x: 16, y: 16, w: 968, h: 608 },
		jarvisRoom: { x: 44, y: 28, w: 268, h: 232 },
		door: { x: 124, w: 64, wallY: 260 },
		lounge: { x: 312, y: 28, w: 656, h: 232 },
		hall: { x: 28, y: 268, w: 944, h: 64 },
		couch: { x: 368, y: 52, w: 360, h: 70 },
		couchSlots: couchXs.map((x) => ({ x, y: couchY })),
		coffee: { x: 790, y: 150, w: 124, h: 48 },
		plant: { x: 912, y: 58 },
		cabinet: { x: 36, y: 548, w: 42, h: 58 },
		cooler: { x: 908, y: 530, w: 34, h: 64 },
		jarvisVisitors: [
			{ x: 236, y: 148 },
			{ x: 250, y: 196 }
		],
		stations: [
			station('jarvis', 'Jarvis', false, { x: 128, y: 178 }, { x: 62, y: 74, w: 120, h: 52 }),
			station(
				'lead-scout',
				'Lead Scout',
				false,
				{ x: 132, y: 346 },
				{ x: 52, y: 374, w: 160, h: 64 }
			),
			station(
				'seller-followup',
				'Seller Follow-up',
				false,
				{ x: 340, y: 346 },
				{ x: 260, y: 374, w: 160, h: 64 }
			),
			station(
				'deal-analyzer',
				'Deal Analyzer',
				false,
				{ x: 548, y: 346 },
				{ x: 468, y: 374, w: 160, h: 64 }
			),
			station(
				'research-assistant',
				'Research Assistant',
				false,
				{ x: 756, y: 346 },
				{ x: 664, y: 374, w: 176, h: 64 }
			),
			station('dispo', 'Dispo', true, { x: 340, y: lowerY }, { x: 260, y: 534, w: 160, h: 64 }),
			station('closing', 'Closing', true, { x: 548, y: lowerY }, { x: 468, y: 534, w: 160, h: 64 })
		],
		nodes: g.nodes,
		neighbors: g.neighbors
	};
}

function buildNarrow(): OfficePlan {
	const g = graph();
	const spineX = 200;
	const seatYs = [528, 678, 828];
	const leftX = 96;
	const rightX = 300;
	const couchY = 276;
	const couchXs = [72, 132, 200, 268, 328];
	g.add('jarvis-seat', 108, 142);
	g.add('door-in', 200, 156);
	g.add('visit-0', 292, 92);
	g.add('visit-1', 292, 136);
	g.link('jarvis-seat', 'door-in');
	g.link('visit-0', 'door-in');
	g.link('visit-1', 'door-in');
	g.add('hall-a', spineX, 208);
	g.link('door-in', 'hall-a');
	g.add('spine-couch', spineX, couchY);
	g.add('hall-b', spineX, 456);
	g.link('hall-a', 'spine-couch');
	g.link('spine-couch', 'hall-b');
	couchXs.forEach((x, i) => g.add(`couch-${i}`, x, couchY));
	for (let i = 0; i < couchXs.length - 1; i += 1) g.link(`couch-${i}`, `couch-${i + 1}`);
	g.link('couch-2', 'spine-couch');
	const ids = [
		['lead-scout', 'seller-followup'],
		['deal-analyzer', 'research-assistant'],
		['dispo', 'closing']
	] as const;
	let previous = 'hall-b';
	ids.forEach((pair, row) => {
		const y = seatYs[row];
		const spine = `spine-${row}`;
		g.add(spine, spineX, y);
		g.link(previous, spine);
		g.add(`seat-${pair[0]}`, leftX, y);
		g.add(`seat-${pair[1]}`, rightX, y);
		g.link(`seat-${pair[0]}`, spine);
		g.link(`seat-${pair[1]}`, spine);
		previous = spine;
	});
	const desk = (x: number, y: number): Rect => ({ x, y, w: 156, h: 64 });
	return {
		id: 'narrow',
		width: 400,
		height: 980,
		building: { x: 10, y: 10, w: 380, h: 960 },
		jarvisRoom: { x: 16, y: 16, w: 368, h: 168 },
		door: { x: 168, w: 64, wallY: 184 },
		lounge: { x: 16, y: 230, w: 368, h: 200 },
		hall: { x: 16, y: 430, w: 368, h: 52 },
		couch: { x: 36, y: 246, w: 328, h: 58 },
		couchSlots: couchXs.map((x) => ({ x, y: couchY })),
		coffee: { x: 28, y: 336, w: 108, h: 40 },
		plant: { x: 336, y: 328 },
		cabinet: null,
		cooler: null,
		jarvisVisitors: [
			{ x: 292, y: 92 },
			{ x: 292, y: 136 }
		],
		stations: [
			station('jarvis', 'Jarvis', false, { x: 108, y: 142 }, { x: 48, y: 46, w: 118, h: 50 }),
			station('lead-scout', 'Lead Scout', false, { x: leftX, y: seatYs[0] }, desk(20, 536)),
			station(
				'seller-followup',
				'Seller Follow-up',
				false,
				{ x: rightX, y: seatYs[0] },
				desk(224, 536)
			),
			station('deal-analyzer', 'Deal Analyzer', false, { x: leftX, y: seatYs[1] }, desk(20, 686)),
			station(
				'research-assistant',
				'Research Assistant',
				false,
				{ x: rightX, y: seatYs[1] },
				desk(224, 686)
			),
			station('dispo', 'Dispo', true, { x: leftX, y: seatYs[2] }, desk(20, 836)),
			station('closing', 'Closing', true, { x: rightX, y: seatYs[2] }, desk(224, 836))
		],
		nodes: g.nodes,
		neighbors: g.neighbors
	};
}

function station(
	id: string,
	label: string,
	placeholder: boolean,
	seat: Point,
	desk: Rect
): Station {
	return { id, label, placeholder, seat, desk };
}

function chain(g: Graph, points: (readonly [string, number, number])[]): void {
	points.forEach(([id, x, y], index) => {
		g.add(id, x, y);
		if (index > 0) g.link(points[index - 1][0], id);
	});
}

type Graph = {
	nodes: Node[];
	neighbors: Record<string, string[]>;
	add: (id: string, x: number, y: number) => void;
	link: (a: string, b: string) => void;
};

function graph(): Graph {
	const nodes: Node[] = [];
	const neighbors: Record<string, string[]> = {};
	return {
		nodes,
		neighbors,
		add(id, x, y) {
			if (nodes.some((node) => node.id === id)) throw new Error(`duplicate node ${id}`);
			nodes.push({ id, x, y });
			neighbors[id] = [];
		},
		link(a, b) {
			if (a === b) return;
			if (!neighbors[a].includes(b)) neighbors[a].push(b);
			if (!neighbors[b].includes(a)) neighbors[b].push(a);
		}
	};
}
