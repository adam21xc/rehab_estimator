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

export function officePlan(
	mode: 'wide' | 'narrow',
	bots: { bot_id: string; name: string }[] = []
): OfficePlan {
	return mode === 'narrow' ? buildNarrow(bots) : buildWide(bots);
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

const WIDE_COLS = [
	{ seatX: 132, deskX: 52, deskW: 160 },
	{ seatX: 340, deskX: 260, deskW: 160 },
	{ seatX: 548, deskX: 468, deskW: 160 },
	{ seatX: 756, deskX: 664, deskW: 176 }
] as const;

const DESK_ORDER = [
	'lead-scout',
	'seller-followup',
	'deal-analyzer',
	'research-assistant',
	'rendering-reviewer',
	'marketing-designer'
];

type NamedBot = { bot_id: string; name: string };

function orderedFloorBots(bots: NamedBot[]): NamedBot[] {
	return bots
		.filter((bot) => bot.bot_id !== 'jarvis' && bot.bot_id !== 'dispo' && bot.bot_id !== 'closing')
		.sort((a, b) => {
			const ai = DESK_ORDER.indexOf(a.bot_id);
			const bi = DESK_ORDER.indexOf(b.bot_id);
			if (ai === -1 && bi === -1)
				return a.name.localeCompare(b.name) || a.bot_id.localeCompare(b.bot_id);
			if (ai === -1) return 1;
			if (bi === -1) return -1;
			return ai - bi;
		});
}

function named(bots: NamedBot[], id: string, fallback: string): string {
	return bots.find((bot) => bot.bot_id === id)?.name || fallback;
}

function wideSeatY(row: number) {
	return row === 0 ? 346 : 526 + (row - 1) * 180;
}

function wideDeskY(row: number) {
	return row === 0 ? 374 : 534 + (row - 1) * 180;
}

function wideOpenSlots(count: number): { row: number; col: number }[] {
	const slots: { row: number; col: number }[] = [];
	let row = 0;
	while (slots.length < count) {
		const cols = row === 1 ? [0, 3] : [0, 1, 2, 3];
		for (const col of cols) {
			slots.push({ row, col });
			if (slots.length >= count) break;
		}
		row += 1;
	}
	return slots;
}

function buildWide(bots: NamedBot[]): OfficePlan {
	const g = graph();
	const hallY = 300;
	const aisleX = 30;
	const couchY = 86;
	const couchXs = [380, 428, 476, 524, 572, 620, 668, 716];
	const open = orderedFloorBots(bots);
	const slots = wideOpenSlots(open.length);
	const maxRow = Math.max(1, ...slots.map((slot) => slot.row), 1);
	g.add('door-in', 156, 226);
	g.add('jarvis-seat', 128, 178);
	g.add('visit-0', 236, 148);
	g.add('visit-1', 250, 196);
	g.link('jarvis-seat', 'door-in');
	g.link('visit-0', 'door-in');
	g.link('visit-1', 'door-in');
	const placed = [
		...open.map((bot, index) => ({ bot, ...slots[index], reserved: false })),
		{
			bot: { bot_id: 'dispo', name: named(bots, 'dispo', 'Dispo') },
			row: 1,
			col: 1,
			reserved: true
		},
		{
			bot: { bot_id: 'closing', name: named(bots, 'closing', 'Closing') },
			row: 1,
			col: 2,
			reserved: true
		}
	];
	const hallXs = [aisleX, 156, ...WIDE_COLS.map((col) => col.seatX), ...couchXs];
	chain(
		g,
		[...new Set(hallXs)].sort((a, b) => a - b).map((x) => [`hall-${x}`, x, hallY] as const)
	);
	g.link('door-in', 'hall-156');
	const lowerRows = [
		...new Set(placed.filter((item) => item.row > 0).map((item) => item.row))
	].sort((a, b) => a - b);
	let aislePrev = `hall-${aisleX}`;
	g.add('aisle-front', aisleX, wideSeatY(0));
	g.link(aislePrev, 'aisle-front');
	aislePrev = 'aisle-front';
	for (const row of lowerRows) {
		const aisle = `aisle-${row}`;
		g.add(aisle, aisleX, wideSeatY(row));
		g.link(aislePrev, aisle);
		aislePrev = aisle;
	}
	for (const item of placed) {
		const col = WIDE_COLS[item.col];
		g.add(`seat-${item.bot.bot_id}`, col.seatX, wideSeatY(item.row));
		if (item.row === 0) g.link(`seat-${item.bot.bot_id}`, `hall-${col.seatX}`);
		else g.link(`seat-${item.bot.bot_id}`, `aisle-${item.row}`);
	}
	couchXs.forEach((x, i) => {
		g.add(`couch-${i}`, x, couchY);
		g.link(`couch-${i}`, `hall-${x}`);
	});
	const height = Math.max(640, wideDeskY(maxRow) + 120);
	const stations = [
		station(
			'jarvis',
			named(bots, 'jarvis', 'Jarvis'),
			false,
			{ x: 128, y: 178 },
			{
				x: 62,
				y: 74,
				w: 120,
				h: 52
			}
		),
		...placed.map((item) => {
			const col = WIDE_COLS[item.col];
			const hired = bots.some((bot) => bot.bot_id === item.bot.bot_id);
			return station(
				item.bot.bot_id,
				item.bot.name,
				item.reserved && !hired,
				{ x: col.seatX, y: wideSeatY(item.row) },
				{ x: col.deskX, y: wideDeskY(item.row), w: col.deskW, h: 64 }
			);
		})
	];
	return {
		id: 'wide',
		width: 1000,
		height,
		building: { x: 16, y: 16, w: 968, h: height - 32 },
		jarvisRoom: { x: 44, y: 28, w: 268, h: 232 },
		door: { x: 124, w: 64, wallY: 260 },
		lounge: { x: 312, y: 28, w: 656, h: 232 },
		hall: { x: 28, y: 268, w: 944, h: 64 },
		couch: { x: 360, y: 48, w: 400, h: 74 },
		couchSlots: couchXs.map((x) => ({ x, y: couchY })),
		coffee: { x: 820, y: 158, w: 110, h: 46 },
		plant: { x: 912, y: 58 },
		cabinet: null,
		cooler: { x: 908, y: 530, w: 34, h: 64 },
		jarvisVisitors: [
			{ x: 236, y: 148 },
			{ x: 250, y: 196 }
		],
		stations,
		nodes: g.nodes,
		neighbors: g.neighbors
	};
}

function buildNarrow(bots: NamedBot[]): OfficePlan {
	const g = graph();
	const spineX = 200;
	const leftX = 96;
	const rightX = 300;
	const couchY = 276;
	const couchXs = [48, 100, 152, 200, 256, 312];
	const open = orderedFloorBots(bots);
	const rows: NamedBot[][] = [];
	for (let i = 0; i < open.length; i += 2) rows.push(open.slice(i, i + 2));
	const reserved: NamedBot[] = [
		{ bot_id: 'dispo', name: named(bots, 'dispo', 'Dispo') },
		{ bot_id: 'closing', name: named(bots, 'closing', 'Closing') }
	];
	rows.push(reserved);
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
	g.link('couch-3', 'spine-couch');
	let previous = 'hall-b';
	const seatY = (row: number) => 520 + row * 140;
	const deskY = (row: number) => seatY(row) + 10;
	rows.forEach((pair, row) => {
		const y = seatY(row);
		const spine = `spine-${row}`;
		g.add(spine, spineX, y);
		g.link(previous, spine);
		pair.forEach((bot, side) => {
			g.add(`seat-${bot.bot_id}`, side === 0 ? leftX : rightX, y);
			g.link(`seat-${bot.bot_id}`, spine);
		});
		previous = spine;
	});
	const lastDesk = deskY(rows.length - 1) + 80;
	const height = Math.max(980, lastDesk + 40);
	const desk = (x: number, y: number): Rect => ({ x, y, w: 156, h: 64 });
	const stations = [
		station(
			'jarvis',
			named(bots, 'jarvis', 'Jarvis'),
			false,
			{ x: 108, y: 142 },
			{
				x: 48,
				y: 46,
				w: 118,
				h: 50
			}
		),
		...rows.flatMap((pair, row) =>
			pair.map((bot, side) => {
				const hired = bots.some((item) => item.bot_id === bot.bot_id);
				const reserved = bot.bot_id === 'dispo' || bot.bot_id === 'closing';
				return station(
					bot.bot_id,
					bot.name,
					reserved && !hired,
					{ x: side === 0 ? leftX : rightX, y: seatY(row) },
					desk(side === 0 ? 20 : 224, deskY(row))
				);
			})
		)
	];
	return {
		id: 'narrow',
		width: 400,
		height,
		building: { x: 10, y: 10, w: 380, h: height - 20 },
		jarvisRoom: { x: 16, y: 16, w: 368, h: 168 },
		door: { x: 168, w: 64, wallY: 184 },
		lounge: { x: 16, y: 230, w: 368, h: 200 },
		hall: { x: 16, y: 430, w: 368, h: 52 },
		couch: { x: 28, y: 246, w: 340, h: 58 },
		couchSlots: couchXs.map((x) => ({ x, y: couchY })),
		coffee: { x: 28, y: 336, w: 108, h: 40 },
		plant: { x: 336, y: 328 },
		cabinet: null,
		cooler: null,
		jarvisVisitors: [
			{ x: 292, y: 92 },
			{ x: 292, y: 136 }
		],
		stations,
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
