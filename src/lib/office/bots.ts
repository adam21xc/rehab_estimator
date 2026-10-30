export const BOT_STATUSES = ['active', 'idle', 'blocked', 'waiting'] as const;
export type BotStatus = (typeof BOT_STATUSES)[number];

export type BotRow = {
	bot_id: string;
	name: string;
	color: string | null;
	status: BotStatus;
	doing: string | null;
	talking_to: string | null;
	message: string | null;
	updated_at: string;
};

export const NEUTRAL_BOT_COLOR = '#9aa3b5';

const ROSTER = [
	'jarvis',
	'lead-scout',
	'seller-followup',
	'deal-analyzer',
	'research-assistant',
	'dispo',
	'closing'
];

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function botColor(color: string | null | undefined): string {
	if (!color) return NEUTRAL_BOT_COLOR;
	const value = color.trim();
	return HEX.test(value) ? value : NEUTRAL_BOT_COLOR;
}

export function paintBot(color: string | null | undefined): {
	fill: string;
	plate: string;
	eye: string;
	stroke: string;
} {
	const fill = botColor(color);
	const dark = luminance(fill) < 0.45;
	return {
		fill,
		plate: dark ? '#2a3144' : '#f7f8fb',
		eye: dark ? '#d9f6ff' : '#1c2433',
		stroke: '#f7f4ef'
	};
}

export function parseBotRow(value: unknown): BotRow | null {
	if (!value || typeof value !== 'object') return null;
	const row = value as Record<string, unknown>;
	const bot_id = text(row.bot_id);
	const name = text(row.name);
	const status = text(row.status);
	const updated = time(row.updated_at);
	if (!bot_id || !name || !status || !updated) return null;
	if (!BOT_STATUSES.includes(status as BotStatus)) return null;
	return {
		bot_id,
		name,
		color: optionalText(row.color),
		status: status as BotStatus,
		doing: optionalText(row.doing),
		talking_to: optionalText(row.talking_to),
		message: optionalText(row.message),
		updated_at: updated
	};
}

export type BotChange = {
	eventType: string;
	new?: unknown;
	old?: unknown;
};

export function applyBotEvent(rows: BotRow[], change: BotChange): BotRow[] {
	const event = change.eventType.toUpperCase();
	if (event === 'DELETE') {
		const oldRow =
			change.old && typeof change.old === 'object' ? (change.old as Record<string, unknown>) : null;
		const id = oldRow ? text(oldRow.bot_id) : null;
		return id ? rows.filter((row) => row.bot_id !== id) : rows;
	}
	if (event !== 'INSERT' && event !== 'UPDATE') return rows;
	const next = parseBotRow(change.new);
	if (!next) return rows;
	const index = rows.findIndex((row) => row.bot_id === next.bot_id);
	if (index === -1) return [...rows, next];
	return rows.map((row, i) => (i === index ? next : row));
}

export function sortBots(rows: BotRow[]): BotRow[] {
	return [...rows].sort((a, b) => {
		const ai = ROSTER.indexOf(a.bot_id);
		const bi = ROSTER.indexOf(b.bot_id);
		if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
		if (ai === -1) return 1;
		if (bi === -1) return -1;
		return ai - bi;
	});
}

export function waitingOnAdam(rows: BotRow[]): BotRow[] {
	return sortBots(rows.filter((row) => row.status === 'blocked' || row.status === 'waiting'));
}

export function relativeTime(iso: string, now: number): string {
	const then = Date.parse(iso);
	if (Number.isNaN(then)) return 'unknown time';
	const seconds = Math.round((now - then) / 1000);
	const abs = Math.abs(seconds);
	const future = seconds < -10;
	if (abs < 10) return 'just now';
	const phrase =
		abs < 60
			? count(abs, 'second')
			: abs < 3600
				? count(Math.round(abs / 60), 'minute')
				: abs < 86400
					? count(Math.round(abs / 3600), 'hour')
					: count(Math.round(abs / 86400), 'day');
	return future ? `in ${phrase}` : `${phrase} ago`;
}

export function wrapMessage(text: string, maxChars = 22, maxLines = 3): string[] {
	const words = text.trim().split(/\s+/).filter(Boolean);
	if (!words.length) return [];
	const lines: string[] = [];
	let current = '';
	for (const word of words) {
		const next = current ? `${current} ${word}` : word;
		if (current && next.length > maxChars) {
			lines.push(current);
			current = word;
			if (lines.length === maxLines) break;
		} else {
			current = next;
		}
	}
	if (lines.length < maxLines && current) lines.push(current);
	const shown = lines.slice(0, maxLines);
	const consumed = shown.join(' ');
	if (consumed.length < text.trim().length && shown.length) {
		const last = shown[shown.length - 1];
		shown[shown.length - 1] =
			last.length > maxChars - 1 ? `${last.slice(0, maxChars - 1)}…` : `${last}…`;
	}
	return shown;
}

export function officeSummary(rows: BotRow[]): string {
	const hired = new Set(rows.map((row) => row.bot_id));
	const open = ['Dispo', 'Closing'].filter((_, i) => !hired.has(i === 0 ? 'dispo' : 'closing'));
	const who = sortBots(rows).map((row) => {
		const talk = row.talking_to ? `, walking over to talk` : '';
		return `${row.name} is ${row.status}${talk}`;
	});
	const vacant = open.length
		? `${open.join(' and ')} ${open.length === 1 ? 'is' : 'are'} not hired yet.`
		: '';
	return ['Top-down office.', who.join('. '), vacant].filter(Boolean).join(' ');
}

export function explainOfficeError(message: string): string {
	if (/bot_status|schema cache|does not exist|relation/i.test(message)) {
		return `${message} Apply supabase/migrations/20261030160500_bot_status.sql, then reload.`;
	}
	return message;
}

function text(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed ? trimmed : null;
}

function optionalText(value: unknown): string | null {
	if (value == null) return null;
	return text(value);
}

function time(value: unknown): string | null {
	if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return value;
	if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
	return null;
}

function count(value: number, unit: string): string {
	return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

function luminance(hex: string): number {
	const [r, g, b] = rgb(hex);
	const channel = (c: number) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function rgb(hex: string): [number, number, number] {
	const raw = hex.slice(1);
	const full =
		raw.length === 3
			? raw
					.split('')
					.map((c) => c + c)
					.join('')
			: raw;
	return [
		Number.parseInt(full.slice(0, 2), 16),
		Number.parseInt(full.slice(2, 4), 16),
		Number.parseInt(full.slice(4, 6), 16)
	];
}
