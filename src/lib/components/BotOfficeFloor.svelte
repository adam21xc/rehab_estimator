<script lang="ts">
	import { onMount } from 'svelte';
	import { botColor, officeSummary, wrapMessage, type BotRow } from '$lib/office/bots';
	import {
		actorsAtGoals,
		officePlan,
		spriteFor,
		stepActors,
		type Station
	} from '$lib/office/floor';

	let {
		bots,
		mode,
		phase
	}: {
		bots: BotRow[];
		mode: 'wide' | 'narrow';
		phase: 'loading' | 'ready' | 'unconfigured';
	} = $props();

	const plan = $derived(officePlan(mode, bots));
	let scene = $state({ actors: [] as ReturnType<typeof actorsAtGoals>, now: 0 });
	let root: HTMLDivElement;
	let botsNow: BotRow[] = [];
	let modeNow: 'wide' | 'narrow' = 'wide';
	let reduced = $state(false);
	let space = '';

	$effect(() => {
		botsNow = bots;
		modeNow = mode;
	});

	const actors = $derived(scene.actors.length ? scene.actors : actorsAtGoals(bots, plan));

	onMount(() => {
		const media = window.matchMedia('(prefers-reduced-motion: reduce)');
		const syncMotion = () => {
			reduced = media.matches;
		};
		syncMotion();
		media.addEventListener('change', syncMotion);
		let frame = 0;
		let last = performance.now();
		const loop = (now: number) => {
			frame = requestAnimationFrame(loop);
			if (root?.offsetParent === null) return;
			const dt = Math.min(0.05, (now - last) / 1000);
			last = now;
			const current = officePlan(modeNow, botsNow);
			const signature = `${current.id}:${current.stations.map((item) => item.id).join()}`;
			if (signature !== space) {
				space = signature;
				scene = { actors: actorsAtGoals(botsNow, current), now };
				return;
			}
			scene = { actors: stepActors(scene.actors, botsNow, current, dt, reduced), now };
		};
		frame = requestAnimationFrame(loop);
		return () => {
			cancelAnimationFrame(frame);
			media.removeEventListener('change', syncMotion);
		};
	});

	function caption(station: Station, bot: BotRow | undefined) {
		const vacant = !bot && station.placeholder;
		return {
			name: bot?.name ?? station.label,
			status: bot ? title(bot.status) : vacant ? 'Not hired yet' : phase === 'loading' ? '…' : '—',
			vacant
		};
	}

	function title(value: string) {
		return value.slice(0, 1).toUpperCase() + value.slice(1);
	}

	function nameSize(name: string, width: number) {
		const base = width >= 170 ? 15 : mode === 'narrow' ? 14 : 14;
		if (name.length > 18) return base - 2;
		if (name.length > 15) return base - 1;
		return base;
	}

	const cos30 = Math.cos(Math.PI / 6);
	const screen = $derived.by(() => {
		if (mode !== 'wide') {
			return {
				viewBox: `0 0 ${plan.width} ${plan.height}`,
				iso: undefined as string | undefined,
				minX: 0,
				minY: 0,
				width: plan.width,
				height: plan.height
			};
		}
		const project = (x: number, y: number) => ({ x: cos30 * (x - y), y: 0.5 * (x + y) });
		const box = plan.building;
		const corners = [
			project(box.x, box.y),
			project(box.x + box.w, box.y),
			project(box.x, box.y + box.h),
			project(box.x + box.w, box.y + box.h)
		];
		const minX = Math.min(...corners.map((point) => point.x)) - 180;
		const maxX = Math.max(...corners.map((point) => point.x)) + 160;
		const minY = Math.min(...corners.map((point) => point.y)) - 180;
		const maxY = Math.max(...corners.map((point) => point.y)) + 120;
		return {
			viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`,
			iso: `matrix(${cos30} 0.5 ${-cos30} 0.5 0 0)`,
			minX,
			minY,
			width: maxX - minX,
			height: maxY - minY
		};
	});

	function place(x: number, y: number) {
		if (mode !== 'wide') return { x, y };
		return { x: cos30 * (x - y), y: 0.5 * (x + y) };
	}

	function bubbleFrame(x: number, y: number, lines: string[]) {
		const bounds = screen;
		const w = Math.min(220, Math.max(96, ...lines.map((line) => line.length * 7.2 + 22)));
		const h = 14 + lines.length * 16;
		let left = x - w / 2;
		let top = y - 68 - h;
		const below = top < bounds.minY + 8;
		if (below) top = y + 28;
		left = Math.max(bounds.minX + 8, Math.min(bounds.minX + bounds.width - w - 8, left));
		top = Math.max(bounds.minY + 8, Math.min(bounds.minY + bounds.height - h - 8, top));
		return { left, top, w, h, below, tail: Math.max(left + 16, Math.min(left + w - 16, x)) };
	}
</script>

<div bind:this={root}>
	<svg class="floor" viewBox={screen.viewBox} role="img" aria-label={officeSummary(bots)}>
		<defs>
			<filter id="shadow-{plan.id}" x="-40%" y="-40%" width="180%" height="180%">
				<feDropShadow dx="0" dy="8" stdDeviation="4" flood-color="#1b140c" flood-opacity="0.28" />
			</filter>
			<filter id="glow-{plan.id}" x="-50%" y="-50%" width="200%" height="200%">
				<feGaussianBlur stdDeviation="2.2" result="blur" />
				<feMerge>
					<feMergeNode in="blur" />
					<feMergeNode in="SourceGraphic" />
				</feMerge>
			</filter>
			<linearGradient id="wood-{plan.id}" x1="0" y1="0" x2="1" y2="1">
				<stop offset="0" stop-color="#f0d7ae" />
				<stop offset="0.45" stop-color="#e0b67a" />
				<stop offset="1" stop-color="#c48a45" />
			</linearGradient>
			<pattern id="planks-{plan.id}" width="36" height="18" patternUnits="userSpaceOnUse">
				<rect width="36" height="18" fill="var(--building)" />
				<rect y="17" width="36" height="1" fill="var(--plank)" />
			</pattern>
			<radialGradient id="lamp-{plan.id}" cx="50%" cy="50%" r="50%">
				<stop offset="0" stop-color="#ffe1a8" stop-opacity="0.55" />
				<stop offset="1" stop-color="#ffe1a8" stop-opacity="0" />
			</radialGradient>
		</defs>
		<g transform={screen.iso}>
			<rect
				x={plan.building.x}
				y={plan.building.y}
				width={plan.building.w}
				height={plan.building.h}
				rx="18"
				fill="url(#planks-{plan.id})"
				stroke="var(--wall)"
				stroke-width="8"
			/>
			<rect
				x={plan.lounge.x}
				y={plan.lounge.y}
				width={plan.lounge.w}
				height={plan.lounge.h}
				fill="var(--lounge-floor)"
			/>
			<rect
				x={plan.jarvisRoom.x}
				y={plan.jarvisRoom.y}
				width={plan.jarvisRoom.w}
				height={plan.jarvisRoom.h}
				fill="var(--jarvis-floor)"
				stroke="var(--neon)"
				stroke-width="7"
				opacity="0.95"
			/>
			<rect
				x={plan.hall.x}
				y={plan.hall.y}
				width={plan.hall.w}
				height={plan.hall.h}
				rx="8"
				fill="var(--rug)"
				stroke="var(--neon)"
				stroke-width="2"
				opacity="0.95"
			/>
			<line
				x1={plan.jarvisRoom.x + plan.jarvisRoom.w}
				y1={plan.jarvisRoom.y}
				x2={plan.jarvisRoom.x + plan.jarvisRoom.w}
				y2={plan.door.wallY}
				stroke="var(--neon)"
				stroke-width="6"
				filter="url(#glow-{plan.id})"
			/>
			<line
				x1={plan.jarvisRoom.x}
				y1={plan.door.wallY}
				x2={plan.door.x}
				y2={plan.door.wallY}
				stroke="var(--neon)"
				stroke-width="6"
				filter="url(#glow-{plan.id})"
			/>
			<line
				x1={plan.door.x + plan.door.w}
				y1={plan.door.wallY}
				x2={plan.jarvisRoom.x + plan.jarvisRoom.w}
				y2={plan.door.wallY}
				stroke="var(--neon)"
				stroke-width="6"
				filter="url(#glow-{plan.id})"
			/>
			<path
				d="M {plan.door.x} {plan.door.wallY} A 34 34 0 0 0 {plan.door.x} {plan.door.wallY - 34}"
				fill="none"
				stroke="var(--wall)"
				stroke-width="2"
			/>
			<ellipse
				cx={plan.lounge.x + plan.lounge.w * 0.45}
				cy={plan.lounge.y + 80}
				rx="120"
				ry="50"
				fill="url(#lamp-{plan.id})"
			/>
			<rect
				x={plan.jarvisRoom.x + 16}
				y={plan.jarvisRoom.y + 34}
				width="22"
				height="36"
				rx="3"
				fill="var(--screen)"
				stroke="var(--wall)"
				stroke-width="2"
			/>
			<rect
				x={plan.couch.x}
				y={plan.couch.y}
				width={plan.couch.w}
				height={plan.couch.h}
				rx="18"
				fill="var(--couch)"
			/>
			<rect
				x={plan.couch.x + 8}
				y={plan.couch.y + 6}
				width={plan.couch.w - 16}
				height="14"
				rx="7"
				fill="var(--couch-back)"
			/>
			<ellipse
				cx={plan.couch.x + 28}
				cy={plan.couch.y + plan.couch.h / 2 + 4}
				rx="14"
				ry="16"
				fill="var(--pillow)"
			/>
			<rect
				x={plan.couch.x + plan.couch.w * 0.42}
				y={plan.couch.y + 22}
				width={plan.couch.w * 0.5}
				height={plan.couch.h - 30}
				rx="10"
				fill="var(--blanket)"
			/>
			<rect
				x={plan.coffee.x}
				y={plan.coffee.y}
				width={plan.coffee.w}
				height={plan.coffee.h}
				rx="10"
				fill="var(--desk)"
				stroke="var(--desk-top)"
			/>
			<circle
				cx={plan.coffee.x + 28}
				cy={plan.coffee.y + plan.coffee.h / 2}
				r="8"
				fill="var(--plaque)"
				stroke="var(--desk-top)"
			/>
			<g transform="translate({plan.plant.x} {plan.plant.y})">
				<rect x="-10" y="22" width="20" height="16" rx="3" fill="var(--pot)" />
				<ellipse cx="0" cy="10" rx="16" ry="14" fill="var(--plant)" />
				<ellipse cx="-12" cy="16" rx="9" ry="11" fill="var(--plant-dark)" />
				<ellipse cx="12" cy="14" rx="8" ry="10" fill="var(--plant-dark)" />
			</g>
			{#if plan.cabinet}
				<g filter="url(#shadow-{plan.id})">
					<rect
						x={plan.cabinet.x}
						y={plan.cabinet.y}
						width={plan.cabinet.w}
						height={plan.cabinet.h}
						rx="3"
						fill="var(--chair)"
					/>
					<line
						x1={plan.cabinet.x + 4}
						y1={plan.cabinet.y + plan.cabinet.h / 2}
						x2={plan.cabinet.x + plan.cabinet.w - 4}
						y2={plan.cabinet.y + plan.cabinet.h / 2}
						stroke="var(--building)"
					/>
				</g>
			{/if}
			{#if plan.cooler}
				<g filter="url(#shadow-{plan.id})">
					<rect
						x={plan.cooler.x}
						y={plan.cooler.y + 16}
						width={plan.cooler.w}
						height={plan.cooler.h - 16}
						rx="3"
						fill="var(--chair)"
					/>
					<rect
						x={plan.cooler.x + 6}
						y={plan.cooler.y}
						width={plan.cooler.w - 12}
						height="20"
						rx="6"
						fill="var(--screen)"
					/>
				</g>
			{/if}
			{#each plan.stations as station (station.id)}
				{@const bot = bots.find((row) => row.bot_id === station.id)}
				{@const plate = caption(station, bot)}
				<rect
					x={station.seat.x - 13}
					y={station.seat.y - 8}
					width="26"
					height="18"
					rx="6"
					fill="var(--chair)"
					opacity={plate.vacant ? 0.45 : 0.9}
				/>
				<g filter="url(#shadow-{plan.id})">
					<rect
						x={station.desk.x + 8}
						y={station.desk.y + 14}
						width={station.desk.w}
						height={station.desk.h}
						rx="8"
						fill="var(--slab)"
					/>
					<rect
						x={station.desk.x}
						y={station.desk.y}
						width={station.desk.w}
						height={station.desk.h}
						rx="8"
						fill={plate.vacant ? 'var(--plaque)' : `url(#wood-${plan.id})`}
						stroke={plate.vacant ? 'var(--muted)' : 'var(--desk-top)'}
						stroke-width="2"
						stroke-dasharray={plate.vacant ? '7 6' : '0'}
					/>
					<rect
						x={station.desk.x + 10}
						y={station.desk.y + station.desk.h - 8}
						width={station.desk.w - 20}
						height="3"
						rx="1.5"
						fill={plate.vacant ? 'var(--muted)' : botColor(bot?.color)}
						filter="url(#glow-{plan.id})"
						opacity={plate.vacant ? 0.45 : 1}
					/>
					{#if !plate.vacant}
						<rect
							x={station.desk.x + 16}
							y={station.desk.y + 8}
							width={station.desk.w - 32}
							height="11"
							rx="2"
							fill="var(--monitor)"
						/>
						<rect
							x={station.desk.x + 18}
							y={station.desk.y + 10}
							width={station.desk.w - 36}
							height="7"
							rx="1"
							fill="var(--screen)"
							opacity="0.85"
						/>
					{/if}
				</g>
			{/each}
		</g>
		<text
			x={place(plan.jarvisRoom.x + 18, plan.jarvisRoom.y + 22).x}
			y={place(plan.jarvisRoom.x + 18, plan.jarvisRoom.y + 22).y}
			fill="var(--neon)"
			font-size={mode === 'wide' ? 18 : 13}
			font-weight="650">Private office</text
		>
		{#each plan.stations as station (`label-${station.id}`)}
			{@const bot = bots.find((row) => row.bot_id === station.id)}
			{@const plate = caption(station, bot)}
			{@const at = place(
				station.id === 'jarvis' && mode === 'wide'
					? station.desk.x + station.desk.w + 28
					: station.desk.x + station.desk.w / 2,
				mode === 'wide' ? station.desk.y + station.desk.h + 8 : station.desk.y + 30
			)}
			{@const size = mode === 'wide' ? 22 : nameSize(plate.name, station.desk.w)}
			{#if mode === 'wide'}
				<rect
					x={at.x - plate.name.length * size * 0.3 - 16}
					y={at.y - size - 8}
					width={plate.name.length * size * 0.6 + 32}
					height="52"
					rx="10"
					fill="var(--bubble)"
					opacity="0.94"
				/>
			{/if}
			<text
				x={at.x}
				y={at.y}
				text-anchor="middle"
				fill="var(--ink)"
				font-size={size}
				font-weight="700">{plate.name}</text
			>
			<text
				x={at.x}
				y={at.y + (mode === 'narrow' ? 15 : 20)}
				text-anchor="middle"
				fill="var(--muted)"
				font-size={mode === 'narrow' ? 11 : 16}>{plate.status}</text
			>
		{/each}
		{#each [...actors].sort((a, b) => a.y - b.y) as actor (actor.id)}
			{@const bot = bots.find((row) => row.bot_id === actor.id)}
			{#if bot}
				{@const sprite = spriteFor(actor, bot, scene.now, reduced)}
				{@const at = place(sprite.x, sprite.y)}
				<g
					data-bot={sprite.id}
					data-pose={sprite.pose}
					transform="translate({at.x} {at.y}) rotate({sprite.rotation}) scale({sprite.face *
						(mode === 'wide' ? 1.7 : 1.55)} {sprite.breath * (mode === 'wide' ? 1.7 : 1.55)})"
				>
					<title>{bot.name}, {bot.status}</title>
					<ellipse cx="0" cy="16" rx="13" ry="4.5" fill="#1b140c" opacity="0.16" />
					{#if sprite.pose === 'walk'}
						<rect x="-8" y={11 + sprite.step} width="5" height="8" rx="2" fill={sprite.fill} />
						<rect x="3" y={11 - sprite.step} width="5" height="8" rx="2" fill={sprite.fill} />
					{/if}
					<rect
						x="-12"
						y="-2"
						width="24"
						height="18"
						rx="8"
						fill={sprite.fill}
						stroke={sprite.stroke}
						stroke-width="1.6"
					/>
					<circle
						cx="0"
						cy="-15"
						r="10"
						fill={sprite.fill}
						stroke={sprite.stroke}
						stroke-width="1.6"
					/>
					<ellipse cx="0" cy="-14" rx="6.2" ry="4.4" fill={sprite.plate} />
					<g transform="translate(0 -14) scale(1 {sprite.eyeScale})">
						<circle cx="-2.6" cy="0" r="1.35" fill={sprite.eye} />
						<circle cx="2.6" cy="0" r="1.35" fill={sprite.eye} />
					</g>
					{#if sprite.typing}
						<circle
							cx={-6 + sprite.hand}
							cy="16"
							r="2.3"
							fill={sprite.plate}
							stroke={sprite.stroke}
						/>
						<circle
							cx={6 - sprite.hand}
							cy="16"
							r="2.3"
							fill={sprite.plate}
							stroke={sprite.stroke}
						/>
					{/if}
				</g>
			{/if}
		{/each}
		{#each actors as actor (actor.id)}
			{@const bot = bots.find((row) => row.bot_id === actor.id)}
			{#if bot}
				{@const sprite = spriteFor(actor, bot, scene.now, reduced)}
				{@const at = place(sprite.x, sprite.y)}
				{#if sprite.bubble === 'zzz'}
					<g transform="translate({at.x} {at.y - 46})" aria-hidden="true">
						{#each sprite.zzz as mark, index (`z${index}`)}
							<text
								x={mark.x}
								y={mark.y}
								fill="var(--muted)"
								font-size={mark.size}
								opacity={mark.opacity}
								font-style="italic">z</text
							>
						{/each}
					</g>
				{:else if sprite.bubble === 'hourglass'}
					<g transform="translate({at.x} {at.y - 58})" aria-hidden="true">
						<rect
							x="-16"
							y="-16"
							width="32"
							height="32"
							rx="10"
							fill="var(--bubble)"
							stroke="var(--line)"
						/>
						<g transform="rotate({sprite.hourglass})">
							<path d="M-6 -7 H6 L1 0 L6 7 H-6 L-1 0 Z" fill="var(--warn)" />
						</g>
					</g>
				{:else if sprite.bubble === 'ellipsis'}
					<g transform="translate({at.x} {at.y - 58})" aria-hidden="true">
						<rect
							x="-18"
							y="-14"
							width="36"
							height="28"
							rx="10"
							fill="var(--bubble)"
							stroke="var(--line)"
						/>
						{#each [0, 1, 2] as dot (dot)}
							<circle
								cx={-8 + dot * 8}
								cy="0"
								r="2.1"
								fill="var(--bubble-ink)"
								opacity={dot < sprite.dots ? 1 : 0.28}
							/>
						{/each}
					</g>
				{:else if sprite.bubble === 'speech' && bot.message}
					{@const lines = wrapMessage(bot.message, mode === 'narrow' ? 18 : 24, 3)}
					{@const box = bubbleFrame(at.x, at.y, lines)}
					<g aria-hidden="true">
						<rect
							x={box.left}
							y={box.top}
							width={box.w}
							height={box.h}
							rx="10"
							fill="var(--bubble)"
							stroke="var(--line)"
						/>
						{#if box.below}
							<polygon
								points="{box.tail - 6},{box.top} {box.tail + 6},{box.top} {box.tail},{box.top - 8}"
								fill="var(--bubble)"
							/>
						{:else}
							<polygon
								points="{box.tail - 6},{box.top + box.h} {box.tail + 6},{box.top +
									box.h} {box.tail},{box.top + box.h + 8}"
								fill="var(--bubble)"
							/>
						{/if}
						<text fill="var(--bubble-ink)" font-size="12">
							{#each lines as line, index (index)}
								<tspan x={box.left + 10} y={box.top + 18 + index * 16}>{line}</tspan>
							{/each}
						</text>
					</g>
				{/if}
			{/if}
		{/each}
	</svg>
</div>

<style>
	.floor {
		display: block;
		width: 100%;
		height: auto;
		font-family: inherit;
	}
</style>
